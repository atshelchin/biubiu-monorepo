// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ERC2771Context
 * @notice Base contract for BiuBiu tools to receive forwarded calls from BiuBiuPremium
 * @dev Implements ERC-2771 receiver pattern. Extracts real sender from calldata suffix.
 *
 * Usage:
 *   contract MyTool is ERC2771Context {
 *       constructor() ERC2771Context(BIUBIU_PREMIUM_ADDRESS) {}
 *
 *       function doSomething() external {
 *           address realUser = _msgSender(); // Gets actual caller, not BiuBiuPremium
 *       }
 *   }
 */
abstract contract ERC2771Context {
    address public immutable trustedForwarder;

    constructor(address _trustedForwarder) {
        trustedForwarder = _trustedForwarder;
    }

    /// @notice Returns the real sender: from calldata suffix if called via trusted forwarder
    function _msgSender() internal view returns (address sender) {
        if (msg.sender == trustedForwarder && msg.data.length >= 20) {
            // Extract last 20 bytes as the real sender
            assembly {
                sender := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        } else {
            sender = msg.sender;
        }
    }

    /// @notice Returns the real calldata: strips sender suffix if called via trusted forwarder
    function _msgData() internal view returns (bytes calldata) {
        if (msg.sender == trustedForwarder && msg.data.length >= 20) {
            return msg.data[:msg.data.length - 20];
        } else {
            return msg.data;
        }
    }

    /// @notice Check if the call is from the trusted forwarder
    function isTrustedForwarder(address forwarder) public view returns (bool) {
        return forwarder == trustedForwarder;
    }
}
