// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Sweeper7702} from "../src/eip7702/Sweeper7702.sol";
import {BatchSweeper} from "../src/eip7702/BatchSweeper.sol";

contract MockERC20 {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract RevertingERC20 {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address, uint256) external pure returns (bool) {
        revert("nope");
    }
}

contract NativeRejecter {
    receive() external payable {
        revert("no native");
    }
}

contract Sweeper7702Test is Test {
    Sweeper7702 internal sweeper;
    BatchSweeper internal batch;

    // The relay = controller (drives everything as tx.origin).
    uint256 internal relayPk = 0xBEEF;
    address internal relay;
    address internal dest = makeAddr("dest");

    uint256 internal eoaPk = 0xA11CE;
    uint256 internal eoa2Pk = 0xB0B;
    address internal eoa;
    address internal eoa2;

    function setUp() public {
        relay = vm.addr(relayPk);
        eoa = vm.addr(eoaPk);
        eoa2 = vm.addr(eoa2Pk);
        sweeper = new Sweeper7702(relay);
        batch = new BatchSweeper();
    }

    function _delegate(uint256 pk) internal {
        vm.signAndAttachDelegation(address(sweeper), pk);
    }

    // ── Direct sweep, tx.origin guard ──

    function test_DirectSweep_OnlyControllerOrigin() public {
        MockERC20 token = new MockERC20();
        vm.deal(eoa, 5 ether);
        token.mint(eoa, 1_000e18);
        _delegate(eoaPk);

        address[] memory tokens = new address[](1);
        tokens[0] = address(token);

        // tx.origin = relay (controller) → ok
        vm.prank(relay, relay);
        Sweeper7702(payable(eoa)).sweep(dest, tokens);

        assertEq(eoa.balance, 0);
        assertEq(dest.balance, 5 ether);
        assertEq(token.balanceOf(dest), 1_000e18);
    }

    function test_DirectSweep_WrongOriginReverts() public {
        vm.deal(eoa, 1 ether);
        _delegate(eoaPk);
        address[] memory tokens = new address[](0);

        vm.prank(makeAddr("attacker"), makeAddr("attacker"));
        vm.expectRevert(Sweeper7702.NotController.selector);
        Sweeper7702(payable(eoa)).sweep(dest, tokens);
        assertEq(eoa.balance, 1 ether);
    }

    // ── Batch sweep via BatchSweeper (the real flow) ──

    function test_BatchSweep_ManyEoasOneTx() public {
        MockERC20 token = new MockERC20();
        vm.deal(eoa, 2 ether);
        vm.deal(eoa2, 3 ether);
        token.mint(eoa, 100e18);
        token.mint(eoa2, 50e18);

        _delegate(eoaPk);
        _delegate(eoa2Pk);

        address[] memory eoas = new address[](2);
        eoas[0] = eoa;
        eoas[1] = eoa2;
        address[] memory tokens = new address[](1);
        tokens[0] = address(token);

        // Relay drives: tx.origin = relay throughout the loop.
        vm.prank(relay, relay);
        batch.sweepMany(eoas, dest, tokens, address(0));

        assertEq(dest.balance, 5 ether, "native from both EOAs");
        assertEq(token.balanceOf(dest), 150e18, "tokens from both EOAs");
        assertEq(eoa.balance, 0);
        assertEq(eoa2.balance, 0);
    }

    function test_BatchSweep_ForwardsFee() public {
        address feeCollector = makeAddr("fee");
        vm.deal(eoa, 1 ether);
        _delegate(eoaPk);

        address[] memory eoas = new address[](1);
        eoas[0] = eoa;
        address[] memory tokens = new address[](0);

        // Relay attaches a 0.01 fee as msg.value.
        vm.deal(relay, 0.01 ether);
        vm.prank(relay, relay);
        batch.sweepMany{value: 0.01 ether}(eoas, dest, tokens, feeCollector);

        assertEq(feeCollector.balance, 0.01 ether, "fee forwarded");
        assertEq(dest.balance, 1 ether, "native swept");
    }

    function test_BatchSweep_BadEoaSkipped() public {
        // eoa sweeps fine; eoa2's dest is a reverting contract → its sweep
        // reverts but must not block eoa.
        NativeRejecter rej = new NativeRejecter();
        vm.deal(eoa, 1 ether);
        vm.deal(eoa2, 1 ether);
        _delegate(eoaPk);
        _delegate(eoa2Pk);

        address[] memory eoas = new address[](2);
        eoas[0] = eoa2; // will fail (dest rejects native) — but per-EOA dest is same...
        eoas[1] = eoa;

        // Use a per-batch dest that rejects: only eoa2 in a separate call.
        address[] memory tokens = new address[](0);
        address[] memory bad = new address[](1);
        bad[0] = eoa2;
        vm.prank(relay, relay);
        batch.sweepMany(bad, address(rej), tokens, address(0)); // eoa2 sweep reverts, skipped
        assertEq(eoa2.balance, 1 ether, "eoa2 untouched (skipped)");

        address[] memory good = new address[](1);
        good[0] = eoa;
        vm.prank(relay, relay);
        batch.sweepMany(good, dest, tokens, address(0));
        assertEq(dest.balance, 1 ether, "eoa swept");
    }

    function test_BatchSweep_Repeatable() public {
        vm.deal(eoa, 1 ether);
        _delegate(eoaPk);
        address[] memory eoas = new address[](1);
        eoas[0] = eoa;
        address[] memory tokens = new address[](0);

        vm.prank(relay, relay);
        batch.sweepMany(eoas, dest, tokens, address(0));
        assertEq(dest.balance, 1 ether);

        // Funds re-arrive; still delegated → sweep again, no re-auth.
        vm.deal(eoa, 2 ether);
        vm.prank(relay, relay);
        batch.sweepMany(eoas, dest, tokens, address(0));
        assertEq(dest.balance, 3 ether);
    }

    function test_ControllerIsImmutable() public view {
        assertEq(sweeper.controller(), relay);
    }
}
