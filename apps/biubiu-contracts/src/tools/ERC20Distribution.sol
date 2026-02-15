// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC2771Context} from "../libraries/ERC2771Context.sol";

/**
 * @title ERC20Distribution
 * @notice Gas-optimized tool for distributing ERC20 tokens to multiple wallets
 * @dev Called via BiuBiuPremium.callTool(), uses ERC2771Context for real sender
 *
 * Two distribution approaches:
 *   - Deposit mode: deposit first, then distribute via transfer() (cheaper gas)
 *   - Direct mode: distribute via transferFrom() (better for deflationary tokens)
 *
 * Four distribution modes:
 *   1. Equal: total tokens divided equally among recipients
 *   2. Specified: exact amount for each recipient
 *   3. Random: random distribution based on weights
 *   4. RandomRange: random amount within min/max range
 */
contract ERC20Distribution is ERC2771Context {
    // ============ Errors ============

    error NoRecipients();
    error LengthMismatch();
    error InsufficientBalance();
    error TransferFailed();
    error InvalidRange();
    error ZeroAmount();

    // ============ Structs ============

    /// @notice Options for distribution
    /// @param allowPartialFailure If true, continue on failure and return failed indices
    struct Options {
        bool allowPartialFailure;
    }

    /// @notice Result of distribution
    /// @param totalSent Total tokens successfully sent
    /// @param successCount Number of successful transfers
    /// @param failedIndices Indices of failed recipients
    struct Result {
        uint256 totalSent;
        uint256 successCount;
        uint256[] failedIndices;
    }

    // ============ Events ============

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event Distributed(address indexed sender, address indexed token, uint8 indexed mode, bool direct, uint256 totalAmount, uint256 recipientCount);
    event DistributedPartial(address indexed sender, address indexed token, uint8 indexed mode, uint256 totalSent, uint256 successCount, uint256 failCount);
    event TransferSkipped(address indexed token, address indexed recipient, uint256 indexed index, uint256 amount);

    // ============ Storage ============

    mapping(address => mapping(address => uint256)) public balances;

    // ============ Constructor ============

    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {}

    // ============ Deposit / Withdraw ============

    function deposit(address token, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        address sender = _msgSender();

        uint256 balanceBefore = _balanceOf(token, address(this));
        _transferFrom(token, sender, address(this), amount);
        uint256 received = _balanceOf(token, address(this)) - balanceBefore;

        balances[sender][token] += received;
        emit Deposited(sender, token, received);
    }

    function withdraw(address token, uint256 amount) external {
        address sender = _msgSender();
        uint256 bal = balances[sender][token];

        if (amount == 0) amount = bal;
        if (amount > bal) revert InsufficientBalance();

        balances[sender][token] = bal - amount;
        _transfer(token, sender, amount);
        emit Withdrawn(sender, token, amount);
    }

    // ============ Deposit Mode Distribution ============

    /**
     * @notice Distribute tokens equally from deposited balance
     */
    function distributeEqual(address token, address[] calldata recipients, uint256 totalAmount, Options calldata options)
        external
        returns (Result memory result)
    {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (totalAmount == 0) revert ZeroAmount();

        address sender = _msgSender();
        if (balances[sender][token] < totalAmount) revert InsufficientBalance();

        uint256[] memory amounts = _computeEqualAmounts(len, totalAmount);
        result = _distributeFromDeposit(token, sender, recipients, amounts, options);
        _emitResult(token, 1, false, result, len);
    }

    /**
     * @notice Distribute specified amounts from deposited balance
     */
    function distributeSpecified(address token, address[] calldata recipients, uint256[] calldata amounts, Options calldata options)
        external
        returns (Result memory result)
    {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (len != amounts.length) revert LengthMismatch();

        address sender = _msgSender();
        uint256 total = _sum(amounts);
        if (balances[sender][token] < total) revert InsufficientBalance();

        result = _distributeFromDeposit(token, sender, recipients, amounts, options);
        _emitResult(token, 2, false, result, len);
    }

    /**
     * @notice Distribute tokens randomly from deposited balance
     */
    function distributeRandom(address token, address[] calldata recipients, uint256 totalAmount) external {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (totalAmount == 0) revert ZeroAmount();

        address sender = _msgSender();
        if (balances[sender][token] < totalAmount) revert InsufficientBalance();
        balances[sender][token] -= totalAmount;

        _distributeRandomInternal(token, recipients, totalAmount, false, sender);
        emit Distributed(sender, token, 3, false, totalAmount, len);
    }

    /**
     * @notice Distribute with random amounts within a range from deposited balance
     */
    function distributeRandomRange(address token, address[] calldata recipients, uint256 minAmount, uint256 maxAmount) external {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (minAmount > maxAmount) revert InvalidRange();

        address sender = _msgSender();
        uint256 maxRequired = maxAmount * len;
        if (balances[sender][token] < maxRequired) revert InsufficientBalance();

        uint256 totalSent = _distributeRandomRangeInternal(token, recipients, minAmount, maxAmount, false, sender);
        balances[sender][token] -= totalSent;
        emit Distributed(sender, token, 4, false, totalSent, len);
    }

    // ============ Direct Mode Distribution ============

    /**
     * @notice Distribute tokens equally via direct transferFrom
     */
    function distributeEqualDirect(address token, address[] calldata recipients, uint256 totalAmount, Options calldata options)
        external
        returns (Result memory result)
    {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (totalAmount == 0) revert ZeroAmount();

        uint256[] memory amounts = _computeEqualAmounts(len, totalAmount);
        result = _distributeDirect(token, _msgSender(), recipients, amounts, options);
        _emitResult(token, 1, true, result, len);
    }

    /**
     * @notice Distribute specified amounts via direct transferFrom
     */
    function distributeSpecifiedDirect(address token, address[] calldata recipients, uint256[] calldata amounts, Options calldata options)
        external
        returns (Result memory result)
    {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (len != amounts.length) revert LengthMismatch();

        result = _distributeDirect(token, _msgSender(), recipients, amounts, options);
        _emitResult(token, 2, true, result, len);
    }

    /**
     * @notice Distribute tokens randomly via direct transferFrom
     */
    function distributeRandomDirect(address token, address[] calldata recipients, uint256 totalAmount) external {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (totalAmount == 0) revert ZeroAmount();

        address sender = _msgSender();
        _distributeRandomInternal(token, recipients, totalAmount, true, sender);
        emit Distributed(sender, token, 3, true, totalAmount, len);
    }

    /**
     * @notice Distribute with random amounts within a range via direct transferFrom
     */
    function distributeRandomRangeDirect(address token, address[] calldata recipients, uint256 minAmount, uint256 maxAmount) external {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (minAmount > maxAmount) revert InvalidRange();

        address sender = _msgSender();
        uint256 totalSent = _distributeRandomRangeInternal(token, recipients, minAmount, maxAmount, true, sender);
        emit Distributed(sender, token, 4, true, totalSent, len);
    }

    // ============ Validation ============

    /**
     * @notice Test if token is deflationary
     */
    function checkDeflationary(address token, address testRecipient) external returns (bool isDeflationary) {
        address sender = _msgSender();
        uint256 balanceBefore = _balanceOf(token, testRecipient);

        if (!_tryTransferFrom(token, sender, testRecipient, 1)) revert TransferFailed();

        isDeflationary = _balanceOf(token, testRecipient) - balanceBefore != 1;
    }

    // ============ Internal - Core Distribution ============

    function _distributeFromDeposit(
        address token,
        address sender,
        address[] calldata recipients,
        uint256[] memory amounts,
        Options calldata options
    ) private returns (Result memory result) {
        uint256 len = recipients.length;
        uint256[] memory tempFailed = new uint256[](len);
        uint256 failCount;

        for (uint256 i; i < len;) {
            uint256 amt = amounts[i];
            if (amt == 0) {
                unchecked { ++i; }
                continue;
            }

            if (_tryTransfer(token, recipients[i], amt)) {
                result.totalSent += amt;
                unchecked { ++result.successCount; }
            } else {
                if (!options.allowPartialFailure) revert TransferFailed();
                emit TransferSkipped(token, recipients[i], i, amt);
                tempFailed[failCount] = i;
                unchecked { ++failCount; }
            }
            unchecked { ++i; }
        }

        balances[sender][token] -= result.totalSent;
        result.failedIndices = _copyArray(tempFailed, failCount);
    }

    function _distributeDirect(
        address token,
        address sender,
        address[] calldata recipients,
        uint256[] memory amounts,
        Options calldata options
    ) private returns (Result memory result) {
        uint256 len = recipients.length;
        uint256[] memory tempFailed = new uint256[](len);
        uint256 failCount;

        for (uint256 i; i < len;) {
            uint256 amt = amounts[i];
            if (amt == 0) {
                unchecked { ++i; }
                continue;
            }

            if (_tryTransferFrom(token, sender, recipients[i], amt)) {
                result.totalSent += amt;
                unchecked { ++result.successCount; }
            } else {
                if (!options.allowPartialFailure) revert TransferFailed();
                emit TransferSkipped(token, recipients[i], i, amt);
                tempFailed[failCount] = i;
                unchecked { ++failCount; }
            }
            unchecked { ++i; }
        }

        result.failedIndices = _copyArray(tempFailed, failCount);
    }

    function _distributeRandomInternal(
        address token,
        address[] calldata recipients,
        uint256 totalAmount,
        bool direct,
        address sender
    ) private {
        uint256 len = recipients.length;
        bytes32 seed = keccak256(abi.encodePacked(block.timestamp, block.prevrandao, sender, totalAmount));
        uint256 remaining = totalAmount;

        for (uint256 i; i < len;) {
            uint256 amount;
            if (i == len - 1) {
                amount = remaining;
            } else {
                uint256 pct = (uint256(keccak256(abi.encodePacked(seed, i))) % 50) + 1;
                amount = (remaining * pct) / 100;
            }

            if (amount != 0) {
                if (direct) {
                    _transferFrom(token, sender, recipients[i], amount);
                } else {
                    _transfer(token, recipients[i], amount);
                }
                remaining -= amount;
            }
            unchecked { ++i; }
        }
    }

    function _distributeRandomRangeInternal(
        address token,
        address[] calldata recipients,
        uint256 minAmount,
        uint256 maxAmount,
        bool direct,
        address sender
    ) private returns (uint256 totalSent) {
        uint256 len = recipients.length;
        bytes32 seed = keccak256(abi.encodePacked(block.timestamp, block.prevrandao, sender));
        uint256 range = maxAmount - minAmount;

        for (uint256 i; i < len;) {
            uint256 extra = range != 0 ? uint256(keccak256(abi.encodePacked(seed, i))) % (range + 1) : 0;
            uint256 amount = minAmount + extra;

            if (direct) {
                _transferFrom(token, sender, recipients[i], amount);
            } else {
                _transfer(token, recipients[i], amount);
            }
            totalSent += amount;
            unchecked { ++i; }
        }
    }

    // ============ Internal - Helpers ============

    function _computeEqualAmounts(uint256 len, uint256 total) private pure returns (uint256[] memory amounts) {
        amounts = new uint256[](len);
        uint256 amount = total / len;
        uint256 dust = total - (amount * len);

        for (uint256 i; i < len;) {
            amounts[i] = i == 0 ? amount + dust : amount;
            unchecked { ++i; }
        }
    }

    function _sum(uint256[] calldata arr) private pure returns (uint256 total) {
        uint256 len = arr.length;
        for (uint256 i; i < len;) {
            total += arr[i];
            unchecked { ++i; }
        }
    }

    function _copyArray(uint256[] memory source, uint256 length) private pure returns (uint256[] memory dest) {
        dest = new uint256[](length);
        for (uint256 i; i < length;) {
            dest[i] = source[i];
            unchecked { ++i; }
        }
    }

    function _emitResult(address token, uint8 mode, bool direct, Result memory result, uint256 recipientCount) private {
        if (result.failedIndices.length > 0) {
            emit DistributedPartial(_msgSender(), token, mode, result.totalSent, result.successCount, result.failedIndices.length);
        } else {
            emit Distributed(_msgSender(), token, mode, direct, result.totalSent, recipientCount);
        }
    }

    // ============ Internal - ERC20 ============

    function _transfer(address token, address to, uint256 amount) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _tryTransfer(address token, address to, uint256 amount) private returns (bool) {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        return success && (data.length == 0 || abi.decode(data, (bool)));
    }

    function _transferFrom(address token, address from, address to, uint256 amount) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _tryTransferFrom(address token, address from, address to, uint256 amount) private returns (bool) {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        return success && (data.length == 0 || abi.decode(data, (bool)));
    }

    function _balanceOf(address token, address account) private view returns (uint256) {
        (bool success, bytes memory data) = token.staticcall(abi.encodeWithSelector(0x70a08231, account));
        if (!success || data.length < 32) return 0;
        return abi.decode(data, (uint256));
    }
}
