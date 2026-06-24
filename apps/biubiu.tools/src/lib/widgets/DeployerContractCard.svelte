<script lang="ts">
	/**
	 * Contract section — choose a compiled contract and fill its constructor.
	 * Part of the single-screen flow (no wizard nav).
	 */
	import { t } from '$lib/i18n';
	import { FileCode, AlertTriangle, Hammer } from '@lucide/svelte';
	import SmartParamInput from '$lib/widgets/SmartParamInput.svelte';
	import { deployStore as store } from '$lib/deploy/deploy-store.svelte.js';

	const contract = $derived(store.selectedContract);
	const noBytecode = $derived(
		!!contract && (!contract.bytecode || contract.bytecode === '0x' || contract.bytecode.length < 10)
	);

	function onSelect(e: Event) {
		store.selectContract(parseInt((e.target as HTMLSelectElement).value));
	}
</script>

<section class="dp-panel">
	<h2 class="dp-sec-h"><span class="dp-sec-icon"><FileCode size={18} /></span> {t('deploy.contract.heading')}</h2>

	{#if store.contracts.length === 0}
		<p class="dp-help empty-hint">{t('deploy.contract.noContracts')}</p>
		<button class="dp-btn dp-btn-primary build" onclick={() => store.buildContracts()} disabled={store.building}>
			<Hammer size={15} />
			{store.building ? t('deploy.server.building') : t('deploy.server.buildBtn')}
		</button>
	{:else}
		<select class="dp-select" value={store.selectedContractIndex} onchange={onSelect} aria-label={t('deploy.contract.title')}>
			<option value={-1}>{t('deploy.contract.select')}</option>
			{#each store.contracts as c, i (c.name + c.file)}
				<option value={i}>{c.name} · {c.file}</option>
			{/each}
		</select>

		{#if noBytecode}
			<p class="dp-pill dp-pill-warn warn-block"><AlertTriangle size={13} /> {t('deploy.contract.noBytecode')}</p>
		{/if}

		{#if contract && store.constructorArgs.length > 0}
			<div class="dp-label">{t('deploy.contract.argsTitle')}</div>
			<div class="args">
				{#each store.constructorArgs as arg, i (arg.name + i)}
					<SmartParamInput type={arg.type} name={arg.name} value={arg.value} onChange={(v) => store.setArgValue(i, v)} />
				{/each}
			</div>
		{:else if contract}
			<p class="dp-help">{t('deploy.contract.noArgs')}</p>
		{/if}
	{/if}
</section>

<style>
	.dp-panel :global(.dp-sec-h) {
		margin-bottom: var(--space-4);
	}
	.empty-hint {
		margin-bottom: var(--space-3);
	}
	.warn-block {
		margin-top: var(--space-3);
	}
	.args {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		margin-top: var(--space-2);
	}
	.build {
		margin-top: var(--space-1);
	}
</style>
