// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Referral} from "./Referral.sol";

/**
 * @title BiuBiuPayable
 * @notice Gas-based fee collection with referral for BiuBiu tools
 * @dev Tools inherit this and add `paid(pay)` modifier to public functions.
 *      - msg.value == 0: free call (premium members, frontend skips payment)
 *      - msg.value > 0: gas-based fee, must cover gas × multiplier.
 *        50% referral, 50% VAULT. Excess refunded.
 *      Fee multiplier: 10x on mainnet, 1000x on L2s.
 *      Frontend checks Arbitrum membership off-chain and decides whether to send ETH.
 *
 * Usage:
 *   contract MyTool is BiuBiuPayable {
 *       function doSomething(PayInfo calldata pay) external payable paid(pay) { ... }
 *   }
 */
abstract contract BiuBiuPayable {
    // ============ Errors ============

    error FeeTooLow();

    // ============ Structs ============

    /// @param referrer Referral address (address(0) if none)
    /// @param source Tracking source (e.g. "web", "cli", "api")
    struct PayInfo {
        address referrer;
        string source;
    }

    // ============ Constants ============

    /// @notice Fee multiplier: 10x on mainnet (chain 1), 1000x on L2s
    uint256 public constant MAINNET_MULTIPLIER = 10;
    uint256 public constant L2_MULTIPLIER = 1000;

    /// @notice Estimated gas overhead for fee settlement (referral + vault + refund)
    uint256 private constant _SETTLEMENT_GAS = 60_000;

    address public constant VAULT = 0x7602db7FbBc4f0FD7dfA2Be206B39e002A5C94cA;

    // ============ Events ============

    event FeePaid(address indexed user, uint256 fee, address indexed referrer, uint256 referralAmount, string source);

    // ============ Modifier ============

    /// @notice Gas-based fee with referral. Free if msg.value == 0 (premium bypass).
    modifier paid(PayInfo calldata pay) {
        if (msg.value == 0) {
            // Free call (premium member or frontend decided no charge)
            _;
        } else {
            // Paid call: calculate gas-based fee
            uint256 gasStart = gasleft();
            _;
            uint256 gasUsed = gasStart - gasleft() + _SETTLEMENT_GAS;
            uint256 multiplier = block.chainid == 1 ? MAINNET_MULTIPLIER : L2_MULTIPLIER;
            uint256 fee = gasUsed * tx.gasprice * multiplier;

            if (msg.value < fee) revert FeeTooLow();

            // Referral: 50% to referrer if valid
            uint256 referralAmount = Referral.processHalf(pay.referrer, msg.sender, fee);

            // Send remaining fee to vault
            // forge-lint: disable-next-line(unchecked-call)
            payable(VAULT).call{value: fee - referralAmount}("");

            // Refund excess
            uint256 excess = msg.value - fee;
            if (excess > 0) {
                // forge-lint: disable-next-line(unchecked-call)
                payable(msg.sender).call{value: excess}("");
            }

            emit FeePaid(msg.sender, fee, pay.referrer, referralAmount, pay.source);
        }
    }

    // ============ View ============

    /// @notice Estimate fee for a given gas amount (for frontend)
    function estimateFee(uint256 gasAmount) external view returns (uint256) {
        uint256 multiplier = block.chainid == 1 ? MAINNET_MULTIPLIER : L2_MULTIPLIER;
        return (gasAmount + _SETTLEMENT_GAS) * tx.gasprice * multiplier;
    }
}
