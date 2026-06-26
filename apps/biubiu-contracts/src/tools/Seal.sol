// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Seal (封存)
 * @notice A universal protocol for permanent, encrypted, private notes.
 *
 * Each note is encrypted client-side (the contract only ever sees ciphertext) and stored in
 * contract STATE, queryable with pagination — no event-log scraping or indexer required. Any
 * client can read a user's notes directly via getEntries(author, offset, limit). One write per
 * author per 12h. A small, fixed native fee is charged per write.
 *
 * Dependency surface is deliberately minimal — there is no time-lock and no third-party beacon:
 *  - Secrecy ("only the author can read") is purely cryptographic and enforced off-chain. The
 *    content key is derived client-side from the author's own passkey; nothing key-related is
 *    ever published on-chain. The contract stores only opaque ciphertext.
 *  - A note is therefore readable for as long as the author holds their key and the ciphertext
 *    bytes survive (on-chain, or any copy the author keeps). No external network must stay alive
 *    for a note to be opened — ever.
 *
 * Trustless & permissionless by construction — there is NO owner and NO admin:
 *  - `fee`, `maxPayload`, and `treasury` are compile-time `constant`s. They can never be changed
 *    by anyone, including the deployer. The fee can never be raised, payments can never be
 *    redirected, and the size limit can never be tightened. What you read here is exactly what
 *    the bytecode enforces — forever.
 *  - No privileged roles, no upgradeability, no selfdestruct, no pause. Once deployed, the rules
 *    are frozen. The developer cannot act maliciously because no lever exists.
 *  - Zero constructor arguments and only constants => identical creation bytecode on every chain
 *    => identical CREATE2 address everywhere; the canonical deployment cannot be hijacked.
 *  - The per-write fee is forwarded straight to the hardcoded `treasury` inside `seal()`. The
 *    contract never holds a balance and has no withdraw, no accounting, and no admin path at all.
 *
 * Data model:
 *  - Notes live in `_entries[author]` (storage). author == msg.sender, so the protocol is
 *    agnostic to wallet type (EOA, Safe, etc.).
 *  - A slim `Sealed` event (metadata only, NO payload) is emitted for external indexers and
 *    activity feeds — the official client reads state, not logs.
 *
 * @dev https://biubiu.tools/apps/seal
 */
contract Seal {
    // ===== Immutable protocol parameters (compile-time constants — no admin can ever change these) =====

    /// @notice Fixed per-write fee. Hardcoded forever; can never be raised or rugged.
    uint256 public constant fee = 0.001 ether; // 1e15 wei

    /// @notice Maximum ciphertext size per note. Hardcoded forever; can never be tightened.
    uint16 public constant maxPayload = 4096;

    /// @notice Sole, immutable fee recipient. `withdraw()` can pay no one else. Defaults to the BiuBiu vault.
    address public constant treasury = 0x7602db7FbBc4f0FD7dfA2Be206B39e002A5C94cA;

    /// @notice Minimum seconds between two writes by the same author.
    uint64 public constant COOLDOWN = 12 hours;

    // ============ Types ============

    struct Entry {
        uint64 createdAt; // unix seconds sealed
        bytes payload; // opaque ciphertext
    }

    // ============ Storage ============

    mapping(address => uint64) public lastWrite; // cooldown
    mapping(address => Entry[]) private _entries; // notes per author

    // ============ Events (slim — metadata only, for indexers/activity feeds) ============

    event Sealed(address indexed author, uint256 indexed index, uint64 createdAt);

    // ============ Errors ============

    error InsufficientFee();
    error CooldownActive(uint64 retryAt);
    error PayloadTooLarge();
    error EmptyPayload();
    error TransferFailed();

    // ============ Write ============

    /**
     * @notice Publish an encrypted note into state. Charges `fee`, enforces the 12h cooldown.
     * @param payload Opaque ciphertext (1..=maxPayload bytes).
     */
    function seal(bytes calldata payload) external payable {
        if (msg.value < fee) revert InsufficientFee();
        uint256 len = payload.length;
        if (len == 0) revert EmptyPayload();
        if (len > maxPayload) revert PayloadTooLarge();

        uint64 nowTs = uint64(block.timestamp);
        uint64 last = lastWrite[msg.sender];
        if (last != 0 && nowTs < last + COOLDOWN) revert CooldownActive(last + COOLDOWN);

        lastWrite[msg.sender] = nowTs;

        uint256 index = _entries[msg.sender].length;
        _entries[msg.sender].push(Entry({createdAt: nowTs, payload: payload}));

        emit Sealed(msg.sender, index, nowTs);

        // Forward the fee straight to the immutable treasury — the contract never custodies funds.
        // CEI: all state is written above, and the cooldown just set blocks any reentrant seal.
        (bool ok,) = payable(treasury).call{value: msg.value}("");
        if (!ok) revert TransferFailed();
    }

    // ============ Read (paginated; no logs/indexer needed) ============

    function entryCount(address author) external view returns (uint256) {
        return _entries[author].length;
    }

    /// @notice A page of notes in chronological order [offset, offset+limit).
    function getEntries(address author, uint256 offset, uint256 limit) external view returns (Entry[] memory page) {
        Entry[] storage all = _entries[author];
        uint256 n = all.length;
        if (offset >= n) return new Entry[](0);
        uint256 end = offset + limit;
        if (end > n) end = n;
        page = new Entry[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = all[i];
        }
    }

    /// @notice A page of notes in reverse-chronological order (newest first), skipping `offset` newest.
    function getEntriesDesc(address author, uint256 offset, uint256 limit) external view returns (Entry[] memory page) {
        Entry[] storage all = _entries[author];
        uint256 n = all.length;
        if (offset >= n) return new Entry[](0);
        uint256 remaining = n - offset;
        uint256 count = remaining < limit ? remaining : limit;
        page = new Entry[](count);
        for (uint256 i = 0; i < count; i++) {
            page[i] = all[n - 1 - offset - i];
        }
    }

    /// @notice Seconds remaining before `author` may write again (0 if writable now).
    function cooldownRemaining(address author) external view returns (uint64) {
        uint64 last = lastWrite[author];
        if (last == 0) return 0;
        uint64 ready = last + COOLDOWN;
        uint64 nowTs = uint64(block.timestamp);
        return nowTs >= ready ? 0 : ready - nowTs;
    }

}
