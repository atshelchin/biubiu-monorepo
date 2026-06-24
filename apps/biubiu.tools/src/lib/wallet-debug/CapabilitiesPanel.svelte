<!-- EIP-5792 wallet_getCapabilities probe (synthesised for biubiu). -->
<script lang="ts">
	import { t } from '$lib/i18n';
	import { debug } from './debug-store.svelte.js';
	import { safeJson } from './helpers.js';
	import Panel from './Panel.svelte';
	import Btn from './Btn.svelte';
	import CodeBlock from './CodeBlock.svelte';
	import { Zap } from '@lucide/svelte';

	const wallet = $derived(debug.wallet);
	const isBuiltin = $derived(wallet?.kind === 'biubiu');

	let caps = $state<Record<string, unknown> | null>(null);
	let busy = $state(false);
	let probed = $state(false);

	async function probe() {
		if (!wallet?.getCapabilities) return;
		busy = true;
		try {
			const result = await wallet.getCapabilities(debug.selectedChainId);
			caps = result;
			probed = true;
			debug.push('wallet_getCapabilities', true, { chainId: debug.selectedChainId, capabilities: result });
		} catch (e) {
			caps = null;
			probed = true;
			debug.push('wallet_getCapabilities', false, { error: e instanceof Error ? e.message : String(e) });
		} finally {
			busy = false;
		}
	}

	const isEmpty = $derived(probed && caps !== null && Object.keys(caps).length === 0);
</script>

<Panel title={t('wd.caps.title')} description={t('wd.caps.desc')} icon={Zap}>
	{#snippet actions()}
		<Btn size="sm" loading={busy} onclick={probe}>{t('wd.caps.probe')}</Btn>
	{/snippet}

	{#if isBuiltin}
		<p class="wd-alert info">{t('wd.caps.builtin')}</p>
	{/if}

	{#if !probed}
		<p class="wd-hint">{t('wd.caps.idle')}</p>
	{:else if isEmpty}
		<p class="wd-hint">{t('wd.caps.empty')}</p>
	{:else if caps}
		<CodeBlock value={safeJson(caps)} copyTitle={t('wd.caps.title')} />
	{/if}
</Panel>
