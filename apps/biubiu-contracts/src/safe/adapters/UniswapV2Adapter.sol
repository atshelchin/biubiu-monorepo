// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IFlashLoanAdapter} from "../../interfaces/IFlashLoanAdapter.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {SafeERC20} from "../../libraries/SafeERC20.sol";

/**
 * @title IUniswapV2Pair
 * @notice Minimal interface for Uniswap V2 Pair flash swaps
 */
interface IUniswapV2Pair {
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
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
 * @title UniswapV2Adapter
 * @notice Flash loan adapter for Uniswap V2 and compatible forks (SushiSwap, etc.)
 * @dev Uses flash swap mechanism - borrow tokens, callback, repay with fee
 *
 * Flow:
 *   1. Call pair.swap() with data (triggers flash swap)
 *   2. Pair transfers tokens to adapter
 *   3. Pair calls adapter.uniswapV2Call()
 *   4. Adapter forwards to module.handleFlashLoanCallback()
 *   5. Adapter repays pair (amount + 0.3% fee)
 *
 * Note: Uniswap V2 fee is 0.3% (30 bps)
 *       Must repay with the OTHER token or same token + fee
 */
contract UniswapV2Adapter is IFlashLoanAdapter {
    using SafeERC20 for IERC20;

    // ============ Errors ============

    error ZeroAddress();
    error InvalidTokenPair();
    error OnlyPair();
    error NotInFlashLoan();

    // ============ Immutables ============

    /// @notice Uniswap V2 Pair address
    address public immutable pair;

    /// @notice Token0 of the pair
    address public immutable token0;

    /// @notice Token1 of the pair
    address public immutable token1;

    // ============ Storage ============

    /// @notice Current flash loan context
    address private _currentModule;
    address private _currentSafe;
    uint256 private _amount0;
    uint256 private _amount1;

    // ============ Constructor ============

    constructor(address _pair) {
        if (_pair == address(0)) revert ZeroAddress();
        pair = _pair;
        token0 = IUniswapV2Pair(_pair).token0();
        token1 = IUniswapV2Pair(_pair).token1();
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
        _amount0 = amounts[0];
        _amount1 = amounts[1];

        // Trigger flash swap - pass params as data to trigger callback
        IUniswapV2Pair(pair).swap(amounts[0], amounts[1], address(this), params);

        _currentModule = address(0);
        _currentSafe = address(0);
        _amount0 = 0;
        _amount1 = 0;
    }

    /**
     * @notice Uniswap V2 flash swap callback
     * @dev Called by pair after transferring tokens
     */
    function uniswapV2Call(address sender, uint256 amount0, uint256 amount1, bytes calldata data) external {
        if (msg.sender != pair) revert OnlyPair();
        if (sender != address(this)) revert OnlyPair();
        if (_currentModule == address(0)) revert NotInFlashLoan();

        // Calculate fees (0.3% = 3/1000, but need to round up)
        // Formula: amountRequired = (amountBorrowed * 1000 / 997) + 1
        uint256 fee0 = amount0 > 0 ? (amount0 * 3 / 997) + 1 : 0;
        uint256 fee1 = amount1 > 0 ? (amount1 * 3 / 997) + 1 : 0;

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
    function getRepaymentAmount(address, uint256 amount) external pure override returns (uint256) {
        // Uniswap V2 fee: 0.3%
        // amountRequired = (amountBorrowed * 1000 / 997) + 1
        return (amount * 1000 / 997) + 1;
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
