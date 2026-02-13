// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC2771Context} from "../libraries/ERC2771Context.sol";

/**
 * @title ETHDistribution
 * @notice Tool for distributing ETH to multiple wallets
 * @dev Called via BiuBiuPremium.callTool(), uses ERC2771Context for real sender
 *
 * Three distribution modes:
 *   1. Equal: total ETH divided equally among recipients
 *   2. Specified: exact amount for each recipient
 *   3. Random: random distribution of total ETH
 */
contract ETHDistribution is ERC2771Context {
    // ============ Errors ============

    error NoRecipients();
    error LengthMismatch();
    error InsufficientValue();
    error TransferFailed(address recipient);
    error InvalidTotalAmount();

    // ============ Events ============

    event Distributed(
        address indexed sender,
        uint8 mode,
        uint256 totalAmount,
        uint256 recipientCount
    );

    event Transfer(address indexed recipient, uint256 amount);

    // ============ Constructor ============

    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {}

    // ============ Distribution Methods ============

    /**
     * @notice Distribute ETH equally among recipients
     * @param recipients Array of recipient addresses
     */
    function distributeEqual(address[] calldata recipients) external payable {
        if (recipients.length == 0) revert NoRecipients();

        uint256 amountPerRecipient = msg.value / recipients.length;
        if (amountPerRecipient == 0) revert InsufficientValue();

        for (uint256 i = 0; i < recipients.length;) {
            _transfer(recipients[i], amountPerRecipient);
            unchecked { ++i; }
        }

        // Refund dust to sender
        uint256 dust = msg.value - (amountPerRecipient * recipients.length);
        if (dust > 0) {
            _transfer(_msgSender(), dust);
        }

        emit Distributed(_msgSender(), 1, msg.value, recipients.length);
    }

    /**
     * @notice Distribute specified amounts to each recipient
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts for each recipient
     */
    function distributeSpecified(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external payable {
        if (recipients.length == 0) revert NoRecipients();
        if (recipients.length != amounts.length) revert LengthMismatch();

        uint256 totalRequired;
        for (uint256 i = 0; i < amounts.length;) {
            totalRequired += amounts[i];
            unchecked { ++i; }
        }

        if (msg.value < totalRequired) revert InsufficientValue();

        for (uint256 i = 0; i < recipients.length;) {
            if (amounts[i] > 0) {
                _transfer(recipients[i], amounts[i]);
            }
            unchecked { ++i; }
        }

        // Refund excess to sender
        uint256 excess = msg.value - totalRequired;
        if (excess > 0) {
            _transfer(_msgSender(), excess);
        }

        emit Distributed(_msgSender(), 2, totalRequired, recipients.length);
    }

    /**
     * @notice Distribute ETH randomly among recipients
     * @dev Uses block data for randomness (not cryptographically secure, but sufficient for distribution)
     * @param recipients Array of recipient addresses
     */
    function distributeRandom(address[] calldata recipients) external payable {
        if (recipients.length == 0) revert NoRecipients();
        if (msg.value == 0) revert InsufficientValue();

        uint256 remaining = msg.value;
        uint256 len = recipients.length;

        // Generate random weights
        uint256[] memory weights = new uint256[](len);
        uint256 totalWeight;

        for (uint256 i = 0; i < len;) {
            // Generate pseudo-random weight (1-100)
            uint256 weight = (uint256(keccak256(abi.encodePacked(
                block.timestamp,
                block.prevrandao,
                msg.sender,
                i
            ))) % 100) + 1;

            weights[i] = weight;
            totalWeight += weight;
            unchecked { ++i; }
        }

        // Distribute based on weights
        for (uint256 i = 0; i < len;) {
            uint256 amount;
            if (i == len - 1) {
                // Last recipient gets remaining to avoid dust
                amount = remaining;
            } else {
                amount = (msg.value * weights[i]) / totalWeight;
                if (amount > remaining) {
                    amount = remaining;
                }
            }

            if (amount > 0) {
                _transfer(recipients[i], amount);
                remaining -= amount;
            }
            unchecked { ++i; }
        }

        emit Distributed(_msgSender(), 3, msg.value, len);
    }

    /**
     * @notice Distribute with random amounts within a range
     * @param recipients Array of recipient addresses
     * @param minAmount Minimum amount per recipient
     * @param maxAmount Maximum amount per recipient
     */
    function distributeRandomRange(
        address[] calldata recipients,
        uint256 minAmount,
        uint256 maxAmount
    ) external payable {
        if (recipients.length == 0) revert NoRecipients();
        if (minAmount > maxAmount) revert InvalidTotalAmount();

        uint256 len = recipients.length;
        uint256 minRequired = minAmount * len;
        if (msg.value < minRequired) revert InsufficientValue();

        uint256 range = maxAmount - minAmount;
        uint256 totalSent;

        for (uint256 i = 0; i < len;) {
            uint256 amount;
            if (i == len - 1) {
                // Last recipient: ensure we don't exceed msg.value
                amount = msg.value - totalSent;
                if (amount > maxAmount) amount = maxAmount;
                if (amount < minAmount) amount = minAmount;
            } else {
                // Random amount between min and max
                uint256 randomExtra = 0;
                if (range > 0) {
                    randomExtra = uint256(keccak256(abi.encodePacked(
                        block.timestamp,
                        block.prevrandao,
                        msg.sender,
                        i
                    ))) % (range + 1);
                }
                amount = minAmount + randomExtra;

                // Cap to remaining balance
                uint256 remaining = msg.value - totalSent;
                uint256 reserveForOthers = minAmount * (len - i - 1);
                uint256 maxAllowed = remaining - reserveForOthers;
                if (amount > maxAllowed) amount = maxAllowed;
            }

            _transfer(recipients[i], amount);
            totalSent += amount;
            unchecked { ++i; }
        }

        // Refund any excess
        if (msg.value > totalSent) {
            _transfer(_msgSender(), msg.value - totalSent);
        }

        emit Distributed(_msgSender(), 4, totalSent, len);
    }

    // ============ Internal ============

    function _transfer(address to, uint256 amount) private {
        (bool success,) = payable(to).call{value: amount}("");
        if (!success) revert TransferFailed(to);
        emit Transfer(to, amount);
    }

    // ============ Receive ============

    receive() external payable {}
}
