// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC2771Context} from "../libraries/ERC2771Context.sol";
import {GeneratedERC20} from "./GeneratedERC20.sol";

/**
 * @title ERC20Generator
 * @notice Factory for creating customizable ERC20 tokens
 * @dev Called via BiuBiuPremium.callTool(), uses ERC2771Context for real sender
 *
 * Features bitmap:
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
contract ERC20Generator is ERC2771Context {
    // ============ Errors ============

    error InvalidConfig();

    // ============ Events ============

    /// @notice Emitted when a new token is created
    event TokenCreated(
        address indexed token, address indexed owner, string name, string symbol, uint256 totalSupply, uint16 features
    );

    // ============ Feature Constants ============

    uint16 public constant FEATURE_MINTABLE = 1 << 0;
    uint16 public constant FEATURE_BURNABLE = 1 << 1;
    uint16 public constant FEATURE_PAUSABLE = 1 << 2;
    uint16 public constant FEATURE_CAPPED = 1 << 3;
    uint16 public constant FEATURE_PERMIT = 1 << 4;
    uint16 public constant FEATURE_BLACKLIST = 1 << 5;
    uint16 public constant FEATURE_WHITELIST = 1 << 6;
    uint16 public constant FEATURE_TOKEN_RECOVER = 1 << 7;
    uint16 public constant FEATURE_ANTI_WHALE = 1 << 8;
    uint16 public constant FEATURE_DEFLATIONARY = 1 << 9;
    uint16 public constant FEATURE_BATCH = 1 << 10;
    uint16 public constant FEATURE_CALLBACK = 1 << 11;

    // ============ Storage ============

    /// @notice All tokens created by this factory
    address[] public tokens;

    /// @notice Tokens created by a specific address
    mapping(address => address[]) public tokensByCreator;

    // ============ Constructor ============

    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {}

    // ============ Create Token ============

    /**
     * @notice Create a new ERC20 token with custom features
     * @param name Token name
     * @param symbol Token symbol
     * @param decimals Token decimals (usually 18)
     * @param totalSupply Initial total supply (in smallest units)
     * @param features Bitmap of enabled features
     * @param maxSupply Maximum supply (if capped feature enabled)
     * @param maxTxAmount Max transaction amount (if antiWhale enabled)
     * @param maxWalletAmount Max wallet balance (if antiWhale enabled)
     * @param burnBps Auto-burn basis points per transfer (if deflationary, 100 = 1%)
     * @return token Address of the newly created token
     */
    function createToken(
        string calldata name,
        string calldata symbol,
        uint8 decimals,
        uint256 totalSupply,
        uint16 features,
        uint256 maxSupply,
        uint256 maxTxAmount,
        uint256 maxWalletAmount,
        uint16 burnBps
    ) external returns (address token) {
        address sender = _msgSender();

        // Validate config
        if (bytes(name).length == 0 || bytes(symbol).length == 0) revert InvalidConfig();

        // If capped, maxSupply must be >= totalSupply
        if ((features & FEATURE_CAPPED) != 0) {
            if (maxSupply < totalSupply) revert InvalidConfig();
        }

        // If antiWhale, limits must be set
        if ((features & FEATURE_ANTI_WHALE) != 0) {
            if (maxTxAmount == 0 || maxWalletAmount == 0) revert InvalidConfig();
        }

        // If deflationary, burnBps must be valid (1-9999)
        if ((features & FEATURE_DEFLATIONARY) != 0) {
            if (burnBps == 0 || burnBps >= 10000) revert InvalidConfig();
        }

        // Deploy token
        token = address(
            new GeneratedERC20(
                name,
                symbol,
                decimals,
                totalSupply,
                sender, // owner is the real sender
                features,
                maxSupply,
                maxTxAmount,
                maxWalletAmount,
                burnBps
            )
        );

        // Record
        tokens.push(token);
        tokensByCreator[sender].push(token);

        emit TokenCreated(token, sender, name, symbol, totalSupply, features);
    }

    /**
     * @notice Create a simple ERC20 token with basic features
     * @param name Token name
     * @param symbol Token symbol
     * @param decimals Token decimals
     * @param totalSupply Initial total supply
     * @return token Address of the newly created token
     */
    function createSimpleToken(string calldata name, string calldata symbol, uint8 decimals, uint256 totalSupply)
        external
        returns (address token)
    {
        address sender = _msgSender();

        if (bytes(name).length == 0 || bytes(symbol).length == 0) revert InvalidConfig();

        // Simple token with no extra features
        token = address(
            new GeneratedERC20(
                name,
                symbol,
                decimals,
                totalSupply,
                sender,
                0, // no features
                0, // no maxSupply
                0, // no maxTx
                0, // no maxWallet
                0 // no burn
            )
        );

        tokens.push(token);
        tokensByCreator[sender].push(token);

        emit TokenCreated(token, sender, name, symbol, totalSupply, 0);
    }

    // ============ View Functions ============

    /// @notice Get total number of tokens created
    function totalTokens() external view returns (uint256) {
        return tokens.length;
    }

    /// @notice Get tokens created by a specific address
    function getTokensByCreator(address creator) external view returns (address[] memory) {
        return tokensByCreator[creator];
    }

    /// @notice Get tokens created by a specific address (paginated)
    function getTokensByCreatorPaginated(address creator, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory result)
    {
        address[] storage creatorTokens = tokensByCreator[creator];
        uint256 len = creatorTokens.length;

        if (offset >= len) return new address[](0);

        uint256 end = offset + limit;
        if (end > len) end = len;

        result = new address[](end - offset);
        for (uint256 i = offset; i < end;) {
            result[i - offset] = creatorTokens[i];
            unchecked {
                ++i;
            }
        }
    }

    /// @notice Get all tokens (paginated)
    function getTokensPaginated(uint256 offset, uint256 limit) external view returns (address[] memory result) {
        uint256 len = tokens.length;

        if (offset >= len) return new address[](0);

        uint256 end = offset + limit;
        if (end > len) end = len;

        result = new address[](end - offset);
        for (uint256 i = offset; i < end;) {
            result[i - offset] = tokens[i];
            unchecked {
                ++i;
            }
        }
    }
}
