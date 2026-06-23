import { describe, it, expect } from 'vitest';
import { configModule, buildTokenSelections, type TokenInfo } from './config.js';

const ADDR1 = '0x1111111111111111111111111111111111111111';
const ADDR2 = '0x2222222222222222222222222222222222222222';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const usdcId = USDC.toLowerCase();

/** Fresh, isolated copy of the module's initial context for each test. */
function makeCtx() {
	return structuredClone(configModule.context);
}

const tokenPool: Record<string, TokenInfo[]> = {
	ethereum: [
		{ id: 'native', kind: 'native', symbol: 'ETH', decimals: 18, isCustom: false },
		{ id: usdcId, kind: 'erc20', address: USDC, symbol: 'USDC', decimals: 6, isCustom: false },
	],
};

// ── buildTokenSelections (pure) ──────────────────────────────────────────────

describe('buildTokenSelections', () => {
	it('maps selected token ids to full TokenSpecs', () => {
		const out = buildTokenSelections(['ethereum'], { ethereum: ['native', usdcId] }, tokenPool);
		expect(out).toEqual([
			{
				network: 'ethereum',
				tokens: [
					{ kind: 'native', address: undefined, symbol: 'ETH', decimals: 18 },
					{ kind: 'erc20', address: USDC, symbol: 'USDC', decimals: 6 },
				],
			},
		]);
	});

	it('defaults to the native token when a network has no selection entry', () => {
		const out = buildTokenSelections(['ethereum'], {}, tokenPool);
		expect(out[0].tokens).toEqual([{ kind: 'native', address: undefined, symbol: 'ETH', decimals: 18 }]);
	});

	it('filters out ids not present in the available pool', () => {
		const out = buildTokenSelections(['ethereum'], { ethereum: ['native', '0xdead'] }, tokenPool);
		expect(out[0].tokens.map((t) => t.symbol)).toEqual(['ETH']);
	});

	it('drops a network whose selection resolves to no known tokens', () => {
		const out = buildTokenSelections(['ethereum'], { ethereum: ['0xunknown'] }, tokenPool);
		expect(out).toEqual([]);
	});
});

// ── config actions: address parsing + derived state ──────────────────────────

describe('config.setAddresses', () => {
	it('counts valid/invalid addresses and computes totalQueries', async () => {
		const ctx = makeCtx();
		const result = await configModule.actions.setAddresses.execute({
			input: { text: `${ADDR1}, ${ADDR2}, not-an-address` },
			ctx,
		});
		expect(result).toEqual({ validCount: 2, invalidCount: 1 });
		// 2 valid × 1 token (native default on ethereum)
		expect(ctx.totalQueries).toBe(2);
		expect(ctx.canExecute).toBe(true);
	});
});

// ── config actions: network selection ────────────────────────────────────────

describe('config.toggleNetwork', () => {
	it('selecting a network defaults its token selection to native', async () => {
		const ctx = makeCtx();
		ctx.selectedNetworks = [];
		ctx.selectedTokens = {};
		await configModule.actions.toggleNetwork.execute({ input: { network: 'polygon' }, ctx });
		expect(ctx.selectedNetworks).toContain('polygon');
		expect(ctx.selectedTokens.polygon).toEqual(['native']);
	});

	it('toggling a selected network off removes it', async () => {
		const ctx = makeCtx(); // starts with ethereum selected
		await configModule.actions.toggleNetwork.execute({ input: { network: 'ethereum' }, ctx });
		expect(ctx.selectedNetworks).not.toContain('ethereum');
	});
});

// ── config actions: token selection ──────────────────────────────────────────

