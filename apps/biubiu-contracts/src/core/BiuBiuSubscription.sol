// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BiuBiuCore} from "./BiuBiuCore.sol";
import {Referral} from "../libraries/Referral.sol";

/**
 * @title BiuBiuSubscription
 * @notice Subscription management: subscribe, renew, activate
 * @dev Inherits BiuBiuCore for constants and promo code logic
 */
abstract contract BiuBiuSubscription is BiuBiuCore {
    // ============ View Functions ============

    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    function getSubscriptionInfo(address user)
        external
        view
        returns (bool isPremium, uint256 expiryTime, uint256 remainingTime)
    {
        uint256 activeTokenId = activeSubscription[user];
        if (activeTokenId == 0) return (false, 0, 0);
        expiryTime = _tokenAttributes[activeTokenId].expiry;
        isPremium = expiryTime > block.timestamp;
        remainingTime = isPremium ? expiryTime - block.timestamp : 0;
    }

    function getTokenSubscriptionInfo(uint256 tokenId)
        external
        view
        returns (uint256 expiryTime, bool isExpired, address tokenOwner)
    {
        tokenOwner = _owners[tokenId];
        if (tokenOwner == address(0)) revert TokenNotExists();
        expiryTime = _tokenAttributes[tokenId].expiry;
        isExpired = expiryTime <= block.timestamp;
    }

    function getTokenAttributes(uint256 tokenId)
        external
        view
        returns (uint256 mintedAt, address mintedBy, uint256 renewalCount, uint256 expiry)
    {
        if (_owners[tokenId] == address(0)) revert TokenNotExists();
        TokenAttributes storage attrs = _tokenAttributes[tokenId];
        return (attrs.mintedAt, attrs.mintedBy, attrs.renewalCount, attrs.expiry);
    }

    function subscriptionExpiry(uint256 tokenId) external view returns (uint256) {
        return _tokenAttributes[tokenId].expiry;
    }

    // ============ Subscription Functions ============

    function subscribe(
        SubscriptionTier tier,
        address referrer,
        address recipient,
        string calldata source,
        string calldata toolId,
        bytes calldata promoCode
    ) external payable nonReentrant {
        address to = recipient == address(0) ? msg.sender : recipient;
        uint256 activeTokenId = activeSubscription[to];

        if (activeTokenId != 0) {
            _renewSubscription(activeTokenId, tier, referrer, source, toolId, promoCode);
        } else {
            uint256 tokenId = _nextTokenId++;
            _safeMint(to, tokenId);
            _renewSubscription(tokenId, tier, referrer, source, toolId, promoCode);
        }
    }

    function subscribeToToken(
        uint256 tokenId,
        SubscriptionTier tier,
        address referrer,
        string calldata source,
        string calldata toolId,
        bytes calldata promoCode
    ) external payable nonReentrant {
        if (_owners[tokenId] == address(0)) revert TokenNotExists();
        _renewSubscription(tokenId, tier, referrer, source, toolId, promoCode);
    }

    function activate(uint256 tokenId) external {
        if (_owners[tokenId] != msg.sender) revert NotTokenOwner();
        activeSubscription[msg.sender] = tokenId;
        emit Activated(msg.sender, tokenId);
    }

    // ============ Internal ============

    function _renewSubscription(
        uint256 tokenId,
        SubscriptionTier tier,
        address referrer,
        string calldata source,
        string calldata toolId,
        bytes calldata promoCode
    ) private {
        if (_owners[tokenId] == address(0)) revert TokenNotExists();

        (uint256 basePrice, uint256 duration) = _getTierInfo(tier);

        // Apply promo code discount if provided
        uint256 price = basePrice;
        bytes32 promoId;
        uint256 discountBps;
        if (promoCode.length > 0) {
            (price, promoId, discountBps) = _applyPromoCode(promoCode, basePrice);
        }

        if (msg.value != price) revert IncorrectPaymentAmount();

        // Update subscription expiry
        TokenAttributes storage attrs = _tokenAttributes[tokenId];
        uint256 currentExpiry = attrs.expiry;
        uint256 newExpiry = currentExpiry > block.timestamp ? currentExpiry + duration : block.timestamp + duration;
        attrs.expiry = newExpiry;

        unchecked {
            attrs.renewalCount += 1;
        }

        // Referral split (50% of actual paid amount)
        uint256 referralAmount = Referral.processHalf(referrer, msg.sender, price);
        if (referralAmount > 0) {
            emit ReferralPaid(referrer, referralAmount);
        }

        // Sweep remaining balance to VAULT
        // forge-lint: disable-next-line(unchecked-call)
        payable(VAULT).call{value: address(this).balance}("");

        emit Subscribed(
            msg.sender, tokenId, tier, newExpiry, referrer, referralAmount, price, source, toolId, promoId, discountBps
        );
    }
}
