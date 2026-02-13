// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IBiuBiuPremium} from "../interfaces/IBiuBiuPremium.sol";
import {ERC721Base} from "../libraries/ERC721Base.sol";
import {ReentrancyGuard} from "../libraries/ReentrancyGuard.sol";
import {PromoCode} from "../libraries/PromoCode.sol";

/**
 * @title BiuBiuCore
 * @notice Core contract with constants, storage, and promo code verification
 * @dev Base layer in the inheritance chain
 */
abstract contract BiuBiuCore is ERC721Base, IBiuBiuPremium, ReentrancyGuard {
    // ============ Constants ============

    uint256 public constant PER_USE_PRICE = 0.02 ether;
    uint256 public constant MONTHLY_PRICE = 0.1 ether;
    uint256 public constant YEARLY_PRICE = 0.5 ether;
    uint256 public constant MONTHLY_DURATION = 30 days;
    uint256 public constant YEARLY_DURATION = 365 days;

    bytes32 public constant PROMO_TYPEHASH =
        keccak256("PromoCode(string name,uint256 discountBps,uint256 expiry,uint256 chainId)");

    address public constant VAULT = 0x7602db7FbBc4f0FD7dfA2Be206B39e002A5C94cA;

    // ============ Immutables ============

    bytes32 public immutable DOMAIN_SEPARATOR;

    // ============ State Variables ============

    uint256 internal _nextTokenId = 1;
    mapping(uint256 => TokenAttributes) internal _tokenAttributes;
    mapping(address => uint256) public activeSubscription;

    // ============ Constructor ============

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version)"), keccak256("BiuBiuPremium"), keccak256("1")
            )
        );
    }

    // ============ Internal: Promo Code ============

    function _applyPromoCode(bytes calldata promoCode, uint256 basePrice)
        internal
        view
        returns (uint256 discountedPrice, bytes32 promoId_, uint256 discountBps_)
    {
        PromoCode.Data memory data = PromoCode.decode(promoCode);

        if (!PromoCode.isValidDiscount(data)) revert InvalidDiscountBps();

        bytes32 hash = PromoCode.structHash(PROMO_TYPEHASH, data);

        if (!PromoCode.verifyEIP1271(VAULT, PromoCode.digest(DOMAIN_SEPARATOR, hash), data.signature)) {
            revert InvalidPromoCode();
        }

        if (PromoCode.isExpired(data)) revert PromoCodeExpired();
        if (!PromoCode.isValidChain(data)) revert PromoCodeChainNotValid();

        discountedPrice = PromoCode.applyDiscount(basePrice, data.discountBps);
        promoId_ = hash;
        discountBps_ = data.discountBps;
    }

    function _getTierInfo(SubscriptionTier tier) internal pure returns (uint256 price, uint256 duration) {
        if (tier == SubscriptionTier.Monthly) {
            return (MONTHLY_PRICE, MONTHLY_DURATION);
        } else {
            return (YEARLY_PRICE, YEARLY_DURATION);
        }
    }

    // ============ View Functions ============

    function getDiscountedPrice(SubscriptionTier tier, uint256 discountBps) external pure returns (uint256) {
        (uint256 basePrice,) = _getTierInfo(tier);
        if (discountBps == 0 || discountBps >= 10000) return basePrice;
        return basePrice * (10000 - discountBps) / 10000;
    }

    function validatePromoCode(bytes calldata promoCode)
        external
        view
        returns (
            bool isValid,
            string memory promoName,
            uint256 discountBps,
            uint256 expiry,
            uint256 chainId,
            string memory reason
        )
    {
        PromoCode.Data memory data = PromoCode.decode(promoCode);
        promoName = data.name;
        discountBps = data.discountBps;
        expiry = data.expiry;
        chainId = data.chainId;

        (isValid, reason) = PromoCode.verify(data, PROMO_TYPEHASH, DOMAIN_SEPARATOR, VAULT);
    }
}
