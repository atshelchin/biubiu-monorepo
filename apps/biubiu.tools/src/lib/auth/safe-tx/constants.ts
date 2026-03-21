/**
 * Safe ERC-4337 常量。
 */
import { keccak256, toHex } from 'viem';

export { CONTRACTS } from '../compute-safe-address.js';

export const ARBITRUM_CHAIN_ID = 42161n;

/** EIP-712 SafeOp TypeHash */
export const SAFE_OP_TYPEHASH = keccak256(
	toHex(
		'SafeOp(address safe,uint256 nonce,bytes initCode,bytes callData,uint128 verificationGasLimit,uint128 callGasLimit,uint256 preVerificationGas,uint128 maxPriorityFeePerGas,uint128 maxFeePerGas,bytes paymasterAndData,uint48 validAfter,uint48 validUntil,address entryPoint)'
	)
);

/** EIP-712 Domain Separator TypeHash */
export const DOMAIN_SEPARATOR_TYPEHASH = keccak256(
	toHex('EIP712Domain(uint256 chainId,address verifyingContract)')
);
