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
	/** 是否已加载过（仅成功加载后置 true） */
	loaded = $state(false);
	/** 当前 isPremium 等字段所对应的 Safe 地址（小写）。换号即失效，防止读到别的地址的会员状态。 */
	loadedFor = $state<string | null>(null);
	/** 正在加载中的目标地址（小写）。用于并发去重：首次加载未完成时 loadedFor 仍为 null，
	 *  靠它让并发的 ensureMembershipLoaded 不重复发起 RPC。 */
	loadingFor = $state<string | null>(null);

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
		const target = safeAddress.toLowerCase();
		this.loading = true;
		this.loadingFor = target;

		// 切换到新地址时先清空旧状态：这样 RPC 失败会「失败即非会员」(fail-closed)，
		// 绝不残留上一个地址的 isPremium=true。
		if (this.loadedFor !== target) {
			this.isPremium = false;
			this.expiryTime = 0n;
			this.remainingTime = 0n;
			this.activeTokenId = 0n;
			this.loaded = false;
			this.loadedFor = null;
		}

		try {
			const [info, tokenId] = await Promise.all([
				getSubscriptionInfo(safeAddress),
				getActiveTokenId(safeAddress)
			]);

			this.isPremium = info.isPremium;
			this.expiryTime = info.expiryTime;
			this.remainingTime = info.remainingTime;
			this.activeTokenId = tokenId;
			// 仅在成功后标记已加载 + 记录对应地址；失败则保持 loaded=false 以便重试。
			this.loadedFor = target;
			this.loaded = true;
		} catch {
			// 合约未部署或 RPC 失败时静默处理（保持 fail-closed，不 latch loaded）
		} finally {
			this.loading = false;
			if (this.loadingFor === target) this.loadingFor = null;
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
		this.loadedFor = null;
		this.loadingFor = null;
	}
}

export const subscriptionStore = new SubscriptionStore();
