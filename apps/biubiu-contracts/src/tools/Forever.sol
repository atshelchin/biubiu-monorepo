// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Forever (致未来 · Forever)
 * @notice A universal protocol for permanent, encrypted, on-chain notes.
 *
 * Each note is encrypted client-side (the contract only ever sees ciphertext) and stored in
 * contract STATE, queryable with pagination — no event-log scraping or indexer required. Any
 * client can read a user's notes directly via getEntries(author, offset, limit). One write per
 * author per 24h. A small native fee is charged per write.
 *
 * Design:
 *  - Zero constructor arguments and only field-initialized defaults => identical creation
 *    bytecode on every chain => identical CREATE2 address everywhere. OWNER is a hardcoded
 *    constant, so the canonical deterministic deployment cannot be hijacked by a front-runner.
 *  - Notes live in `_entries[author]` (storage); the wrapped-DEK key envelopes live in
 *    `_keys[author]` (storage, append-only to support multiple backup passkeys).
 *  - Secrecy ("only the author can read") and the time-lock ("not even the author can read
 *    before the unlock date") are purely cryptographic and enforced off-chain. The contract
 *    only enforces the fee, the 24h cooldown, and the max payload size.
 *  - A slim `Sealed` event (metadata only, NO payload) is emitted for external indexers and
 *    activity feeds — the official client reads state, not logs.
 *  - author == msg.sender, so the protocol is agnostic to wallet type (EOA, Safe, etc.).
 *
 * @dev https://biubiu.tools/apps/forever
 */
contract Forever {
    // ============ Constants ============

    /// @notice Protocol admin (may rotate fee/treasury). Hardcoded so the deterministic
    /// deployment cannot be taken over on a fresh chain. Defaults to the BiuBiu vault.
    address public constant OWNER = 0x7602db7FbBc4f0FD7dfA2Be206B39e002A5C94cA;

    /// @notice Upper bound on the per-write fee the owner can set (anti-rug ceiling).
    uint256 public constant MAX_FEE = 0.01 ether;

    /// @notice Minimum seconds between two writes by the same author.
    uint64 public constant COOLDOWN = 24 hours;

    /// @notice Informational mode tags (not interpreted on-chain).
    uint8 public constant MODE_PRIVATE = 0; // encrypted, author-readable anytime
    uint8 public constant MODE_CAPSULE = 1; // encrypted + time-locked

    // ============ Types ============

    struct Entry {
        uint64 createdAt; // unix seconds sealed
        uint64 unlockAt; // unix seconds it unlocks (0 = private)
        uint64 drandRound; // drand round for the time-lock (0 = private)
        uint8 mode; // MODE_PRIVATE | MODE_CAPSULE
        bytes32 beaconScheme; // time-lock beacon id (0 = none)
        bytes payload; // opaque ciphertext
    }

    // ============ Storage (field-initialized => part of creation code, deterministic) ============

    uint256 public fee = 0.0001 ether; // 1e14 wei
    uint16 public maxPayload = 4096;
    address public treasury = 0x7602db7FbBc4f0FD7dfA2Be206B39e002A5C94cA;
    uint256 public collected; // pull-payment; owner withdraws

    mapping(address => uint64) public lastWrite; // cooldown
    mapping(address => Entry[]) private _entries; // notes per author
    mapping(address => bytes[]) private _keys; // wrapped-DEK envelopes per author (append-only)

    // ============ Events (slim — metadata only, for indexers/activity feeds) ============

    event Sealed(address indexed author, uint256 indexed index, uint8 indexed mode, uint64 createdAt, uint64 unlockAt);
    event KeyAdded(address indexed author, uint256 index);
    event FeeChanged(uint256 fee);
    event TreasuryChanged(address treasury);
    event MaxPayloadChanged(uint16 maxPayload);
    event Withdrawn(address indexed to, uint256 amount);

    // ============ Errors ============

    error InsufficientFee();
    error CooldownActive(uint64 retryAt);
    error PayloadTooLarge();
    error EmptyPayload();
    error NotOwner();
    error FeeTooHigh();
    error ZeroAddress();
    error NothingToWithdraw();
    error WithdrawFailed();

    // ============ Write ============

    /**
     * @notice Publish an encrypted note into state. Charges `fee`, enforces the 24h cooldown.
     * @param mode         0 = private, 1 = capsule (informational; not interpreted on-chain).
     * @param unlockAt     Unlock unix time for UI countdowns (0 if none).
     * @param drandRound   drand round used for the time-lock (0 if none). Authoritative for decryption.
     * @param beaconScheme Identifier of the time-lock beacon network (0 if none).
     * @param payload      Opaque ciphertext (1..=maxPayload bytes).
     */
    function seal(uint8 mode, uint64 unlockAt, uint64 drandRound, bytes32 beaconScheme, bytes calldata payload)
        external
        payable
    {
        if (msg.value < fee) revert InsufficientFee();
        uint256 len = payload.length;
        if (len == 0) revert EmptyPayload();
        if (len > maxPayload) revert PayloadTooLarge();

        uint64 nowTs = uint64(block.timestamp);
        uint64 last = lastWrite[msg.sender];
        if (last != 0 && nowTs < last + COOLDOWN) revert CooldownActive(last + COOLDOWN);

        lastWrite[msg.sender] = nowTs;
        collected += msg.value;

        uint256 index = _entries[msg.sender].length;
        _entries[msg.sender].push(
            Entry({
                createdAt: nowTs,
                unlockAt: unlockAt,
                drandRound: drandRound,
                mode: mode,
                beaconScheme: beaconScheme,
                payload: payload
            })
        );

        emit Sealed(msg.sender, index, mode, nowTs, unlockAt);
    }

    /// @notice Publish (or add a backup passkey's) wrapped-DEK envelope. Append-only.
    function setKey(bytes calldata envelope) external {
        if (envelope.length == 0) revert EmptyPayload();
        _keys[msg.sender].push(envelope);
        emit KeyAdded(msg.sender, _keys[msg.sender].length - 1);
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

    function keyCount(address author) external view returns (uint256) {
        return _keys[author].length;
    }

    /// @notice All wrapped-DEK envelopes for an author (try each until one unwraps with your PRF).
    function getKeys(address author) external view returns (bytes[] memory) {
        return _keys[author];
    }

    /// @notice Seconds remaining before `author` may write again (0 if writable now).
    function cooldownRemaining(address author) external view returns (uint64) {
        uint64 last = lastWrite[author];
        if (last == 0) return 0;
        uint64 ready = last + COOLDOWN;
        uint64 nowTs = uint64(block.timestamp);
        return nowTs >= ready ? 0 : ready - nowTs;
    }

    // ============ Admin (owner == constant) ============

    modifier onlyOwner() {
        if (msg.sender != OWNER) revert NotOwner();
        _;
    }

    function setFee(uint256 newFee) external onlyOwner {
        if (newFee > MAX_FEE) revert FeeTooHigh();
        fee = newFee;
        emit FeeChanged(newFee);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryChanged(newTreasury);
    }

    function setMaxPayload(uint16 newMax) external onlyOwner {
        maxPayload = newMax;
        emit MaxPayloadChanged(newMax);
    }

    /// @notice Withdraw accumulated fees to the treasury. Permissionless (always pays treasury), CEI.
    function withdraw() external {
        uint256 amount = collected;
        if (amount == 0) revert NothingToWithdraw();
        collected = 0;
        (bool ok,) = payable(treasury).call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(treasury, amount);
    }
}
