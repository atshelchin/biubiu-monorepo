<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import { authStore } from '$lib/auth';
	import AuthModal from '$lib/auth/AuthModal.svelte';
	import { nav, goTo, goBack, spaces, instances, leaderboard, market, activity, hubTab, modeFilter } from '$lib/updown-v2/store.svelte';

	const filteredInstances = $derived(
		modeFilter.value === 'all'
			? instances.list
			: instances.list.filter(i => i.mode === modeFilter.value)
	);
	const sandboxInstances = $derived(instances.list.filter(i => i.mode === 'sandbox'));
	const liveInstances = $derived(instances.list.filter(i => i.mode === 'live'));

	// Stats for the selected mode filter
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

	let showAuth = $state(false);

	const seoProps = $derived(getBaseSEO({
		title: t('updown5m.title'),
		description: t('updown5m.descLoggedOut'),
		currentLocale: locale.value,
	}));

	const activeInstance = $derived(instances.list.find(i => i.spaceId === nav.spaceId && i.status === 'running') ?? instances.list.find(i => i.spaceId === nav.spaceId));

	function statusDot(status: string) {
		if (status === 'running') return 'dot-run';
		if (status === 'paused') return 'dot-pause';
		return 'dot-stop';
	}
	function profitClass(v: number) { return v >= 0 ? 'positive' : 'negative'; }
	function fmt(v: number) { return v >= 0 ? `+$${v.toFixed(2)}` : `-$${Math.abs(v).toFixed(2)}`; }
	function fmtShort(v: number) { return v >= 0 ? `+$${v}` : `-$${Math.abs(v)}`; }

	function sparklineHtml(data: number[]) {
		const max = Math.max(...data.map(Math.abs), 0.01);
		return data.map(v => {
			const h = Math.max(Math.abs(v) / max * 100, 4);
			const color = v >= 0 ? 'var(--success, #34d399)' : 'var(--error, #f87171)';
			const opacity = 0.35 + Math.abs(v) / max * 0.65;
			return `<div style="flex:1;height:${h}%;background:${color};opacity:${opacity};border-radius:1px 1px 0 0;min-width:2px"></div>`;
		}).join('');
	}
</script>

<SEO {...seoProps} />
<PageHeader />

<AuthModal open={showAuth} onClose={() => (showAuth = false)} />

