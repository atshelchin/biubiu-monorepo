<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { fly } from 'svelte/transition';
	import { t, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import AuthModal from '$lib/auth/AuthModal.svelte';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import QrCanvas from '$lib/ui/QrCanvas.svelte';
	import { walletStore } from '$lib/wallet';
	import { deployStore as store } from '$lib/deploy/deploy-store.svelte.js';

	import DeployerSetupBar from '$lib/widgets/DeployerSetupBar.svelte';
	import DeployerContractCard from '$lib/widgets/DeployerContractCard.svelte';
	import DeployerNetworkCard from '$lib/widgets/DeployerNetworkCard.svelte';
	import DeployerDeployCard from '$lib/widgets/DeployerDeployCard.svelte';
	import DeployerVerifyCard from '$lib/widgets/DeployerVerifyCard.svelte';
	import DeployerActivityLog from '$lib/widgets/DeployerActivityLog.svelte';

	// One shared visual language for every deployer widget (imported once, global).
	import '$lib/deploy/deployer-ui.css';

	let showAuth = $state(false);
	let showQr = $state(false);

	const seoProps = $derived(
		getBaseSEO({
			title: t('deploy.meta.title'),
			description: t('deploy.meta.description'),
			currentLocale: locale.value
		})
	);

	// Sections reveal as you fill the form — the page grows, never a 5-step wizard.
	const showContract = $derived(store.serverStatus === 'connected');
	const showNetwork = $derived(showContract && store.selectedContract !== null);
	const showDeploy = $derived(showNetwork && store.networkReady);
	// Reveal Verify once there's anything worth verifying: a local deployment, OR
	// a contract already deployed at the predicted address (e.g. someone else
	// CREATE2-deployed it first). Without the latter, an already-deployed contract
	// would have no verification path at all — the deploy button is disabled and
	// the card stays hidden. The store pre-fills verifyAddress in that case.
	const showVerify = $derived(store.history.length > 0 || store.addressAlreadyDeployed);

	// Revealed cards animate in on reveal (NOT scroll-gated like fadeInUp, which
	// would leave a below-the-fold card invisible until scrolled to).
	const reveal = { y: 10, duration: browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220 };

	onMount(() => store.init());
</script>

<SEO {...seoProps} />
<PageHeader />

<main class="page">
	<header class="hero" use:fadeInUp={{ delay: 0 }}>
		<h1 class="title">{t('deploy.title')}</h1>
		<p class="subtitle">{t('deploy.subtitle')}</p>
	</header>

	<div use:fadeInUp={{ delay: 50 }}>
		<DeployerSetupBar onSignIn={() => (showAuth = true)} onShowQr={() => (showQr = true)} />
	</div>

	{#if showContract}
		<div transition:fly={reveal}><DeployerContractCard /></div>
	{/if}
	{#if showNetwork}
		<div transition:fly={reveal}><DeployerNetworkCard /></div>
	{/if}
	{#if showDeploy}
		<div transition:fly={reveal}><DeployerDeployCard /></div>
	{/if}
	{#if showVerify}
		<div transition:fly={reveal}><DeployerVerifyCard /></div>
	{/if}

	<DeployerActivityLog />
</main>

<PageFooter />

<AuthModal open={showAuth} onClose={() => (showAuth = false)} />

<ResponsiveModal open={showQr} onClose={() => (showQr = false)} title={t('deploy.qr.title')}>
	{#if walletStore.activeWallet?.address}
		<div class="qr-body">
			<QrCanvas value={walletStore.activeWallet.address} size={220} />
			<div class="qr-addr dp-mono">{walletStore.activeWallet.address}</div>
		</div>
	{/if}
</ResponsiveModal>

<style>
	.page {
		max-width: 640px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4) var(--space-16);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.hero {
		text-align: center;
		padding: var(--space-8) 0 var(--space-2);
	}
	.title {
		font-size: var(--text-4xl);
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--fg-base);
		margin: 0;
		line-height: var(--leading-tight);
	}
	.subtitle {
		font-size: var(--text-lg);
		color: var(--fg-muted);
		margin: var(--space-3) auto 0;
		max-width: 480px;
	}
	.qr-body {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-2) 0 var(--space-4);
	}
	.qr-addr {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		word-break: break-all;
		text-align: center;
		line-height: var(--leading-relaxed);
		user-select: all;
	}
	@media (max-width: 640px) {
		.title {
			font-size: var(--text-3xl);
		}
	}
</style>
