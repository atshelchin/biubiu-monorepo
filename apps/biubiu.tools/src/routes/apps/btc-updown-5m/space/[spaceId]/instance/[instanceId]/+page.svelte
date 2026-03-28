<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { t, formatCurrency } from '$lib/i18n';
	import { routes } from '$lib/updown-v2/routes';
	import { profitClass, statusDot, fmt, fmtShort, fmtPct } from '$lib/updown-v2/utils';
	import { createFormatterCtx } from '$lib/updown-v2/formatter-bridge';
	import { spaces, instances, setInstanceStatus, deleteInstance } from '$lib/updown-v2/store.svelte';
	import { mockStats, mockHourlyStats, mockDailyStats, mockRounds, todayStr } from '$lib/updown-v2/mock-detail';
	import DatePicker from '$lib/ui/DatePicker.svelte';
	import StatsGrid from '$lib/updown-shared/components/StatsGrid.svelte';
	import HourlyChart from '$lib/updown-shared/components/HourlyChart.svelte';
	import WeekdayChart from '$lib/updown-shared/components/WeekdayChart.svelte';
	import RoundsHistory from '$lib/updown-shared/components/RoundsHistory.svelte';
	import type { RoundStatusFilter, ResultFilter } from '$lib/updown-shared/types';
	import { signControlAction } from '$lib/updown-shared/sign-control';
	import { controlStrategy } from '$lib/updown-shared/api';

	// ── Route params ──
	const spaceId = $derived(page.params.spaceId ?? '');
	const instanceId = $derived(page.params.instanceId ?? '');

	// ── Shared helpers ──
	const sharedT = t as unknown as import('$lib/updown-shared/types').TranslateFn;
	const ctx = $derived(createFormatterCtx());

	// ── Data ──
	const space = $derived(spaces.list.find(s => s.id === spaceId));
	const spaceInstances = $derived(instances.list.filter(i => i.spaceId === spaceId));
	const activeInst = $derived(instances.list.find(i => i.id === instanceId) ?? spaceInstances[0]);

	// ── Sidebar sort ──
	type SidebarSortKey = 'profit' | '1h' | 'today' | '30d';
	let sidebarSort = $state<SidebarSortKey>('profit');
	let sidebarSortDir = $state<'asc' | 'desc'>('desc');

	function toggleSidebarSort(key: SidebarSortKey) {
		if (sidebarSort === key) {
			sidebarSortDir = sidebarSortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sidebarSort = key;
			sidebarSortDir = 'desc';
		}
	}

	const sortedSpaceInstances = $derived.by(() => {
		return [...spaceInstances].sort((a, b) => {
			const key = sidebarSort;
			if (key === '1h') return sidebarSortDir === 'desc' ? b.profits.hour - a.profits.hour : a.profits.hour - b.profits.hour;
			if (key === 'today') return sidebarSortDir === 'desc' ? b.profits.day - a.profits.day : a.profits.day - b.profits.day;
			if (key === '30d') return sidebarSortDir === 'desc' ? b.profits.thirtyDay - a.profits.thirtyDay : a.profits.thirtyDay - b.profits.thirtyDay;
			return sidebarSortDir === 'desc' ? b.stats.profit - a.stats.profit : a.stats.profit - b.stats.profit;
		});
	});

	// ── Control actions ──
	let confirmingDelete = $state(false);
	let startingTimer = $state<ReturnType<typeof setTimeout> | null>(null);

	function handleStart() {
		if (!activeInst) return;
		setInstanceStatus(activeInst.id, 'starting');
		activeInst.startedAt = new Date().toISOString();
		const timer = setTimeout(() => {
			setInstanceStatus(activeInst.id, 'running');
			startingTimer = null;
		}, 1000);
		startingTimer = timer;
	}

	function handleStop() {
		if (!activeInst) return;
		if (startingTimer) { clearTimeout(startingTimer); startingTimer = null; }
		setInstanceStatus(activeInst.id, 'stopped');
		activeInst.startedAt = undefined;
	}

	let controlBusy = $state(false);

	async function handlePause() {
		if (!activeInst || controlBusy) return;
		controlBusy = true;
		try {
			const signed = await signControlAction('pause', activeInst.strategyId);
			if (!signed) return;
			const endpointUrl = space?.endpointUrl;
			if (!endpointUrl) { setInstanceStatus(activeInst.id, 'paused'); return; }
			const result = await controlStrategy(
				{ baseUrl: `${endpointUrl}/api/${activeInst.strategyId}`, fetchFn: fetch },
				{ action: 'pause', ...signed }
			);
			if (result.ok) setInstanceStatus(activeInst.id, 'paused');
		} finally { controlBusy = false; }
	}

	async function handleResume() {
		if (!activeInst || controlBusy) return;
		controlBusy = true;
		try {
			const signed = await signControlAction('resume', activeInst.strategyId);
			if (!signed) return;
			const endpointUrl = space?.endpointUrl;
			if (!endpointUrl) { setInstanceStatus(activeInst.id, 'running'); return; }
			const result = await controlStrategy(
				{ baseUrl: `${endpointUrl}/api/${activeInst.strategyId}`, fetchFn: fetch },
				{ action: 'resume', ...signed }
			);
			if (result.ok) setInstanceStatus(activeInst.id, 'running');
		} finally { controlBusy = false; }
	}

	function handleDelete() {
		if (!activeInst) return;
		deleteInstance(activeInst.id);
		goto(routes.space(spaceId));
	}

	// ── Uptime display ──
	let now = $state(Date.now());
	$effect(() => {
		const interval = setInterval(() => { now = Date.now(); }, 60_000);
		return () => clearInterval(interval);
	});

	const uptimeText = $derived.by(() => {
		if (!activeInst) return '';
		const status = activeInst.status;
		if (status === 'stopped' || status === 'error') return status;
		if (status === 'starting') return 'starting...';
		// For running/paused, compute uptime from startedAt or createdAt
		const ref = activeInst.startedAt ?? activeInst.createdAt;
		const diffMs = now - new Date(ref).getTime();
		if (diffMs < 0) return '0m';
		const totalMin = Math.floor(diffMs / 60_000);
		const h = Math.floor(totalMin / 60);
		const m = totalMin % 60;
		if (h > 0) return `${h}h ${m}m`;
		return `${m}m`;
	});

	// ── Detail state ──
	let detailDateRange = $state<{ from: string; to: string }>({ from: todayStr(), to: todayStr() });
	let selectedHour = $state<number | null>(null);
	let roundsPage = $state(0);
	let roundsFilter = $state<RoundStatusFilter>('');
	let resultFilter = $state<ResultFilter>('');

	const isMultiDay = $derived(detailDateRange.from !== detailDateRange.to);

	// ── Mock data ──
	const instStats = $derived(activeInst ? mockStats(activeInst.id, detailDateRange) : null);
	const instHourly = $derived(activeInst ? (
		isMultiDay
			? mockHourlyStats(activeInst.id, detailDateRange.from + ':' + detailDateRange.to)
			: mockHourlyStats(activeInst.id, detailDateRange.from)
	) : []);
	const instDaily = $derived(activeInst && isMultiDay ? mockDailyStats(activeInst.id, detailDateRange.from, detailDateRange.to) : []);
	const instRounds = $derived(activeInst ? mockRounds(activeInst.id, roundsPage, 20) : { rows: [], total: 0 });

	// Direction split
	const instDirStats = $derived.by(() => {
		if (!instStats) return null;
		const total = instStats.signalBet + instStats.signalReverse;
		const betUp = Math.ceil(total * 0.55);
		const betDown = total - betUp;
		const upWins = Math.ceil(betUp * (instStats.winRate + 0.05));
		const downWins = Math.ceil(betDown * instStats.winRate);
		return {
			betUp, betDown, upWins, downWins,
			upWr: betUp > 0 ? upWins / betUp : 0,
			downWr: betDown > 0 ? downWins / betDown : 0,
		};
	});
	const instNetHedgeCost = $derived(instStats ? instStats.totalHedgeCost - instStats.hedgeSellRevenue : 0);

	// ── Draggable resize ──
	const MIN_WIDTH = 60;
	const DEFAULT_WIDTH = 260;
	const COLLAPSE_THRESHOLD = 100;
	let sidebarWidth = $state(DEFAULT_WIDTH);
	let isDragging = $state(false);
	let isCollapsed = $derived(sidebarWidth < COLLAPSE_THRESHOLD);

	function onPointerDown(e: PointerEvent) {
		isDragging = true;
		const target = e.currentTarget as HTMLElement;
		target.setPointerCapture(e.pointerId);
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
	}

	function onPointerMove(e: PointerEvent) {
		if (!isDragging) return;
		const layout = (e.currentTarget as HTMLElement).closest('.inst-detail-layout') as HTMLElement;
		if (!layout) return;
		const rect = layout.getBoundingClientRect();
		const x = e.clientX - rect.left;
		sidebarWidth = Math.max(0, Math.min(x, 500));
	}

	function onPointerUp() {
		isDragging = false;
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
		// Snap: collapse if below threshold, restore if near zero
		if (sidebarWidth < COLLAPSE_THRESHOLD && sidebarWidth > 0) {
			sidebarWidth = 0;
		} else if (sidebarWidth >= COLLAPSE_THRESHOLD && sidebarWidth < MIN_WIDTH + 20) {
			sidebarWidth = DEFAULT_WIDTH;
		}
	}

	function toggleCollapse() {
		sidebarWidth = isCollapsed ? DEFAULT_WIDTH : 0;
	}
