/**
 * 站点级钱包抽象的统一出口。功能页只从这里 import。
 */
export { walletStore } from './wallet-store.svelte.js';
export type { ConnectResult, WalletPairView } from './wallet-store.svelte.js';
export { BiubiuWallet, encodeMultiSend, networkKeyForChainId } from './backends/biubiu.js';
export { InjectWallet, discoverInjectedProviders, connectInjected } from './backends/inject.js';
export {
	WalletPairWallet,
	startWalletPair,
	DEFAULT_WALLETPAIR_RELAY
} from './backends/walletpair.js';
export { Eip1193Wallet } from './backends/eip1193-base.js';
export { classifyAccount, isSmartAccountOnChain, NotSmartAccountError } from './gate.js';
export type { Eip1193Provider, Eip6963ProviderDetail, Eip6963ProviderInfo } from './eip1193.js';
export type {
	ConnectedWallet,
	Call,
	WalletKind,
	AccountType,
	SendCallsOptions,
	SendStatus,
	SendResult
} from './types.js';
