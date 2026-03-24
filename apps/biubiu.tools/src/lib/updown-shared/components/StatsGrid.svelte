<script lang="ts">
	import type { Stats, WalletInfo, PolymarketStats } from '../types.js';
	import type { FormatterContext, TranslateFn } from '../types.js';
	import { fmtProfit, fmtPct } from '../formatters.js';
	import { fadeInUp } from '$lib/actions/fadeInUp';

	interface Props {
		stats: Stats;
		selectedHour: number | null;
		ctx: FormatterContext;
		t: TranslateFn;
		onClearHour?: () => void;
		wallet?: WalletInfo | null;
		polymarketStats?: PolymarketStats | null;
	}

	let { stats, selectedHour, ctx, t, onClearHour, wallet, polymarketStats }: Props = $props();

	const hasLiveCards = $derived(!!wallet || !!polymarketStats);

	function shortAddr(addr: string): string {
		if (addr.length <= 10) return addr;
		return addr.slice(0, 6) + '...' + addr.slice(-4);
	}
</script>

{#if selectedHour !== null}
	<div class="stats-hour-badge">
		<span
			>{String(selectedHour).padStart(2, '0')}:00 – {String(selectedHour).padStart(2, '0')}:59</span
		>
		<button class="stats-hour-clear" onclick={() => onClearHour?.()}>✕</button>
	</div>
{/if}
<section class="stats-grid" class:stats-grid-live={hasLiveCards} use:fadeInUp={{ delay: 45 }}>
	{#if wallet}
		<div class="stat-card glass-card wallet-card">
			<span class="stat-label">{t('btcUpdown.stats.wallet')}</span>
			<span class="stat-value highlight">{ctx.formatCurrency(wallet.usdcBalance * (ctx.exchangeRate ?? 1))}</span>
			<span class="stat-sub stat-sub-rows">
				<span>{t('btcUpdown.stats.portfolio')}: {ctx.formatCurrency(wallet.portfolioValue * (ctx.exchangeRate ?? 1))}</span>
				<a class="wallet-addr" href="https://polymarket.com/profile/{wallet.safeAddress}" target="_blank" rel="noopener">
					{shortAddr(wallet.safeAddress)} ↗
				</a>
			</span>
		</div>
	{/if}
	{#if polymarketStats}
		<div class="stat-card glass-card pm-card">
			<span class="stat-label">{t('btcUpdown.stats.pmStats')}</span>
			<span class="stat-value" class:positive={polymarketStats.totalProfit >= 0} class:negative={polymarketStats.totalProfit < 0}>
				{fmtProfit(ctx, polymarketStats.totalProfit)}
			</span>
			<span class="stat-sub stat-sub-rows">
				<span>{fmtPct(ctx, polymarketStats.winRate)} · {polymarketStats.wins}W/{polymarketStats.losses}L</span>
				<span>{polymarketStats.rounds}r · {t('btcUpdown.stats.traded')}: {ctx.formatCurrency(polymarketStats.totalTraded * (ctx.exchangeRate ?? 1))}</span>
			</span>
		</div>
	{/if}
	<div class="stat-card glass-card">
		<span class="stat-label">{t('btcUpdown.stats.winRate')}</span>
		<span class="stat-value highlight">{fmtPct(ctx, stats.winRate)}</span>
		<span class="stat-sub stat-sub-rows">
			<span>{stats.wins}{t('btcUpdown.stats.wins')}</span>
			<span>{stats.losses}{t('btcUpdown.stats.losses')}</span>
		</span>
	</div>
	<div class="stat-card glass-card">
		<span class="stat-label">{t('btcUpdown.stats.totalProfit')}</span>
		<span
			class="stat-value"
			class:positive={stats.totalProfit >= 0}
			class:negative={stats.totalProfit < 0}
		>
			{fmtProfit(ctx, stats.totalProfit)}
		</span>
		<span class="stat-sub stat-sub-rows">
			<span>{t('btcUpdown.stats.avgProfit')}</span>
			<span class:positive={stats.avgProfit >= 0} class:negative={stats.avgProfit < 0}
				>{fmtProfit(ctx, stats.avgProfit)}</span
			>
		</span>
	</div>
	<div class="stat-card glass-card">
		<span class="stat-label">{t('btcUpdown.stats.totalRounds')}</span>
		<span class="stat-value">{stats.totalRounds}</span>
		<span class="stat-sub stat-sub-rows">
			<span>{stats.entered} {t('btcUpdown.stats.entered')}</span>
			<span>{stats.skipped} {t('btcUpdown.stats.skipped')}</span>
		</span>
	</div>
	<div class="stat-card glass-card">
		<span class="stat-label">{t('btcUpdown.stats.streak')}</span>
		<span
			class="stat-value"
			class:positive={stats.currentStreak > 0}
			class:negative={stats.currentStreak < 0}
		>
			{stats.currentStreak > 0 ? `+${stats.currentStreak}` : stats.currentStreak}
		</span>
		<span class="stat-sub stat-sub-rows">
			<span
				>{t('btcUpdown.stats.best')}: <span class="positive"
					>{fmtProfit(ctx, stats.bestRound)}</span
				></span
			>
			<span
				>{t('btcUpdown.stats.worst')}: <span class:positive={stats.worstRound >= 0} class:negative={stats.worstRound < 0}
					>{fmtProfit(ctx, stats.worstRound)}</span
				></span
			>
		</span>
	</div>
</section>

<style>
	.stats-hour-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		margin-bottom: var(--space-1);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--accent);
		background: var(--accent-subtle);
		border: 1px solid var(--accent-muted);
		border-radius: var(--radius-full);
	}
	.stats-hour-clear {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		padding: 0;
		border: none;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--accent);
		cursor: pointer;
		font-size: 10px;
		line-height: 1;
		opacity: 0.6;
		transition: opacity 0.15s var(--easing);
	}
	.stats-hour-clear:hover {
		opacity: 1;
	}
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-3);
		margin-bottom: var(--space-2);
	}
	.stats-grid-live {
		grid-template-columns: repeat(3, 1fr);
	}
	.stat-card {
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.stat-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.stat-value {
		font-size: var(--text-xl);
		font-weight: var(--weight-bold);
		color: var(--fg-base);
		font-family: var(--font-mono, ui-monospace, monospace);
	}
	.stat-value.highlight {
		color: var(--accent);
	}
	.stat-sub {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-family: var(--font-mono, ui-monospace, monospace);
	}
	.stat-sub-rows {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.glass-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}
	.positive {
		color: #34d399;
	}
	.negative {
		color: #f87171;
	}
	:global([data-theme='light']) .glass-card {
		background: rgba(0, 0, 0, 0.02);
		border: 1px solid rgba(0, 0, 0, 0.08);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	}
	:global([data-theme='light']) .positive {
		color: #059669;
	}
	:global([data-theme='light']) .negative {
		color: #dc2626;
	}
	/* Wallet card */
	.wallet-addr {
		color: var(--accent);
		text-decoration: none;
		transition: opacity var(--motion-fast) var(--easing);
	}
	.wallet-addr:hover {
		opacity: 0.7;
	}
	@media (max-width: 768px) {
		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.stats-grid-live {
			grid-template-columns: repeat(2, 1fr);
		}
		.stat-value {
			font-size: var(--text-lg);
		}
	}
</style>
