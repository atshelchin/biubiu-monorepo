// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IFlashLoanAdapter} from "../../interfaces/IFlashLoanAdapter.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {SafeERC20} from "../../libraries/SafeERC20.sol";

/**
 * @title IERC3156FlashLender
 * @notice ERC-3156 Flash Lender interface
 */
interface IERC3156FlashLender {
    function maxFlashLoan(address token) external view returns (uint256);
    function flashFee(address token, uint256 amount) external view returns (uint256);
    function flashLoan(address receiver, address token, uint256 amount, bytes calldata data) external returns (bool);
}

/**
 * @title IERC3156FlashBorrower
 * @notice ERC-3156 Flash Borrower callback interface
 */
interface IERC3156FlashBorrower {
    function onFlashLoan(address initiator, address token, uint256 amount, uint256 fee, bytes calldata data)
        external
        returns (bytes32);
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
 * @title ERC3156Adapter
 * @notice Flash loan adapter for ERC-3156 compliant lenders
 * @dev Handles ERC-3156 specific flash loan initiation and repayment
 *
 * ERC-3156 Flow:
 *   1. Call lender.flashLoan() with receiver = this adapter
 *   2. Lender transfers tokens to adapter
 *   3. Lender calls adapter.onFlashLoan()
 *   4. Adapter forwards to module.handleFlashLoanCallback()
 *   5. Adapter approves lender for repayment amount
 *   6. Adapter returns keccak256("ERC3156FlashBorrower.onFlashLoan")
 *   7. Lender pulls tokens back
 *
 * Note: ERC-3156 only supports single-token flash loans per call
 */
contract ERC3156Adapter is IFlashLoanAdapter, IERC3156FlashBorrower {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    /// @notice ERC-3156 callback success return value
    bytes32 public constant CALLBACK_SUCCESS = keccak256("ERC3156FlashBorrower.onFlashLoan");

    // ============ Errors ============

    error ZeroAddress();
    error OnlySingleToken();
    error OnlyLender();
    error NotInFlashLoan();
    error InvalidInitiator();

    // ============ Immutables ============

    /// @notice ERC-3156 Flash Lender address
    address public immutable lender;

    // ============ Storage ============

    /// @notice Temporary storage for flash loan context
    address private _currentModule;
    address private _currentSafe;

    // ============ Constructor ============

    constructor(address _lender) {
        if (_lender == address(0)) revert ZeroAddress();
        lender = _lender;
    }

    // ============ IFlashLoanAdapter Implementation ============

    /// @inheritdoc IFlashLoanAdapter
    function getPool() external view override returns (address) {
        return lender;
    }

    /// @inheritdoc IFlashLoanAdapter
    function initiate(
        address module,
        address safe,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata params
    ) external override {
        // ERC-3156 only supports single token per flash loan
        if (tokens.length != 1) revert OnlySingleToken();

        _currentModule = module;
        _currentSafe = safe;

        // Key: receiver is THIS adapter, not the module
        IERC3156FlashLender(lender).flashLoan(address(this), tokens[0], amounts[0], params);

        _currentModule = address(0);
        _currentSafe = address(0);
    }

    /**
     * @notice ERC-3156 flash loan callback
     * @dev Called by lender, forwards to FlashLoanModule
     */
    function onFlashLoan(address initiator, address token, uint256 amount, uint256 fee, bytes calldata data)
        external
        override
        returns (bytes32)
    {
        if (msg.sender != lender) revert OnlyLender();
        if (initiator != address(this)) revert InvalidInitiator();
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
            .handleFlashLoanCallback(_currentSafe, address(this), tokens, amounts, fees, data);

        // Approve lender for repayment (lender will pull tokens)
        IERC20(token).forceApprove(lender, amount + fee);

        return CALLBACK_SUCCESS;
    }

    /// @inheritdoc IFlashLoanAdapter
    function getRepaymentAmount(address token, uint256 amount) external view override returns (uint256) {
        uint256 fee = IERC3156FlashLender(lender).flashFee(token, amount);
        return amount + fee;
    }

    /// @inheritdoc IFlashLoanAdapter
    function repay(address token, uint256 amount, uint256 fee) external override {
        // ERC-3156 pulls the repayment after onFlashLoan returns success hash
        // We just need to approve the lender
        IERC20(token).forceApprove(lender, amount + fee);
    }

    /// @inheritdoc IFlashLoanAdapter
    function validateCallback(address caller) external view override returns (bool) {
        return caller == address(this);
    }

    // ============ View Functions ============

    /**
     * @notice Get maximum flash loan amount for a token
     * @param token The token address
     * @return The maximum amount that can be borrowed
     */
    function maxFlashLoan(address token) external view returns (uint256) {
        return IERC3156FlashLender(lender).maxFlashLoan(token);
    }

    /**
     * @notice Get flash loan fee for a token and amount
     * @param token The token address
     * @param amount The loan amount
     * @return The fee amount
     */
    function flashFee(address token, uint256 amount) external view returns (uint256) {
        return IERC3156FlashLender(lender).flashFee(token, amount);
    }
}
