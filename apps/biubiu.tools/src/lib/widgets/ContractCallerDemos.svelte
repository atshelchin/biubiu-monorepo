<script lang="ts">
	/**
	 * Chain-demo gallery: one-click deploy of self-contained showcase contracts
	 * (deterministic CREATE2, shared network-wide) + pre-wired chains that make
	 * the returndata-forwarding feature tangible. Each scenario loads a ready
	 * chain into the builder; after running it you can read a value that proves
	 * the forwarding happened.
	 */
	import { t } from '$lib/i18n';
	import { contractCallerStore as store } from '$lib/contract-caller/caller-store.svelte.js';
	import { sendingLabel } from '$lib/contract-caller/send-status.js';
	import { DEMO_SCENARIOS } from '$lib/contract-caller/demos/demos.js';
	import {
		ArrowRight,
		CornerDownRight,
		ChevronDown,
		CircleCheck,
		CircleDashed
	} from '@lucide/svelte';

	let open = $state(true);

	// Probe deploy status once per RPC when the gallery is visible.
	let checkedRpc = '';
	$effect(() => {
		const rpc = store.rpcUrl;
		if (open && rpc && rpc !== checkedRpc) {
			checkedRpc = rpc;
			store.checkDemos();
		}
	});
</script>

<section class="card">
	<button class="head" onclick={() => (open = !open)} aria-expanded={open}>
		<div class="head-text">
			<h3 class="title">{t('cc.demos.title')}</h3>
			<p class="subtitle">{t('cc.demos.subtitle')}</p>
		</div>
		<span class="chevron" class:up={open}><ChevronDown size={18} aria-hidden="true" /></span>
	</button>

	{#if open}
		<div class="grid">
			{#each DEMO_SCENARIOS as sc (sc.id)}
				{@const ready = store.scenarioReady(sc)}
				{@const ds = store.demoState[sc.id]}
				{@const loaded = store.demoLoadedId === sc.id}
				{@const proof = store.demoProof[sc.id]}
				<article class="demo" class:ready>
					<div class="demo-head">
						<h4 class="demo-title">{t(`cc.demos.${sc.id}.title`)}</h4>
						{#if store.demoChecking && !ready}
							<span class="status checking">{t('cc.demos.checking')}</span>
						{:else if ready}
							<span class="status ok"><CircleCheck size={13} /> {t('cc.demos.ready')}</span>
						{:else}
							<span class="status off"><CircleDashed size={13} /> {t('cc.demos.notDeployed')}</span>
						{/if}
					</div>

					<p class="demo-desc">{t(`cc.demos.${sc.id}.desc`)}</p>

					<!-- Step 1 → (forwarded value) → Step 2 -->
					<div class="flow">
						<code class="flow-step">{t(`cc.demos.${sc.id}.step1`)}</code>
						<span class="flow-arrow">
							<ArrowRight size={13} />
							<span class="flow-val"
								><CornerDownRight size={11} /> {t(`cc.demos.${sc.id}.forwards`)}</span
							>
						</span>
						<code class="flow-step">{t(`cc.demos.${sc.id}.step2`)}</code>
					</div>

					<div class="actions">
						{#if !ready}
							{#if store.canChain}
								{#if store.isLoggedIn}
									<button
										class="btn primary"
										onclick={() => store.deployDemo(sc.id)}
										disabled={store.demoDeploying[sc.id]}
									>
										{store.demoDeploying[sc.id] ? sendingLabel(ds?.phase) : t('cc.demos.deploy')}
									</button>
									<span class="note">{t('cc.demos.deployedEverywhere')}</span>
								{:else}
									<button class="btn primary" disabled>{t('cc.demos.signInToDeploy')}</button>
								{/if}
							{:else}
								<span class="note">{t('cc.demos.needsBiubiu')}</span>
							{/if}
						{:else}
							<button class="btn primary" onclick={() => store.loadDemoChain(sc.id)}>
								{t('cc.demos.load')}
							</button>
							<button
								class="btn"
								onclick={() => store.verifyDemo(sc.id)}
								disabled={store.demoVerifying[sc.id]}
							>
								{store.demoVerifying[sc.id] ? t('cc.demos.verifying') : t('cc.demos.verify')}
							</button>
						{/if}
					</div>

					{#if loaded}
						<p class="loaded-hint">{t('cc.demos.loaded')}</p>
					{/if}

					{#if ds?.status === 'error'}
						<p class="err">{ds.error}</p>
					{/if}

					{#if proof && proof.length > 0}
						<dl class="proof">
							{#each proof as row (row.labelKey)}
								<div class="proof-row">
									<dt>{t(`cc.demos.proof.${row.labelKey}`)}</dt>
									<dd class:bad={!!row.error}>{row.error ?? row.value}</dd>
								</div>
							{/each}
						</dl>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</section>

<style>
	.card {
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		padding: var(--space-5);
		box-shadow: var(--shadow-sm);
		margin-bottom: var(--space-4);
	}
	.head {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		width: 100%;
		background: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
	}
	.head-text {
		flex: 1;
		min-width: 0;
	}
	.title {
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0 0 2px;
	}
	.subtitle {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin: 0;
		line-height: var(--leading-snug);
	}
	.chevron {
		display: inline-flex;
		align-items: center;
		color: var(--fg-subtle);
		transition: transform var(--motion-fast) var(--easing);
		flex: 0 0 auto;
		margin-top: 2px;
	}
	.chevron.up {
		transform: rotate(180deg);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-3);
		margin-top: var(--space-4);
	}
	.demo {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		transition: border-color var(--motion-fast) var(--easing);
	}
	.demo.ready {
		border-color: color-mix(in srgb, var(--accent) 28%, var(--border-base));
	}
	.demo-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.demo-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0;
	}
	.status {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		padding: 1px var(--space-2);
		border-radius: var(--radius-full);
		white-space: nowrap;
	}
	.status.ok {
		background: var(--success-muted);
		color: var(--success);
	}
	.status.off {
		background: var(--bg-elevated);
		color: var(--fg-subtle);
	}
	.status.checking {
		background: var(--bg-elevated);
		color: var(--fg-muted);
	}
	.demo-desc {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		line-height: var(--leading-normal);
		margin: 0;
	}
	.flow {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}
	.flow-step {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-base);
	}
	.flow-arrow {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		color: var(--fg-subtle);
		line-height: 1;
	}
	.flow-val {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-size: 10px;
		color: var(--accent);
		white-space: nowrap;
	}
	.actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-1);
	}
	.btn {
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		background: var(--bg-base);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		white-space: nowrap;
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn.primary {
		background: var(--accent);
		border-color: transparent;
		color: var(--accent-fg);
	}
	.btn.primary:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.btn:not(.primary):hover:not(:disabled) {
		border-color: var(--border-strong);
	}
	.note {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.loaded-hint {
		font-size: var(--text-xs);
		color: var(--accent);
		margin: 0;
	}
	.err {
		font-size: var(--text-xs);
		color: var(--error);
		margin: 0;
		word-break: break-word;
	}
	.proof {
		margin: var(--space-1) 0 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-2) var(--space-3);
		background: color-mix(in srgb, var(--accent) 4%, var(--bg-base));
		border: 1px solid color-mix(in srgb, var(--accent) 16%, var(--border-base));
		border-radius: var(--radius-md);
	}
	.proof-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.proof-row dt {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		flex: 0 0 auto;
	}
	.proof-row dd {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-base);
		margin: 0;
		text-align: right;
		word-break: break-all;
		min-width: 0;
	}
	.proof-row dd.bad {
		color: var(--error);
		font-family: var(--font-sans);
	}
	@media (max-width: 640px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
