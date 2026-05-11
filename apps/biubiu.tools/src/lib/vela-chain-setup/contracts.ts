/**
 * Vela Wallet required contract definitions and on-chain checking.
 *
 * Three deployment methods:
 * 1. Nick's method (keyless): Arachnid deterministic-deployment-proxy
 * 2. Via Arachnid proxy: EntryPoint v0.7
 * 3. Via Safe Singleton Factory: 6 Safe infrastructure contracts
 *
 * Plus one external dependency:
 * - Safe Singleton Factory (must be deployed by Safe team)
 */

// ─── Contract registry ───

export type DeployMethod = 'nicks-method' | 'arachnid-proxy' | 'safe-factory' | 'external';

export interface ContractDef {
	/** Human-readable name */
	name: string;
	/** Short description for beginners */
	description: string;
	/** On-chain address (same across all EVM chains) */
	address: string;
	/** How this contract gets deployed */
	deployMethod: DeployMethod;
	/** Which contract must exist before this one can be deployed */
	dependsOn?: string;
	/** Estimated gas for deployment */
	estimatedGas: bigint;
	/** Layer in deployment order (lower = deploy first) */
	layer: number;
}

/**
 * All contracts required for Vela Wallet, in dependency order.
 * Key = internal identifier used throughout the app.
 */
export const REQUIRED_CONTRACTS: Record<string, ContractDef> = {
	arachnidProxy: {
		name: 'Deterministic Deployment Proxy',
		description: 'A foundational tool that enables deploying contracts at predictable addresses. Required by EntryPoint.',
		address: '0x4e59b44847b379578588920cA78FbF26c0B4956C',
		deployMethod: 'nicks-method',
		estimatedGas: 100_000n,
		layer: 0,
	},
	safeSingletonFactory: {
		name: 'Safe Singleton Factory',
		description: 'A deployment tool maintained by the Safe team. Required for all Safe wallet contracts.',
		address: '0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7',
		deployMethod: 'external',
		estimatedGas: 0n,
		layer: 0,
	},
	entryPoint: {
		name: 'EntryPoint v0.7',
		description: 'The core of account abstraction (ERC-4337). Enables smart wallet transactions.',
		address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
		deployMethod: 'arachnid-proxy',
		dependsOn: 'arachnidProxy',
		estimatedGas: 6_000_000n,
		layer: 1,
	},
	safeSingleton: {
		name: 'Safe L2',
		description: 'The core Safe wallet logic that all Vela wallets delegate to.',
		address: '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762',
		deployMethod: 'safe-factory',
		dependsOn: 'safeSingletonFactory',
		estimatedGas: 5_000_000n,
		layer: 2,
	},
	safeProxyFactory: {
		name: 'Safe Proxy Factory',
		description: 'Creates new Vela wallet instances on this chain.',
		address: '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67',
		deployMethod: 'safe-factory',
		dependsOn: 'safeSingletonFactory',
		estimatedGas: 1_500_000n,
		layer: 2,
	},
	safe4337Module: {
		name: 'Safe 4337 Module',
		description: 'Connects Safe wallets with the EntryPoint for smart transactions.',
		address: '0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226',
		deployMethod: 'arachnid-proxy',
		dependsOn: 'arachnidProxy',
		estimatedGas: 3_000_000n,
		layer: 2,
	},
	safeModuleSetup: {
		name: 'Safe Module Setup',
		description: 'Initializes wallet modules during wallet creation.',
		address: '0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47',
		deployMethod: 'arachnid-proxy',
		dependsOn: 'arachnidProxy',
		estimatedGas: 500_000n,
		layer: 2,
	},
	webAuthnSigner: {
		name: 'WebAuthn Signer',
		description: 'Enables passkey (fingerprint/Face ID) signing for Vela wallets.',
		address: '0x94a4F6affBd8975951142c3999aEAB7ecee555c2',
		deployMethod: 'safe-factory',
		dependsOn: 'safeSingletonFactory',
		estimatedGas: 1_500_000n,
		layer: 2,
	},
	fallbackHandler: {
		name: 'Fallback Handler',
		description: 'Handles special wallet calls and token compatibility.',
		address: '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99',
		deployMethod: 'safe-factory',
		dependsOn: 'safeSingletonFactory',
		estimatedGas: 2_500_000n,
		layer: 2,
	},
	multiSend: {
		name: 'MultiSend',
		description: 'Allows batching multiple actions into a single transaction.',
		address: '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526',
		deployMethod: 'safe-factory',
		dependsOn: 'safeSingletonFactory',
		estimatedGas: 500_000n,
		layer: 2,
	},
};

/** Ordered list of contract keys for display */
export const CONTRACT_ORDER = [
	'arachnidProxy',
	'safeSingletonFactory',
	'entryPoint',
	'safeSingleton',
	'safeProxyFactory',
	'safe4337Module',
	'safeModuleSetup',
	'webAuthnSigner',
	'fallbackHandler',
	'multiSend',
] as const;

// ─── Nick's method: Arachnid proxy deployment ───

/**
 * Pre-signed raw transaction for deploying the Arachnid deterministic-deployment-proxy.
 * This is a "keyless deployment" — no one knows the signer's private key.
 * The signature uses r=s=0x2222...2222 (arbitrary, produces a one-time deployer address).
 *
 * Gas price: 100 gwei, gas limit: 100000
 * Source: https://github.com/Arachnid/deterministic-deployment-proxy
 */
