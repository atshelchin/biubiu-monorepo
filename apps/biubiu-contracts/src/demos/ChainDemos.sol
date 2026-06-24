// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Self-contained demo contracts for the Contract Caller "chained call" feature.
 *
 * Each scenario is a pair of independent contracts wired together only at
 * call time, so they can be deployed deterministically (CREATE2, fixed salt)
 * to the same address on every chain — the first user to deploy seeds them for
 * everyone else. None of them touch existing on-chain contracts.
 *
 * The point each scenario makes: an earlier call's RETURN value is spliced
 * straight into a later call's parameter, atomically, in one signed
 * transaction — no copy-pasting an intermediate value between two txs.
 *
 * NOTE: intentionally minimal and unaudited. For demonstration only — never
 * hold real value in these.
 */

// ───────────────────────────── Scenario 1 ─────────────────────────────
// Factory makes a brand-new contract → Registry records its (until-now
// unknown) address. Demonstrates ADDRESS forwarding.

/// A trivial contract the factory mints. Its address isn't knowable in advance.
contract Box {
    address public creator;

    constructor() {
        creator = msg.sender;
    }
}

contract BoxFactory {
    uint256 public total;

    event BoxCreated(address indexed box, address indexed by);

    /// Deploy a fresh Box and return its address (output word the chain forwards).
    function createBox() external returns (address box) {
        box = address(new Box());
        unchecked {
            total++;
        }
        emit BoxCreated(box, msg.sender);
    }
}

contract BoxRegistry {
    address public latest;
    uint256 public count;
    mapping(address => bool) public registered;

    event Registered(address indexed box, address indexed by);

    /// Record a box address. The chain feeds this straight from createBox().
    function register(address box) external {
        require(box != address(0), "zero box");
        require(!registered[box], "already registered");
        registered[box] = true;
        latest = box;
        unchecked {
            count++;
        }
        emit Registered(box, msg.sender);
    }
}

// ───────────────────────────── Scenario 2 ─────────────────────────────
// Faucet mints a RANDOM amount of LootToken to you → you transfer exactly
// that amount onward. Demonstrates UINT256 (amount) forwarding.

interface ILoot {
    function mint(address to, uint256 amount) external;
}

/// A minimal ERC20-ish token with an open mint (demo only).
contract LootToken {
    string public constant name = "Demo Loot";
    string public constant symbol = "LOOT";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 value);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        uint256 bal = balanceOf[msg.sender];
        require(bal >= amount, "insufficient balance");
        unchecked {
            balanceOf[msg.sender] = bal - amount;
        }
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
}

contract LootFaucet {
    uint256 public nonce;

    event Rolled(address indexed to, uint256 amount);

    /// Mint a pseudo-random amount of `loot` to the caller; return that amount.
    /// You can't know the number in advance — the chain wires it into transfer().
    function roll(address loot) external returns (uint256 amount) {
        unchecked {
            nonce++;
        }
        uint256 units = (uint256(keccak256(abi.encode(block.prevrandao, msg.sender, nonce))) % 1000) + 1;
        amount = units * 1e18;
        ILoot(loot).mint(msg.sender, amount);
        emit Rolled(msg.sender, amount);
    }
}

// ───────────────────────────── Scenario 3 ─────────────────────────────
// Oracle quotes a price that drifts every block → Market settles at exactly
// that price. Demonstrates forwarding a TIME-SENSITIVE value atomically.

contract PriceOracle {
    /// A price in [100, 999] derived from the previous block hash — it moves
    /// every block, so two separate txs would never settle at the same number.
    function price() external view returns (uint256) {
        uint256 h = uint256(blockhash(block.number - 1));
        return 100 + (h % 900);
    }
}

contract Market {
    uint256 public lastPrice;
    address public lastBuyer;
    uint256 public trades;

    event Bought(address indexed buyer, uint256 price);

    /// Settle at `price`. The chain feeds the oracle's live quote in directly.
    function buy(uint256 price) external {
        lastPrice = price;
        lastBuyer = msg.sender;
        unchecked {
            trades++;
        }
        emit Bought(msg.sender, price);
    }
}

// ───────────────────────────── Scenario 4 ─────────────────────────────
// Drawer reveals a secret number → Lottery claim must match it. The chain
// reads the just-drawn number and hits it in the same tx. Fun UINT256 forward.

interface IDrawer {
    function lastTarget() external view returns (uint256);
}

contract Drawer {
    uint256 public draws;
    uint256 public lastTarget;

    event Drawn(uint256 target);

    /// Draw a secret target in [0, 999999], store and return it.
    function draw() external returns (uint256 target) {
        unchecked {
            draws++;
        }
        target = uint256(keccak256(abi.encode(block.prevrandao, block.timestamp, draws, msg.sender))) % 1_000_000;
        lastTarget = target;
        emit Drawn(target);
    }
}

contract Lottery {
    address public winner;
    uint256 public winningNumber;
    uint256 public wins;

    event Won(address indexed player, uint256 number);

    /// Win only if `guess` matches the drawer's freshly drawn target. The chain
    /// reads the secret and feeds it here in the same atomic tx — a guaranteed
    /// hit that two separate txs can't reliably pull off.
    function claim(address drawer, uint256 guess) external {
        require(guess == IDrawer(drawer).lastTarget(), "missed the draw");
        winner = msg.sender;
        winningNumber = guess;
        unchecked {
            wins++;
        }
        emit Won(msg.sender, guess);
    }
}
