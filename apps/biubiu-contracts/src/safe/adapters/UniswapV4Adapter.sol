// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IFlashLoanAdapter} from "../../interfaces/IFlashLoanAdapter.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {SafeERC20} from "../../libraries/SafeERC20.sol";

/**
 * @title IPoolManager
 * @notice Minimal interface for Uniswap V4 PoolManager flash loans
 */
interface IPoolManager {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    function unlock(bytes calldata data) external returns (bytes memory);
    function take(address currency, address to, uint256 amount) external;
    function settle(address currency) external payable returns (uint256);
    function sync(address currency) external;
}

/**
 * @title IUnlockCallback
 * @notice Callback interface for Uniswap V4 unlock
 */
interface IUnlockCallback {
    function unlockCallback(bytes calldata data) external returns (bytes memory);
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
 * @title UniswapV4Adapter
 * @notice Flash loan adapter for Uniswap V4 protocol
 * @dev Uses the new unlock/callback pattern in V4
 *
 * Flow:
 *   1. Call poolManager.unlock(data)
 *   2. PoolManager calls adapter.unlockCallback()
 *   3. In callback: take() tokens, execute operations, settle()
 *   4. Adapter forwards to module.handleFlashLoanCallback()
 *   5. Settle tokens back to PoolManager
 *
 * Note: Uniswap V4 uses a singleton PoolManager
 *       Flash loans are fee-free (only pay swap fees if swapping)
 */
contract UniswapV4Adapter is IFlashLoanAdapter, IUnlockCallback {
    using SafeERC20 for IERC20;

    // ============ Errors ============

    error ZeroAddress();
    error OnlyPoolManager();
    error NotInFlashLoan();

    // ============ Immutables ============

    /// @notice Uniswap V4 PoolManager address
    address public immutable poolManager;

    // ============ Storage ============

    /// @notice Current flash loan context
    address private _currentModule;
    address private _currentSafe;
    address[] private _currentTokens;
    uint256[] private _currentAmounts;
    bytes private _currentParams;

    // ============ Constructor ============

    constructor(address _poolManager) {
        if (_poolManager == address(0)) revert ZeroAddress();
        poolManager = _poolManager;
    }

    // ============ IFlashLoanAdapter Implementation ============

    /// @inheritdoc IFlashLoanAdapter
    function getPool() external view override returns (address) {
        return poolManager;
    }

    /// @inheritdoc IFlashLoanAdapter
    function initiate(
        address module,
        address safe,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata params
    ) external override {
        _currentModule = module;
        _currentSafe = safe;
        _currentTokens = tokens;
        _currentAmounts = amounts;
        _currentParams = params;

        // Encode flash loan request
        bytes memory unlockData = abi.encode(tokens, amounts, params);

        // Unlock triggers the callback
        IPoolManager(poolManager).unlock(unlockData);

        // Clear context
        _currentModule = address(0);
        _currentSafe = address(0);
        delete _currentTokens;
        delete _currentAmounts;
        delete _currentParams;
    }

    /**
     * @notice Uniswap V4 unlock callback
     * @dev Called by PoolManager after unlock()
     */
    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        if (msg.sender != poolManager) revert OnlyPoolManager();
        if (_currentModule == address(0)) revert NotInFlashLoan();

        (address[] memory tokens, uint256[] memory amounts, bytes memory params) =
            abi.decode(data, (address[], uint256[], bytes));

        // Take tokens from PoolManager
        for (uint256 i; i < tokens.length;) {
            if (amounts[i] > 0) {
                IPoolManager(poolManager).take(tokens[i], address(this), amounts[i]);
            }
            unchecked {
                ++i;
            }
        }

        // Transfer tokens to module
        for (uint256 i; i < tokens.length;) {
            if (amounts[i] > 0) {
                IERC20(tokens[i]).safeTransfer(_currentModule, amounts[i]);
            }
            unchecked {
                ++i;
            }
        }

        // V4 flash loans are fee-free
        uint256[] memory fees = new uint256[](tokens.length);

        // Call module callback
        IFlashLoanBorrowerModule(_currentModule)
            .handleFlashLoanCallback(_currentSafe, address(this), tokens, amounts, fees, params);

        // Settle tokens back to PoolManager
        for (uint256 i; i < tokens.length;) {
            if (amounts[i] > 0) {
                // Sync first to update balance
                IPoolManager(poolManager).sync(tokens[i]);
                // Transfer tokens to PoolManager
                IERC20(tokens[i]).safeTransfer(poolManager, amounts[i]);
                // Settle the debt
                IPoolManager(poolManager).settle(tokens[i]);
            }
            unchecked {
                ++i;
            }
        }

        return "";
    }

    /// @inheritdoc IFlashLoanAdapter
    function getRepaymentAmount(address, uint256 amount) external pure override returns (uint256) {
        // Uniswap V4 flash loans are fee-free
        return amount;
    }

    /// @inheritdoc IFlashLoanAdapter
    function repay(address token, uint256 amount, uint256) external override {
        IERC20(token).safeTransfer(poolManager, amount);
    }

    /// @inheritdoc IFlashLoanAdapter
    function validateCallback(address caller) external view override returns (bool) {
        return caller == address(this);
    }
}
