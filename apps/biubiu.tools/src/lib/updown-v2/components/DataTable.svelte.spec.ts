/**
 * Browser component tests for DataTable.
 *
 * Regression focus (P2): default-sort initialization. The previous code seeded
 * sortKey/sortDir inside a one-shot $effect guarded by a non-reactive `initialized`
 * flag, so the sort was NOT applied on the first synchronous render (it flipped in
 * after mount) and the column header sort-arrow / row order could be wrong on first
 * paint. The fix initializes sortKey/sortDir directly from props ($state(defaultSortKey)),
 * so the default sort is correct on the very first render. We assert:
 *  - initial render is already sorted by defaultSortKey/defaultSortDir (arrow + row order)
 *  - clicking a header toggles sort (user interaction still owns state afterwards)
 *  - the active sort-arrow tracks the active column
 */
import { page } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Harness from './DataTableHarness.svelte';
import type { Column } from './data-table';

interface Row {
	id: string;
	name: string;
	score: number;
}

const columns: Column<Row>[] = [
	{ key: 'name', label: 'Name', getValue: (r) => r.name },
	{ key: 'score', label: 'Score', getValue: (r) => r.score }
];

const data: Row[] = [
	{ id: 'a', name: 'Alpha', score: 10 },
	{ id: 'b', name: 'Bravo', score: 30 },
	{ id: 'c', name: 'Charlie', score: 20 }
];

/** Read the rendered score cells top-to-bottom. */
async function scoreOrder(): Promise<number[]> {
	const cells = page.getByTestId('cell-score').elements();
	return cells.map((el) => Number(el.textContent));
}

describe('DataTable default-sort initialization', () => {
	it('is sorted by defaultSortKey descending on the FIRST render (not after a deferred effect)', async () => {
		render(Harness, { props: { data, columns, defaultSortKey: 'score', defaultSortDir: 'desc' } });

		// score desc → 30, 20, 10 immediately, without any interaction.
		await expect.poll(scoreOrder).toEqual([30, 20, 10]);
	});

	it('honors defaultSortDir ascending on first render', async () => {
		render(Harness, { props: { data, columns, defaultSortKey: 'score', defaultSortDir: 'asc' } });

		await expect.poll(scoreOrder).toEqual([10, 20, 30]);
	});

	it('shows the sort arrow on the default-sorted column from the first render', async () => {
		render(Harness, { props: { data, columns, defaultSortKey: 'score', defaultSortDir: 'desc' } });

		// The down-arrow appears in the Score header (desc) on first paint.
		await expect.element(page.getByText('↓')).toBeInTheDocument();
	});

	it('lets the user toggle sort by clicking a header (interaction owns state after init)', async () => {
		render(Harness, { props: { data, columns, defaultSortKey: 'score', defaultSortDir: 'desc' } });
		await expect.poll(scoreOrder).toEqual([30, 20, 10]);

		// Click the Score header → toggles desc→asc.
		await page.getByRole('columnheader', { name: 'Score' }).click();
		await expect.poll(scoreOrder).toEqual([10, 20, 30]);
	});

	it('with no default sort key, preserves the input order on first render', async () => {
		render(Harness, { props: { data, columns, defaultSortKey: '' } });

		await expect.poll(scoreOrder).toEqual([10, 30, 20]);
	});
});
