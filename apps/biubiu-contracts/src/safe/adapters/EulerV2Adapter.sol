// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IFlashLoanAdapter} from "../../interfaces/IFlashLoanAdapter.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {SafeERC20} from "../../libraries/SafeERC20.sol";

/**
 * @title IEulerVault
 * @notice Euler V2 Vault flash loan interface
 */
interface IEulerVault {
    function flashLoan(uint256 amount, bytes calldata data) external;
    function asset() external view returns (address);
}

/**
 * @title IEulerFlashLoan
 * @notice Euler V2 flash loan callback interface
 */
interface IEulerFlashLoan {
    function onFlashLoan(bytes calldata data) external;
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
 * @title EulerV2Adapter
 * @notice Flash loan adapter for Euler V2 protocol
 * @dev Handles Euler V2 specific flash loan initiation and repayment
 *
 * Euler V2 Flow:
 *   1. Call vault.flashLoan(amount, data)
 *   2. Vault transfers tokens to msg.sender (this adapter)
 *   3. Vault calls adapter.onFlashLoan(data)
 *   4. Adapter forwards to module.handleFlashLoanCallback()
 *   5. Borrower repays vault (amount only, no fee)
 *
 * Note: Euler V2 uses per-vault flash loans
 *       Each vault handles one asset
 *       Flash loans are fee-free
 */
contract EulerV2Adapter is IFlashLoanAdapter, IEulerFlashLoan {
    using SafeERC20 for IERC20;

    // ============ Errors ============

    error ZeroAddress();
    error OnlySingleToken();
    error TokenMismatch();
    error OnlyVault();
    error NotInFlashLoan();

    // ============ Immutables ============

    /// @notice Euler V2 Vault address
    address public immutable vault;

    /// @notice Underlying asset of the vault
    address public immutable asset;

    // ============ Storage ============

    /// @notice Temporary storage for flash loan context
    address private _currentModule;
    address private _currentSafe;
    uint256 private _currentAmount;
    bytes private _currentParams;

    // ============ Constructor ============

    constructor(address _vault) {
        if (_vault == address(0)) revert ZeroAddress();
        vault = _vault;
        asset = IEulerVault(_vault).asset();
    }

    // ============ IFlashLoanAdapter Implementation ============

    /// @inheritdoc IFlashLoanAdapter
    function getPool() external view override returns (address) {
        return vault;
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
        if (tokens[0] != asset) revert TokenMismatch();

        // Store context for callback
        _currentModule = module;
        _currentSafe = safe;
        _currentAmount = amounts[0];
        _currentParams = params;

        IEulerVault(vault).flashLoan(amounts[0], params);

        // Clear context
        _currentModule = address(0);
        _currentSafe = address(0);
        _currentAmount = 0;
        _currentParams = "";
    }

    /**
     * @notice Euler V2 flash loan callback
     * @dev Called by Euler vault, forwards to FlashLoanModule
     */
    function onFlashLoan(bytes calldata) external override {
        if (msg.sender != vault) revert OnlyVault();
        if (_currentModule == address(0)) revert NotInFlashLoan();

        // Transfer tokens to module
        IERC20(asset).safeTransfer(_currentModule, _currentAmount);

        // Build callback data
        address[] memory tokens = new address[](1);
        tokens[0] = asset;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = _currentAmount;
        uint256[] memory fees = new uint256[](1);
        fees[0] = 0; // Euler V2 is fee-free

        // Call module's STANDARD callback
        IFlashLoanBorrowerModule(_currentModule)
            .handleFlashLoanCallback(_currentSafe, address(this), tokens, amounts, fees, _currentParams);

        // Repay vault
        IERC20(asset).safeTransfer(vault, _currentAmount);
    }

    /// @inheritdoc IFlashLoanAdapter
    function getRepaymentAmount(address token, uint256 amount) external view override returns (uint256) {
        if (token != asset) revert TokenMismatch();
        // Euler V2 flash loans are fee-free
        return amount;
    }

    /// @inheritdoc IFlashLoanAdapter
    function repay(address token, uint256 amount, uint256) external override {
        if (token != asset) revert TokenMismatch();
        IERC20(token).safeTransfer(vault, amount);
    }

    /// @inheritdoc IFlashLoanAdapter
    function validateCallback(address caller) external view override returns (bool) {
        return caller == address(this);
    }
}
