/**
 * Chain-demo registry: deterministic CREATE2 deployment + pre-wired chains that
 * showcase the returndata-forwarding feature.
 *
 * Each scenario is a pair of self-contained contracts (see
 * apps/biubiu-contracts/src/demos/ChainDemos.sol). They deploy to a fixed
 * address on every chain (fixed salt + fixed bytecode), so the first user to
 * deploy seeds them for everyone else — `getCode` tells us if they're already
 * there. A scenario's pre-wired chain feeds step 1's return value straight into
 * step 2's parameter, which is the whole point we're demonstrating.
 */
import { type Address, type Hex, getAddress } from 'viem';
import { CREATE2_PROXY, predictCreate2Address } from '$lib/deploy/create2.js';
import { makeClient, isDeployedWith } from '../rpc-client.js';
import { DEMO_BYTECODE, type DemoContractName } from './bytecode.js';

export type { DemoContractName };

/** Fixed CREATE2 salt — same everywhere (init code differs per contract). */
export const DEMO_SALT: Hex = `0x${'00'.repeat(32)}`;

/** Fixed demo recipient for the mint → transfer scenario (a vanity address). */
export const DEMO_RECIPIENT: Address = getAddress('0x000000000000000000000000000000000000bEEF');

function predict(name: DemoContractName): Address {
	const addr = predictCreate2Address(DEMO_SALT, DEMO_BYTECODE[name]);
	if (!addr) throw new Error(`Could not predict CREATE2 address for ${name}`);
	return addr as Address;
}

const CONTRACT_NAMES = Object.keys(DEMO_BYTECODE) as DemoContractName[];

/** Deterministic address of each demo contract (identical on every chain). */
export const DEMO_ADDRESS = Object.fromEntries(
	CONTRACT_NAMES.map((n) => [n, predict(n)])
) as Record<DemoContractName, Address>;

/** CREATE2 deploy calldata for one demo contract (proxy expects salt ‖ initCode). */
export function demoDeployCalldata(name: DemoContractName): { to: Address; data: Hex } {
	return {
		to: CREATE2_PROXY as Address,
		data: `${DEMO_SALT}${DEMO_BYTECODE[name].slice(2)}` as Hex
	};
}

/** Human-readable ABIs — only the methods the demos surface. */
export const DEMO_ABI: Record<DemoContractName, string[]> = {
	BoxFactory: ['function createBox() returns (address)', 'function total() view returns (uint256)'],
	BoxRegistry: [
		'function register(address box)',
		'function latest() view returns (address)',
		'function count() view returns (uint256)'
	],
	LootToken: [
		'function transfer(address to, uint256 amount) returns (bool)',
		'function balanceOf(address account) view returns (uint256)'
	],
	LootFaucet: ['function roll(address loot) returns (uint256)'],
	PriceOracle: ['function price() view returns (uint256)'],
	Market: [
		'function buy(uint256 price)',
		'function lastPrice() view returns (uint256)',
		'function trades() view returns (uint256)'
	],
	Drawer: ['function draw() returns (uint256)', 'function lastTarget() view returns (uint256)'],
	Lottery: [
		'function claim(address drawer, uint256 guess)',
		'function winner() view returns (address)',
		'function winningNumber() view returns (uint256)',
		'function wins() view returns (uint256)'
	]
};

/** How a pre-wired step or proof gets each argument. */
export type DemoArg =
	| { kind: 'contract'; name: DemoContractName } // a deployed demo contract's address
	| { kind: 'recipient' } // the fixed demo recipient
	| { kind: 'ref'; step: number }; // forward output word 0 of an earlier step

export interface DemoStep {
	contract: DemoContractName;
	/** Function name, resolved against DEMO_ABI. */
	fn: string;
	/** One entry per function input (empty for no-arg functions). */
	args: DemoArg[];
}

