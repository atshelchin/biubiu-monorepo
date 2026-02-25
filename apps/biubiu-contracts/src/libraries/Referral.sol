// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Referral
 * @notice Library for referral reward distribution
 * @dev Stateless library for calculating and distributing referral rewards
 */
library Referral {
    uint256 private constant BPS_BASE = 10000;

    /// @notice Check if referrer is valid (not zero, not self)
    /// @param referrer The referrer address
    /// @param payer The address making the payment (usually msg.sender)
    function isValid(address referrer, address payer) internal pure returns (bool) {
        return referrer != address(0) && referrer != payer;
    }

    /// @notice Calculate referral amount based on percentage (in basis points)
    /// @param amount The total amount
    /// @param bps Basis points (e.g., 5000 = 50%)
    function calculate(uint256 amount, uint256 bps) internal pure returns (uint256) {
        return amount * bps / BPS_BASE;
    }

    /// @notice Calculate 50% referral (optimized with bit shift)
    /// @param amount The total amount
    function calculateHalf(uint256 amount) internal pure returns (uint256) {
        return amount >> 1;
    }

    /// @notice Send referral reward to referrer
    /// @param referrer The referrer address
    /// @param amount The reward amount
    /// @return sent The actual amount sent (0 if transfer failed)
    function send(address referrer, uint256 amount) internal returns (uint256 sent) {
        if (amount == 0) return 0;

        // forge-lint: disable-next-line(unchecked-call)
        (bool success,) = payable(referrer).call{value: amount}("");
        return success ? amount : 0;
    }

    /// @notice Process referral: validate, calculate, and send
    /// @param referrer The referrer address
    /// @param payer The address making the payment
    /// @param amount The payment amount
    /// @param bps Referral percentage in basis points
    /// @return sent The actual amount sent to referrer
    function process(address referrer, address payer, uint256 amount, uint256 bps) internal returns (uint256 sent) {
        if (!isValid(referrer, payer)) return 0;
        uint256 reward = calculate(amount, bps);
        return send(referrer, reward);
    }

    /// @notice Process 50% referral (optimized)
    /// @param referrer The referrer address
    /// @param payer The address making the payment
    /// @param amount The payment amount
    /// @return sent The actual amount sent to referrer
    function processHalf(address referrer, address payer, uint256 amount) internal returns (uint256 sent) {
        if (!isValid(referrer, payer)) return 0;
        return send(referrer, calculateHalf(amount));
    }
}
