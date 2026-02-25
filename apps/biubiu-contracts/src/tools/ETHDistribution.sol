// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC2771Context} from "../libraries/ERC2771Context.sol";

/**
 * @title ETHDistribution
 * @notice Gas-optimized tool for distributing ETH to multiple wallets
 * @dev Called via BiuBiuPremium.callTool(), uses ERC2771Context for real sender
 *
 * Four distribution modes:
 *   1. Equal: total ETH divided equally among recipients
 *   2. Specified: exact amount for each recipient
 *   3. Random: random distribution based on weights
 *   4. RandomRange: random amount within min/max range
 *
 * All modes support Options for gas limit protection and partial failure handling.
 * Set allowPartialFailure=false for strict mode (reverts on any failure).
 */
contract ETHDistribution is ERC2771Context {
    // ============ Errors ============

    error NoRecipients();
    error LengthMismatch();
    error InsufficientValue();
    error TransferFailed();
    error InvalidRange();

    // ============ Structs ============

    /// @notice Options for distribution
    /// @param gasLimit Gas limit per transfer (0 = unlimited)
    /// @param allowPartialFailure If true, continue on failure and return failed indices
    struct Options {
        uint256 gasLimit;
        bool allowPartialFailure;
    }

    /// @notice Result of distribution
    /// @param totalSent Total ETH successfully sent
    /// @param successCount Number of successful transfers
    /// @param failedIndices Indices of failed recipients (empty if all succeeded)
    struct Result {
        uint256 totalSent;
        uint256 successCount;
        uint256[] failedIndices;
    }

    // ============ Events ============

    event Distributed(address indexed sender, uint8 indexed mode, uint256 totalAmount, uint256 recipientCount);
    event DistributedPartial(address indexed sender, uint8 indexed mode, uint256 totalSent, uint256 successCount, uint256 failCount);
    event TransferSkipped(address indexed recipient, uint256 indexed index, uint256 amount);

    // ============ Constants ============

    uint256 public constant DEFAULT_GAS_LIMIT = 50000;

    // ============ Constructor ============

    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {}

    // ============ Distribution Methods ============

    /**
     * @notice Distribute ETH equally among recipients
     * @param recipients Array of recipient addresses
     * @param options Gas limit and failure handling options
     * @return result Distribution result
     */
    function distributeEqual(address[] calldata recipients, Options calldata options)
        external
        payable
        returns (Result memory result)
    {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();

        uint256 amount = msg.value / len;
        if (amount == 0) revert InsufficientValue();

        result = _distribute(recipients, amount, options);

        uint256 refund = msg.value - result.totalSent;
        if (refund != 0) {
            _send(_msgSender(), refund);
        }

        _emitResult(1, result, len);
    }

    /**
     * @notice Distribute specified amounts to each recipient
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts for each recipient
     * @param options Gas limit and failure handling options
     * @return result Distribution result
     */
    function distributeSpecified(
        address[] calldata recipients,
        uint256[] calldata amounts,
        Options calldata options
    ) external payable returns (Result memory result) {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (len != amounts.length) revert LengthMismatch();

        uint256 totalRequired;
        for (uint256 i; i < len;) {
            totalRequired += amounts[i];
            unchecked { ++i; }
        }
        if (msg.value < totalRequired) revert InsufficientValue();

        result = _distributeAmounts(recipients, amounts, options);

        uint256 refund = msg.value - result.totalSent;
        if (refund != 0) {
            _send(_msgSender(), refund);
        }

        _emitResult(2, result, len);
    }

    /**
     * @notice Distribute ETH randomly among recipients
     * @param recipients Array of recipient addresses
     */
    function distributeRandom(address[] calldata recipients) external payable {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (msg.value == 0) revert InsufficientValue();

        bytes32 seed = keccak256(abi.encodePacked(block.timestamp, block.prevrandao, msg.sender, msg.value));
        uint256 remaining = msg.value;

        for (uint256 i; i < len;) {
            uint256 amount;
            if (i == len - 1) {
                amount = remaining;
            } else {
                uint256 pct = (uint256(keccak256(abi.encodePacked(seed, i))) % 50) + 1;
                amount = (remaining * pct) / 100;
            }

            if (amount != 0) {
                _send(recipients[i], amount);
                remaining -= amount;
            }
            unchecked { ++i; }
        }

        emit Distributed(_msgSender(), 3, msg.value, len);
    }

    /**
     * @notice Distribute with random amounts within a range
     * @param recipients Array of recipient addresses
     * @param minAmount Minimum amount per recipient
     * @param maxAmount Maximum amount per recipient
     */
    function distributeRandomRange(address[] calldata recipients, uint256 minAmount, uint256 maxAmount)
        external
        payable
    {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (minAmount > maxAmount) revert InvalidRange();
        if (msg.value < maxAmount * len) revert InsufficientValue();

        bytes32 seed = keccak256(abi.encodePacked(block.timestamp, block.prevrandao, msg.sender));
        uint256 range = maxAmount - minAmount;
        uint256 totalSent;

        for (uint256 i; i < len;) {
            uint256 extra = range != 0 ? uint256(keccak256(abi.encodePacked(seed, i))) % (range + 1) : 0;
            uint256 amount = minAmount + extra;

            _send(recipients[i], amount);
            totalSent += amount;
            unchecked { ++i; }
        }

        uint256 refund = msg.value - totalSent;
        if (refund != 0) {
            _send(_msgSender(), refund);
        }

        emit Distributed(_msgSender(), 4, totalSent, len);
    }

    // ============ Validation ============

    /**
     * @notice Validate recipients can receive ETH (sends 1 wei to test)
     * @param recipients Array of recipient addresses
     * @param gasLimit Gas limit per test transfer (0 = use default)
     * @return validCount Number of valid recipients
     * @return invalidIndices Indices of recipients that cannot receive ETH
     */
    function validateRecipients(address[] calldata recipients, uint256 gasLimit)
        external
        payable
        returns (uint256 validCount, uint256[] memory invalidIndices)
    {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (msg.value < len) revert InsufficientValue();

        uint256 limit = gasLimit == 0 ? DEFAULT_GAS_LIMIT : gasLimit;
        uint256[] memory tempInvalid = new uint256[](len);
        uint256 invalidCount;

        for (uint256 i; i < len;) {
            bool success = _trySend(recipients[i], 1, limit);
            if (success) {
                unchecked { ++validCount; }
            } else {
                tempInvalid[invalidCount] = i;
                unchecked { ++invalidCount; }
            }
            unchecked { ++i; }
        }

        invalidIndices = new uint256[](invalidCount);
        for (uint256 i; i < invalidCount;) {
            invalidIndices[i] = tempInvalid[i];
            unchecked { ++i; }
        }

        uint256 refund = msg.value - validCount;
        if (refund != 0) {
            _send(_msgSender(), refund);
        }
    }

    /**
     * @notice Check if address is EOA or contract
     * @param recipient Address to check
     * @return isEOA True if no code (likely EOA)
     * @return codeSize Size of code at address
     */
    function checkRecipient(address recipient) external view returns (bool isEOA, uint256 codeSize) {
        assembly {
            codeSize := extcodesize(recipient)
        }
        isEOA = codeSize == 0;
    }

    // ============ Internal ============

    function _distribute(
        address[] calldata recipients,
        uint256 amount,
        Options calldata options
    ) private returns (Result memory result) {
        uint256 len = recipients.length;
        uint256[] memory tempFailed = new uint256[](len);
        uint256 failCount;

        for (uint256 i; i < len;) {
            bool success = options.gasLimit > 0
                ? _trySend(recipients[i], amount, options.gasLimit)
                : _trySendUnlimited(recipients[i], amount);

            if (success) {
                result.totalSent += amount;
                unchecked { ++result.successCount; }
            } else {
                if (!options.allowPartialFailure) revert TransferFailed();
                emit TransferSkipped(recipients[i], i, amount);
                tempFailed[failCount] = i;
                unchecked { ++failCount; }
            }
            unchecked { ++i; }
        }

        result.failedIndices = _copyArray(tempFailed, failCount);
    }

    function _distributeAmounts(
        address[] calldata recipients,
        uint256[] calldata amounts,
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

            bool success = options.gasLimit > 0
                ? _trySend(recipients[i], amt, options.gasLimit)
                : _trySendUnlimited(recipients[i], amt);

            if (success) {
                result.totalSent += amt;
                unchecked { ++result.successCount; }
            } else {
                if (!options.allowPartialFailure) revert TransferFailed();
                emit TransferSkipped(recipients[i], i, amt);
                tempFailed[failCount] = i;
                unchecked { ++failCount; }
            }
            unchecked { ++i; }
        }

        result.failedIndices = _copyArray(tempFailed, failCount);
    }

    function _emitResult(uint8 mode, Result memory result, uint256 recipientCount) private {
        if (result.failedIndices.length > 0) {
            emit DistributedPartial(_msgSender(), mode, result.totalSent, result.successCount, result.failedIndices.length);
        } else {
            emit Distributed(_msgSender(), mode, result.totalSent, recipientCount);
        }
    }

    function _copyArray(uint256[] memory source, uint256 length) private pure returns (uint256[] memory dest) {
        dest = new uint256[](length);
        for (uint256 i; i < length;) {
            dest[i] = source[i];
            unchecked { ++i; }
        }
    }

    function _send(address to, uint256 amount) private {
        assembly {
            if iszero(call(gas(), to, amount, 0, 0, 0, 0)) {
                mstore(0, 0x90b8ec18) // TransferFailed()
                revert(0x1c, 0x04)
            }
        }
    }

    function _trySend(address to, uint256 amount, uint256 gasLimit) private returns (bool success) {
        assembly {
            success := call(gasLimit, to, amount, 0, 0, 0, 0)
        }
    }

    function _trySendUnlimited(address to, uint256 amount) private returns (bool success) {
        assembly {
            success := call(gas(), to, amount, 0, 0, 0, 0)
        }
    }

    receive() external payable {}
}
