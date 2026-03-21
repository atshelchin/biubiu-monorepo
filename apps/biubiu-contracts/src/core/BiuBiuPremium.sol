// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IBiuBiuPremium} from "../interfaces/IBiuBiuPremium.sol";
import {ERC721Base} from "../libraries/ERC721Base.sol";
import {ReentrancyGuard} from "../libraries/ReentrancyGuard.sol";
import {UniswapOracle} from "../libraries/UniswapOracle.sol";
import {Referral} from "../libraries/Referral.sol";
import {Base64} from "../libraries/Base64.sol";
import {Strings} from "../libraries/Strings.sol";
import {DateTime} from "../libraries/DateTime.sol";

/**
 * @title BiuBiuPremium
 * @notice Subscription NFT with USD pricing via Uniswap V3 oracle
 * @dev Deployed on Arbitrum only. Single contract: pricing, subscription, NFT metadata.
 */
contract BiuBiuPremium is ERC721Base, IBiuBiuPremium, ReentrancyGuard {
    // ============ Constants ============

    uint256 public constant MONTHLY_PRICE_USD = 100e8; // $100 (8 decimals)
    uint256 public constant YEARLY_PRICE_USD = 1000e8; // $1,000 (8 decimals)
    uint256 public constant MONTHLY_DURATION = 30 days;
    uint256 public constant YEARLY_DURATION = 365 days;

    address public constant VAULT = 0x7602db7FbBc4f0FD7dfA2Be206B39e002A5C94cA;

    // ============ State Variables ============

    uint256 internal _nextTokenId = 1;
    mapping(uint256 => TokenAttributes) internal _tokenAttributes;
    mapping(address => uint256) public activeSubscription;

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
        if (from == address(0)) {
            if (activeSubscription[to] == 0) {
                activeSubscription[to] = tokenId;
                emit Activated(to, tokenId);
            }
            _tokenAttributes[tokenId] =
                TokenAttributes({mintedAt: block.timestamp, mintedBy: msg.sender, renewalCount: 0, expiry: 0});
        } else if (to != address(0)) {
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

    function getPrice(SubscriptionTier tier) external view returns (uint256) {
        (uint256 priceWei,) = _getTierInfo(tier);
        return priceWei;
    }

    /// @notice Get current ETH/USD price from Uniswap V3 (8 decimals, e.g. 200000000000 = $2000)
    function getEthUsdPrice() external view returns (uint256) {
        return UniswapOracle.getEthUsdPrice();
    }

    // ============ Subscription Functions ============

    function subscribe(SubscriptionTier tier, address referrer, address recipient, string calldata source)
        external
        payable
        nonReentrant
    {
        address to = recipient == address(0) ? msg.sender : recipient;
        uint256 activeTokenId = activeSubscription[to];

        if (activeTokenId != 0) {
            _renewSubscription(activeTokenId, tier, referrer, source);
        } else {
            uint256 tokenId = _nextTokenId++;
            _safeMint(to, tokenId);
            _renewSubscription(tokenId, tier, referrer, source);
        }
    }

    function subscribeToToken(uint256 tokenId, SubscriptionTier tier, address referrer, string calldata source)
        external
        payable
        nonReentrant
    {
        if (_owners[tokenId] == address(0)) revert TokenNotExists();
        _renewSubscription(tokenId, tier, referrer, source);
    }

    function activate(uint256 tokenId) external {
        if (_owners[tokenId] != msg.sender) revert NotTokenOwner();
        activeSubscription[msg.sender] = tokenId;
        emit Activated(msg.sender, tokenId);
    }

    // ============ Receive ETH ============

    receive() external payable {}

    // ============ Internal: Pricing ============

    function _getTierInfo(SubscriptionTier tier) private view returns (uint256 priceWei, uint256 duration) {
        uint256 usdPrice = tier == SubscriptionTier.Monthly ? MONTHLY_PRICE_USD : YEARLY_PRICE_USD;
        priceWei = UniswapOracle.usdToEth(usdPrice);
        duration = tier == SubscriptionTier.Monthly ? MONTHLY_DURATION : YEARLY_DURATION;
    }

    function _renewSubscription(uint256 tokenId, SubscriptionTier tier, address referrer, string calldata source)
        private
    {
        if (_owners[tokenId] == address(0)) revert TokenNotExists();

        (uint256 price, uint256 duration) = _getTierInfo(tier);

        if (msg.value < price) revert InsufficientPayment();

        // Refund excess ETH
        if (msg.value > price) {
            (bool ok,) = payable(msg.sender).call{value: msg.value - price}("");
            if (!ok) revert RefundFailed();
        }

        // Update subscription expiry
        TokenAttributes storage attrs = _tokenAttributes[tokenId];
        uint256 currentExpiry = attrs.expiry;
        uint256 newExpiry = currentExpiry > block.timestamp ? currentExpiry + duration : block.timestamp + duration;
        attrs.expiry = newExpiry;

        unchecked {
            attrs.renewalCount += 1;
        }

        // Referral split (50%)
        uint256 referralAmount = Referral.processHalf(referrer, msg.sender, price);
        if (referralAmount > 0) {
            emit ReferralPaid(referrer, referralAmount);
        }

        // Sweep remaining balance to VAULT
        // forge-lint: disable-next-line(unchecked-call)
        payable(VAULT).call{value: address(this).balance}("");

        emit Subscribed(msg.sender, tokenId, tier, newExpiry, referrer, referralAmount, price, source);
    }

    // ============ SVG Generation ============

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

        svg = string(
            abi.encodePacked(
                svg,
                '<stop offset="100%" stop-color="#f7d06b"/>',
                "</linearGradient>",
                '<filter id="gl"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
                "</defs>"
            )
        );

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
