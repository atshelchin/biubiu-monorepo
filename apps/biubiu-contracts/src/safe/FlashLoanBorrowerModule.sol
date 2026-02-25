// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ISafe} from "../interfaces/ISafe.sol";
import {IFlashLoanAdapter} from "../interfaces/IFlashLoanAdapter.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {SafeERC20} from "../libraries/SafeERC20.sol";

/**
 * @title FlashLoanBorrowerModule
 * @notice Safe Module for executing flash loan operations across multiple protocols
 * @dev Uses Adapter pattern for protocol abstraction
 *
 * Architecture:
 *   1. Safe calls module.initiateFlashLoan(adapter, tokens, amounts, operations)
 *   2. Module calls adapter.initiate() with module as callback target
 *   3. Adapter calls protocol with ADAPTER as receiver
 *   4. Protocol calls back to ADAPTER
 *   5. Adapter forwards to module.handleFlashLoanCallback()
 *   6. Module executes operations via Safe
 *   7. Module transfers tokens back to adapter
 *   8. Adapter repays protocol
 *
 * Benefits:
 *   - No registration needed - just pass adapter address directly
 *   - New protocols only need new Adapter, NO MODULE UPGRADE
 *   - Module only implements ONE callback function
 *
 * Security:
 *   - Safe owners control which adapter to use
 *   - Operations hash verification
 *   - Reentrancy protection via state
 */
