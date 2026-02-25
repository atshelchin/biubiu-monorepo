// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IFlashLoanAdapter} from "../../interfaces/IFlashLoanAdapter.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {SafeERC20} from "../../libraries/SafeERC20.sol";

/**
 * @title ISoloMargin
 * @notice dYdX SoloMargin interface for flash loans
 */
interface ISoloMargin {
    struct ActionArgs {
        ActionType actionType;
        uint256 accountId;
        Types.AssetAmount amount;
        uint256 primaryMarketId;
        uint256 secondaryMarketId;
        address otherAddress;
        uint256 otherAccountId;
        bytes data;
    }

    struct AccountInfo {
        address owner;
        uint256 number;
    }

    enum ActionType {
        Deposit,
        Withdraw,
        Transfer,
        Buy,
        Sell,
        Trade,
        Liquidate,
        Vaporize,
        Call
    }

    function operate(AccountInfo[] calldata accounts, ActionArgs[] calldata actions) external;
    function getMarketTokenAddress(uint256 marketId) external view returns (address);
    function getNumMarkets() external view returns (uint256);
}

/**
 * @title Types
 * @notice dYdX types library
 */
library Types {
    enum AssetDenomination {
        Wei,
        Par
    }

    enum AssetReference {
        Delta,
        Target
    }

    struct AssetAmount {
        bool sign;
        AssetDenomination denomination;
        AssetReference ref;
        uint256 value;
    }
}

/**
 * @title ICallee
 * @notice dYdX callee interface for flash loans
 */
interface ICallee {
    function callFunction(address sender, ISoloMargin.AccountInfo calldata accountInfo, bytes calldata data) external;
}

/**
 * @title IFlashLoanBorrowerModule
 * @notice Standard callback interface for FlashLoanBorrowerModule
 */