</script>

<section class="page-header" style="margin-bottom: var(--space-3);">
	<a class="back-link" href={routes.space(spaceId)}>&larr; Back</a>
	<div class="title-row">
		<h1 class="page-title">{space?.name ?? 'Space'}</h1>
	</div>
</section>

<div class="inst-detail-layout">
	<!-- Sidebar -->
	<aside class="inst-sidebar" style="width: {sidebarWidth}px; {isCollapsed ? 'overflow: hidden;' : ''}">
		{#if !isCollapsed}
			<div class="inst-sidebar-head">
				<span class="inst-sidebar-label">{t('updown5m.space.myInstances')} {spaceInstances.length}</span>
				<button class="btn-accent btn-sm" onclick={() => goto(routes.hub())}>+ New</button>
			</div>
			<div class="inst-sidebar-cols">
				<button class="inst-col-btn" class:active={sidebarSort === 'profit'} onclick={() => toggleSidebarSort('profit')}>{t('updown5m.table.strategy')}{#if sidebarSort === 'profit'}<span class="col-arrow">{sidebarSortDir === 'asc' ? '\u2191' : '\u2193'}</span>{/if}</button>
				<button class="inst-col-btn" class:active={sidebarSort === '1h'} onclick={() => toggleSidebarSort('1h')}>1H{#if sidebarSort === '1h'}<span class="col-arrow">{sidebarSortDir === 'asc' ? '\u2191' : '\u2193'}</span>{/if}</button>
				<button class="inst-col-btn" class:active={sidebarSort === 'today'} onclick={() => toggleSidebarSort('today')}>{t('updown5m.table.today')}{#if sidebarSort === 'today'}<span class="col-arrow">{sidebarSortDir === 'asc' ? '\u2191' : '\u2193'}</span>{/if}</button>
				<button class="inst-col-btn" class:active={sidebarSort === '30d'} onclick={() => toggleSidebarSort('30d')}>30D{#if sidebarSort === '30d'}<span class="col-arrow">{sidebarSortDir === 'asc' ? '\u2191' : '\u2193'}</span>{/if}</button>
			</div>
			{#each sortedSpaceInstances as inst (inst.id)}
				<button
					class="inst-sidebar-item"
					class:active={inst.id === activeInst?.id}
					onclick={() => goto(routes.instance(spaceId, inst.id), { replaceState: true })}
				>
					<div class="inst-si-row">
						<div class="inst-si-left">
							<span class="inst-si-name"><span class="dot {statusDot(inst.status)}"></span> {inst.label} <span class="mode-dot" class:mode-dot-live={inst.mode === 'live'}></span></span>
						</div>
						<div class="inst-si-cells">
							<span class={profitClass(inst.profits.hour)}>{fmtShort(inst.profits.hour)}</span>
							<span class={profitClass(inst.profits.day)}>{fmtShort(inst.profits.day)}</span>
							<span class={profitClass(inst.profits.thirtyDay)}>{fmtShort(inst.profits.thirtyDay)}</span>
						</div>
					</div>
				</button>
			{/each}
		{/if}
	</aside>

	<!-- Resize handle with toggle button -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="resize-handle"
		class:dragging={isDragging}
		style="touch-action: none;"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
	>
		<button
			class="resize-toggle"
			class:collapsed={isCollapsed}
			onclick={(e) => { e.stopPropagation(); toggleCollapse(); }}
			aria-label={isCollapsed ? 'Show sidebar' : 'Hide sidebar'}
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				{#if isCollapsed}
					<polyline points="9 18 15 12 9 6"/>
				{:else}
					<polyline points="15 18 9 12 15 6"/>
				{/if}
			</svg>
		</button>
	</div>

	<!-- Main -->
	{#if activeInst && instStats}
		<div class="inst-main">
			<div class="inst-toolbar">
				<span class="inst-toolbar-name">{activeInst.label}</span>
				<span class="mode-badge" class:mode-live={activeInst.mode === 'live'}>{activeInst.mode === 'live' ? 'LIVE' : 'SANDBOX'}</span>
				<div class="inst-toolbar-actions">
					{#if activeInst.status === 'running'}
						<button class="ctrl-icon ctrl-icon-active" onclick={handlePause} aria-label="Pause">&#9646;&#9646;</button>
						<button class="ctrl-icon" onclick={handleStop} aria-label="Stop">&#9632;</button>
					{:else if activeInst.status === 'paused'}
						<button class="ctrl-icon" onclick={handleResume} aria-label="Resume">&#9654;</button>
						<button class="ctrl-icon" onclick={handleStop} aria-label="Stop">&#9632;</button>
					{:else if activeInst.status === 'starting'}
						<button class="ctrl-icon ctrl-icon-active" disabled aria-label="Starting">&#9654;</button>
						<button class="ctrl-icon" onclick={handleStop} aria-label="Stop">&#9632;</button>
					{:else}
						<button class="ctrl-icon" onclick={handleStart} aria-label="Start">&#9654;</button>
						{#if activeInst.status === 'stopped'}
							{#if confirmingDelete}
								<span class="delete-confirm">
									<span class="delete-confirm-text">Delete?</span>
									<button class="ctrl-icon ctrl-icon-danger" onclick={handleDelete} aria-label="Confirm delete">&#10003;</button>
									<button class="ctrl-icon" onclick={() => (confirmingDelete = false)} aria-label="Cancel delete">&#10005;</button>
								</span>
							{:else}
								<button class="ctrl-icon ctrl-icon-dim" onclick={() => (confirmingDelete = true)} aria-label="Delete">&#128465;</button>
							{/if}
						{/if}
					{/if}
				</div>
				<span class="inst-toolbar-status"><span class="dot {statusDot(activeInst.status)}"></span> {uptimeText}</span>
			</div>

			<div class="inst-scroll">
				<DatePicker
					mode="range"
					bind:value={detailDateRange}
					presets={['today', '7d', '30d', '90d']}
					navigation
					onchange={() => { selectedHour = null; }}
				/>

				<StatsGrid stats={instStats} {selectedHour} {ctx} t={sharedT} onClearHour={() => (selectedHour = null)} />

				<HourlyChart
					hourlyData={instHourly}
					filterDateFrom={detailDateRange.from}
					{selectedHour}
					{ctx}
					t={sharedT}
					titleKey={isMultiDay ? 'btcUpdown.chart.hourlyProfitAgg' : undefined}
					onSelectHour={(h) => (selectedHour = h)}
				/>
				{#if isMultiDay && instDaily.length > 0}
					<WeekdayChart dailyData={instDaily} {ctx} t={sharedT} />
				{/if}

				<!-- Analytics -->
				{#if instStats}
					<div class="analytics-row">
						<div class="analytics-card glass-card">
							<h3 class="analytics-label">Direction Split</h3>
							{#if instDirStats}
								<div class="dir-split">
									<div class="dir-col">
										<span class="dir-heading">UP</span>
										<span class="dir-wr {instDirStats.upWr >= 0.5 ? 'positive' : 'negative'}">{fmtPct(instDirStats.upWr)}</span>
										<span class="dir-detail">{instDirStats.upWins}W / {instDirStats.betUp - instDirStats.upWins}L</span>
									</div>
									<div class="dir-divider"></div>
									<div class="dir-col">
										<span class="dir-heading">DOWN</span>
										<span class="dir-wr {instDirStats.downWr >= 0.5 ? 'positive' : 'negative'}">{fmtPct(instDirStats.downWr)}</span>
										<span class="dir-detail">{instDirStats.downWins}W / {instDirStats.betDown - instDirStats.downWins}L</span>
									</div>
								</div>
							{/if}
						</div>
						<div class="analytics-card glass-card">
							<h3 class="analytics-label">Streaks</h3>
							<div class="streaks-list">
								<div class="streak-row"><span class="streak-label">Max Win</span><div class="streak-bar-wrap"><div class="streak-bar streak-bar-win" style="width: {Math.min((instStats.maxWinStreak / Math.max(instStats.maxWinStreak, instStats.maxLoseStreak)) * 100, 100)}%"></div></div><span class="streak-val positive">{instStats.maxWinStreak}</span></div>
								<div class="streak-row"><span class="streak-label">Max Loss</span><div class="streak-bar-wrap"><div class="streak-bar streak-bar-loss" style="width: {Math.min((instStats.maxLoseStreak / Math.max(instStats.maxWinStreak, instStats.maxLoseStreak)) * 100, 100)}%"></div></div><span class="streak-val negative">{instStats.maxLoseStreak}</span></div>
								<div class="streak-row"><span class="streak-label">Current</span><div class="streak-bar-wrap"><div class="streak-bar {instStats.currentStreak >= 0 ? 'streak-bar-win' : 'streak-bar-loss'}" style="width: {Math.min((Math.abs(instStats.currentStreak) / Math.max(instStats.maxWinStreak, instStats.maxLoseStreak)) * 100, 100)}%"></div></div><span class="streak-val {instStats.currentStreak >= 0 ? 'positive' : 'negative'}">{instStats.currentStreak >= 0 ? 'W' : 'L'}{Math.abs(instStats.currentStreak)}</span></div>
							</div>
						</div>
						<div class="analytics-card glass-card">
							<h3 class="analytics-label">Hedge</h3>
							<div class="hedge-grid">
								<div class="hedge-item"><span class="hedge-item-label">COST</span><span class="hedge-item-value negative">{fmt(instStats.totalHedgeCost)}</span><span class="hedge-item-sub">{fmt(instStats.entered > 0 ? instStats.totalHedgeCost / instStats.entered : 0)}/round</span></div>
								<div class="hedge-item"><span class="hedge-item-label">RECOVERY</span><span class="hedge-item-value positive">{fmt(instStats.hedgeSellRevenue)}</span><span class="hedge-item-sub">{instStats.entered > 0 ? fmtPct(instStats.hedgeSellRevenue / instStats.totalHedgeCost) : '0%'}</span></div>
							</div>
							<p class="hedge-summary">Net cost: <span class="negative">{fmt(-instNetHedgeCost)}</span></p>
						</div>
					</div>
				{/if}

				<RoundsHistory
					rounds={instRounds.rows}
					roundsTotal={instRounds.total}
					{roundsPage}
					roundsPageSize={20}
					refreshing={false}
					{roundsFilter}
					{resultFilter}
					stats={instStats}
					{ctx}
					t={sharedT}
					formatCurrency={formatCurrency}
					onPageChange={(p) => (roundsPage = p)}
					onFilterChange={(f) => { roundsFilter = f; roundsPage = 0; }}
					onResultFilterChange={(f) => { resultFilter = f; roundsPage = 0; }}
					onRefresh={() => {}}
				/>
			</div>
		</div>
	{/if}
</div>

<style>
	.resize-toggle {
		position: absolute;
		top: 480px;
		left: 50%;
		transform: translateX(-50%);
		width: 18px;
		height: 32px;
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		background: var(--bg-raised);
		color: var(--fg-subtle);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		z-index: 7;
		transition: color var(--motion-fast), background var(--motion-fast), border-color var(--motion-fast);
		padding: 0;
	}
	.resize-toggle:hover {
		background: var(--bg-elevated, var(--bg-raised));
		color: var(--fg-base);
		border-color: var(--border-strong, var(--border-base));
	}
	.resize-toggle:active {
		transform: translateX(-50%) scale(0.9);
	}

	/* Delete confirmation inline */
	.delete-confirm {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	.delete-confirm-text {
		font-size: var(--text-xs);
		color: var(--error);
		font-weight: var(--weight-medium);
	}
	.ctrl-icon-danger {
		color: var(--error);
	}
	.ctrl-icon-danger:hover {
		color: var(--fg-inverse);
		background: var(--error);
	}
	.ctrl-icon-dim {
		opacity: 0.4;
	}
	.ctrl-icon-dim:hover {
		opacity: 0.8;
	}
	.ctrl-icon:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		animation: blink 1s ease-in-out infinite;
	}
	@keyframes blink {
		0%, 100% { opacity: 0.5; }
		50% { opacity: 1; }
	}
</style>
