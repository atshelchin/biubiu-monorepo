// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IFlashLoanAdapter} from "../../interfaces/IFlashLoanAdapter.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {SafeERC20} from "../../libraries/SafeERC20.sol";

/**
 * @title IAaveV3Pool
 * @notice Minimal interface for Aave V3 Pool flash loans
 */
interface IAaveV3Pool {
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
 * @title AaveV3Adapter
 * @notice Flash loan adapter for Aave V3 protocol
 * @dev Adapter receives callback from Aave, then forwards to Module via standard interface
 *
 * Flow:
 *   1. Module calls adapter.initiate()
 *   2. Adapter calls Aave with receiver = adapter (self)
 *   3. Aave calls adapter.executeOperation()
 *   4. Adapter forwards to module.handleFlashLoanCallback()
 *   5. Module executes operations, returns tokens to adapter
 *   6. Adapter approves Aave for repayment
 *
 * This pattern allows FlashLoanModule to support new protocols
 * by just deploying new adapters, without upgrading the module.
 */
contract AaveV3Adapter is IFlashLoanAdapter {
    using SafeERC20 for IERC20;

    // ============ Errors ============

    error ZeroAddress();
    error OnlyPool();
    error NotInFlashLoan();
    error InvalidInitiator();

    // ============ Immutables ============

    /// @notice Aave V3 Pool address
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
        IAaveV3Pool(pool)
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
     * @notice Aave V3 callback - received by adapter, forwarded to module
     * @dev This function is called by Aave Pool after transferring tokens
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
        uint128 premium = IAaveV3Pool(pool).FLASHLOAN_PREMIUM_TOTAL();
        uint256 fee = (amount * premium) / 10000;
        return amount + fee;
    }

    /// @inheritdoc IFlashLoanAdapter
    function repay(address token, uint256 amount, uint256 fee) external override {
        IERC20(token).forceApprove(pool, amount + fee);
    }

    /// @inheritdoc IFlashLoanAdapter
    function validateCallback(address caller) external view override returns (bool) {
        // Callback comes from adapter itself (after receiving from pool)
        return caller == address(this);
    }
}
