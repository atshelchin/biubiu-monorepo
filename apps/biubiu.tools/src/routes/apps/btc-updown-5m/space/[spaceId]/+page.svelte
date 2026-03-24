<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { t, formatNumber } from '$lib/i18n';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import { routes } from '$lib/updown-v2/routes';
	import { profitClass, fmt, fmtShort, fmtPct, fmtDate, statusDot } from '$lib/updown-v2/utils';
	import { spaces, instances, market, spaceTab, modeFilter } from '$lib/updown-v2/store.svelte';
	import { MOCK_SPACE_MEMBERS, MOCK_SPACE_STATS, MOCK_SPACE_SETTINGS } from '$lib/updown-v2/mock';

	const spaceId = $derived(page.params.spaceId ?? '');

	const space = $derived(spaces.list.find(s => s.id === spaceId));
	const spaceInstances = $derived(instances.list.filter(i => i.spaceId === spaceId));
	const spaceMembers = $derived(MOCK_SPACE_MEMBERS[spaceId ?? ''] ?? []);
	const spaceSt = $derived(MOCK_SPACE_STATS[spaceId ?? '']);
	const spaceSettings = $derived(MOCK_SPACE_SETTINGS[spaceId ?? '']);
	const isAdmin = $derived(spaceMembers.some(m => m.userId === 'user_shelchin' && m.role === 'admin'));
	const spaceStrategies = $derived(market.list);
	const sortedMembers = $derived([...spaceMembers].sort((a, b) => b.totalProfit - a.totalProfit));
</script>