describe('config.toggleToken', () => {
	it('adds a token id to a network selection', async () => {
		const ctx = makeCtx();
		await configModule.actions.toggleToken.execute({
			input: { network: 'ethereum', tokenId: usdcId },
			ctx,
		});
		expect(ctx.selectedTokens.ethereum).toEqual(['native', usdcId]);
	});

	it('removes a token when more than one is selected', async () => {
		const ctx = makeCtx();
		ctx.selectedTokens.ethereum = ['native', usdcId];
		await configModule.actions.toggleToken.execute({
			input: { network: 'ethereum', tokenId: usdcId },
			ctx,
		});
		expect(ctx.selectedTokens.ethereum).toEqual(['native']);
	});

	it('refuses to remove the last remaining token', async () => {
		const ctx = makeCtx(); // ethereum: ['native']
		await configModule.actions.toggleToken.execute({
			input: { network: 'ethereum', tokenId: 'native' },
			ctx,
		});
		expect(ctx.selectedTokens.ethereum).toEqual(['native']);
	});
});

// ── config actions: custom networks (IndexedDB-guarded, no-op store in node) ──

describe('config.addCustomNetwork / removeCustomNetwork', () => {
	it('adds a custom network into the registry and selectable list', async () => {
		const ctx = makeCtx();
		const out = await configModule.actions.addCustomNetwork.execute({
			input: {
				name: 'BNB Chain',
				chainId: 56,
				rpcs: ['https://bsc-rpc.publicnode.com'],
				symbol: 'BNB',
				decimals: 18,
			},
			ctx,
		});
		expect(out).toEqual({ key: 'custom-56' });
		expect(ctx.customNetworks.some((n) => n.chainId === 56)).toBe(true);
		expect(ctx.availableNetworks.some((n) => n.key === 'custom-56' && n.isCustom)).toBe(true);
	});

	it('removes a custom network and its derived entry', async () => {
		const ctx = makeCtx();
		await configModule.actions.addCustomNetwork.execute({
			input: { name: 'BNB', chainId: 56, rpcs: ['https://x'], symbol: 'BNB', decimals: 18 },
			ctx,
		});
		await configModule.actions.removeCustomNetwork.execute({ input: { chainId: 56 }, ctx });
		expect(ctx.customNetworks.some((n) => n.chainId === 56)).toBe(false);
		expect(ctx.availableNetworks.some((n) => n.key === 'custom-56')).toBe(false);
	});
});

// ── config actions: custom tokens ────────────────────────────────────────────

describe('config.addCustomToken / removeCustomToken', () => {
	it('adds a custom token and auto-selects it on its network', async () => {
		const ctx = makeCtx();
		const out = await configModule.actions.addCustomToken.execute({
			input: { network: 'ethereum', address: USDC, symbol: 'USDC', decimals: 6 },
			ctx,
		});
		expect(out).toEqual({ id: `ethereum:${usdcId}` });
		expect(ctx.customTokens.some((t) => t.id === `ethereum:${usdcId}`)).toBe(true);
		expect(ctx.selectedTokens.ethereum).toContain(usdcId);
		expect(ctx.availableTokens.ethereum.some((t) => t.isCustom && t.symbol === 'USDC')).toBe(true);
	});

	it('removing a custom token falls back to native when nothing else is selected', async () => {
		const ctx = makeCtx();
		await configModule.actions.addCustomToken.execute({
			input: { network: 'ethereum', address: USDC, symbol: 'USDC', decimals: 6 },
			ctx,
		});
		// pretend only the custom token was selected
		ctx.selectedTokens.ethereum = [usdcId];
		await configModule.actions.removeCustomToken.execute({
			input: { network: 'ethereum', address: USDC },
			ctx,
		});
		expect(ctx.customTokens.some((t) => t.id === `ethereum:${usdcId}`)).toBe(false);
		expect(ctx.selectedTokens.ethereum).toEqual(['native']);
	});
});

// ── config actions: hydrate (no IndexedDB in node → empty) ───────────────────

describe('config.hydrateCustom', () => {
	it('loads empty custom collections when IndexedDB is unavailable', async () => {
		const ctx = makeCtx();
		await configModule.actions.hydrateCustom.execute({ input: {}, ctx });
		expect(ctx.customNetworks).toEqual([]);
		expect(ctx.customTokens).toEqual([]);
	});
});
