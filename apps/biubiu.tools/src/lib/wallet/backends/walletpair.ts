/**
 * walletpair 后端：扫码配对协议（类 WalletConnect，但 relay-blind、零注册）。
 *
 * 连接是两阶段的：
 *   1. `startWalletPair()` 建会话 + 出二维码 URI + 指纹，UI 展示给用户扫码。
 *   2. 用户钱包扫码并接受后 phase → 'connected'，此时跑门禁（必须智能合约钱包）
 *      并包成 `WalletPairWallet`（复用 EIP-1193 基类，因为我们的 WalletPairProvider 就是
 *      EIP-1193 provider）。
 *
 * 协议已从旧的 `walletpair-sdk`（canonical JSON）迁移到自实现的 **WalletPair v1**
 * （restricted MessagePack + X25519/HKDF/ChaCha20-Poly1305 + `@eip155:1` 帧后缀），见
 * `wallet/walletpair-protocol/`——与已升级到 MessagePack 的钱包 wire 兼容。
 *
 * [WalletPairProvider](./walletpair-provider.ts) 把只读调用（eth_getCode /
 * eth_getTransactionReceipt 等）走 dApp 侧 RPC 池，所以门禁与收据轮询无需钱包在线即可工作；
 * 对 counterfactual 智能账户，用钱包 advertise 的 contractBytecode 应答 eth_getCode。
 */
import { type Address, getAddress } from 'viem';
import { WalletPairSession, type SessionPhase } from '../walletpair-protocol/index.js';
import { WalletPairProvider } from './walletpair-provider.js';
import type { WalletKind, AccountType } from '../types.js';
import { classifyAccount } from '../gate.js';
import { Eip1193Wallet } from './eip1193-base.js';

/** 公共 relay（可被 startWalletPair 参数覆盖）。
 * 支持用 VITE_WALLETPAIR_RELAY 覆盖以指向本地 relay（e2e 联调用）。 */
export const DEFAULT_WALLETPAIR_RELAY =
	import.meta.env.VITE_WALLETPAIR_RELAY || 'wss://relay.walletpair.org/v1';

/** WalletPair v1 participant meta = {name, url, icon}（新协议不含 description/methods）。 */
const DAPP_META = {
	name: 'BiuBiu Tools',
	url: 'https://biubiu.tools',
	// Must be a real, reachable https URL — wallets fetch this to show the dApp icon in
	// the connect prompt. `/favicon.png` 404s; the icons live under `/favicon/`.
	icon: 'https://biubiu.tools/favicon/web-app-manifest-192x192.png'
};

export class WalletPairWallet extends Eip1193Wallet {
	readonly kind: WalletKind = 'walletpair';

	constructor(
		provider: WalletPairProvider,
		address: Address,
		accountType: AccountType,
		chainId: number,
		private readonly session: WalletPairSession
	) {
		super(provider, address, accountType, chainId);
	}

	disconnect(): void {
		try {
			this.session.close();
		} catch {
			/* 已关闭 */
		}
	}
}

export interface WalletPairPairing {
	/** 配对 URI（渲染成二维码给钱包扫）。 */
	uri: string;
	/** 4 位会话指纹，用户两端目视核对，防中间人。 */
	fingerprint: string;
	/** 钱包扫码、接受、门禁通过后 resolve；关闭 / 超时 / 纯 EOA 时 reject。 */
	connected: Promise<WalletPairWallet>;
	/** 用户取消时调用：关闭会话、断开 relay。 */
	cancel(): void;
}

/**
 * 启动一次 walletpair 配对。立即返回二维码所需的 uri/fingerprint，外加一个在连接
 * 完成（且门禁通过）时 resolve 的 promise。
 */
export async function startWalletPair(
	relayUrl: string = DEFAULT_WALLETPAIR_RELAY
): Promise<WalletPairPairing> {
	// 无 persist：biubiu 的 walletpair 会话是每次连接临时的（密钥仅在内存），符合既定设计。
	const session = new WalletPairSession({ relayUrl, meta: DAPP_META });
	const provider = new WalletPairProvider(session);

	// 在 createPairing 之前挂监听，避免极端时序下漏掉 connected。
	const connected = new Promise<WalletPairWallet>((resolve, reject) => {
		let settled = false;
		session.on('phase', async (phase: SessionPhase) => {
			if (settled) return;
			if (phase === 'connected') {
				try {
					const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
					if (!accounts?.length) throw new Error('No account authorized');
					const address = getAddress(accounts[0]) as Address;
					const chainIdHex = (await provider.request({ method: 'eth_chainId' })) as string;
					const chainId = parseInt(chainIdHex, 16);
					const accountType = await classifyAccount(provider, address, chainId);
					settled = true;
					resolve(new WalletPairWallet(provider, address, accountType, chainId, session));
				} catch (err) {
					settled = true;
					try {
						session.close();
					} catch {
						/* ignore */
					}
					reject(err);
				}
			} else if (phase === 'closed') {
				settled = true;
				reject(new Error('Pairing closed before connecting'));
			}
		});
	});

	await session.createPairing();

	return {
		uri: session.pairingUri ?? '',
		fingerprint: session.pairingCode ?? '',
		connected,
		cancel: () => {
			try {
				session.close();
			} catch {
				/* ignore */
			}
		}
	};
}
