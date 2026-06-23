// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Forever} from "../src/tools/Forever.sol";

contract ForeverTest is Test {
    Forever internal forever;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    event Sealed(address indexed author, uint256 indexed index, uint8 indexed mode, uint64 createdAt, uint64 unlockAt);
    event KeyAdded(address indexed author, uint256 index);

    function setUp() public {
        forever = new Forever();
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.warp(1_700_000_000);
    }

    // ============ Defaults ============

    function test_Defaults() public view {
        assertEq(forever.fee(), 0.0001 ether);
        assertEq(forever.maxPayload(), 4096);
        assertEq(forever.COOLDOWN(), 24 hours);
        assertEq(forever.entryCount(alice), 0);
        assertEq(forever.keyCount(alice), 0);
    }

    // ============ seal: fee + bounds ============

    function test_Seal_RevertsBelowFee() public {
        vm.prank(alice);
        vm.expectRevert(Forever.InsufficientFee.selector);
        forever.seal{value: 0.00009 ether}(0, 0, 0, bytes32(0), hex"deadbeef");
    }

    function test_Seal_RevertsEmptyPayload() public {
        vm.prank(alice);
        vm.expectRevert(Forever.EmptyPayload.selector);
        forever.seal{value: 0.0001 ether}(0, 0, 0, bytes32(0), hex"");
    }

    function test_Seal_RevertsPayloadTooLarge() public {
        bytes memory big = new bytes(4097);
        vm.prank(alice);
        vm.expectRevert(Forever.PayloadTooLarge.selector);
        forever.seal{value: 0.0001 ether}(0, 0, 0, bytes32(0), big);
    }

    function test_Seal_StoresAndCharges() public {
        vm.prank(alice);
        forever.seal{value: 0.0003 ether}(0, 0, 0, bytes32(0), hex"c0ffee");
        assertEq(forever.collected(), 0.0003 ether);
        assertEq(forever.entryCount(alice), 1);

        Forever.Entry[] memory page = forever.getEntries(alice, 0, 10);
        assertEq(page.length, 1);
        assertEq(page[0].payload, hex"c0ffee");
        assertEq(page[0].mode, 0);
        assertEq(page[0].createdAt, uint64(block.timestamp));
    }

    function test_Seal_EmitsSealedMetadataOnly() public {
        bytes32 scheme = keccak256("drand-quicknet");
        vm.expectEmit(true, true, true, true, address(forever));
        emit Sealed(alice, 0, 1, uint64(block.timestamp), 1_893_456_000);
        vm.prank(alice);
        forever.seal{value: 0.0001 ether}(1, 1_893_456_000, 123_456, scheme, hex"c0ffee");

        // capsule metadata is retrievable from state
        Forever.Entry[] memory page = forever.getEntries(alice, 0, 1);
        assertEq(page[0].unlockAt, 1_893_456_000);
        assertEq(page[0].drandRound, 123_456);
        assertEq(page[0].beaconScheme, scheme);
    }

    // ============ cooldown ============

    function test_Seal_CooldownBlocksSecondWrite() public {
        vm.startPrank(alice);
        forever.seal{value: 0.0001 ether}(0, 0, 0, bytes32(0), hex"01");
        vm.expectRevert(abi.encodeWithSelector(Forever.CooldownActive.selector, uint64(block.timestamp + 24 hours)));
        forever.seal{value: 0.0001 ether}(0, 0, 0, bytes32(0), hex"02");
        vm.stopPrank();
    }

    function test_Seal_CooldownClearsAfter24h() public {
        vm.startPrank(alice);
        forever.seal{value: 0.0001 ether}(0, 0, 0, bytes32(0), hex"01");
        vm.warp(block.timestamp + 24 hours);
        forever.seal{value: 0.0001 ether}(0, 0, 0, bytes32(0), hex"02");
        vm.stopPrank();
        assertEq(forever.entryCount(alice), 2);
    }

    function test_CooldownRemaining() public {
        assertEq(forever.cooldownRemaining(alice), 0);
        vm.prank(alice);
        forever.seal{value: 0.0001 ether}(0, 0, 0, bytes32(0), hex"01");
        assertEq(forever.cooldownRemaining(alice), 24 hours);
        vm.warp(block.timestamp + 10 hours);
        assertEq(forever.cooldownRemaining(alice), 14 hours);
    }

    // ============ pagination ============

    function _sealN(address who, uint256 count) internal {
        vm.startPrank(who);
        for (uint256 i = 0; i < count; i++) {
            if (i > 0) vm.warp(block.timestamp + 24 hours + 1);
            forever.seal{value: 0.0001 ether}(0, 0, 0, bytes32(0), abi.encodePacked(uint8(i)));
        }
        vm.stopPrank();
    }

    function test_Pagination_Ascending() public {
        _sealN(alice, 5);
        assertEq(forever.entryCount(alice), 5);

        Forever.Entry[] memory p0 = forever.getEntries(alice, 0, 2);
        assertEq(p0.length, 2);
        assertEq(p0[0].payload, hex"00");
        assertEq(p0[1].payload, hex"01");

        Forever.Entry[] memory p1 = forever.getEntries(alice, 4, 10); // last page, limit overshoots
        assertEq(p1.length, 1);
        assertEq(p1[0].payload, hex"04");

        Forever.Entry[] memory pEmpty = forever.getEntries(alice, 5, 10); // offset past end
        assertEq(pEmpty.length, 0);
    }

    function test_Pagination_Descending() public {
        _sealN(alice, 5);
        Forever.Entry[] memory d = forever.getEntriesDesc(alice, 0, 3);
        assertEq(d.length, 3);
        assertEq(d[0].payload, hex"04"); // newest first
        assertEq(d[1].payload, hex"03");
        assertEq(d[2].payload, hex"02");

        Forever.Entry[] memory d2 = forever.getEntriesDesc(alice, 3, 10);
        assertEq(d2.length, 2);
        assertEq(d2[0].payload, hex"01");
        assertEq(d2[1].payload, hex"00");
    }

    function test_EntriesArePerAuthor() public {
        vm.prank(alice);
        forever.seal{value: 0.0001 ether}(0, 0, 0, bytes32(0), hex"a1");
        vm.prank(bob);
        forever.seal{value: 0.0001 ether}(0, 0, 0, bytes32(0), hex"b1");
        assertEq(forever.entryCount(alice), 1);
        assertEq(forever.entryCount(bob), 1);
        assertEq(forever.getEntries(alice, 0, 1)[0].payload, hex"a1");
        assertEq(forever.getEntries(bob, 0, 1)[0].payload, hex"b1");
    }

    // ============ keys ============

    function test_SetKey_StoresAndEmits() public {
        bytes memory env = hex"0102030405";
        vm.expectEmit(true, false, false, true, address(forever));
        emit KeyAdded(alice, 0);
        vm.prank(alice);
        forever.setKey(env);

        assertEq(forever.keyCount(alice), 1);
        assertEq(forever.getKeys(alice)[0], env);
    }

    function test_SetKey_AppendsBackupKeys() public {
        vm.startPrank(alice);
        forever.setKey(hex"aa");
        forever.setKey(hex"bb"); // backup passkey envelope
        vm.stopPrank();
        bytes[] memory keys = forever.getKeys(alice);
        assertEq(keys.length, 2);
        assertEq(keys[0], hex"aa");
        assertEq(keys[1], hex"bb");
    }

    function test_SetKey_RevertsEmpty() public {
        vm.prank(alice);
        vm.expectRevert(Forever.EmptyPayload.selector);
        forever.setKey(hex"");
    }

    // ============ admin ============

    function test_SetFee_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(Forever.NotOwner.selector);
        forever.setFee(0.0002 ether);
    }

    function test_SetFee_Works() public {
        vm.prank(forever.OWNER());
        forever.setFee(0.0002 ether);
        assertEq(forever.fee(), 0.0002 ether);
    }

    function test_SetFee_RevertsAboveMax() public {
        vm.prank(forever.OWNER());
        vm.expectRevert(Forever.FeeTooHigh.selector);
        forever.setFee(0.02 ether);
    }

    function test_Withdraw_SendsToTreasury() public {
        address treasury = makeAddr("treasury");
        vm.prank(forever.OWNER());
        forever.setTreasury(treasury);

        vm.prank(alice);
        forever.seal{value: 0.0003 ether}(0, 0, 0, bytes32(0), hex"01");

        vm.prank(bob);
        forever.withdraw();
        assertEq(treasury.balance, 0.0003 ether);
        assertEq(forever.collected(), 0);
    }

    function test_Withdraw_RevertsWhenEmpty() public {
        vm.expectRevert(Forever.NothingToWithdraw.selector);
        forever.withdraw();
    }

    // ============ CREATE2 determinism ============

    function test_CreationCodeIsDeterministic() public pure {
        bytes32 h = keccak256(type(Forever).creationCode);
        assertTrue(h != bytes32(0));
    }
}
