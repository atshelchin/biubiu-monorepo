/**
 * Safe ERC-4337 常量 + 多网络配置。
 */
import { keccak256, toHex } from 'viem';

export { CONTRACTS } from '../compute-safe-address.js';

/** Alchemy 网络标识 → 链配置 */
export const CHAIN_CONFIG: Record<
	string,
	{ chainId: bigint; alchemySlug: string; explorerUrl: string; explorerName: string; nativeSymbol: string }
> = {
	'eth-mainnet': {
		chainId: 1n,
		alchemySlug: 'eth-mainnet',
		explorerUrl: 'https://etherscan.io/tx/',
		explorerName: 'Etherscan',
		nativeSymbol: 'ETH'
	},
	'arb-mainnet': {
		chainId: 42161n,
		alchemySlug: 'arb-mainnet',
		explorerUrl: 'https://arbiscan.io/tx/',
		explorerName: 'Arbiscan',
		nativeSymbol: 'ETH'
	},
	'base-mainnet': {
		chainId: 8453n,
		alchemySlug: 'base-mainnet',
		explorerUrl: 'https://basescan.org/tx/',
		explorerName: 'BaseScan',
		nativeSymbol: 'ETH'
	},
	'opt-mainnet': {
		chainId: 10n,
		alchemySlug: 'opt-mainnet',
		explorerUrl: 'https://optimistic.etherscan.io/tx/',
		explorerName: 'Optimism Explorer',
		nativeSymbol: 'ETH'
	},
	'matic-mainnet': {
		chainId: 137n,
		alchemySlug: 'polygon-mainnet',
		explorerUrl: 'https://polygonscan.com/tx/',
		explorerName: 'PolygonScan',
		nativeSymbol: 'POL'
	},
	'bnb-mainnet': {
		chainId: 56n,
		alchemySlug: 'bnb-mainnet',
		explorerUrl: 'https://bscscan.com/tx/',
		explorerName: 'BscScan',
		nativeSymbol: 'BNB'
	},
	'avax-mainnet': {
		chainId: 43114n,
		alchemySlug: 'avax-mainnet',
		explorerUrl: 'https://snowtrace.io/tx/',
		explorerName: 'Snowtrace',
		nativeSymbol: 'AVAX'
	},
	'polygon-amoy': {
		chainId: 80002n,
		alchemySlug: 'polygon-amoy',
		explorerUrl: 'https://amoy.polygonscan.com/tx/',
		explorerName: 'Amoy Explorer',
		nativeSymbol: 'POL'
	}
};

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
