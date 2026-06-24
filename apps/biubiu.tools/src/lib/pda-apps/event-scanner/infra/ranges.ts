/**
 * Inclusive block-range arithmetic for scan-coverage auditing.
 *
 * A scan's job is to cover [fromBlock, toBlock] completely. When no RPC can
 * serve a block it becomes a *gap*. For a tax/audit tool, gaps must be tracked
 * as concrete ranges (not a count) so they can be shown, re-scanned, and proven
 * filled. These helpers keep gap lists normalized (sorted, coalesced, disjoint).
 */

/** Inclusive block range `[from, to]` (from ≤ to). */
export type BlockRange = [number, number];

/** Sort, coalesce overlapping/adjacent ranges into a minimal disjoint set. */
export function mergeRanges(ranges: BlockRange[]): BlockRange[] {
	const valid = ranges.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a);
	if (valid.length === 0) return [];
	const sorted = [...valid].sort((x, y) => x[0] - y[0]);
	const out: BlockRange[] = [[sorted[0][0], sorted[0][1]]];
	for (let i = 1; i < sorted.length; i++) {
		const [from, to] = sorted[i];
		const last = out[out.length - 1];
		// Adjacent (to+1) ranges coalesce too: [1,3] + [4,6] = [1,6].
		if (from <= last[1] + 1) last[1] = Math.max(last[1], to);
		else out.push([from, to]);
	}
	return out;
}

/** Subtract `covered` ranges from `base`, returning what remains uncovered. */
export function subtractRanges(base: BlockRange[], covered: BlockRange[]): BlockRange[] {
	const cov = mergeRanges(covered);
	const out: BlockRange[] = [];
	for (const [from, to] of mergeRanges(base)) {
		let cursor = from;
		for (const [cFrom, cTo] of cov) {
			if (cTo < cursor || cFrom > to) continue; // no overlap with the remaining part
			if (cFrom > cursor) out.push([cursor, cFrom - 1]); // uncovered slice before this cover
			cursor = Math.max(cursor, cTo + 1);
			if (cursor > to) break;
		}
		if (cursor <= to) out.push([cursor, to]);
	}
	return out;
}

/** Total inclusive block count across a (preferably merged) range list. */
export function totalBlocks(ranges: BlockRange[]): number {
	return mergeRanges(ranges).reduce((sum, [a, b]) => sum + (b - a + 1), 0);
}
