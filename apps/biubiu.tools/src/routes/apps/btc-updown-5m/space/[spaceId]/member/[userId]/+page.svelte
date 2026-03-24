<script lang="ts">
  import { page } from '$app/state';
  import { t } from '$lib/i18n';
  import { fadeInUp } from '$lib/actions/fadeInUp';
  import { routes } from '$lib/updown-v2/routes';
  import { MOCK_SPACE_MEMBERS } from '$lib/updown-v2/mock';
  import { fmt, fmtPct, fmtDate, profitClass, statusDot } from '$lib/updown-v2/utils';
  import { instances } from '$lib/updown-v2/store.svelte';
  import { mockStats, mockHourlyStats, todayStr } from '$lib/updown-v2/mock-detail';
  import { createFormatterCtx } from '$lib/updown-v2/formatter-bridge';
  import HourlyChart from '$lib/updown-shared/components/HourlyChart.svelte';
  import StatsGrid from '$lib/updown-shared/components/StatsGrid.svelte';

  const sharedT = t as unknown as import('$lib/updown-shared/types').TranslateFn;

  const spaceId = $derived(page.params.spaceId ?? '');
  const userId = $derived(page.params.userId ?? '');
  const member = $derived(MOCK_SPACE_MEMBERS[spaceId]?.find((m: { userId: string }) => m.userId === userId));

  // Formatter context for shared components
  const ctx = $derived(createFormatterCtx());

  // Member's instances in this space
  const memberInstances = $derived.by(() => {
    const all = instances.list.filter((i) => i.spaceId === spaceId);
    // For the current mock user, show all instances; for others, show a subset
    if (userId === 'user_shelchin') return all;
    // For other members, show first 1-2 instances as mock
    return all.slice(0, Math.min(all.length, member?.activeInstances ?? 1));
  });

  // Performance stats (mock)
  const stats = $derived(mockStats(userId));
  const hourlyData = $derived(mockHourlyStats(userId, todayStr()));

  // Hourly chart state
  let selectedHour = $state<number | null>(null);
  let isFollowing = $state(false);
</script>

