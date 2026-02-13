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

    /// @notice Options for advanced distribution functions
    /// @param allowPartialFailure If true, continue on failure and return failed indices
    struct Options {
        bool allowPartialFailure;
    }

    /// @notice Result of distribution with allowPartialFailure=true
    /// @param successCount Number of successful transfers
    /// @param failedIndices Indices of failed recipients (empty if all succeeded)
    /// @param failedTokenIds Token IDs that failed to transfer
    struct DistributeResult {
        uint256 successCount;
        uint256[] failedIndices;
        uint256[] failedTokenIds;
    }

    // ============ Events ============

    /// @notice Emitted after each distribution
    /// @param sender The real sender (from ERC2771)
    /// @param nft The NFT contract address
    /// @param mode Distribution mode (1=batch, 2=random)
    /// @param count Number of NFTs distributed
    event Distributed(address indexed sender, address indexed nft, uint8 indexed mode, uint256 count);

    /// @notice Emitted after distribution with partial failures
    event DistributedPartial(
        address indexed sender, address indexed nft, uint8 indexed mode, uint256 successCount, uint256 failCount
    );

    /// @notice Emitted for each failed transfer (when allowPartialFailure=true)
    event TransferSkipped(address indexed nft, address indexed recipient, uint256 indexed index, uint256 tokenId);

    // ============ Constructor ============

    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {}

    // ============ Distribution Methods ============

    /**
     * @notice Batch transfer NFTs: tokenIds[i] → recipients[i]
     * @param nft The ERC721 contract address
     * @param tokenIds Array of token IDs to transfer
     * @param recipients Array of recipient addresses (same length as tokenIds)
     */
    function batchTransfer(address nft, uint256[] calldata tokenIds, address[] calldata recipients) external {
        uint256 len = tokenIds.length;
        if (len == 0) revert NoRecipients();
        if (len != recipients.length) revert LengthMismatch();

        address sender = _msgSender();

        for (uint256 i; i < len;) {
            _transferFrom(nft, sender, recipients[i], tokenIds[i]);
            unchecked {
                ++i;
            }
        }

        emit Distributed(sender, nft, 1, len);
    }

    /**
     * @notice Transfer multiple NFTs to a single recipient
     * @param nft The ERC721 contract address
     * @param tokenIds Array of token IDs to transfer
     * @param recipient The recipient address
     */
    function batchTransferToOne(address nft, uint256[] calldata tokenIds, address recipient) external {
        uint256 len = tokenIds.length;
        if (len == 0) revert NoRecipients();

        address sender = _msgSender();

        for (uint256 i; i < len;) {
            _transferFrom(nft, sender, recipient, tokenIds[i]);
            unchecked {
                ++i;
            }
        }

        emit Distributed(sender, nft, 1, len);
    }

    /**
     * @notice Randomly distribute NFTs to recipients
     * @dev Uses Fisher-Yates shuffle. tokenIds.length must equal recipients.length.
     * @param nft The ERC721 contract address
     * @param tokenIds Array of token IDs to distribute
     * @param recipients Array of recipient addresses
     */
    function randomDistribute(address nft, uint256[] calldata tokenIds, address[] calldata recipients) external {
        uint256 len = tokenIds.length;
        if (len == 0) revert NoRecipients();
        if (len != recipients.length) revert LengthMismatch();

        address sender = _msgSender();

        // Copy tokenIds to memory for shuffling
        uint256[] memory shuffled = new uint256[](len);
        for (uint256 i; i < len;) {
            shuffled[i] = tokenIds[i];
            unchecked {
                ++i;
            }
        }

        // Fisher-Yates shuffle
        bytes32 seed = keccak256(abi.encodePacked(block.timestamp, block.prevrandao, sender, len));

        for (uint256 i = len - 1; i > 0;) {
            uint256 j = uint256(keccak256(abi.encodePacked(seed, i))) % (i + 1);
            // Swap
            (shuffled[i], shuffled[j]) = (shuffled[j], shuffled[i]);
            unchecked {
                --i;
            }
        }

        // Transfer shuffled tokens
        for (uint256 i; i < len;) {
            _transferFrom(nft, sender, recipients[i], shuffled[i]);
            unchecked {
                ++i;
            }
        }

        emit Distributed(sender, nft, 2, len);
    }

    // ============ Advanced Distribution (With Options) ============

    /**
     * @notice Batch transfer NFTs with advanced options
     * @param nft The ERC721 contract address
     * @param tokenIds Array of token IDs to transfer
     * @param recipients Array of recipient addresses
     * @param options Failure handling options
     * @return result Distribution result
     */
    function batchTransferEx(
        address nft,
        uint256[] calldata tokenIds,
        address[] calldata recipients,
        Options calldata options
    ) external returns (DistributeResult memory result) {
        uint256 len = tokenIds.length;
        if (len == 0) revert NoRecipients();
        if (len != recipients.length) revert LengthMismatch();

        address sender = _msgSender();

        uint256[] memory tempFailedIndices = new uint256[](len);
        uint256[] memory tempFailedTokenIds = new uint256[](len);
        uint256 failCount;

        for (uint256 i; i < len;) {
            bool success = _tryTransferFrom(nft, sender, recipients[i], tokenIds[i]);

            if (success) {
                unchecked {
                    ++result.successCount;
                }
            } else {
                if (!options.allowPartialFailure) {
                    revert TransferFailed();
                }
                emit TransferSkipped(nft, recipients[i], i, tokenIds[i]);
                tempFailedIndices[failCount] = i;
                tempFailedTokenIds[failCount] = tokenIds[i];
                unchecked {
                    ++failCount;
                }
            }
            unchecked {
                ++i;
            }
        }

        result.failedIndices = new uint256[](failCount);
        result.failedTokenIds = new uint256[](failCount);
        for (uint256 i; i < failCount;) {
            result.failedIndices[i] = tempFailedIndices[i];
            result.failedTokenIds[i] = tempFailedTokenIds[i];
            unchecked {
                ++i;
            }
        }

        _emitResult(nft, 1, result, len);
    }

    /**
     * @notice Transfer multiple NFTs to a single recipient with options
     * @param nft The ERC721 contract address
     * @param tokenIds Array of token IDs to transfer
     * @param recipient The recipient address
     * @param options Failure handling options
     * @return result Distribution result
     */
    function batchTransferToOneEx(
        address nft,
        uint256[] calldata tokenIds,
        address recipient,
        Options calldata options
    ) external returns (DistributeResult memory result) {
        uint256 len = tokenIds.length;
        if (len == 0) revert NoRecipients();

        address sender = _msgSender();

        uint256[] memory tempFailedIndices = new uint256[](len);
        uint256[] memory tempFailedTokenIds = new uint256[](len);
        uint256 failCount;

        for (uint256 i; i < len;) {
            bool success = _tryTransferFrom(nft, sender, recipient, tokenIds[i]);

            if (success) {
                unchecked {
                    ++result.successCount;
                }
            } else {
                if (!options.allowPartialFailure) {
                    revert TransferFailed();
                }
                emit TransferSkipped(nft, recipient, i, tokenIds[i]);
                tempFailedIndices[failCount] = i;
                tempFailedTokenIds[failCount] = tokenIds[i];
                unchecked {
                    ++failCount;
                }
            }
            unchecked {
                ++i;
            }
        }

        result.failedIndices = new uint256[](failCount);
        result.failedTokenIds = new uint256[](failCount);
        for (uint256 i; i < failCount;) {
            result.failedIndices[i] = tempFailedIndices[i];
            result.failedTokenIds[i] = tempFailedTokenIds[i];
            unchecked {
                ++i;
            }
        }

        _emitResult(nft, 1, result, len);
    }

    /**
     * @notice Randomly distribute NFTs with advanced options
     * @param nft The ERC721 contract address
     * @param tokenIds Array of token IDs to distribute
     * @param recipients Array of recipient addresses
     * @param options Failure handling options
     * @return result Distribution result
     */
    function randomDistributeEx(
        address nft,
        uint256[] calldata tokenIds,
        address[] calldata recipients,
        Options calldata options
    ) external returns (DistributeResult memory result) {
        uint256 len = tokenIds.length;
        if (len == 0) revert NoRecipients();
        if (len != recipients.length) revert LengthMismatch();

        address sender = _msgSender();

        // Copy tokenIds to memory for shuffling
        uint256[] memory shuffled = new uint256[](len);
        for (uint256 i; i < len;) {
            shuffled[i] = tokenIds[i];
            unchecked {
                ++i;
            }
        }

        // Fisher-Yates shuffle
        bytes32 seed = keccak256(abi.encodePacked(block.timestamp, block.prevrandao, sender, len));

        for (uint256 i = len - 1; i > 0;) {
            uint256 j = uint256(keccak256(abi.encodePacked(seed, i))) % (i + 1);
            (shuffled[i], shuffled[j]) = (shuffled[j], shuffled[i]);
            unchecked {
                --i;
            }
        }

        // Transfer shuffled tokens with failure handling
        uint256[] memory tempFailedIndices = new uint256[](len);
        uint256[] memory tempFailedTokenIds = new uint256[](len);
        uint256 failCount;

        for (uint256 i; i < len;) {
            bool success = _tryTransferFrom(nft, sender, recipients[i], shuffled[i]);

            if (success) {
                unchecked {
                    ++result.successCount;
                }
            } else {
                if (!options.allowPartialFailure) {
                    revert TransferFailed();
                }
                emit TransferSkipped(nft, recipients[i], i, shuffled[i]);
                tempFailedIndices[failCount] = i;
                tempFailedTokenIds[failCount] = shuffled[i];
                unchecked {
                    ++failCount;
                }
            }
            unchecked {
                ++i;
            }
        }

        result.failedIndices = new uint256[](failCount);
        result.failedTokenIds = new uint256[](failCount);
        for (uint256 i; i < failCount;) {
            result.failedIndices[i] = tempFailedIndices[i];
            result.failedTokenIds[i] = tempFailedTokenIds[i];
            unchecked {
                ++i;
            }
        }

        _emitResult(nft, 2, result, len);
    }

    // ============ Internal ============

    function _emitResult(address nft, uint8 mode, DistributeResult memory result, uint256 recipientCount) private {
        if (result.failedIndices.length > 0) {
            emit DistributedPartial(_msgSender(), nft, mode, result.successCount, result.failedIndices.length);
        } else {
            emit Distributed(_msgSender(), nft, mode, recipientCount);
        }
    }

    function _transferFrom(address nft, address from, address to, uint256 tokenId) private {
        (bool success,) =
            nft.call(
                abi.encodeWithSelector(
                    0x23b872dd, // transferFrom(address,address,uint256)
                    from,
                    to,
                    tokenId
                )
            );
        if (!success) revert TransferFailed();
    }

    function _tryTransferFrom(address nft, address from, address to, uint256 tokenId) private returns (bool success) {
        (success,) =
            nft.call(
                abi.encodeWithSelector(
                    0x23b872dd, // transferFrom(address,address,uint256)
                    from,
                    to,
                    tokenId
                )
            );
    }
}
