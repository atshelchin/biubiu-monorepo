// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IFlashLoanAdapter} from "../../interfaces/IFlashLoanAdapter.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {SafeERC20} from "../../libraries/SafeERC20.sol";

/**
 * @title IFluidLiquidity
 * @notice Fluid (ex-Instadapp) Liquidity Layer flash loan interface
 */
interface IFluidLiquidity {
    function flashLoan(address token, uint256 amount, bytes calldata data) external;
}

/**
 * @title IFluidFlashLoanCallback
 * @notice Callback interface for Fluid flash loans
 */
interface IFluidFlashLoanCallback {
    function executeOperation(address token, uint256 amount, uint256 fee, address initiator, bytes calldata params)
        external;
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
 * @title FluidAdapter
 * @notice Flash loan adapter for Fluid (ex-Instadapp Lite) protocol
 * @dev Handles Fluid specific flash loan initiation and repayment
 *
 * Fluid Flow:
 *   1. Call liquidity.flashLoan(token, amount, data)
 *   2. Liquidity transfers tokens to msg.sender (this adapter)
 *   3. Liquidity calls adapter.executeOperation()
 *   4. Adapter forwards to module.handleFlashLoanCallback()
 *   5. Borrower transfers tokens back
 *
 * Note: Fluid has very low fees and high liquidity
 *       Single token per call
 */
contract FluidAdapter is IFlashLoanAdapter, IFluidFlashLoanCallback {
    using SafeERC20 for IERC20;

    // ============ Errors ============

    error ZeroAddress();
    error OnlySingleToken();
    error OnlyLiquidity();
    error NotInFlashLoan();

    // ============ Immutables ============

    /// @notice Fluid Liquidity Layer contract
    address public immutable liquidity;

    // ============ Storage ============

    /// @notice Temporary storage for flash loan context
    address private _currentModule;
    address private _currentSafe;
    address private _currentToken;
    uint256 private _currentAmount;

    // ============ Constructor ============

    constructor(address _liquidity) {
        if (_liquidity == address(0)) revert ZeroAddress();
        liquidity = _liquidity;
    }

    // ============ IFlashLoanAdapter Implementation ============

    /// @inheritdoc IFlashLoanAdapter
    function getPool() external view override returns (address) {
        return liquidity;
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

        _currentModule = module;
        _currentSafe = safe;
        _currentToken = tokens[0];
        _currentAmount = amounts[0];

        IFluidLiquidity(liquidity).flashLoan(tokens[0], amounts[0], params);

        _currentModule = address(0);
        _currentSafe = address(0);
        _currentToken = address(0);
        _currentAmount = 0;
    }

    /**
     * @notice Fluid flash loan callback
     * @dev Called by Fluid Liquidity, forwards to FlashLoanModule
     */
    function executeOperation(address token, uint256 amount, uint256 fee, address initiator, bytes calldata params)
        external
        override
    {
        if (msg.sender != liquidity) revert OnlyLiquidity();
        if (initiator != address(this)) revert OnlyLiquidity();
        if (_currentModule == address(0)) revert NotInFlashLoan();

        // Transfer tokens to module
        IERC20(token).safeTransfer(_currentModule, amount);

        // Build callback data
        address[] memory tokens = new address[](1);
        tokens[0] = token;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        uint256[] memory fees = new uint256[](1);
        fees[0] = fee;

        // Call module's STANDARD callback
        IFlashLoanBorrowerModule(_currentModule)
            .handleFlashLoanCallback(_currentSafe, address(this), tokens, amounts, fees, params);

        // Transfer back to liquidity
        IERC20(token).safeTransfer(liquidity, amount + fee);
    }

    /// @inheritdoc IFlashLoanAdapter
    function getRepaymentAmount(address, uint256 amount) external pure override returns (uint256) {
        // Fluid fees are dynamic, returned in callback
        // Return principal as estimate
        return amount;
    }

    /// @inheritdoc IFlashLoanAdapter
    function repay(address token, uint256 amount, uint256 fee) external override {
        IERC20(token).safeTransfer(liquidity, amount + fee);
    }

    /// @inheritdoc IFlashLoanAdapter
    function validateCallback(address caller) external view override returns (bool) {
        return caller == address(this);
    }
}
