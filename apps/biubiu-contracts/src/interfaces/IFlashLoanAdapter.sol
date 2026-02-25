// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IFlashLoanAdapter
 * @notice Interface for flash loan protocol adapters
 * @dev Each adapter handles a specific flash loan protocol (Aave, Balancer, etc.)
 */
interface IFlashLoanAdapter {
    /**
     * @notice Get the pool/vault address that will call back
     * @return The address that will initiate the callback
     */
    function getPool() external view returns (address);

    /**
     * @notice Initiate a flash loan
     * @param module The FlashLoanModule address (callback receiver)
     * @param safe The Safe address initiating the flash loan
     * @param tokens Array of token addresses to borrow
     * @param amounts Array of amounts to borrow
     * @param params Encoded parameters to pass through callback
     */
    function initiate(
        address module,
        address safe,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata params
    ) external;

    /**
     * @notice Calculate the repayment amount (principal + fee)
     * @param token The token address
     * @param amount The borrowed amount
     * @return The total amount to repay
     */
    function getRepaymentAmount(address token, uint256 amount) external view returns (uint256);

    /**
     * @notice Execute repayment to the flash loan provider
     * @param token The token to repay
     * @param amount The borrowed amount
     * @param fee The fee amount
     */
    function repay(address token, uint256 amount, uint256 fee) external;

    /**
     * @notice Validate that a callback is from the expected source
     * @param caller The msg.sender of the callback
     * @return True if the callback is valid
     */
    function validateCallback(address caller) external view returns (bool);
}
