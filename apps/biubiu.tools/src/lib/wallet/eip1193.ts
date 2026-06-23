/**
 * 最小 EIP-1193 + EIP-6963 类型。inject 与 walletpair 都通过 EIP-1193 provider
 * 接入，这里只声明用到的部分，避免引第三方依赖。
 */

/** EIP-1193 provider（window.ethereum / 单个注入钱包 / WalletPairProvider 都满足）。 */
export interface Eip1193Provider {
	request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
	on?(event: string, listener: (...args: unknown[]) => void): void;
	removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

/** EIP-6963 钱包元信息。 */
export interface Eip6963ProviderInfo {
	uuid: string;
	name: string;
	/** data: URI 图标。 */
	icon: string;
	/** 反向域名标识，如 io.metamask。 */
	rdns: string;
}

/** EIP-6963 announce 事件载荷。 */
export interface Eip6963ProviderDetail {
	info: Eip6963ProviderInfo;
	provider: Eip1193Provider;
}
