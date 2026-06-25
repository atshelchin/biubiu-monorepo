<script lang="ts">
	/**
	 * Network section — search ANY EVM chain (real logos via the ethereum-data API,
	 * shared NetworkPicker) and run the passkey-wallet readiness check on it. When a
	 * chain isn't ready, the checklist below says exactly what's missing and whether
	 * it's fixable (deployable contracts → chain-setup) or a hard chain-level limit.
	 */
	import { t, localizeHref } from '$lib/i18n';
	import { Check, X, AlertTriangle, ArrowUpRight, Copy } from '@lucide/svelte';
	import NetworkPicker from '$lib/widgets/NetworkPicker.svelte';
	import { walletStore } from '$lib/wallet';
	import { deployStore as store } from '$lib/deploy/deploy-store.svelte.js';

	const check = $derived(store.networkCheck);
	const balanceEth = $derived(check?.gasBalance != null ? Number(check.gasBalance) / 1e18 : null);

	const create2Ok = $derived(check?.create2Proxy.deployed ?? false);
	const safeMissing = $derived(check?.safeContracts.filter((c) => !c.deployed) ?? []);
	const safeOk = $derived(!!check && safeMissing.length === 0);
	const p256Ok = $derived(check?.p256Precompile.available ?? false);
	// We couldn't get a definitive answer (RPC call failed) — NOT a confirmed absence.
	const p256Unknown = $derived(!!check && check.p256Precompile.checked && !check.p256Precompile.verified);
	const gasOk = $derived(check?.gasBalance == null || check.gasBalance > 0n);

	// CREATE2 proxy + the Safe stack are deployable via the chain-setup tool.
	const contractsMissing = $derived(!create2Ok || !safeOk);
	// P256 (RIP-7212) is the ONLY chain-level capability that can't be deployed.
	// The vela bundler serves every chain, so it's not a gate; once contracts +
	// P256 exist, the user just funds the gas account on this chain.
	// Only a DEFINITIVE absence is a hard block — an unverifiable probe is a retry, not a verdict.
	const hardBlock = $derived(!!check && check.p256Precompile.verified && !p256Ok);

	const setupHref = $derived(
		localizeHref(
			store.selectedChain
				? `/apps/vela-wallet-chain-setup?chainId=${store.selectedChain.chainId}`
				: '/apps/vela-wallet-chain-setup'
		)
	);

	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout>;
	async function copyAddr(addr: string) {
		try {
			await navigator.clipboard.writeText(addr);
		} catch {
			/* ignore */
		}
		copied = true;
		clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copied = false), 2000);
	}
	function shortAddr(a: string): string {
		return a && a.length >= 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
	}
</script>

