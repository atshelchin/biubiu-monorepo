// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "../interfaces/IERC20.sol";

/**
 * @title SafeERC20
 * @notice Safe wrapper for ERC20 operations that handles non-standard tokens
 * @dev Handles tokens that:
 *      - Return false instead of reverting on failure
 *      - Return nothing (missing return value)
 *      - Require approve(0) before approve(newValue) (like USDT)
 */
library SafeERC20 {
    error SafeERC20TransferFailed();
    error SafeERC20ApproveFailed();

    /**
     * @notice Safely transfer tokens
     * @dev Reverts if transfer fails or returns false
     */
    function safeTransfer(IERC20 token, address to, uint256 amount) internal {
        _callWithCheck(token, abi.encodeCall(IERC20.transfer, (to, amount)));
    }

    /**
     * @notice Safely transfer tokens from another address
     * @dev Reverts if transferFrom fails or returns false
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 amount) internal {
        _callWithCheck(token, abi.encodeCall(IERC20.transferFrom, (from, to, amount)));
    }

    /**
     * @notice Safely approve tokens
     * @dev Reverts if approve fails or returns false
     */
    function safeApprove(IERC20 token, address spender, uint256 amount) internal {
        _callWithCheck(token, abi.encodeCall(IERC20.approve, (spender, amount)));
    }

    /**
     * @notice Force approve - handles USDT-style tokens that require approve(0) first
     * @dev First tries direct approve, if fails tries approve(0) then approve(amount)
     */
    function forceApprove(IERC20 token, address spender, uint256 amount) internal {
        // Try direct approve first (works for most tokens)
        (bool success, bytes memory returndata) = address(token).call(abi.encodeCall(IERC20.approve, (spender, amount)));

        if (_isSuccess(success, returndata)) {
            return;
        }

        // For USDT-style tokens: approve(0) then approve(amount)
        _callWithCheck(token, abi.encodeCall(IERC20.approve, (spender, 0)));
        if (amount > 0) {
            _callWithCheck(token, abi.encodeCall(IERC20.approve, (spender, amount)));
        }
    }

    /**
     * @notice Internal call with success check
     */
    function _callWithCheck(IERC20 token, bytes memory data) private {
        (bool success, bytes memory returndata) = address(token).call(data);
        if (!_isSuccess(success, returndata)) {
            revert SafeERC20TransferFailed();
        }
    }

    /**
     * @notice Check if call was successful
     * @dev Handles both standard (returns bool) and non-standard (returns nothing) tokens
     */
    function _isSuccess(bool callSuccess, bytes memory returndata) private pure returns (bool) {
        // Call failed at EVM level
        if (!callSuccess) {
            return false;
        }

        // No return data = success (non-standard tokens like USDT)
        if (returndata.length == 0) {
            return true;
        }

        // Has return data = must be true
        if (returndata.length >= 32) {
            return abi.decode(returndata, (bool));
        }

        // Invalid return data length
        return false;
    }
}