<section class="page-header" use:fadeInUp={{ delay: 0 }}>
  <a class="back-link" href={routes.space(spaceId)}>&larr; Back</a>
  <div class="title-row">
    <h1 class="page-title">{member?.displayName ?? 'User'}</h1>
    {#if member?.tier === 'pro'}<span class="premium-badge">Premium</span>{/if}
    {#if member?.role === 'admin'}<span class="admin-badge">Admin</span>{/if}
  </div>
</section>

{#if member}
  <!-- Stats cards -->
  <div class="stats-grid-4" use:fadeInUp={{ delay: 30 }}>
    <div class="stat-card"><div class="stat-label">Profit</div><div class="stat-value {profitClass(member.totalProfit)}">{fmt(member.totalProfit)}</div></div>
    <div class="stat-card"><div class="stat-label">Win Rate</div><div class="stat-value">{fmtPct(member.winRate)}</div></div>
    <div class="stat-card"><div class="stat-label">Rounds</div><div class="stat-value">{member.totalRounds}</div></div>
    <div class="stat-card"><div class="stat-label">Instances</div><div class="stat-value">{member.activeInstances}</div></div>
  </div>

  <!-- Member info section -->
  <section class="member-info-section" use:fadeInUp={{ delay: 60 }}>
    <div class="info-card">
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Safe Address</span>
          <span class="info-value mono">{member.safeAddress}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Joined</span>
          <span class="info-value">{fmtDate(member.joinedAt)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Tier</span>
          <span class="info-value">
            {#if member.tier === 'pro'}
              <span class="tier-badge tier-pro">Pro</span>
            {:else}
              <span class="tier-badge tier-free">Free</span>
            {/if}
          </span>
        </div>
        <div class="info-item info-item-action">
          <button
            class="follow-btn"
            class:following={isFollowing}
            onclick={() => isFollowing = !isFollowing}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </button>
        </div>
      </div>
    </div>
  </section>

  <!-- Running instances -->
  <section class="section-instances" use:fadeInUp={{ delay: 90 }}>
    <div class="section-row">
      <h2 class="section-title">Running Instances</h2>
    </div>
    {#if memberInstances.length > 0}
      <div class="instance-list">
        {#each memberInstances as inst (inst.id)}
          <a class="instance-card card interactive" href={routes.instance(spaceId, inst.id)}>
            <div class="card-top">
              <div>
                <span class="card-name">{inst.label}</span>
                <div class="instance-meta">
                  <span class="dot {statusDot(inst.status)}"></span>
                  <span class="instance-status">{inst.status}</span>
                  <span class="mode-badge" class:mode-live={inst.mode === 'live'}>{inst.mode}</span>
                </div>
              </div>
            </div>
            <div class="card-metrics">
              <div>
                <span class="metric-label">Today</span>
                <span class="metric-value {profitClass(inst.profits.day)}">{fmt(inst.profits.day)}</span>
              </div>
              <div>
                <span class="metric-label">30d</span>
                <span class="metric-value {profitClass(inst.profits.thirtyDay)}">{fmt(inst.profits.thirtyDay)}</span>
              </div>
              <div>
                <span class="metric-label">Win Rate</span>
                <span class="metric-value">{fmtPct(inst.stats.winRate)}</span>
              </div>
              <div>
                <span class="metric-label">Rounds</span>
                <span class="metric-value">{inst.stats.rounds}</span>
              </div>
            </div>
          </a>
        {/each}
      </div>
    {:else}
      <div class="empty-inline">
        <p>No active instances in this space.</p>
      </div>
    {/if}
  </section>

  <!-- Performance summary -->
  <section class="section-performance" use:fadeInUp={{ delay: 120 }}>
    <div class="section-row">
      <h2 class="section-title">Performance Summary</h2>
    </div>
    <StatsGrid {stats} {selectedHour} {ctx} t={sharedT} onClearHour={() => selectedHour = null} />
    <HourlyChart
      hourlyData={hourlyData}
      filterDateFrom={todayStr()}
      {selectedHour}
      {ctx}
      t={sharedT}
      titleKey="btcUpdown.chart.hourlyProfit"
      onSelectHour={(h) => selectedHour = h}
    />
  </section>
{:else}
  <div class="empty-state"><p class="empty-title">User not found</p></div>
{/if}

<style>
  /* ═══ Member info card ═══ */
  .member-info-section {
    margin-bottom: var(--space-6);
  }
  .info-card {
    background: var(--bg-raised);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-lg);
    padding: var(--space-4) var(--space-5);
  }
  .info-grid {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    flex-wrap: wrap;
  }
  .info-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .info-item-action {
    margin-left: auto;
  }
  .info-label {
    font-size: var(--text-xs);
    color: var(--fg-subtle);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .info-value {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--fg-base);
  }
  .info-value.mono {
    font-family: var(--font-mono);
    letter-spacing: 0.02em;
  }
  .tier-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
  }
  .tier-pro {
    background: var(--accent-subtle, rgba(96,165,250,.08));
    color: var(--accent);
  }
  .tier-free {
    background: rgba(255, 255, 255, 0.05);
    color: var(--fg-muted);
  }

  /* ═══ Instance list ═══ */
  .section-instances {
    margin-bottom: var(--space-6);
  }
  .instance-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .instance-card {
    display: block;
    text-decoration: none;
    color: inherit;
  }
  .instance-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }
  .instance-status {
    font-size: var(--text-xs);
    color: var(--fg-muted);
    text-transform: capitalize;
  }

  /* ═══ Performance section ═══ */
  .section-performance {
    margin-bottom: var(--space-8);
  }

  /* ═══ Empty inline ═══ */
  .empty-inline {
    padding: var(--space-6);
    text-align: center;
    color: var(--fg-muted);
    font-size: var(--text-sm);
    background: var(--bg-raised);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-lg);
  }
  .empty-inline p {
    margin: 0;
  }

  @media (max-width: 768px) {
    .info-grid {
      gap: var(--space-4);
    }
    .info-item-action {
      margin-left: 0;
      width: 100%;
    }
  }
</style>
