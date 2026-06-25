<script lang="ts">
	import { formatUnits } from 'viem';
	import { ExternalLink, Copy, Check, LoaderCircle } from '@lucide/svelte';
	import { t } from '$lib/i18n';
	import { revoke as s } from '../store.svelte.js';
	import type { ApprovalRow } from '../types.js';

	function shortAddr(a: string): string {
		return `${a.slice(0, 6)}…${a.slice(-4)}`;
	}

	function standardLabel(row: ApprovalRow): string {
		if (row.id.startsWith('permit2:')) return 'Permit2';
		if (row.standard === 'erc20') return 'ERC-20';
		if (row.standard === 'erc721') return 'ERC-721';
		return 'ERC-1155';
	}

	function amountLabel(row: ApprovalRow): string {
		if (row.approvedForAll) return t('revoke.table.allItems');
		if (row.unlimited) return t('revoke.table.unlimited');
		if (row.allowance == null) return '—';
		const dec = row.decimals ?? 18;
		const n = Number(formatUnits(row.allowance, dec));
		if (!Number.isFinite(n)) return row.allowance.toString();
		return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
	}

	let copied = $state<string | null>(null);
	async function copy(addr: string) {
		try {
			await navigator.clipboard.writeText(addr);
			copied = addr;
			setTimeout(() => (copied === addr ? (copied = null) : null), 1200);
		} catch {
			// clipboard may be unavailable
		}
	}

	function explorerAddr(addr: string): string {
		return `${s.network.explorerUrl}/address/${addr}`;
	}

	const allSelected = $derived(
		s.visibleRows.length > 0 && s.visibleRows.every((r) => s.isSelected(r.id)),
	);
	function toggleAll() {
		if (allSelected) s.clearSelection();
		else s.selectAllVisible();
	}
</script>

