// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {Forever} from "../src/tools/Forever.sol";

/**
 * @notice Deterministic CREATE2 deployment of the Forever protocol.
 *
 * The Forever contract has NO constructor arguments, so its creation bytecode is identical on
 * every chain. Deployed through the canonical deterministic-deployment proxy with a fixed salt,
 * the resulting address is byte-identical on every chain — a single recognizable protocol
 * address that any client can target.
 *
 * Usage:
 *   forge script script/Forever.s.sol --sig "printAddress()"            # compute canonical address (no chain)
 *   forge script script/Forever.s.sol --rpc-url base --broadcast        # deploy to a chain
 */
contract ForeverScript is Script {
    /// @notice CREATE2 deterministic deployment proxy (same address on all chains).
    address constant CREATE2_PROXY = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    /// @notice Fixed salt for the canonical deployment.
    bytes32 constant SALT = bytes32(uint256(0));

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        bytes memory bytecode = type(Forever).creationCode;
        Forever forever = Forever(payable(_deployViaCreate2(bytecode, SALT)));

        console.log("Forever deployed at:", address(forever));
        console.log("  fee (wei):", forever.fee());
        console.log("  maxPayload:", forever.maxPayload());
        console.log("  treasury:", forever.treasury());
        console.log("  OWNER:", forever.OWNER());

        vm.stopBroadcast();
    }

    /// @notice Print the canonical deterministic address (pure computation; no broadcast/chain).
    function printAddress() external pure {
        bytes memory bytecode = type(Forever).creationCode;
        address predicted = _computeCreate2Address(bytecode, SALT);
        console.log("Forever canonical address:", predicted);
        console.log("Salt:", uint256(SALT));
        console.log("Creation bytecode hash:", uint256(keccak256(bytecode)));
        console.log("(Identical on every EVM chain - no constructor args.)");
    }

    function _deployViaCreate2(bytes memory bytecode, bytes32 salt) internal returns (address) {
        address predicted = _computeCreate2Address(bytecode, salt);
        if (predicted.code.length > 0) {
            console.log("Already deployed at:", predicted);
            return predicted;
        }

        bytes memory payload = abi.encodePacked(salt, bytecode);
        (bool success, bytes memory returnData) = CREATE2_PROXY.call(payload);
        require(success, "CREATE2 deployment failed");

        // forge-lint: disable-next-line(unsafe-typecast)
        address deployed = address(uint160(bytes20(returnData)));
        require(deployed == predicted, "Deployed address mismatch");
        return deployed;
    }

    function _computeCreate2Address(bytes memory bytecode, bytes32 salt) internal pure returns (address) {
        bytes32 hash = keccak256(abi.encodePacked(bytes1(0xff), CREATE2_PROXY, salt, keccak256(bytecode)));
        return address(uint160(uint256(hash)));
    }
}
