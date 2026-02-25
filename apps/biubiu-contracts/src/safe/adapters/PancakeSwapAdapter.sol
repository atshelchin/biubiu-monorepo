// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IFlashLoanAdapter} from "../../interfaces/IFlashLoanAdapter.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {SafeERC20} from "../../libraries/SafeERC20.sol";

/**
 * @title IPancakePair
 * @notice Minimal interface for PancakeSwap V2 Pair flash swaps
 */
interface IPancakePair {
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
    function token0() external view returns (address);
    function token1() external view returns (address);
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
 * @title PancakeSwapAdapter
 * @notice Flash loan adapter for PancakeSwap V2 (BSC and other chains)
 * @dev Uses flash swap mechanism similar to Uniswap V2
 *
 * Flow:
 *   1. Call pair.swap() with data (triggers flash swap)
 *   2. Pair transfers tokens to adapter
 *   3. Pair calls adapter.pancakeCall()
 *   4. Adapter forwards to module.handleFlashLoanCallback()
 *   5. Adapter repays pair (amount + 0.25% fee on BSC)
 *
 * Note: PancakeSwap fee varies by chain (0.25% on BSC, 0.3% on others)
 */
contract PancakeSwapAdapter is IFlashLoanAdapter {
    using SafeERC20 for IERC20;

    // ============ Errors ============

    error ZeroAddress();
    error InvalidTokenPair();
    error OnlyPair();
    error NotInFlashLoan();

    // ============ Immutables ============

    /// @notice PancakeSwap Pair address
    address public immutable pair;

    /// @notice Token0 of the pair
    address public immutable token0;

    /// @notice Token1 of the pair
    address public immutable token1;

    /// @notice Fee numerator (25 for 0.25%, 30 for 0.3%)
    uint256 public immutable feeNumerator;

    // ============ Storage ============

    /// @notice Current flash loan context
    address private _currentModule;
    address private _currentSafe;

    // ============ Constructor ============

    /**
     * @param _pair PancakeSwap pair address
     * @param _feeNumerator Fee in basis points / 10 (25 for 0.25%, 30 for 0.3%)
     */
    constructor(address _pair, uint256 _feeNumerator) {
        if (_pair == address(0)) revert ZeroAddress();
        pair = _pair;
        token0 = IPancakePair(_pair).token0();
        token1 = IPancakePair(_pair).token1();
        feeNumerator = _feeNumerator;
    }

    // ============ IFlashLoanAdapter Implementation ============

    /// @inheritdoc IFlashLoanAdapter
    function getPool() external view override returns (address) {
        return pair;
    }

    /// @inheritdoc IFlashLoanAdapter
    function initiate(
        address module,
        address safe,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata params
    ) external override {
        if (tokens.length != 2) revert InvalidTokenPair();
        if (tokens[0] != token0 || tokens[1] != token1) revert InvalidTokenPair();

        _currentModule = module;
        _currentSafe = safe;

        // Trigger flash swap
        IPancakePair(pair).swap(amounts[0], amounts[1], address(this), params);

        _currentModule = address(0);
        _currentSafe = address(0);
    }

    /**
     * @notice PancakeSwap flash swap callback
     * @dev Called by pair after transferring tokens
     */
    function pancakeCall(address sender, uint256 amount0, uint256 amount1, bytes calldata data) external {
        if (msg.sender != pair) revert OnlyPair();
        if (sender != address(this)) revert OnlyPair();
        if (_currentModule == address(0)) revert NotInFlashLoan();

        // Calculate fees
        uint256 feeDenominator = 10000 - feeNumerator;
        uint256 fee0 = amount0 > 0 ? (amount0 * feeNumerator / feeDenominator) + 1 : 0;
        uint256 fee1 = amount1 > 0 ? (amount1 * feeNumerator / feeDenominator) + 1 : 0;

        // Transfer tokens to module
        if (amount0 > 0) {
            IERC20(token0).safeTransfer(_currentModule, amount0);
        }
        if (amount1 > 0) {
            IERC20(token1).safeTransfer(_currentModule, amount1);
        }

        // Build callback for module
        address[] memory tokens = new address[](2);
        tokens[0] = token0;
        tokens[1] = token1;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = amount0;
        amounts[1] = amount1;
        uint256[] memory fees = new uint256[](2);
        fees[0] = fee0;
        fees[1] = fee1;

        IFlashLoanBorrowerModule(_currentModule)
            .handleFlashLoanCallback(_currentSafe, address(this), tokens, amounts, fees, data);

        // Repay pair
        if (amount0 > 0) {
            IERC20(token0).safeTransfer(pair, amount0 + fee0);
        }
        if (amount1 > 0) {
            IERC20(token1).safeTransfer(pair, amount1 + fee1);
        }
    }

    /// @inheritdoc IFlashLoanAdapter
    function getRepaymentAmount(address, uint256 amount) external view override returns (uint256) {
        uint256 feeDenominator = 10000 - feeNumerator;
        return (amount * 10000 / feeDenominator) + 1;
    }

    /// @inheritdoc IFlashLoanAdapter
    function repay(address token, uint256 amount, uint256 fee) external override {
        IERC20(token).safeTransfer(pair, amount + fee);
    }

    /// @inheritdoc IFlashLoanAdapter
    function validateCallback(address caller) external view override returns (bool) {
        return caller == address(this);
    }

    // ============ View Functions ============

    function getTokenPair() external view returns (address _token0, address _token1) {
        return (token0, token1);
    }
}
