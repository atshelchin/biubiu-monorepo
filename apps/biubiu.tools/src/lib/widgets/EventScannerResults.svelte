<script lang="ts">
	import { t, formatDateTime, formatRelativeTime } from '$lib/i18n';
	import { groupDigits, baseToAmount, unixToDate, shortenAddress } from '$lib/contract-caller/format.js';
	import { rpcCall } from '$lib/contract-caller/networks.js';
	import { extractEvents } from '$lib/pda-apps/event-scanner/infra/events.js';
	import type { DecodedEvent, ScanMeta } from '$lib/pda-apps/event-scanner/types.js';
	import type { Abi } from 'viem';
	import { RotateCw, X } from '@lucide/svelte';

	interface Props {
		currentScan: ScanMeta | null;
		events: DecodedEvent[];
		eventTotal: number;
		page: number;
		order: 'asc' | 'desc';
		savedScans: ScanMeta[];
		liveActive: boolean;
		onSetPage: (page: number) => void;
		onSetOrder: (order: 'asc' | 'desc') => void;
		onExportCSV: () => void;
		onExportJSON: () => void;
		onLoadScan: (scanId: string) => void;
		onResumeScan: (scanId: string) => void;
		onDeleteScan: (scanId: string) => void;
		onStopLive: () => void;
		onRunAgain: () => void;
	}

	let {
		currentScan,
		events,
		eventTotal,
		page,
		order,
		savedScans,
		liveActive,
		onSetPage,
		onSetOrder,
		onExportCSV,
		onExportJSON,
		onLoadScan,
		onResumeScan,
		onDeleteScan,
		onStopLive,
		onRunAgain,
	}: Props = $props();

	const PAGE_SIZE = 100;
	const totalPages = $derived(Math.max(1, Math.ceil(eventTotal / PAGE_SIZE)));

	// Columns are derived from the scanned event's ABI params.
	const params = $derived.by(() => {
		if (!currentScan) return [] as { name: string; type: string }[];
		try {
			const evs = extractEvents(currentScan.abi as Abi);
			const ev = evs.find((e) => e.signature === currentScan.eventSignature) ?? evs[0];
			return ev ? ev.inputs.map((i, idx) => ({ name: i.name || `arg${idx}`, type: i.type })) : [];
		} catch {
			return [];
		}
	});

	const hasDirection = $derived((currentScan?.filterSets.length ?? 0) > 1);
	const incomplete = $derived(!!currentScan && (currentScan.lastScannedBlock || 0) < currentScan.toBlock);

	// Per-column display mode for numeric columns, with smart defaults so amounts
	// and timestamps read human-friendly out of the box.
	type Mode = 'raw' | 'amount' | 'date';
	let colMode = $state<Record<string, Mode>>({});
	let colDecimals = $state<Record<string, number>>({});

	const AMOUNT_RE = /amount|value|wad|tokens?|qty|balance|supply|fee|cost|price|reserve|stake/;
	const TIME_RE = /time|timestamp|deadline|expir|start|end|when|date|until/;
	function defaultMode(name: string, type: string): Mode {
		if (!(type.startsWith('uint') || type.startsWith('int'))) return 'raw';
		const n = name.toLowerCase();
		if (AMOUNT_RE.test(n)) return 'amount';
		if (TIME_RE.test(n)) return 'date';
		return 'raw';
	}
	const modeOf = (name: string, type: string): Mode => colMode[name] ?? defaultMode(name, type);
	const decimalsOf = (name: string): number => colDecimals[name] ?? currentScan?.tokenDecimals ?? 18;

	function explorer(path: string): string | null {
		return currentScan?.explorerUrl ? `${currentScan.explorerUrl.replace(/\/$/, '')}/${path}` : null;
	}

	function renderValue(name: string, type: string, raw: string): string {
		if (raw === undefined || raw === '') return '';
		if (type === 'address') return shortenAddress(raw);
		if (type.startsWith('uint') || type.startsWith('int')) {
			const mode = modeOf(name, type);
			if (mode === 'amount') return baseToAmount(raw, decimalsOf(name));
			if (mode === 'date') return unixToDate(raw) || groupDigits(raw);
			return groupDigits(raw);
		}
		if (/^bytes/.test(type) && raw.length > 18) return `${raw.slice(0, 10)}…${raw.slice(-6)}`;
		return raw;
	}

	// ── Lazy block-timestamp lookup (the human "when") ──
	let blockTimes = $state<Record<number, number>>({});
	let fetchingTimes = false;
	async function loadTimes(blocks: number[]) {
		const rpc = currentScan?.net?.rpcs?.[0];
		if (!rpc || fetchingTimes) return;
		const uniq = [...new Set(blocks)].filter((b) => blockTimes[b] === undefined).slice(0, 150);
		if (uniq.length === 0) return;
		fetchingTimes = true;
		try {
			const next: Record<number, number> = {};
			for (let i = 0; i < uniq.length; i += 8) {
				await Promise.all(
					uniq.slice(i, i + 8).map(async (b) => {
						try {
							const blk = (await rpcCall(rpc, 'eth_getBlockByNumber', ['0x' + b.toString(16), false], 8000)) as {
								timestamp?: string;
							};
							if (blk?.timestamp) next[b] = parseInt(blk.timestamp, 16);
						} catch {
							/* leave undefined */
						}
					}),
				);
			}
			if (Object.keys(next).length) blockTimes = { ...blockTimes, ...next };
		} finally {
			fetchingTimes = false;
		}
	}
	$effect(() => {
		if (events.length) loadTimes(events.map((e) => e.blockNumber));
	});

	function copy(text: string) {
		if (typeof navigator !== 'undefined') navigator.clipboard?.writeText(text);
	}

	function fmtRange(s: ScanMeta): string {
		return `#${s.fromBlock}–${s.lastScannedBlock || s.toBlock}`;
	}
