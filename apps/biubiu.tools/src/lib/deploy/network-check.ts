/**
 * Network readiness check for CREATE2 deployment via Safe AA wallet.
 *
 * Validates that a target chain has all required infrastructure:
 * 1. CREATE2 proxy (Arachnid's deterministic-deployment-proxy)
 * 2. Safe AA contracts (8 contracts)
 * 3. RIP-7212 P256 precompile (for passkey signature verification)
 * 4. Bundler support
 * 5. Sufficient gas balance on Safe wallet
 */

import { CREATE2_PROXY } from './create2.js';

// ─── Required contract addresses ───

/** Safe infrastructure contracts that must be deployed on the target chain */
const SAFE_CONTRACTS = {
	entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
	safeProxyFactory: '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67',
	safeSingleton: '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762',
	safe4337Module: '0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226',
	safeModuleSetup: '0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47',
	safeWebAuthnSharedSigner: '0x94a4F6affBd8975951142c3999aEAB7ecee555c2',
	multiSend: '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526',
	compatibilityFallbackHandler: '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99'
} as const;

/** RIP-7212 P256 precompile address (verifiers = 0x100) */
const P256_PRECOMPILE = '0x0000000000000000000000000000000000000100';

// ─── Types ───

export interface ContractCheckResult {
	name: string;
	address: string;
	deployed: boolean;
}

export interface NetworkCheckResult {
	/** All checks passed */
	ready: boolean;

	/** CREATE2 proxy availability */
	create2Proxy: ContractCheckResult;

	/** Safe infrastructure contract checks */
	safeContracts: ContractCheckResult[];

	/** RIP-7212 P256 precompile availability */
	p256Precompile: {
		available: boolean;
		checked: boolean;
	};

	/** Bundler supports this chain */
	bundlerSupported: boolean;

	/** Gas balance of Safe wallet (in wei), null if not checked */
	gasBalance: bigint | null;

	/** RPC itself is unreachable — issues are likely RPC-related, not chain-related */
	rpcError: boolean;

	/** Human-readable summary of issues */
	issues: string[];
}

// ─── RPC helpers ───

async function rpcCall(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
	const res = await fetch(rpcUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
	});
	const json = await res.json();
	if (json.error) throw new Error(json.error.message);
	return json.result;
}

async function hasCode(rpcUrl: string, address: string): Promise<boolean> {
	const code = (await rpcCall(rpcUrl, 'eth_getCode', [address, 'latest'])) as string;
	return !!code && code !== '0x' && code !== '0x0';
}

async function getBalance(rpcUrl: string, address: string): Promise<bigint> {
	const result = (await rpcCall(rpcUrl, 'eth_getBalance', [address, 'latest'])) as string;
	return BigInt(result);
}

/**
 * Check RIP-7212 P256 precompile by verifying a known-valid ECDSA P-256 signature.
 *
 * The precompile returns 1 (32 bytes) for a valid signature, and EMPTY (0x) for
 * invalid input — same as calling an empty address. So we MUST use a real valid
 * signature to distinguish "precompile exists" from "no precompile".
 *
 * Test vector: sha256("test") signed with a fixed P-256 key.
 */
async function checkP256Precompile(rpcUrl: string): Promise<boolean> {
	// Fixed valid P-256 signature: hash(32) + r(32) + s(32) + x(32) + y(32) = 160 bytes
	// sha256("test") signed with a known key — verified on Base, Ethereum, Polygon, Arbitrum, BNB
	const VALID_P256_CALL =
		'0x' +
		'9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08' + // hash
		'7bf0e18d07660f15994adce5c3836d7bd6167cdb5726f631098f433ebe0be9c0' + // r
		'3936edbe5c791477e714e58244afb690b9b88b833ff4acdf0fbd1b28bf0b1182' + // s
		'3be8cbcb3f590087711ae5ed74b9cd06a88058d0bbe700b5f0ec5a1bfac15592' + // x
		'f989ef9bfaae0fee03c36625e88eae99806a879d813411f876e7e03a2ffd8314'; // y

	try {
		const result = (await rpcCall(rpcUrl, 'eth_call', [
			{ to: P256_PRECOMPILE, data: VALID_P256_CALL },
			'latest'
		])) as string;

		// Precompile returns 32 bytes with value 1 for valid signature
		return result !== '0x' && result.length >= 66 && BigInt(result) === 1n;
	} catch {
		return false;
	}
}

/**
 * Check if bundler supports this chain via pimlico_getUserOperationGasPrice.
 * Uses the /api/bundler proxy endpoint with chainId directly.
 */
async function checkBundlerSupport(chainId: number): Promise<boolean> {
	try {
		const res = await fetch('/api/bundler', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				method: 'pimlico_getUserOperationGasPrice',
				params: [],
				chainId
			})
		});
		const json = await res.json();
		return !json.error;
	} catch {
		return false;
	}
}

// ─── Cache (contract checks only, bundler + gas always live) ───

const CACHE_KEY = 'biubiu-deploy-network-cache';
/** Cache TTL: 7 days — deployed contracts don't disappear */
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

/** Cached on-chain contract check results */
interface ContractCacheEntry {
	ts: number;
	create2Proxy: ContractCheckResult;
	safeContracts: ContractCheckResult[];
	p256Available: boolean;
}

type CacheStore = Record<string, ContractCacheEntry>;