<div class="table" role="table">
	<!-- Header -->
	<div class="thead" role="row">
		<label class="cb">
			<input type="checkbox" checked={allSelected} onchange={toggleAll} aria-label={t('revoke.table.selectAll')} />
		</label>
		<span class="th asset">{t('revoke.table.asset')}</span>
		<span class="th spender">{t('revoke.table.spender')}</span>
		<span class="th amount">{t('revoke.table.amount')}</span>
		<span class="th action"></span>
	</div>

	{#each s.visibleRows as row (row.id)}
		{@const pending = s.pendingIds.includes(row.id)}
		<div class="tr" role="row" class:selected={s.isSelected(row.id)}>
			<label class="cb">
				<input
					type="checkbox"
					checked={s.isSelected(row.id)}
					onchange={() => s.toggle(row.id)}
					disabled={s.revoking}
					aria-label={`${t('revoke.table.select')} ${row.tokenSymbol}`}
				/>
			</label>

			<!-- Asset -->
			<div class="td asset">
				<span class="sym">{row.tokenSymbol}</span>
				<span class="std">{standardLabel(row)}</span>
				{#if row.tokenName}<span class="tname">{row.tokenName}</span>{/if}
			</div>

			<!-- Spender -->
			<div class="td spender">
				{#if row.spenderLabel}
					<span class="sp-label">{row.spenderLabel}</span>
				{:else}
					<span class="sp-unknown">{t('revoke.table.unknownSpender')}</span>
				{/if}
				<span class="sp-addr">
					<code>{shortAddr(row.spender)}</code>
					<button class="icon-btn" title={t('revoke.table.copy')} onclick={() => copy(row.spender)}>
						{#if copied === row.spender}<Check size={13} />{:else}<Copy size={13} />{/if}
					</button>
					<a class="icon-btn" href={explorerAddr(row.spender)} target="_blank" rel="noopener" title={t('revoke.table.viewExplorer')}>
						<ExternalLink size={13} />
					</a>
				</span>
			</div>

			<!-- Amount at risk -->
			<div class="td amount">
				<span class="amt" class:danger={row.unlimited}>{amountLabel(row)}</span>
			</div>

			<!-- Action -->
			<div class="td action">
				<button class="revoke-btn" onclick={() => s.revokeOne(row)} disabled={s.revoking || !s.sendSupported}>
					{#if pending}
						<LoaderCircle size={14} class="spin" /> {t('revoke.table.revoking')}
					{:else}
						{t('revoke.table.revoke')}
					{/if}
				</button>
			</div>
		</div>
	{/each}
</div>

<style>
	/* Flush inside the results card — no card-in-card framing. */
	.table {
		display: flex;
		flex-direction: column;
	}
	.thead,
	.tr {
		display: grid;
		grid-template-columns: 36px minmax(120px, 1.2fr) minmax(160px, 1.6fr) minmax(90px, 0.9fr) auto;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-2);
	}
	.thead {
		border-bottom: 1px solid var(--border-base);
	}
	.th {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.th.amount {
		text-align: right;
	}
	.tr {
		border-bottom: 1px solid var(--border-subtle);
		transition: background var(--motion-fast) var(--easing);
	}
	.tr:last-child {
		border-bottom: none;
	}
	.tr:hover {
		background: var(--bg-sunken);
	}
	.tr.selected {
		background: var(--accent-subtle);
	}
	.cb {
		display: grid;
		place-items: center;
	}
	.cb input {
		width: 16px;
		height: 16px;
		accent-color: var(--accent);
		cursor: pointer;
	}
	.cb input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.td.asset {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.sym {
		font-weight: 700;
		color: var(--fg-base);
		font-size: var(--text-sm);
	}
	.std {
		font-size: 10px;
		font-weight: 600;
		color: var(--fg-subtle);
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-full);
		padding: 1px var(--space-2);
		width: fit-content;
		letter-spacing: 0.02em;
	}
	.tname {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.td.spender {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.sp-label {
		font-size: var(--text-sm);
		color: var(--fg-base);
		font-weight: 500;
	}
	.sp-unknown {
		font-size: var(--text-sm);
		color: var(--warning);
		font-weight: 500;
	}
	.sp-addr {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	.sp-addr code {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.icon-btn {
		display: inline-grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border: none;
		background: transparent;
		color: var(--fg-faint);
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: color var(--motion-fast) var(--easing), background var(--motion-fast) var(--easing);
	}
	.icon-btn:hover {
		color: var(--accent);
		background: var(--bg-elevated);
	}
	.icon-btn:focus-visible,
	.revoke-btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.td.amount {
		text-align: right;
	}
	.amt {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--fg-base);
	}
	.amt.danger {
		color: var(--error);
		font-weight: 700;
	}

	.td.action {
		display: flex;
		justify-content: flex-end;
	}
	.revoke-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		background: var(--bg-elevated);
		color: var(--fg-base);
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		transition: all var(--motion-fast) var(--easing);
	}
	.revoke-btn:hover:not(:disabled) {
		border-color: var(--error);
		color: var(--error);
		transform: translateY(-1px);
	}
	.revoke-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	:global(.revoke-btn .spin) {
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Mobile: collapse the grid into stacked cards. */
	@media (max-width: 680px) {
		.thead {
			display: none;
		}
		.tr {
			grid-template-columns: 24px 1fr auto;
			grid-template-areas:
				'cb asset action'
				'cb spender spender'
				'cb amount amount';
			row-gap: var(--space-2);
		}
		.cb {
			grid-area: cb;
			align-self: start;
			margin-top: 2px;
		}
		.td.asset {
			grid-area: asset;
		}
		.td.spender {
			grid-area: spender;
		}
		.td.amount {
			grid-area: amount;
			text-align: left;
		}
		.td.action {
			grid-area: action;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.tr,
		.icon-btn,
		.revoke-btn {
			transition: none;
		}
		:global(.revoke-btn .spin) {
			animation: none;
		}
	}
</style>
