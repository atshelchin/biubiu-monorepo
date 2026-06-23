/**
 * Ephemeral, zero-privilege relayer EOA.
 *
 * Its ONLY job is to broadcast the EIP-7702 upgrade (type-4) transaction — it
 * holds no power, because the Sweeper's controller is hard-wired (immutable) to
 * the user's passkey Safe. Generated in-browser, persisted in localStorage per
 * network so a page reload doesn't strand its gas. (NOTE: only the relayer key
 * is persisted — the swept EOAs' private keys are NEVER persisted.)
 *
 * Generalized from vela-chain-setup/deployer-wallet.ts.
 */
import { type Address, type Hex, formatEther } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { rpcCall, getBalance } from '$lib/vela-chain-setup/contracts';

const STORAGE_KEY = 'wallet-sweep-relayer';

export interface Relayer {
	privateKey: Hex;
	address: Address;
}

export function loadRelayer(slug: string): Relayer | null {
	try {
		const all = loadAll();
		const e = all[slug];
		return e?.privateKey && e?.address ? e : null;
	} catch {
		return null;
	}
}

export function getOrCreateRelayer(slug: string): Relayer {
	const existing = loadRelayer(slug);
	if (existing) return existing;
	const privateKey = generatePrivateKey();
	const { address } = privateKeyToAccount(privateKey);
	const relayer: Relayer = { privateKey, address };
	save(slug, relayer);
	return relayer;
}

export function clearRelayer(slug: string): void {
	try {
		const all = loadAll();
		delete all[slug];
		localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
	} catch {
		// non-critical
	}
}

export async function relayerBalance(rpcUrl: string, address: Address): Promise<bigint> {
	return getBalance(rpcUrl, address);
}

/** Current gas price (wei) from the chain. */
export async function gasPrice(rpcUrl: string): Promise<bigint> {
	const r = (await rpcCall(rpcUrl, 'eth_gasPrice', [])) as string;
	return BigInt(r);
}

/**
 * Estimate the native gas the relayer needs to upgrade `eoaCount` EOAs.
 *
 * Per-tx gas ≈ base 21k + per-authorization cost (~PER_EMPTY_ACCOUNT 25k, plus
 * intrinsic). We use a conservative ~60k/EOA to cover signature recovery +
 * delegation, plus a Sweeper deploy budget when needed, all × 1.3 buffer.
 */
export function estimateUpgradeGasUnits(eoaCount: number, includeSweeperDeploy: boolean): bigint {
	// No upgrade tx and no deploy → relayer needs no gas.
	if (eoaCount === 0 && !includeSweeperDeploy) return 0n;
	const perEoa = 60_000n;
	const base = 21_000n * BigInt(Math.max(1, Math.ceil(eoaCount / 100)));
	const deploy = includeSweeperDeploy ? 250_000n : 0n;
	return base + perEoa * BigInt(eoaCount) + deploy;
}

export async function estimateUpgradeCostWei(
	rpcUrl: string,
	eoaCount: number,
	includeSweeperDeploy: boolean,
): Promise<bigint> {
	const price = await gasPrice(rpcUrl);
	const units = estimateUpgradeGasUnits(eoaCount, includeSweeperDeploy);
	// 1.3x buffer on price too (volatile L1s/L2s).
	return (units * price * 13n) / 10n;
}

export function formatNative(wei: bigint): string {
	return formatEther(wei);
}

export function downloadRelayerKey(relayer: Relayer, slug: string): void {
	const content = [
		'BiuBiu Wallet Sweep — Relayer Private Key',
		'==========================================',
		'',
		`Network: ${slug}`,
		`Address: ${relayer.address}`,
		`Private Key: ${relayer.privateKey}`,
		'',
		'This is a throwaway gas-payer for the 7702 upgrade. It controls nothing.',
		'Recover any leftover gas by importing this key into a wallet.',
		'',
		`Generated: ${new Date().toISOString()}`,
	].join('\n');
	const blob = new Blob([content], { type: 'text/plain' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `sweep-relayer-${slug}-${relayer.address.slice(0, 8)}.txt`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

// ─── internal ───

function loadAll(): Record<string, Relayer> {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

function save(slug: string, relayer: Relayer): void {
	try {
		const all = loadAll();
		all[slug] = relayer;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
	} catch {
		// non-critical
	}
}
