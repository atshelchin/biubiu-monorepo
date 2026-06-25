/** Minimal ABI for the Forever protocol contract (only what the client uses). */
const ENTRY_TUPLE = {
	type: 'tuple',
	components: [
		{ name: 'createdAt', type: 'uint64' },
		{ name: 'unlockAt', type: 'uint64' },
		{ name: 'drandRound', type: 'uint64' },
		{ name: 'mode', type: 'uint8' },
		{ name: 'beaconScheme', type: 'bytes32' },
		{ name: 'payload', type: 'bytes' }
	]
} as const;

export const FOREVER_ABI = [
	{
		type: 'function',
		name: 'seal',
		stateMutability: 'payable',
		inputs: [
			{ name: 'mode', type: 'uint8' },
			{ name: 'unlockAt', type: 'uint64' },
			{ name: 'drandRound', type: 'uint64' },
			{ name: 'beaconScheme', type: 'bytes32' },
			{ name: 'payload', type: 'bytes' }
		],
		outputs: []
	},
	{
		type: 'function',
		name: 'setKey',
		stateMutability: 'nonpayable',
		inputs: [{ name: 'envelope', type: 'bytes' }],
		outputs: []
	},
	{ type: 'function', name: 'fee', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
	{ type: 'function', name: 'maxPayload', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
	{
		type: 'function',
		name: 'entryCount',
		stateMutability: 'view',
		inputs: [{ name: 'author', type: 'address' }],
		outputs: [{ type: 'uint256' }]
	},
	{
		type: 'function',
		name: 'getEntries',
		stateMutability: 'view',
		inputs: [
			{ name: 'author', type: 'address' },
			{ name: 'offset', type: 'uint256' },
			{ name: 'limit', type: 'uint256' }
		],
		outputs: [{ name: 'page', type: 'tuple[]', components: ENTRY_TUPLE.components }]
	},
	{
		type: 'function',
		name: 'getEntriesDesc',
		stateMutability: 'view',
		inputs: [
			{ name: 'author', type: 'address' },
			{ name: 'offset', type: 'uint256' },
			{ name: 'limit', type: 'uint256' }
		],
		outputs: [{ name: 'page', type: 'tuple[]', components: ENTRY_TUPLE.components }]
	},
	{
		type: 'function',
		name: 'keyCount',
		stateMutability: 'view',
		inputs: [{ name: 'author', type: 'address' }],
		outputs: [{ type: 'uint256' }]
	},
	{
		type: 'function',
		name: 'getKeys',
		stateMutability: 'view',
		inputs: [{ name: 'author', type: 'address' }],
		outputs: [{ type: 'bytes[]' }]
	},
	{
		type: 'function',
		name: 'cooldownRemaining',
		stateMutability: 'view',
		inputs: [{ name: 'author', type: 'address' }],
		outputs: [{ type: 'uint64' }]
	},
	{
		type: 'event',
		name: 'Sealed',
		inputs: [
			{ name: 'author', type: 'address', indexed: true },
			{ name: 'index', type: 'uint256', indexed: true },
			{ name: 'mode', type: 'uint8', indexed: true },
			{ name: 'createdAt', type: 'uint64', indexed: false },
			{ name: 'unlockAt', type: 'uint64', indexed: false }
		]
	},
	{
		type: 'event',
		name: 'KeyAdded',
		inputs: [
			{ name: 'author', type: 'address', indexed: true },
			{ name: 'index', type: 'uint256', indexed: false }
		]
	}
] as const;

/** Mode tags carried in entries (informational; not interpreted on-chain). */
export const MODE_PRIVATE = 0;
export const MODE_CAPSULE = 1;
