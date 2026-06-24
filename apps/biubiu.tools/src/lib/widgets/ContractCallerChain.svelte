<script lang="ts">
	/**
	 * Chain builder: an ordered list of calls executed atomically in one
	 * transaction (Safe → delegatecall → ChainedMultiSend), where each call can
	 * take a parameter from an earlier call's return value.
	 */
	import { t } from '$lib/i18n';
	import { contractCallerStore as store } from '$lib/contract-caller/caller-store.svelte.js';
	import { staticOutputSlots, isStaticWordType } from '$lib/contract-caller/abi.js';
	import { shortenAddress } from '$lib/contract-caller/format.js';
	import { sendingLabel } from '$lib/contract-caller/send-status.js';
	import type { ChainStep } from '$lib/contract-caller/types.js';
	import SmartParamInput from './SmartParamInput.svelte';
	import { ArrowUp, ArrowDown, X, CornerDownRight } from '@lucide/svelte';

	const nativeSymbol = $derived(store.selectedChain?.nativeCurrency.symbol ?? 'ETH');
	const cs = $derived(store.chainState);

	/** Ref-source options for param `idx` of step at position `stepPos`. */
	function refOptions(stepPos: number) {
		const opts: { value: string; label: string }[] = [];
		for (let j = 0; j < stepPos; j++) {
			for (const o of staticOutputSlots(store.chain[j].method)) {
				opts.push({
					value: `${j}:${o.slot}`,
					label: t('cc.chain.stepOption', { step: j + 1, label: o.label })
				});
			}
		}
		return opts;
	}

	function sourceValue(step: ChainStep, idx: number): string {
		const r = step.refs[idx];
		return r?.kind === 'ref' && r.sourceStep !== undefined
			? `${r.sourceStep}:${r.outputSlot}`
			: 'literal';
	}
</script>