</script>

<section class="card">
	<!-- Saved scans -->
	{#if savedScans.length > 0}
		<div class="saved">
			<span class="saved-label">{t('es.results.saved')}</span>
			<div class="saved-list">
				{#each savedScans as scan (scan.scanId)}
					<div class="saved-chip" class:active={scan.scanId === currentScan?.scanId}>
						<button class="saved-main" onclick={() => onLoadScan(scan.scanId)} title={scan.contract}>
							<span class="saved-name">{scan.name}</span>
							<span class="saved-meta">#{scan.chainId} · {scan.eventName} · {scan.eventCount}</span>
						</button>
						<button class="saved-act" onclick={() => onResumeScan(scan.scanId)} aria-label={t('es.results.resume')} title={t('es.results.resume')}><RotateCw size={14} /></button>
						<button class="saved-del" onclick={() => onDeleteScan(scan.scanId)} aria-label={t('es.results.delete')}><X size={15} /></button>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if currentScan}
		<div class="head">
			<div class="title-row">
				<h2 class="title">{currentScan.name}</h2>
				{#if liveActive}
					<span class="live-badge">
						<span class="live-dot"></span>{t('es.results.live')}
						<button class="live-stop" onclick={onStopLive}>{t('es.results.stopLive')}</button>
					</span>
				{/if}
			</div>
			<div class="stats">
				<span class="stat"><b>{groupDigits(String(eventTotal))}</b> {t('es.results.events')}</span>
				<span class="stat">{fmtRange(currentScan)}</span>
				<span class="stat mono">{shortenAddress(currentScan.contract)}</span>
			</div>
		</div>

		<!-- Controls -->
		<div class="controls">
			<button class="btn-sm" onclick={() => onSetOrder(order === 'desc' ? 'asc' : 'desc')}>
				{order === 'desc' ? t('es.results.newest') : t('es.results.oldest')}
			</button>
			{#if incomplete}
				<button class="btn-sm btn-accent" onclick={() => currentScan && onResumeScan(currentScan.scanId)}><RotateCw size={14} /> {t('es.results.resume')}</button>
			{/if}
			<div class="spacer"></div>
			<button class="btn-sm" onclick={onExportCSV} disabled={eventTotal === 0}>{t('es.results.exportCsv')}</button>
			<button class="btn-sm" onclick={onExportJSON} disabled={eventTotal === 0}>{t('es.results.exportJson')}</button>
			<button class="btn-sm btn-primary" onclick={onRunAgain}>{t('es.results.newScan')}</button>
		</div>

		{#if eventTotal === 0}
			<p class="empty">{t('es.results.empty')}</p>
		{:else}
			<div class="table-wrap">
				<table class="tbl">
					<thead>
						<tr>
							<th>{t('es.results.block')}</th>
							<th>{t('es.results.time')}</th>
							{#if hasDirection}<th>{t('es.results.direction')}</th>{/if}
							{#each params as p (p.name)}
								<th>
									<div class="th-cell">
										<span>{p.name}<span class="th-type">{p.type}</span></span>
										{#if p.type.startsWith('uint') || p.type.startsWith('int')}
											<select
												class="th-mode"
												value={modeOf(p.name, p.type)}
												onchange={(e) => (colMode = { ...colMode, [p.name]: (e.target as HTMLSelectElement).value as Mode })}
											>
												<option value="raw">raw</option>
												<option value="amount">amount</option>
												<option value="date">date</option>
											</select>
											{#if modeOf(p.name, p.type) === 'amount'}
												<input
													class="th-dec"
													type="number"
													min="0"
													max="36"
													value={decimalsOf(p.name)}
													oninput={(e) => (colDecimals = { ...colDecimals, [p.name]: Number((e.target as HTMLInputElement).value) })}
												/>
											{/if}
										{/if}
									</div>
								</th>
							{/each}
							<th>{t('es.results.tx')}</th>
						</tr>
					</thead>
					<tbody>
						{#each events as ev (ev.pk)}
							<tr>
								<td class="mono">{ev.blockNumber}</td>
								<td class="time">
									{#if blockTimes[ev.blockNumber]}
										<span title={formatDateTime(new Date(blockTimes[ev.blockNumber] * 1000))}>{formatRelativeTime(blockTimes[ev.blockNumber] * 1000)}</span>
									{:else}
										<span class="faint">…</span>
									{/if}
								</td>
								{#if hasDirection}
									<td>
										<span class="dir dir-{ev.filterSetId}">{ev.filterSetId === 'in' ? t('es.results.in') : ev.filterSetId === 'out' ? t('es.results.out') : ev.filterSetId}</span>
									</td>
								{/if}
								{#each params as p (p.name)}
									{@const val = ev.args[p.name] ?? ev.args[`arg${params.indexOf(p)}`] ?? ''}
									<td class="mono">
										{#if p.type === 'address' && val}
											{#if explorer(`address/${val}`)}
												<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
												<a class="lnk" href={explorer(`address/${val}`)} target="_blank" rel="noopener" title={val}>{shortenAddress(val)}</a>
											{:else}
												<button class="copyable" onclick={() => copy(val)} title={val}>{shortenAddress(val)}</button>
											{/if}
										{:else}
											<span title={val}>{renderValue(p.name, p.type, val)}</span>
										{/if}
									</td>
								{/each}
								<td>
									{#if explorer(`tx/${ev.txHash}`)}
										<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
										<a class="lnk" href={explorer(`tx/${ev.txHash}`)} target="_blank" rel="noopener">{shortenAddress(ev.txHash)}</a>
									{:else}
										<button class="copyable" onclick={() => copy(ev.txHash)}>{shortenAddress(ev.txHash)}</button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if totalPages > 1}
				<div class="pager">
					<button class="btn-sm" disabled={page <= 0} onclick={() => onSetPage(page - 1)}>‹</button>
					<span class="page-info">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, eventTotal)} / {groupDigits(String(eventTotal))}</span>
					<button class="btn-sm" disabled={page >= totalPages - 1} onclick={() => onSetPage(page + 1)}>›</button>
				</div>
			{/if}
		{/if}
	{/if}
</section>

<style>
	.card {
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		padding: var(--space-6);
		box-shadow: var(--shadow-sm);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	.saved {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.saved-label,
	.title {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-muted);
		margin: 0;
	}
	.saved-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.saved-chip {
		display: flex;
		align-items: stretch;
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--bg-sunken);
	}
	.saved-chip.active {
		border-color: var(--accent);
	}
	.saved-main {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
		padding: var(--space-2) var(--space-3);
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
	}
	.saved-name {
		font-size: var(--text-sm);
		color: var(--fg-base);
	}
	.saved-meta {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.saved-del {
		display: inline-flex;
		align-items: center;
		padding: 0 var(--space-2);
		background: transparent;
		border: none;
		border-left: 1px solid var(--border-subtle);
		color: var(--fg-subtle);
		cursor: pointer;
		font-size: var(--text-lg);
	}
	.saved-del:hover {
		color: var(--error);
	}
	.saved-act {
		display: inline-flex;
		align-items: center;
		padding: 0 var(--space-2);
		background: transparent;
		border: none;
		border-left: 1px solid var(--border-subtle);
		color: var(--fg-subtle);
		cursor: pointer;
		font-size: var(--text-sm);
	}
	.saved-act:hover {
		color: var(--accent);
	}
	.btn-accent {
		background: var(--accent-subtle);
		border-color: var(--accent);
		color: var(--accent);
	}
	.time {
		color: var(--fg-muted);
		font-size: var(--text-xs);
		white-space: nowrap;
	}
	.faint {
		color: var(--fg-faint);
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.title-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.title {
		color: var(--fg-base);
		font-size: var(--text-lg);
	}
	.live-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xs);
		color: var(--success);
		background: var(--success-muted, rgba(52, 211, 153, 0.12));
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
	}
	.live-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--success);
	}
	.live-stop {
		background: transparent;
		border: none;
		color: var(--fg-muted);
		cursor: pointer;
		text-decoration: underline;
		font-size: var(--text-xs);
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.stat b {
		color: var(--fg-base);
	}
	.controls {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.spacer {
		flex: 1;
	}
	.btn-sm {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		color: var(--fg-base);
		font-size: var(--text-sm);
		cursor: pointer;
	}
	.btn-sm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn-primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-fg);
	}
	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}
	.tbl {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}
	.tbl th,
	.tbl td {
		padding: var(--space-2) var(--space-3);
		text-align: left;
		border-bottom: 1px solid var(--border-subtle);
		white-space: nowrap;
	}
	.tbl th {
		background: var(--bg-sunken);
		color: var(--fg-muted);
		font-weight: var(--weight-medium);
		position: sticky;
		top: 0;
	}
	.th-cell {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.th-type {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-faint);
		margin-left: var(--space-1);
	}
	.th-mode,
	.th-dec {
		padding: 1px var(--space-1);
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
	.th-dec {
		width: 48px;
	}
	.mono {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-base);
	}
	.lnk {
		color: var(--accent);
		text-decoration: none;
	}
	.lnk:hover {
		text-decoration: underline;
	}
	.copyable {
		background: transparent;
		border: none;
		color: var(--fg-base);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		cursor: pointer;
		padding: 0;
	}
	.dir {
		font-size: var(--text-xs);
		padding: 1px var(--space-2);
		border-radius: var(--radius-full);
	}
	.dir-in {
		color: var(--success);
		background: var(--success-muted, rgba(52, 211, 153, 0.12));
	}
	.dir-out {
		color: var(--warning);
		background: var(--warning-muted, rgba(251, 191, 36, 0.12));
	}
	.pager {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
	}
	.page-info {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.empty {
		color: var(--fg-subtle);
		font-size: var(--text-sm);
		text-align: center;
		padding: var(--space-8) 0;
	}
</style>
