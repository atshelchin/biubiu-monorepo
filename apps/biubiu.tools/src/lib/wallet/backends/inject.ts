/**
 * inject 后端：浏览器注入钱包（EIP-6963，含 window.ethereum legacy 兜底）。
 *
 * 连接流程：发现钱包 → eth_requestAccounts → 读当前链 → gate.classifyAccount。
 * 纯 EOA 会在 gate 抛 NotSmartAccountError（按既定策略直接拒绝）。
 */
import { browser } from '$app/environment';
import { type Address, getAddress } from 'viem';
import type { Eip1193Provider, Eip6963ProviderDetail } from '../eip1193.js';
import type { WalletKind } from '../types.js';
import { classifyAccount } from '../gate.js';
import { Eip1193Wallet } from './eip1193-base.js';

export class InjectWallet extends Eip1193Wallet {
	readonly kind: WalletKind = 'inject';

	/** 注入钱包元信息（图标 / 名称），供 UI 展示已连接的钱包。 */
	constructor(
		provider: Eip1193Provider,
		address: Address,
		accountType: InjectWallet['accountType'],
		chainId: number,
		readonly info: { name: string; icon: string; rdns: string }
	) {
		super(provider, address, accountType, chainId);
	}
}

interface Eip6963AnnounceEvent extends Event {
	detail: Eip6963ProviderDetail;
}

/**
 * 发现注入钱包：派发 eip6963:requestProvider，收集 announce 事件。
 * 若无 EIP-6963 钱包但存在 legacy window.ethereum，合成一个兜底条目。
 */
export function discoverInjectedProviders(timeoutMs = 400): Promise<Eip6963ProviderDetail[]> {
	if (!browser) return Promise.resolve([]);

	return new Promise((resolve) => {
		const found = new Map<string, Eip6963ProviderDetail>();
		const handler = (event: Event) => {
			const detail = (event as Eip6963AnnounceEvent).detail;
			if (detail?.info?.uuid) found.set(detail.info.uuid, detail);
		};

		window.addEventListener('eip6963:announceProvider', handler);
		window.dispatchEvent(new Event('eip6963:requestProvider'));

		setTimeout(() => {
			window.removeEventListener('eip6963:announceProvider', handler);
			if (found.size === 0) {
				const legacy = (window as { ethereum?: Eip1193Provider }).ethereum;
				if (legacy) {
					found.set('legacy', {
						info: {
							uuid: 'legacy',
							name: 'Injected Wallet',
							icon: '',
							rdns: 'legacy.injected'
						},
						provider: legacy
					});
				}
			}
			resolve([...found.values()]);
		}, timeoutMs);
	});
}

/**
 * 连接选定的注入钱包。门禁不通过（纯 EOA）时抛 NotSmartAccountError。
 */
export async function connectInjected(detail: Eip6963ProviderDetail): Promise<InjectWallet> {
	const provider = detail.provider;

	const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
	if (!accounts?.length) throw new Error('No account authorized');
	const address = getAddress(accounts[0]) as Address;

	const chainIdHex = (await provider.request({ method: 'eth_chainId' })) as string;
	const chainId = parseInt(chainIdHex, 16);

	// 门禁：当前链上必须是智能合约钱包，否则抛错。
	const accountType = await classifyAccount(provider, address, chainId);

	return new InjectWallet(provider, address, accountType, chainId, {
		name: detail.info.name,
		icon: detail.info.icon,
		rdns: detail.info.rdns
	});
}
