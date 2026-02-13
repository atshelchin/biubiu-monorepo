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

    // ============ Events ============

    /// @notice Emitted after each distribution
    /// @param sender The real sender (from ERC2771)
    /// @param nft The NFT contract address
    /// @param mode Distribution mode (1=batch, 2=random)
    /// @param count Number of NFTs distributed
    event Distributed(address indexed sender, address indexed nft, uint8 indexed mode, uint256 count);

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

    // ============ Internal ============

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
}
