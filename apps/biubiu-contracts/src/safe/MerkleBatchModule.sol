// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC2771Context} from "../libraries/ERC2771Context.sol";
import {ISafe} from "../interfaces/ISafe.sol";

/**
 * @title MerkleBatchModule
 * @notice Safe Module for executing batched transactions with single merkle root signature
 * @dev Enables Safe to sign once for thousands of transactions
 *
 * Use case: Distribute ETH to 1 million addresses
 *   1. Off-chain: Build merkle tree of all transactions
 *   2. Safe signs the merkle root once
 *   3. Register the batch on-chain
 *   4. Execute transactions one by one via 4337 bundler
 *
 * Security:
 *   - Each leaf can only be executed once (bitmap tracking)
 *   - Batch can expire
 *   - Only registered merkle roots are valid
 *   - Uses ERC-2771 for meta-transactions via BiuBiuPremium
 */
contract MerkleBatchModule is ERC2771Context {
    // ============ Errors ============

    error NotSafe();
    error ModuleNotEnabled();
    error InvalidSignatures();
    error BatchNotRegistered();
    error BatchExpired();
    error LeafAlreadyExecuted();
    error InvalidProof();
    error ExecutionFailed();
    error BatchAlreadyRegistered();
    error InvalidBatchConfig();
    error ZeroAddress();

    // ============ Events ============

    /// @notice Emitted when a new batch is registered
    event BatchRegistered(
        address indexed safe, bytes32 indexed merkleRoot, uint256 totalLeaves, uint256 expiry, uint256 nonce
    );

    /// @notice Emitted when a leaf is executed
    event LeafExecuted(address indexed safe, bytes32 indexed merkleRoot, uint256 indexed leafIndex, address to);

    /// @notice Emitted when a batch is revoked
    event BatchRevoked(address indexed safe, bytes32 indexed merkleRoot);

    // ============ Constants ============

    /// @notice EIP-712 domain separator name
    string public constant NAME = "MerkleBatchModule";

    /// @notice EIP-712 domain separator version
    string public constant VERSION = "1";

    /// @notice EIP-712 typehash for BatchIntent
    bytes32 public constant BATCH_INTENT_TYPEHASH =
        keccak256("BatchIntent(bytes32 merkleRoot,uint256 totalLeaves,uint256 expiry,uint256 nonce)");

    // ============ Structs ============

    /// @notice Batch intent signed by Safe owners
    struct BatchIntent {
        bytes32 merkleRoot;
        uint256 totalLeaves;
        uint256 expiry;
        uint256 nonce;
    }

    /// @notice Stored batch information
    struct BatchInfo {
        uint256 totalLeaves;
        uint256 expiry;
        uint256 executedCount;
        uint256 nonce;
        bool revoked;
    }

    /// @notice Transaction leaf data
    struct TransactionLeaf {
        uint256 index;
        address to;
        uint256 value;
        bytes data;
        uint8 operation; // 0 = call, 1 = delegatecall
    }

    // ============ Storage ============

    /// @notice EIP-712 domain separator
    bytes32 public immutable DOMAIN_SEPARATOR;

    /// @notice Registered batches: safe => merkleRoot => BatchInfo
    mapping(address => mapping(bytes32 => BatchInfo)) public batches;

    /// @notice Execution bitmap: safe => merkleRoot => word index => bitmap
    /// @dev Each bit represents whether a leaf at that index has been executed
    mapping(address => mapping(bytes32 => mapping(uint256 => uint256))) public executedBitmap;

    /// @notice Nonce for each safe to prevent replay
    mapping(address => uint256) public batchNonces;

    // ============ Constructor ============

    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(NAME)),
                keccak256(bytes(VERSION)),
                block.chainid,
                address(this)
            )
        );
    }

    // ============ Batch Registration ============

    /**
     * @notice Register a new batch with Safe signatures
     * @param safe The Safe address
     * @param intent The batch intent to register
     * @param signatures Packed Safe signatures
     */
    function registerBatch(address safe, BatchIntent calldata intent, bytes calldata signatures) external {
        _registerBatch(safe, intent, signatures);
    }

    /**
     * @notice Internal function to register a batch
     */
    function _registerBatch(address safe, BatchIntent calldata intent, bytes calldata signatures) internal {
        // Validate
        if (safe == address(0)) revert ZeroAddress();
        if (intent.totalLeaves == 0) revert InvalidBatchConfig();
        if (intent.expiry != 0 && intent.expiry <= block.timestamp) revert BatchExpired();
        if (intent.nonce != batchNonces[safe]) revert InvalidBatchConfig();

        // Check module is enabled
        if (!ISafe(safe).isModuleEnabled(address(this))) revert ModuleNotEnabled();

        // Check not already registered
        if (batches[safe][intent.merkleRoot].totalLeaves != 0) revert BatchAlreadyRegistered();

        // Verify Safe signatures
        bytes32 intentHash = _hashIntent(intent);
        bytes32 ethSignedHash = _toEthSignedMessageHash(intentHash);

        // Use Safe's checkSignatures (will revert if invalid)
        try ISafe(safe).checkSignatures(ethSignedHash, signatures) {}
        catch {
            revert InvalidSignatures();
        }

        // Store batch info
        batches[safe][intent.merkleRoot] = BatchInfo({
            totalLeaves: intent.totalLeaves,
            expiry: intent.expiry,
            executedCount: 0,
            nonce: intent.nonce,
            revoked: false
        });

        // Increment nonce
        batchNonces[safe]++;

        emit BatchRegistered(safe, intent.merkleRoot, intent.totalLeaves, intent.expiry, intent.nonce);
    }

    /**
     * @notice Revoke a batch (only Safe can call via module transaction)
     * @param merkleRoot The merkle root to revoke
     */
    function revokeBatch(bytes32 merkleRoot) external {
        address safe = _msgSender();
        BatchInfo storage batch = batches[safe][merkleRoot];

        if (batch.totalLeaves == 0) revert BatchNotRegistered();

        batch.revoked = true;
        emit BatchRevoked(safe, merkleRoot);
    }

    // ============ Leaf Execution ============

    /**
     * @notice Execute a leaf with auto-registration (saves one transaction)
     * @dev If batch not registered, validates signatures and registers it first
     * @param safe The Safe address
     * @param intent The batch intent (used for registration if needed)
     * @param signatures Safe signatures (only needed if batch not registered, pass empty bytes if already registered)
     * @param leaf The transaction leaf data
     * @param proof Merkle proof for the leaf
     */
    function executeLeafWithIntent(
        address safe,
        BatchIntent calldata intent,
        bytes calldata signatures,
        TransactionLeaf calldata leaf,
        bytes32[] calldata proof
    ) external {
        // Get batch info
        BatchInfo storage batch = batches[safe][intent.merkleRoot];

        // Auto-register if not registered yet
        if (batch.totalLeaves == 0) {
            _registerBatch(safe, intent, signatures);
            // Re-fetch batch reference after registration
            batch = batches[safe][intent.merkleRoot];
        }

        // Execute the leaf
        _executeLeaf(safe, intent.merkleRoot, batch, leaf, proof);
    }

    /**
     * @notice Execute a single leaf from a registered batch
     * @param safe The Safe address
     * @param merkleRoot The merkle root
     * @param leaf The transaction leaf data
     * @param proof Merkle proof for the leaf
     */
    function executeLeaf(address safe, bytes32 merkleRoot, TransactionLeaf calldata leaf, bytes32[] calldata proof)
        external
    {
        // Get batch info
        BatchInfo storage batch = batches[safe][merkleRoot];

        // Validate batch is registered
        if (batch.totalLeaves == 0) revert BatchNotRegistered();

        // Execute the leaf
        _executeLeaf(safe, merkleRoot, batch, leaf, proof);
    }

    /**
     * @notice Internal function to execute a leaf
     */
    function _executeLeaf(
        address safe,
        bytes32 merkleRoot,
        BatchInfo storage batch,
        TransactionLeaf calldata leaf,
        bytes32[] calldata proof
    ) internal {
        // Validate batch state
        if (batch.revoked) revert BatchNotRegistered();
        if (batch.expiry != 0 && block.timestamp > batch.expiry) revert BatchExpired();

        // Check leaf index bounds
        if (leaf.index >= batch.totalLeaves) revert InvalidProof();

        // Check not already executed (bitmap)
        uint256 wordIndex = leaf.index / 256;
        uint256 bitIndex = leaf.index % 256;
        uint256 word = executedBitmap[safe][merkleRoot][wordIndex];
        uint256 mask = 1 << bitIndex;

        if (word & mask != 0) revert LeafAlreadyExecuted();

        // Verify merkle proof
        bytes32 leafHash = _hashLeaf(leaf, batch.nonce);
        if (!_verifyProof(proof, merkleRoot, leafHash)) revert InvalidProof();

        // Mark as executed
        executedBitmap[safe][merkleRoot][wordIndex] = word | mask;
        batch.executedCount++;

        // Execute via Safe
        bool success = ISafe(safe).execTransactionFromModule(leaf.to, leaf.value, leaf.data, leaf.operation);

        if (!success) revert ExecutionFailed();

        emit LeafExecuted(safe, merkleRoot, leaf.index, leaf.to);
    }

    /**
     * @notice Execute multiple leaves with auto-registration
     * @param safe The Safe address
     * @param intent The batch intent (used for registration if needed)
     * @param signatures Safe signatures (only needed if batch not registered)
     * @param leaves Array of transaction leaves
     * @param proofs Array of merkle proofs (one per leaf)
     */
    function executeLeafBatchWithIntent(
        address safe,
        BatchIntent calldata intent,
        bytes calldata signatures,
        TransactionLeaf[] calldata leaves,
        bytes32[][] calldata proofs
    ) external {
        if (leaves.length != proofs.length) revert InvalidBatchConfig();

        // Get batch info
        BatchInfo storage batch = batches[safe][intent.merkleRoot];

        // Auto-register if not registered yet
        if (batch.totalLeaves == 0) {
            _registerBatch(safe, intent, signatures);
            batch = batches[safe][intent.merkleRoot];
        }

        // Execute all leaves
        _executeLeafBatch(safe, intent.merkleRoot, batch, leaves, proofs);
    }

    /**
     * @notice Execute multiple leaves in a single transaction
     * @param safe The Safe address
     * @param merkleRoot The merkle root
     * @param leaves Array of transaction leaves
     * @param proofs Array of merkle proofs (one per leaf)
     */
    function executeLeafBatch(
        address safe,
        bytes32 merkleRoot,
        TransactionLeaf[] calldata leaves,
        bytes32[][] calldata proofs
    ) external {
        if (leaves.length != proofs.length) revert InvalidBatchConfig();

        // Get batch info once
        BatchInfo storage batch = batches[safe][merkleRoot];

        // Validate batch is registered
        if (batch.totalLeaves == 0) revert BatchNotRegistered();

        // Execute all leaves
        _executeLeafBatch(safe, merkleRoot, batch, leaves, proofs);
    }

    /**
     * @notice Internal function to execute multiple leaves
     */
    function _executeLeafBatch(
        address safe,
        bytes32 merkleRoot,
        BatchInfo storage batch,
        TransactionLeaf[] calldata leaves,
        bytes32[][] calldata proofs
    ) internal {
        // Validate batch state
        if (batch.revoked) revert BatchNotRegistered();
        if (batch.expiry != 0 && block.timestamp > batch.expiry) revert BatchExpired();

        for (uint256 i; i < leaves.length;) {
            TransactionLeaf calldata leaf = leaves[i];

            // Check leaf index bounds
            if (leaf.index >= batch.totalLeaves) revert InvalidProof();

            // Check not already executed
            uint256 wordIndex = leaf.index / 256;
            uint256 bitIndex = leaf.index % 256;
            uint256 word = executedBitmap[safe][merkleRoot][wordIndex];
            uint256 mask = 1 << bitIndex;

            if (word & mask != 0) revert LeafAlreadyExecuted();

            // Verify merkle proof
            bytes32 leafHash = _hashLeaf(leaf, batch.nonce);
            if (!_verifyProof(proofs[i], merkleRoot, leafHash)) revert InvalidProof();

            // Mark as executed
            executedBitmap[safe][merkleRoot][wordIndex] = word | mask;
            batch.executedCount++;

            // Execute via Safe
            bool success = ISafe(safe).execTransactionFromModule(leaf.to, leaf.value, leaf.data, leaf.operation);
            if (!success) revert ExecutionFailed();

            emit LeafExecuted(safe, merkleRoot, leaf.index, leaf.to);

            unchecked {
                ++i;
            }
        }
    }

    // ============ View Functions ============

    /**
     * @notice Check if a leaf has been executed
     * @param safe The Safe address
     * @param merkleRoot The merkle root
     * @param leafIndex The leaf index
     * @return executed Whether the leaf has been executed
     */
    function isLeafExecuted(address safe, bytes32 merkleRoot, uint256 leafIndex) external view returns (bool) {
        uint256 wordIndex = leafIndex / 256;
        uint256 bitIndex = leafIndex % 256;
        uint256 word = executedBitmap[safe][merkleRoot][wordIndex];
        return (word & (1 << bitIndex)) != 0;
    }

    /**
     * @notice Get batch execution status
     * @param safe The Safe address
     * @param merkleRoot The merkle root
     * @return totalLeaves Total number of leaves
     * @return executedCount Number of executed leaves
     * @return expiry Expiry timestamp (0 = no expiry)
     * @return revoked Whether batch is revoked
     */
    function getBatchStatus(address safe, bytes32 merkleRoot)
        external
        view
        returns (uint256 totalLeaves, uint256 executedCount, uint256 expiry, bool revoked)
    {
        BatchInfo storage batch = batches[safe][merkleRoot];
        return (batch.totalLeaves, batch.executedCount, batch.expiry, batch.revoked);
    }

    /**
     * @notice Get the next nonce for a Safe
     * @param safe The Safe address
     * @return nonce The next nonce to use
     */
    function getNextNonce(address safe) external view returns (uint256) {
        return batchNonces[safe];
    }

    /**
     * @notice Compute the hash of a BatchIntent for signing
     * @param intent The batch intent
     * @return hash The EIP-712 typed data hash
     */
    function hashIntent(BatchIntent calldata intent) external view returns (bytes32) {
        return _hashIntent(intent);
    }

    /**
     * @notice Compute the hash of a transaction leaf
     * @param leaf The transaction leaf
     * @param nonce The batch nonce (included to ensure different merkleRoots for repeated batches)
     * @return hash The leaf hash
     */
    function hashLeaf(TransactionLeaf calldata leaf, uint256 nonce) external pure returns (bytes32) {
        return _hashLeaf(leaf, nonce);
    }

    /**
     * @notice Verify a merkle proof
     * @param proof The merkle proof
     * @param root The merkle root
     * @param leaf The leaf hash
     * @return valid Whether the proof is valid
     */
    function verifyProof(bytes32[] calldata proof, bytes32 root, bytes32 leaf) external pure returns (bool) {
        return _verifyProof(proof, root, leaf);
    }

    // ============ Internal Functions ============

    function _hashIntent(BatchIntent calldata intent) internal view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(
                        BATCH_INTENT_TYPEHASH, intent.merkleRoot, intent.totalLeaves, intent.expiry, intent.nonce
                    )
                )
            )
        );
    }

    function _toEthSignedMessageHash(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

    function _hashLeaf(TransactionLeaf calldata leaf, uint256 nonce) internal pure returns (bytes32) {
        return keccak256(abi.encode(leaf.index, leaf.to, leaf.value, keccak256(leaf.data), leaf.operation, nonce));
    }

    function _verifyProof(bytes32[] calldata proof, bytes32 root, bytes32 leaf) internal pure returns (bool) {
        bytes32 computedHash = leaf;

        for (uint256 i; i < proof.length;) {
            bytes32 proofElement = proof[i];

            if (computedHash <= proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }

            unchecked {
                ++i;
            }
        }

        return computedHash == root;
    }
}
