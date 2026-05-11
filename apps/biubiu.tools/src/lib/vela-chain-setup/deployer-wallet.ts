/**
 * Temporary deployer EOA wallet for Vela Chain Setup.
 *
 * Generates a random private key → derives EOA address.
 * User funds this address, then the app signs & broadcasts deployment txs.
 * Private key can be downloaded for safekeeping.
 *
 * Storage: localStorage (persists across page reloads within the same chain setup session).
 */

import {
	createWalletClient,
	createPublicClient,
	http,
	type Hex,
	type TransactionRequest,
	type Chain,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const STORAGE_KEY = 'vela-chain-setup-deployer';

export interface DeployerWallet {
	privateKey: Hex;
	address: string;
}

/**
 * Get or create a deployer wallet.
 * If one exists in localStorage for the given chainId, reuse it.
 * Otherwise generate a new one.
 */
/**
 * Load an existing deployer wallet from localStorage (if any).
 * Returns null if none exists for this chain.
 */
export function loadExistingWallet(chainId: number): DeployerWallet | null {
	return loadStoredWallet(chainId);
}

export function getOrCreateDeployerWallet(chainId: number): DeployerWallet {
	const stored = loadStoredWallet(chainId);
	if (stored) return stored;

	const privateKey = generatePrivateKey();
	const account = privateKeyToAccount(privateKey);
	const wallet: DeployerWallet = { privateKey, address: account.address };
	saveWallet(chainId, wallet);
	return wallet;
}

/**
 * Send a transaction using the deployer wallet.
 * Returns the transaction hash.
 */
export async function sendDeployerTx(
	rpcUrl: string,
	chainId: number,
	privateKey: Hex,
	tx: {
		to: `0x${string}`;
		data: Hex;
		gas?: bigint;
		value?: bigint;
	},
): Promise<Hex> {
	const account = privateKeyToAccount(privateKey);

	// Define a minimal chain for viem
	const chain: Chain = {
		id: chainId,
		name: `Chain ${chainId}`,
		nativeCurrency: { name: 'Native', symbol: 'ETH', decimals: 18 },
		rpcUrls: { default: { http: [rpcUrl] } },
	};

	const walletClient = createWalletClient({
		account,
		chain,
		transport: http(rpcUrl),
	});

	const hash = await walletClient.sendTransaction({
		to: tx.to,
		data: tx.data,
		gas: tx.gas,
		value: tx.value ?? 0n,
	});

	return hash;
}

/**
 * Get the balance of the deployer wallet.
 */
export async function getDeployerBalance(rpcUrl: string, address: string): Promise<bigint> {
	const client = createPublicClient({ transport: http(rpcUrl) });
	return await client.getBalance({ address: address as `0x${string}` });
}

/**
 * Export private key as a downloadable text file.
 */
export function downloadPrivateKey(wallet: DeployerWallet): void {
	const content = [
		'Vela Wallet Chain Setup - Deployer Private Key',
		'================================================',
		'',
		`Address: ${wallet.address}`,
		`Private Key: ${wallet.privateKey}`,
		'',
		'WARNING: Keep this file secure. Anyone with this private key can',
		'access funds sent to the above address.',
		'',
		`Generated: ${new Date().toISOString()}`,
	].join('\n');

	const blob = new Blob([content], { type: 'text/plain' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `vela-deployer-${wallet.address.slice(0, 8)}.txt`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/**
 * Clear the stored deployer wallet for a chain.
 */
export function clearStoredWallet(chainId: number): void {
	try {
		const all = loadAllWallets();
		delete all[String(chainId)];
		localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
	} catch {
		// Non-critical
	}
}

// ─── Internal ───

function loadStoredWallet(chainId: number): DeployerWallet | null {
	try {
		const all = loadAllWallets();
		const entry = all[String(chainId)];
		if (entry?.privateKey && entry?.address) return entry;
		return null;
	} catch {
		return null;
	}
}

function saveWallet(chainId: number, wallet: DeployerWallet): void {
	try {
		const all = loadAllWallets();
		all[String(chainId)] = wallet;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
	} catch {
		// Non-critical
	}
}

function loadAllWallets(): Record<string, DeployerWallet> {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}