contract FlashLoanBorrowerModule {
    using SafeERC20 for IERC20;

    // ============ Errors ============

    error InvalidCallback();
    error OperationsHashMismatch();
    error FlashLoanInProgress();
    error ExecutionFailed();
    error InvalidAdapter();
    error ZeroAddress();
    error ArrayLengthMismatch();

    // ============ Events ============

    event FlashLoanInitiated(
        address indexed safe, address indexed adapter, address[] tokens, uint256[] amounts, bytes32 operationsHash
    );
    event FlashLoanCompleted(address indexed safe, address indexed adapter, bool success);
    event OperationExecuted(address indexed safe, uint256 index, address to, bool success);

    // ============ Structs ============

    /// @notice Operation to execute during flash loan callback
    struct Operation {
        address to;
        uint256 value;
        bytes data;
        uint8 operationType; // 0 = call, 1 = delegatecall
    }

    /// @notice Active flash loan state for security verification
    struct FlashLoanState {
        address safe;
        address adapter;
        bytes32 operationsHash;
        bool active;
    }

    // ============ Storage ============

    /// @notice Flash loan states by Safe address (supports parallel execution)
    mapping(address => FlashLoanState) private _states;

    // ============ Modifiers ============

    modifier noActiveFlashLoan() {
        if (_states[msg.sender].active) revert FlashLoanInProgress();
        _;
    }

    // ============ Flash Loan Initiation ============

    /**
     * @notice Initiate a flash loan
     * @dev Must be called via Safe transaction
     * @param adapter The adapter contract address to use
     * @param tokens Array of token addresses to borrow
     * @param amounts Array of amounts to borrow
     * @param operations Operations to execute during callback
     */
    function initiateFlashLoan(
        address adapter,
        address[] calldata tokens,
        uint256[] calldata amounts,
        Operation[] calldata operations
    ) external noActiveFlashLoan {
        if (adapter == address(0)) revert ZeroAddress();
        if (tokens.length != amounts.length) revert ArrayLengthMismatch();

        // Validate adapter has a pool configured
        if (IFlashLoanAdapter(adapter).getPool() == address(0)) revert InvalidAdapter();

        address safe = msg.sender;

        // Compute operations hash for callback verification
        bytes32 operationsHash = keccak256(abi.encode(operations));

        // Set state before initiating (for callback verification)
        _states[safe] = FlashLoanState({safe: safe, adapter: adapter, operationsHash: operationsHash, active: true});

        // Encode operations for callback
        bytes memory params = abi.encode(operations);

        emit FlashLoanInitiated(safe, adapter, tokens, amounts, operationsHash);

        // Initiate flash loan via adapter
        // Adapter will receive protocol callback and forward to handleFlashLoanCallback()
        IFlashLoanAdapter(adapter).initiate(address(this), safe, tokens, amounts, params);

        // Clear state after completion
        _states[safe].active = false;

        emit FlashLoanCompleted(safe, adapter, true);
    }

    // ============ Standard Callback (called by Adapters) ============

    /**
     * @notice Standard callback for all flash loan protocols
     * @dev Called by Adapter after receiving protocol-specific callback
     *      This is the ONLY callback function Module needs to implement!
     *
     * @param safe The Safe address that initiated the flash loan
     * @param adapter The adapter that initiated the callback
     * @param tokens Borrowed token addresses
     * @param amounts Borrowed amounts
     * @param fees Fee amounts
     * @param params Encoded operations
     */
    function handleFlashLoanCallback(
        address safe,
        address adapter,
        address[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory fees,
        bytes memory params
    ) external {
        FlashLoanState storage state = _states[safe];

        // Verify flash loan is active
        if (!state.active) revert InvalidCallback();

        // Verify callback is from the expected adapter
        if (adapter != state.adapter) revert InvalidCallback();
        if (msg.sender != adapter) revert InvalidCallback();

        // Decode and verify operations
        Operation[] memory operations = abi.decode(params, (Operation[]));
        bytes32 operationsHash = keccak256(abi.encode(operations));
        if (operationsHash != state.operationsHash) revert OperationsHashMismatch();

        // Tokens are already in Module (transferred by Adapter)
        // Transfer borrowed tokens to Safe
        for (uint256 i; i < tokens.length;) {
            if (amounts[i] > 0) {
                IERC20(tokens[i]).safeTransfer(safe, amounts[i]);
            }
            unchecked {
                ++i;
            }
        }

        // Execute operations via Safe
        _executeOperations(safe, operations);

        // Transfer tokens back from Safe to Module (for repayment to Adapter)
        for (uint256 i; i < tokens.length;) {
            uint256 repayAmount = amounts[i] + fees[i];
            if (repayAmount > 0) {
                bytes memory transferData = abi.encodeCall(IERC20.transfer, (address(this), repayAmount));

                bool success = ISafe(safe).execTransactionFromModule(tokens[i], 0, transferData, 0);
                if (!success) revert ExecutionFailed();
            }
            unchecked {
                ++i;
            }
        }

        // Transfer tokens to Adapter for repayment
        for (uint256 i; i < tokens.length;) {
            uint256 repayAmount = amounts[i] + fees[i];
            if (repayAmount > 0) {
                IERC20(tokens[i]).safeTransfer(adapter, repayAmount);
            }
            unchecked {
                ++i;
            }
        }
    }

    // ============ Internal Functions ============

    /**
     * @notice Execute operations via Safe
     * @param safe The Safe address
     * @param operations Array of operations to execute
     */
    function _executeOperations(address safe, Operation[] memory operations) internal {
        for (uint256 i; i < operations.length;) {
            Operation memory op = operations[i];

            bool success = ISafe(safe).execTransactionFromModule(op.to, op.value, op.data, op.operationType);

            emit OperationExecuted(safe, i, op.to, success);

            if (!success) revert ExecutionFailed();

            unchecked {
                ++i;
            }
        }
    }

    // ============ View Functions ============

    /**
     * @notice Check if a flash loan is currently active for a Safe
     * @param safe The Safe address to check
     * @return True if a flash loan is in progress
     */
    function isFlashLoanActive(address safe) external view returns (bool) {
        return _states[safe].active;
    }

    /**
     * @notice Get flash loan state for a Safe (for debugging)
     * @param safe The Safe address to query
     */
    function getFlashLoanState(address safe)
        external
        view
        returns (address safeCached, address adapter, bytes32 operationsHash, bool active)
    {
        FlashLoanState storage state = _states[safe];
        return (state.safe, state.adapter, state.operationsHash, state.active);
    }
}
