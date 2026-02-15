// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GeneratedERC721
 * @notice Feature-rich ERC721 NFT collection template created by ERC721Generator
 * @dev All features controlled by immutable flags set at deployment
 *
 * Features (bitmap):
 *   bit 0:  publicMint    - anyone can mint (with payment)
 *   bit 1:  whitelistMint - whitelist mint with Merkle proof
 *   bit 2:  reveal        - blind box mechanism
 *   bit 3:  royalty       - ERC2981 royalty support
 *   bit 4:  pausable      - owner can pause mint/transfer
 *   bit 5:  burnable      - token holders can burn
 *   bit 6:  soulbound     - non-transferable (SBT)
 *   bit 7:  enumerable    - ERC721Enumerable support
 *   bit 8:  updatableURI  - owner can update individual token URIs
 *   bit 9:  revenueSplit  - auto-split mint revenue to multiple addresses
 */
contract GeneratedERC721 {
    // ============ Errors ============

    error Unauthorized();
    error ZeroAddress();
    error TokenNotExists();
    error AlreadyMinted();
    error ExceedsMaxSupply();
    error ExceedsMaxPerWallet();
    error ExceedsMaxPerTx();
    error MintNotStarted();
    error MintEnded();
    error IncorrectPayment();
    error InvalidProof();
    error NotRevealed();
    error AlreadyRevealed();
    error IsPaused();
    error SoulboundToken();
    error FeatureDisabled();
    error TransferFailed();
    error InvalidRecipient();

    // ============ Events ============

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Revealed(string baseURI);
    event MintConfigUpdated();
    event Paused(address account);
    event Unpaused(address account);
    event BaseURIUpdated(string baseURI);
    event TokenURIUpdated(uint256 indexed tokenId, string uri);

    // ============ Feature Flags (immutable) ============

    uint16 public immutable features;

    bool public immutable publicMintEnabled;
    bool public immutable whitelistMintEnabled;
    bool public immutable revealEnabled;
    bool public immutable royaltyEnabled;
    bool public immutable pausable;
    bool public immutable burnable;
    bool public immutable soulbound;
    bool public immutable enumerable;
    bool public immutable updatableURI;
    bool public immutable revenueSplitEnabled;

    // ============ Collection Config (immutable) ============

    string public name;
    string public symbol;
    uint256 public immutable maxSupply;

    // Royalty (ERC2981)
    address public immutable royaltyReceiver;
    uint96 public immutable royaltyBps; // basis points (e.g., 500 = 5%)

    // Revenue Split
    address[] internal _splitAddresses;
    uint256[] internal _splitShares; // basis points, must sum to 10000

    // ============ State Variables ============

    address public owner;
    bool public paused;
    bool public revealed;
    uint256 public totalSupply;

    string public baseURI;
    string public hiddenURI; // shown before reveal
    string public contractURI; // collection metadata

    // Mint config
    uint256 public mintPrice;
    uint256 public maxPerWallet;
    uint256 public maxPerTx;
    uint256 public mintStartTime;
    uint256 public mintEndTime;
    bytes32 public merkleRoot;

    // ERC721 storage
    mapping(uint256 => address) internal _owners;
    mapping(address => uint256) internal _balances;
    mapping(uint256 => address) internal _tokenApprovals;
    mapping(address => mapping(address => bool)) internal _operatorApprovals;

    // Enumerable storage
    mapping(address => mapping(uint256 => uint256)) internal _ownedTokens;
    mapping(uint256 => uint256) internal _ownedTokensIndex;
    uint256[] internal _allTokens;
    mapping(uint256 => uint256) internal _allTokensIndex;

    // Mint tracking
    mapping(address => uint256) public mintedCount;

    // Custom token URIs (for updatableURI)
    mapping(uint256 => string) internal _tokenURIs;

    // ============ Constructor ============

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _maxSupply,
        address _owner,
        uint16 _features,
        string memory _baseURI,
        string memory _hiddenURI,
        string memory _contractURI,
        address _royaltyReceiver,
        uint96 _royaltyBps,
        address[] memory _splitAddrs,
        uint256[] memory _splitSharesArr
    ) {
        if (_owner == address(0)) revert ZeroAddress();

        name = _name;
        symbol = _symbol;
        maxSupply = _maxSupply;
        owner = _owner;
        features = _features;

        baseURI = _baseURI;
        hiddenURI = _hiddenURI;
        contractURI = _contractURI;

        // Set feature flags
        publicMintEnabled = (_features & (1 << 0)) != 0;
        whitelistMintEnabled = (_features & (1 << 1)) != 0;
        revealEnabled = (_features & (1 << 2)) != 0;
        royaltyEnabled = (_features & (1 << 3)) != 0;
        pausable = (_features & (1 << 4)) != 0;
        burnable = (_features & (1 << 5)) != 0;
        soulbound = (_features & (1 << 6)) != 0;
        enumerable = (_features & (1 << 7)) != 0;
        updatableURI = (_features & (1 << 8)) != 0;
        revenueSplitEnabled = (_features & (1 << 9)) != 0;

        // Royalty
        royaltyReceiver = royaltyEnabled ? _royaltyReceiver : address(0);
        royaltyBps = royaltyEnabled ? _royaltyBps : 0;

        // Revenue split
        if (revenueSplitEnabled && _splitAddrs.length > 0) {
            _splitAddresses = _splitAddrs;
            _splitShares = _splitSharesArr;
        }

        // If not using reveal, mark as revealed
        if (!revealEnabled) {
            revealed = true;
        }

        emit OwnershipTransferred(address(0), _owner);
    }

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (pausable && paused) revert IsPaused();
        _;
    }

    // ============ ERC721 Core ============

    function balanceOf(address _owner) external view returns (uint256) {
        if (_owner == address(0)) revert ZeroAddress();
        return _balances[_owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address tokenOwner = _owners[tokenId];
        if (tokenOwner == address(0)) revert TokenNotExists();
        return tokenOwner;
    }

    function approve(address to, uint256 tokenId) external {
        address tokenOwner = ownerOf(tokenId);
        if (msg.sender != tokenOwner && !_operatorApprovals[tokenOwner][msg.sender]) {
            revert Unauthorized();
        }
        _tokenApprovals[tokenId] = to;
        emit Approval(tokenOwner, to, tokenId);
    }

    function getApproved(uint256 tokenId) public view returns (address) {
        if (_owners[tokenId] == address(0)) revert TokenNotExists();
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address _owner, address operator) public view returns (bool) {
        return _operatorApprovals[_owner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public whenNotPaused {
        if (soulbound) revert SoulboundToken();
        if (!_isApprovedOrOwner(msg.sender, tokenId)) revert Unauthorized();
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        if (to.code.length > 0) {
            (bool success, bytes memory returnData) =
                to.call(abi.encodeWithSelector(0x150b7a02, msg.sender, from, tokenId, data));
            if (!success || (returnData.length >= 32 && abi.decode(returnData, (bytes4)) != 0x150b7a02)) {
                revert InvalidRecipient();
            }
        }
    }

    // ============ Mint Functions ============

    function mint(uint256 quantity) external payable whenNotPaused {
        if (!publicMintEnabled) revert FeatureDisabled();
        _mintInternal(msg.sender, quantity, new bytes32[](0));
    }

    function mintTo(address to, uint256 quantity) external payable whenNotPaused {
        if (!publicMintEnabled) revert FeatureDisabled();
        _mintInternal(to, quantity, new bytes32[](0));
    }

    function whitelistMint(uint256 quantity, bytes32[] calldata proof) external payable whenNotPaused {
        if (!whitelistMintEnabled) revert FeatureDisabled();
        _mintInternal(msg.sender, quantity, proof);
    }

    function ownerMint(address to, uint256 quantity) external onlyOwner {
        _mintBatch(to, quantity);
    }

    function airdrop(address[] calldata recipients, uint256[] calldata quantities) external onlyOwner {
        if (recipients.length != quantities.length) revert Unauthorized();
        for (uint256 i; i < recipients.length;) {
            _mintBatch(recipients[i], quantities[i]);
            unchecked {
                ++i;
            }
        }
    }

    function _mintInternal(address to, uint256 quantity, bytes32[] memory proof) internal {
        // Time check
        if (mintStartTime != 0 && block.timestamp < mintStartTime) revert MintNotStarted();
        if (mintEndTime != 0 && block.timestamp > mintEndTime) revert MintEnded();

        // Supply check
        if (totalSupply + quantity > maxSupply) revert ExceedsMaxSupply();

        // Per-wallet check
        if (maxPerWallet != 0 && mintedCount[to] + quantity > maxPerWallet) {
            revert ExceedsMaxPerWallet();
        }

        // Per-tx check
        if (maxPerTx != 0 && quantity > maxPerTx) revert ExceedsMaxPerTx();

        // Whitelist check
        if (whitelistMintEnabled && merkleRoot != bytes32(0) && proof.length > 0) {
            if (!_verifyProof(proof, merkleRoot, keccak256(abi.encodePacked(to)))) {
                revert InvalidProof();
            }
        }

        // Payment check
        uint256 cost = mintPrice * quantity;
        if (msg.value != cost) revert IncorrectPayment();

        // Mint
        _mintBatch(to, quantity);
        mintedCount[to] += quantity;

        // Handle payment
        if (cost > 0) {
            _handlePayment(cost);
        }
    }

    function _mintBatch(address to, uint256 quantity) internal {
        if (to == address(0)) revert ZeroAddress();
        if (totalSupply + quantity > maxSupply) revert ExceedsMaxSupply();

        for (uint256 i; i < quantity;) {
            uint256 tokenId = totalSupply + 1;
            _mint(to, tokenId);
            unchecked {
                ++i;
            }
        }
    }

    function _mint(address to, uint256 tokenId) internal {
        _owners[tokenId] = to;
        _balances[to]++;
        totalSupply++;

        if (enumerable) {
            _addTokenToOwnerEnumeration(to, tokenId);
            _addTokenToAllTokensEnumeration(tokenId);
        }

        emit Transfer(address(0), to, tokenId);
    }

    // ============ Payment Handling ============

    function _handlePayment(uint256 amount) internal {
        if (revenueSplitEnabled && _splitAddresses.length > 0) {
            uint256 remaining = amount;
            for (uint256 i; i < _splitAddresses.length;) {
                uint256 share;
                if (i == _splitAddresses.length - 1) {
                    share = remaining; // Last one gets remainder
                } else {
                    share = (amount * _splitShares[i]) / 10000;
                    remaining -= share;
                }
                if (share > 0) {
                    (bool success,) = _splitAddresses[i].call{value: share}("");
                    if (!success) revert TransferFailed();
                }
                unchecked {
                    ++i;
                }
            }
        } else {
            (bool success,) = owner.call{value: amount}("");
            if (!success) revert TransferFailed();
        }
    }

    // ============ Reveal ============

    function reveal(string calldata _newBaseURI) external onlyOwner {
        if (!revealEnabled) revert FeatureDisabled();
        if (revealed) revert AlreadyRevealed();
        baseURI = _newBaseURI;
        revealed = true;
        emit Revealed(_newBaseURI);
    }

    // ============ Token URI ============

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_owners[tokenId] == address(0)) revert TokenNotExists();

        // Custom URI takes precedence
        if (updatableURI && bytes(_tokenURIs[tokenId]).length > 0) {
            return _tokenURIs[tokenId];
        }

        // Before reveal, show hidden URI
        if (revealEnabled && !revealed) {
            return hiddenURI;
        }

        // Standard: baseURI + tokenId
        return string(abi.encodePacked(baseURI, _toString(tokenId)));
    }

    function setTokenURI(uint256 tokenId, string calldata uri) external onlyOwner {
        if (!updatableURI) revert FeatureDisabled();
        if (_owners[tokenId] == address(0)) revert TokenNotExists();
        _tokenURIs[tokenId] = uri;
        emit TokenURIUpdated(tokenId, uri);
    }

    function setBaseURI(string calldata _newBaseURI) external onlyOwner {
        baseURI = _newBaseURI;
        emit BaseURIUpdated(_newBaseURI);
    }

    function setContractURI(string calldata _newContractURI) external onlyOwner {
        contractURI = _newContractURI;
    }

    function setHiddenURI(string calldata _newHiddenURI) external onlyOwner {
        hiddenURI = _newHiddenURI;
    }

    // ============ Mint Config ============

    function setMintConfig(
        uint256 _price,
        uint256 _maxPerWallet,
        uint256 _maxPerTx,
        uint256 _startTime,
        uint256 _endTime,
        bytes32 _merkleRoot
    ) external onlyOwner {
        mintPrice = _price;
        maxPerWallet = _maxPerWallet;
        maxPerTx = _maxPerTx;
        mintStartTime = _startTime;
        mintEndTime = _endTime;
        merkleRoot = _merkleRoot;
        emit MintConfigUpdated();
    }

    // ============ Pausable ============

    function pause() external onlyOwner {
        if (!pausable) revert FeatureDisabled();
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        if (!pausable) revert FeatureDisabled();
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ============ Burnable ============

    function burn(uint256 tokenId) external {
        if (!burnable) revert FeatureDisabled();
        if (!_isApprovedOrOwner(msg.sender, tokenId)) revert Unauthorized();
        _burn(tokenId);
    }

    function _burn(uint256 tokenId) internal {
        address tokenOwner = _owners[tokenId];

        // Clear approvals
        delete _tokenApprovals[tokenId];

        _balances[tokenOwner]--;
        delete _owners[tokenId];
        totalSupply--;

        if (enumerable) {
            _removeTokenFromOwnerEnumeration(tokenOwner, tokenId);
            _removeTokenFromAllTokensEnumeration(tokenId);
        }

        if (updatableURI) {
            delete _tokenURIs[tokenId];
        }

        emit Transfer(tokenOwner, address(0), tokenId);
    }

    // ============ ERC2981 Royalty ============

    function royaltyInfo(uint256, uint256 salePrice) external view returns (address, uint256) {
        if (!royaltyEnabled) return (address(0), 0);
        uint256 royaltyAmount = (salePrice * royaltyBps) / 10000;
        return (royaltyReceiver, royaltyAmount);
    }

    // ============ Enumerable ============

    function tokenOfOwnerByIndex(address _owner, uint256 index) external view returns (uint256) {
        if (!enumerable) revert FeatureDisabled();
        if (index >= _balances[_owner]) revert TokenNotExists();
        return _ownedTokens[_owner][index];
    }

    function tokenByIndex(uint256 index) external view returns (uint256) {
        if (!enumerable) revert FeatureDisabled();
        if (index >= _allTokens.length) revert TokenNotExists();
        return _allTokens[index];
    }

    function tokensOfOwner(address _owner) external view returns (uint256[] memory) {
        if (!enumerable) revert FeatureDisabled();
        uint256 balance = _balances[_owner];
        uint256[] memory tokens = new uint256[](balance);
        for (uint256 i; i < balance;) {
            tokens[i] = _ownedTokens[_owner][i];
            unchecked {
                ++i;
            }
        }
        return tokens;
    }

    // ============ Ownership ============

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function renounceOwnership() external onlyOwner {
        emit OwnershipTransferred(owner, address(0));
        owner = address(0);
    }

    // ============ Withdraw ============

    function withdraw() external onlyOwner {
        (bool success,) = owner.call{value: address(this).balance}("");
        if (!success) revert TransferFailed();
    }

    // ============ View Functions ============

    function supportsInterface(bytes4 interfaceId) external view returns (bool) {
        return interfaceId == 0x01ffc9a7 // ERC165
            || interfaceId == 0x80ac58cd // ERC721
            || interfaceId == 0x5b5e139f // ERC721Metadata
            || (enumerable && interfaceId == 0x780e9d63) // ERC721Enumerable
            || (royaltyEnabled && interfaceId == 0x2a55205a); // ERC2981
    }

    function getSplitConfig() external view returns (address[] memory, uint256[] memory) {
        return (_splitAddresses, _splitShares);
    }

    // ============ Internal Helpers ============

    function _transfer(address from, address to, uint256 tokenId) internal {
        if (ownerOf(tokenId) != from) revert Unauthorized();
        if (to == address(0)) revert ZeroAddress();

        delete _tokenApprovals[tokenId];

        _balances[from]--;
        _balances[to]++;
        _owners[tokenId] = to;

        if (enumerable) {
            _removeTokenFromOwnerEnumeration(from, tokenId);
            _addTokenToOwnerEnumeration(to, tokenId);
        }

        emit Transfer(from, to, tokenId);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address tokenOwner = ownerOf(tokenId);
        return (spender == tokenOwner || getApproved(tokenId) == spender || isApprovedForAll(tokenOwner, spender));
    }

    function _verifyProof(bytes32[] memory proof, bytes32 root, bytes32 leaf) internal pure returns (bool) {
        bytes32 computedHash = leaf;
        for (uint256 i; i < proof.length;) {
            bytes32 proofElement = proof[i];
            if (computedHash <= proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
            unchecked {
                ++i;
            }
        }
        return computedHash == root;
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    // Enumerable helpers
    function _addTokenToOwnerEnumeration(address to, uint256 tokenId) private {
        uint256 length = _balances[to] - 1;
        _ownedTokens[to][length] = tokenId;
        _ownedTokensIndex[tokenId] = length;
    }

    function _addTokenToAllTokensEnumeration(uint256 tokenId) private {
        _allTokensIndex[tokenId] = _allTokens.length;
        _allTokens.push(tokenId);
    }

    function _removeTokenFromOwnerEnumeration(address from, uint256 tokenId) private {
        uint256 lastTokenIndex = _balances[from];
        uint256 tokenIndex = _ownedTokensIndex[tokenId];

        if (tokenIndex != lastTokenIndex) {
            uint256 lastTokenId = _ownedTokens[from][lastTokenIndex];
            _ownedTokens[from][tokenIndex] = lastTokenId;
            _ownedTokensIndex[lastTokenId] = tokenIndex;
        }
        delete _ownedTokensIndex[tokenId];
        delete _ownedTokens[from][lastTokenIndex];
    }

    function _removeTokenFromAllTokensEnumeration(uint256 tokenId) private {
        uint256 lastTokenIndex = _allTokens.length - 1;
        uint256 tokenIndex = _allTokensIndex[tokenId];
        uint256 lastTokenId = _allTokens[lastTokenIndex];

        _allTokens[tokenIndex] = lastTokenId;
        _allTokensIndex[lastTokenId] = tokenIndex;

        delete _allTokensIndex[tokenId];
        _allTokens.pop();
    }

    // ============ Receive ============

    receive() external payable {}
}