<section class="page-header">
	<a class="back-link" href={routes.hub()}>&larr; Back</a>
	<div class="title-row">
		<h1 class="page-title">{space?.name ?? 'Space'}</h1>
		<span class="mode-badge" class:mode-live={space?.allowLiveTrading}>{space?.allowLiveTrading ? 'Live' : 'Sandbox'}</span>
		{#if space?.online}<span class="dot dot-run" style="margin-left: var(--space-1);"></span>{/if}
	</div>
	<p class="page-desc">{space?.endpointUrl}</p>
</section>

<!-- 4-Tab bar -->
<div class="tab-bar" use:fadeInUp={{ delay: 30 }}>
	<button class="tab" class:active={spaceTab.active === 0} onclick={() => spaceTab.active = 0}>{t('updown5m.space.overview')}</button>
	<button class="tab" class:active={spaceTab.active === 1} onclick={() => spaceTab.active = 1}>{t('updown5m.space.strategies')}</button>
	<button class="tab" class:active={spaceTab.active === 2} onclick={() => spaceTab.active = 2}>{t('updown5m.space.members')}</button>
	<button class="tab" class:active={spaceTab.active === 3} onclick={() => spaceTab.active = 3}>{isAdmin ? t('updown5m.space.admin') : t('updown5m.space.admin.claimTab')}</button>
</div>

<div class="tab-content" use:fadeInUp={{ delay: 60 }}>
	{#if spaceTab.active === 0}
		<!-- Overview -->
		{#if spaceSt}
			<div class="stats-grid-4">
				<div class="stat-card"><div class="stat-label">{t('updown5m.space.stats.users')}</div><div class="stat-value">{formatNumber(spaceSt.totalUsers)}</div></div>
				<div class="stat-card"><div class="stat-label">{t('updown5m.space.stats.active')}</div><div class="stat-value">{spaceSt.activeInstances}</div></div>
				<div class="stat-card"><div class="stat-label">{t('updown5m.space.stats.todayProfit')}</div><div class="stat-value {profitClass(spaceSt.todayProfit)}">{fmt(spaceSt.todayProfit)}</div><div class="stat-sub">{spaceSt.totalRoundsToday} rounds</div></div>
				<div class="stat-card"><div class="stat-label">{t('updown5m.space.stats.avgWr')}</div><div class="stat-value">{fmtPct(spaceSt.avgWinRate)}</div><div class="stat-sub">{spaceSt.topStrategy}</div></div>
			</div>
		{/if}

		<!-- My Instances -->
		<div class="section-row"><h2 class="section-title">{t('updown5m.space.myInstances')}</h2></div>
		{#if spaceInstances.length === 0}
			<div class="empty-state" style="padding: var(--space-8) 0;">
				<p class="empty-title">{t('updown5m.empty.title')}</p>
				<p class="empty-desc">{t('updown5m.empty.desc')}</p>
				<div class="empty-actions">
					<button class="btn-accent" onclick={() => goto(routes.editor())}>{t('updown5m.empty.create')}</button>
					<button class="btn-secondary" onclick={() => (spaceTab.active = 1)}>{t('updown5m.space.strategies')}</button>
				</div>
			</div>
		{:else}
			<div class="inst-list">
				{#each spaceInstances as inst (inst.id)}
					<a class="inst-card" href={routes.instance(spaceId, inst.id)}>
						<div class="inst-top">
							<span class="inst-name">{inst.label}</span>
							<span class="mode-badge" class:mode-live={inst.mode === 'live'}>{inst.mode === 'live' ? 'LIVE' : 'SANDBOX'}</span>
						</div>
						<div class="inst-profit {profitClass(inst.stats.profit)}">{fmt(inst.stats.profit)}</div>
						<div class="inst-meta">
							<span class="dot {statusDot(inst.status)}"></span>
							{inst.status} &middot; {fmtPct(inst.stats.winRate)} &middot; {inst.stats.rounds}r
						</div>
						<div class="inst-periods">
							<span class="inst-period"><span class="inst-period-label">1h</span> <span class={profitClass(inst.profits.hour)}>{fmtShort(inst.profits.hour)}</span></span>
							<span class="inst-period"><span class="inst-period-label">{t('updown5m.period.today')}</span> <span class={profitClass(inst.profits.day)}>{fmtShort(inst.profits.day)}</span></span>
							<span class="inst-period"><span class="inst-period-label">30d</span> <span class={profitClass(inst.profits.thirtyDay)}>{fmtShort(inst.profits.thirtyDay)}</span></span>
						</div>
					</a>
				{/each}
			</div>
		{/if}

	{:else if spaceTab.active === 1}
		<!-- Strategies (space marketplace) -->
		{#if spaceStrategies.length === 0}
			<div class="empty-state"><p class="empty-title">{t('updown5m.space.noStrategies')}</p></div>
		{:else}
			<div class="mkt-wrap">
				<table class="mkt-table">
					<thead>
						<tr>
							<th>#</th>
							<th>{t('updown5m.table.strategy')}</th>
							<th>{t('updown5m.period.today')}</th>
							<th>{t('updown5m.table.90d')}</th>
							<th>{t('updown5m.table.created')}</th>
						</tr>
					</thead>
					<tbody>
						{#each spaceStrategies as s, i (s.id)}
							<tr class="mkt-row" onclick={() => goto(routes.strategy(spaceId, s.id))}>
								<td class="mkt-rank">{i + 1}</td>
								<td class="mkt-name">
									<strong>{s.name}</strong>
									<span class="mkt-author">{s.author.name}</span>
								</td>
								<td class="mkt-period-cell">
									<span class="mkt-profit {profitClass(s.performance.today.profit)}">{fmt(s.performance.today.profit)}</span>
									<span class="mkt-meta">{s.performance.today.rounds}r &middot; {fmtPct(s.performance.today.winRate)}</span>
								</td>
								<td class="mkt-period-cell">
									<span class="mkt-profit {profitClass(s.performance.ninetyDay.profit)}">{fmt(s.performance.ninetyDay.profit)}</span>
									<span class="mkt-meta">{s.performance.ninetyDay.rounds}r &middot; {fmtPct(s.performance.ninetyDay.winRate)}</span>
								</td>
								<td class="mkt-created">{fmtDate(s.createdAt)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

	{:else if spaceTab.active === 2}
		<!-- Members / Leaderboard -->
		<div class="section-row"><h2 class="section-title">{t('updown5m.space.leaderboard')}</h2></div>
		<div class="members-list">
			{#each sortedMembers as member, rank (member.userId)}
				<div class="member-card">
					<span class="member-rank">{rank + 1}</span>
					<div class="member-info">
						<div class="member-top">
							<a class="member-name" href={routes.member(spaceId, member.userId)}>{member.displayName}</a>
							{#if member.tier === 'pro'}<span class="premium-badge">Premium</span>{/if}
							{#if member.role === 'admin'}<span class="admin-badge">Admin</span>{/if}
						</div>
						<div class="member-stats">
							<span class="member-stat"><span class="member-stat-label">{t('updown5m.space.member.profit')}</span> <span class={profitClass(member.totalProfit)}>{fmt(member.totalProfit)}</span></span>
							<span class="member-stat"><span class="member-stat-label">{t('updown5m.space.member.wr')}</span> {fmtPct(member.winRate)}</span>
							<span class="member-stat"><span class="member-stat-label">{t('updown5m.space.member.rounds')}</span> {formatNumber(member.totalRounds)}</span>
							<span class="member-stat"><span class="member-stat-label">{t('updown5m.space.member.instances')}</span> {member.activeInstances}</span>
						</div>
						<div class="member-footer">
							<span class="member-addr">{member.safeAddress}</span>
							<span class="member-joined">{t('updown5m.space.member.joined')} {fmtDate(member.joinedAt)}</span>
						</div>
					</div>
					<button class="follow-btn" class:following={member.isFollowing} onclick={(e) => { e.stopPropagation(); member.isFollowing = !member.isFollowing; }}>
						{member.isFollowing ? t('updown5m.space.member.following') : t('updown5m.space.member.follow')}
					</button>
				</div>
			{/each}
		</div>

	{:else if spaceTab.active === 3}
		<!-- Admin / Claim -->
		<div class="admin-section">
			{#if isAdmin && spaceSettings}
				<!-- Admin settings (only visible to admins) -->
				<div class="admin-group">
					<div class="admin-row">
						<span class="admin-label">{t('updown5m.space.admin.live')}</span>
						<span class="admin-value">{spaceSettings.allowLiveTrading ? 'ON' : 'OFF'}</span>
					</div>
					<div class="admin-row">
						<span class="admin-label">{t('updown5m.space.admin.maxFree')}</span>
						<span class="admin-value">{spaceSettings.maxFreeInstances}</span>
					</div>
					<div class="admin-row">
						<span class="admin-label">{t('updown5m.space.admin.maxMember')}</span>
						<span class="admin-value">{spaceSettings.maxMemberInstances}</span>
					</div>
				</div>

				<div class="section-row" style="margin-top: var(--space-6);"><h2 class="section-title">{t('updown5m.space.admin.codes')}</h2></div>
				<div class="admin-codes">
					{#each spaceSettings.adminCodes as code (code.code)}
						<div class="admin-code-card">
							<div class="admin-code-top">
								<span class="admin-code-value">{code.code}</span>
								<span class="admin-code-label">{code.label}</span>
							</div>
							<div class="admin-code-status">
								{#if code.linkedUser}
									<span class="dot dot-run"></span> {t('updown5m.space.admin.codeLinked')}: {code.linkedUser}
								{:else}
									<span class="dot dot-stop"></span> {t('updown5m.space.admin.codeUnlinked')}
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Admin code claim (visible to all members) -->
			<div class="admin-claim">
				<h2 class="section-title">{isAdmin ? t('updown5m.space.admin.codes') : t('updown5m.space.admin.claimTitle')}</h2>
				<p class="admin-claim-desc">{t('updown5m.space.admin.enterCode')}</p>
				<div class="admin-claim-row">
					<input type="text" class="admin-claim-input" placeholder="ADM-XXX-XXXX" />
					<button class="btn-accent btn-sm">Claim</button>
				</div>
			</div>
		</div>
	{/if}
</div>
