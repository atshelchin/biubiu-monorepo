<!--
  Test-only harness for DataTable. DataTable requires a `cell` snippet, which is
  awkward to synthesize from a plain render() call, so this thin wrapper supplies a
  minimal cell snippet and forwards the props under test. Used by DataTable.svelte.spec.ts.
-->
<script lang="ts">
	import DataTable from './DataTable.svelte';
	import type { Column } from './data-table';

	interface Row {
		id: string;
		name: string;
		score: number;
	}

	interface Props {
		data: Row[];
		columns: Column<Row>[];
		defaultSortKey?: string;
		defaultSortDir?: 'asc' | 'desc';
		pageSize?: number;
	}

	let { data, columns, defaultSortKey = '', defaultSortDir = 'desc', pageSize = 10 }: Props =
		$props();

	// Identity passthrough t() so labels render their raw key/value.
	const t = (key: string) => key;
</script>

<DataTable {data} {columns} {defaultSortKey} {defaultSortDir} {pageSize} {t}>
	{#snippet cell(row, key)}
		{#if key === 'name'}
			<span data-testid="cell-name">{row.name}</span>
		{:else if key === 'score'}
			<span data-testid="cell-score">{row.score}</span>
		{/if}
	{/snippet}
</DataTable>
