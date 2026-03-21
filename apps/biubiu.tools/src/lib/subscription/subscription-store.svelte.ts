/**
 * 订阅状态全局 store。
 *
 * 登录后自动查询 Arbitrum 上的会员状态，全局可用。
 */
import { browser } from '$app/environment';
import type { Address } from 'viem';
import { getSubscriptionInfo, getActiveTokenId, type SubscriptionInfo } from './subscription-contract.js';

class SubscriptionStore {
	/** 是否是会员 */
	isPremium = $state(false);
	/** 到期时间（Unix 秒） */
	expiryTime = $state(0n);
	/** 剩余秒数 */
	remainingTime = $state(0n);
	/** 激活的 NFT tokenId（0=无） */
	activeTokenId = $state(0n);
	/** 是否正在加载 */
	loading = $state(false);
	/** 是否已加载过 */
	loaded = $state(false);

	/** 剩余天数（向上取整） */
	get remainingDays(): number {
		if (this.remainingTime <= 0n) return 0;
		return Math.ceil(Number(this.remainingTime) / 86400);
	}

	/** 到期日期 */
	get expiryDate(): Date | null {
		if (this.expiryTime <= 0n) return null;
		return new Date(Number(this.expiryTime) * 1000);
	}

	/** 查询订阅状态 */
	async load(safeAddress: Address): Promise<void> {
		if (!browser) return;
		this.loading = true;

		try {
			const [info, tokenId] = await Promise.all([
				getSubscriptionInfo(safeAddress),
				getActiveTokenId(safeAddress)
			]);

			this.isPremium = info.isPremium;
			this.expiryTime = info.expiryTime;
			this.remainingTime = info.remainingTime;
			this.activeTokenId = tokenId;
		} catch {
			// 合约未部署或 RPC 失败时静默处理
		} finally {
			this.loading = false;
			this.loaded = true;
		}
	}

	/** 重置 */
	reset(): void {
		this.isPremium = false;
		this.expiryTime = 0n;
		this.remainingTime = 0n;
		this.activeTokenId = 0n;
		this.loading = false;
		this.loaded = false;
	}
}

export const subscriptionStore = new SubscriptionStore();