<div class="net-section">
	<NetworkPicker
		searchQuery={store.searchQuery}
		searching={store.searching}
		loadingChain={store.loadingChain}
		chainError={store.chainError}
		searchResults={store.searchResults}
		selectedChain={store.selectedChain}
		rpcUrl={store.rpcUrl}
		rpcOptions={store.rpcOptions}
		rpcLatency={store.rpcLatency}
		usingCustomRpc={store.usingCustomRpc}
		customRpcInput={store.customRpcInput}
		rpcError={store.rpcError}
		title={t('deploy.network.heading')}
		subtitle={t('deploy.network.intro')}
		onSearch={(q) => store.searchChains(q)}
		onSelectChain={(id) => store.selectChain(id)}
		onChangeNetwork={() => store.changeNetwork()}
		onSwitchRpc={(url) => store.switchRpc(url)}
		onCustomRpcInput={(v) => (store.customRpcInput = v)}
		onApplyCustomRpc={() => store.applyCustomRpc()}
	>
		{#snippet badge()}
			{#if store.networkChecking}
				<span class="dp-pill dp-pill-muted"><span class="dp-spinner"></span> {t('deploy.create2.checking')}</span>
			{:else if check?.ready}
				<span class="dp-pill dp-pill-ok"><Check size={12} /> {t('deploy.chain.ready')}</span>
			{:else if check && !check.ready}
				<span class="dp-pill dp-pill-warn"><AlertTriangle size={12} /> {t('deploy.chain.notReady')}</span>
			{/if}
		{/snippet}
	</NetworkPicker>

	{#if store.selectedChain && check && !store.networkChecking}
		{#if check.rpcError}
			<span class="dp-pill dp-pill-err"><AlertTriangle size={13} /> {t('deploy.chain.rpcEndpointError')}</span>
		{:else if check.ready}
			<span class="dp-pill dp-pill-ok">
				<Check size={13} /> {t('deploy.chain.infraVerified')}
				{#if balanceEth !== null}· {t('deploy.chain.balance')}: {balanceEth.toFixed(6)} {store.selectedChain.nativeCurrency.symbol}{/if}
			</span>
		{:else}
			<!-- Not ready: actionable checklist -->
			<div class="notready">
				<div class="nr-head"><AlertTriangle size={14} /> {t('deploy.chain.notReady')}</div>

				<ul class="nr-list">
					<li class:bad={!create2Ok}>
						{#if create2Ok}<Check size={13} class="ic-ok" />{:else}<X size={13} class="ic-bad" />{/if}
						<span class="nr-name">{t('deploy.ready.create2')}</span>
						<span class="nr-tag fix">{t('deploy.ready.deployable')}</span>
					</li>
					<li class:bad={!safeOk}>
						{#if safeOk}<Check size={13} class="ic-ok" />{:else}<X size={13} class="ic-bad" />{/if}
						<span class="nr-name">{t('deploy.ready.safe')}{#if safeMissing.length > 0} ({safeMissing.length}){/if}</span>
						<span class="nr-tag fix">{t('deploy.ready.deployable')}</span>
					</li>
					<li class:bad={!p256Ok && !p256Unknown} class:unknown={p256Unknown}>
						{#if p256Ok}<Check size={13} class="ic-ok" />{:else if p256Unknown}<AlertTriangle size={13} class="ic-unknown" />{:else}<X size={13} class="ic-bad" />{/if}
						<span class="nr-name">{t('deploy.ready.p256')}</span>
						<span class="nr-tag">{t('deploy.ready.chainLevel')}</span>
					</li>
					{#if check.gasBalance !== null}
						<li class:bad={!gasOk}>
							{#if gasOk}<Check size={13} class="ic-ok" />{:else}<X size={13} class="ic-bad" />{/if}
							<span class="nr-name">{t('deploy.ready.gas')}</span>
							<span class="nr-tag fix">{t('deploy.ready.deployable')}</span>
						</li>
					{/if}
				</ul>

				{#if hardBlock}
					<p class="nr-hint">{t('deploy.ready.hardHint')}</p>
					{#if contractsMissing}
						<a class="nr-cta ghost" href={setupHref}>{t('deploy.ready.setupCta')} <ArrowUpRight size={14} /></a>
					{/if}
				{:else if contractsMissing}
					<p class="nr-hint">{t('deploy.ready.fixHint')}</p>
					<a class="nr-cta" href={setupHref}>{t('deploy.ready.setupCta')} <ArrowUpRight size={14} /></a>
				{:else if !gasOk}
					<p class="nr-hint">{t('deploy.ready.gasHint')}</p>
					{#if walletStore.activeWallet?.address}
						<button class="fund-addr dp-mono" onclick={() => copyAddr(walletStore.activeWallet?.address ?? '')} title={t('deploy.account.clickToCopy')}>
							{shortAddr(walletStore.activeWallet.address)}
							{#if copied}<Check size={12} />{:else}<Copy size={12} />{/if}
						</button>
					{/if}
				{:else if p256Unknown}
					<p class="nr-hint">{t('deploy.chain.rpcEndpointError')}</p>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.net-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	/* Match the shared NetworkPicker card to the deployer's other cards
	   (elevated white surface) so the section doesn't read as a greyer panel. */
	.net-section :global(.card) {
		background: var(--bg-elevated);
	}

	.notready {
		padding: var(--space-3) var(--space-4);
		background: var(--warning-muted);
		border: 1px solid color-mix(in srgb, var(--warning) 18%, transparent);
		border-radius: var(--radius-md);
	}
	.nr-head {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--warning);
		margin-bottom: var(--space-3);
	}
	.nr-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.nr-list li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.nr-list li.bad .nr-name {
		color: var(--fg-base);
	}
	.nr-name {
		flex: 1;
		min-width: 0;
	}
	.nr-list :global(.ic-ok) {
		color: var(--success);
		flex-shrink: 0;
	}
	.nr-list :global(.ic-bad) {
		color: var(--error);
		flex-shrink: 0;
	}
	.nr-list :global(.ic-unknown) {
		color: var(--warning);
		flex-shrink: 0;
	}
	.nr-list li.unknown .nr-name {
		color: var(--fg-base);
	}
	.nr-tag {
		font-size: 10px;
		padding: 1px var(--space-2);
		border-radius: var(--radius-full);
		background: var(--bg-sunken);
		color: var(--fg-subtle);
		border: 1px solid var(--border-subtle);
		white-space: nowrap;
	}
	.nr-tag.fix {
		color: var(--accent);
		background: var(--accent-subtle);
		border-color: color-mix(in srgb, var(--accent) 20%, transparent);
	}
	.nr-hint {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
		margin: var(--space-3) 0 0;
	}
	.nr-cta {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin-top: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		background: var(--accent);
		color: var(--accent-fg);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		text-decoration: none;
		transition: background var(--motion-fast) var(--easing);
	}
	.nr-cta:hover {
		background: var(--accent-hover);
	}
	.nr-cta.ghost {
		background: transparent;
		color: var(--accent);
		border: 1px solid var(--border-base);
	}
	.nr-cta.ghost:hover {
		background: var(--bg-elevated);
	}
	/* Fund-the-gas-account address — click to copy. */
	.fund-addr {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin-top: var(--space-2);
		padding: var(--space-1) var(--space-2);
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-sm);
		color: var(--accent);
		font-size: var(--text-xs);
		cursor: pointer;
		transition: border-color var(--motion-fast) var(--easing);
	}
	.fund-addr:hover {
		border-color: var(--accent);
	}
</style>
