<!-- Slim, sticky connection status bar (shown once a wallet is connected). -->
<script lang="ts">
	import { t } from '$lib/i18n';
	import { walletStore } from '$lib/wallet';
	import { debug } from './debug-store.svelte.js';
	import { CURATED_CHAINS, truncateMiddle } from './helpers.js';
	import { KIND_KEY, ACCT_KEY } from './labels.js';
	import CopyButton from './CopyButton.svelte';
	import Btn from './Btn.svelte';
	import { Wallet, RefreshCw, LogOut } from '@lucide/svelte';

	interface Props {
		onSwitch: () => void;
	}
	let { onSwitch }: Props = $props();

	const wallet = $derived(debug.wallet);
	const kindLabel = $derived(wallet ? t(KIND_KEY[wallet.kind]) : '');
	const acctLabel = $derived(wallet ? t(ACCT_KEY[wallet.accountType]) : '');
	const chainName = $derived(
		CURATED_CHAINS.find((c) => c.chainId === debug.selectedChainId)?.name ??
			t('wd.bar.chain', { id: String(debug.selectedChainId) })
	);
</script>

{#if wallet}
	<div class="bar">
		<span class="kind"><Wallet size={14} />{kindLabel}</span>
		<span class="divider"></span>
		<code class="addr" title={wallet.address}>{truncateMiddle(wallet.address)}</code>
		<CopyButton value={wallet.address} />
		<span class="acct">{acctLabel}</span>
		<span class="net">{chainName}</span>
		<div class="spacer"></div>
		<Btn variant="ghost" size="sm" onclick={onSwitch} title={t('wd.bar.switch')}>
			<RefreshCw size={13} />{t('wd.bar.switch')}
		</Btn>
		<Btn variant="ghost" size="sm" onclick={() => walletStore.disconnect()} title={t('wd.bar.disconnect')}>
			<LogOut size={13} />{t('wd.bar.disconnect')}
		</Btn>
	</div>
{/if}

<style>
	.bar {
		position: sticky;
		top: var(--space-3);
		z-index: var(--z-sticky);
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding: var(--space-3) var(--space-4);
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
	}
	.kind {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.divider {
		width: 1px;
		height: 16px;
		background: var(--border-base);
	}
	.addr {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--fg-base);
	}
	.acct,
	.net {
		display: inline-flex;
		align-items: center;
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
	}
	.acct {
		background: var(--accent-subtle);
		color: var(--accent);
	}
	.net {
		background: var(--bg-sunken);
		color: var(--fg-muted);
		border: 1px solid var(--border-subtle);
	}
	.spacer {
		flex: 1 1 auto;
	}
	@media (max-width: 640px) {
		.spacer {
			display: none;
		}
	}
</style>
