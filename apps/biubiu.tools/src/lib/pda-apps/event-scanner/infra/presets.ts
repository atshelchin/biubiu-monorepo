/**
 * Built-in scan presets — one-click setups for the most common jobs.
 *
 * NOTE on ERC-7708: native value transfers emit an ERC-20-style `Transfer` log
 * from a designated system address on chains that implement the (draft) standard.
 * The emitter address is NOT yet uniform across implementations, so it is exposed
 * here as `nativeLogAddress` and MUST be verified against the target chain before
 * relying on the results.
 */
import type { Abi } from 'viem';

/** Minimal ERC-20 ABI carrying just the Transfer/Approval events. */
export const ERC20_EVENT_ABI: Abi = [
	{
		type: 'event',
		name: 'Transfer',
		inputs: [
			{ name: 'from', type: 'address', indexed: true },
			{ name: 'to', type: 'address', indexed: true },
			{ name: 'value', type: 'uint256', indexed: false },
		],
		anonymous: false,
	},
	{
		type: 'event',
		name: 'Approval',
		inputs: [
			{ name: 'owner', type: 'address', indexed: true },
			{ name: 'spender', type: 'address', indexed: true },
			{ name: 'value', type: 'uint256', indexed: false },
		],
		anonymous: false,
	},
];

export interface ScanPreset {
	id: string;
	/** i18n key suffix under es.preset.* */
	labelKey: string;
	chainId?: number;
	/** Pre-filled contract address (a token, or the ERC-7708 native log emitter). */
	contract?: string;
	abi: Abi;
	/** The event to scan. */
	eventSignature: string;
	/** Whether this preset wants the "track a wallet (in/out)" flow enabled. */
	walletTrack: boolean;
	/** Verification note shown in the UI (e.g. ERC-7708 caveat). */
	noteKey?: string;
}

export const PRESETS: ScanPreset[] = [
	{
		id: 'erc20-transfers',
		labelKey: 'erc20Transfers',
		abi: ERC20_EVENT_ABI,
		eventSignature: 'Transfer(address,address,uint256)',
		walletTrack: true,
	},
	{
		id: 'usdt-bsc',
		labelKey: 'usdtBsc',
		chainId: 56,
		contract: '0x55d398326f99059fF775485246999027B3197955',
		abi: ERC20_EVENT_ABI,
		eventSignature: 'Transfer(address,address,uint256)',
		walletTrack: true,
	},
	{
		id: 'erc7708-native',
		labelKey: 'erc7708Native',
		// Placeholder emitter — MUST be confirmed per chain (see file header).
		contract: '0x0000000000000000000000000000000000000000',
		abi: ERC20_EVENT_ABI,
		eventSignature: 'Transfer(address,address,uint256)',
		walletTrack: true,
		noteKey: 'erc7708',
	},
];
