// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IFlashLoanAdapter} from "../../interfaces/IFlashLoanAdapter.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {SafeERC20} from "../../libraries/SafeERC20.sol";

/**
 * @title IDssFlash
 * @notice MakerDAO DSS Flash interface for DAI flash minting
 */
interface IDssFlash {
    function flashLoan(address receiver, address token, uint256 amount, bytes calldata data) external returns (bool);
    function flashFee(address token, uint256 amount) external view returns (uint256);
    function maxFlashLoan(address token) external view returns (uint256);
    function dai() external view returns (address);
    function vat() external view returns (address);
}

/**
 * @title IERC3156FlashBorrower
 * @notice ERC-3156 Flash Borrower callback interface
 */
interface IERC3156FlashBorrower {
    function onFlashLoan(address initiator, address token, uint256 amount, uint256 fee, bytes calldata data)
        external
        returns (bytes32);
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
 * @title MakerDSSFlashAdapter
 * @notice Flash loan adapter for MakerDAO DSS Flash (DAI flash minting)
 * @dev Handles MakerDAO specific flash loan initiation and repayment
 *
 * MakerDAO DSS Flash Flow:
 *   1. Call dssFlash.flashLoan() with receiver = this adapter
 *   2. DSS mints DAI to adapter
 *   3. DSS calls adapter.onFlashLoan()
 *   4. Adapter forwards to module.handleFlashLoanCallback()
 *   5. Adapter approves dssFlash for repayment
 *   6. Adapter returns ERC3156 success hash
 *   7. DSS burns DAI (repayment)
 *
 * Note: Only supports DAI, uses ERC-3156 callback interface
 *       Fee is typically 0 (governance controlled)
 */
contract MakerDSSFlashAdapter is IFlashLoanAdapter, IERC3156FlashBorrower {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    /// @notice ERC-3156 callback success return value
    bytes32 public constant CALLBACK_SUCCESS = keccak256("ERC3156FlashBorrower.onFlashLoan");

    // ============ Errors ============

    error ZeroAddress();
    error OnlyDAI();
    error OnlyDssFlash();
    error NotInFlashLoan();
    error InvalidInitiator();

    // ============ Immutables ============

    /// @notice MakerDAO DSS Flash contract
    address public immutable dssFlash;

    /// @notice DAI token address
    address public immutable dai;

    // ============ Storage ============

    /// @notice Temporary storage for flash loan context
    address private _currentModule;
    address private _currentSafe;

    // ============ Constructor ============

    constructor(address _dssFlash) {
        if (_dssFlash == address(0)) revert ZeroAddress();
        dssFlash = _dssFlash;
        dai = IDssFlash(_dssFlash).dai();
    }

    // ============ IFlashLoanAdapter Implementation ============

    /// @inheritdoc IFlashLoanAdapter
    function getPool() external view override returns (address) {
        return dssFlash;
    }

    /// @inheritdoc IFlashLoanAdapter
    function initiate(
        address module,
        address safe,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata params
    ) external override {
        // MakerDAO DSS Flash only supports DAI
        if (tokens.length != 1 || tokens[0] != dai) revert OnlyDAI();

        _currentModule = module;
        _currentSafe = safe;

        // Key: receiver is THIS adapter, not the module
        IDssFlash(dssFlash).flashLoan(address(this), dai, amounts[0], params);

        _currentModule = address(0);
        _currentSafe = address(0);
    }

    /**
     * @notice DSS Flash callback (ERC-3156 interface)
     * @dev Called by DSS Flash, forwards to FlashLoanModule
     */
    function onFlashLoan(address initiator, address, uint256 amount, uint256 fee, bytes calldata data)
        external
        override
        returns (bytes32)
    {
        if (msg.sender != dssFlash) revert OnlyDssFlash();
        if (initiator != address(this)) revert InvalidInitiator();
        if (_currentModule == address(0)) revert NotInFlashLoan();

        // Transfer DAI to module
        IERC20(dai).safeTransfer(_currentModule, amount);

        // Build callback data
        address[] memory tokens = new address[](1);
        tokens[0] = dai;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        uint256[] memory fees = new uint256[](1);
        fees[0] = fee;

        // Call module's STANDARD callback
        IFlashLoanBorrowerModule(_currentModule)
            .handleFlashLoanCallback(_currentSafe, address(this), tokens, amounts, fees, data);

        // Approve dssFlash for repayment (DSS will burn DAI)
        IERC20(dai).forceApprove(dssFlash, amount + fee);

        return CALLBACK_SUCCESS;
    }

    /// @inheritdoc IFlashLoanAdapter
    function getRepaymentAmount(address token, uint256 amount) external view override returns (uint256) {
        if (token != dai) revert OnlyDAI();
        uint256 fee = IDssFlash(dssFlash).flashFee(dai, amount);
        return amount + fee;
    }

    /// @inheritdoc IFlashLoanAdapter
    function repay(address token, uint256 amount, uint256 fee) external override {
        if (token != dai) revert OnlyDAI();
        // DSS Flash pulls tokens after onFlashLoan returns success
        IERC20(dai).forceApprove(dssFlash, amount + fee);
    }

    /// @inheritdoc IFlashLoanAdapter
    function validateCallback(address caller) external view override returns (bool) {
        return caller == address(this);
    }

    // ============ View Functions ============

    /**
     * @notice Get maximum DAI flash mint amount
     * @return Maximum mintable DAI
     */
    function maxFlashLoan() external view returns (uint256) {
        return IDssFlash(dssFlash).maxFlashLoan(dai);
    }

    /**
     * @notice Get flash fee for amount
     * @param amount DAI amount
     * @return Fee amount (typically 0)
     */
    function flashFee(uint256 amount) external view returns (uint256) {
        return IDssFlash(dssFlash).flashFee(dai, amount);
    }
}
