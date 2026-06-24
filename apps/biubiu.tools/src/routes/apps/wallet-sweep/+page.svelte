<script lang="ts">
	import { onMount } from 'svelte';
	import { t, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import Stepper from '$lib/ui/Stepper.svelte';
	import Disclosure from '$lib/ui/Disclosure.svelte';
	import { WalletSweepStore } from '$lib/pda-apps/wallet-sweep/store.svelte';
	import type { Phase } from '$lib/pda-apps/wallet-sweep/types';
	import { fmtAmount, shortAddr } from '$lib/pda-apps/wallet-sweep/format';
	import WalletSweepConfig from '$lib/widgets/WalletSweepConfig.svelte';
	import WalletSweepRun from '$lib/widgets/WalletSweepRun.svelte';
	import WalletSweepDone from '$lib/widgets/WalletSweepDone.svelte';
	import { ShieldCheck, TriangleAlert, X, ScrollText, Trash2 } from '@lucide/svelte';
	import '$lib/pda-apps/wallet-sweep/sweep-ui.css';

	const store = new WalletSweepStore();

	const seoProps = $derived(
		getBaseSEO({
			title: `${t('ws.meta.title')} - BiuBiu Tools`,
			description: t('ws.meta.description'),
			currentLocale: locale.value,
		}),
	);

	const steps: { id: Phase; label: () => string }[] = [
		{ id: 'config', label: () => t('ws.step.config') },
		{ id: 'run', label: () => t('ws.step.run') },
		{ id: 'done', label: () => t('ws.step.done') },
	];
	const stepIndex = $derived(steps.findIndex((s) => s.id === store.phase));
	const stepLabels = $derived(steps.map((s) => s.label()));

	// Only the run→config "go back" transition is meaningful; otherwise the
	// stepper is a calm progress indicator (no misleading dead clicks).
	const canNavigate = $derived(store.phase === 'run' && !store.running);
	function navigateStep(i: number) {
		if (i === 0) store.back();
	}

	onMount(() => {
		void store.probeAll();
		void store.loadHistory();
		store.loadMembership();
	});

	const statusLabel: Record<string, string> = {
		completed: t('ws.status.completed'),
		partial: t('ws.status.partial'),
		failed: t('ws.status.failed'),
	};
	function badgeClass(status: string): string {
		return status === 'completed' ? 'ws-badge-ok' : status === 'partial' ? 'ws-badge-muted' : 'ws-badge-bad';
	}
</script>

<SEO {...seoProps} />
<PageHeader />

<main class="page">
	<header class="hero">
		<h1 class="title">{t('ws.title')}</h1>
		<p class="subtitle">{t('ws.subtitle')}</p>
	</header>

	<Stepper steps={stepLabels} current={stepIndex} onNavigate={canNavigate ? navigateStep : undefined} />

	<div class="ws-note-card">
		<span class="ws-note-icon"><ShieldCheck size={18} /></span>
		<div><strong>{t('ws.security.title')}</strong>{t('ws.security.body')}</div>
	</div>

	{#if store.error}
		<div class="ws-alert" role="alert">
			<span class="ws-alert-icon"><TriangleAlert size={18} /></span>
			<span class="ws-alert-body">{store.error}</span>
			<button class="ws-alert-x" onclick={() => (store.error = null)} aria-label={t('ws.alert.dismiss')}><X size={16} /></button>
		</div>
	{/if}

	{#if store.phase === 'config'}
		<WalletSweepConfig {store} />
	{:else if store.phase === 'run'}
		<WalletSweepRun {store} />
	{:else if store.phase === 'done'}
		<WalletSweepDone {store} />
	{/if}

	<!-- History (shared between config & done) -->
	{#if store.history.length > 0 && (store.phase === 'config' || store.phase === 'done')}
		<section class="ws-card">
			<h2 class="ws-card-title">{t('ws.history.title')}</h2>
			<div class="history">
				{#each store.history as h (h.id)}
					<div class="hist-row">
						<span class="hist-net">{h.networkName}</span>
						<span class="hist-meta">{t('ws.history.summary', { count: h.eoaCount })} · {fmtAmount(BigInt(h.totalNative))} → {shortAddr(h.destination)}</span>
						<span class="ws-badge {badgeClass(h.status)}">{statusLabel[h.status] ?? h.status}</span>
						<button class="hist-x" onclick={() => store.removeHistory(h.id)} aria-label={t('ws.history.delete')}><Trash2 size={14} /></button>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Activity log -->
	{#if store.logs.length > 0}
		<Disclosure title={t('ws.logs.title')} icon={logIcon}>
			<div class="log-list">
				{#each store.logs.slice().reverse() as l (l.ts + l.msg)}
					<div class="log log-{l.level}">{l.msg}</div>
				{/each}
			</div>
		</Disclosure>
	{/if}
</main>

{#snippet logIcon()}<ScrollText size={16} />{/snippet}

<PageFooter />

<style>
	.page {
		max-width: 760px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4) var(--space-16);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	.hero {
		text-align: center;
		padding: var(--space-6) 0 var(--space-1);
	}
	.title {
		margin: 0;
		font-size: var(--text-4xl);
		font-weight: 800;
		letter-spacing: -0.03em;
		color: var(--fg-base);
	}
	.subtitle {
		margin: var(--space-3) auto 0;
		max-width: 520px;
		font-size: var(--text-lg);
		color: var(--fg-muted);
		line-height: var(--leading-snug);
	}
	.history {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.hist-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font-size: var(--text-sm);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--border-subtle);
	}
	.hist-row:last-child {
		border-bottom: none;
	}
	.hist-net {
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.hist-meta {
		color: var(--fg-muted);
		font-size: var(--text-xs);
		margin-right: auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hist-x {
		display: inline-flex;
		border: none;
		background: none;
		color: var(--fg-subtle);
		cursor: pointer;
		padding: 4px;
		border-radius: var(--radius-sm);
		flex-shrink: 0;
	}
	.hist-x:hover {
		color: var(--error);
		background: var(--bg-sunken);
	}
	.log-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 220px;
		overflow-y: auto;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
	.log {
		color: var(--fg-muted);
	}
	.log-ok {
		color: var(--success);
	}
	.log-warn {
		color: var(--warning);
	}
	.log-error {
		color: var(--error);
	}
	@media (max-width: 640px) {
		.page {
			padding: var(--space-4) var(--space-3) var(--space-12);
		}
		.title {
			font-size: var(--text-3xl);
		}
	}
</style>
