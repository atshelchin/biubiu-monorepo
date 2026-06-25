/**
 * walletpair 后端：扫码配对协议（类 WalletConnect，但 relay-blind、零注册）。
 *
 * 连接是两阶段的：
 *   1. `startWalletPair()` 建会话 + 出二维码 URI + 指纹，UI 展示给用户扫码。
 *   2. 用户钱包扫码并接受后 phase → 'connected'，此时跑门禁（必须智能合约钱包）
 *      并包成 `WalletPairWallet`（复用 EIP-1193 基类，因为 WalletPairProvider 就是
 *      EIP-1193 provider）。
 *
 * WalletPairProvider 把只读调用（eth_getCode / eth_getTransactionReceipt 等）走 dApp
 * 侧 RPC（默认 ethereum-data 兜底），所以门禁与收据轮询无需钱包在线即可工作；对
 * counterfactual 智能账户，provider 会用钱包 advertise 的 contractBytecode 应答
 * eth_getCode，门禁因此也能识别未部署的合约钱包。
 */
import { type Address, getAddress } from 'viem';
import { DAppSession, WebSocketTransport, type DAppPhase } from 'walletpair-sdk';
import { WalletPairProvider } from 'walletpair-sdk/evm';
import type { Eip1193Provider } from '../eip1193.js';
import type { WalletKind, AccountType } from '../types.js';
import { classifyAccount } from '../gate.js';
import { Eip1193Wallet } from './eip1193-base.js';

/** 公共 relay（可被 startWalletPair 参数覆盖）。 */
export const DEFAULT_WALLETPAIR_RELAY = 'wss://relay.walletpair.org/v1';

const DAPP_META = {
	name: 'BiuBiu Tools',
	description: 'Smart contract wallet toolbox',
	url: 'https://biubiu.tools',
	// Must be a real, reachable URL — wallets fetch this to show the dApp icon in
	// the connect prompt. `/favicon.png` 404s; the icons live under `/favicon/`.
	icon: 'https://biubiu.tools/favicon/web-app-manifest-192x192.png'
};

/** dApp 打算调用的 EVM 方法（写进配对 URI 的 scope）。 */
const DAPP_METHODS = [
	'wallet_getAccounts',
	'wallet_signMessage',
	'wallet_signTypedData',
	'wallet_sendTransaction',
	'wallet_sendCalls',
	'wallet_switchChain'
];

export class WalletPairWallet extends Eip1193Wallet {
	readonly kind: WalletKind = 'walletpair';

	constructor(
		provider: Eip1193Provider,
		address: Address,
		accountType: AccountType,
		chainId: number,
		private readonly session: DAppSession
	) {
		super(provider, address, accountType, chainId);
	}

	disconnect(): void {
		try {
			this.session.close('normal');
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
	const transport = new WebSocketTransport(relayUrl);
	const session = new DAppSession({ transport, meta: DAPP_META, methods: DAPP_METHODS });
	const provider = new WalletPairProvider({ session }) as unknown as Eip1193Provider;

	// 在 createPairing 之前挂监听，避免极端时序下漏掉 connected。
	const connected = new Promise<WalletPairWallet>((resolve, reject) => {
		let settled = false;
		session.on('phase', async (phase: DAppPhase) => {
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
						session.close('protocol_error');
					} catch {
						/* ignore */
					}
					reject(err);
				}
			} else if (phase === 'closed' || phase === 'disconnected') {
				settled = true;
				reject(new Error('Pairing closed before connecting'));
			}
		});
	});

	const uri = await session.createPairing();

	return {
		uri,
		fingerprint: session.sessionFingerprint,
		connected,
		cancel: () => {
			try {
				session.close('normal');
			} catch {
				/* ignore */
			}
		}
	};
}
