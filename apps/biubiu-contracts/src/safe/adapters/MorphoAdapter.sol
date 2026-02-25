// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IFlashLoanAdapter} from "../../interfaces/IFlashLoanAdapter.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {SafeERC20} from "../../libraries/SafeERC20.sol";

/**
 * @title IMorpho
 * @notice Morpho Blue flash loan interface
 */
interface IMorpho {
    function flashLoan(address token, uint256 assets, bytes calldata data) external;
}

/**
 * @title IMorphoFlashLoanCallback
 * @notice Callback interface for Morpho flash loans
 */
interface IMorphoFlashLoanCallback {
    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external;
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
 * @title MorphoAdapter
 * @notice Flash loan adapter for Morpho Blue protocol
 * @dev Handles Morpho specific flash loan initiation and repayment
 *
 * Morpho Blue Flow:
 *   1. Call morpho.flashLoan(token, amount, data)
 *   2. Morpho transfers tokens to msg.sender (this adapter)
 *   3. Morpho calls msg.sender.onMorphoFlashLoan()
 *   4. Adapter forwards to module.handleFlashLoanCallback()
 *   5. Tokens transferred back to Morpho
 *
 * Note: Morpho flash loans are fee-free
 *       Single token per call
 */
contract MorphoAdapter is IFlashLoanAdapter, IMorphoFlashLoanCallback {
    using SafeERC20 for IERC20;

    // ============ Errors ============

    error ZeroAddress();
    error OnlySingleToken();
    error OnlyMorpho();
    error NotInFlashLoan();

    // ============ Immutables ============

    /// @notice Morpho Blue contract
    address public immutable morpho;

    // ============ Storage ============

    /// @notice Temporary storage for flash loan context
    address private _currentModule;
    address private _currentSafe;
    address private _currentToken;
    uint256 private _currentAmount;

    // ============ Constructor ============

    constructor(address _morpho) {
        if (_morpho == address(0)) revert ZeroAddress();
        morpho = _morpho;
    }

    // ============ IFlashLoanAdapter Implementation ============

    /// @inheritdoc IFlashLoanAdapter
    function getPool() external view override returns (address) {
        return morpho;
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

        // Store context for callback
        _currentModule = module;
        _currentSafe = safe;
        _currentToken = tokens[0];
        _currentAmount = amounts[0];

        // Morpho calls back to this adapter, not directly to module
        IMorpho(morpho).flashLoan(tokens[0], amounts[0], params);

        // Clear context
        _currentModule = address(0);
        _currentSafe = address(0);
        _currentToken = address(0);
        _currentAmount = 0;
    }

    /**
     * @notice Morpho flash loan callback
     * @dev Called by Morpho, forwards to FlashLoanModule
     */
    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external override {
        if (msg.sender != morpho) revert OnlyMorpho();
        if (_currentModule == address(0)) revert NotInFlashLoan();

        // Transfer tokens to module
        IERC20(_currentToken).safeTransfer(_currentModule, assets);

        // Build callback data for module
        address[] memory tokens = new address[](1);
        tokens[0] = _currentToken;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = assets;
        uint256[] memory fees = new uint256[](1);
        fees[0] = 0; // Morpho is fee-free

        // Call module's STANDARD callback
        IFlashLoanBorrowerModule(_currentModule)
            .handleFlashLoanCallback(_currentSafe, address(this), tokens, amounts, fees, data);

        // Transfer tokens back to Morpho
        IERC20(_currentToken).safeTransfer(morpho, assets);
    }

    /// @inheritdoc IFlashLoanAdapter
    function getRepaymentAmount(address, uint256 amount) external pure override returns (uint256) {
        // Morpho flash loans are fee-free
        return amount;
    }

    /// @inheritdoc IFlashLoanAdapter
    function repay(address token, uint256 amount, uint256) external override {
        // Transfer back to Morpho
        IERC20(token).safeTransfer(morpho, amount);
    }

    /// @inheritdoc IFlashLoanAdapter
    function validateCallback(address caller) external view override returns (bool) {
        return caller == address(this);
    }
}
