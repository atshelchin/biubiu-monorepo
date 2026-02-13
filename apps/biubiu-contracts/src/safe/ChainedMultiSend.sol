// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC2771Context} from "../libraries/ERC2771Context.sol";
import {IBiuBiuPremium} from "../interfaces/IBiuBiuPremium.sol";

/**
 * @title ChainedMultiSend
 * @notice Execute multiple transactions with return value chaining
 * @dev Allows passing return values from earlier calls as parameters to later calls
 *
 * Use case: Composable DeFi operations
 *   1. Swap ETH for USDC (returns amount received)
 *   2. Deposit USDC to Aave (uses amount from step 1)
 *   3. Stake aUSDC (uses result from step 2)
 *
 * How it works:
 *   - Each call can specify "return references" that inject previous return values into calldata
 *   - Return values are stored in a temporary array during execution
 *   - Placeholder bytes in calldata are replaced with actual return values before execution
 *
 * Fixed/Default values:
 *   - If returnRefs is empty, the original calldata is used as-is (all values are "fixed")
 *   - You can mix fixed and dynamic values: put fixed values in `data`, only specify
 *     returnRefs for the parameters you want to inject from previous calls
 *   - Example: transfer(address to, uint256 amount)
 *     - `to` is fixed in calldata: 0xa9059cbb + <fixed_address> + <placeholder_for_amount>
 *     - Only `amount` uses returnRef to inject from previous swap result
 *
 * Security:
 *   - This contract should only be called directly, NOT via delegatecall
 *   - Remaining ETH is refunded to caller after execution
 *   - No state is stored between calls (stateless utility)
 */