{#if store.chain.length > 0}
	<section class="card">
		<div class="head">
			<h3 class="title">{t('cc.chain.title')} <span class="count">{store.chain.length}</span></h3>
			<span class="hint">{t('cc.chain.hint')}</span>
		</div>

		<ol class="steps">
			{#each store.chain as step, i (step.id)}
				<li class="step">
					<div class="step-head">
						<span class="idx">{i + 1}</span>
						<span class="step-name"
							>{step.name}<span class="step-args"
								>({step.method.inputs.map((p) => p.type).join(', ')})</span
							></span
						>
						<span class="step-to">{shortenAddress(step.to)}</span>
						<div class="step-actions">
							<button
								class="icon"
								onclick={() => store.moveChain(step.id, 'up')}
								disabled={i === 0}
								title={t('cc.chain.moveUp')}><ArrowUp size={14} /></button
							>
							<button
								class="icon"
								onclick={() => store.moveChain(step.id, 'down')}
								disabled={i === store.chain.length - 1}
								title={t('cc.chain.moveDown')}><ArrowDown size={14} /></button
							>
							<button
								class="icon danger"
								onclick={() => store.removeFromChain(step.id)}
								title={t('cc.chain.remove')}><X size={14} /></button
							>
						</div>
					</div>

					{#if step.method.inputs.length > 0}
						<div class="params">
							{#each step.method.inputs as input, idx (idx)}
								{@const opts = refOptions(i)}
								{@const canRef = isStaticWordType(input.type) && opts.length > 0}
								{@const isRef = step.refs[idx]?.kind === 'ref'}
								<div class="param">
									<div class="param-row">
										<span class="param-name"
											>{input.name || `arg ${idx}`}<span class="param-type">{input.type}</span
											></span
										>
										{#if canRef}
											{#if isRef}
												<button
													class="link-btn"
													onclick={() => store.setChainParamSource(step.id, idx, 'literal')}
												>
													{t('cc.chain.useValue')}
												</button>
											{:else}
												<button
													class="link-btn ref-btn"
													onclick={() => store.setChainParamSource(step.id, idx, opts[0].value)}
												>
													<CornerDownRight size={12} />
													{t('cc.chain.usePreviousResult')}
												</button>
											{/if}
										{/if}
									</div>
									{#if isRef}
										<select
											class="src-select"
											value={sourceValue(step, idx)}
											onchange={(e) =>
												store.setChainParamSource(
													step.id,
													idx,
													(e.target as HTMLSelectElement).value
												)}
										>
											{#each opts as opt (opt.value)}
												<option value={opt.value}>{opt.label}</option>
											{/each}
										</select>
									{:else}
										<SmartParamInput
											type={input.type}
											name=""
											value={step.values[idx] ?? ''}
											onChange={(v) => store.setChainLiteral(step.id, idx, v)}
											{nativeSymbol}
										/>
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					{#if step.method.payable}
						<div class="param">
							<span class="param-name"
								>{t('cc.chain.ethValue')} <span class="param-type">{t('cc.chain.wei')}</span></span
							>
							<input
								class="lit-input mono"
								placeholder="0"
								value={step.payableValue}
								oninput={(e) =>
									store.setChainPayable(step.id, (e.target as HTMLInputElement).value)}
							/>
						</div>
					{/if}
				</li>
			{/each}
		</ol>

		<!-- Helper deployment -->
		{#if store.chainHelperDeployed === false}
			<div class="helper-box">
				<p class="helper-text">
					{t('cc.chain.helperSetupPre')}
					<code>{shortenAddress(store.chainHelperAddress)}</code>{t('cc.chain.helperSetupPost')}
				</p>
				{#if store.canChain && store.isLoggedIn}
					<button
						class="btn"
						onclick={() => store.deployChainHelper()}
						disabled={store.chainHelperDeploying}
					>
						{store.chainHelperDeploying ? sendingLabel(cs.phase) : t('cc.chain.deployHelper')}
					</button>
				{:else if !store.isLoggedIn}
					<span class="hint">{t('cc.chain.signInToDeploy')}</span>
				{/if}
			</div>
		{/if}

		<div class="actions">
			{#if store.canChain}
				{#if store.isLoggedIn}
					<button
						class="btn primary"
						onclick={() => store.sendChain()}
						disabled={cs.status === 'sending' || store.chainHelperDeployed !== true}
					>
						{cs.status === 'sending' ? sendingLabel(cs.phase) : t('cc.chain.execute')}
					</button>
				{:else}
					<button class="btn primary" disabled>{t('cc.chain.signInToExecute')}</button>
				{/if}
			{:else}
				<span class="hint">{t('cc.chain.needsBiubiuWallet')}</span>
			{/if}
			<button class="btn ghost" onclick={() => store.clearChain()}>{t('cc.chain.clear')}</button>
		</div>

		{#if cs.status === 'done'}
			<div class="result ok">
				<span class="result-name">{t('cc.chain.executed')}</span>
				{#if cs.explorerUrl}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a class="result-val" href={cs.explorerUrl} target="_blank" rel="noopener noreferrer"
						>{cs.txHash}</a
					>
				{:else}
					<span class="result-val">{cs.txHash}</span>
				{/if}
			</div>
		{:else if cs.status === 'error'}
			<div class="result err">{cs.error}</div>
		{/if}
	</section>
{/if}

<style>
	.card {
		background: var(--bg-raised);
		border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border-base));
		border-radius: var(--radius-xl);
		padding: var(--space-5);
		box-shadow: var(--shadow-md);
		margin-bottom: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.title {
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.count {
		font-size: var(--text-xs);
		font-weight: var(--weight-normal);
		color: var(--accent);
		background: var(--accent-subtle);
		padding: 1px var(--space-2);
		border-radius: var(--radius-full);
	}
	.hint {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		margin: 0;
	}
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.step {
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--bg-sunken);
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.step-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.idx {
		flex: 0 0 auto;
		width: 20px;
		height: 20px;
		display: grid;
		place-items: center;
		background: var(--accent-subtle);
		color: var(--accent);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
	}
	.step-name {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--fg-base);
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.step-args {
		color: var(--fg-subtle);
		font-size: var(--text-xs);
	}
	.step-to {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.step-actions {
		display: flex;
		gap: var(--space-1);
	}
	.ref-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.icon {
		width: 24px;
		height: 24px;
		display: grid;
		place-items: center;
		background: transparent;
		border: 1px solid var(--border-base);
		border-radius: var(--radius-sm);
		color: var(--fg-muted);
		cursor: pointer;
		font-size: var(--text-xs);
	}
	.icon:hover:not(:disabled) {
		color: var(--fg-base);
		border-color: var(--border-strong);
	}
	.icon.danger:hover:not(:disabled) {
		color: var(--error);
	}
	.icon:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.params {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.param {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.param-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.param-name {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}
	.param-type {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		margin-left: var(--space-2);
	}
	.src-select {
		padding: var(--space-2) var(--space-3);
		background: var(--accent-subtle);
		border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border-base));
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--accent);
		width: 100%;
	}
	.link-btn {
		background: transparent;
		border: none;
		padding: 0;
		font-size: var(--text-xs);
		color: var(--accent);
		cursor: pointer;
		white-space: nowrap;
	}
	.link-btn:hover {
		text-decoration: underline;
	}
	.lit-input {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-base);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--fg-base);
	}
	.lit-input.mono {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
	.helper-box {
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.helper-text {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		margin: 0;
		line-height: var(--leading-normal);
	}
	.helper-text code {
		font-family: var(--font-mono);
		color: var(--fg-base);
	}
	.actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		align-items: center;
	}
	.btn {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		background: var(--bg-sunken);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
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
	.btn.ghost {
		background: transparent;
		color: var(--fg-muted);
	}
	.btn.ghost:hover {
		color: var(--fg-base);
		border-color: var(--border-strong);
	}
	.result {
		border-radius: var(--radius-md);
		padding: var(--space-3);
		font-size: var(--text-sm);
	}
	.result.ok {
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.result.err {
		background: var(--error-subtle);
		color: var(--error);
		border: 1px solid color-mix(in srgb, var(--error) 30%, transparent);
		word-break: break-word;
	}
	.result-name {
		font-size: var(--text-xs);
		color: var(--success);
	}
	.result-val {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--accent);
		word-break: break-all;
		text-decoration: none;
	}
	.result-val:hover {
		text-decoration: underline;
	}
</style>
