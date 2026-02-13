// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IBiuBiuPremium
 * @notice Interface for BiuBiuPremium subscription NFT contract
 * @dev Stable API for frontend and other contracts to interact with BiuBiuPremium
 *      ERC721 functions are inherited from ERC721Base (which implements IERC721)
 */
interface IBiuBiuPremium {
    // ============ Custom Errors ============

    error IncorrectPaymentAmount();
    error NotPremiumMember();
    error InvalidTarget();
    error CallFailed();
    error InvalidPromoCode();
    error PromoCodeExpired();
    error PromoCodeChainNotValid();
    error PromoCodeNotAvailable();
    error InvalidDiscountBps();

    // ============ Enums ============

    enum SubscriptionTier {
        Monthly, // 30 days
        Yearly // 365 days
    }

    // ============ Structs ============

    struct TokenAttributes {
        uint256 mintedAt;
        address mintedBy;
        uint256 renewalCount;
        uint256 expiry;
    }

    // ============ Events ============

    event Subscribed(
        address indexed user,
        uint256 indexed tokenId,
        SubscriptionTier tier,
        uint256 expiryTime,
        address indexed referrer,
        uint256 referralAmount,
        uint256 paidAmount,
        string source,
        string toolId,
        bytes32 promoId,
        uint256 discountBps
    );
    event ReferralPaid(address indexed referrer, uint256 amount);
    event Activated(address indexed user, uint256 indexed tokenId);
    event Deactivated(address indexed user, uint256 indexed tokenId);
    event ToolCalled(
        address indexed caller,
        address indexed target,
        bytes32 indexed toolHash,
        string toolId,
        bool isPremiumCall,
        uint256 paidAmount,
        address referrer,
        uint256 referralAmount,
        bytes32 promoId
    );

    // ============ Pricing ============

    function PER_USE_PRICE() external view returns (uint256);
    function MONTHLY_PRICE() external view returns (uint256);
    function YEARLY_PRICE() external view returns (uint256);
    function MONTHLY_DURATION() external view returns (uint256);
    function YEARLY_DURATION() external view returns (uint256);
    function VAULT() external view returns (address);

    // ============ Subscription Functions ============

    function subscribe(
        SubscriptionTier tier,
        address referrer,
        address recipient,
        string calldata source,
        string calldata toolId,
        bytes calldata promoCode
    ) external payable;
    function subscribeToToken(
        uint256 tokenId,
        SubscriptionTier tier,
        address referrer,
        string calldata source,
        string calldata toolId,
        bytes calldata promoCode
    ) external payable;
    function activate(uint256 tokenId) external;

    // ============ View Functions ============

    function getSubscriptionInfo(address user)
        external
        view
        returns (bool isPremium, uint256 expiryTime, uint256 remainingTime);

    function getTokenSubscriptionInfo(uint256 tokenId)
        external
        view
        returns (uint256 expiryTime, bool isExpired, address tokenOwner);

    function getTokenAttributes(uint256 tokenId)
        external
        view
        returns (uint256 mintedAt, address mintedBy, uint256 renewalCount, uint256 expiry);

    function nextTokenId() external view returns (uint256);
    function subscriptionExpiry(uint256 tokenId) external view returns (uint256);
    function activeSubscription(address user) external view returns (uint256);

    // ============ Promo Code ============

    function PROMO_TYPEHASH() external view returns (bytes32);
    function getDiscountedPrice(SubscriptionTier tier, uint256 discountBps) external view returns (uint256);
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
        );

    // ============ Tool Proxy ============

    function callTool(
        address target,
        bytes calldata data,
        string calldata toolId,
        address referrer,
        bytes calldata promoCode
    ) external payable returns (bytes memory result);
}
