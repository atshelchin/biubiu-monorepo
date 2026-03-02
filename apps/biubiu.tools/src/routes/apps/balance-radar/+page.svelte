<script lang="ts">
	import { usePage } from '@shelchin/pagekit/svelte';
	import { ActionBusyError } from '@shelchin/pagekit';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import { t, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import BalanceRadarConfig from '$lib/widgets/BalanceRadarConfig.svelte';
	import BalanceRadarExecution from '$lib/widgets/BalanceRadarExecution.svelte';
	import BalanceRadarResults from '$lib/widgets/BalanceRadarResults.svelte';
	import { balanceRadarPage } from '$lib/pda-apps/balance-radar/page.js';

	const page = usePage(balanceRadarPage);

	// SEO
	const seoProps = $derived(
		getBaseSEO({
			title: t('br.meta.title'),
			description: t('br.meta.description'),
			currentLocale: locale.value,
			jsonLd: {
				type: 'SoftwareApplication' as const,
				data: {
					name: 'Balance Radar',
					description: t('br.meta.description'),
					applicationCategory: 'WebApplication',
					operatingSystem: 'Web Browser',
					offers: { price: 0, priceCurrency: 'USD' },
				},
			},
		}),
	);

	// Handlers
	async function handleStartQuery() {
		if (!page.config.ctx.canExecute) return;

		const addresses = page.config.ctx.addresses
			.filter((a) => a.valid)
			.map((a) => a.value)
			.join(',');

		try {
			await page.execution.run({
				addresses,
				networks: page.config.ctx.selectedNetworks,
			});
		} catch (e) {
			if (e instanceof ActionBusyError) return;
			throw e;
		}
	}
</script>

<SEO {...seoProps} />

<PageHeader />

<main class="page">
	<!-- Header -->
	<header class="page-header" use:fadeInUp={{ delay: 0 }}>
		<h1 class="page-title">{t('br.title')}</h1>
		<p class="page-subtitle">{t('br.subtitle')}</p>
	</header>

	<!-- Config Section -->
	<div use:fadeInUp={{ delay: 50 }}>
		<BalanceRadarConfig
			addresses={page.config.ctx.addresses}
			addressInput={page.config.ctx.addressInput}
			selectedNetworks={page.config.ctx.selectedNetworks}
			availableNetworks={page.config.ctx.availableNetworks}
			validAddressCount={page.config.ctx.validAddressCount}
			invalidAddressCount={page.config.ctx.invalidAddressCount}
			totalQueries={page.config.ctx.totalQueries}
			canExecute={page.config.ctx.canExecute}
			executionStatus={page.execution.ctx.status}
			errorMessage={page.execution.ctx.errorMessage}
			isRunning={page.execution.pending.run}
			onAddressInput={(text) => page.config.setAddresses({ text })}
			onClearAddresses={() => page.config.clearAddresses({})}
			onToggleNetwork={(network) => page.config.toggleNetwork({ network })}
			onSelectAll={() => page.config.selectAllNetworks({})}
			onDeselectAll={() => page.config.deselectAllNetworks({})}
			onStartQuery={handleStartQuery}
		/>
	</div>

	<!-- Execution Section -->
	{#if page.execution.ctx.status === 'running'}
		<div use:fadeInUp={{ delay: 0 }}>
			<BalanceRadarExecution
				progress={page.execution.ctx.progress}
				logs={page.execution.ctx.logs}
			/>
		</div>
	{/if}

	<!-- Results Section -->
	{#if page.execution.ctx.status === 'success'}
		<div use:fadeInUp={{ delay: 0 }}>
			<BalanceRadarResults
				results={page.execution.ctx.results}
				failures={page.execution.ctx.failures}
				duration={page.execution.ctx.duration}
				sortField={page.execution.ctx.sortField}
				sortDirection={page.execution.ctx.sortDirection}
				filterNetwork={page.execution.ctx.filterNetwork}
				searchQuery={page.execution.ctx.searchQuery}
				showFailures={page.execution.ctx.showFailures}
				onSetSortField={(field) => page.execution.setSortField({ field })}
				onSetFilterNetwork={(network) => page.execution.setFilterNetwork({ network })}
				onSetSearchQuery={(query) => page.execution.setSearchQuery({ query })}
				onToggleFailures={() => page.execution.toggleFailures({})}
				onExportCSV={() => page.execution.exportCSV({})}
				onRunAgain={() => page.execution.reset({})}
			/>
		</div>
	{/if}
</main>

<PageFooter />

<style>
	main.page {
		max-width: 860px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
	}

	.page-header {
		text-align: center;
		padding: var(--space-8) 0 var(--space-4);
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

	@media (max-width: 640px) {
		main.page {
			padding: var(--space-4) var(--space-3);
		}

		.page-title {
			font-size: var(--text-3xl);
		}
	}
</style>
