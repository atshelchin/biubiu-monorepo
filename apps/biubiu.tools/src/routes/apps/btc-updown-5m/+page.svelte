<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import { authStore } from '$lib/auth';
	import { routes } from '$lib/updown-v2/routes';
	import { profitClass, fmt, fmtShort, fmtPct, statusDot, sparklineHtml } from '$lib/updown-v2/utils';
	import { instances, leaderboard, activity, hubTab, modeFilter, spaces, showAuth, showAddSpace } from '$lib/updown-v2/store.svelte';
	import DataTable from '$lib/updown-v2/components/DataTable.svelte';
	import type { Column, FilterOption } from '$lib/updown-v2/components/data-table';
	import type { Instance } from '$lib/updown-v2/types';

	// ── Instance table config ──
	let instanceStatusFilter = $state('');

	const instanceFilterOptions = $derived<FilterOption[]>([
		{ value: '', label: t('updown5m.table.all') },
		{ value: 'running', label: t('updown5m.table.running') },
		{ value: 'paused', label: t('updown5m.table.paused') },
		{ value: 'stopped', label: t('updown5m.table.stopped') }
	]);

	const instanceColumns = $derived<Column<Instance>[]>([
		{ key: 'label', label: t('updown5m.table.strategy'), getValue: (r) => r.label },
		{ key: 'spaceName', label: t('updown5m.table.space'), getValue: (r) => r.spaceName, hideOnMobile: true },
		{ key: 'mode', label: t('updown5m.table.mode'), getValue: (r) => r.mode },
		{ key: 'status', label: t('updown5m.table.status'), getValue: (r) => r.status },
		{ key: 'hour', label: t('updown5m.table.1h'), getValue: (r) => r.profits.hour, hideOnMobile: true },
		{ key: 'day', label: t('updown5m.table.today'), getValue: (r) => r.profits.day },
		{ key: 'thirtyDay', label: t('updown5m.table.30d'), getValue: (r) => r.profits.thirtyDay },
		{ key: 'winRate', label: t('updown5m.table.winRate'), getValue: (r) => r.stats.winRate }
	]);

	// ── Derived data ──
	const filteredInstances = $derived(
		modeFilter.value === 'all'
			? instances.list
			: instances.list.filter(i => i.mode === modeFilter.value)
	);
	const sandboxInstances = $derived(instances.list.filter(i => i.mode === 'sandbox'));
	const liveInstances = $derived(instances.list.filter(i => i.mode === 'live'));

	const modeInstances = $derived(
		modeFilter.value === 'sandbox' ? sandboxInstances
		: modeFilter.value === 'live' ? liveInstances
		: instances.list
	);
	const modeTodayProfit = $derived(modeInstances.reduce((s, i) => s + i.profits.day, 0));
	const modeActiveCount = $derived(modeInstances.filter(i => i.status === 'running').length);
	const modeWinRate = $derived(modeInstances.length ? modeInstances.reduce((s, i) => s + i.stats.winRate, 0) / modeInstances.length : 0);
	const modeRoundsToday = $derived(modeInstances.reduce((s, i) => s + i.stats.rounds, 0));
	const mode30dProfit = $derived(modeInstances.reduce((s, i) => s + i.profits.thirtyDay, 0));
</script>

