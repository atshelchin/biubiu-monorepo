<script lang="ts">
	import { onMount } from 'svelte';
	import { usePage } from '@shelchin/pagekit/svelte';
	import { ActionBusyError } from '@shelchin/pagekit';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import { t, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import EventScannerConfig from '$lib/widgets/EventScannerConfig.svelte';
	import EventScannerExecution from '$lib/widgets/EventScannerExecution.svelte';
	import EventScannerResults from '$lib/widgets/EventScannerResults.svelte';
	import { eventScannerPage } from '$lib/pda-apps/event-scanner/page.js';
	import { buildScanInput } from '$lib/pda-apps/event-scanner/modules/config.js';

	const page = usePage(eventScannerPage);

	onMount(() => {
		page.config.hydrate({});
		page.execution.refreshScans({});
	});

	const seoProps = $derived(
		getBaseSEO({
			title: t('es.meta.title'),
			description: t('es.meta.description'),
			currentLocale: locale.value,
			jsonLd: {
				type: 'SoftwareApplication' as const,
				data: {
					name: 'Event Scanner',
					description: t('es.meta.description'),
					applicationCategory: 'WebApplication',
					operatingSystem: 'Web Browser',
					offers: { price: 0, priceCurrency: 'USD' },
				},
			},
		}),
	);

	async function handleApplyPreset(id: string) {
		const res = await page.config.applyPreset({ id });
		if (res && 'chainId' in res && res.chainId) {
			await page.config.selectChain({ chainId: res.chainId });
		}
	}

	async function handleStart() {
		const built = buildScanInput(page.config.ctx);
		if (!built.ok || !built.input) return;
		try {
			await page.execution.run(built.input);
		} catch (e) {
			if (e instanceof ActionBusyError) return;
			throw e;
		}
	}
</script>

<SEO {...seoProps} />

<PageHeader />

<main class="page">
	<header class="page-header" use:fadeInUp={{ delay: 0 }}>
		<h1 class="page-title">{t('es.title')}</h1>
		<p class="page-subtitle">{t('es.subtitle')}</p>
	</header>

	<div use:fadeInUp={{ delay: 50 }}>
		<EventScannerConfig
			cfg={page.config.ctx}
			isRunning={page.execution.pending.run}
			onSearchChains={(q) => page.config.searchChains({ query: q })}
			onSelectChain={(chainId) => page.config.selectChain({ chainId })}
			onClearChain={() => page.config.clearChain({})}
			onSwitchRpc={(url) => page.config.switchRpc({ url })}
			onSetCustomRpcInput={(value) => page.config.setCustomRpcInput({ value })}
			onApplyCustomRpc={() => page.config.applyCustomRpc({ url: page.config.ctx.customRpcInput })}
			onSetContract={(address) => page.config.setContract({ address })}
			onLoadAbi={(text) => page.config.loadAbi({ text })}
			onAutoFetchAbi={() => page.config.autoFetchAbi({})}
			onDetectProxy={() => page.config.detectProxy({})}
			onSelectEvent={(signature) => page.config.selectEvent({ signature })}
			onSetIndexedValue={(paramIndex, value) => page.config.setIndexedValue({ paramIndex, value })}
			onSetWalletTrack={(enabled, address) => page.config.setWalletTrack({ enabled, address })}
			onSetRange={(patch) => page.config.setRange(patch)}
			onSetLive={(live, intervalSec) => page.config.setLive({ live, intervalSec })}
			onSetScanName={(name) => page.config.setScanName({ name })}
			onSetEtherscanKey={(key) => page.config.setEtherscanKey({ key })}
			onApplyPreset={handleApplyPreset}
			onStart={handleStart}
		/>
	</div>

	{#if page.execution.ctx.status === 'running'}
		<div use:fadeInUp={{ delay: 0 }}>
			<EventScannerExecution progress={page.execution.ctx.progress} logs={page.execution.ctx.logs} />
		</div>
	{/if}

	{#if page.execution.ctx.status === 'error'}
		<p class="error-banner">{page.execution.ctx.errorMessage}</p>
	{/if}

	{#if page.execution.ctx.status === 'success' || page.execution.ctx.savedScans.length > 0}
		<div use:fadeInUp={{ delay: 0 }}>
			<EventScannerResults
				currentScan={page.execution.ctx.currentScan}
				events={page.execution.ctx.events}
				eventTotal={page.execution.ctx.eventTotal}
				page={page.execution.ctx.page}
				order={page.execution.ctx.order}
				savedScans={page.execution.ctx.savedScans}
				liveActive={page.execution.ctx.liveActive}
				onSetPage={(p) => page.execution.setPage({ page: p })}
				onSetOrder={(order) => page.execution.setOrder({ order })}
				onExportCSV={() => page.execution.exportCSV({})}
				onExportJSON={() => page.execution.exportJSON({})}
				onLoadScan={(scanId) => page.execution.loadScan({ scanId })}
				onResumeScan={(scanId) => page.execution.resumeScan({ scanId })}
				onDeleteScan={(scanId) => page.execution.deleteScan({ scanId })}
				onStopLive={() => page.execution.stopLive({})}
				onRunAgain={() => page.execution.reset({})}
			/>
		</div>
	{/if}
</main>

<PageFooter />

<style>
	main.page {
		max-width: 920px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}
	.page-header {
		text-align: center;
		padding: var(--space-8) 0 var(--space-2);
	}
	.page-title {
		font-size: var(--text-4xl);
		font-weight: var(--weight-bold);
		color: var(--fg-base);
		line-height: var(--leading-tight);
		margin: 0;
	}
	.page-subtitle {
		font-size: var(--text-lg);
		color: var(--fg-muted);
		margin: var(--space-2) 0 0;
		line-height: var(--leading-normal);
	}
	.error-banner {
		background: var(--error-muted, rgba(248, 113, 113, 0.12));
		color: var(--error);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		margin: 0;
	}
	@media (max-width: 640px) {
		main.page {
			padding: var(--space-4) var(--space-3);
		}
		.page-title {
			font-size: var(--text-3xl);
		}
	}
</style>
