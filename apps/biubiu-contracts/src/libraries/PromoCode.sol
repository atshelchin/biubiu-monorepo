// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PromoCode
 * @notice Library for EIP-712 + EIP-1271 promo code verification
 * @dev Stateless library - all config values passed as parameters
 */
library PromoCode {
    bytes4 private constant _EIP1271_MAGIC = 0x1626ba7e;

    /// @notice Promo code data structure
    struct Data {
        string name;
        uint256 discountBps;
        uint256 expiry;
        uint256 chainId;
        bytes signature;
    }

    /// @notice Decode promo code bytes into Data struct
    function decode(bytes calldata promoCode) internal pure returns (Data memory data) {
        (data.name, data.discountBps, data.expiry, data.chainId, data.signature) =
            abi.decode(promoCode, (string, uint256, uint256, uint256, bytes));
    }

    /// @notice Compute EIP-712 struct hash for promo code
    /// @param typeHash The PROMO_TYPEHASH constant
    /// @param data The promo code data
    function structHash(bytes32 typeHash, Data memory data) internal pure returns (bytes32) {
        return keccak256(abi.encode(typeHash, keccak256(bytes(data.name)), data.discountBps, data.expiry, data.chainId));
    }

    /// @notice Compute EIP-712 digest
    /// @param domainSeparator The contract's DOMAIN_SEPARATOR
    /// @param _structHash The struct hash from structHash()
    function digest(bytes32 domainSeparator, bytes32 _structHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, _structHash));
    }

    /// @notice Verify EIP-1271 signature
    /// @param signer The contract that should validate the signature (e.g., Safe wallet)
    /// @param _digest The EIP-712 digest to verify
    /// @param signature The signature bytes
    /// @return valid True if signature is valid
    function verifyEIP1271(address signer, bytes32 _digest, bytes memory signature) internal view returns (bool valid) {
        if (signer.code.length == 0) return false;

        (bool success, bytes memory returnData) =
            signer.staticcall(abi.encodeWithSelector(_EIP1271_MAGIC, _digest, signature));

        if (!success || returnData.length < 32) return false;

        bytes4 magicValue = abi.decode(returnData, (bytes4));
        return magicValue == _EIP1271_MAGIC;
    }

    /// @notice Check if promo code is expired
    function isExpired(Data memory data) internal view returns (bool) {
        return data.expiry != 0 && block.timestamp > data.expiry;
    }

    /// @notice Check if promo code is valid for current chain
    function isValidChain(Data memory data) internal view returns (bool) {
        return data.chainId == 0 || data.chainId == block.chainid;
    }

    /// @notice Check if discount bps is valid (1-9999)
    function isValidDiscount(Data memory data) internal pure returns (bool) {
        return data.discountBps > 0 && data.discountBps < 10000;
    }

    /// @notice Apply discount to base price
    /// @param basePrice The original price
    /// @param discountBps Discount in basis points (e.g., 1000 = 10%)
    /// @return discountedPrice The price after discount
    function applyDiscount(uint256 basePrice, uint256 discountBps) internal pure returns (uint256) {
        return basePrice * (10000 - discountBps) / 10000;
    }

    /// @notice Full verification of promo code
    /// @param data The decoded promo code data
    /// @param typeHash The PROMO_TYPEHASH constant
    /// @param domainSeparator The contract's DOMAIN_SEPARATOR
    /// @param signer The contract that validates signatures
    /// @return valid True if all checks pass
    /// @return reason Error reason if invalid
    function verify(Data memory data, bytes32 typeHash, bytes32 domainSeparator, address signer)
        internal
        view
        returns (bool valid, string memory reason)
    {
        if (!isValidDiscount(data)) {
            return (false, "invalid discount bps");
        }

        bytes32 hash = structHash(typeHash, data);
        bytes32 _digest = digest(domainSeparator, hash);

        if (!verifyEIP1271(signer, _digest, data.signature)) {
            return (false, "invalid signature");
        }

        if (isExpired(data)) {
            return (false, "expired");
        }

        if (!isValidChain(data)) {
            return (false, "chain not valid");
        }

        return (true, "valid");
    }
}
