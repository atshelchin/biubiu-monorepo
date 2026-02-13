// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BiuBiuSubscription} from "./BiuBiuSubscription.sol";
import {Referral} from "../libraries/Referral.sol";

/**
 * @title BiuBiuToolProxy
 * @notice Tool proxy: callTool for premium/per-use access
 * @dev Inherits BiuBiuSubscription for subscription state.
 *      Implements ERC-2771 Trusted Forwarder: appends msg.sender to calldata.
 *      Target tools should inherit ERC2771Context to extract real sender.
 */
abstract contract BiuBiuToolProxy is BiuBiuSubscription {
    // ============ Structs ============

    struct CallToolParams {
        uint256 paidAmount;
        uint256 referralAmount;
        bytes32 promoId;
        bool isPremium;
    }

    // ============ Tool Proxy ============

    function callTool(
        address target,
        bytes calldata data,
        string calldata toolId,
        address referrer,
        bytes calldata promoCode
    ) external payable nonReentrant returns (bytes memory result) {
        if (target == address(this) || target == address(0)) revert InvalidTarget();

        CallToolParams memory p;
        uint256 activeTokenId = activeSubscription[msg.sender];
        p.isPremium = activeTokenId != 0 && _tokenAttributes[activeTokenId].expiry > block.timestamp;

        uint256 forwardValue = msg.value;

        if (!p.isPremium) {
            (p.paidAmount, p.referralAmount, p.promoId, forwardValue) = _processToolPayment(referrer, promoCode);
        }

        // Call target with ERC-2771: append msg.sender to calldata
        bool success;
        (success, result) = target.call{value: forwardValue}(abi.encodePacked(data, msg.sender));

        if (!success) {
            if (result.length > 0) {
                assembly {
                    revert(add(result, 32), mload(result))
                }
            }
            revert CallFailed();
        }

        // Emit event for tracking
        bytes32 toolHash = bytes(toolId).length > 0 ? keccak256(bytes(toolId)) : bytes32(0);
        emit ToolCalled(
            msg.sender, target, toolHash, toolId, p.isPremium, p.paidAmount, referrer, p.referralAmount, p.promoId
        );
    }

    // ============ Internal ============

    function _processToolPayment(address referrer, bytes calldata promoCode)
        private
        returns (uint256 paidAmount, uint256 referralAmount, bytes32 promoId, uint256 forwardValue)
    {
        paidAmount = PER_USE_PRICE;

        // Apply promo code if provided
        if (promoCode.length != 0) {
            (paidAmount, promoId,) = _applyPromoCode(promoCode, PER_USE_PRICE);
        }

        if (msg.value < paidAmount) revert IncorrectPaymentAmount();

        // Referral split (50%)
        referralAmount = Referral.processHalf(referrer, msg.sender, paidAmount);
        if (referralAmount > 0) {
            emit ReferralPaid(referrer, referralAmount);
        }

        // Send remaining fee to VAULT
        // forge-lint: disable-next-line(unchecked-call)
        payable(VAULT).call{value: paidAmount - referralAmount}("");

        forwardValue = msg.value - paidAmount;
    }
}
