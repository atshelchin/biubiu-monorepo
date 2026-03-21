/**
 * BiuBiuPremium 合约交互（Arbitrum）。
 *
 * ABI + Bytecode 从 forge 编译产物提取（BiuBiuPremium.artifact.ts）。
 * 读取订阅状态 + 构造 subscribe / transfer / deploy 的 callData。
 */
import { encodeFunctionData, type Address, type Hex } from 'viem';
import { readContract } from '$lib/contractReader.js';
import { BIUBIU_PREMIUM_ABI, BIUBIU_PREMIUM_BYTECODE } from './BiuBiuPremium.artifact.js';

export const PREMIUM_CONTRACT_ADDRESS: Address = '0xFEB30A8ee36D0d51F04cf330676E6E2433D1DacE';
export const ARBITRUM_CHAIN_ID = 42161;

/** 合约 ABI（从 forge 编译产物提取） */
export const PREMIUM_ABI = BIUBIU_PREMIUM_ABI;

/** 合约部署字节码 */
export const PREMIUM_BYTECODE = BIUBIU_PREMIUM_BYTECODE;

// ─── Deployment Check ───

/** 检查合约是否已部署 */
export async function isContractDeployed(): Promise<boolean> {
	try {
		// 用 getEthUsdPrice() 做一个简单调用，如果成功说明已部署
		await readContract(
			ARBITRUM_CHAIN_ID,
			PREMIUM_CONTRACT_ADDRESS,
			PREMIUM_ABI,
			'MONTHLY_PRICE_USD'
		);
		return true;
	} catch {
		return false;
	}
}

// ─── Read Functions ───

export interface SubscriptionInfo {
	isPremium: boolean;
	expiryTime: bigint;
	remainingTime: bigint;
}

export async function getSubscriptionInfo(user: Address): Promise<SubscriptionInfo> {
	const result = (await readContract(
		ARBITRUM_CHAIN_ID,
		PREMIUM_CONTRACT_ADDRESS,
		PREMIUM_ABI,
		'getSubscriptionInfo',
		[user]
	)) as [boolean, bigint, bigint];

	return {
		isPremium: result[0],
		expiryTime: result[1],
		remainingTime: result[2]
	};
}

/** Get subscription price in wei for a tier (0=monthly, 1=yearly) */
export async function getPrice(tier: number): Promise<bigint> {
	return (await readContract(
		ARBITRUM_CHAIN_ID,
		PREMIUM_CONTRACT_ADDRESS,
		PREMIUM_ABI,
		'getPrice',
		[tier]
	)) as bigint;
}

/** Get ETH/USD price (8 decimals) */
export async function getEthUsdPrice(): Promise<bigint> {
	return (await readContract(
		ARBITRUM_CHAIN_ID,
		PREMIUM_CONTRACT_ADDRESS,
		PREMIUM_ABI,
		'getEthUsdPrice'
	)) as bigint;
}

/** Get user's active subscription token ID (0 = none) */
export async function getActiveTokenId(user: Address): Promise<bigint> {
	return (await readContract(
		ARBITRUM_CHAIN_ID,
		PREMIUM_CONTRACT_ADDRESS,
		PREMIUM_ABI,
		'activeSubscription',
		[user]
	)) as bigint;
}

// ─── CallData Builders (for Safe UserOp) ───

const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000';

/**
 * Build callData for subscribe().
 */
export function buildSubscribeCallData(
	tier: number,
	recipient: Address = ZERO_ADDRESS,
	referrer: Address = ZERO_ADDRESS
): Hex {
	return encodeFunctionData({
		abi: PREMIUM_ABI,
		functionName: 'subscribe',
		args: [tier, referrer, recipient, 'web']
	});
}

/**
 * Build callData for subscribeToToken() (renew existing NFT).
 */
export function buildRenewCallData(
	tokenId: bigint,
	tier: number,
	referrer: Address = ZERO_ADDRESS
): Hex {
	return encodeFunctionData({
		abi: PREMIUM_ABI,
		functionName: 'subscribeToToken',
		args: [tokenId, tier, referrer, 'web']
	});
}

/**
 * Build callData for safeTransferFrom() (transfer NFT).
 */
export function buildTransferCallData(
	from: Address,
	to: Address,
	tokenId: bigint
): Hex {
	return encodeFunctionData({
		abi: PREMIUM_ABI,
		functionName: 'safeTransferFrom',
		args: [from, to, tokenId]
	});
}

/** Add 3% buffer to price to prevent tx revert from price fluctuation */
export function addPriceBuffer(price: bigint): bigint {
	return (price * 103n) / 100n;
}

// ─── Deploy ───

/**
 * CREATE2 deterministic deployment proxy 地址（标准）。
 * 合约部署 payload = salt (32 bytes) + bytecode。
 */
export const CREATE2_PROXY: Address = '0x4e59b44847b379578588920cA78FbF26c0B4956C';
export const DEPLOY_SALT: Hex = '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * 构造通过 CREATE2 Proxy 部署合约的 callData。
 * Safe 调用 CREATE2_PROXY，data = salt + bytecode。
 */
export function buildDeployData(): Hex {
	// CREATE2 proxy 接受 raw payload: salt (32 bytes) + bytecode
	// 不是 ABI 编码，直接拼接
	return (DEPLOY_SALT + PREMIUM_BYTECODE.slice(2)) as Hex;
}