export const ARACHNID_PRESIGNED_TX =
	'0xf8a58085174876e800830186a08080b853604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf31ba02222222222222222222222222222222222222222222222222222222222222222a02222222222222222222222222222222222222222222222222222222222222222';

/**
 * The EOA address derived from the pre-signed transaction's signature.
 * Fund this address with ETH before broadcasting the pre-signed tx.
 */
export const ARACHNID_DEPLOYER_EOA = '0x3fab184622dc19b6109349b94811493bf2a45362';

/**
 * Minimum funding needed for the Arachnid deployer EOA.
 * Pre-signed tx uses 100 gwei gas price × 100000 gas limit = 0.01 ETH.
 * We recommend slightly more to be safe.
 */
export const ARACHNID_FUNDING_WEI = 10_000_000_000_000_000n; // 0.01 ETH

// ─── Safe Singleton Factory info ───

export const SAFE_FACTORY_GITHUB_URL =
	'https://github.com/safe-global/safe-singleton-factory/issues';

export const SAFE_FACTORY_DEPLOY_GUIDE_URL =
	'https://github.com/safe-global/safe-singleton-factory#adding-new-networks';

// ─── RPC helpers ───

export async function rpcCall(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
	const res = await fetch(rpcUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
	});
	const json = await res.json();
	if (json.error) throw new Error(json.error.message);
	return json.result;
}

export async function hasCode(rpcUrl: string, address: string): Promise<boolean> {
	const code = (await rpcCall(rpcUrl, 'eth_getCode', [address, 'latest'])) as string;
	return !!code && code !== '0x' && code !== '0x0';
}

export async function getBalance(rpcUrl: string, address: string): Promise<bigint> {
	const result = (await rpcCall(rpcUrl, 'eth_getBalance', [address, 'latest'])) as string;
	return BigInt(result);
}

export async function getGasPrice(rpcUrl: string): Promise<bigint> {
	const result = (await rpcCall(rpcUrl, 'eth_gasPrice', [])) as string;
	return BigInt(result);
}

// ─── Expected runtime bytecodes for non-CREATE2 contracts ───

/**
 * Contracts deployed via Nick's method (keyless deployment) use traditional
 * address derivation (keccak256(rlp(sender, nonce))), NOT CREATE2.
 * For these, we must verify the on-chain bytecode matches the expected value,
 * because a different contract could theoretically be deployed at that address.
 *
 * CREATE2-deployed contracts don't need bytecode verification — their address
 * is derived from keccak256(initCode), so code at a CREATE2 address is
 * guaranteed to be the correct contract.
 */
const EXPECTED_RUNTIME_BYTECODES: Record<string, string> = {
	// Both Arachnid proxy and Safe Singleton Factory are the same proxy bytecode,
	// deployed via Nick's method (pre-signed keyless tx)
	arachnidProxy:
		'0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3',
	safeSingletonFactory:
		'0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3',
};

// ─── Check all contracts ───

export interface ContractStatus {
	key: string;
	def: ContractDef;
	deployed: boolean;
	/** true if bytecode was checked and matches expected (only for non-CREATE2 contracts) */
	verified: boolean;
	/** true if code exists but bytecode doesn't match expected */
	mismatch: boolean;
}

/**
 * Check deployment status of all required contracts on a chain.
 * Returns statuses in dependency order.
 *
 * For non-CREATE2 contracts (Nick's method): verifies bytecode matches expected.
 * For CREATE2 contracts: code existence at the deterministic address is sufficient.
 */
export async function checkAllContracts(rpcUrl: string): Promise<ContractStatus[]> {
	const results = await Promise.all(
		CONTRACT_ORDER.map(async (key) => {
			const def = REQUIRED_CONTRACTS[key];
			const expectedBytecode = EXPECTED_RUNTIME_BYTECODES[key];

			try {
				const code = (await rpcCall(rpcUrl, 'eth_getCode', [def.address, 'latest'])) as string;
				const hasAnyCode = !!code && code !== '0x' && code !== '0x0';

				if (!hasAnyCode) {
					return { key, def, deployed: false, verified: false, mismatch: false };
				}

				// For non-CREATE2 contracts, verify bytecode matches
				if (expectedBytecode) {
					const match = code.toLowerCase() === expectedBytecode.toLowerCase();
					return { key, def, deployed: match, verified: match, mismatch: !match };
				}

				// CREATE2 contracts — code existence is sufficient
				return { key, def, deployed: true, verified: true, mismatch: false };
			} catch {
				return { key, def, deployed: false, verified: false, mismatch: false };
			}
		}),
	);
	return results;
}

/**
 * Broadcast the pre-signed Arachnid proxy deployment transaction.
 * Returns the transaction hash.
 */
export async function broadcastArachnidTx(rpcUrl: string): Promise<string> {
	const txHash = (await rpcCall(rpcUrl, 'eth_sendRawTransaction', [
		ARACHNID_PRESIGNED_TX,
	])) as string;
	return txHash;
}

/**
 * Wait for a transaction to be mined.
 * Polls every 3 seconds for up to `timeoutMs` milliseconds.
 */
export async function waitForTx(
	rpcUrl: string,
	txHash: string,
	timeoutMs = 60_000,
): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const receipt = (await rpcCall(rpcUrl, 'eth_getTransactionReceipt', [txHash])) as {
				status: string;
			} | null;
			if (receipt) {
				return receipt.status === '0x1';
			}
		} catch {
			// Not yet mined
		}
		await new Promise((r) => setTimeout(r, 3000));
	}
	return false;
}