<main class="page">
	{#if nav.page === 'hub'}
		<!-- ═══ HUB ═══ -->
		<section class="page-header" use:fadeInUp={{ delay: 0 }}>
			<div class="title-row">
				<h1 class="page-title">{t('updown5m.title')}</h1>
				{#if authStore.isLoggedIn}
					<button class="btn-accent" onclick={() => goTo('editor', t('updown5m.editor.title'))}>{t('updown5m.newStrategy')}</button>
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
				<button class="btn-accent" onclick={() => (showAuth = true)}>{t('auth.login.button')}</button>
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
				<button class="btn-accent" onclick={() => (showAuth = true)}>{t('updown5m.getStarted')}</button>
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

					<!-- Stats: all 4 follow mode filter -->
					<div class="stats-grid-4">
						<div class="stat-card"><div class="stat-label">{t('updown5m.stat.todayProfit')}</div><div class="stat-value {profitClass(modeTodayProfit)}">{fmt(modeTodayProfit)}</div><div class="stat-sub">{modeInstances.length} instances</div></div>
						<div class="stat-card"><div class="stat-label">{t('updown5m.stat.active')}</div><div class="stat-value">{modeActiveCount}</div><div class="stat-sub">{t('updown5m.stat.instancesRunning')}</div></div>
						<div class="stat-card"><div class="stat-label">{t('updown5m.stat.avgWinRate')}</div><div class="stat-value">{modeWinRate.toFixed(1)}%</div><div class="stat-sub">{modeRoundsToday} rounds</div></div>
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
								<div class="onboarding-step"><span class="step-num">2</span><span>Create or copy a strategy — <button class="link-btn inline" onclick={() => goTo('marketplace', t('updown5m.marketplace'))}>marketplace</button></span></div>
								<div class="onboarding-step"><span class="step-num">3</span><span>Run it in sandbox to test</span></div>
							</div>
							<button class="btn-accent" onclick={() => goTo('editor', t('updown5m.editor.title'))}>{t('updown5m.empty.create')}</button>
						</div>
					{:else}
						<div class="card-grid-2">
							{#each filteredInstances.filter(i => i.stats.profit > 0).sort((a, b) => b.stats.profit - a.stats.profit).slice(0, 2) as inst (inst.id)}
								<button class="card interactive" onclick={() => goTo('space', inst.spaceName, { spaceId: inst.spaceId })}>
									<div class="card-name">{inst.label}</div>
									<div class="card-meta">{inst.spaceName} &middot; <span class="mode-badge" class:mode-live={inst.mode === 'live'}>{inst.mode === 'live' ? 'LIVE' : 'SBX'}</span></div>
									<div class="card-metrics"><span class="metric"><span class="metric-label">Today</span><span class="metric-value positive">{fmt(inst.profits.day)}</span></span><span class="metric"><span class="metric-label">WR</span><span class="metric-value">{inst.stats.winRate}%</span></span></div>
								</button>
							{/each}
						</div>

						<!-- Recent Activity -->
						<div class="section-row"><h2 class="section-title">{t('updown5m.recentActivity')}</h2></div>
						<div class="activity-card">
							{#each activity.list as a (a.time + a.instance)}
								<div class="activity-row">
									<span class="activity-time">{a.time}</span>
									<span class="activity-name">{a.instance}</span>
									<span class="activity-msg" class:positive={a.type === 'win'} class:negative={a.type === 'loss'}>{a.message}</span>
									<span class="activity-space">{a.space}</span>
								</div>
							{/each}
						</div>
					{/if}

					<!-- Trending (at bottom) -->
					<div class="section-row"><h2 class="section-title">{t('updown5m.trending')}</h2><button class="link-btn" onclick={() => goTo('marketplace', t('updown5m.marketplace'))}>{t('updown5m.seeAll')}</button></div>
					<div class="card-grid-3">
						{#each leaderboard.list.slice(0, 6) as s (s.id)}
							<button class="card interactive trending-card" onclick={() => goTo('strategy-detail', s.name, { strategyId: s.id })}>
								<div class="card-top"><span class="rank-tag">#{s.rank}</span><span class="vis-badge" class:vis-public={s.visibility === 'public'} class:vis-private={s.visibility === 'private'}>{s.visibility}</span></div>
								<div class="card-name">{s.name}</div>
								<div class="card-meta">{s.creator} &middot; {s.space}</div>
								<div class="sparkline">{@html sparklineHtml(s.sparkline)}</div>
								<div class="card-metrics"><span class="metric"><span class="metric-label">24h</span><span class="metric-value positive">{s.profit}</span></span><span class="metric"><span class="metric-label">WR</span><span class="metric-value">{s.winRate}%</span></span><span class="metric"><span class="metric-label">Rounds</span><span class="metric-value">{s.rounds}</span></span></div>
							</button>
						{/each}
					</div>

				{:else if hubTab.active === 1}
					<!-- My Instances -->
					<div class="mode-filter">
						<button class="mode-pill" class:active={modeFilter.value === 'all'} onclick={() => modeFilter.value = 'all'}>All</button>
						<button class="mode-pill" class:active={modeFilter.value === 'sandbox'} onclick={() => modeFilter.value = 'sandbox'}>Sandbox</button>
						<button class="mode-pill" class:active={modeFilter.value === 'live'} onclick={() => modeFilter.value = 'live'}>Live</button>
					</div>
					<div class="table-wrap">
						<table class="data-table">
							<thead><tr><th>{t('updown5m.table.strategy')}</th><th class="hide-mobile">{t('updown5m.table.space')}</th><th>{t('updown5m.table.mode')}</th><th>{t('updown5m.table.status')}</th><th class="hide-mobile">1h</th><th>Today</th><th>30d</th><th>{t('updown5m.table.winRate')}</th></tr></thead>
							<tbody>
								{#each filteredInstances as inst (inst.id)}
									<tr class="clickable" onclick={() => goTo('space', inst.spaceName, { spaceId: inst.spaceId })}>
										<td><span class="dot {statusDot(inst.status)}"></span> <strong>{inst.label}</strong></td>
										<td class="muted hide-mobile">{inst.spaceName}</td>
										<td><span class="mode-badge" class:mode-live={inst.mode === 'live'}>{inst.mode === 'live' ? 'LIVE' : 'SBX'}</span></td>
										<td class="{inst.status === 'running' ? 'positive' : inst.status === 'paused' ? 'warning' : 'muted'}">{inst.status}</td>
										<td class="{profitClass(inst.profits.hour)} hide-mobile">{fmtShort(inst.profits.hour)}</td>
										<td class={profitClass(inst.profits.day)}>{fmtShort(inst.profits.day)}</td>
										<td class={profitClass(inst.profits.thirtyDay)}>{fmtShort(inst.profits.thirtyDay)}</td>
										<td>{inst.stats.winRate}%</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

				{:else}
					<!-- Spaces -->
					<div class="card-grid-3">
						{#each spaces.list as space (space.id)}
							<button class="card interactive space-card" onclick={() => goTo('space', space.name, { spaceId: space.id })}>
								<div class="space-status" class:online={space.online}></div>
								<span class="space-badge" class:badge-official={space.isOfficial}>{space.isOfficial ? 'Official' : 'Private'}</span>
								<div class="card-name">{space.name}</div>
								<div class="space-url">{space.endpointUrl}</div>
								<div class="card-metrics">
									<span class="metric"><span class="metric-value">{space.stats.totalUsers}</span> <span class="metric-label">users</span></span>
									<span class="metric"><span class="metric-value">{space.stats.totalStrategies}</span> <span class="metric-label">strategies</span></span>
									<span class="metric" class:positive={space.allowLiveTrading}>{space.allowLiveTrading ? 'Live' : 'Sandbox'}</span>
								</div>
							</button>
						{/each}
						<button class="card add-card" onclick={() => { const url = prompt('Endpoint URL:'); if (url) alert('TODO: Connect to ' + url); }}><span class="add-icon">+</span><span>{t('updown5m.addSpace')}</span></button>
					</div>
				{/if}
			</div>
		{/if}

	{:else if nav.page === 'space'}
		<!-- ═══ SPACE ═══ -->
		{@const space = spaces.list.find(s => s.id === nav.spaceId)}
		{@const spaceInstances = instances.list.filter(i => i.spaceId === nav.spaceId)}
		<section class="page-header">
			<button class="back-link" onclick={goBack}>&larr; Back</button>
			<div class="title-row">
				<h1 class="page-title">{space?.name ?? 'Space'}</h1>
				<span class="mode-badge" class:mode-live={space?.allowLiveTrading}>{space?.allowLiveTrading ? 'Live' : 'Sandbox'}</span>
			</div>
		</section>

		<div class="tab-bar">
			<button class="tab active">My Strategies</button>
			<button class="tab" onclick={() => goTo('marketplace', t('updown5m.marketplace'))}>{t('updown5m.marketplace')}</button>
		</div>

		{#if spaceInstances.length === 0}
			<div class="empty-state">
				<p class="empty-title">{t('updown5m.empty.title')}</p>
				<p class="empty-desc">{t('updown5m.empty.desc')}</p>
				<div class="empty-actions">
					<button class="btn-accent" onclick={() => goTo('editor', t('updown5m.editor.title'))}>{t('updown5m.empty.create')}</button>
					<button class="btn-secondary" onclick={() => goTo('marketplace', t('updown5m.marketplace'))}>{t('updown5m.marketplace')}</button>
				</div>
			</div>
		{:else}
			<div class="dash-layout">
				<aside class="dash-sidebar">
					<div class="sidebar-head"><span class="sidebar-label">Instances {spaceInstances.length}</span></div>
					<div class="sidebar-cols"><span>Strategy</span><span>1h</span><span>Today</span><span>30d</span></div>
					{#each spaceInstances as inst, i (inst.id)}
						<div class="sidebar-item" class:active={i === 0}>
							<div class="si-top"><span class="si-name">{inst.label}</span><span class="mode-badge" class:mode-live={inst.mode === 'live'}>{inst.mode === 'live' ? 'LIVE' : 'SBX'}</span></div>
							<div class="si-metrics">
								<span class="si-profit {profitClass(inst.stats.profit)}">{fmt(inst.stats.profit)}</span>
								<span class="si-cell {profitClass(inst.profits.hour)}">{fmtShort(inst.profits.hour)}</span>
								<span class="si-cell {profitClass(inst.profits.day)}">{fmtShort(inst.profits.day)}</span>
								<span class="si-cell {profitClass(inst.profits.thirtyDay)}">{fmtShort(inst.profits.thirtyDay)}</span>
							</div>
							<div class="si-status"><span class="dot {statusDot(inst.status)}"></span> {inst.status} &middot; {inst.stats.winRate}% &middot; {inst.stats.rounds}r</div>
						</div>
					{/each}
				</aside>

				{#if activeInstance}
					{@const active = activeInstance}
					<div class="dash-main">
						<div class="dash-toolbar">
							<span class="dash-active-name">{active.label}</span>
							<span class="mode-badge" class:mode-live={active.mode === 'live'}>{active.mode === 'live' ? 'LIVE' : 'SBX'}</span>
							<div class="ctrl-group">
								<button class="ctrl-btn" class:ctrl-active={active.status === 'running'} aria-label="Pause">&#9646;&#9646;</button>
								<button class="ctrl-btn" aria-label="Stop">&#9632;</button>
								<span class="ctrl-status"><span class="dot {statusDot(active.status)}"></span> 3h 24m</span>
							</div>
						</div>
						<div class="dash-scroll">
							<div class="stats-grid-4">
								<div class="stat-card"><div class="stat-label">Profit</div><div class="stat-value {profitClass(active.stats.profit)}">{fmt(active.stats.profit)}</div><div class="stat-sub">{active.stats.rounds} rounds</div></div>
								<div class="stat-card"><div class="stat-label">Win Rate</div><div class="stat-value">{active.stats.winRate}%</div></div>
								<div class="stat-card"><div class="stat-label">Avg / Round</div><div class="stat-value positive">+$1.78</div></div>
								<div class="stat-card"><div class="stat-label">Streak</div><div class="stat-value positive">W3</div></div>
							</div>
							<div class="placeholder-card">Hourly Profit chart — will integrate existing HourlyChart component</div>
							<div class="placeholder-card">Rounds History table — will integrate existing RoundsHistory component</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}

	{:else if nav.page === 'marketplace'}
		<!-- ═══ MARKETPLACE ═══ -->
		{@const sortKey = 'winRate'}
		{@const sorted = [...market.list].sort((a, b) => {
			if (sortKey === 'winRate') return b.performance.winRate - a.performance.winRate;
			if (sortKey === 'profit') return b.performance.profitAll - a.performance.profitAll;
			return b.performance.totalRounds - a.performance.totalRounds;
		})}
		<section class="page-header">
			<button class="back-link" onclick={goBack}>&larr; Back</button>
			<div class="title-row">
				<h1 class="page-title">{t('updown5m.marketplace')}</h1>
			</div>
			<p class="page-desc">{t('updown5m.marketplace.desc')}</p>
		</section>

		<!-- List view (sortable table) -->
		<div class="table-wrap">
			<table class="data-table">
				<thead><tr><th>#</th><th>Strategy</th><th>Author</th><th>Type</th><th>WR</th><th>24h</th><th>All</th><th>Rounds</th></tr></thead>
				<tbody>
					{#each sorted as s, i (s.id)}
						<tr class="clickable" onclick={() => goTo('strategy-detail', s.name, { strategyId: s.id })}>
							<td class="rank">{i + 1}</td>
							<td><strong>{s.name}</strong></td>
							<td class="muted">{s.author.name}</td>
							<td><span class="vis-badge" class:vis-public={s.visibility === 'public'} class:vis-private={s.visibility === 'private'}>{s.visibility}</span></td>
							<td class="positive">{s.performance.winRate}%</td>
							<td class="positive">+${s.performance.profit24h}</td>
							<td class="positive">+${s.performance.profitAll}</td>
							<td>{s.performance.totalRounds}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

	{:else if nav.page === 'strategy-detail'}
		<!-- ═══ STRATEGY DETAIL ═══ -->
		{@const strat = market.list.find(s => s.id === nav.strategyId)}
		{#if strat}
			{@const startDate = new Date(strat.createdAt)}
			{@const daysRunning = Math.floor((Date.now() - startDate.getTime()) / 86400000)}
			<button class="back-link" onclick={goBack}>&larr; Back</button>

			<!-- Hero card with actions integrated -->
			<div class="detail-hero">
				<div class="detail-hero-top">
					<div>
						<h1 class="detail-name">{strat.name}</h1>
						<p class="detail-meta">{strat.author.name} &middot; {strat.performance.totalRounds} rounds &middot; {strat.followCount} followers &middot; Running {daysRunning}d since {startDate.toLocaleDateString()}</p>
					</div>
					<div class="detail-hero-actions">
						{#if strat.visibility === 'private' && !strat.config}
							<button class="btn-warning btn-sm" onclick={() => alert('TODO: Unlock')}>&#128274; Unlock $20</button>
						{:else}
							<button class="btn-accent btn-sm" onclick={() => alert('TODO: Follow')}>Follow</button>
							<button class="btn-secondary btn-sm" onclick={() => alert('TODO: Copy')}>Copy</button>
							<button class="btn-secondary btn-sm" onclick={() => alert('TODO: Export')}>Export</button>
						{/if}
					</div>
				</div>

				<p class="detail-desc">{strat.description}</p>

				<div class="detail-stats">
					<div class="detail-stat"><span class="detail-stat-val positive">{strat.performance.winRate}%</span><span class="detail-stat-label">Win Rate</span></div>
					<div class="detail-stat"><span class="detail-stat-val positive">+${strat.performance.profit24h}</span><span class="detail-stat-label">24h</span></div>
					<div class="detail-stat"><span class="detail-stat-val positive">+${strat.performance.profitAll}</span><span class="detail-stat-label">Total</span></div>
					<div class="detail-stat"><span class="detail-stat-val negative">-${strat.performance.maxDrawdown}</span><span class="detail-stat-label">Drawdown</span></div>
				</div>
			</div>

			<!-- Chart -->
			<div class="placeholder-card">Hourly performance chart</div>

			<!-- Purchase banner (only for locked private) -->
			{#if strat.visibility === 'private' && !strat.config}
				<div class="purchase-bar">
					<div class="purchase-info">
						<div class="lock-icon">&#128274;</div>
						<div>
							<p class="purchase-title">Strategy config locked</p>
							<p class="purchase-note">$20 one-time · Arbitrum · 50% to creator</p>
						</div>
					</div>
					<button class="btn-accent" onclick={() => alert('TODO: Connect wallet & pay')}>Unlock Strategy</button>
				</div>
			{/if}
		{/if}

	{:else if nav.page === 'editor'}
		<section class="page-header">
			<button class="back-link" onclick={goBack}>&larr; Back</button>
			<div class="title-row">
				<h1 class="page-title">{t('updown5m.editor.title')}</h1>
			</div>
		</section>
		<div class="empty-state">
			<p class="empty-title">{t('updown5m.editor.title')}</p>
			<p class="empty-desc">{t('updown5m.editor.placeholder')}</p>
			<button class="btn-secondary" onclick={goBack}>Back</button>
		</div>
	{/if}
</main>

<PageFooter />

<style>
	/* ═══ Layout ═══ */
	main.page {
		max-width: 1100px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-6) var(--space-12);
		min-height: calc(100vh - 200px);
	}

	/* ═══ Page Header ═══ */
	.page-header { margin-bottom: var(--space-6); }
	.title-row { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
	.page-title { font-size: var(--text-3xl); font-weight: 800; letter-spacing: -0.02em; color: var(--fg-base); margin: 0; }
	.page-desc { font-size: var(--text-md); color: var(--fg-muted); margin-top: var(--space-2); }
	.back-link { background: none; border: none; color: var(--accent); font-size: var(--text-sm); cursor: pointer; padding: 0; font-weight: 500; margin-bottom: var(--space-2); display: inline-flex; align-items: center; gap: var(--space-1); transition: transform var(--motion-fast); }
	.back-link:hover { text-decoration: underline; }
	.back-link:active { transform: scale(0.96); }

	/* ═══ Buttons ═══ */
	.btn-accent { display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-4); border-radius: var(--radius-md); font-size: var(--text-sm); font-weight: 600; border: none; background: var(--accent); color: var(--accent-fg, #fff); cursor: pointer; transition: background var(--motion-fast) var(--easing), transform var(--motion-fast) var(--easing); }
	.btn-accent:hover { background: var(--accent-hover); }
	.btn-accent:active { transform: scale(0.96); }
	.btn-secondary { display: inline-flex; align-items: center; padding: var(--space-2) var(--space-4); border-radius: var(--radius-md); font-size: var(--text-sm); font-weight: 500; border: 1px solid var(--border-base); background: var(--bg-raised); color: var(--fg-base); cursor: pointer; transition: transform var(--motion-fast) var(--easing); }
	.btn-secondary:active { transform: scale(0.96); }
	.btn-warning { display: inline-flex; align-items: center; padding: var(--space-2) var(--space-4); border-radius: var(--radius-md); font-size: var(--text-sm); font-weight: 600; border: 1px solid var(--warning-muted, rgba(251,191,36,.2)); background: var(--warning-muted, rgba(251,191,36,.08)); color: var(--warning, #fbbf24); cursor: pointer; transition: transform var(--motion-fast) var(--easing); }
	.btn-warning:active { transform: scale(0.96); }
	.btn-sm { padding: var(--space-1) var(--space-3); font-size: var(--text-xs); }
	.link-btn { background: none; border: none; color: var(--fg-muted); font-size: var(--text-sm); cursor: pointer; }
	.link-btn:hover { color: var(--fg-base); }

	/* ═══ Tabs ═══ */
	.tab-bar { display: flex; border-bottom: 1px solid var(--border-base); margin-bottom: var(--space-6); gap: 0; }
	.tab { padding: var(--space-3) var(--space-4); font-size: var(--text-sm); font-weight: 500; color: var(--fg-muted); border: none; border-bottom: 2px solid transparent; background: none; cursor: pointer; transition: color var(--motion-fast); }
	.tab:hover { color: var(--fg-base); }
	.tab:active { transform: scale(0.95); }
	.tab.active { color: var(--fg-base); border-bottom-color: var(--accent); }

	/* ═══ Prompt (logged out) ═══ */
	.prompt-card { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4) var(--space-6); background: var(--accent-subtle, rgba(96,165,250,.05)); border: 1px solid var(--accent-muted, rgba(96,165,250,.15)); border-radius: var(--radius-lg); margin-bottom: var(--space-6); }
	.prompt-card p { font-size: var(--text-sm); color: var(--fg-muted); margin: 0; }

	/* ═══ Mode filter ═══ */
	.mode-filter { display: flex; gap: var(--space-1); padding: var(--space-1); background: var(--bg-sunken, var(--bg-raised)); border-radius: var(--radius-md); align-self: flex-start; margin-bottom: var(--space-4); }
	.mode-pill { padding: var(--space-1) var(--space-3); border-radius: var(--radius-sm); font-size: var(--text-xs); font-weight: 500; border: none; background: transparent; color: var(--fg-muted); cursor: pointer; transition: all var(--motion-fast) var(--easing); }
	.mode-pill:active { transform: scale(0.95); }
	.mode-pill.active { background: var(--bg-raised, rgba(255,255,255,.1)); color: var(--fg-base); box-shadow: var(--shadow-sm); }

	/* ═══ Stats ═══ */
	.stats-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-3); margin-bottom: var(--space-6); }
	.stat-card { background: var(--bg-raised); border: 1px solid var(--border-base); border-radius: var(--radius-md); padding: var(--space-4); }
	.stat-label { font-size: var(--text-xs); color: var(--fg-subtle); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-1); }
	.stat-value { font-size: var(--text-2xl); font-weight: 700; letter-spacing: -0.03em; }
	.stat-sub { font-size: var(--text-xs); color: var(--fg-muted); margin-top: var(--space-1); }

	/* ═══ Cards ═══ */
	.card-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); margin-bottom: var(--space-6); }
	.card-grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-3); margin-bottom: var(--space-6); }
	.card { background: var(--bg-raised); border: 1px solid var(--border-base); border-radius: var(--radius-lg); padding: var(--space-4); text-align: left; position: relative; }
	.card.interactive { cursor: pointer; transition: transform var(--motion-fast) var(--easing), box-shadow var(--motion-fast) var(--easing), border-color var(--motion-fast); }
	.card.interactive:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); border-color: var(--border-strong); }
	.card.interactive:active { transform: scale(0.97); box-shadow: none; }
	.card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-2); }
	.card-name { font-size: var(--text-md); font-weight: 700; color: var(--fg-base); letter-spacing: -0.01em; }
	.card-meta { font-size: var(--text-xs); color: var(--fg-muted); margin-top: 2px; }
	.card-desc { font-size: var(--text-sm); color: var(--fg-muted); margin-bottom: var(--space-3); line-height: var(--leading-relaxed); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
	.card-metrics { display: flex; gap: var(--space-4); font-size: var(--text-xs); margin-top: var(--space-3); }
	.card-actions { display: flex; gap: var(--space-2); margin-top: var(--space-3); }
	.metric-label { color: var(--fg-subtle); }
	.metric-value { font-weight: 600; margin-left: 3px; }
	.add-card { border-style: dashed; border-color: var(--border-base); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-2); min-height: 140px; color: var(--fg-muted); cursor: pointer; }
	.add-icon { font-size: var(--text-2xl); opacity: 0.3; }

	/* Sparkline */
	.sparkline { display: flex; align-items: flex-end; gap: 1px; height: 32px; margin: var(--space-3) 0; }
	.trending-card { overflow: hidden; }

	/* Prompt (logged out) */
	.prompt-card { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-5) var(--space-6); background: var(--accent-subtle, rgba(96,165,250,.05)); border: 1px solid var(--accent-muted, rgba(96,165,250,.12)); border-radius: var(--radius-lg); margin-bottom: var(--space-6); }
	.prompt-content { flex: 1; }
	.prompt-title { font-size: var(--text-md); font-weight: 600; color: var(--fg-base); margin: 0 0 var(--space-1); }
	.prompt-desc { font-size: var(--text-sm); color: var(--fg-muted); margin: 0; }
	.signin-cta { text-align: center; padding: var(--space-8) 0; border-top: 1px solid var(--border-base); margin-top: var(--space-4); }
	.signin-cta p { font-size: var(--text-sm); color: var(--fg-muted); margin-bottom: var(--space-4); }

	/* Section */
	.section-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3); margin-top: var(--space-8); }
	.section-title { font-size: var(--text-lg); font-weight: 600; color: var(--fg-base); margin: 0; }

	/* ═══ Badges ═══ */
	.rank-tag { font-size: var(--text-xs); font-weight: 700; color: var(--fg-subtle); }
	.vis-badge { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 6px; border-radius: var(--radius-sm); }
	.vis-public { background: var(--success-muted, rgba(52,211,153,.1)); color: var(--success, #34d399); }
	.vis-private { background: var(--warning-muted, rgba(251,191,36,.1)); color: var(--warning, #fbbf24); }
	.mode-badge { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 2px 5px; border-radius: var(--radius-sm); background: var(--warning-muted, rgba(251,191,36,.08)); color: var(--warning, #fbbf24); }
	.mode-live { background: var(--success-muted, rgba(52,211,153,.1)); color: var(--success, #34d399); }
	.space-badge { display: inline-flex; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; padding: 3px 7px; border-radius: var(--radius-sm); background: var(--info-muted, rgba(96,165,250,.1)); color: var(--info, #60a5fa); }
	.badge-official { background: var(--success-muted, rgba(52,211,153,.1)); color: var(--success, #34d399); }

	/* ═══ Colors ═══ */
	.positive { color: var(--success, #34d399); }
	.negative { color: var(--error, #f87171); }
	.warning { color: var(--warning, #fbbf24); }
	.muted { color: var(--fg-muted); }
	.dot { width: 5px; height: 5px; border-radius: 50%; display: inline-block; vertical-align: middle; }
	.dot-run { background: var(--success, #34d399); }
	.dot-pause { background: var(--warning, #fbbf24); }
	.dot-stop { background: var(--fg-subtle); }

	/* ═══ Table ═══ */
	.table-wrap, .leaderboard-wrap { overflow-x: auto; }
	.data-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
	.data-table th { text-align: left; padding: var(--space-3); font-size: var(--text-xs); color: var(--fg-subtle); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; border-bottom: 1px solid var(--border-base); }
	.data-table td { padding: var(--space-3); border-bottom: 1px solid var(--border-subtle, var(--border-base)); }
	.data-table .clickable { cursor: pointer; transition: background var(--motion-fast), transform var(--motion-fast); }
	.data-table .clickable:hover { background: var(--bg-raised); }
	.data-table .clickable:active { transform: scale(0.99); }
	.data-table .rank { font-weight: 700; color: var(--fg-subtle); }
	.data-table .name { font-weight: 600; }

	/* ═══ Activity ═══ */
	.activity-card { background: var(--bg-raised); border: 1px solid var(--border-base); border-radius: var(--radius-lg); padding: var(--space-4); font-family: var(--font-mono); font-size: var(--text-xs); }
	.activity-row { display: flex; gap: var(--space-2); padding: var(--space-1) 0; align-items: baseline; }
	.activity-time { color: var(--fg-subtle); min-width: 36px; }
	.activity-name { color: var(--fg-base); font-weight: 500; }
	.activity-space { color: var(--fg-subtle); }

	/* ═══ Space card ═══ */
	.space-card { position: relative; }
	.space-status { width: 7px; height: 7px; border-radius: 50%; position: absolute; top: var(--space-4); right: var(--space-4); background: var(--fg-subtle); }
	.space-status.online { background: var(--success, #34d399); }
	.space-url { font-size: var(--text-xs); color: var(--fg-subtle); font-family: var(--font-mono); word-break: break-all; margin-top: var(--space-1); margin-bottom: var(--space-3); }

	/* ═══ Onboarding ═══ */
	.onboarding-card { background: var(--bg-raised); border: 1px solid var(--border-base); border-radius: var(--radius-lg); padding: var(--space-6); margin-bottom: var(--space-6); }
	.onboarding-title { font-size: var(--text-lg); font-weight: 600; color: var(--fg-base); margin: 0 0 var(--space-2); }
	.onboarding-desc { font-size: var(--text-sm); color: var(--fg-muted); margin: 0 0 var(--space-5); }
	.onboarding-steps { display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-5); }
	.onboarding-step { display: flex; align-items: center; gap: var(--space-3); font-size: var(--text-sm); color: var(--fg-muted); }
	.step-num { width: 24px; height: 24px; border-radius: 50%; background: var(--accent-muted, rgba(96,165,250,.1)); color: var(--accent); font-size: var(--text-xs); font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
	.link-btn.inline { display: inline; padding: 0; font-size: inherit; color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }

	/* ═══ Empty state ═══ */
	.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: var(--space-16) var(--space-6); text-align: center; }
	.empty-title { font-size: var(--text-xl); font-weight: 600; color: var(--fg-base); margin-bottom: var(--space-2); }
	.empty-desc { font-size: var(--text-sm); color: var(--fg-muted); max-width: 320px; margin-bottom: var(--space-6); }
	.empty-actions { display: flex; gap: var(--space-3); }

	/* ═══ Dashboard layout ═══ */
	.dash-layout { display: flex; gap: 0; margin: 0 calc(-1 * var(--space-6)); border-top: 1px solid var(--border-base); min-height: 500px; }
	.dash-sidebar { width: 280px; border-right: 1px solid var(--border-base); flex-shrink: 0; overflow-y: auto; }
	.sidebar-head { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-base); }
	.sidebar-label { font-size: var(--text-xs); color: var(--fg-subtle); text-transform: uppercase; letter-spacing: 0.04em; }
	.sidebar-cols { display: grid; grid-template-columns: 1fr 48px 48px 48px; padding: var(--space-1) var(--space-4); font-size: 8px; color: var(--fg-subtle); text-transform: uppercase; letter-spacing: 0.03em; border-bottom: 1px solid var(--border-base); }
	.sidebar-cols span { text-align: center; }
	.sidebar-cols span:first-child { text-align: left; }
	.sidebar-item { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-subtle, var(--border-base)); cursor: pointer; transition: background var(--motion-fast); }
	.sidebar-item:hover { background: var(--bg-raised); }
	.sidebar-item.active { background: var(--bg-raised); border-left: 2px solid var(--accent); padding-left: calc(var(--space-4) - 2px); }
	.si-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-1); }
	.si-name { font-size: var(--text-sm); font-weight: 500; }
	.si-metrics { display: grid; grid-template-columns: 1fr 48px 48px 48px; margin: var(--space-1) 0; }
	.si-profit { font-size: var(--text-sm); font-weight: 600; }
	.si-cell { text-align: center; font-size: var(--text-xs); font-weight: 600; }
	.si-status { font-size: var(--text-xs); color: var(--fg-subtle); display: flex; align-items: center; gap: var(--space-1); }

	.dash-main { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
	.dash-toolbar { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-5); border-bottom: 1px solid var(--border-base); }
	.dash-active-name { font-size: var(--text-md); font-weight: 600; flex: 1; }
	.ctrl-group { display: flex; align-items: center; gap: var(--space-2); margin-left: auto; }
	.ctrl-btn { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--border-base); background: var(--bg-raised); color: var(--fg-muted); display: flex; align-items: center; justify-content: center; font-size: 11px; cursor: pointer; }
	.ctrl-active { background: var(--success-muted, rgba(52,211,153,.1)); border-color: var(--success, #34d399); color: var(--success, #34d399); }
	.ctrl-status { font-size: var(--text-xs); color: var(--fg-muted); display: flex; align-items: center; gap: var(--space-1); }
	.dash-scroll { flex: 1; overflow-y: auto; padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-4); }

	.placeholder-card { padding: var(--space-10); text-align: center; color: var(--fg-subtle); font-size: var(--text-sm); background: var(--bg-raised); border: 1px solid var(--border-base); border-radius: var(--radius-lg); }

	/* ═══ Strategy card (marketplace) ═══ */
	.strategy-card .card-top { margin-bottom: var(--space-2); }

	/* ═══ Strategy Detail ═══ */
	.detail-hero { background: var(--bg-raised); border: 1px solid var(--border-base); border-radius: var(--radius-xl, var(--radius-lg)); padding: var(--space-6); margin-bottom: var(--space-6); }
	.detail-hero-top { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-4); margin-bottom: var(--space-3); }
	.detail-hero-actions { display: flex; gap: var(--space-2); flex-shrink: 0; }
	.detail-name { font-size: var(--text-3xl); font-weight: 800; letter-spacing: -0.02em; color: var(--fg-base); margin: 0; }
	.detail-meta { font-size: var(--text-sm); color: var(--fg-muted); margin-top: var(--space-1); }
	.detail-desc { font-size: var(--text-sm); color: var(--fg-muted); line-height: var(--leading-relaxed); margin-bottom: var(--space-4); }
	.detail-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-3); padding-top: var(--space-4); border-top: 1px solid var(--border-subtle, var(--border-base)); }
	.detail-stat { display: flex; flex-direction: column; gap: 2px; }
	.detail-stat-val { font-size: var(--text-xl); font-weight: 700; letter-spacing: -0.02em; }
	.detail-stat-label { font-size: var(--text-xs); color: var(--fg-subtle); text-transform: uppercase; letter-spacing: 0.04em; }
	.lock-icon { font-size: 24px; opacity: 0.3; flex-shrink: 0; }
	.purchase-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-4) var(--space-5); background: var(--bg-raised); border: 1px solid var(--warning-muted, rgba(251,191,36,.15)); border-radius: var(--radius-lg); margin-top: var(--space-6); margin-bottom: var(--space-6); }
	.purchase-info { display: flex; align-items: center; gap: var(--space-3); }
	.purchase-title { font-size: var(--text-sm); font-weight: 600; color: var(--fg-base); margin: 0; }
	.purchase-note { font-size: var(--text-xs); color: var(--fg-muted); margin: 0; }
	.detail-actions { display: flex; gap: var(--space-3); margin-bottom: var(--space-6); }

	/* ═══ Responsive ═══ */
	@media (max-width: 768px) {
		.stats-grid-4, .stats-split { grid-template-columns: repeat(2, 1fr); }
		.card-grid-3 { grid-template-columns: 1fr; }
		.card-grid-2 { grid-template-columns: 1fr; }
		.dash-sidebar { display: none; }
		.dash-layout { flex-direction: column; }
		.hide-mobile { display: none; }
		.prompt-card { flex-direction: column; gap: var(--space-3); text-align: center; }
		.prompt-content { text-align: center; }
	}
</style>
