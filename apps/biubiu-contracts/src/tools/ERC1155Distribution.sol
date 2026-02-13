// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC2771Context} from "../libraries/ERC2771Context.sol";

/**
 * @title ERC1155Distribution
 * @notice Gas-optimized tool for distributing ERC1155 tokens to multiple wallets
 * @dev Called via BiuBiuPremium.callTool(), uses ERC2771Context for real sender
 *
 * Two categories of distribution:
 *   A. Single tokenId (like ERC20 with quantity):
 *      - Equal, Specified, Random, RandomRange
 *   B. Multiple tokenIds (like ERC721 batch):
 *      - batchTransfer, batchTransferToOne
 *
 * User must call setApprovalForAll(this, true) on the ERC1155 contract first.
 */
contract ERC1155Distribution is ERC2771Context {
    // ============ Errors ============

    error NoRecipients();
    error LengthMismatch();
    error InsufficientBalance();
    error TransferFailed();
    error InvalidRange();
    error ZeroAmount();

    // ============ Events ============

    /// @notice Emitted after each distribution
    /// @param sender The real sender (from ERC2771)
    /// @param nft The ERC1155 contract address
    /// @param mode Distribution mode (1=equal, 2=specified, 3=random, 4=randomRange, 5=batch)
    /// @param tokenId The token ID (0 for multi-token batch)
    /// @param totalAmount Total tokens distributed
    /// @param recipientCount Number of recipients
    event Distributed(
        address indexed sender,
        address indexed nft,
        uint8 indexed mode,
        uint256 tokenId,
        uint256 totalAmount,
        uint256 recipientCount
    );

    // ============ Constructor ============

    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {}

    // ============ Single TokenId Distribution ============

    /**
     * @notice Distribute a single tokenId equally among recipients
     * @param nft The ERC1155 contract address
     * @param tokenId The token ID to distribute
     * @param recipients Array of recipient addresses
     * @param totalAmount Total amount to distribute
     */
    function distributeSingleEqual(address nft, uint256 tokenId, address[] calldata recipients, uint256 totalAmount)
        external
    {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (totalAmount == 0) revert ZeroAmount();

        address sender = _msgSender();
        uint256 amount = totalAmount / len;
        uint256 dust = totalAmount - (amount * len);

        for (uint256 i; i < len;) {
            uint256 amt = amount;
            if (i == 0) amt += dust; // First recipient gets dust
            _safeTransferFrom(nft, sender, recipients[i], tokenId, amt);
            unchecked {
                ++i;
            }
        }

        emit Distributed(sender, nft, 1, tokenId, totalAmount, len);
    }

    /**
     * @notice Distribute a single tokenId with specified amounts
     * @param nft The ERC1155 contract address
     * @param tokenId The token ID to distribute
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts for each recipient
     */
    function distributeSingleSpecified(
        address nft,
        uint256 tokenId,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (len != amounts.length) revert LengthMismatch();

        address sender = _msgSender();
        uint256 total;

        for (uint256 i; i < len;) {
            uint256 amt = amounts[i];
            if (amt != 0) {
                _safeTransferFrom(nft, sender, recipients[i], tokenId, amt);
                total += amt;
            }
            unchecked {
                ++i;
            }
        }

        emit Distributed(sender, nft, 2, tokenId, total, len);
    }

    /**
     * @notice Distribute a single tokenId randomly among recipients
     * @param nft The ERC1155 contract address
     * @param tokenId The token ID to distribute
     * @param recipients Array of recipient addresses
     * @param totalAmount Total amount to distribute
     */
    function distributeSingleRandom(address nft, uint256 tokenId, address[] calldata recipients, uint256 totalAmount)
        external
    {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (totalAmount == 0) revert ZeroAmount();

        address sender = _msgSender();

        bytes32 seed = keccak256(abi.encodePacked(block.timestamp, block.prevrandao, sender, totalAmount));

        uint256 remaining = totalAmount;

        for (uint256 i; i < len;) {
            uint256 amount;
            if (i == len - 1) {
                amount = remaining;
            } else {
                uint256 pct = (uint256(keccak256(abi.encodePacked(seed, i))) % 50) + 1;
                amount = (remaining * pct) / 100;
            }

            if (amount != 0) {
                _safeTransferFrom(nft, sender, recipients[i], tokenId, amount);
                remaining -= amount;
            }
            unchecked {
                ++i;
            }
        }

        emit Distributed(sender, nft, 3, tokenId, totalAmount, len);
    }

    /**
     * @notice Distribute a single tokenId with random amounts within a range (strict mode)
     * @dev User must have at least maxAmount * len tokens
     * @param nft The ERC1155 contract address
     * @param tokenId The token ID to distribute
     * @param recipients Array of recipient addresses
     * @param minAmount Minimum amount per recipient
     * @param maxAmount Maximum amount per recipient
     */
    function distributeSingleRandomRange(
        address nft,
        uint256 tokenId,
        address[] calldata recipients,
        uint256 minAmount,
        uint256 maxAmount
    ) external {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (minAmount > maxAmount) revert InvalidRange();

        address sender = _msgSender();

        bytes32 seed = keccak256(abi.encodePacked(block.timestamp, block.prevrandao, sender));

        uint256 range = maxAmount - minAmount;
        uint256 totalSent;

        for (uint256 i; i < len;) {
            uint256 extra = range != 0 ? uint256(keccak256(abi.encodePacked(seed, i))) % (range + 1) : 0;
            uint256 amount = minAmount + extra;

            _safeTransferFrom(nft, sender, recipients[i], tokenId, amount);
            totalSent += amount;
            unchecked {
                ++i;
            }
        }

        emit Distributed(sender, nft, 4, tokenId, totalSent, len);
    }

    // ============ Multi TokenId Distribution ============

    /**
     * @notice Batch transfer: tokenIds[i], amounts[i] → recipients[i]
     * @param nft The ERC1155 contract address
     * @param tokenIds Array of token IDs
     * @param amounts Array of amounts for each token
     * @param recipients Array of recipient addresses
     */
    function batchTransfer(
        address nft,
        uint256[] calldata tokenIds,
        uint256[] calldata amounts,
        address[] calldata recipients
    ) external {
        uint256 len = tokenIds.length;
        if (len == 0) revert NoRecipients();
        if (len != amounts.length || len != recipients.length) revert LengthMismatch();

        address sender = _msgSender();
        uint256 total;

        for (uint256 i; i < len;) {
            _safeTransferFrom(nft, sender, recipients[i], tokenIds[i], amounts[i]);
            total += amounts[i];
            unchecked {
                ++i;
            }
        }

        emit Distributed(sender, nft, 5, 0, total, len);
    }

    /**
     * @notice Batch transfer multiple tokens to a single recipient
     * @dev Uses safeBatchTransferFrom for gas efficiency
     * @param nft The ERC1155 contract address
     * @param tokenIds Array of token IDs
     * @param amounts Array of amounts for each token
     * @param recipient The recipient address
     */
    function batchTransferToOne(address nft, uint256[] calldata tokenIds, uint256[] calldata amounts, address recipient)
        external
    {
        uint256 len = tokenIds.length;
        if (len == 0) revert NoRecipients();
        if (len != amounts.length) revert LengthMismatch();

        address sender = _msgSender();

        // Use safeBatchTransferFrom for efficiency
        (bool success,) = nft.call(
            abi.encodeWithSelector(
                0x2eb2c2d6, // safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)
                sender,
                recipient,
                tokenIds,
                amounts,
                ""
            )
        );
        if (!success) revert TransferFailed();

        uint256 total;
        for (uint256 i; i < len;) {
            total += amounts[i];
            unchecked {
                ++i;
            }
        }

        emit Distributed(sender, nft, 5, 0, total, 1);
    }

    // ============ Internal ============

    function _safeTransferFrom(address nft, address from, address to, uint256 tokenId, uint256 amount) private {
        (bool success,) = nft.call(
            abi.encodeWithSelector(
                0xf242432a, // safeTransferFrom(address,address,uint256,uint256,bytes)
                from,
                to,
                tokenId,
                amount,
                ""
            )
        );
        if (!success) revert TransferFailed();
    }
}