interface IFlashLoanBorrowerModule {
    function handleFlashLoanCallback(
        address safe,
        address adapter,
        address[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory fees,
        bytes memory params
    ) external;
}

/**
 * @title DYDXAdapter
 * @notice Flash loan adapter for dYdX SoloMargin protocol
 * @dev Handles dYdX specific flash loan initiation and repayment
 *
 * dYdX Flow:
 *   1. Call soloMargin.operate() with Withdraw + Call + Deposit actions
 *   2. SoloMargin withdraws tokens to this adapter
 *   3. SoloMargin calls this adapter's callFunction()
 *   4. Adapter forwards to module.handleFlashLoanCallback()
 *   5. SoloMargin deposits tokens back (must have approved)
 *
 * Note: dYdX flash loans are fee-free (just need to repay principal + 2 wei)
 *       Uses market IDs instead of token addresses
 */
contract DYDXAdapter is IFlashLoanAdapter, ICallee {
    using SafeERC20 for IERC20;

    // ============ Errors ============

    error ZeroAddress();
    error OnlySingleToken();
    error OnlySoloMargin();
    error NotInFlashLoan();
    error MarketNotFound();

    // ============ Immutables ============

    /// @notice dYdX SoloMargin contract
    address public immutable soloMargin;

    // ============ Storage ============

    /// @notice Token address to market ID mapping
    mapping(address => uint256) public tokenToMarketId;

    /// @notice Temporary storage for flash loan context
    address private _currentModule;
    address private _currentSafe;
    address private _currentToken;
    uint256 private _currentAmount;

    // ============ Constructor ============

    constructor(address _soloMargin) {
        if (_soloMargin == address(0)) revert ZeroAddress();
        soloMargin = _soloMargin;

        // Cache market IDs for known tokens
        _cacheMarketIds();
    }

    function _cacheMarketIds() internal {
        uint256 numMarkets = ISoloMargin(soloMargin).getNumMarkets();
        for (uint256 i; i < numMarkets;) {
            address token = ISoloMargin(soloMargin).getMarketTokenAddress(i);
            tokenToMarketId[token] = i + 1; // +1 to distinguish from default 0
            unchecked {
                ++i;
            }
        }
    }

    // ============ IFlashLoanAdapter Implementation ============

    /// @inheritdoc IFlashLoanAdapter
    function getPool() external view override returns (address) {
        return soloMargin;
    }

    /// @inheritdoc IFlashLoanAdapter
    function initiate(
        address module,
        address safe,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata params
    ) external override {
        if (tokens.length != 1) revert OnlySingleToken();

        address token = tokens[0];
        uint256 marketId = tokenToMarketId[token];
        if (marketId == 0) revert MarketNotFound();
        marketId -= 1; // Adjust back to actual market ID

        _currentModule = module;
        _currentSafe = safe;
        _currentToken = token;
        _currentAmount = amounts[0];

        // Build dYdX actions: Withdraw -> Call -> Deposit
        ISoloMargin.AccountInfo[] memory accounts = new ISoloMargin.AccountInfo[](1);
        accounts[0] = ISoloMargin.AccountInfo({owner: address(this), number: 1});

        ISoloMargin.ActionArgs[] memory actions = new ISoloMargin.ActionArgs[](3);

        // Action 1: Withdraw tokens to this adapter
        actions[0] = ISoloMargin.ActionArgs({
            actionType: ISoloMargin.ActionType.Withdraw,
            accountId: 0,
            amount: Types.AssetAmount({
                sign: false, // negative (withdraw)
                denomination: Types.AssetDenomination.Wei,
                ref: Types.AssetReference.Delta,
                value: amounts[0]
            }),
            primaryMarketId: marketId,
            secondaryMarketId: 0,
            otherAddress: address(this),
            otherAccountId: 0,
            data: ""
        });

        // Action 2: Call this adapter (flash loan logic)
        actions[1] = ISoloMargin.ActionArgs({
            actionType: ISoloMargin.ActionType.Call,
            accountId: 0,
            amount: Types.AssetAmount({
                sign: false, denomination: Types.AssetDenomination.Wei, ref: Types.AssetReference.Delta, value: 0
            }),
            primaryMarketId: 0,
            secondaryMarketId: 0,
            otherAddress: address(this),
            otherAccountId: 0,
            data: params
        });

        // Action 3: Deposit tokens back (repayment)
        // dYdX requires repaying principal + 2 wei
        actions[2] = ISoloMargin.ActionArgs({
            actionType: ISoloMargin.ActionType.Deposit,
            accountId: 0,
            amount: Types.AssetAmount({
                sign: true, // positive (deposit)
                denomination: Types.AssetDenomination.Wei,
                ref: Types.AssetReference.Delta,
                value: amounts[0] + 2 // principal + 2 wei
            }),
            primaryMarketId: marketId,
            secondaryMarketId: 0,
            otherAddress: address(this),
            otherAccountId: 0,
            data: ""
        });

        // Approve SoloMargin for repayment before operate
        IERC20(token).forceApprove(soloMargin, amounts[0] + 2);

        ISoloMargin(soloMargin).operate(accounts, actions);

        _currentModule = address(0);
        _currentSafe = address(0);
        _currentToken = address(0);
        _currentAmount = 0;
    }

    /**
     * @notice dYdX flash loan callback
     * @dev Called by SoloMargin during operate()
     */
    function callFunction(address sender, ISoloMargin.AccountInfo calldata, bytes calldata data) external override {
        if (msg.sender != soloMargin) revert OnlySoloMargin();
        if (sender != address(this)) revert OnlySoloMargin();
        if (_currentModule == address(0)) revert NotInFlashLoan();

        // Transfer tokens to module
        IERC20(_currentToken).safeTransfer(_currentModule, _currentAmount);

        // Build callback data
        address[] memory tokens = new address[](1);
        tokens[0] = _currentToken;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = _currentAmount;
        uint256[] memory fees = new uint256[](1);
        fees[0] = 2; // dYdX fee is 2 wei

        // Call module's STANDARD callback
        IFlashLoanBorrowerModule(_currentModule)
            .handleFlashLoanCallback(_currentSafe, address(this), tokens, amounts, fees, data);

        // Tokens will be deposited back by SoloMargin's Deposit action
        // Just need to ensure we have the tokens + approval (done in initiate)
    }

    /// @inheritdoc IFlashLoanAdapter
    function getRepaymentAmount(address, uint256 amount) external pure override returns (uint256) {
        // dYdX requires repaying principal + 2 wei
        return amount + 2;
    }

    /// @inheritdoc IFlashLoanAdapter
    function repay(address token, uint256 amount, uint256) external override {
        // Approve SoloMargin (repayment happens via Deposit action)
        IERC20(token).forceApprove(soloMargin, amount + 2);
    }

    /// @inheritdoc IFlashLoanAdapter
    function validateCallback(address caller) external view override returns (bool) {
        return caller == address(this);
    }

    // ============ View Functions ============

    /**
     * @notice Get market ID for a token
     * @param token Token address
     * @return Market ID (0 if not found)
     */
    function getMarketId(address token) external view returns (uint256) {
        uint256 cached = tokenToMarketId[token];
        if (cached == 0) return type(uint256).max; // Not found
        return cached - 1;
    }
}
