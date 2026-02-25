// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC2771Context} from "../libraries/ERC2771Context.sol";

/**
 * @title ERC721Distribution
 * @notice Gas-optimized tool for distributing ERC721 NFTs to multiple wallets
 * @dev Called via BiuBiuPremium.callTool(), uses ERC2771Context for real sender
 *
 * Two distribution modes:
 *   1. Batch: tokenIds[i] → recipients[i] (one-to-one mapping)
 *   2. Random: tokenIds shuffled then distributed to recipients
 *
 * User must call setApprovalForAll(this, true) on the NFT contract first.
 */
contract ERC721Distribution is ERC2771Context {
    // ============ Errors ============

    error NoRecipients();
    error LengthMismatch();
    error TransferFailed();

    // ============ Structs ============

    /// @notice Options for distribution
    /// @param allowPartialFailure If true, continue on failure and return failed indices
    struct Options {
        bool allowPartialFailure;
    }

    /// @notice Result of distribution
    /// @param successCount Number of successful transfers
    /// @param failedIndices Indices of failed recipients
    /// @param failedTokenIds Token IDs that failed to transfer
    struct Result {
        uint256 successCount;
        uint256[] failedIndices;
        uint256[] failedTokenIds;
    }

    // ============ Events ============

    event Distributed(address indexed sender, address indexed nft, uint8 indexed mode, uint256 count);
    event DistributedPartial(address indexed sender, address indexed nft, uint8 indexed mode, uint256 successCount, uint256 failCount);
    event TransferSkipped(address indexed nft, address indexed recipient, uint256 indexed index, uint256 tokenId);

    // ============ Constructor ============

    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {}

    // ============ Distribution Methods ============

    /**
     * @notice Batch transfer NFTs: tokenIds[i] → recipients[i]
     * @param nft The ERC721 contract address
     * @param tokenIds Array of token IDs to transfer
     * @param recipients Array of recipient addresses (same length as tokenIds)
     * @param options Failure handling options
     * @return result Distribution result
     */
    function batchTransfer(address nft, uint256[] calldata tokenIds, address[] calldata recipients, Options calldata options)
        external
        returns (Result memory result)
    {
        uint256 len = tokenIds.length;
        if (len == 0) revert NoRecipients();
        if (len != recipients.length) revert LengthMismatch();

        address sender = _msgSender();
        result = _batchTransfer(nft, sender, tokenIds, recipients, options);
        _emitResult(nft, 1, result, len);
    }

    /**
     * @notice Transfer multiple NFTs to a single recipient
     * @param nft The ERC721 contract address
     * @param tokenIds Array of token IDs to transfer
     * @param recipient The recipient address
     * @param options Failure handling options
     * @return result Distribution result
     */
    function batchTransferToOne(address nft, uint256[] calldata tokenIds, address recipient, Options calldata options)
        external
        returns (Result memory result)
    {
        uint256 len = tokenIds.length;
        if (len == 0) revert NoRecipients();

        address sender = _msgSender();

        uint256[] memory tempFailedIndices = new uint256[](len);
        uint256[] memory tempFailedTokenIds = new uint256[](len);
        uint256 failCount;

        for (uint256 i; i < len;) {
            if (_tryTransferFrom(nft, sender, recipient, tokenIds[i])) {
                unchecked { ++result.successCount; }
            } else {
                if (!options.allowPartialFailure) revert TransferFailed();
                emit TransferSkipped(nft, recipient, i, tokenIds[i]);
                tempFailedIndices[failCount] = i;
                tempFailedTokenIds[failCount] = tokenIds[i];
                unchecked { ++failCount; }
            }
            unchecked { ++i; }
        }

        (result.failedIndices, result.failedTokenIds) = _copyFailedArrays(tempFailedIndices, tempFailedTokenIds, failCount);
        _emitResult(nft, 1, result, len);
    }

    /**
     * @notice Randomly distribute NFTs to recipients
     * @dev Uses Fisher-Yates shuffle. tokenIds.length must equal recipients.length.
     * @param nft The ERC721 contract address
     * @param tokenIds Array of token IDs to distribute
     * @param recipients Array of recipient addresses
     * @param options Failure handling options
     * @return result Distribution result
     */
    function randomDistribute(address nft, uint256[] calldata tokenIds, address[] calldata recipients, Options calldata options)
        external
        returns (Result memory result)
    {
        uint256 len = tokenIds.length;
        if (len == 0) revert NoRecipients();
        if (len != recipients.length) revert LengthMismatch();

        address sender = _msgSender();

        // Copy tokenIds to memory for shuffling
        uint256[] memory shuffled = new uint256[](len);
        for (uint256 i; i < len;) {
            shuffled[i] = tokenIds[i];
            unchecked { ++i; }
        }

        // Fisher-Yates shuffle
        bytes32 seed = keccak256(abi.encodePacked(block.timestamp, block.prevrandao, sender, len));
        for (uint256 i = len - 1; i > 0;) {
            uint256 j = uint256(keccak256(abi.encodePacked(seed, i))) % (i + 1);
            (shuffled[i], shuffled[j]) = (shuffled[j], shuffled[i]);
            unchecked { --i; }
        }

        // Transfer shuffled tokens
        uint256[] memory tempFailedIndices = new uint256[](len);
        uint256[] memory tempFailedTokenIds = new uint256[](len);
        uint256 failCount;

        for (uint256 i; i < len;) {
            if (_tryTransferFrom(nft, sender, recipients[i], shuffled[i])) {
                unchecked { ++result.successCount; }
            } else {
                if (!options.allowPartialFailure) revert TransferFailed();
                emit TransferSkipped(nft, recipients[i], i, shuffled[i]);
                tempFailedIndices[failCount] = i;
                tempFailedTokenIds[failCount] = shuffled[i];
                unchecked { ++failCount; }
            }
            unchecked { ++i; }
        }

        (result.failedIndices, result.failedTokenIds) = _copyFailedArrays(tempFailedIndices, tempFailedTokenIds, failCount);
        _emitResult(nft, 2, result, len);
    }

    // ============ Internal ============

    function _batchTransfer(
        address nft,
        address sender,
        uint256[] calldata tokenIds,
        address[] calldata recipients,
        Options calldata options
    ) private returns (Result memory result) {
        uint256 len = tokenIds.length;
        uint256[] memory tempFailedIndices = new uint256[](len);
        uint256[] memory tempFailedTokenIds = new uint256[](len);
        uint256 failCount;

        for (uint256 i; i < len;) {
            if (_tryTransferFrom(nft, sender, recipients[i], tokenIds[i])) {
                unchecked { ++result.successCount; }
            } else {
                if (!options.allowPartialFailure) revert TransferFailed();
                emit TransferSkipped(nft, recipients[i], i, tokenIds[i]);
                tempFailedIndices[failCount] = i;
                tempFailedTokenIds[failCount] = tokenIds[i];
                unchecked { ++failCount; }
            }
            unchecked { ++i; }
        }

        (result.failedIndices, result.failedTokenIds) = _copyFailedArrays(tempFailedIndices, tempFailedTokenIds, failCount);
    }

    function _copyFailedArrays(uint256[] memory indices, uint256[] memory tokenIds, uint256 length)
        private
        pure
        returns (uint256[] memory destIndices, uint256[] memory destTokenIds)
    {
        destIndices = new uint256[](length);
        destTokenIds = new uint256[](length);
        for (uint256 i; i < length;) {
            destIndices[i] = indices[i];
            destTokenIds[i] = tokenIds[i];
            unchecked { ++i; }
        }
    }

    function _emitResult(address nft, uint8 mode, Result memory result, uint256 recipientCount) private {
        if (result.failedIndices.length > 0) {
            emit DistributedPartial(_msgSender(), nft, mode, result.successCount, result.failedIndices.length);
        } else {
            emit Distributed(_msgSender(), nft, mode, recipientCount);
        }
    }

    function _tryTransferFrom(address nft, address from, address to, uint256 tokenId) private returns (bool success) {
        (success,) = nft.call(
            abi.encodeWithSelector(
                0x23b872dd, // transferFrom(address,address,uint256)
                from,
                to,
                tokenId
            )
        );
    }
}