<!-- ═══ HUB ═══ -->
<section class="page-header" use:fadeInUp={{ delay: 0 }}>
	<div class="title-row">
		<h1 class="page-title">{t('updown5m.title')}</h1>
		{#if authStore.isLoggedIn}
			<a class="btn-accent" href={routes.editor()}>{t('updown5m.newStrategy')}</a>
		{/if}
	</div>
	<p class="page-desc">
		{#if authStore.isLoggedIn}
			{t('updown5m.descLoggedIn')}
		{:else}
			{t('updown5m.descLoggedOut')}
		{/if}
	</p>
</section>

{#if !authStore.isLoggedIn}
	<!-- ── Logged out ── -->
	<div class="prompt-card" use:fadeInUp={{ delay: 50 }}>
		<div class="prompt-content">
			<p class="prompt-title">{t('updown5m.promptTitle')}</p>
			<p class="prompt-desc">{t('updown5m.promptDesc')}</p>
		</div>
		<button class="btn-accent" onclick={() => (showAuth.value = true)}>{t('auth.login.button')}</button>
	</div>

	<div class="section-row" use:fadeInUp={{ delay: 80 }}><h2 class="section-title">{t('updown5m.trending')}</h2></div>
	<div class="card-grid-3" use:fadeInUp={{ delay: 100 }}>
		{#each leaderboard.list as s (s.id)}
			<div class="card trending-card">
				<div class="card-top"><span class="rank-tag">#{s.rank}</span><span class="vis-badge" class:vis-public={s.visibility === 'public'} class:vis-private={s.visibility === 'private'}>{s.visibility}</span></div>
				<div class="card-name">{s.name}</div>
				<div class="card-meta">{s.creator} &middot; {s.space}</div>
				<div class="sparkline">{@html sparklineHtml(s.sparkline)}</div>
				<div class="card-metrics"><span class="metric"><span class="metric-label">24h</span><span class="metric-value positive">{s.profit}</span></span><span class="metric"><span class="metric-label">WR</span><span class="metric-value">{s.winRate}%</span></span><span class="metric"><span class="metric-label">Rounds</span><span class="metric-value">{s.rounds}</span></span></div>
			</div>
		{/each}
	</div>

	<div class="signin-cta" use:fadeInUp={{ delay: 150 }}>
		<p>{t('updown5m.promptCta')}</p>
		<button class="btn-accent" onclick={() => (showAuth.value = true)}>{t('updown5m.getStarted')}</button>
	</div>

{:else}
	<!-- ── Logged in ── -->
	<div class="tab-bar" use:fadeInUp={{ delay: 50 }}>
		<button class="tab" class:active={hubTab.active === 0} onclick={() => hubTab.active = 0}>{t('updown5m.tab.overview')}</button>
		<button class="tab" class:active={hubTab.active === 1} onclick={() => hubTab.active = 1}>{t('updown5m.tab.instances')}</button>
		<button class="tab" class:active={hubTab.active === 2} onclick={() => hubTab.active = 2}>{t('updown5m.tab.spaces')}</button>
	</div>

	<div class="tab-content" use:fadeInUp={{ delay: 100 }}>
		{#if hubTab.active === 0}
			<!-- Overview -->
			<div class="mode-filter">
				<button class="mode-pill" class:active={modeFilter.value === 'all'} onclick={() => modeFilter.value = 'all'}>All</button>
				<button class="mode-pill" class:active={modeFilter.value === 'sandbox'} onclick={() => modeFilter.value = 'sandbox'}>Sandbox</button>
				<button class="mode-pill" class:active={modeFilter.value === 'live'} onclick={() => modeFilter.value = 'live'}>Live</button>
			</div>

			<!-- Stats -->
			<div class="stats-grid-4">
				<div class="stat-card"><div class="stat-label">{t('updown5m.stat.todayProfit')}</div><div class="stat-value {profitClass(modeTodayProfit)}">{fmt(modeTodayProfit)}</div><div class="stat-sub">{modeInstances.length} instances</div></div>
				<div class="stat-card"><div class="stat-label">{t('updown5m.stat.active')}</div><div class="stat-value">{modeActiveCount}</div><div class="stat-sub">{t('updown5m.stat.instancesRunning')}</div></div>
				<div class="stat-card"><div class="stat-label">{t('updown5m.stat.avgWinRate')}</div><div class="stat-value">{fmtPct(modeWinRate)}</div><div class="stat-sub">{modeRoundsToday} rounds</div></div>
				<div class="stat-card"><div class="stat-label">{t('updown5m.stat.30dProfit')}</div><div class="stat-value {profitClass(mode30dProfit)}">{fmtShort(mode30dProfit)}</div><div class="stat-sub">{modeInstances.length} instances</div></div>
			</div>

			<!-- Your Best Today -->
			<div class="section-row"><h2 class="section-title">{t('updown5m.yourBest')}</h2></div>
			{#if filteredInstances.length === 0}
				<div class="onboarding-card">
					<p class="onboarding-title">{t('updown5m.empty.title')}</p>
					<p class="onboarding-desc">{t('updown5m.empty.desc')}</p>
					<div class="onboarding-steps">
						<div class="onboarding-step"><span class="step-num">1</span><span>Join a space — <button class="link-btn inline" onclick={() => { hubTab.active = 2; }}>browse spaces</button></span></div>
						<div class="onboarding-step"><span class="step-num">2</span><span>Create or copy a strategy — <a class="link-btn inline" href={routes.space('official')}>marketplace</a></span></div>
						<div class="onboarding-step"><span class="step-num">3</span><span>Run it in sandbox to test</span></div>
					</div>
					<a class="btn-accent" href={routes.editor()}>{t('updown5m.empty.create')}</a>
				</div>
			{:else}
				<div class="card-grid-2">
					{#each filteredInstances.filter(i => i.stats.profit > 0).sort((a, b) => b.stats.profit - a.stats.profit).slice(0, 2) as inst (inst.id)}
						<a class="card interactive" href={routes.instance(inst.spaceId, inst.id)}>
							<div class="card-name">{inst.label}</div>
							<div class="card-meta">{inst.spaceName} &middot; <span class="mode-badge" class:mode-live={inst.mode === 'live'}>{inst.mode === 'live' ? 'LIVE' : 'SANDBOX'}</span></div>
							<div class="card-metrics"><span class="metric"><span class="metric-label">Today</span><span class="metric-value positive">{fmt(inst.profits.day)}</span></span><span class="metric"><span class="metric-label">WR</span><span class="metric-value">{fmtPct(inst.stats.winRate)}</span></span></div>
						</a>
					{/each}
				</div>

				<!-- Recent Activity -->
				<div class="section-row"><h2 class="section-title">{t('updown5m.recentActivity')}</h2></div>
				<div class="feed-list">
					{#each activity.list as a (a.time + a.instance)}
						{@const inst = instances.list.find(i => i.label === a.instance)}
						<a class="feed-item" href={inst ? routes.instance(inst.spaceId, inst.id) : '#'}>
							<div class="feed-dot" class:feed-win={a.type === 'win'} class:feed-loss={a.type === 'loss'} class:feed-info={a.type === 'entry' || a.type === 'info'} class:feed-pause={a.type === 'pause'}></div>
							<div class="feed-body">
								<div class="feed-top">
									<span class="feed-name">{a.instance}</span>
									<span class="feed-time">{a.time}</span>
								</div>
								<div class="feed-msg" class:positive={a.type === 'win'} class:negative={a.type === 'loss'}>{a.message}</div>
							</div>
						</a>
					{/each}
				</div>
			{/if}

			<!-- Trending (at bottom) -->
			<div class="section-row"><h2 class="section-title">{t('updown5m.trending')}</h2><a class="link-btn" href={routes.space('official')}>{t('updown5m.seeAll')}</a></div>
			<div class="card-grid-3">
				{#each leaderboard.list.slice(0, 6) as s (s.id)}
					<a class="card interactive trending-card" href={routes.strategy('official', s.id)}>
						<div class="card-top"><span class="rank-tag">#{s.rank}</span><span class="vis-badge" class:vis-public={s.visibility === 'public'} class:vis-private={s.visibility === 'private'}>{s.visibility}</span></div>
						<div class="card-name">{s.name}</div>
						<div class="card-meta">{s.creator} &middot; {s.space}</div>
						<div class="sparkline">{@html sparklineHtml(s.sparkline)}</div>
						<div class="card-metrics"><span class="metric"><span class="metric-label">24h</span><span class="metric-value positive">{s.profit}</span></span><span class="metric"><span class="metric-label">WR</span><span class="metric-value">{s.winRate}%</span></span><span class="metric"><span class="metric-label">Rounds</span><span class="metric-value">{s.rounds}</span></span></div>
					</a>
				{/each}
			</div>

		{:else if hubTab.active === 1}
			<!-- My Instances -->
			<div class="mode-filter">
				<button class="mode-pill" class:active={modeFilter.value === 'all'} onclick={() => modeFilter.value = 'all'}>All</button>
				<button class="mode-pill" class:active={modeFilter.value === 'sandbox'} onclick={() => modeFilter.value = 'sandbox'}>Sandbox</button>
				<button class="mode-pill" class:active={modeFilter.value === 'live'} onclick={() => modeFilter.value = 'live'}>Live</button>
			</div>
			<DataTable
				data={filteredInstances}
				columns={instanceColumns}
				filterKey="status"
				filterOptions={instanceFilterOptions}
				filterValue={instanceStatusFilter}
				onFilterChange={(v) => (instanceStatusFilter = v)}
				pageSize={10}
				defaultSortKey="day"
				{t}
				onRowClick={(inst) => goto(routes.instance(inst.spaceId, inst.id))}
			>
				{#snippet cell(row, key)}
					{#if key === 'label'}
						<span class="dot {statusDot(row.status)}"></span> <strong>{row.label}</strong>
					{:else if key === 'spaceName'}
						<span class="muted">{row.spaceName}</span>
					{:else if key === 'mode'}
						<span class="mode-badge" class:mode-live={row.mode === 'live'}>{row.mode === 'live' ? 'LIVE' : 'SANDBOX'}</span>
					{:else if key === 'status'}
						<span class={row.status === 'running' ? 'positive' : row.status === 'paused' ? 'warning' : 'muted'}>{row.status}</span>
					{:else if key === 'hour'}
						<span class={profitClass(row.profits.hour)}>{fmtShort(row.profits.hour)}</span>
					{:else if key === 'day'}
						<span class={profitClass(row.profits.day)}>{fmtShort(row.profits.day)}</span>
					{:else if key === 'thirtyDay'}
						<span class={profitClass(row.profits.thirtyDay)}>{fmtShort(row.profits.thirtyDay)}</span>
					{:else if key === 'winRate'}
						{row.stats.winRate}%
					{/if}
				{/snippet}
			</DataTable>

		{:else}
			<!-- Spaces -->
			<div class="card-grid-3">
				{#each spaces.list as space (space.id)}
					<a class="card interactive space-card" href={routes.space(space.id)}>
						<div class="space-status" class:online={space.online}></div>
						<span class="space-badge" class:badge-official={space.isOfficial}>{space.isOfficial ? 'Official' : 'Private'}</span>
						<div class="card-name">{space.name}</div>
						<div class="space-url">{space.endpointUrl}</div>
						<div class="card-metrics">
							<span class="metric"><span class="metric-value">{space.stats.totalUsers}</span> <span class="metric-label">users</span></span>
							<span class="metric"><span class="metric-value">{space.stats.totalStrategies}</span> <span class="metric-label">strategies</span></span>
							<span class="metric" class:positive={space.allowLiveTrading}>{space.allowLiveTrading ? 'Live' : 'Sandbox'}</span>
						</div>
					</a>
				{/each}
				<button class="card add-card" onclick={() => (showAddSpace.value = true)}><span class="add-icon">+</span><span>{t('updown5m.addSpace')}</span></button>
			</div>
		{/if}
	</div>
{/if}
