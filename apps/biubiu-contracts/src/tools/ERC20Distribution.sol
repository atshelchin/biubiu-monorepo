// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC2771Context} from "../libraries/ERC2771Context.sol";

/**
 * @title ERC20Distribution
 * @notice Gas-optimized tool for distributing ERC20 tokens to multiple wallets
 * @dev Called via BiuBiuPremium.callTool(), uses ERC2771Context for real sender
 *
 * Two distribution approaches:
 *   - Normal tokens: deposit first, then use transfer() (cheaper gas)
 *   - Deflationary tokens: direct transferFrom() to minimize tax events
 *
 * Four distribution modes for each approach:
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

    // ============ Events ============

    /// @notice Emitted after deposit
    event Deposited(address indexed user, address indexed token, uint256 amount);

    /// @notice Emitted after withdraw
    event Withdrawn(address indexed user, address indexed token, uint256 amount);

    /// @notice Emitted after each distribution
    /// @param sender The real sender (from ERC2771)
    /// @param token The token distributed
    /// @param mode Distribution mode (1=equal, 2=specified, 3=random, 4=randomRange)
    /// @param direct True if direct transferFrom (deflationary), false if from deposit
    /// @param totalAmount Total tokens distributed
    /// @param recipientCount Number of recipients
    event Distributed(
        address indexed sender,
        address indexed token,
        uint8 indexed mode,
        bool direct,
        uint256 totalAmount,
        uint256 recipientCount
    );

    // ============ Storage ============

    /// @notice User balances per token: user => token => balance
    mapping(address => mapping(address => uint256)) public balances;

    // ============ Constructor ============

    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {}

    // ============ Deposit / Withdraw ============

    /**
     * @notice Deposit tokens for later distribution (for normal tokens)
     * @dev User must approve this contract first
     * @param token The ERC20 token address
     * @param amount Amount to deposit
     */
    function deposit(address token, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        address sender = _msgSender();

        uint256 balanceBefore = _balanceOf(token, address(this));
        _transferFrom(token, sender, address(this), amount);
        uint256 received = _balanceOf(token, address(this)) - balanceBefore;

        balances[sender][token] += received;
        emit Deposited(sender, token, received);
    }

    /**
     * @notice Withdraw deposited tokens
     * @param token The ERC20 token address
     * @param amount Amount to withdraw (0 = all)
     */
    function withdraw(address token, uint256 amount) external {
        address sender = _msgSender();
        uint256 bal = balances[sender][token];

        if (amount == 0) {
            amount = bal;
        }
        if (amount > bal) revert InsufficientBalance();

        balances[sender][token] = bal - amount;
        _transfer(token, sender, amount);

        emit Withdrawn(sender, token, amount);
    }

    // ============ Normal Token Distribution (from deposit) ============

    /**
     * @notice Distribute tokens equally from deposited balance
     * @param token The ERC20 token address
     * @param recipients Array of recipient addresses
     * @param totalAmount Total amount to distribute
     */
    function distributeEqual(address token, address[] calldata recipients, uint256 totalAmount) external {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (totalAmount == 0) revert ZeroAmount();

        address sender = _msgSender();
        if (balances[sender][token] < totalAmount) revert InsufficientBalance();
        balances[sender][token] -= totalAmount;

        uint256 amount = totalAmount / len;
        uint256 dust = totalAmount - (amount * len);

        for (uint256 i; i < len;) {
            uint256 amt = amount;
            if (i == 0) amt += dust; // First recipient gets dust
            _transfer(token, recipients[i], amt);
            unchecked {
                ++i;
            }
        }

        emit Distributed(sender, token, 1, false, totalAmount, len);
    }

    /**
     * @notice Distribute specified amounts from deposited balance
     * @param token The ERC20 token address
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts for each recipient
     */
    function distributeSpecified(address token, address[] calldata recipients, uint256[] calldata amounts) external {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (len != amounts.length) revert LengthMismatch();

        address sender = _msgSender();
        uint256 total;

        // Calculate total first
        for (uint256 i; i < len;) {
            total += amounts[i];
            unchecked {
                ++i;
            }
        }

        if (balances[sender][token] < total) revert InsufficientBalance();
        balances[sender][token] -= total;

        // Distribute
        for (uint256 i; i < len;) {
            if (amounts[i] != 0) {
                _transfer(token, recipients[i], amounts[i]);
            }
            unchecked {
                ++i;
            }
        }

        emit Distributed(sender, token, 2, false, total, len);
    }

    /**
     * @notice Distribute tokens randomly from deposited balance
     * @param token The ERC20 token address
     * @param recipients Array of recipient addresses
     * @param totalAmount Total amount to distribute
     */
    function distributeRandom(address token, address[] calldata recipients, uint256 totalAmount) external {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (totalAmount == 0) revert ZeroAmount();

        address sender = _msgSender();
        if (balances[sender][token] < totalAmount) revert InsufficientBalance();
        balances[sender][token] -= totalAmount;

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
                _transfer(token, recipients[i], amount);
                remaining -= amount;
            }
            unchecked {
                ++i;
            }
        }

        emit Distributed(sender, token, 3, false, totalAmount, len);
    }

    /**
     * @notice Distribute with random amounts within a range (strict mode)
     * @dev Requires deposited balance >= maxAmount * len
     * @param token The ERC20 token address
     * @param recipients Array of recipient addresses
     * @param minAmount Minimum amount per recipient
     * @param maxAmount Maximum amount per recipient
     */
    function distributeRandomRange(address token, address[] calldata recipients, uint256 minAmount, uint256 maxAmount)
        external
    {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (minAmount > maxAmount) revert InvalidRange();

        uint256 maxRequired = maxAmount * len;
        address sender = _msgSender();

        if (balances[sender][token] < maxRequired) revert InsufficientBalance();

        bytes32 seed = keccak256(abi.encodePacked(block.timestamp, block.prevrandao, sender));

        uint256 range = maxAmount - minAmount;
        uint256 totalSent;

        for (uint256 i; i < len;) {
            uint256 extra = range != 0 ? uint256(keccak256(abi.encodePacked(seed, i))) % (range + 1) : 0;
            uint256 amount = minAmount + extra;

            _transfer(token, recipients[i], amount);
            totalSent += amount;
            unchecked {
                ++i;
            }
        }

        // Deduct only what was actually sent
        balances[sender][token] -= totalSent;

        emit Distributed(sender, token, 4, false, totalSent, len);
    }

    // ============ Deflationary Token Distribution (direct transferFrom) ============

    /**
     * @notice Distribute tokens equally via direct transferFrom (for deflationary tokens)
     * @dev User must approve this contract. Minimizes transfer count.
     * @param token The ERC20 token address
     * @param recipients Array of recipient addresses
     * @param totalAmount Total amount to pull from sender
     */
    function distributeEqualDirect(address token, address[] calldata recipients, uint256 totalAmount) external {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (totalAmount == 0) revert ZeroAmount();

        address sender = _msgSender();
        uint256 amount = totalAmount / len;
        uint256 dust = totalAmount - (amount * len);

        for (uint256 i; i < len;) {
            uint256 amt = amount;
            if (i == 0) amt += dust;
            _transferFrom(token, sender, recipients[i], amt);
            unchecked {
                ++i;
            }
        }

        emit Distributed(sender, token, 1, true, totalAmount, len);
    }

    /**
     * @notice Distribute specified amounts via direct transferFrom
     * @param token The ERC20 token address
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts for each recipient
     */
    function distributeSpecifiedDirect(address token, address[] calldata recipients, uint256[] calldata amounts)
        external
    {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (len != amounts.length) revert LengthMismatch();

        address sender = _msgSender();
        uint256 total;

        for (uint256 i; i < len;) {
            uint256 amt = amounts[i];
            if (amt != 0) {
                _transferFrom(token, sender, recipients[i], amt);
                total += amt;
            }
            unchecked {
                ++i;
            }
        }

        emit Distributed(sender, token, 2, true, total, len);
    }

    /**
     * @notice Distribute tokens randomly via direct transferFrom
     * @param token The ERC20 token address
     * @param recipients Array of recipient addresses
     * @param totalAmount Total amount to pull from sender
     */
    function distributeRandomDirect(address token, address[] calldata recipients, uint256 totalAmount) external {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (totalAmount == 0) revert ZeroAmount();

        address sender = _msgSender();

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
                _transferFrom(token, sender, recipients[i], amount);
                remaining -= amount;
            }
            unchecked {
                ++i;
            }
        }

        emit Distributed(sender, token, 3, true, totalAmount, len);
    }

    /**
     * @notice Distribute with random amounts within a range via direct transferFrom (strict mode)
     * @dev User must have approved at least maxAmount * len
     * @param token The ERC20 token address
     * @param recipients Array of recipient addresses
     * @param minAmount Minimum amount per recipient
     * @param maxAmount Maximum amount per recipient
     */
    function distributeRandomRangeDirect(
        address token,
        address[] calldata recipients,
        uint256 minAmount,
        uint256 maxAmount
    ) external {
        uint256 len = recipients.length;
        if (len == 0) revert NoRecipients();
        if (minAmount > maxAmount) revert InvalidRange();

        address sender = _msgSender();

        bytes32 seed = keccak256(abi.encodePacked(block.timestamp, block.prevrandao, sender));

        uint256 range = maxAmount - minAmount;
        uint256 totalSent;

        for (uint256 i; i < len;) {
            uint256 extra = range != 0 ? uint256(keccak256(abi.encodePacked(seed, i))) % (range + 1) : 0;
            uint256 amount = minAmount + extra;

            _transferFrom(token, sender, recipients[i], amount);
            totalSent += amount;
            unchecked {
                ++i;
            }
        }

        emit Distributed(sender, token, 4, true, totalSent, len);
    }

    // ============ Internal ERC20 Helpers ============

    function _transfer(address token, address to, uint256 amount) private {
        (bool success, bytes memory data) =
            token.call(
                abi.encodeWithSelector(0xa9059cbb, to, amount) // transfer(address,uint256)
            );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }

    function _transferFrom(address token, address from, address to, uint256 amount) private {
        (bool success, bytes memory data) =
            token.call(
                abi.encodeWithSelector(0x23b872dd, from, to, amount) // transferFrom(address,address,uint256)
            );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }

    function _balanceOf(address token, address account) private view returns (uint256) {
        (bool success, bytes memory data) =
            token.staticcall(
                abi.encodeWithSelector(0x70a08231, account) // balanceOf(address)
            );
        if (!success || data.length < 32) return 0;
        return abi.decode(data, (uint256));
    }
}
