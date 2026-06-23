// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Sweeper7702} from "../src/eip7702/Sweeper7702.sol";
import {BatchSweeper} from "../src/eip7702/BatchSweeper.sol";

/**
 * @title Sweeper7702 / BatchSweeper deploy + address helper (v2)
 * @notice Sweeper7702 is per-relay: its constructor takes the controller (the
 *         relay), so the CREATE2 address differs per relay. BatchSweeper has no
 *         constructor → one global deterministic address per chain.
 *
 *         The TypeScript app predicts the same addresses with
 *         predictCreate2Address(...) in src/lib/deploy/create2.ts. This script is
 *         the canonical cross-check and the source of the bytecode pasted into
 *         pda-apps/wallet-sweep/infra/{sweeper,batchsweeper}-artifact.ts.
 *
 * Usage:
 *   forge script script/Sweeper7702.s.sol --sig "printAddress(address)" <relay>
 *   forge script script/Sweeper7702.s.sol --sig "printBatchSweeper()"
 */
contract Sweeper7702Script is Script {
    // Arachnid deterministic-deployment proxy (same address on every chain).
    address constant CREATE2_PROXY = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    bytes32 constant SALT = bytes32(uint256(0));

    function printBatchSweeper() external pure {
        bytes memory initCode = type(BatchSweeper).creationCode;
        console.log("BatchSweeper predicted:", _computeCreate2Address(initCode, SALT));
    }

    function deployBatchSweeper() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        bytes memory initCode = type(BatchSweeper).creationCode;
        vm.startBroadcast(pk);
        address deployed = _deployViaCreate2Proxy(initCode, SALT);
        vm.stopBroadcast();
        console.log("BatchSweeper deployed at:", deployed);
    }

    function run(address controller) external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        bytes memory initCode = _initCode(controller);

        vm.startBroadcast(deployerPrivateKey);
        address deployed = _deployViaCreate2Proxy(initCode, SALT);
        vm.stopBroadcast();

        console.log("Sweeper7702 controller:", controller);
        console.log("Sweeper7702 deployed at:", deployed);
    }

    /// @notice Print the deterministic address without deploying (CLI cross-check).
    function printAddress(address controller) external pure {
        bytes memory initCode = _initCode(controller);
        console.log("controller:", controller);
        console.log("predicted:", _computeCreate2Address(initCode, SALT));
        console.log("initCodeHash:", uint256(keccak256(initCode)));
    }

    function getDeploymentAddress(address controller) external pure returns (address) {
        return _computeCreate2Address(_initCode(controller), SALT);
    }

    // ----------------------------------------------------------------------

    function _initCode(address controller) internal pure returns (bytes memory) {
        return abi.encodePacked(type(Sweeper7702).creationCode, abi.encode(controller));
    }

    function _deployViaCreate2Proxy(bytes memory initCode, bytes32 salt) internal returns (address) {
        address predicted = _computeCreate2Address(initCode, salt);
        if (predicted.code.length > 0) {
            console.log("Already deployed at:", predicted);
            return predicted;
        }
        bytes memory payload = abi.encodePacked(salt, initCode);
        (bool success, bytes memory ret) = CREATE2_PROXY.call(payload);
        require(success, "CREATE2 deployment failed");
        // forge-lint: disable-next-line(unsafe-typecast)
        address deployed = address(uint160(bytes20(ret)));
        require(deployed == predicted, "Deployed address mismatch");
        return deployed;
    }

    function _computeCreate2Address(bytes memory initCode, bytes32 salt) internal pure returns (address) {
        bytes32 hash = keccak256(abi.encodePacked(bytes1(0xff), CREATE2_PROXY, salt, keccak256(initCode)));
        return address(uint160(uint256(hash)));
    }
}
