/**
 * Regression tests for the relay key file content + verification.
 *
 * The bug: the downloaded key file claimed the holder "cannot redirect a sweep —
 * the destination is fixed per transaction", which is false — Sweeper7702.sweep
 * takes `dest` as a per-call argument, so anyone holding the relay key can drain
 * any still-delegated EOA to any address. The file must tell the truth so users
 * know to revoke + delete the key.
 */
import { describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';

// estimateFundingWei reads gas price via ./rpc.js; stub it so the estimate is
// deterministic and network-free.
const PRICE = 2_000_000_000n; // 2 gwei
vi.mock('./rpc.js', () => ({
	getGasPrice: vi.fn(async () => PRICE),
	getBalance: vi.fn(async () => 0n),
}));

import { relayFileContent, verifyRelayFile, estimateFundingWei, type Relayer } from './relayer.js';

const relay: Relayer = (() => {
	const pk = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
	return { privateKey: pk, address: privateKeyToAccount(pk).address };
})();

describe('relayFileContent', () => {
	const text = relayFileContent(relay, 'base', 1_700_000_000_000);

	it('no longer claims the holder cannot redirect a sweep (the old lie)', () => {
		expect(text.toLowerCase()).not.toContain('cannot redirect');
		expect(text.toLowerCase()).not.toContain('destination is fixed per transaction');
	});

	it('warns that the key can redirect any still-delegated EOA to any destination', () => {
		const lower = text.toLowerCase();
		expect(lower).toContain('any');
		expect(lower).toContain('revoke');
		expect(lower).toContain('delete');
	});

	it('still includes the address and private key so the file is usable', () => {
		expect(text).toContain(relay.address);
		expect(text).toContain(relay.privateKey);
	});
});

describe('verifyRelayFile', () => {
	it('accepts a file that contains the matching private key', () => {
		const text = relayFileContent(relay, 'base', 1);
		expect(verifyRelayFile(text, relay)).toBe(true);
	});

	it('rejects a file with a different (valid) private key', () => {
		const otherPk = '0x0000000000000000000000000000000000000000000000000000000000000002' as const;
		const text = `garbage ${otherPk} more`;
		expect(verifyRelayFile(text, relay)).toBe(false);
	});

	it('rejects a file with no private key', () => {
		expect(verifyRelayFile('no key here', relay)).toBe(false);
	});
});

/**
 * Funding-estimate coverage (REVIEW-FINDINGS pda-apps/wallet-sweep P2:
 * "Funding estimate can underfund multi-chunk sweeps because deploy gas is
 * double-counted but per-chunk fixed overhead is not").
 *
 * The bug: estimateFundingWei used a single flat `60_000 + deploy + perEoa*eoas`
 * with NO notion of chunk count, while runSweep spends the 60_000 fixed overhead
 * (plus a 21_000 tx intrinsic) PER CHUNK of maxBatchUpgrade EOAs. For an N-chunk
 * sweep the relay's real fixed cost is ~N× what was estimated, so on a price spike
 * it can run out of gas mid-sweep. The fix multiplies the per-chunk fixed overhead
 * by ceil(eoaCount / maxBatchUpgrade).
 */
describe('estimateFundingWei — multi-chunk coverage', () => {
	const base = {
		rpcs: ['https://x'],
		tokenCount: 0,
		deployBatchSweeper: false,
		deploySweeper: false,
		feeWei: 0n,
	};

	// Mirror of runSweep's REAL per-chunk gas spend (sweep.ts):
	//   perEoa = 45_000 + 40_000*tokens;  gas = 60_000 + perEoa*group + 30_000*toAuth
	// First full sweep ⇒ toAuth === group (every EOA needs authorizing).
	function realRunSweepGas(eoaCount: number, batch: number, tokens: number): bigint {
		const perEoa = 45_000n + 40_000n * BigInt(tokens);
		let total = 0n;
		let remaining = eoaCount;
		while (remaining > 0) {
			const group = BigInt(Math.min(batch, remaining));
			total += 60_000n + perEoa * group + 30_000n * group; // + auth for every EOA in chunk
			total += 21_000n; // each chunk is its own transaction (intrinsic)
			remaining -= Math.min(batch, remaining);
		}
		return total;
	}

	it('grows with chunk count: a smaller batch size (more chunks) needs strictly more gas', async () => {
		// Same 300 EOAs, but batch 50 (6 chunks) vs batch 300 (1 chunk).
		const sixChunks = await estimateFundingWei({ ...base, eoaCount: 300, maxBatchUpgrade: 50 });
		const oneChunk = await estimateFundingWei({ ...base, eoaCount: 300, maxBatchUpgrade: 300 });
		expect(sixChunks).toBeGreaterThan(oneChunk);

		// The delta is exactly the extra per-chunk fixed overhead (60_000 + 21_000)
		// for the 5 additional chunks, at PRICE, doubled by the ×2 cushion.
		const extraChunks = 6n - 1n;
		const perChunkFixed = 60_000n + 21_000n;
		expect(sixChunks - oneChunk).toBe(perChunkFixed * extraChunks * PRICE * 2n);
	});

	it('covers the ACTUAL aggregate runSweep gas across ALL chunks at the quoted price', async () => {
		// A genuinely multi-chunk sweep: 300 EOAs at batch 50 → 6 chunks, 2 tokens.
		const est = await estimateFundingWei({
			...base,
			eoaCount: 300,
			tokenCount: 2,
			maxBatchUpgrade: 50,
		});
		const realCostAtQuotedPrice = realRunSweepGas(300, 50, 2) * PRICE;
		// The full multi-chunk spend (all 6 chunks, every EOA authorized + swept,
		// per-chunk intrinsics) must be covered.
		expect(est).toBeGreaterThanOrEqual(realCostAtQuotedPrice);
	});

	it('still covers the sweep after a moderate gas-price spike (the ×2 cushion at work)', async () => {
		// 300 EOAs / 6 chunks; price jumps 1.8× between estimate and execution.
		const est = await estimateFundingWei({
			...base,
			eoaCount: 300,
			tokenCount: 2,
			maxBatchUpgrade: 50,
		});
		const realGas = realRunSweepGas(300, 50, 2);
		const spikedCost = (realGas * PRICE * 18n) / 10n; // +80% price spike
		expect(est).toBeGreaterThanOrEqual(spikedCost);
	});

	it('adds the service fee exactly once on top of gas', async () => {
		const fee = 5_000_000_000_000_000n;
		const withoutFee = await estimateFundingWei({ ...base, eoaCount: 100, maxBatchUpgrade: 50 });
		const withFee = await estimateFundingWei({
			...base,
			eoaCount: 100,
			maxBatchUpgrade: 50,
			feeWei: fee,
		});
		expect(withFee - withoutFee).toBe(fee);
	});

	it('treats a zero/invalid batch size as a single chunk (no divide-by-zero)', async () => {
		const est = await estimateFundingWei({ ...base, eoaCount: 10, maxBatchUpgrade: 0 });
		// 10 EOAs, batch coerced to 1 ⇒ 10 chunks of fixed overhead.
		const perChunkFixed = 60_000n + 21_000n;
		const perEoa = 70_000n;
		const expectedUnits = perChunkFixed * 10n + perEoa * 10n;
		expect(est).toBe(expectedUnits * PRICE * 2n);
	});

	it('charges zero gas units for zero EOAs (only fee, if any)', async () => {
		const est = await estimateFundingWei({ ...base, eoaCount: 0, maxBatchUpgrade: 50, feeWei: 7n });
		expect(est).toBe(7n);
	});
});
