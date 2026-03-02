import { defineModule } from '@shelchin/pagekit';
import { z } from '@shelchin/pda';
import { NETWORKS } from '../infra/networks.js';

export interface AddressEntry {
	value: string;
	valid: boolean;
}

export interface NetworkInfo {
	key: string;
	name: string;
	symbol: string;
	chainId: number;
}

const availableNetworks: NetworkInfo[] = Object.entries(NETWORKS).map(([key, config]) => ({
	key,
	name: config.name,
	symbol: config.symbol,
	chainId: config.chainId,
}));

function recomputeDerived(ctx: {
	addresses: AddressEntry[];
	selectedNetworks: string[];
	validAddressCount: number;
	invalidAddressCount: number;
	totalQueries: number;
	canExecute: boolean;
}) {
	ctx.validAddressCount = ctx.addresses.filter((a) => a.valid).length;
	ctx.invalidAddressCount = ctx.addresses.filter((a) => !a.valid).length;
	ctx.totalQueries = ctx.validAddressCount * ctx.selectedNetworks.length;
	ctx.canExecute = ctx.validAddressCount > 0 && ctx.selectedNetworks.length > 0;
}

export const configModule = defineModule({
	name: 'config',
	description: 'Configure wallet addresses and networks for balance queries',

	context: {
		addresses: [] as AddressEntry[],
		addressInput: '',
		selectedNetworks: ['ethereum'] as string[],
		availableNetworks,
		validAddressCount: 0,
		invalidAddressCount: 0,
		totalQueries: 0,
		canExecute: false,
	},

	actions: {
		setAddresses: {
			description: 'Set wallet addresses from text input (comma or newline separated)',
			input: z.object({
				text: z.string().describe('Addresses text, comma or newline separated'),
			}),
			output: z.object({
				validCount: z.number(),
				invalidCount: z.number(),
			}),
			execute({ input, ctx }) {
				const raw = input.text
					.split(/[,\n]/)
					.map((a: string) => a.trim())
					.filter(Boolean);

				ctx.addresses = raw.map((value: string) => ({
					value,
					valid: /^0x[a-fA-F0-9]{40}$/.test(value),
				}));
				ctx.addressInput = input.text;
				recomputeDerived(ctx);

				return {
					validCount: ctx.validAddressCount,
					invalidCount: ctx.invalidAddressCount,
				};
			},
		},

		setValidAddresses: {
			description: 'Set pre-validated wallet addresses (skips parsing, used by LineEditor UI)',
			input: z.object({
				addresses: z.array(z.string()).describe('Array of valid wallet addresses'),
			}),
			execute({ input, ctx }) {
				ctx.addresses = input.addresses.map((value: string) => ({ value, valid: true }));
				ctx.addressInput = input.addresses.join('\n');
				recomputeDerived(ctx);
			},
		},

		removeAddress: {
			description: 'Remove a specific address by index',
			input: z.object({
				index: z.number().min(0).describe('Index of address to remove'),
			}),
			execute({ input, ctx }) {
				ctx.addresses.splice(input.index, 1);
				recomputeDerived(ctx);
			},
		},

		clearAddresses: {
			description: 'Remove all addresses',
			input: z.object({}),
			execute({ ctx }) {
				ctx.addresses = [];
				ctx.addressInput = '';
				recomputeDerived(ctx);
			},
		},

		toggleNetwork: {
			description: 'Toggle a network on or off',
			input: z.object({
				network: z.string().describe('Network key to toggle (e.g. ethereum, polygon)'),
			}),
			execute({ input, ctx }) {
				const idx = ctx.selectedNetworks.indexOf(input.network);
				if (idx === -1) {
					ctx.selectedNetworks.push(input.network);
				} else {
					ctx.selectedNetworks.splice(idx, 1);
				}
				recomputeDerived(ctx);
			},
		},

		selectAllNetworks: {
			description: 'Select all available networks',
			input: z.object({}),
			execute({ ctx }) {
				ctx.selectedNetworks = ctx.availableNetworks.map((n) => n.key);
				recomputeDerived(ctx);
			},
		},

		deselectAllNetworks: {
			description: 'Deselect all networks',
			input: z.object({}),
			execute({ ctx }) {
				ctx.selectedNetworks = [];
				recomputeDerived(ctx);
			},
		},
	},
});
