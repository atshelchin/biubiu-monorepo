<!--
  Wallet Lab — a debug playground for biubiu's smart-contract wallets
  (biubiu passkey Safe / inject EIP-6963 / walletpair). Connection + gate handled by
  the shared WalletGate; AuthModal powers "switch wallet". One calm screen.
-->
<script lang="ts">
	import { t } from '$lib/i18n';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import WalletGate from '$lib/auth/WalletGate.svelte';
	import AuthModal from '$lib/auth/AuthModal.svelte';
	import { debug } from './debug-store.svelte.js';
	import { CURATED_CHAINS } from './helpers.js';
	import WalletBar from './WalletBar.svelte';
	import StatePanel from './StatePanel.svelte';
	import NetworkPanel from './NetworkPanel.svelte';
	import CapabilitiesPanel from './CapabilitiesPanel.svelte';
	import SignPanel from './SignPanel.svelte';
	import TxBuilderPanel from './TxBuilderPanel.svelte';
	import OutputConsole from './OutputConsole.svelte';
	import './controls.css';

	let showAuth = $state(false);

	// On connecting a new external wallet, adopt its chain as the target if it's one
	// of the built-in (readable) networks — otherwise keep the current target.
	let lastAddr: string | null = null;
	$effect(() => {
		const w = debug.wallet;
		if (!w || w.address === lastAddr) return;
		lastAddr = w.address;
		if ('chainId' in w) {
			const id = (w as { chainId: number }).chainId;
			if (CURATED_CHAINS.some((c) => c.chainId === id)) debug.selectedChainId = id;
		}
	});
</script>

<WalletGate title={t('wd.gate.title')} description={t('wd.gate.desc')}>
	<WalletBar onSwitch={() => (showAuth = true)} />

	<div class="layout">
		<div class="col">
			<div use:fadeInUp={{ delay: 0 }}><StatePanel /></div>
			<div use:fadeInUp={{ delay: 40 }}><NetworkPanel /></div>
			<div use:fadeInUp={{ delay: 80 }}><TxBuilderPanel /></div>
			<div use:fadeInUp={{ delay: 120 }}><SignPanel /></div>
			<div use:fadeInUp={{ delay: 160 }}><CapabilitiesPanel /></div>
		</div>
		<aside class="console" use:fadeInUp={{ delay: 60 }}>
			<OutputConsole />
		</aside>
	</div>
</WalletGate>

<AuthModal open={showAuth} onClose={() => (showAuth = false)} />

<style>
	.layout {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		margin-top: var(--space-4);
	}
	.col {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	@media (min-width: 1024px) {
		.layout {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 420px);
			align-items: start;
		}
		.console {
			position: sticky;
			top: calc(var(--space-3) + 64px);
		}
	}
</style>