/** Proof-read label suffixes (under `cc.demos.proof.*`). */
export type DemoProofLabel =
	| 'latest'
	| 'count'
	| 'recipientBalance'
	| 'lastPrice'
	| 'trades'
	| 'winner'
	| 'winningNumber';

export interface DemoProof {
	contract: DemoContractName;
	fn: string;
	args: DemoArg[];
	/** i18n key suffix under `cc.demos.proof.*`. */
	labelKey: DemoProofLabel;
}

export interface DemoScenario {
	id: 'factory' | 'faucet' | 'oracle' | 'lottery';
	/** Contracts that must be deployed for this scenario. */
	contracts: DemoContractName[];
	/** The pre-wired chain (step 1 → step 2). */
	steps: DemoStep[];
	/** Reads that prove the forwarding happened, run after execution. */
	proofs: DemoProof[];
}

export const DEMO_SCENARIOS: DemoScenario[] = [
	{
		id: 'factory',
		contracts: ['BoxFactory', 'BoxRegistry'],
		steps: [
			{ contract: 'BoxFactory', fn: 'createBox', args: [] },
			{ contract: 'BoxRegistry', fn: 'register', args: [{ kind: 'ref', step: 0 }] }
		],
		proofs: [
			{ contract: 'BoxRegistry', fn: 'latest', args: [], labelKey: 'latest' },
			{ contract: 'BoxRegistry', fn: 'count', args: [], labelKey: 'count' }
		]
	},
	{
		id: 'faucet',
		contracts: ['LootToken', 'LootFaucet'],
		steps: [
			{ contract: 'LootFaucet', fn: 'roll', args: [{ kind: 'contract', name: 'LootToken' }] },
			{
				contract: 'LootToken',
				fn: 'transfer',
				args: [{ kind: 'recipient' }, { kind: 'ref', step: 0 }]
			}
		],
		proofs: [
			{
				contract: 'LootToken',
				fn: 'balanceOf',
				args: [{ kind: 'recipient' }],
				labelKey: 'recipientBalance'
			}
		]
	},
	{
		id: 'oracle',
		contracts: ['PriceOracle', 'Market'],
		steps: [
			{ contract: 'PriceOracle', fn: 'price', args: [] },
			{ contract: 'Market', fn: 'buy', args: [{ kind: 'ref', step: 0 }] }
		],
		proofs: [
			{ contract: 'Market', fn: 'lastPrice', args: [], labelKey: 'lastPrice' },
			{ contract: 'Market', fn: 'trades', args: [], labelKey: 'trades' }
		]
	},
	{
		id: 'lottery',
		contracts: ['Drawer', 'Lottery'],
		steps: [
			{ contract: 'Drawer', fn: 'draw', args: [] },
			{
				contract: 'Lottery',
				fn: 'claim',
				args: [
					{ kind: 'contract', name: 'Drawer' },
					{ kind: 'ref', step: 0 }
				]
			}
		],
		proofs: [
			{ contract: 'Lottery', fn: 'winner', args: [], labelKey: 'winner' },
			{ contract: 'Lottery', fn: 'winningNumber', args: [], labelKey: 'winningNumber' }
		]
	}
];

/** Resolve a non-ref demo arg to its canonical string value. */
export function resolveDemoArg(arg: DemoArg): string {
	if (arg.kind === 'contract') return DEMO_ADDRESS[arg.name];
	if (arg.kind === 'recipient') return DEMO_RECIPIENT;
	return ''; // ref → placeholder (filled from returndata at execution)
}

/** Which of `names` are already deployed on the chain behind `rpcUrl`. */
export async function getDeployedDemos(
	rpcUrl: string,
	names: DemoContractName[]
): Promise<Record<string, boolean>> {
	const client = makeClient(rpcUrl);
	const out: Record<string, boolean> = {};
	await Promise.all(
		names.map(async (n) => {
			out[n] = await isDeployedWith(client, DEMO_ADDRESS[n]);
		})
	);
	return out;
}
