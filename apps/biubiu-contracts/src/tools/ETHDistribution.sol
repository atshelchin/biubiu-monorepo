// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC2771Context} from "../libraries/ERC2771Context.sol";

/**
 * @title ETHDistribution
 * @notice Gas-optimized tool for distributing ETH to multiple wallets
 * @dev Called via BiuBiuPremium.callTool(), uses ERC2771Context for real sender
 *
 * Four distribution modes:
 *   1. Equal: total ETH divided equally among recipients
 *   2. Specified: exact amount for each recipient
 *   3. Random: random distribution based on weights
 *   4. RandomRange: random amount within min/max range
 */
contract ETHDistribution is ERC2771Context {
    // ============ Errors ============

    error NoRecipients();
    error LengthMismatch();
    error InsufficientValue();
    error TransferFailed();
    error InvalidRange();

    // ============ Events ============

    /// @notice Emitted after each distribution
    /// @param sender The real sender (from ERC2771)
    /// @param mode Distribution mode (1=equal, 2=specified, 3=random, 4=randomRange)
    /// @param totalAmount Total ETH distributed
    /// @param recipientCount Number of recipients
    event Distributed(
        address indexed sender,
        uint8 indexed mode,
        uint256 totalAmount,
        uint256 recipientCount
    );

    // ============ Constructor ============

    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {}

    // ============ Distribution Methods ============

    /**
     * @notice Distribute ETH equally among recipients
     * @param recipients Array of recipient addresses
     */
    function distributeEqual(address[] calldata recipients) external payable {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();

        uint256 amount = msg.value / len;
        if (amount == 0) revert InsufficientValue();

        for (uint256 i; i < len;) {
            _send(recipients[i], amount);
            unchecked { ++i; }
        }

        // Refund dust
        uint256 dust = msg.value - (amount * len);
        if (dust != 0) {
            _send(_msgSender(), dust);
        }

        emit Distributed(_msgSender(), 1, msg.value, len);
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
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (len != amounts.length) revert LengthMismatch();

        uint256 totalSent;
        for (uint256 i; i < len;) {
            uint256 amt = amounts[i];
            if (amt != 0) {
                totalSent += amt;
                _send(recipients[i], amt);
            }
            unchecked { ++i; }
        }

        if (msg.value < totalSent) revert InsufficientValue();

        // Refund excess
        uint256 excess = msg.value - totalSent;
        if (excess != 0) {
            _send(_msgSender(), excess);
        }

        emit Distributed(_msgSender(), 2, totalSent, len);
    }

    /**
     * @notice Distribute ETH randomly among recipients
     * @param recipients Array of recipient addresses
     */
    function distributeRandom(address[] calldata recipients) external payable {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (msg.value == 0) revert InsufficientValue();

        // Single hash for randomness seed
        bytes32 seed = keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            msg.sender,
            msg.value
        ));

        uint256 remaining = msg.value;

        for (uint256 i; i < len;) {
            uint256 amount;
            if (i == len - 1) {
                amount = remaining;
            } else {
                // Random percentage 1-50% of remaining
                uint256 pct = (uint256(keccak256(abi.encodePacked(seed, i))) % 50) + 1;
                amount = (remaining * pct) / 100;
            }

            if (amount != 0) {
                _send(recipients[i], amount);
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
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (minAmount > maxAmount) revert InvalidRange();
        if (msg.value < minAmount * len) revert InsufficientValue();

        bytes32 seed = keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            msg.sender
        ));

        uint256 range = maxAmount - minAmount;
        uint256 totalSent;

        for (uint256 i; i < len;) {
            uint256 amount;
            uint256 remaining = msg.value - totalSent;
            uint256 reserveForOthers = minAmount * (len - i - 1);

            if (i == len - 1) {
                // Last recipient
                amount = remaining;
                if (amount > maxAmount) amount = maxAmount;
            } else {
                // Random within range, capped by available
                uint256 maxAllowed = remaining - reserveForOthers;
                if (maxAllowed > maxAmount) maxAllowed = maxAmount;

                if (range != 0 && maxAllowed > minAmount) {
                    uint256 actualRange = maxAllowed - minAmount;
                    uint256 extra = uint256(keccak256(abi.encodePacked(seed, i))) % (actualRange + 1);
                    amount = minAmount + extra;
                } else {
                    amount = minAmount;
                }
            }

            _send(recipients[i], amount);
            totalSent += amount;
            unchecked { ++i; }
        }

        // Refund excess
        if (msg.value > totalSent) {
            _send(_msgSender(), msg.value - totalSent);
        }

        emit Distributed(_msgSender(), 4, totalSent, len);
    }

    // ============ Internal ============

    /// @dev Optimized ETH transfer without return data check
    function _send(address to, uint256 amount) private {
        assembly {
            if iszero(call(gas(), to, amount, 0, 0, 0, 0)) {
                mstore(0, 0x90b8ec18) // TransferFailed()
                revert(0x1c, 0x04)
            }
        }
    }

    // ============ Receive ============

    receive() external payable {}
}
