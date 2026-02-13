// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IFlashLoanAdapter} from "../../interfaces/IFlashLoanAdapter.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {SafeERC20} from "../../libraries/SafeERC20.sol";

/**
 * @title IUniswapV3Pool
 * @notice Minimal interface for Uniswap V3 Pool flash loans
 */
interface IUniswapV3Pool {
    function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external;
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
}

/**
 * @title IUniswapV3Factory
 * @notice Minimal interface for Uniswap V3 Factory
 */
interface IUniswapV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
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
 * @title UniswapV3Adapter
 * @notice Flash loan adapter for Uniswap V3 protocol
 * @dev Adapter receives callback from Uniswap V3, then forwards to Module
 *
 * Uniswap V3 Flow:
 *   1. Module calls adapter.initiate()
 *   2. Adapter calls pool.flash() with recipient = adapter (self)
 *   3. Pool transfers tokens to adapter
 *   4. Pool calls adapter.uniswapV3FlashCallback()
 *   5. Adapter forwards to module.handleFlashLoanCallback()
 *   6. Module executes operations, returns tokens to adapter
 *   7. Adapter transfers tokens back to pool (amount + fee)
 *
 * Note: Uniswap V3 flash loans are per-pool (token pair + fee tier)
 *       Fee is based on pool's swap fee (e.g., 0.3% = 3000)
 */
contract UniswapV3Adapter is IFlashLoanAdapter {
    using SafeERC20 for IERC20;

    // ============ Errors ============

    error ZeroAddress();
    error PoolNotFound();
    error InvalidTokenPair();
    error OnlyPool();
    error NotInFlashLoan();

    // ============ Immutables ============

    /// @notice Uniswap V3 Factory address
    address public immutable factory;

    /// @notice The specific pool this adapter is configured for
    address public immutable pool;

    /// @notice Token0 of the pool
    address public immutable token0;

    /// @notice Token1 of the pool
    address public immutable token1;

    /// @notice Pool fee tier
    uint24 public immutable feeTier;

    // ============ Storage ============

    /// @notice Current flash loan context
    address private _currentModule;
    address private _currentSafe;

    // ============ Constructor ============

    /**
     * @notice Create adapter for a specific Uniswap V3 pool
     * @param _factory Uniswap V3 Factory address
     * @param _tokenA First token of the pair
     * @param _tokenB Second token of the pair
     * @param _fee Fee tier (500, 3000, 10000 for 0.05%, 0.3%, 1%)
     */
    constructor(address _factory, address _tokenA, address _tokenB, uint24 _fee) {
        if (_factory == address(0)) revert ZeroAddress();

        factory = _factory;

        // Get pool address from factory
        address _pool = IUniswapV3Factory(_factory).getPool(_tokenA, _tokenB, _fee);
        if (_pool == address(0)) revert PoolNotFound();

        pool = _pool;
        token0 = IUniswapV3Pool(_pool).token0();
        token1 = IUniswapV3Pool(_pool).token1();
        feeTier = _fee;
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
        // Uniswap V3 flash requires exactly the pool's token pair
        if (tokens.length != 2) revert InvalidTokenPair();
        if (tokens[0] != token0 || tokens[1] != token1) revert InvalidTokenPair();

        _currentModule = module;
        _currentSafe = safe;

        // Key: recipient is THIS adapter, not the module
        IUniswapV3Pool(pool).flash(address(this), amounts[0], amounts[1], params);

        _currentModule = address(0);
        _currentSafe = address(0);
    }

    /**
     * @notice Uniswap V3 flash callback - received by adapter, forwarded to module
     * @dev Called by Uniswap V3 Pool after transferring tokens
     */
    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external {
        if (msg.sender != pool) revert OnlyPool();
        if (_currentModule == address(0)) revert NotInFlashLoan();

        // Get balances (tokens were transferred to this adapter)
        uint256 amount0 = IERC20(token0).balanceOf(address(this));
        uint256 amount1 = IERC20(token1).balanceOf(address(this));

        // Adjust for fees (balanceOf includes the fee we need to pay)
        if (fee0 > 0 && amount0 > fee0) amount0 -= fee0;
        if (fee1 > 0 && amount1 > fee1) amount1 -= fee1;

        // Transfer tokens to module
        if (amount0 > 0) {
            IERC20(token0).safeTransfer(_currentModule, amount0);
        }
        if (amount1 > 0) {
            IERC20(token1).safeTransfer(_currentModule, amount1);
        }

        // Build callback data
        address[] memory tokens = new address[](2);
        tokens[0] = token0;
        tokens[1] = token1;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = amount0;
        amounts[1] = amount1;
        uint256[] memory fees = new uint256[](2);
        fees[0] = fee0;
        fees[1] = fee1;

        // Call module's STANDARD callback
        IFlashLoanBorrowerModule(_currentModule)
            .handleFlashLoanCallback(_currentSafe, address(this), tokens, amounts, fees, data);

        // Module transfers tokens back to adapter
        // Repay pool (direct transfer)
        if (amount0 > 0 || fee0 > 0) {
            IERC20(token0).safeTransfer(pool, amount0 + fee0);
        }
        if (amount1 > 0 || fee1 > 0) {
            IERC20(token1).safeTransfer(pool, amount1 + fee1);
        }
    }

    /// @inheritdoc IFlashLoanAdapter
    function getRepaymentAmount(address token, uint256 amount) external view override returns (uint256) {
        // Uniswap V3 fee = amount * feeTier / 1_000_000
        // feeTier is in hundredths of a bip (1 bip = 0.01%)
        // 500 = 0.05%, 3000 = 0.3%, 10000 = 1%
        if (token != token0 && token != token1) revert InvalidTokenPair();

        uint256 fee = (amount * feeTier) / 1_000_000;
        return amount + fee;
    }

    /// @inheritdoc IFlashLoanAdapter
    function repay(address token, uint256 amount, uint256 fee) external override {
        // Uniswap V3 requires direct transfer back to pool
        IERC20(token).safeTransfer(pool, amount + fee);
    }

    /// @inheritdoc IFlashLoanAdapter
    function validateCallback(address caller) external view override returns (bool) {
        return caller == address(this);
    }

    // ============ View Functions ============

    /**
     * @notice Get the token pair for this adapter
     * @return _token0 First token
     * @return _token1 Second token
     */
    function getTokenPair() external view returns (address _token0, address _token1) {
        return (token0, token1);
    }

    /**
     * @notice Calculate flash loan fee for an amount
     * @param amount The loan amount
     * @return fee The fee amount
     */
    function calculateFee(uint256 amount) external view returns (uint256) {
        return (amount * feeTier) / 1_000_000;
    }
}
