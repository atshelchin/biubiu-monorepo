// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IBiuBiuPremium} from "../interfaces/IBiuBiuPremium.sol";
import {ERC721Base} from "../libraries/ERC721Base.sol";
import {ReentrancyGuard} from "../libraries/ReentrancyGuard.sol";
import {Base64} from "../libraries/Base64.sol";
import {Strings} from "../libraries/Strings.sol";
import {DateTime} from "../libraries/DateTime.sol";
import {PromoCode} from "../libraries/PromoCode.sol";
import {Referral} from "../libraries/Referral.sol";

/**
 * @title BiuBiuPremium
 * @notice A subscription NFT contract with two tiers (Monthly/Yearly), referral system,
 *         source/tool tracking, and EIP-712 + EIP-1271 promo code discounts
 * @dev Subscription info is bound to NFT tokenId. Users can hold multiple NFTs but only activate one at a time.
 *      Inherits ERC721Base for standard NFT functionality.
 */
contract BiuBiuPremium is ERC721Base, IBiuBiuPremium, ReentrancyGuard {
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

    uint256 private _nextTokenId = 1;
    mapping(uint256 => TokenAttributes) private _tokenAttributes;
    mapping(address => uint256) public activeSubscription;

    // ============ Constructor ============

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version)"), keccak256("BiuBiuPremium"), keccak256("1")
            )
        );
    }

    // ============ ERC721 Overrides ============

    function name() public pure override returns (string memory) {
        return "BiuBiu Premium";
    }

    function symbol() public pure override returns (string memory) {
        return "BBP";
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_owners[tokenId] == address(0)) revert TokenNotExists();

        TokenAttributes storage attrs = _tokenAttributes[tokenId];
        uint256 expiry = attrs.expiry;
        bool isActive = expiry > block.timestamp;

        string memory svg = _generateSVG(tokenId, isActive, attrs.mintedAt);
        string memory svgBase64 = Base64.encode(bytes(svg));

        string memory json = string(
            abi.encodePacked(
                '{"name":"BiuBiu Premium #',
                Strings.toString(tokenId),
                '","description":"BiuBiu Premium Subscription NFT. Visit https://biubiu.tools for more info.","external_url":"https://biubiu.tools","image":"data:image/svg+xml;base64,',
                svgBase64,
                '","attributes":['
            )
        );

        json = string(
            abi.encodePacked(
                json,
                '{"trait_type":"Status","value":"',
                isActive ? "Active" : "Expired",
                '"},{"trait_type":"Minted At","display_type":"date","value":',
                Strings.toString(attrs.mintedAt),
                '},{"trait_type":"Minted By","value":"',
                Strings.toHexString(attrs.mintedBy),
                '"},{"trait_type":"Renewal Count","display_type":"number","value":',
                Strings.toString(attrs.renewalCount),
                '},{"trait_type":"Expiry","display_type":"date","value":',
                Strings.toString(expiry),
                "}]}"
            )
        );

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    // ============ ERC721 Hooks ============

    function _beforeTokenTransfer(address from, address to, uint256 tokenId) internal override {
        // Handle mint
        if (from == address(0)) {
            if (activeSubscription[to] == 0) {
                activeSubscription[to] = tokenId;
                emit Activated(to, tokenId);
            }
            _tokenAttributes[tokenId] =
                TokenAttributes({mintedAt: block.timestamp, mintedBy: msg.sender, renewalCount: 0, expiry: 0});
        }
        // Handle transfer (not mint or burn)
        else if (to != address(0)) {
            if (activeSubscription[from] == tokenId) {
                activeSubscription[from] = 0;
                emit Deactivated(from, tokenId);
            }
            if (activeSubscription[to] == 0) {
                activeSubscription[to] = tokenId;
                emit Activated(to, tokenId);
            }
        }
    }

    // ============ Subscription ============

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

    function _getTierInfo(SubscriptionTier tier) private pure returns (uint256 price, uint256 duration) {
        if (tier == SubscriptionTier.Monthly) {
            return (MONTHLY_PRICE, MONTHLY_DURATION);
        } else {
            return (YEARLY_PRICE, YEARLY_DURATION);
        }
    }

    // ============ Promo Code Verification (EIP-712 + EIP-1271) ============

    function _applyPromoCode(bytes calldata promoCode, uint256 basePrice)
        private
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

    // ============ View Functions ============

    function getDiscountedPrice(SubscriptionTier tier, uint256 discountBps) external pure returns (uint256) {
        (uint256 basePrice,) = _getTierInfo(tier);
        if (discountBps == 0 || discountBps >= 10000) return basePrice;
        return basePrice * (10000 - discountBps) / 10000;
    }

    /// @notice Validate a promo code without executing. Returns decoded parameters and validity status.
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

    // ============ Tool Proxy ============

    struct CallToolParams {
        uint256 paidAmount;
        uint256 referralAmount;
        bytes32 promoId;
        bool isPremium;
    }

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
            (p.paidAmount, p.referralAmount, p.promoId, forwardValue) =
                _processToolPayment(referrer, promoCode);
        }

        // Call target
        bool success;
        (success, result) = target.call{value: forwardValue}(data);

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
        emit ToolCalled(msg.sender, target, toolHash, toolId, p.isPremium, p.paidAmount, referrer, p.referralAmount, p.promoId);
    }

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

    receive() external payable {}

    // ============ Internal Helpers ============

    function _generateSVG(uint256 tokenId, bool isActive, uint256 mintedAt) private pure returns (string memory) {
        string memory tokenIdStr = Strings.toString(tokenId);
        string memory dateStr = DateTime.formatDate(mintedAt);
        uint256 idLen = bytes(tokenIdStr).length;
        string memory fontSize;
        if (idLen <= 2) fontSize = "72";
        else if (idLen <= 4) fontSize = "48";
        else if (idLen <= 6) fontSize = "36";
        else if (idLen <= 9) fontSize = "26";
        else fontSize = "20";

        if (isActive) {
            return _generateActiveSVG(tokenIdStr, dateStr, fontSize);
        } else {
            return _generateExpiredSVG(tokenIdStr, dateStr, fontSize);
        }
    }

    function _generateActiveSVG(string memory tokenIdStr, string memory dateStr, string memory fontSize)
        private
        pure
        returns (string memory)
    {
        // Part 1: defs — deep purple bg + gold gradient
        string memory svg = string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560">',
                "<defs>",
                '<radialGradient id="bg" cx="30%" cy="25%" r="80%">',
                '<stop offset="0%" stop-color="#1a1040"/>',
                '<stop offset="100%" stop-color="#0a0a12"/>',
                "</radialGradient>",
                '<linearGradient id="gd" x1="0%" y1="0%" x2="100%" y2="100%">',
                '<stop offset="0%" stop-color="#f7d06b"/>',
                '<stop offset="50%" stop-color="#c9952e"/>'
            )
        );

        // Part 2: close gradient + glow filter + close defs
        svg = string(
            abi.encodePacked(
                svg,
                '<stop offset="100%" stop-color="#f7d06b"/>',
                "</linearGradient>",
                '<filter id="gl"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
                "</defs>"
            )
        );

        // Part 3: background + gold double border + chain-link logo
        svg = string(
            abi.encodePacked(
                svg,
                '<rect width="400" height="560" fill="url(#bg)"/>',
                '<rect x="10" y="10" width="380" height="540" rx="16" fill="none" stroke="url(#gd)" stroke-width="0.6" opacity="0.3"/>',
                '<rect x="18" y="18" width="364" height="524" rx="12" fill="none" stroke="url(#gd)" stroke-width="1.5"/>',
                '<g transform="translate(183,50)" fill="none" stroke="url(#gd)" stroke-width="2.2" opacity="0.85" filter="url(#gl)">',
                '<rect width="22" height="22" rx="5.5"/>',
                '<rect x="12" y="12" width="22" height="22" rx="5.5"/>',
                "</g>"
            )
        );

        // Part 4: PREMIUM label + divider + token ID
        svg = string(
            abi.encodePacked(
                svg,
                '<text x="200" y="115" text-anchor="middle" fill="url(#gd)" font-family="Georgia,serif" font-size="16" letter-spacing="8">PREMIUM</text>',
                '<line x1="100" y1="138" x2="300" y2="138" stroke="url(#gd)" stroke-width="0.5" opacity="0.3"/>',
                '<text x="200" y="300" text-anchor="middle" fill="#fff" font-family="Georgia,serif" font-size="',
                fontSize,
                '" font-weight="bold" filter="url(#gl)">#',
                tokenIdStr,
                "</text>"
            )
        );

        // Part 5: divider + date + footer + close
        svg = string(
            abi.encodePacked(
                svg,
                '<line x1="100" y1="340" x2="300" y2="340" stroke="url(#gd)" stroke-width="0.5" opacity="0.3"/>',
                '<text x="200" y="385" text-anchor="middle" fill="url(#gd)" font-family="Georgia,serif" font-size="13" letter-spacing="4">',
                dateStr,
                "</text>",
                '<text x="200" y="510" text-anchor="middle" fill="#f7d06b" font-family="Georgia,serif" font-size="11" opacity="0.4" letter-spacing="3">biubiu.tools</text>',
                "</svg>"
            )
        );

        return svg;
    }

    function _generateExpiredSVG(string memory tokenIdStr, string memory dateStr, string memory fontSize)
        private
        pure
        returns (string memory)
    {
        // Part 1: defs + background + outer border
        string memory svg = string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560">',
                "<defs>",
                '<radialGradient id="bg" cx="30%" cy="25%" r="80%">',
                '<stop offset="0%" stop-color="#111113"/>',
                '<stop offset="100%" stop-color="#090909"/>',
                "</radialGradient>",
                "</defs>",
                '<rect width="400" height="560" fill="url(#bg)"/>',
                '<rect x="10" y="10" width="380" height="540" rx="16" fill="none" stroke="#3a3a3a" stroke-width="0.6" opacity="0.3"/>'
            )
        );

        // Part 2: inner border + chain-link logo (gray) + PREMIUM + divider
        svg = string(
            abi.encodePacked(
                svg,
                '<rect x="18" y="18" width="364" height="524" rx="12" fill="none" stroke="#3a3a3a" stroke-width="1.5"/>',
                '<g transform="translate(183,50)" fill="none" stroke="#3a3a3a" stroke-width="2.2" opacity="0.5">',
                '<rect width="22" height="22" rx="5.5"/>',
                '<rect x="12" y="12" width="22" height="22" rx="5.5"/>',
                "</g>",
                '<text x="200" y="115" text-anchor="middle" fill="#4a4a4a" font-family="Georgia,serif" font-size="16" letter-spacing="8">PREMIUM</text>',
                '<line x1="100" y1="138" x2="300" y2="138" stroke="#3a3a3a" stroke-width="0.5" opacity="0.3"/>'
            )
        );

        // Part 3: token ID + divider + EXPIRED
        svg = string(
            abi.encodePacked(
                svg,
                '<text x="200" y="300" text-anchor="middle" fill="#3a3a3a" font-family="Georgia,serif" font-size="',
                fontSize,
                '" font-weight="bold">#',
                tokenIdStr,
                "</text>",
                '<line x1="100" y1="340" x2="300" y2="340" stroke="#3a3a3a" stroke-width="0.5" opacity="0.3"/>',
                '<text x="200" y="378" text-anchor="middle" fill="#4a4a4a" font-family="Georgia,serif" font-size="13" letter-spacing="6">EXPIRED</text>'
            )
        );

        // Part 4: date + footer + close
        svg = string(
            abi.encodePacked(
                svg,
                '<text x="200" y="408" text-anchor="middle" fill="#3a3a3a" font-family="Georgia,serif" font-size="11" letter-spacing="3">',
                dateStr,
                "</text>",
                '<text x="200" y="510" text-anchor="middle" fill="#3a3a3a" font-family="Georgia,serif" font-size="11" opacity="0.4" letter-spacing="3">biubiu.tools</text>',
                "</svg>"
            )
        );

        return svg;
    }
}
