/**
 * Token-sender 发送适配器。
 *
 * 把 token-sender 的发送需求收敛到一个接口，底层复用站点统一钱包抽象
 * （ConnectedWallet）。每批 = 一次 `sendCalls`：
 *   - biubiu 内置 → MultiSend delegatecall（一次 passkey）
 *   - inject / walletpair → EIP-5792 wallet_sendCalls（一次外部钱包确认）
 *
 * 之前这里只认 passkey（createPasskeyWallet）；现在三种钱包统一走这套。
 */
import { createPublicClient, http, fallback, type Address, type Hex } from 'viem';
import type { ConnectedWallet, SendStatus } from '$lib/wallet';
import { ERC20_ABI } from '../infra/erc20.js';
import type { SubTransaction, TokenSenderNetwork } from '../types.js';

export interface SendMultiSendResult {
	txHash: Hex;
	explorerUrl: string;
}

export interface SafeSenderWallet {
	account: Address;
	/** 原子地发送一批子交易（全部为普通 CALL）。 */
	sendBatch(args: {
		network: TokenSenderNetwork;
		calls: SubTransaction[];
		onStatus?: (s: SendStatus) => void;
	}): Promise<SendMultiSendResult>;
	getNativeBalance(network: TokenSenderNetwork): Promise<bigint>;
	getErc20Balance(network: TokenSenderNetwork, token: Address): Promise<bigint>;
	getErc20Meta(network: TokenSenderNetwork, token: Address): Promise<{ symbol: string; decimals: number }>;
}

function clientFor(network: TokenSenderNetwork) {
	return createPublicClient({ transport: fallback(network.rpcs.map((u) => http(u))) });
}

/**
 * 用站点统一的 ConnectedWallet（biubiu / inject / walletpair）构造发送适配器。
 * 读操作走公共 RPC + 钱包地址；写操作走 wallet.sendCalls（批量由各后端自行原子化）。
 */
export function createConnectedWallet(wallet: ConnectedWallet): SafeSenderWallet {
	const account = wallet.address;

	return {
		account,

		async sendBatch({ network, calls, onStatus }) {
			const res = await wallet.sendCalls(calls, {
				chainId: network.chainId,
				onPhase: onStatus,
				explorerTxBaseUrl: network.explorerTxUrl
			});
			if (!res.success || !res.txHash) {
				throw new Error(res.error ?? 'Batch transaction failed');
			}
			return {
				txHash: res.txHash as Hex,
				explorerUrl: res.explorerUrl ?? `${network.explorerTxUrl}${res.txHash}`
			};
		},

		getNativeBalance(network) {
			return clientFor(network).getBalance({ address: account });
		},

		getErc20Balance(network, token) {
			return clientFor(network).readContract({
				address: token,
				abi: ERC20_ABI,
				functionName: 'balanceOf',
				args: [account]
			}) as Promise<bigint>;
		},

		async getErc20Meta(network, token) {
			const client = clientFor(network);
			const [symbol, decimals] = await Promise.all([
				client.readContract({ address: token, abi: ERC20_ABI, functionName: 'symbol' }) as Promise<string>,
				client.readContract({ address: token, abi: ERC20_ABI, functionName: 'decimals' }) as Promise<number>
			]);
			return { symbol, decimals: Number(decimals) };
		}
	};
}
