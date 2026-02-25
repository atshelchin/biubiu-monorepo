// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GeneratedERC1155
 * @notice Feature-rich ERC1155 multi-token template created by ERC1155Generator
 * @dev Optimized for game items, tickets, membership cards, achievements
 *
 * Features (bitmap):
 *   bit 0:  publicMint        - anyone can mint (with payment)
 *   bit 1:  minterRole        - multiple minter addresses (game servers)
 *   bit 2:  royalty           - ERC2981 royalty support
 *   bit 3:  pausable          - owner can pause transfers
 *   bit 4:  burnable          - token holders can burn
 *   bit 5:  supplyTracking    - track total supply per tokenId
 *   bit 6:  maxSupplyPerToken - each tokenId can have maxSupply limit
 *   bit 7:  updatableURI      - owner can update individual token URIs
 *   bit 8:  dynamicToken      - owner can create new tokenIds at runtime
 *   bit 9:  soulbound         - non-transferable (achievements/badges)
 *
 * URI Strategy:
 *   - Default: baseURI + tokenId + ".json"
 *   - Custom: tokenURIs[tokenId] takes precedence if set
 */
contract GeneratedERC1155 {
    // ============ Errors ============

    error Unauthorized();
    error ZeroAddress();
    error TokenNotExists();
    error ExceedsMaxSupply();
    error InsufficientBalance();
    error LengthMismatch();
    error IncorrectPayment();
    error IsPaused();
    error SoulboundToken();
    error FeatureDisabled();
    error TransferFailed();
    error InvalidRecipient();
    error TokenNotCreated();
    error TokenAlreadyExists();
    error ZeroAmount();

    // ============ Events ============

    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
    event TransferBatch(
        address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values
    );
    event ApprovalForAll(address indexed account, address indexed operator, bool approved);
    event URI(string value, uint256 indexed id);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event TokenTypeCreated(uint256 indexed tokenId, uint256 maxSupply, string uri);
    event Paused(address account);
    event Unpaused(address account);

    // ============ Feature Flags (immutable) ============

    uint16 public immutable features;

    bool public immutable publicMintEnabled;
    bool public immutable minterRoleEnabled;
    bool public immutable royaltyEnabled;
    bool public immutable pausable;
    bool public immutable burnable;
    bool public immutable supplyTracking;
    bool public immutable maxSupplyPerToken;
    bool public immutable updatableURI;
    bool public immutable dynamicToken;
    bool public immutable soulbound;

    // ============ Collection Config (immutable) ============

    string public name;
    string public symbol;

    // Royalty (ERC2981)
    address public immutable royaltyReceiver;
    uint96 public immutable royaltyBps;

    // ============ State Variables ============

    address public owner;
    bool public paused;
    string public baseURI;
    string public contractURI;

    // Mint price per token (can be set per tokenId or globally)
    uint256 public defaultMintPrice;
    mapping(uint256 => uint256) public mintPricePerToken;

    // ERC1155 storage
    mapping(uint256 => mapping(address => uint256)) internal _balances;
    mapping(address => mapping(address => bool)) internal _operatorApprovals;

    // Supply tracking
    mapping(uint256 => uint256) public totalSupply;
    mapping(uint256 => uint256) public maxSupply; // 0 = unlimited

    // Token existence (for dynamicToken feature)
    mapping(uint256 => bool) public tokenExists;
    uint256 public tokenTypeCount;

    // Custom URIs per token
    mapping(uint256 => string) internal _tokenURIs;

    // Minter role
    mapping(address => bool) public isMinter;

    // ============ Constructor ============

    constructor(
        string memory _name,
        string memory _symbol,
        address _owner,
        uint16 _features,
        string memory _baseURI,
        string memory _contractURI,
        address _royaltyReceiver,
        uint96 _royaltyBps,
        uint256[] memory _initialTokenIds,
        uint256[] memory _initialMaxSupplies
    ) {
        if (_owner == address(0)) revert ZeroAddress();

        name = _name;
        symbol = _symbol;
        owner = _owner;
        features = _features;
        baseURI = _baseURI;
        contractURI = _contractURI;

        // Set feature flags
        publicMintEnabled = (_features & (1 << 0)) != 0;
        minterRoleEnabled = (_features & (1 << 1)) != 0;
        royaltyEnabled = (_features & (1 << 2)) != 0;
        pausable = (_features & (1 << 3)) != 0;
        burnable = (_features & (1 << 4)) != 0;
        supplyTracking = (_features & (1 << 5)) != 0;
        maxSupplyPerToken = (_features & (1 << 6)) != 0;
        updatableURI = (_features & (1 << 7)) != 0;
        dynamicToken = (_features & (1 << 8)) != 0;
        soulbound = (_features & (1 << 9)) != 0;

        // Royalty
        royaltyReceiver = royaltyEnabled ? _royaltyReceiver : address(0);
        royaltyBps = royaltyEnabled ? _royaltyBps : 0;

        // Owner is always a minter
        if (minterRoleEnabled) {
            isMinter[_owner] = true;
        }

        // Create initial token types
        for (uint256 i; i < _initialTokenIds.length;) {
            uint256 tokenId = _initialTokenIds[i];
            tokenExists[tokenId] = true;
            if (maxSupplyPerToken && i < _initialMaxSupplies.length) {
                maxSupply[tokenId] = _initialMaxSupplies[i];
            }
            unchecked {
                ++i;
            }
        }
        tokenTypeCount = _initialTokenIds.length;

        emit OwnershipTransferred(address(0), _owner);
    }

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyMinter() {
        if (minterRoleEnabled) {
            if (!isMinter[msg.sender] && msg.sender != owner) revert Unauthorized();
        } else {
            if (msg.sender != owner) revert Unauthorized();
        }
        _;
    }

    modifier whenNotPaused() {
        if (pausable && paused) revert IsPaused();
        _;
    }

    modifier tokenMustExist(uint256 tokenId) {
        if (dynamicToken && !tokenExists[tokenId]) revert TokenNotCreated();
        _;
    }

    // ============ ERC1155 Core ============

    function balanceOf(address account, uint256 id) external view returns (uint256) {
        return _balances[id][account];
    }

    function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids)
        external
        view
        returns (uint256[] memory)
    {
        if (accounts.length != ids.length) revert LengthMismatch();
        uint256[] memory batchBalances = new uint256[](accounts.length);
        for (uint256 i; i < accounts.length;) {
            batchBalances[i] = _balances[ids[i]][accounts[i]];
            unchecked {
                ++i;
            }
        }
        return batchBalances;
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address account, address operator) public view returns (bool) {
        return _operatorApprovals[account][operator];
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data)
        external
        whenNotPaused
    {
        if (soulbound) revert SoulboundToken();
        if (from != msg.sender && !isApprovedForAll(from, msg.sender)) revert Unauthorized();
        _transfer(from, to, id, amount);
        _checkOnERC1155Received(msg.sender, from, to, id, amount, data);
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata data
    ) external whenNotPaused {
        if (soulbound) revert SoulboundToken();
        if (from != msg.sender && !isApprovedForAll(from, msg.sender)) revert Unauthorized();
        _batchTransfer(from, to, ids, amounts);
        _checkOnERC1155BatchReceived(msg.sender, from, to, ids, amounts, data);
    }

    // ============ Dynamic Token Creation ============

    /**
     * @notice Create a new token type (only if dynamicToken enabled)
     * @param tokenId The token ID to create
     * @param _maxSupply Maximum supply (0 = unlimited)
     * @param _uri Custom URI for this token (empty = use baseURI)
     */
    function createTokenType(uint256 tokenId, uint256 _maxSupply, string calldata _uri) external onlyOwner {
        if (!dynamicToken) revert FeatureDisabled();
        if (tokenExists[tokenId]) revert TokenAlreadyExists();

        tokenExists[tokenId] = true;
        tokenTypeCount++;

        if (maxSupplyPerToken && _maxSupply > 0) {
            maxSupply[tokenId] = _maxSupply;
        }

        if (bytes(_uri).length > 0) {
            _tokenURIs[tokenId] = _uri;
        }

        emit TokenTypeCreated(tokenId, _maxSupply, _uri);
    }

    /**
     * @notice Batch create token types
     */
    function createTokenTypeBatch(uint256[] calldata tokenIds, uint256[] calldata maxSupplies, string[] calldata uris)
        external
        onlyOwner
    {
        if (!dynamicToken) revert FeatureDisabled();

        for (uint256 i; i < tokenIds.length;) {
            uint256 tokenId = tokenIds[i];
            if (tokenExists[tokenId]) revert TokenAlreadyExists();

            tokenExists[tokenId] = true;

            if (maxSupplyPerToken && i < maxSupplies.length && maxSupplies[i] > 0) {
                maxSupply[tokenId] = maxSupplies[i];
            }

            if (i < uris.length && bytes(uris[i]).length > 0) {
                _tokenURIs[tokenId] = uris[i];
            }

            emit TokenTypeCreated(tokenId, i < maxSupplies.length ? maxSupplies[i] : 0, i < uris.length ? uris[i] : "");

            unchecked {
                ++i;
            }
        }

        tokenTypeCount += tokenIds.length;
    }

    // ============ Minter Role ============

    function addMinter(address minter) external onlyOwner {
        if (!minterRoleEnabled) revert FeatureDisabled();
        if (minter == address(0)) revert ZeroAddress();
        isMinter[minter] = true;
        emit MinterAdded(minter);
    }

    function removeMinter(address minter) external onlyOwner {
        if (!minterRoleEnabled) revert FeatureDisabled();
        isMinter[minter] = false;
        emit MinterRemoved(minter);
    }

    function addMinterBatch(address[] calldata minters) external onlyOwner {
        if (!minterRoleEnabled) revert FeatureDisabled();
        for (uint256 i; i < minters.length;) {
            if (minters[i] != address(0)) {
                isMinter[minters[i]] = true;
                emit MinterAdded(minters[i]);
            }
            unchecked {
                ++i;
            }
        }
    }

    // ============ Mint Functions ============

    /**
     * @notice Public mint (if enabled)
     */
    function mint(uint256 tokenId, uint256 amount) external payable whenNotPaused tokenMustExist(tokenId) {
        if (!publicMintEnabled) revert FeatureDisabled();
        if (amount == 0) revert ZeroAmount();

        // Check payment
        uint256 price = mintPricePerToken[tokenId];
        if (price == 0) price = defaultMintPrice;
        uint256 cost = price * amount;
        if (msg.value != cost) revert IncorrectPayment();

        _mint(msg.sender, tokenId, amount);

        // Send payment to owner
        if (cost > 0) {
            (bool success,) = owner.call{value: cost}("");
            if (!success) revert TransferFailed();
        }
    }

    /**
     * @notice Minter mint (game server, owner)
     */
    function minterMint(address to, uint256 tokenId, uint256 amount) external onlyMinter tokenMustExist(tokenId) {
        if (amount == 0) revert ZeroAmount();
        _mint(to, tokenId, amount);
    }

    /**
     * @notice Batch mint to single recipient
     */
    function minterMintBatch(address to, uint256[] calldata tokenIds, uint256[] calldata amounts) external onlyMinter {
        if (tokenIds.length != amounts.length) revert LengthMismatch();
        _mintBatch(to, tokenIds, amounts);
    }

    /**
     * @notice Airdrop single tokenId to multiple recipients
     */
    function airdrop(uint256 tokenId, address[] calldata recipients, uint256[] calldata amounts)
        external
        onlyMinter
        tokenMustExist(tokenId)
    {
        if (recipients.length != amounts.length) revert LengthMismatch();

        for (uint256 i; i < recipients.length;) {
            if (amounts[i] > 0) {
                _mint(recipients[i], tokenId, amounts[i]);
            }
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Airdrop equal amounts to all recipients
     */
    function airdropEqual(uint256 tokenId, address[] calldata recipients, uint256 amount)
        external
        onlyMinter
        tokenMustExist(tokenId)
    {
        if (amount == 0) revert ZeroAmount();

        for (uint256 i; i < recipients.length;) {
            _mint(recipients[i], tokenId, amount);
            unchecked {
                ++i;
            }
        }
    }

    // ============ Burn Functions ============

    function burn(uint256 tokenId, uint256 amount) external {
        if (!burnable) revert FeatureDisabled();
        _burn(msg.sender, tokenId, amount);
    }

    function burnBatch(uint256[] calldata tokenIds, uint256[] calldata amounts) external {
        if (!burnable) revert FeatureDisabled();
        if (tokenIds.length != amounts.length) revert LengthMismatch();
        _burnBatch(msg.sender, tokenIds, amounts);
    }

    /**
     * @notice Minter can burn from any address (for game item consumption)
     * @dev Requires approval or minter calling on behalf
     */
    function burnFrom(address from, uint256 tokenId, uint256 amount) external onlyMinter {
        if (!burnable) revert FeatureDisabled();
        _burn(from, tokenId, amount);
    }

    // ============ URI Functions ============

    function uri(uint256 tokenId) external view returns (string memory) {
        // Custom URI takes precedence
        if (bytes(_tokenURIs[tokenId]).length > 0) {
            return _tokenURIs[tokenId];
        }

        // Default: baseURI + tokenId + ".json"
        return string(abi.encodePacked(baseURI, _toString(tokenId), ".json"));
    }

    function setBaseURI(string calldata _newBaseURI) external onlyOwner {
        baseURI = _newBaseURI;
    }

    function setContractURI(string calldata _newContractURI) external onlyOwner {
        contractURI = _newContractURI;
    }

    function setTokenURI(uint256 tokenId, string calldata _uri) external onlyOwner {
        if (!updatableURI) revert FeatureDisabled();
        _tokenURIs[tokenId] = _uri;
        emit URI(_uri, tokenId);
    }

    function setTokenURIBatch(uint256[] calldata tokenIds, string[] calldata uris) external onlyOwner {
        if (!updatableURI) revert FeatureDisabled();
        if (tokenIds.length != uris.length) revert LengthMismatch();

        for (uint256 i; i < tokenIds.length;) {
            _tokenURIs[tokenIds[i]] = uris[i];
            emit URI(uris[i], tokenIds[i]);
            unchecked {
                ++i;
            }
        }
    }

    // ============ Mint Config ============

    function setDefaultMintPrice(uint256 price) external onlyOwner {
        defaultMintPrice = price;
    }

    function setMintPriceForToken(uint256 tokenId, uint256 price) external onlyOwner {
        mintPricePerToken[tokenId] = price;
    }

    function setMaxSupply(uint256 tokenId, uint256 _maxSupply) external onlyOwner {
        if (!maxSupplyPerToken) revert FeatureDisabled();
        // Can only decrease or set if currently 0
        if (maxSupply[tokenId] != 0 && _maxSupply > maxSupply[tokenId]) revert Unauthorized();
        maxSupply[tokenId] = _maxSupply;
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

    // ============ ERC2981 Royalty ============

    function royaltyInfo(uint256, uint256 salePrice) external view returns (address, uint256) {
        if (!royaltyEnabled) return (address(0), 0);
        uint256 royaltyAmount = (salePrice * royaltyBps) / 10000;
        return (royaltyReceiver, royaltyAmount);
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
            || interfaceId == 0xd9b67a26 // ERC1155
            || interfaceId == 0x0e89341c // ERC1155MetadataURI
            || (royaltyEnabled && interfaceId == 0x2a55205a); // ERC2981
    }

    // ============ Internal Functions ============

    function _mint(address to, uint256 tokenId, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();

        // Check max supply
        if (maxSupplyPerToken && maxSupply[tokenId] > 0) {
            if (totalSupply[tokenId] + amount > maxSupply[tokenId]) {
                revert ExceedsMaxSupply();
            }
        }

        _balances[tokenId][to] += amount;

        if (supplyTracking) {
            totalSupply[tokenId] += amount;
        }

        emit TransferSingle(msg.sender, address(0), to, tokenId, amount);
    }

    function _mintBatch(address to, uint256[] calldata tokenIds, uint256[] calldata amounts) internal {
        if (to == address(0)) revert ZeroAddress();

        for (uint256 i; i < tokenIds.length;) {
            uint256 tokenId = tokenIds[i];
            uint256 amount = amounts[i];

            if (dynamicToken && !tokenExists[tokenId]) revert TokenNotCreated();

            if (maxSupplyPerToken && maxSupply[tokenId] > 0) {
                if (totalSupply[tokenId] + amount > maxSupply[tokenId]) {
                    revert ExceedsMaxSupply();
                }
            }

            _balances[tokenId][to] += amount;

            if (supplyTracking) {
                totalSupply[tokenId] += amount;
            }

            unchecked {
                ++i;
            }
        }

        emit TransferBatch(msg.sender, address(0), to, tokenIds, amounts);
    }

    function _burn(address from, uint256 tokenId, uint256 amount) internal {
        if (_balances[tokenId][from] < amount) revert InsufficientBalance();

        _balances[tokenId][from] -= amount;

        if (supplyTracking) {
            totalSupply[tokenId] -= amount;
        }

        emit TransferSingle(msg.sender, from, address(0), tokenId, amount);
    }

    function _burnBatch(address from, uint256[] calldata tokenIds, uint256[] calldata amounts) internal {
        for (uint256 i; i < tokenIds.length;) {
            uint256 tokenId = tokenIds[i];
            uint256 amount = amounts[i];

            if (_balances[tokenId][from] < amount) revert InsufficientBalance();
            _balances[tokenId][from] -= amount;

            if (supplyTracking) {
                totalSupply[tokenId] -= amount;
            }

            unchecked {
                ++i;
            }
        }

        emit TransferBatch(msg.sender, from, address(0), tokenIds, amounts);
    }

    function _transfer(address from, address to, uint256 tokenId, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();
        if (_balances[tokenId][from] < amount) revert InsufficientBalance();

        _balances[tokenId][from] -= amount;
        _balances[tokenId][to] += amount;

        emit TransferSingle(msg.sender, from, to, tokenId, amount);
    }

    function _batchTransfer(address from, address to, uint256[] calldata tokenIds, uint256[] calldata amounts)
        internal
    {
        if (to == address(0)) revert ZeroAddress();
        if (tokenIds.length != amounts.length) revert LengthMismatch();

        for (uint256 i; i < tokenIds.length;) {
            uint256 tokenId = tokenIds[i];
            uint256 amount = amounts[i];

            if (_balances[tokenId][from] < amount) revert InsufficientBalance();
            _balances[tokenId][from] -= amount;
            _balances[tokenId][to] += amount;

            unchecked {
                ++i;
            }
        }

        emit TransferBatch(msg.sender, from, to, tokenIds, amounts);
    }

    function _checkOnERC1155Received(
        address operator,
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata data
    ) private {
        if (to.code.length > 0) {
            (bool success, bytes memory returnData) = to.call(
                abi.encodeWithSelector(
                    0xf23a6e61, // onERC1155Received
                    operator,
                    from,
                    id,
                    amount,
                    data
                )
            );
            if (!success || (returnData.length >= 32 && abi.decode(returnData, (bytes4)) != 0xf23a6e61)) {
                revert InvalidRecipient();
            }
        }
    }

    function _checkOnERC1155BatchReceived(
        address operator,
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata data
    ) private {
        if (to.code.length > 0) {
            (bool success, bytes memory returnData) = to.call(
                abi.encodeWithSelector(
                    0xbc197c81, // onERC1155BatchReceived
                    operator,
                    from,
                    ids,
                    amounts,
                    data
                )
            );
            if (!success || (returnData.length >= 32 && abi.decode(returnData, (bytes4)) != 0xbc197c81)) {
                revert InvalidRecipient();
            }
        }
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

    // ============ Receive ============

    receive() external payable {}
}
