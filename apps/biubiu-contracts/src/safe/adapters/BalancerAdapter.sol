// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IFlashLoanAdapter} from "../../interfaces/IFlashLoanAdapter.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {SafeERC20} from "../../libraries/SafeERC20.sol";

/**
 * @title IBalancerVault
 * @notice Minimal interface for Balancer Vault flash loans
 */
interface IBalancerVault {
    function flashLoan(
        address recipient,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata userData
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
 * @title BalancerAdapter
 * @notice Flash loan adapter for Balancer protocol
 * @dev Adapter receives callback from Balancer, then forwards to Module via standard interface
 *
 * Flow:
 *   1. Module calls adapter.initiate()
 *   2. Adapter calls Balancer with recipient = adapter (self)
 *   3. Balancer calls adapter.receiveFlashLoan()
 *   4. Adapter forwards to module.handleFlashLoanCallback()
 *   5. Module executes operations, returns tokens to adapter
 *   6. Adapter transfers tokens back to Balancer
 *
 * This pattern allows FlashLoanModule to support new protocols
 * by just deploying new adapters, without upgrading the module.
 */
contract BalancerAdapter is IFlashLoanAdapter {
    using SafeERC20 for IERC20;

    // ============ Errors ============

    error ZeroAddress();
    error OnlyVault();
    error NotInFlashLoan();

    // ============ Immutables ============

    /// @notice Balancer Vault address
    address public immutable vault;

    // ============ Storage ============

    /// @notice Current flash loan context
    address private _currentModule;
    address private _currentSafe;

    // ============ Constructor ============

    constructor(address _vault) {
        if (_vault == address(0)) revert ZeroAddress();
        vault = _vault;
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
        _currentModule = module;
        _currentSafe = safe;

        // Key: recipient is THIS adapter, not the module
        IBalancerVault(vault).flashLoan(address(this), tokens, amounts, params);

        _currentModule = address(0);
        _currentSafe = address(0);
    }

    /**
     * @notice Balancer callback - received by adapter, forwarded to module
     * @dev This function is called by Balancer Vault after transferring tokens
     */
    function receiveFlashLoan(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external {
        // Verify callback
        if (msg.sender != vault) revert OnlyVault();
        if (_currentModule == address(0)) revert NotInFlashLoan();

        // Transfer tokens to module
        for (uint256 i; i < tokens.length;) {
            IERC20(tokens[i]).safeTransfer(_currentModule, amounts[i]);
            unchecked {
                ++i;
            }
        }

        // Call module's STANDARD callback (same for all protocols)
        IFlashLoanBorrowerModule(_currentModule)
            .handleFlashLoanCallback(_currentSafe, address(this), tokens, amounts, feeAmounts, userData);

        // Module transfers tokens back to adapter
        // Repay Balancer (direct transfer)
        for (uint256 i; i < tokens.length;) {
            uint256 repayAmount = amounts[i] + feeAmounts[i];
            IERC20(tokens[i]).safeTransfer(vault, repayAmount);
            unchecked {
                ++i;
            }
        }
    }

    /// @inheritdoc IFlashLoanAdapter
    function getRepaymentAmount(address, uint256 amount) external pure override returns (uint256) {
        // Balancer flash loans are fee-free
        return amount;
    }

    /// @inheritdoc IFlashLoanAdapter
    function repay(address token, uint256 amount, uint256 fee) external override {
        IERC20(token).safeTransfer(vault, amount + fee);
    }

    /// @inheritdoc IFlashLoanAdapter
    function validateCallback(address caller) external view override returns (bool) {
        // Callback comes from adapter itself (after receiving from vault)
        return caller == address(this);
    }
}
