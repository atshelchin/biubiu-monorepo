/**
 * Vela Wallet required contract definitions and on-chain checking.
 *
 * Deployment methods:
 * 1. Nick's method (keyless EOA): Arachnid deterministic-deployment-proxy
 * 2. Pre-signed tx (known EOA): Multicall3
 * 3. Via Arachnid proxy (CREATE2): EntryPoint v0.7, Safe4337Module, SafeModuleSetup
 * 4. Via Safe Singleton Factory (CREATE2): Safe L2, SafeProxyFactory, etc.
 * 5. External (Safe team only): Safe Singleton Factory
 */

// ─── Contract registry ───

export type DeployMethod = 'nicks-method' | 'presigned-tx' | 'arachnid-proxy' | 'safe-factory' | 'external';

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
	multicall3: {
		name: 'Multicall3',
		description: 'Batch-reads contract state in a single RPC call. Essential for wallet performance.',
		address: '0xcA11bde05977b3631167028862bE2a173976CA11',
		deployMethod: 'presigned-tx',
		estimatedGas: 1_000_000n,
		layer: 0,
	},
};

/** Ordered list of contract keys for display */
export const CONTRACT_ORDER = [
	'arachnidProxy',
	'safeSingletonFactory',
	'multicall3',
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

// ─── Multicall3: Nick's method deployment ───

/**
 * Pre-signed raw transaction for deploying Multicall3.
 * Legacy tx (pre-EIP-155, v=28) — chain-agnostic.
 * Gas price: 100 gwei, gas limit: 1,000,000.
 * Source: https://github.com/mds1/multicall3
 */
export const MULTICALL3_PRESIGNED_TX =
	'0xf90f538085174876e800830f42408080b90f00608060405234801561001057600080fd5b50610ee0806100206000396000f3fe6080604052600436106100f35760003560e01c80634d2301cc1161008a578063a8b0574e11610059578063a8b0574e1461025a578063bce38bd714610275578063c3077fa914610288578063ee82ac5e1461029b57600080fd5b80634d2301cc146101ec57806372425d9d1461022157806382ad56cb1461023457806386d516e81461024757600080fd5b80633408e470116100c65780633408e47014610191578063399542e9146101a45780633e64a696146101c657806342cbb15c146101d957600080fd5b80630f28c97d146100f8578063174dea711461011a578063252dba421461013a57806327e86d6e1461015b575b600080fd5b34801561010457600080fd5b50425b6040519081526020015b60405180910390f35b61012d610128366004610a85565b6102ba565b6040516101119190610bbe565b61014d610148366004610a85565b6104ef565b604051610111929190610bd8565b34801561016757600080fd5b50437fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0140610107565b34801561019d57600080fd5b5046610107565b6101b76101b2366004610c60565b610690565b60405161011193929190610cba565b3480156101d257600080fd5b5048610107565b3480156101e557600080fd5b5043610107565b3480156101f857600080fd5b50610107610207366004610ce2565b73ffffffffffffffffffffffffffffffffffffffff163190565b34801561022d57600080fd5b5044610107565b61012d610242366004610a85565b6106ab565b34801561025357600080fd5b5045610107565b34801561026657600080fd5b50604051418152602001610111565b61012d610283366004610c60565b61085a565b6101b7610296366004610a85565b610a1a565b3480156102a757600080fd5b506101076102b6366004610d18565b4090565b60606000828067ffffffffffffffff8111156102d8576102d8610d31565b60405190808252806020026020018201604052801561031e57816020015b6040805180820190915260008152606060208201528152602001906001900390816102f65790505b5092503660005b8281101561047757600085828151811061034157610341610d60565b6020026020010151905087878381811061035d5761035d610d60565b905060200281019061036f9190610d8f565b6040810135958601959093506103886020850185610ce2565b73ffffffffffffffffffffffffffffffffffffffff16816103ac6060870187610dcd565b6040516103ba929190610e32565b60006040518083038185875af1925050503d80600081146103f7576040519150601f19603f3d011682016040523d82523d6000602084013e6103fc565b606091505b50602080850191909152901515808452908501351761046d577f08c379a000000000000000000000000000000000000000000000000000000000600052602060045260176024527f4d756c746963616c6c333a2063616c6c206661696c656400000000000000000060445260846000fd5b5050600101610325565b508234146104e6576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601a60248201527f4d756c746963616c6c333a2076616c7565206d69736d6174636800000000000060448201526064015b60405180910390fd5b50505092915050565b436060828067ffffffffffffffff81111561050c5761050c610d31565b60405190808252806020026020018201604052801561053f57816020015b606081526020019060019003908161052a5790505b5091503660005b8281101561068657600087878381811061056257610562610d60565b90506020028101906105749190610e42565b92506105836020840184610ce2565b73ffffffffffffffffffffffffffffffffffffffff166105a66020850185610dcd565b6040516105b4929190610e32565b6000604051808303816000865af19150503d80600081146105f1576040519150601f19603f3d011682016040523d82523d6000602084013e6105f6565b606091505b5086848151811061060957610609610d60565b602090810291909101015290508061067d576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601760248201527f4d756c746963616c6c333a2063616c6c206661696c656400000000000000000060448201526064016104dd565b50600101610546565b5050509250929050565b43804060606106a086868661085a565b905093509350939050565b6060818067ffffffffffffffff8111156106c7576106c7610d31565b60405190808252806020026020018201604052801561070d57816020015b6040805180820190915260008152606060208201528152602001906001900390816106e55790505b5091503660005b828110156104e657600084828151811061073057610730610d60565b6020026020010151905086868381811061074c5761074c610d60565b905060200281019061075e9190610e76565b925061076d6020840184610ce2565b73ffffffffffffffffffffffffffffffffffffffff166107906040850185610dcd565b60405161079e929190610e32565b6000604051808303816000865af19150503d80600081146107db576040519150601f19603f3d011682016040523d82523d6000602084013e6107e0565b606091505b506020808401919091529015158083529084013517610851577f08c379a000000000000000000000000000000000000000000000000000000000600052602060045260176024527f4d756c746963616c6c333a2063616c6c206661696c656400000000000000000060445260646000fd5b50600101610714565b6060818067ffffffffffffffff81111561087657610876610d31565b6040519080825280602002602001820160405280156108bc57816020015b6040805180820190915260008152606060208201528152602001906001900390816108945790505b5091503660005b82811015610a105760008482815181106108df576108df610d60565b602002602001015190508686838181106108fb576108fb610d60565b905060200281019061090d9190610e42565b925061091c6020840184610ce2565b73ffffffffffffffffffffffffffffffffffffffff1661093f6020850185610dcd565b60405161094d929190610e32565b6000604051808303816000865af19150503d806000811461098a576040519150601f19603f3d011682016040523d82523d6000602084013e61098f565b606091505b506020830152151581528715610a07578051610a07576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601760248201527f4d756c746963616c6c333a2063616c6c206661696c656400000000000000000060448201526064016104dd565b506001016108c3565b5050509392505050565b6000806060610a2b60018686610690565b919790965090945092505050565b60008083601f840112610a4b57600080fd5b50813567ffffffffffffffff811115610a6357600080fd5b6020830191508360208260051b8501011115610a7e57600080fd5b9250929050565b60008060208385031215610a9857600080fd5b823567ffffffffffffffff811115610aaf57600080fd5b610abb85828601610a39565b90969095509350505050565b6000815180845260005b81811015610aed57602081850181015186830182015201610ad1565b81811115610aff576000602083870101525b50601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0169290920160200192915050565b600082825180855260208086019550808260051b84010181860160005b84811015610bb1578583037fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe001895281518051151584528401516040858501819052610b9d81860183610ac7565b9a86019a9450505090830190600101610b4f565b5090979650505050505050565b602081526000610bd16020830184610b32565b9392505050565b600060408201848352602060408185015281855180845260608601915060608160051b870101935082870160005b82811015610c52577fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa0888703018452610c40868351610ac7565b95509284019290840190600101610c06565b509398975050505050505050565b600080600060408486031215610c7557600080fd5b83358015158114610c8557600080fd5b9250602084013567ffffffffffffffff811115610ca157600080fd5b610cad86828701610a39565b9497909650939450505050565b838152826020820152606060408201526000610cd96060830184610b32565b95945050505050565b600060208284031215610cf457600080fd5b813573ffffffffffffffffffffffffffffffffffffffff81168114610bd157600080fd5b600060208284031215610d2a57600080fd5b5035919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b600082357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff81833603018112610dc357600080fd5b9190910192915050565b60008083357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe1843603018112610e0257600080fd5b83018035915067ffffffffffffffff821115610e1d57600080fd5b602001915036819003821315610a7e57600080fd5b8183823760009101908152919050565b600082357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc1833603018112610dc357600080fd5b600082357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa1833603018112610dc357600080fdfea2646970667358221220bb2b5c71a328032f97c676ae39a1ec2148d3e5d6f73d95e9b17910152d61f16264736f6c634300080c00331ca0edce47092c0f398cebf3ffc267f05c8e7076e3b89445e0fe50f6332273d4569ba01b0b9d000e19b24c5869b0fc3b22b0d6fa47cd63316875cbbd577d76e6fde086';

/** Multicall3 deployer EOA — fund this before broadcasting */
export const MULTICALL3_DEPLOYER_EOA = '0x05f32b3cc3888453ff71b01135b34ff8e41263f2';

/** Multicall3 requires 0.1 ETH (100 gwei × 1,000,000 gas) */
export const MULTICALL3_FUNDING_WEI = 100_000_000_000_000_000n; // 0.1 ETH

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

// ─── RIP-7212 P256 precompile check ───

const P256_PRECOMPILE = '0x0000000000000000000000000000000000000100';

/**
 * Test vector: sha256("test") signed with a known P-256 key.
 * Input: hash(32) + r(32) + s(32) + x(32) + y(32) = 160 bytes.
 * Precompile returns 1 (32 bytes) for a valid signature.
 */
const VALID_P256_CALL =
	'0x' +
	'9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08' +
	'7bf0e18d07660f15994adce5c3836d7bd6167cdb5726f631098f433ebe0be9c0' +
	'3936edbe5c791477e714e58244afb690b9b88b833ff4acdf0fbd1b28bf0b1182' +
	'3be8cbcb3f590087711ae5ed74b9cd06a88058d0bbe700b5f0ec5a1bfac15592' +
	'f989ef9bfaae0fee03c36625e88eae99806a879d813411f876e7e03a2ffd8314';

/**
 * Check if the RIP-7212 P256 precompile is available on the chain.
 * Required for passkey (WebAuthn) signature verification.
 */
export async function checkP256Precompile(rpcUrl: string): Promise<boolean> {
	try {
		const result = (await rpcCall(rpcUrl, 'eth_call', [
			{ to: P256_PRECOMPILE, data: VALID_P256_CALL },
			'latest',
		])) as string;
		return result !== '0x' && result.length >= 66 && BigInt(result) === 1n;
	} catch {
		return false;
	}
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
/**
 * Expected runtime bytecodes or bytecode hashes for non-CREATE2 contracts.
 * - Short bytecodes (Arachnid, Safe Factory): stored as full hex for direct comparison
 * - Large bytecodes (Multicall3): stored as keccak256 hash for comparison
 */
const EXPECTED_RUNTIME_BYTECODES: Record<string, string> = {
	arachnidProxy:
		'0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3',
	safeSingletonFactory:
		'0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3',
};

/** keccak256 hashes of expected runtime bytecodes (for large contracts) */
const EXPECTED_BYTECODE_HASHES: Record<string, string> = {
	multicall3: '0xd5c15df687b16f2ff992fc8d767b4216323184a2bbc6ee2f9c398c318e770891',
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
export interface CheckAllResult {
	contracts: ContractStatus[];
	p256Available: boolean;
}

export async function checkAllContracts(rpcUrl: string): Promise<CheckAllResult> {
	const [contracts, p256Available] = await Promise.all([
		Promise.all(CONTRACT_ORDER.map(async (key) => {
			const def = REQUIRED_CONTRACTS[key];
			const expectedBytecode = EXPECTED_RUNTIME_BYTECODES[key];
			const expectedHash = EXPECTED_BYTECODE_HASHES[key];

			try {
				const code = (await rpcCall(rpcUrl, 'eth_getCode', [def.address, 'latest'])) as string;
				const hasAnyCode = !!code && code !== '0x' && code !== '0x0';

				if (!hasAnyCode) {
					return { key, def, deployed: false, verified: false, mismatch: false };
				}

				// For non-CREATE2 contracts, verify bytecode matches
				if (expectedHash) {
					// Large bytecodes: compare keccak256 hash
					const { keccak256 } = await import('viem');
					const codeHash = keccak256(code as `0x${string}`);
					const match = codeHash.toLowerCase() === expectedHash.toLowerCase();
					return { key, def, deployed: match, verified: match, mismatch: !match };
				}
				if (expectedBytecode) {
					const match = code.toLowerCase() === expectedBytecode.toLowerCase();
					return { key, def, deployed: match, verified: match, mismatch: !match };
				}

				// CREATE2 contracts — code existence is sufficient
				return { key, def, deployed: true, verified: true, mismatch: false };
			} catch {
				return { key, def, deployed: false, verified: false, mismatch: false };
			}
		})),
		checkP256Precompile(rpcUrl).catch(() => false),
	]);
	return { contracts, p256Available };
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
 * Broadcast the pre-signed Multicall3 deployment transaction.
 * Returns the transaction hash.
 */
export async function broadcastMulticall3Tx(rpcUrl: string): Promise<string> {
	const txHash = (await rpcCall(rpcUrl, 'eth_sendRawTransaction', [
		MULTICALL3_PRESIGNED_TX,
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
