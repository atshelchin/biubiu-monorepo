// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ISafe
 * @notice Minimal interface for Safe (Gnosis Safe) interactions
 */
interface ISafe {
    /// @notice Execute a transaction from an enabled module
    /// @param to Destination address
    /// @param value Ether value
    /// @param data Call data
    /// @param operation 0 = Call, 1 = DelegateCall
    /// @return success Whether the transaction was successful
    function execTransactionFromModule(address to, uint256 value, bytes memory data, uint8 operation)
        external
        returns (bool success);

    /// @notice Check if signatures are valid for a given hash
    /// @param dataHash Hash of the data to sign
    /// @param signatures Packed signature data
    function checkSignatures(bytes32 dataHash, bytes memory signatures) external view;

    /// @notice Check if signatures are valid (with explicit data)
    /// @param dataHash Hash of the data
    /// @param data Original data that was hashed
    /// @param signatures Packed signature data
    function checkNSignatures(bytes32 dataHash, bytes memory data, bytes memory signatures, uint256 requiredSignatures)
        external
        view;

    /// @notice Get the current threshold
    function getThreshold() external view returns (uint256);

    /// @notice Check if an address is an owner
    function isOwner(address owner) external view returns (bool);

    /// @notice Get all owners
    function getOwners() external view returns (address[] memory);

    /// @notice Get the current nonce
    function nonce() external view returns (uint256);

    /// @notice Get the domain separator for EIP-712
    function domainSeparator() external view returns (bytes32);

    /// @notice Check if a module is enabled
    function isModuleEnabled(address module) external view returns (bool);

    /// @notice Encode transaction data for signing
    function encodeTransactionData(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 _nonce
    ) external view returns (bytes memory);

    /// @notice Get transaction hash
    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 _nonce
    ) external view returns (bytes32);
}
