// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IFlashLoanAdapter} from "../../interfaces/IFlashLoanAdapter.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {SafeERC20} from "../../libraries/SafeERC20.sol";

/**
 * @title ISparkPool
 * @notice Spark Protocol Pool interface (Aave V3 fork)
 */
interface ISparkPool {
    function flashLoan(
        address receiverAddress,
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata interestRateModes,
        address onBehalfOf,
        bytes calldata params,
        uint16 referralCode
    ) external;

    function FLASHLOAN_PREMIUM_TOTAL() external view returns (uint128);
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
 * @title SparkAdapter
 * @notice Flash loan adapter for Spark Protocol (MakerDAO's Aave V3 fork)
 * @dev Adapter receives callback from Spark, then forwards to Module via standard interface
 *
 * Spark Flow (similar to Aave V3):
 *   1. Module calls adapter.initiate()
 *   2. Adapter calls Spark with receiver = adapter (self)
 *   3. Spark calls adapter.executeOperation()
 *   4. Adapter forwards to module.handleFlashLoanCallback()
 *   5. Module executes operations, returns tokens to adapter
 *   6. Adapter approves Spark for repayment
 *
 * Note: Spark focuses on DAI/sDAI and other MakerDAO ecosystem tokens
 *       Lower fees than Aave on some assets
 */
contract SparkAdapter is IFlashLoanAdapter {
    using SafeERC20 for IERC20;

    // ============ Errors ============

    error ZeroAddress();
    error OnlyPool();
    error NotInFlashLoan();
    error InvalidInitiator();

    // ============ Immutables ============

    /// @notice Spark Pool address
    address public immutable pool;

    // ============ Storage ============

    /// @notice Current flash loan context
    address private _currentModule;
    address private _currentSafe;

    // ============ Constructor ============

    constructor(address _pool) {
        if (_pool == address(0)) revert ZeroAddress();
        pool = _pool;
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
        _currentModule = module;
        _currentSafe = safe;

        // Interest rate modes: 0 = no debt (flash loan only)
        uint256[] memory modes = new uint256[](tokens.length);

        // Key: receiver is THIS adapter, not the module
        ISparkPool(pool)
            .flashLoan(
                address(this), // receiver = adapter
                tokens,
                amounts,
                modes,
                address(this),
                params,
                0
            );

        _currentModule = address(0);
        _currentSafe = address(0);
    }

    /**
     * @notice Spark callback - received by adapter, forwarded to module
     * @dev This function is called by Spark Pool after transferring tokens
     */
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        // Verify callback
        if (msg.sender != pool) revert OnlyPool();
        if (initiator != address(this)) revert InvalidInitiator();
        if (_currentModule == address(0)) revert NotInFlashLoan();

        // Transfer tokens to module
        for (uint256 i; i < assets.length;) {
            IERC20(assets[i]).safeTransfer(_currentModule, amounts[i]);
            unchecked {
                ++i;
            }
        }

        // Call module's STANDARD callback (same for all protocols)
        IFlashLoanBorrowerModule(_currentModule)
            .handleFlashLoanCallback(_currentSafe, address(this), assets, amounts, premiums, params);

        // Module transfers tokens back to adapter
        // Approve pool for repayment
        for (uint256 i; i < assets.length;) {
            uint256 repayAmount = amounts[i] + premiums[i];
            IERC20(assets[i]).forceApprove(pool, repayAmount);
            unchecked {
                ++i;
            }
        }

        return true;
    }

    /// @inheritdoc IFlashLoanAdapter
    function getRepaymentAmount(address, uint256 amount) external view override returns (uint256) {
        uint128 premium = ISparkPool(pool).FLASHLOAN_PREMIUM_TOTAL();
        uint256 fee = (amount * premium) / 10000;
        return amount + fee;
    }

    /// @inheritdoc IFlashLoanAdapter
    function repay(address token, uint256 amount, uint256 fee) external override {
        IERC20(token).forceApprove(pool, amount + fee);
    }

    /// @inheritdoc IFlashLoanAdapter
    function validateCallback(address caller) external view override returns (bool) {
        return caller == address(this);
    }
}
