<script lang="ts">
	import { t, localizeHref, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import ChainSearch from '$lib/widgets/ChainSearch.svelte';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import SponsorPromo from '$lib/widgets/SponsorPromo.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import { browser } from '$app/environment';
	import {
		Wallet,
		Globe,
		ExternalLink,
		Copy,
		Check,
		Pencil,
		Zap,
		X,
		LoaderCircle,
		TriangleAlert
	} from '@lucide/svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		DEFAULT_CHAIN_LOGO,
		getPublicRpcEndpoints,
		isTestableRpc,
		latencyTier,
		probeRpcLatency,
		addChainToWallet,
		type RpcProbe
	} from '$lib/chains';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const SITE_URL = 'https://biubiu.tools';

	let copiedIndex = $state<number | null>(null);
	let logoError = $state(false);
	const rpcLatencies = new SvelteMap<string, RpcProbe>();
	let addStatus = $state<'idle' | 'adding' | 'added'>('idle');
	let addError = $state<string | null>(null);

	// Confirmation timers ("copied ✓" / "added ✓"), tracked so a rapid repeat or a
	// navigation can cancel the pending reset instead of clearing the new one early.
	let copyTimer: ReturnType<typeof setTimeout> | undefined;
	let addTimer: ReturnType<typeof setTimeout> | undefined;

	const publicRpcs = $derived(data.chain ? getPublicRpcEndpoints(data.chain.rpc ?? []) : []);

	// Sort: fastest successes first, then still-probing, then untestable, then failed.
	const sortedRpcs = $derived.by(() => {
		const rank = (rpc: string): number => {
			const probe = rpcLatencies.get(rpc);
			if (probe?.status === 'success') return 0;
			if (probe?.status === 'pending') return 1;
			if (!isTestableRpc(rpc)) return 2;
			return 3; // error
		};
		return [...publicRpcs].sort((a, b) => {
			const ra = rank(a);
			const rb = rank(b);
			if (ra !== rb) return ra - rb;
			if (ra === 0) {
				return (rpcLatencies.get(a)!.latency ?? 0) - (rpcLatencies.get(b)!.latency ?? 0);
			}
			return 0;
		});
	});

	// Fastest healthy endpoint — highlighted with the "Fastest" pill (may be ws://).
	const bestRpc = $derived(
		sortedRpcs.find((rpc) => rpcLatencies.get(rpc)?.status === 'success') ?? publicRpcs[0]
	);

	// Endpoint handed to the wallet: wallets only accept http(s) for adding a chain,
	// so prefer the fastest healthy http(s) one, then any http(s).
	const walletRpc = $derived(
		sortedRpcs.find(
			(rpc) => /^https?:\/\//i.test(rpc) && rpcLatencies.get(rpc)?.status === 'success'
		) ??
			publicRpcs.find((rpc) => /^https?:\/\//i.test(rpc)) ??
			''
	);

	const seoProps = $derived(
		data.chain
			? getBaseSEO({
					title: t('chains.title', { name: data.chain.name }),
					description: t('chains.description', { name: data.chain.name }),
					currentLocale: locale.value,
					// Breadcrumb trail (BiuBiu Tools › Chains › <chain>) — earns the
					// breadcrumb display in search results and reinforces site structure.
					jsonLd: {
						type: 'BreadcrumbList',
						data: {
							items: [
								{ name: 'BiuBiu Tools', url: SITE_URL },
								{ name: 'Chains', url: `${SITE_URL}/chains` },
								{ name: data.chain.name, url: `${SITE_URL}/chains/${data.chain.chainId}` }
							]
						}
					}
				})
			: getBaseSEO({
					title: t('chains.notFound'),
					description: t('chains.notFound.description', { chainId: data.chainId }),
					currentLocale: locale.value
				})
	);

	// Reset per-chain UI state when the route param changes: SvelteKit reuses this
	// component across /chains/[chainID] navigations, so the previous chain's
	// logo-error, copied index, and add-to-wallet status/alert would otherwise leak.
	let shownChainId: string | undefined;
	$effect(() => {
		if (data.chainId === shownChainId) return;
		shownChainId = data.chainId;
		logoError = false;
		addError = null;
		addStatus = 'idle';
		copiedIndex = null;
		clearTimeout(copyTimer);
		clearTimeout(addTimer);
	});

	// Probe every testable endpoint once the page is interactive.
	$effect(() => {
		if (!browser || publicRpcs.length === 0) return;

		// In-flight probes from a previous chain must not write into the cleared map
		// after we navigate; the teardown flips this so late results are dropped.
		let cancelled = false;

		rpcLatencies.clear();
		for (const rpc of publicRpcs) {
			if (isTestableRpc(rpc)) rpcLatencies.set(rpc, { latency: null, status: 'pending' });
		}

		for (const rpc of publicRpcs) {
			if (!isTestableRpc(rpc)) continue;
			probeRpcLatency(rpc).then((result) => {
				if (!cancelled) rpcLatencies.set(rpc, result);
			});
		}

		return () => {
			cancelled = true;
		};
	});

	async function copyToClipboard(text: string, index: number) {
		try {
			await navigator.clipboard.writeText(text);
			copiedIndex = index;
			clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copiedIndex = null), 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	async function handleAddToWallet() {
		if (!data.chain) return;
		addError = null;
		addStatus = 'adding';
		const { status, message } = await addChainToWallet(data.chain, walletRpc);

		if (status === 'added') {
			addStatus = 'added';
			clearTimeout(addTimer);
			addTimer = setTimeout(() => (addStatus = 'idle'), 2500);
			return;
		}

		addStatus = 'idle';
		if (status === 'rejected') return; // user cancelled — stay silent
		// no-wallet / failed → surface the reason in the alert banner
		addError =
			message ??
			(status === 'no-wallet' ? t('chains.addToWallet.noWallet') : t('chains.addToWallet.failed'));
	}
</script>

<SEO {...seoProps} />

<PageHeader />

<main class="page">
	{#if data.chain}
		<section class="search-section" use:fadeInUp={{ delay: 0 }}>
			<ChainSearch currentChainId={data.chain.chainId} />
		</section>

		<!-- Chain Header -->
		<section class="chain-header" use:fadeInUp={{ delay: 50 }}>
			<div class="chain-identity">
				<img
					src={logoError ? DEFAULT_CHAIN_LOGO : data.logoUrl}
					alt={data.chain.name}
					class="chain-logo"
					onerror={() => (logoError = true)}
				/>
				<div class="chain-info">
					<h1 class="chain-name">{data.chain.name}</h1>
					<div class="chain-badges">
						<span class="badge badge-primary">#{data.chain.chainId}</span>
						<span class="badge">{data.chain.shortName}</span>
						{#if data.chain.nativeCurrency}
							<span class="badge">{data.chain.nativeCurrency.symbol}</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- Primary actions -->
			<div class="header-actions">
				<button
					type="button"
					class="action-btn primary"
					class:is-added={addStatus === 'added'}
					onclick={handleAddToWallet}
					disabled={addStatus === 'adding'}
				>
					{#if addStatus === 'adding'}
						<LoaderCircle size={16} class="spin" />
						<span>{t('chains.addToWallet')}</span>
					{:else if addStatus === 'added'}
						<Check size={16} />
						<span>{t('chains.addToWallet.added')}</span>
					{:else}
						<Wallet size={16} />
						<span>{t('chains.addToWallet')}</span>
					{/if}
				</button>

				{#if data.chain.infoURL}
					<a
						href={data.chain.infoURL}
						target="_blank"
						rel="noopener noreferrer"
						class="action-btn"
					>
						<Globe size={15} />
						<span>{t('chains.info.website')}</span>
					</a>
				{/if}

				<a
					href={`https://github.com/atshelchin/ethereum-data/blob/main/chains/eip155-${data.chain.chainId}.json`}
					target="_blank"
					rel="noopener noreferrer"
					class="edit-link"
					title={t('chains.editOnGithub')}
				>
					<Pencil size={14} />
					<span>{t('chains.editOnGithub')}</span>
				</a>
			</div>
		</section>

		<!-- Add-to-wallet failure reason -->
		{#if addError}
			<div class="wallet-alert" role="alert">
				<TriangleAlert size={16} class="alert-icon" />
				<span class="alert-msg">{addError}</span>
				<button
					type="button"
					class="alert-dismiss"
					onclick={() => (addError = null)}
					aria-label={t('chains.addToWallet.dismiss')}
				>
					<X size={14} />
				</button>
			</div>
		{/if}

		<!-- Info Cards Grid -->
		<section class="info-grid" use:fadeInUp={{ delay: 100 }}>
			{#if data.chain.nativeCurrency}
				<div class="card info-card">
					<h3 class="card-title">{t('chains.nativeCurrency')}</h3>
					<div class="card-content">
						<div class="info-row">
							<span class="info-label">{t('chains.info.symbol')}</span>
							<span class="info-value highlight">{data.chain.nativeCurrency.symbol}</span>
						</div>
						<div class="info-row">
							<span class="info-label">{data.chain.nativeCurrency.name}</span>
							<span class="info-value"
								>{data.chain.nativeCurrency.decimals} {t('chains.info.decimals')}</span
							>
						</div>
					</div>
				</div>
			{/if}

			<div class="card info-card">
				<h3 class="card-title">{t('chains.features')}</h3>
				<div class="card-content">
					<div class="info-row">
						<span class="info-label">{t('chains.info.chainId')}</span>
						<span class="info-value mono">{data.chain.chainId}</span>
					</div>
					<div class="info-row">
						<span class="info-label">{t('chains.info.networkId')}</span>
						<span class="info-value mono">{data.chain.networkId}</span>
					</div>
					{#if data.chain.features && data.chain.features.length > 0}
						<div class="feature-tags">
							{#each data.chain.features as feature (feature.name)}
								<span class="feature-tag">{feature.name}</span>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</section>

		<!-- Sponsor: Vela Wallet (same author as BiuBiu Tools) -->
		<section class="promo-section" use:fadeInUp={{ delay: 125 }}>
			<SponsorPromo />
		</section>

		<!-- RPC Endpoints -->
		{#if publicRpcs.length > 0}
			<section class="rpc-section" use:fadeInUp={{ delay: 150 }}>
				<h2 class="section-title">{t('chains.rpcEndpoints')}</h2>
				<div class="card rpc-list">
					{#each sortedRpcs as rpc (rpc)}
						{@const probe = rpcLatencies.get(rpc)}
						{@const idx = publicRpcs.indexOf(rpc)}
						<div class="rpc-item">
							<div class="rpc-main">
								{#if rpc === bestRpc && probe?.status === 'success'}
									<span class="fastest-pill"><Zap size={11} />{t('chains.rpc.fastest')}</span>
								{/if}
								<code class="rpc-url">{rpc}</code>
							</div>
							<div class="rpc-actions">
								{#if isTestableRpc(rpc)}
									{#if probe?.status === 'pending'}
										<span class="latency-badge latency-pending"><span class="latency-dot"></span></span>
									{:else if probe?.status === 'success' && probe.latency !== null}
										<span class="latency-badge latency-{latencyTier(probe.latency)}">
											{probe.latency}ms
										</span>
									{:else if probe?.status === 'error'}
										<span class="latency-badge latency-error" title={t('chains.rpc.unreachable')}>
											<X size={12} />
										</span>
									{/if}
								{/if}
								<button
									type="button"
									class="copy-btn"
									onclick={() => copyToClipboard(rpc, idx)}
									title={t('chains.rpcEndpoints.copy')}
									aria-label={t('chains.rpcEndpoints.copy')}
								>
									{#if copiedIndex === idx}
										<Check size={15} />
									{:else}
										<Copy size={15} />
									{/if}
								</button>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Block Explorers -->
		{#if data.chain.explorers && data.chain.explorers.length > 0}
			<section class="explorers-section" use:fadeInUp={{ delay: 200 }}>
				<h2 class="section-title">{t('chains.explorers')}</h2>
				<div class="explorers-grid">
					{#each data.chain.explorers as explorer (explorer.url)}
						<a
							href={explorer.url}
							target="_blank"
							rel="noopener noreferrer"
							class="card explorer-card"
						>
							<span class="explorer-name">{explorer.name}</span>
							<span class="explorer-link">
								{t('chains.explorers.visit')}
								<ExternalLink size={13} />
							</span>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<!-- DeFi Info -->
		{#if data.chain.stables?.length || data.chain.wrappedNativeToken || data.chain.dex}
			<section class="defi-section" use:fadeInUp={{ delay: 250 }}>
				<h2 class="section-title">{t('chains.defi')}</h2>

				{#if data.chain.stables && data.chain.stables.length > 0}
					<div class="defi-subsection">
						<h3 class="defi-subtitle">{t('chains.defi.stablecoins')}</h3>
						<div class="card defi-list">
							{#each data.chain.stables as stable (stable.contract)}
								<div class="defi-item">
									<div class="defi-item-header">
										<span class="defi-item-name">{stable.symbol}</span>
										<span class="defi-item-badge">{stable.type}</span>
									</div>
									{#if data.chain.explorers?.[0]?.url}
										<a
											href={`${data.chain.explorers[0].url}/address/${stable.contract}`}
											target="_blank"
											rel="noopener noreferrer"
											class="defi-address-link">{stable.contract}</a
										>
									{:else}
										<code class="defi-address">{stable.contract}</code>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if data.chain.wrappedNativeToken}
					<div class="defi-subsection">
						<h3 class="defi-subtitle">{t('chains.defi.wrappedNative')}</h3>
						<div class="card defi-single">
							{#if data.chain.explorers?.[0]?.url}
								<a
									href={`${data.chain.explorers[0].url}/address/${data.chain.wrappedNativeToken}`}
									target="_blank"
									rel="noopener noreferrer"
									class="defi-address-link">{data.chain.wrappedNativeToken}</a
								>
							{:else}
								<code class="defi-address">{data.chain.wrappedNativeToken}</code>
							{/if}
						</div>
					</div>
				{/if}

				{#if data.chain.dex}
					<div class="defi-subsection">
						<h3 class="defi-subtitle">{t('chains.defi.dex')}</h3>
						<div class="card defi-list">
							<div class="defi-item">
								<div class="defi-item-header">
									{#if data.chain.dex.url}
										<a
											href={data.chain.dex.url}
											target="_blank"
											rel="noopener noreferrer"
											class="defi-item-name defi-dex-link">{data.chain.dex.dex}</a
										>
									{:else}
										<span class="defi-item-name">{data.chain.dex.dex}</span>
									{/if}
									<span class="defi-item-badge">{data.chain.dex.protocol}</span>
								</div>
								{#each Object.entries(data.chain.dex.contracts) as [label, address] (label)}
									<div class="defi-contract-row">
										<span class="defi-contract-label">{label}</span>
										{#if data.chain.explorers?.[0]?.url}
											<a
												href={`${data.chain.explorers[0].url}/address/${address}`}
												target="_blank"
												rel="noopener noreferrer"
												class="defi-address-link">{address}</a
											>
										{:else}
											<code class="defi-address">{address}</code>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					</div>
				{/if}
			</section>
		{/if}

		<!-- ENS Registry -->
		{#if data.chain.ens?.registry}
			<section class="ens-section" use:fadeInUp={{ delay: 250 }}>
				<h2 class="section-title">{t('chains.ens')}</h2>
				<div class="card ens-card">
					<code class="ens-address">{data.chain.ens.registry}</code>
				</div>
			</section>
		{/if}

		<!-- Faucets -->
		{#if data.chain.faucets && data.chain.faucets.length > 0}
			<section class="faucets-section" use:fadeInUp={{ delay: 300 }}>
				<h2 class="section-title">{t('chains.faucets')}</h2>
				<div class="faucets-list">
					{#each data.chain.faucets as faucet (faucet)}
						<a
							href={faucet}
							target="_blank"
							rel="noopener noreferrer"
							class="card faucet-link">{faucet}</a
						>
					{/each}
				</div>
			</section>
		{/if}
	{:else}
		<!-- Not Found State -->
		<section class="not-found" use:fadeInUp={{ delay: 0 }}>
			<div class="not-found-content">
				<h1 class="not-found-title">{t('chains.notFound')}</h1>
				<p class="not-found-description">
					{t('chains.notFound.description', { chainId: data.chainId })}
				</p>
				<a href={localizeHref('/chains')} class="back-link">{t('chains.backToHome')}</a>
			</div>
		</section>
	{/if}
</main>

<PageFooter />

<style>
	main.page {
		max-width: 800px;
		margin: 0 auto;
		padding: var(--space-8) var(--space-6);
		min-height: calc(100vh - 200px);
	}

	/* Card primitive */
	.card {
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}

	/* Search Section */
	.search-section {
		position: relative;
		z-index: 100;
		margin-bottom: var(--space-8);
		display: flex;
		justify-content: center;
	}

	/* Chain Header */
	.chain-header {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-8);
		flex-wrap: wrap;
	}

	.chain-identity {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.chain-logo {
		width: 56px;
		height: 56px;
		border-radius: var(--radius-lg);
		object-fit: contain;
	}

	.chain-info {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.chain-name {
		font-size: var(--text-3xl);
		font-weight: var(--weight-bold);
		letter-spacing: -0.02em;
		color: var(--fg-base);
		margin: 0;
		line-height: 1.15;
	}

	.chain-badges {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.badge {
		display: inline-flex;
		align-items: center;
		padding: 3px var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}

	.badge-primary {
		background: var(--accent-muted);
		border-color: transparent;
		color: var(--accent);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-weight: var(--weight-medium);
	}

	/* Action buttons */
	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		text-decoration: none;
		box-shadow: var(--shadow-sm);
		transition:
			border-color var(--motion-fast) var(--easing),
			background var(--motion-fast) var(--easing),
			transform var(--motion-fast) var(--easing);
	}

	.action-btn:hover {
		border-color: var(--border-strong);
		background: var(--bg-raised);
		transform: translateY(-1px);
	}

	.action-btn.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-fg);
	}

	.action-btn.primary:hover {
		background: var(--accent-hover);
		border-color: var(--accent-hover);
	}

	.action-btn.primary.is-added {
		background: var(--success);
		border-color: var(--success);
	}

	.action-btn:disabled {
		opacity: 0.7;
		cursor: default;
		transform: none;
	}

	:global(.action-btn .spin) {
		animation: spin 0.8s linear infinite;
	}

	.edit-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2);
		color: var(--fg-subtle);
		font-size: var(--text-xs);
		text-decoration: none;
		border-radius: var(--radius-sm);
		transition: color var(--motion-fast) var(--easing);
	}

	.edit-link:hover {
		color: var(--accent);
	}

	/* Add-to-wallet alert */
	.wallet-alert {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin: 0 0 var(--space-6);
		padding: var(--space-3) var(--space-4);
		background: var(--error-subtle);
		border: 1px solid var(--error-muted);
		border-radius: var(--radius-md);
		color: var(--error);
		font-size: var(--text-sm);
	}

	.wallet-alert :global(.alert-icon) {
		flex-shrink: 0;
	}

	.alert-msg {
		flex: 1;
		min-width: 0;
		word-break: break-word;
	}

	.alert-dismiss {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		flex-shrink: 0;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--error);
		opacity: 0.7;
		transition: opacity var(--motion-fast) var(--easing);
	}

	.alert-dismiss:hover {
		opacity: 1;
	}

	/* Info Grid */
	.info-grid {
		position: relative;
		z-index: 1;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: var(--space-4);
		margin-bottom: var(--space-8);
	}

	.info-card {
		padding: var(--space-5);
	}

	/* Sponsor promo */
	.promo-section {
		position: relative;
		z-index: 1;
		margin-bottom: var(--space-8);
	}

	.card-title {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 0 0 var(--space-4);
	}

	.card-content {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-3);
	}

	.info-label {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.info-value {
		font-size: var(--text-sm);
		color: var(--fg-base);
		font-weight: var(--weight-medium);
	}

	.info-value.highlight {
		font-size: var(--text-lg);
		color: var(--accent);
		font-weight: var(--weight-semibold);
	}

	.info-value.mono {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-variant-numeric: tabular-nums;
	}

	.feature-tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-1);
	}

	.feature-tag {
		padding: 2px var(--space-2);
		background: var(--accent-muted);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		color: var(--accent);
	}

	/* Section Title */
	.section-title {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0 0 var(--space-4);
	}

	/* RPC Section */
	.rpc-section {
		position: relative;
		z-index: 1;
		margin-bottom: var(--space-8);
	}

	.rpc-list {
		overflow: hidden;
	}

	.rpc-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		transition: background var(--motion-fast) var(--easing);
	}

	.rpc-item:not(:last-child) {
		border-bottom: 1px solid var(--border-subtle);
	}

	.rpc-item:hover {
		background: var(--bg-raised);
	}

	.rpc-main {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 1;
		min-width: 0;
	}

	.fastest-pill {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 2px var(--space-2);
		background: var(--success-muted);
		color: var(--success);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		flex-shrink: 0;
	}

	.rpc-url {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		font-family: var(--font-mono, ui-monospace, monospace);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.rpc-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.copy-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		background: transparent;
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		color: var(--fg-muted);
		transition:
			border-color var(--motion-fast) var(--easing),
			color var(--motion-fast) var(--easing),
			background var(--motion-fast) var(--easing);
	}

	.copy-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-muted);
	}

	.latency-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 52px;
		padding: 3px var(--space-2);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-variant-numeric: tabular-nums;
	}

	.latency-good {
		background: var(--success-muted);
		color: var(--success);
	}

	.latency-medium {
		background: var(--warning-muted);
		color: var(--warning);
	}

	.latency-slow {
		background: var(--error-muted);
		color: var(--error);
	}

	.latency-error {
		background: var(--error-subtle);
		color: var(--error);
		min-width: 30px;
	}

	.latency-pending {
		background: var(--bg-sunken);
		min-width: 30px;
	}

	.latency-dot {
		width: 6px;
		height: 6px;
		background: var(--fg-subtle);
		border-radius: 50%;
		animation: pulse 1s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.35;
		}
		50% {
			opacity: 1;
		}
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Explorers */
	.explorers-section {
		margin-bottom: var(--space-8);
	}

	.explorers-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: var(--space-3);
	}

	.explorer-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4);
		text-decoration: none;
		transition:
			transform var(--motion-fast) var(--easing),
			border-color var(--motion-fast) var(--easing),
			box-shadow var(--motion-fast) var(--easing);
	}

	.explorer-card:hover {
		transform: translateY(-2px);
		border-color: var(--border-strong);
		box-shadow: var(--shadow-md);
	}

	.explorer-name {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.explorer-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	/* ENS */
	.ens-section {
		margin-bottom: var(--space-8);
	}

	.ens-card {
		padding: var(--space-4);
	}

	.ens-address {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		font-family: var(--font-mono, ui-monospace, monospace);
		word-break: break-all;
	}

	/* Faucets */
	.faucets-section {
		margin-bottom: var(--space-8);
	}

	.faucets-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.faucet-link {
		padding: var(--space-3) var(--space-4);
		font-size: var(--text-sm);
		color: var(--fg-muted);
		text-decoration: none;
		word-break: break-all;
		transition:
			color var(--motion-fast) var(--easing),
			border-color var(--motion-fast) var(--easing);
	}

	.faucet-link:hover {
		color: var(--accent);
		border-color: var(--border-strong);
	}

	/* DeFi */
	.defi-section {
		margin-bottom: var(--space-8);
	}

	.defi-subsection {
		margin-bottom: var(--space-4);
	}

	.defi-subtitle {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 0 0 var(--space-2);
	}

	.defi-list {
		overflow: hidden;
	}

	.defi-item {
		padding: var(--space-3) var(--space-4);
	}

	.defi-item:not(:last-child) {
		border-bottom: 1px solid var(--border-subtle);
	}

	.defi-item-header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}

	.defi-item-name {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}

	.defi-item-badge {
		padding: 2px var(--space-2);
		background: var(--accent-muted);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		color: var(--accent);
	}

	.defi-address,
	.defi-address-link {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		font-family: var(--font-mono, ui-monospace, monospace);
		word-break: break-all;
	}

	.defi-address-link,
	.defi-dex-link {
		text-decoration: none;
		transition: color var(--motion-fast) var(--easing);
	}

	.defi-address-link:hover,
	.defi-dex-link:hover {
		color: var(--accent);
	}

	.defi-single {
		padding: var(--space-4);
	}

	.defi-contract-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		margin-top: var(--space-1);
	}

	.defi-contract-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		flex-shrink: 0;
	}

	/* Not Found */
	.not-found {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		text-align: center;
	}

	.not-found-content {
		max-width: 400px;
	}

	.not-found-title {
		font-size: var(--text-2xl);
		font-weight: var(--weight-bold);
		color: var(--fg-base);
		margin: 0 0 var(--space-4);
	}

	.not-found-description {
		font-size: var(--text-base);
		color: var(--fg-muted);
		margin: 0 0 var(--space-6);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-6);
		background: var(--accent);
		color: var(--accent-fg);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		text-decoration: none;
		border-radius: var(--radius-md);
		transition:
			background var(--motion-fast) var(--easing),
			transform var(--motion-fast) var(--easing);
	}

	.back-link:hover {
		background: var(--accent-hover);
		transform: translateY(-1px);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.page {
			padding: var(--space-6) var(--space-4);
		}

		.chain-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.header-actions {
			width: 100%;
		}

		.action-btn {
			flex: 1;
			justify-content: center;
		}

		.chain-logo {
			width: 48px;
			height: 48px;
		}

		.chain-name {
			font-size: var(--text-2xl);
		}

		.info-grid {
			grid-template-columns: 1fr;
		}

		.explorers-grid {
			grid-template-columns: 1fr;
		}

		.rpc-item {
			flex-wrap: wrap;
		}

		.rpc-main {
			width: 100%;
		}

		.rpc-actions {
			margin-left: auto;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.action-btn,
		.explorer-card,
		.copy-btn,
		.back-link,
		.faucet-link {
			transition: none;
		}
		.latency-dot,
		:global(.action-btn .spin) {
			animation: none;
		}
	}
</style>
