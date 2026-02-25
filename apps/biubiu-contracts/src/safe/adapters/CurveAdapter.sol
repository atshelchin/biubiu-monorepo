// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IFlashLoanAdapter} from "../../interfaces/IFlashLoanAdapter.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {SafeERC20} from "../../libraries/SafeERC20.sol";

/**
 * @title ICurvePool
 * @notice Curve StableSwap pool flash loan interface
 */
interface ICurvePool {
    function flash(address receiver, uint256 amount0, uint256 amount1, bytes calldata data) external;
    function coins(uint256 i) external view returns (address);
}

/**
 * @title ICurveFlashLoanReceiver
 * @notice Callback interface for Curve flash loans
 */
interface ICurveFlashLoanReceiver {
    function curveFlashLoanCallback(
        address sender,
        uint256 amount0,
        uint256 amount1,
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external;
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
 * @title CurveAdapter
 * @notice Flash loan adapter for Curve StableSwap pools
 * @dev Handles Curve specific flash loan initiation and repayment
 *
 * Curve Flow:
 *   1. Call pool.flash(receiver, amount0, amount1, data)
 *   2. Pool transfers tokens to receiver (this adapter)
 *   3. Pool calls adapter.curveFlashLoanCallback()
 *   4. Adapter forwards to module.handleFlashLoanCallback()
 *   5. Adapter transfers tokens + fees back to pool
 *
 * Note: Curve pools support 2-token flash loans
 *       Fee is typically 0 or very small
 */
contract CurveAdapter is IFlashLoanAdapter, ICurveFlashLoanReceiver {
    using SafeERC20 for IERC20;

    // ============ Errors ============

    error ZeroAddress();
    error InvalidTokenCount();
    error TokenMismatch();
    error OnlyPool();
    error NotInFlashLoan();

    // ============ Immutables ============

    /// @notice Curve pool address
    address public immutable pool;

    /// @notice First token in the pool
    address public immutable coin0;

    /// @notice Second token in the pool
    address public immutable coin1;

    // ============ Storage ============

    /// @notice Temporary storage for flash loan context
    address private _currentModule;
    address private _currentSafe;

    // ============ Constructor ============

    constructor(address _pool) {
        if (_pool == address(0)) revert ZeroAddress();
        pool = _pool;
        coin0 = ICurvePool(_pool).coins(0);
        coin1 = ICurvePool(_pool).coins(1);
    }

    // ============ IFlashLoanAdapter Implementation ============

    /// @inheritdoc IFlashLoanAdapter
    function getPool() external view override returns (address) {
        return pool;
    }

    /// @inheritdoc IFlashLoanAdapter
    function initiate(
        address module,
        address safe,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata params
    ) external override {
        if (tokens.length != 2) revert InvalidTokenCount();
        if (tokens[0] != coin0 || tokens[1] != coin1) revert TokenMismatch();

        _currentModule = module;
        _currentSafe = safe;

        ICurvePool(pool).flash(address(this), amounts[0], amounts[1], params);

        _currentModule = address(0);
        _currentSafe = address(0);
    }

    /**
     * @notice Curve flash loan callback
     * @dev Called by Curve pool, forwards to FlashLoanModule
     */
    function curveFlashLoanCallback(
        address,
        uint256 amount0,
        uint256 amount1,
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external override {
        if (msg.sender != pool) revert OnlyPool();
        if (_currentModule == address(0)) revert NotInFlashLoan();

        // Transfer tokens to module
        if (amount0 > 0) {
            IERC20(coin0).safeTransfer(_currentModule, amount0);
        }
        if (amount1 > 0) {
            IERC20(coin1).safeTransfer(_currentModule, amount1);
        }

        // Build callback data
        address[] memory tokens = new address[](2);
        tokens[0] = coin0;
        tokens[1] = coin1;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = amount0;
        amounts[1] = amount1;
        uint256[] memory fees = new uint256[](2);
        fees[0] = fee0;
        fees[1] = fee1;

        // Call module's STANDARD callback
        IFlashLoanBorrowerModule(_currentModule)
            .handleFlashLoanCallback(_currentSafe, address(this), tokens, amounts, fees, data);

        // Repay pool
        if (amount0 > 0) {
            IERC20(coin0).safeTransfer(pool, amount0 + fee0);
        }
        if (amount1 > 0) {
            IERC20(coin1).safeTransfer(pool, amount1 + fee1);
        }
    }

    /// @inheritdoc IFlashLoanAdapter
    function getRepaymentAmount(address, uint256 amount) external pure override returns (uint256) {
        // Curve flash loans are typically fee-free or minimal fee
        // Exact fee is returned in callback
        return amount;
    }

    /// @inheritdoc IFlashLoanAdapter
    function repay(address token, uint256 amount, uint256 fee) external override {
        IERC20(token).safeTransfer(pool, amount + fee);
    }

    /// @inheritdoc IFlashLoanAdapter
    function validateCallback(address caller) external view override returns (bool) {
        return caller == address(this);
    }

    // ============ View Functions ============

    /**
     * @notice Get the token pair for this adapter
     * @return _coin0 First token
     * @return _coin1 Second token
     */
    function getCoins() external view returns (address _coin0, address _coin1) {
        return (coin0, coin1);
    }
}
