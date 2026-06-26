// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Seal} from "../src/tools/Seal.sol";

contract SealTest is Test {
    Seal internal app;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    event Sealed(address indexed author, uint256 indexed index, uint64 createdAt);

    function setUp() public {
        app = new Seal();
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.warp(1_700_000_000);
    }

    // ============ Defaults ============

    function test_Defaults() public view {
        assertEq(app.fee(), 0.001 ether);
        assertEq(app.maxPayload(), 4096);
        assertEq(app.COOLDOWN(), 12 hours);
        assertEq(app.entryCount(alice), 0);
    }

    // ============ trustless: no admin, immutable params ============

    /// @notice The protocol parameters are compile-time constants — frozen, with no setter to change them.
    function test_ProtocolParamsAreImmutableConstants() public view {
        assertEq(app.fee(), 0.001 ether);
        assertEq(app.maxPayload(), 4096);
        assertEq(app.treasury(), 0x7602db7FbBc4f0FD7dfA2Be206B39e002A5C94cA);
    }

    // ============ seal: fee + bounds ============

    function test_Seal_RevertsBelowFee() public {
        vm.prank(alice);
        vm.expectRevert(Seal.InsufficientFee.selector);
        app.seal{value: 0.00009 ether}(hex"deadbeef");
    }

    function test_Seal_RevertsEmptyPayload() public {
        vm.prank(alice);
        vm.expectRevert(Seal.EmptyPayload.selector);
        app.seal{value: 0.001 ether}(hex"");
    }

    function test_Seal_RevertsPayloadTooLarge() public {
        bytes memory big = new bytes(4097);
        vm.prank(alice);
        vm.expectRevert(Seal.PayloadTooLarge.selector);
        app.seal{value: 0.001 ether}(big);
    }

    function test_Seal_StoresAndForwardsFee() public {
        address treasury = app.treasury();
        uint256 before = treasury.balance;

        vm.prank(alice);
        app.seal{value: 0.003 ether}(hex"c0ffee");

        // Fee forwarded straight through — the contract custodies nothing.
        assertEq(treasury.balance - before, 0.003 ether);
        assertEq(address(app).balance, 0);
        assertEq(app.entryCount(alice), 1);

        Seal.Entry[] memory page = app.getEntries(alice, 0, 10);
        assertEq(page.length, 1);
        assertEq(page[0].payload, hex"c0ffee");
        assertEq(page[0].createdAt, uint64(block.timestamp));
    }

    function test_Seal_AcceptsExactFeeAndMaxPayload() public {
        bytes memory exact = new bytes(4096); // boundary: maxPayload bytes is allowed
        vm.prank(alice);
        app.seal{value: 0.001 ether}(exact); // boundary: msg.value == fee is allowed
        assertEq(app.entryCount(alice), 1);
        assertEq(app.getEntries(alice, 0, 1)[0].payload.length, 4096);
    }

    function test_Seal_EmitsSealedMetadataOnly() public {
        vm.expectEmit(true, true, true, true, address(app));
        emit Sealed(alice, 0, uint64(block.timestamp));
        vm.prank(alice);
        app.seal{value: 0.001 ether}(hex"c0ffee");
    }

    // ============ cooldown ============

    function test_Seal_CooldownBlocksSecondWrite() public {
        vm.startPrank(alice);
        app.seal{value: 0.001 ether}(hex"01");
        vm.expectRevert(abi.encodeWithSelector(Seal.CooldownActive.selector, uint64(block.timestamp + 12 hours)));
        app.seal{value: 0.001 ether}(hex"02");
        vm.stopPrank();
    }

    function test_Seal_CooldownClearsAfter12h() public {
        vm.startPrank(alice);
        app.seal{value: 0.001 ether}(hex"01");
        vm.warp(block.timestamp + 12 hours);
        app.seal{value: 0.001 ether}(hex"02");
        vm.stopPrank();
        assertEq(app.entryCount(alice), 2);
    }

    function test_CooldownRemaining() public {
        assertEq(app.cooldownRemaining(alice), 0);
        vm.prank(alice);
        app.seal{value: 0.001 ether}(hex"01");
        assertEq(app.cooldownRemaining(alice), 12 hours);
        vm.warp(block.timestamp + 5 hours);
        assertEq(app.cooldownRemaining(alice), 7 hours);
    }

    // ============ pagination ============

    function _sealN(address who, uint256 count) internal {
        vm.startPrank(who);
        for (uint256 i = 0; i < count; i++) {
            if (i > 0) vm.warp(block.timestamp + 12 hours + 1);
            app.seal{value: 0.001 ether}(abi.encodePacked(uint8(i)));
        }
        vm.stopPrank();
    }

    function test_Pagination_Ascending() public {
        _sealN(alice, 5);
        assertEq(app.entryCount(alice), 5);

        Seal.Entry[] memory p0 = app.getEntries(alice, 0, 2);
        assertEq(p0.length, 2);
        assertEq(p0[0].payload, hex"00");
        assertEq(p0[1].payload, hex"01");

        Seal.Entry[] memory p1 = app.getEntries(alice, 4, 10); // last page, limit overshoots
        assertEq(p1.length, 1);
        assertEq(p1[0].payload, hex"04");

        Seal.Entry[] memory pEmpty = app.getEntries(alice, 5, 10); // offset past end
        assertEq(pEmpty.length, 0);
    }

    function test_Pagination_Descending() public {
        _sealN(alice, 5);
        Seal.Entry[] memory d = app.getEntriesDesc(alice, 0, 3);
        assertEq(d.length, 3);
        assertEq(d[0].payload, hex"04"); // newest first
        assertEq(d[1].payload, hex"03");
        assertEq(d[2].payload, hex"02");

        Seal.Entry[] memory d2 = app.getEntriesDesc(alice, 3, 10);
        assertEq(d2.length, 2);
        assertEq(d2[0].payload, hex"01");
        assertEq(d2[1].payload, hex"00");
    }

    function test_EntriesArePerAuthor() public {
        vm.prank(alice);
        app.seal{value: 0.001 ether}(hex"a1");
        vm.prank(bob);
        app.seal{value: 0.001 ether}(hex"b1");
        assertEq(app.entryCount(alice), 1);
        assertEq(app.entryCount(bob), 1);
        assertEq(app.getEntries(alice, 0, 1)[0].payload, hex"a1");
        assertEq(app.getEntries(bob, 0, 1)[0].payload, hex"b1");
    }

    // ============ CREATE2 determinism ============

    function test_CreationCodeIsDeterministic() public pure {
        bytes32 h = keccak256(type(Seal).creationCode);
        assertTrue(h != bytes32(0));
    }
}
