/**
 * The relay EOA — the heart of v2. It deploys the contracts, upgrades the EOAs
 * and sweeps them; it is the Sweeper's `controller`. The user funds it with gas,
 * MUST download its key, and proves the download by re-uploading the file before
 * the funding address/QR is revealed.
 *
 * Persisted in localStorage per network so a reload doesn't strand its gas.
 * (Only the relay key is persisted — the swept EOAs' keys are never persisted.)
 */
import { type Address, type Hex, formatEther } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { getBalance, getGasPrice } from './rpc.js';
import { makeWalletClient } from './viem-chain.js';
import { waitForReceipt } from './tx-utils.js';
import type { SweepNetwork } from '../types.js';

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

/** Generate a brand-new relay (e.g. user wants a fresh one). */
export function rotateRelayer(slug: string): Relayer {
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

export async function relayerBalance(rpcs: string[], address: Address): Promise<bigint> {
	return getBalance(rpcs, address);
}

export async function gasPrice(rpcs: string[]): Promise<bigint> {
	return getGasPrice(rpcs);
}

/**
 * Estimate the native the relay needs: fee + deploys + combined upgrade/sweep gas.
 * Generous (×2 on price) — leftover is recoverable via recoverGas().
 */
export async function estimateFundingWei(opts: {
	rpcs: string[];
	eoaCount: number;
	tokenCount: number;
	deployBatchSweeper: boolean;
	deploySweeper: boolean;
	feeWei: bigint;
}): Promise<bigint> {
	const { rpcs, eoaCount, tokenCount, deployBatchSweeper, deploySweeper, feeWei } = opts;
	const price = await getGasPrice(rpcs);
	const deploy = (deployBatchSweeper ? 600_000n : 0n) + (deploySweeper ? 300_000n : 0n);
	const perEoa = 70_000n + 40_000n * BigInt(tokenCount); // auth + sweep, generous
	const units = 60_000n + deploy + perEoa * BigInt(Math.max(0, eoaCount));
	return feeWei + (units * price * 2n);
}

export function formatNative(wei: bigint): string {
	return formatEther(wei);
}

/** The text written into the downloaded key file. */
export function relayFileContent(relay: Relayer, slug: string, ts: number): string {
	return [
		'BiuBiu Wallet Sweep — Relay Private Key',
		'========================================',
		'',
		`Network: ${slug}`,
		`Address: ${relay.address}`,
		`Private Key: ${relay.privateKey}`,
		'',
		'This relay controls the sweep: it upgrades your EOAs and pulls funds to',
		'your destination. KEEP IT until you have swept and recovered leftover gas.',
		'Anyone with this key can spend its gas balance (but cannot redirect a sweep',
		'— the destination is fixed per transaction).',
		'',
		`Generated: ${new Date(ts).toISOString()}`,
	].join('\n');
}

export function downloadRelayerKey(relay: Relayer, slug: string, ts: number): void {
	const blob = new Blob([relayFileContent(relay, slug, ts)], { type: 'text/plain' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `sweep-relay-${slug}-${relay.address.slice(0, 8)}.txt`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/**
 * Verify an uploaded file proves the user saved THIS relay's key: extract a
 * 0x-private-key from the text and check it derives the expected address.
 */
export function verifyRelayFile(fileText: string, expected: Relayer): boolean {
	const m = fileText.match(/0x[0-9a-fA-F]{64}/);
	if (!m) return false;
	try {
		const { address } = privateKeyToAccount(m[0] as Hex);
		return (
			address.toLowerCase() === expected.address.toLowerCase() &&
			m[0].toLowerCase() === expected.privateKey.toLowerCase()
		);
	} catch {
		return false;
	}
}

/**
 * Recover the relay's leftover gas: send (balance − gas for this tx) to `dest`.
 * Returns null if there's nothing worth sending.
 */
export async function recoverGas(
	network: SweepNetwork,
	rpcs: string[],
	relay: Relayer,
	dest: Address,
): Promise<Hex | null> {
	const [bal, price] = await Promise.all([getBalance(rpcs, relay.address), getGasPrice(rpcs)]);
	const gas = 21_000n;
	const cost = gas * price * 12n / 10n; // 1.2x buffer on the send itself
	if (bal <= cost) return null;
	const account = privateKeyToAccount(relay.privateKey);
	const wallet = makeWalletClient(network, rpcs, account);
	const txHash = await wallet.sendTransaction({
		to: dest,
		value: bal - cost,
		gas,
		maxFeePerGas: price * 12n / 10n,
		maxPriorityFeePerGas: price / 10n,
	});
	await waitForReceipt(network, rpcs, txHash);
	return txHash;
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