function loadCache(): CacheStore {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

function saveCache(cache: CacheStore): void {
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
	} catch {
		// Non-critical
	}
}

function getCachedContracts(chainId: number): ContractCacheEntry | null {
	const cache = loadCache();
	const entry = cache[String(chainId)];
	if (!entry) return null;
	if (Date.now() - entry.ts > CACHE_TTL) return null;
	return entry;
}

function cacheContracts(chainId: number, entry: Omit<ContractCacheEntry, 'ts'>): void {
	const cache = loadCache();
	cache[String(chainId)] = { ...entry, ts: Date.now() };
	saveCache(cache);
}

/** Clear cache for a specific chain */
export function clearCachedCheck(chainId: number): void {
	const cache = loadCache();
	delete cache[String(chainId)];
	saveCache(cache);
}

// ─── Main check function ───

export interface NetworkCheckParams {
	rpcUrl: string;
	chainId: number;
	/** Safe wallet address to check gas balance */
	safeAddress?: string;
	/** Skip contract cache and force full re-check */
	forceRefresh?: boolean;
}

/**
 * Run all network readiness checks.
 *
 * Contract checks (1-3) are cached in localStorage for 7 days — once deployed
 * these contracts don't disappear, so re-checking every visit is wasteful.
 *
 * Bundler support (4) and gas balance (5) are ALWAYS checked live — bundler
 * availability can change and balance changes with every tx.
 */
export async function checkNetworkSupport(params: NetworkCheckParams): Promise<NetworkCheckResult> {
	const { rpcUrl, chainId, safeAddress, forceRefresh } = params;
	const issues: string[] = [];

	// ── Contracts (1-3): use cache or fetch ──

	let create2Proxy: ContractCheckResult;
	let safeContracts: ContractCheckResult[];
	let p256Available: boolean;

	const cached = !forceRefresh ? getCachedContracts(chainId) : null;

	if (cached) {
		create2Proxy = cached.create2Proxy;
		safeContracts = cached.safeContracts;
		p256Available = cached.p256Available;
	} else {
		// First: quick RPC health check (eth_chainId is the lightest call)
		let rpcHealthy = true;
		try {
			await rpcCall(rpcUrl, 'eth_chainId', []);
		} catch {
			rpcHealthy = false;
		}

		if (!rpcHealthy) {
			// RPC itself is broken — don't blame the chain
			issues.push('RPC endpoint is unreachable or returned an error — try a different RPC');
			return {
				ready: false,
				create2Proxy: { name: 'Arachnid CREATE2 Proxy', address: CREATE2_PROXY, deployed: false },
				safeContracts: Object.entries(SAFE_CONTRACTS).map(([name, address]) => ({ name, address, deployed: false })),
				p256Precompile: { available: false, checked: false },
				bundlerSupported: false,
				gasBalance: null,
				rpcError: true,
				issues
			};
		}

		// 1. CREATE2 proxy
		const deployed = await hasCode(rpcUrl, CREATE2_PROXY).catch(() => false);
		create2Proxy = { name: 'Arachnid CREATE2 Proxy', address: CREATE2_PROXY, deployed };

		// 2. Safe contracts (parallel)
		safeContracts = await Promise.all(
			Object.entries(SAFE_CONTRACTS).map(async ([name, address]) => ({
				name,
				address,
				deployed: await hasCode(rpcUrl, address).catch(() => false)
			}))
		);

		// 3. RIP-7212 P256 precompile
		p256Available = await checkP256Precompile(rpcUrl).catch(() => false);

		// Cache if all contract checks passed
		const allContractsOk =
			create2Proxy.deployed &&
			safeContracts.every((c) => c.deployed) &&
			p256Available;

		if (allContractsOk) {
			cacheContracts(chainId, { create2Proxy, safeContracts, p256Available });
		}
	}

	// Collect contract issues
	if (!create2Proxy.deployed) {
		issues.push('CREATE2 proxy not deployed on this chain');
	}
	const missingSafe = safeContracts.filter((c) => !c.deployed);
	if (missingSafe.length > 0) {
		issues.push(`Missing Safe contracts: ${missingSafe.map((c) => c.name).join(', ')}`);
	}
	if (!p256Available) {
		issues.push('RIP-7212 P256 precompile not available (passkey signatures will fail)');
	}

	// ── Bundler (4): always live — uses chainId directly (Pimlico supports any chain) ──

	let bundlerSupported = false;
	bundlerSupported = await checkBundlerSupport(chainId);
	if (!bundlerSupported) {
		issues.push('Bundler does not support this chain');
	}

	// ── Gas balance (5): always live ──

	let gasBalance: bigint | null = null;
	if (safeAddress) {
		try {
			gasBalance = await getBalance(rpcUrl, safeAddress);
			if (gasBalance === 0n) {
				issues.push('No gas balance on Safe wallet — deposit native tokens first');
			}
		} catch {
			// Non-critical
		}
	}

	const ready =
		create2Proxy.deployed &&
		missingSafe.length === 0 &&
		p256Available &&
		bundlerSupported &&
		(gasBalance === null || gasBalance > 0n);

	return {
		ready,
		create2Proxy,
		safeContracts,
		p256Precompile: { available: p256Available, checked: true },
		bundlerSupported,
		gasBalance,
		rpcError: false,
		issues
	};
}
