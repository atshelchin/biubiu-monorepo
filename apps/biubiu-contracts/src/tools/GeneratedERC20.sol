// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GeneratedERC20
 * @notice Feature-rich ERC20 token template created by ERC20Generator
 * @dev All features controlled by immutable flags set at deployment
 *
 * Features (bitmap):
 *   bit 0:  mintable      - owner can mint
 *   bit 1:  burnable      - users can burn their tokens
 *   bit 2:  pausable      - owner can pause transfers
 *   bit 3:  capped        - has maxSupply limit
 *   bit 4:  permit        - ERC2612 gasless approvals
 *   bit 5:  blacklist     - owner can blacklist addresses
 *   bit 6:  whitelist     - only whitelisted can transfer (when enabled)
 *   bit 7:  tokenRecover  - owner can recover stuck tokens
 *   bit 8:  antiWhale     - maxTx and maxWallet limits
 *   bit 9:  deflationary  - auto-burn on transfer
 *   bit 10: batch         - batch transfer support
 *   bit 11: callback      - ERC1363 transferAndCall
 */
contract GeneratedERC20 {
    // ============ Errors ============

    error Unauthorized();
    error ZeroAddress();
    error InsufficientBalance();
    error InsufficientAllowance();
    error IsPaused();
    error Blacklisted();
    error NotWhitelisted();
    error ExceedsMaxSupply();
    error ExceedsMaxTx();
    error ExceedsMaxWallet();
    error FeatureDisabled();
    error InvalidSignature();
    error ExpiredDeadline();
    error LengthMismatch();
    error CallbackFailed();

    // ============ Events ============

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event BlacklistUpdated(address indexed account, bool blacklisted);
    event WhitelistUpdated(address indexed account, bool whitelisted);
    event WhitelistModeChanged(bool enabled);
    event Paused(address account);
    event Unpaused(address account);

    // ============ Feature Flags (immutable) ============

    uint16 public immutable features;

    bool public immutable mintable;
    bool public immutable burnable;
    bool public immutable pausable;
    bool public immutable capped;
    bool public immutable permitEnabled;
    bool public immutable blacklistEnabled;
    bool public immutable whitelistEnabled;
    bool public immutable tokenRecoverEnabled;
    bool public immutable antiWhaleEnabled;
    bool public immutable deflationary;
    bool public immutable batchEnabled;
    bool public immutable callbackEnabled;

    // ============ Token Metadata (immutable) ============

    string public name;
    string public symbol;
    uint8 public immutable decimals;

    // ============ Token Config (immutable) ============

    uint256 public immutable maxSupply;
    uint256 public immutable maxTxAmount;
    uint256 public immutable maxWalletAmount;
    uint16 public immutable burnBps; // basis points (100 = 1%)

    // ============ ERC2612 Permit ============

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    mapping(address => uint256) public nonces;

    // ============ State Variables ============

    uint256 public totalSupply;
    address public owner;
    bool public paused;
    bool public whitelistMode; // when true, only whitelisted can transfer

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public isBlacklisted;
    mapping(address => bool) public isWhitelisted;
    mapping(address => bool) public isExcludedFromLimits;

    // ============ Constructor ============

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        uint256 _totalSupply,
        address _owner,
        uint16 _features,
        uint256 _maxSupply,
        uint256 _maxTxAmount,
        uint256 _maxWalletAmount,
        uint16 _burnBps
    ) {
        if (_owner == address(0)) revert ZeroAddress();

        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        owner = _owner;
        features = _features;

        // Set feature flags
        mintable = (_features & (1 << 0)) != 0;
        burnable = (_features & (1 << 1)) != 0;
        pausable = (_features & (1 << 2)) != 0;
        capped = (_features & (1 << 3)) != 0;
        permitEnabled = (_features & (1 << 4)) != 0;
        blacklistEnabled = (_features & (1 << 5)) != 0;
        whitelistEnabled = (_features & (1 << 6)) != 0;
        tokenRecoverEnabled = (_features & (1 << 7)) != 0;
        antiWhaleEnabled = (_features & (1 << 8)) != 0;
        deflationary = (_features & (1 << 9)) != 0;
        batchEnabled = (_features & (1 << 10)) != 0;
        callbackEnabled = (_features & (1 << 11)) != 0;

        // Set limits
        maxSupply = capped ? _maxSupply : type(uint256).max;
        maxTxAmount = antiWhaleEnabled ? _maxTxAmount : type(uint256).max;
        maxWalletAmount = antiWhaleEnabled ? _maxWalletAmount : type(uint256).max;
        burnBps = deflationary ? _burnBps : 0;

        // Exclude owner from limits
        isExcludedFromLimits[_owner] = true;
        isWhitelisted[_owner] = true;

        // ERC2612 domain separator
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(_name)),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );

        // Mint initial supply
        if (_totalSupply > 0) {
            if (capped && _totalSupply > maxSupply) revert ExceedsMaxSupply();
            totalSupply = _totalSupply;
            balanceOf[_owner] = _totalSupply;
            emit Transfer(address(0), _owner, _totalSupply);
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

    // ============ ERC20 Core ============

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external whenNotPaused returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external whenNotPaused returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    // ============ Internal Transfer ============

    function _transfer(address from, address to, uint256 amount) internal {
        if (from == address(0) || to == address(0)) revert ZeroAddress();

        // Blacklist check
        if (blacklistEnabled) {
            if (isBlacklisted[from] || isBlacklisted[to]) revert Blacklisted();
        }

        // Whitelist check
        if (whitelistEnabled && whitelistMode) {
            if (!isWhitelisted[from] || !isWhitelisted[to]) revert NotWhitelisted();
        }

        // Anti-whale checks
        if (antiWhaleEnabled && !isExcludedFromLimits[from] && !isExcludedFromLimits[to]) {
            if (amount > maxTxAmount) revert ExceedsMaxTx();
            if (balanceOf[to] + amount > maxWalletAmount) revert ExceedsMaxWallet();
        }

        if (balanceOf[from] < amount) revert InsufficientBalance();

        uint256 burnAmount;
        uint256 transferAmount = amount;

        // Deflationary burn
        if (deflationary && burnBps > 0 && !isExcludedFromLimits[from]) {
            burnAmount = (amount * burnBps) / 10000;
            transferAmount = amount - burnAmount;
        }

        unchecked {
            balanceOf[from] -= amount;
            balanceOf[to] += transferAmount;
        }

        emit Transfer(from, to, transferAmount);

        if (burnAmount > 0) {
            totalSupply -= burnAmount;
            emit Transfer(from, address(0), burnAmount);
        }
    }

    // ============ Mintable ============

    function mint(address to, uint256 amount) external onlyOwner {
        if (!mintable) revert FeatureDisabled();
        if (to == address(0)) revert ZeroAddress();
        if (capped && totalSupply + amount > maxSupply) revert ExceedsMaxSupply();

        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    // ============ Burnable ============

    function burn(uint256 amount) external {
        if (!burnable) revert FeatureDisabled();
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();

        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }

    function burnFrom(address from, uint256 amount) external {
        if (!burnable) revert FeatureDisabled();

        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - amount;
        }
        if (balanceOf[from] < amount) revert InsufficientBalance();

        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
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

    // ============ Blacklist ============

    function setBlacklist(address account, bool blacklisted) external onlyOwner {
        if (!blacklistEnabled) revert FeatureDisabled();
        isBlacklisted[account] = blacklisted;
        emit BlacklistUpdated(account, blacklisted);
    }

    function setBlacklistBatch(address[] calldata accounts, bool blacklisted) external onlyOwner {
        if (!blacklistEnabled) revert FeatureDisabled();
        for (uint256 i; i < accounts.length;) {
            isBlacklisted[accounts[i]] = blacklisted;
            emit BlacklistUpdated(accounts[i], blacklisted);
            unchecked {
                ++i;
            }
        }
    }

    // ============ Whitelist ============

    function setWhitelistMode(bool enabled) external onlyOwner {
        if (!whitelistEnabled) revert FeatureDisabled();
        whitelistMode = enabled;
        emit WhitelistModeChanged(enabled);
    }

    function setWhitelist(address account, bool whitelisted) external onlyOwner {
        if (!whitelistEnabled) revert FeatureDisabled();
        isWhitelisted[account] = whitelisted;
        emit WhitelistUpdated(account, whitelisted);
    }

    function setWhitelistBatch(address[] calldata accounts, bool whitelisted) external onlyOwner {
        if (!whitelistEnabled) revert FeatureDisabled();
        for (uint256 i; i < accounts.length;) {
            isWhitelisted[accounts[i]] = whitelisted;
            emit WhitelistUpdated(accounts[i], whitelisted);
            unchecked {
                ++i;
            }
        }
    }

    // ============ Anti-Whale ============

    function setExcludedFromLimits(address account, bool excluded) external onlyOwner {
        if (!antiWhaleEnabled) revert FeatureDisabled();
        isExcludedFromLimits[account] = excluded;
    }

    // ============ Token Recover ============

    function recoverToken(address token, uint256 amount) external onlyOwner {
        if (!tokenRecoverEnabled) revert FeatureDisabled();
        if (token == address(this)) revert Unauthorized(); // Can't recover own token

        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, owner, amount));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert InsufficientBalance();
        }
    }

    function recoverETH() external onlyOwner {
        if (!tokenRecoverEnabled) revert FeatureDisabled();
        (bool success,) = owner.call{value: address(this).balance}("");
        if (!success) revert InsufficientBalance();
    }

    // ============ Batch Transfer ============

    function batchTransfer(address[] calldata recipients, uint256[] calldata amounts) external whenNotPaused {
        if (!batchEnabled) revert FeatureDisabled();
        if (recipients.length != amounts.length) revert LengthMismatch();

        for (uint256 i; i < recipients.length;) {
            _transfer(msg.sender, recipients[i], amounts[i]);
            unchecked {
                ++i;
            }
        }
    }

    function batchTransferEqual(address[] calldata recipients, uint256 amount) external whenNotPaused {
        if (!batchEnabled) revert FeatureDisabled();

        for (uint256 i; i < recipients.length;) {
            _transfer(msg.sender, recipients[i], amount);
            unchecked {
                ++i;
            }
        }
    }

    // ============ ERC2612 Permit ============

    function permit(address _owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
    {
        if (!permitEnabled) revert FeatureDisabled();
        if (block.timestamp > deadline) revert ExpiredDeadline();

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, _owner, spender, value, nonces[_owner]++, deadline))
            )
        );

        address recoveredAddress = ecrecover(digest, v, r, s);
        if (recoveredAddress == address(0) || recoveredAddress != _owner) {
            revert InvalidSignature();
        }

        allowance[_owner][spender] = value;
        emit Approval(_owner, spender, value);
    }

    // ============ ERC1363 Callback ============

    function transferAndCall(address to, uint256 amount) external whenNotPaused returns (bool) {
        if (!callbackEnabled) revert FeatureDisabled();
        return transferAndCall(to, amount, "");
    }

    function transferAndCall(address to, uint256 amount, bytes memory data) public whenNotPaused returns (bool) {
        if (!callbackEnabled) revert FeatureDisabled();
        _transfer(msg.sender, to, amount);

        if (to.code.length > 0) {
            (bool success, bytes memory returnData) = to.call(
                abi.encodeWithSelector(
                    0x88a7ca5c, // onTransferReceived(address,address,uint256,bytes)
                    msg.sender,
                    msg.sender,
                    amount,
                    data
                )
            );
            if (!success) revert CallbackFailed();
            if (returnData.length >= 4) {
                bytes4 retval = abi.decode(returnData, (bytes4));
                if (retval != 0x88a7ca5c) revert CallbackFailed();
            }
        }
        return true;
    }

    function approveAndCall(address spender, uint256 amount) external returns (bool) {
        if (!callbackEnabled) revert FeatureDisabled();
        return approveAndCall(spender, amount, "");
    }

    function approveAndCall(address spender, uint256 amount, bytes memory data) public returns (bool) {
        if (!callbackEnabled) revert FeatureDisabled();
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);

        if (spender.code.length > 0) {
            (bool success, bytes memory returnData) = spender.call(
                abi.encodeWithSelector(
                    0x7b04a2d0, // onApprovalReceived(address,uint256,bytes)
                    msg.sender,
                    amount,
                    data
                )
            );
            if (!success) revert CallbackFailed();
            if (returnData.length >= 4) {
                bytes4 retval = abi.decode(returnData, (bytes4));
                if (retval != 0x7b04a2d0) revert CallbackFailed();
            }
        }
        return true;
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

    // ============ Receive ETH ============

    receive() external payable {}
}
