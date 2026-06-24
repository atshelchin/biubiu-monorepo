<script lang="ts">
	import { onMount } from 'svelte';
	import { usePage } from '@shelchin/pagekit/svelte';
	import { ActionBusyError } from '@shelchin/pagekit';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import { RotateCw, TriangleAlert, X } from '@lucide/svelte';
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

	let execEl = $state<HTMLElement>();
	let resultsEl = $state<HTMLElement>();
	let startError = $state('');
	let resumeDismissed = $state('');

	onMount(() => {
		page.config.hydrate({});
		page.execution.refreshScans({});
	});

	// A scan that stopped before reaching its end block — its progress is safely
	// persisted (OPFS/IndexedDB), so we surface it up top and offer to continue,
	// instead of leaving a long interrupted scan stranded in the saved list.
	const unfinished = $derived(
		page.execution.ctx.status === 'running'
			? undefined
			: page.execution.ctx.savedScans.find(
					(s) => (s.lastScannedBlock || 0) < s.toBlock && s.scanId !== resumeDismissed
				)
	);

	function resumeUnfinished() {
		if (unfinished) page.execution.resumeScan({ scanId: unfinished.scanId });
	}

	// Surface either a failed scan or a config that couldn't be built — never a
	// silently dead button.
	const alertMessage = $derived(
		startError || (page.execution.ctx.status === 'error' ? page.execution.ctx.errorMessage : '')
	);

	function dismissAlert() {
		startError = '';
		if (page.execution.ctx.status === 'error') page.execution.reset({});
	}

	// Bring the progress (on start) and results (on completion) into view so the
	// feedback is never stranded below the fold.
	let prevStatus = 'idle';
	$effect(() => {
		const status = page.execution.ctx.status;
		if (status === prevStatus) return;
		const reduce =
			typeof window !== 'undefined' &&
			window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth';
		if (status === 'running')
			requestAnimationFrame(() => execEl?.scrollIntoView({ behavior, block: 'start' }));
		else if (status === 'success' && prevStatus === 'running')
			requestAnimationFrame(() => resultsEl?.scrollIntoView({ behavior, block: 'start' }));
		prevStatus = status;
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
					offers: { price: 0, priceCurrency: 'USD' }
				}
			}
		})
	);

	async function handleApplyPreset(id: string) {
		const res = await page.config.applyPreset({ id });
		if (res && 'chainId' in res && res.chainId) {
			await page.config.selectChain({ chainId: res.chainId });
		}
	}

	async function handleStart() {
		startError = '';
		const built = buildScanInput(page.config.ctx);
		if (!built.ok || !built.input) {
			startError = t('es.cfg.fixConfig');
			return;
		}
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

	{#if unfinished}
		<div class="resume-bar" use:fadeInUp={{ delay: 0 }}>
			<RotateCw size={18} class="resume-icon" />
			<span class="resume-text">{t('es.resume.banner', { name: unfinished.name })}</span>
			<button class="resume-btn" onclick={resumeUnfinished}>{t('es.resume.continue')}</button>
			<button
				class="resume-x"
				onclick={() => (resumeDismissed = unfinished.scanId)}
				aria-label={t('es.resume.dismiss')}><X size={16} /></button
			>
		</div>
	{/if}

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
		<div bind:this={execEl} use:fadeInUp={{ delay: 0 }}>
			<EventScannerExecution
				progress={page.execution.ctx.progress}
				logs={page.execution.ctx.logs}
			/>
		</div>
	{/if}

	{#if alertMessage}
		<div class="alert" role="alert">
			<TriangleAlert size={18} class="alert-icon" />
			<div class="alert-body">
				<span class="alert-title">{t('es.alert.scanFailed')}</span>
				<span class="alert-detail">{alertMessage}</span>
			</div>
			<button class="alert-dismiss" onclick={dismissAlert} aria-label={t('es.alert.dismiss')}>
				<X size={16} />
			</button>
		</div>
	{/if}

	{#if page.execution.ctx.status === 'success' || page.execution.ctx.savedScans.length > 0}
		<div bind:this={resultsEl} use:fadeInUp={{ delay: 0 }}>
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
				onFillGaps={(scanId) => page.execution.fillGaps({ scanId })}
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
	.resume-bar {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		background: var(--accent-subtle);
		border: 1px solid var(--accent-muted);
		border-radius: var(--radius-lg);
		padding: var(--space-3) var(--space-4);
	}
	.resume-bar :global(.resume-icon) {
		flex: 0 0 auto;
		color: var(--accent);
	}
	.resume-text {
		flex: 1;
		min-width: 0;
		font-size: var(--text-sm);
		color: var(--fg-base);
	}
	.resume-btn {
		flex: 0 0 auto;
		padding: var(--space-2) var(--space-4);
		background: var(--accent);
		border: 1px solid var(--accent);
		border-radius: var(--radius-md);
		color: var(--accent-fg);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		cursor: pointer;
		white-space: nowrap;
		transition: background var(--motion-fast) var(--easing);
	}
	.resume-btn:hover {
		background: var(--accent-hover);
	}
	.resume-x {
		flex: 0 0 auto;
		display: inline-flex;
		padding: 2px;
		background: transparent;
		border: none;
		color: var(--fg-subtle);
		cursor: pointer;
		border-radius: var(--radius-sm);
	}
	.resume-x:hover {
		color: var(--fg-base);
	}
	.alert {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		background: var(--error-subtle);
		border: 1px solid var(--error-muted);
		border-radius: var(--radius-lg);
		padding: var(--space-3) var(--space-4);
	}
	.alert :global(.alert-icon) {
		flex: 0 0 auto;
		margin-top: 1px;
		color: var(--error);
	}
	.alert-body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}
	.alert-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.alert-detail {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		word-break: break-word;
	}
	.alert-dismiss {
		flex: 0 0 auto;
		display: inline-flex;
		padding: 2px;
		background: transparent;
		border: none;
		color: var(--fg-subtle);
		cursor: pointer;
		border-radius: var(--radius-sm);
	}
	.alert-dismiss:hover {
		color: var(--fg-base);
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