contract ChainedMultiSend is ERC2771Context {
    // ============ Errors ============

    error InvalidCallIndex();
    error InvalidReturnOffset();
    error InvalidDataOffset();
    error ExecutionFailed(uint256 index);
    error EmptyCalls();
    error ReturnDataTooShort();
    error DelegateCallNotAllowed();
    error RefundFailed();
    error InsufficientPayment();
    error PaymentFailed();

    // ============ Events ============

    /// @notice Emitted when a chained execution completes
    event ChainedExecutionCompleted(address indexed sender, uint256 callCount, bool success);

    /// @notice Emitted for each call in the chain
    event CallExecuted(uint256 indexed index, address indexed to, bool success, bytes returnData);

    /// @notice Emitted when a per-use payment is made
    event PerUsePayment(address indexed payer, uint256 amount);

    // ============ Structs ============

    /**
     * @notice Reference to a previous call's return value
     * @param callIndex Index of the previous call whose return value to use (0-based)
     * @param returnOffset Byte offset in the return data to start reading from
     * @param returnLength Number of bytes to copy (typically 32 for uint256/address)
     * @param dataOffset Byte offset in the call's data where to inject the value
     */
    struct ReturnRef {
        uint8 callIndex;
        uint16 returnOffset;
        uint16 returnLength;
        uint16 dataOffset;
    }

    /**
     * @notice A single call in the chain
     * @param to Target address
     * @param value ETH value to send
     * @param data Calldata (may contain placeholders to be replaced)
     * @param returnRefs References to previous return values to inject
     */
    struct ChainedCall {
        address to;
        uint256 value;
        bytes data;
        ReturnRef[] returnRefs;
    }

    // ============ Immutables ============

    /// @notice Store the original address for delegatecall detection
    address private immutable _self;

    /// @notice BiuBiuPremium contract for membership verification
    address public immutable biubiuPremium;

    // ============ Constructor ============

    constructor(address _trustedForwarder, address _biubiuPremium) ERC2771Context(_trustedForwarder) {
        _self = address(this);
        biubiuPremium = _biubiuPremium;
    }

    // ============ Modifiers ============

    /// @notice Prevent delegatecall to protect caller's context
    modifier noDelegateCall() {
        if (address(this) != _self) revert DelegateCallNotAllowed();
        _;
    }

    // ============ Main Functions ============

    /**
     * @notice Execute chain via delegatecall (for Safe/multisig use)
     * @dev When called via delegatecall:
     *   - Runs in caller's context (Safe's address)
     *   - Target contracts see Safe as msg.sender
     *   - No ETH refund (caller manages their own balance)
     * @param calls Array of chained calls to execute
     * @return results Array of return data from each call
     */
    function executeChainDelegated(ChainedCall[] calldata calls) external payable returns (bytes[] memory results) {
        if (calls.length == 0) revert EmptyCalls();

        // Check membership and handle payment
        // When called via delegatecall from Safe, msg.sender is Safe's address
        (bool isPremium,,) = IBiuBiuPremium(biubiuPremium).getSubscriptionInfo(msg.sender);

        if (!isPremium) {
            // Non-premium users pay per-use fee
            uint256 perUsePrice = IBiuBiuPremium(biubiuPremium).PER_USE_PRICE();
            if (msg.value < perUsePrice) revert InsufficientPayment();

            // Send fee to vault
            address vault = IBiuBiuPremium(biubiuPremium).VAULT();
            (bool success,) = vault.call{value: perUsePrice}("");
            if (!success) revert PaymentFailed();

            emit PerUsePayment(msg.sender, perUsePrice);
        }

        results = new bytes[](calls.length);

        for (uint256 i; i < calls.length;) {
            ChainedCall calldata call = calls[i];

            // Build the final calldata by injecting return values
            bytes memory finalData = _buildCalldata(call.data, call.returnRefs, results, i);

            // Execute the call
            (bool success, bytes memory returnData) = call.to.call{value: call.value}(finalData);

            if (!success) {
                // Bubble up the revert reason
                if (returnData.length > 0) {
                    assembly {
                        revert(add(returnData, 32), mload(returnData))
                    }
                }
                revert ExecutionFailed(i);
            }

            // Store the return data for potential use by later calls
            results[i] = returnData;

            emit CallExecuted(i, call.to, success, returnData);

            unchecked {
                ++i;
            }
        }

        // No refund in delegatecall mode - caller (Safe) manages their own balance
        emit ChainedExecutionCompleted(msg.sender, calls.length, true);
    }

    /**
     * @notice Execute a chain of calls with return value passing (direct call only)
     * @dev For direct calls only - refunds remaining ETH to caller
     *   - Target contracts see ChainedMultiSend as msg.sender
     *   - Use executeChainDelegated if you need target to see caller as msg.sender
     * @param calls Array of chained calls to execute
     * @return results Array of return data from each call
     */
    function executeChain(ChainedCall[] calldata calls)
        external
        payable
        noDelegateCall
        returns (bytes[] memory results)
    {
        if (calls.length == 0) revert EmptyCalls();

        results = new bytes[](calls.length);

        for (uint256 i; i < calls.length;) {
            ChainedCall calldata call = calls[i];

            // Build the final calldata by injecting return values
            bytes memory finalData = _buildCalldata(call.data, call.returnRefs, results, i);

            // Execute the call
            (bool success, bytes memory returnData) = call.to.call{value: call.value}(finalData);

            if (!success) {
                // Bubble up the revert reason
                if (returnData.length > 0) {
                    assembly {
                        revert(add(returnData, 32), mload(returnData))
                    }
                }
                revert ExecutionFailed(i);
            }

            // Store the return data for potential use by later calls
            results[i] = returnData;

            emit CallExecuted(i, call.to, success, returnData);

            unchecked {
                ++i;
            }
        }

        // Refund remaining ETH to caller
        _refundRemainingETH();

        emit ChainedExecutionCompleted(_msgSender(), calls.length, true);
    }

    /**
     * @notice Execute chain with allowPartialFailure option
     * @param calls Array of chained calls to execute
     * @param allowPartialFailure If true, continue execution even if a call fails
     * @return results Array of return data from each call
     * @return successes Array indicating success/failure of each call
     */
    function executeChainWithFailures(ChainedCall[] calldata calls, bool allowPartialFailure)
        external
        payable
        noDelegateCall
        returns (bytes[] memory results, bool[] memory successes)
    {
        if (calls.length == 0) revert EmptyCalls();

        results = new bytes[](calls.length);
        successes = new bool[](calls.length);

        for (uint256 i; i < calls.length;) {
            ChainedCall calldata call = calls[i];

            // Build the final calldata
            bytes memory finalData = _buildCalldata(call.data, call.returnRefs, results, i);

            // Execute the call
            (bool success, bytes memory returnData) = call.to.call{value: call.value}(finalData);

            results[i] = returnData;
            successes[i] = success;

            emit CallExecuted(i, call.to, success, returnData);

            if (!success && !allowPartialFailure) {
                // Refund before reverting
                _refundRemainingETH();
                if (returnData.length > 0) {
                    assembly {
                        revert(add(returnData, 32), mload(returnData))
                    }
                }
                revert ExecutionFailed(i);
            }

            unchecked {
                ++i;
            }
        }

        // Refund remaining ETH to caller
        _refundRemainingETH();

        emit ChainedExecutionCompleted(_msgSender(), calls.length, true);
    }

    /**
     * @notice Simulate execution without actually executing (for gas estimation and validation)
     * @param calls Array of chained calls to simulate
     * @return Valid if the chain configuration is valid
     */
    function validateChain(ChainedCall[] calldata calls) external pure returns (bool) {
        if (calls.length == 0) return false;

        for (uint256 i; i < calls.length;) {
            ChainedCall calldata call = calls[i];

            // Validate return references
            for (uint256 j; j < call.returnRefs.length;) {
                ReturnRef calldata ref = call.returnRefs[j];

                // Can only reference previous calls
                if (ref.callIndex >= i) return false;

                // Data offset must be within bounds
                if (ref.dataOffset + ref.returnLength > call.data.length) return false;

                unchecked {
                    ++j;
                }
            }

            unchecked {
                ++i;
            }
        }

        return true;
    }

    // ============ Internal Functions ============

    /**
     * @notice Refund any remaining ETH to the caller
     */
    function _refundRemainingETH() internal {
        uint256 remaining = address(this).balance;
        if (remaining > 0) {
            (bool success,) = _msgSender().call{value: remaining}("");
            if (!success) revert RefundFailed();
        }
    }

    /**
     * @notice Build final calldata by injecting return values from previous calls
     * @param originalData The original calldata with placeholders
     * @param refs Return value references to inject
     * @param previousResults Return data from previous calls
     * @param currentIndex Current call index (for validation)
     * @return finalData The modified calldata with injected values
     */
    function _buildCalldata(
        bytes calldata originalData,
        ReturnRef[] calldata refs,
        bytes[] memory previousResults,
        uint256 currentIndex
    ) internal pure returns (bytes memory finalData) {
        // If no refs, return original data as-is
        if (refs.length == 0) {
            return originalData;
        }

        // Copy original data to memory for modification
        finalData = originalData;

        // Inject each return value reference
        for (uint256 i; i < refs.length;) {
            ReturnRef calldata ref = refs[i];

            // Validate call index
            if (ref.callIndex >= currentIndex) revert InvalidCallIndex();

            bytes memory returnData = previousResults[ref.callIndex];

            // Validate return data has enough bytes
            if (ref.returnOffset + ref.returnLength > returnData.length) {
                revert ReturnDataTooShort();
            }

            // Validate data offset
            if (ref.dataOffset + ref.returnLength > finalData.length) {
                revert InvalidDataOffset();
            }

            // Copy return value bytes into the calldata
            for (uint256 j; j < ref.returnLength;) {
                finalData[ref.dataOffset + j] = returnData[ref.returnOffset + j];
                unchecked {
                    ++j;
                }
            }

            unchecked {
                ++i;
            }
        }
    }

    // ============ Helper Functions ============

    /**
     * @notice Encode a uint256 return value reference
     * @dev Helper for common case of using uint256 return value
     * @param callIndex Which call's return value to use
     * @param dataOffset Where in the next call's data to place it
     * @return ref The return reference struct
     */
    function encodeUint256Ref(uint8 callIndex, uint16 dataOffset) external pure returns (ReturnRef memory ref) {
        return ReturnRef({callIndex: callIndex, returnOffset: 0, returnLength: 32, dataOffset: dataOffset});
    }

    /**
     * @notice Encode an address return value reference
     * @dev Helper for common case of using address return value (last 20 bytes of 32-byte slot)
     * @param callIndex Which call's return value to use
     * @param dataOffset Where in the next call's data to place it
     * @return ref The return reference struct
     */
    function encodeAddressRef(uint8 callIndex, uint16 dataOffset) external pure returns (ReturnRef memory ref) {
        // Address is stored in the last 20 bytes of a 32-byte ABI-encoded slot
        return ReturnRef({callIndex: callIndex, returnOffset: 12, returnLength: 20, dataOffset: dataOffset});
    }

    /**
     * @notice Encode a reference to a specific slot in return data
     * @dev For functions that return multiple values
     * @param callIndex Which call's return value to use
     * @param slotIndex Which 32-byte slot in the return data (0-indexed)
     * @param dataOffset Where in the next call's data to place it
     * @return ref The return reference struct
     */
    function encodeSlotRef(uint8 callIndex, uint8 slotIndex, uint16 dataOffset)
        external
        pure
        returns (ReturnRef memory ref)
    {
        return ReturnRef({
            callIndex: callIndex, returnOffset: uint16(slotIndex) * 32, returnLength: 32, dataOffset: dataOffset
        });
    }

    // ============ Receive ============

    receive() external payable {}
}
