// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "../interfaces/IERC20.sol";

/**
 * @title Sweeper7702
 * @notice EIP-7702 delegate for the biubiu.tools "Wallet Sweep" tool (v2).
 *
 *         An EOA delegates its code to this contract via an EIP-7702
 *         authorization. Once delegated, only the `controller` (the user's
 *         throwaway relay EOA, baked in at deploy time) may pull all of the
 *         EOA's native coin + arbitrary ERC20 balances out to a chosen
 *         destination.
 *
 * @dev    Authorization is by `tx.origin == controller`, NOT msg.sender. This
 *         lets the relay sweep up to ~100 EOAs in ONE transaction by calling a
 *         shared BatchSweeper that loops `eoa.sweep(...)`: inside that loop
 *         msg.sender is the BatchSweeper, but tx.origin stays the relay.
 *
 *         tx.origin is safe HERE specifically because `controller` is a
 *         dedicated, single-purpose relay key that only ever originates
 *         transactions to our own BatchSweeper / Sweeper — there is no path for
 *         it to be tricked into originating a malicious call (the classic
 *         tx.origin phishing vector does not apply).
 *
 *         Stateless: `controller` is an immutable (in code, not EOA storage), so
 *         there is no storage-slot collision with the EOA and no re-init race.
 *         One Sweeper is deployed per relay (CREATE2; uniqueness from the ctor
 *         arg), so only that relay can sweep the EOAs delegated to it.
 */
contract Sweeper7702 {
    /// @notice The relay allowed to sweep (as tx.origin). Set at deploy, never changes.
    address public immutable controller;

    error NotController();
    error NativeSendFailed();

    constructor(address _controller) {
        controller = _controller;
    }

    /**
     * @notice Sweep every token in `erc20s` (best-effort) then all native to `dest`.
     * @param dest   recipient of the swept assets.
     * @param erc20s ERC20 token addresses to drain; each is best-effort.
     */
    function sweep(address dest, address[] calldata erc20s) external {
        if (tx.origin != controller) revert NotController();

        for (uint256 i; i < erc20s.length;) {
            address token = erc20s[i];
            (bool okBal, bytes memory balData) =
                token.staticcall(abi.encodeWithSelector(IERC20.balanceOf.selector, address(this)));
            if (okBal && balData.length >= 32) {
                uint256 bal = abi.decode(balData, (uint256));
                if (bal > 0) {
                    // Best-effort: tolerate non-standard / reverting tokens.
                    (bool okT, bytes memory ret) =
                        token.call(abi.encodeWithSelector(IERC20.transfer.selector, dest, bal));
                    okT;
                    ret;
                }
            }
            unchecked {
                ++i;
            }
        }

        uint256 nativeBal = address(this).balance;
        if (nativeBal > 0) {
            (bool okN,) = dest.call{value: nativeBal}("");
            if (!okN) revert NativeSendFailed();
        }
    }

    /// @dev Allow the EOA (in delegated context) to receive native.
    receive() external payable {}
}
