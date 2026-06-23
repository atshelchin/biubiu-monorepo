// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Sweeper7702} from "./Sweeper7702.sol";

/**
 * @title BatchSweeper
 * @notice Global, deterministic helper that sweeps many EIP-7702-delegated EOAs
 *         in a single transaction for the biubiu.tools "Wallet Sweep" tool (v2).
 *
 * @dev    The relay sends ONE (type-4) transaction to this contract; the EOAs'
 *         authorizations in that tx delegate them to their Sweeper7702 first,
 *         then `sweepMany` loops calling `eoa.sweep(dest, erc20s)`. Each Sweeper
 *         checks `tx.origin == controller` (the relay), so:
 *           - only the relay can drive a sweep (no auth needed in THIS contract);
 *           - one failing EOA is skipped (try/catch), never blocking the batch.
 *
 *         No owner, no state — safe to deploy once per chain at a deterministic
 *         CREATE2 address. The optional service fee is forwarded from msg.value
 *         to `feeCollector` (the relay attaches it on the first batch).
 */
contract BatchSweeper {
    event Swept(address indexed eoa, bool ok);

    error FeeTransferFailed();

    /**
     * @param eoas         the delegated EOAs to sweep.
     * @param dest         recipient of all swept assets.
     * @param erc20s       ERC20 tokens to drain from each EOA (native always swept).
     * @param feeCollector recipient of the service fee (msg.value); ignored if 0.
     */
    function sweepMany(
        address[] calldata eoas,
        address dest,
        address[] calldata erc20s,
        address feeCollector
    ) external payable {
        if (msg.value > 0 && feeCollector != address(0)) {
            (bool okFee,) = feeCollector.call{value: msg.value}("");
            if (!okFee) revert FeeTransferFailed();
        }

        for (uint256 i; i < eoas.length;) {
            // Best-effort per EOA: a single failure (e.g. reverting dest, weird
            // token) is skipped so the rest of the batch still sweeps.
            try Sweeper7702(payable(eoas[i])).sweep(dest, erc20s) {
                emit Swept(eoas[i], true);
            } catch {
                emit Swept(eoas[i], false);
            }
            unchecked {
                ++i;
            }
        }
    }
}
