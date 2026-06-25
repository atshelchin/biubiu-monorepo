/**
 * Round-trip tests for the IndexedDB custom-store, exercising the shared
 * `withStore` write wrapper (extracted from the duplicated put/del boilerplate)
 * plus getAll. Runs in the browser (chromium) project because it needs a real
 * IndexedDB; the node project has no `indexedDB` and the store no-ops there.
 *
 * Each test uses a fresh DB name is not possible (DB_NAME is fixed), so we clean
 * the relevant store between tests by deleting the entries we added.
 */
import { describe, it, expect, afterEach } from 'vitest';
import type { Address } from 'viem';
import type { SpenderEntry, TokenEntry } from '../types.js';
import {
	getCustomTokens,
	saveCustomToken,
	deleteCustomToken,
	getCustomSpenders,
	saveCustomSpender,
	deleteCustomSpender,
} from './custom-store.js';

const TOKEN: TokenEntry = {
	standard: 'erc20',
	address: '0x6B175474E89094C44Da98b954EedeAC495271d0F' as Address,
	symbol: 'DAI',
	decimals: 18,
	isCustom: true,
};
const SPENDER: SpenderEntry = {
	address: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address,
	label: 'Permit2',
	kind: 'permit2',
	isCustom: true,
};

afterEach(async () => {
	// Best-effort cleanup so tests don't leak state into one another.
	await deleteCustomToken(1, TOKEN.address);
	await deleteCustomSpender(1, SPENDER.address);
});

describe('custom-store (withStore write wrapper + getAll)', () => {
	it('saves then reads back a custom token, keyed by chainId', async () => {
		await saveCustomToken(1, TOKEN);
		const byChain = await getCustomTokens();
		expect(byChain[1]).toEqual([TOKEN]);
	});

	it('deletes a saved token (withStore readwrite delete settles on tx complete)', async () => {
		await saveCustomToken(1, TOKEN);
		await deleteCustomToken(1, TOKEN.address);
		const byChain = await getCustomTokens();
		expect(byChain[1] ?? []).toEqual([]);
	});

	it('round-trips a custom spender independently of tokens', async () => {
		await saveCustomSpender(1, SPENDER);
		const byChain = await getCustomSpenders();
		expect(byChain[1]).toEqual([SPENDER]);
	});
});
