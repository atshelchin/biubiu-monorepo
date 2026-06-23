<script lang="ts">
	/**
	 * Auto-generated read/write method lists for the loaded contract.
	 * Phase 1: reads execute over RPC; writes preview encoded calldata.
	 */
	import { contractCallerStore as store } from '$lib/contract-caller/caller-store.svelte.js';
	import type { ParsedMethod } from '$lib/contract-caller/types.js';
	import { buildArgs, encodeCall } from '$lib/contract-caller/encode.js';
	import { toOutputRows } from '$lib/contract-caller/read.js';
	import SmartParamInput from './SmartParamInput.svelte';
	import SmartOutput from './SmartOutput.svelte';

	const nativeSymbol = $derived(store.selectedChain?.nativeCurrency.symbol ?? 'ETH');

	// Encoded-calldata preview (write methods, Phase 1).
	let encoded = $state<Record<string, { ok: boolean; data?: string; error?: string }>>({});

	function encodeWrite(method: ParsedMethod) {
		const raw = store.paramValues[method.signature] ?? [];
		const built = buildArgs(method, raw);
		if (!built.ok) {
			encoded[method.signature] = { ok: false, error: built.error };
			return;
		}
		try {
			encoded[method.signature] = { ok: true, data: encodeCall(method, built.args ?? []) };
		} catch (e) {
			encoded[method.signature] = {
				ok: false,
				error: e instanceof Error ? e.message : 'Encode failed'
			};
		}
	}

	let copied = $state('');
	function copy(text: string, key: string) {
		navigator.clipboard.writeText(text);
		copied = key;
		setTimeout(() => (copied = ''), 1500);
	}

	function sendingLabel(phase?: string): string {
		switch (phase) {
			case 'building':
				return 'Building…';
			case 'estimating':
				return 'Estimating…';
			case 'signing':
				return 'Sign in wallet…';
			case 'submitting':
				return 'Submitting…';
			case 'waiting':
				return 'Confirming…';
			default:
				return 'Checking…';
		}
	}
</script>

{#snippet methodCard(method: ParsedMethod)}
	{@const sig = method.signature}
	{@const isOpen = store.expanded[sig] ?? false}
	{@const read = store.readResults[sig]}
	{@const enc = encoded[sig]}
	{@const w = store.writeState[sig]}
	<div class="method" class:open={isOpen}>
		<button class="method-head" onclick={() => store.toggleExpanded(sig)}>
			<span class="method-name">{method.name}</span>
			<span class="method-args">({method.inputs.map((i) => i.type).join(', ')})</span>
			<span class="spacer"></span>
			<span class="badge {method.isRead ? 'read' : 'write'}"
				>{method.isRead ? 'read' : 'write'}</span
			>
			<span class="chevron" class:up={isOpen}>▾</span>
		</button>

		{#if isOpen}
			<div class="method-body">
				{#each method.inputs as input, i (i)}
					<SmartParamInput
						type={input.type}
						name={input.name ?? `arg ${i}`}
						value={store.paramValues[sig]?.[i] ?? ''}
						onChange={(v) => store.setParamValue(sig, i, v)}
						{nativeSymbol}
					/>
				{/each}

				{#if method.payable}
					<div class="param">
						<span class="param-name">ETH value <span class="param-type">wei</span></span>
						<input
							class="input mono"
							placeholder="0"
							value={store.payableValues[sig] ?? ''}
							oninput={(e) => store.setPayableValue(sig, (e.target as HTMLInputElement).value)}
						/>
					</div>
				{/if}

				<div class="actions">
					{#if method.isRead}
						<button
							class="btn primary sm"
							onclick={() => store.callRead(method)}
							disabled={!store.addressValid}
						>
							{read?.status === 'loading' ? 'Calling…' : 'Call'}
						</button>
						<button
							class="btn sm"
							onclick={() => store.addToChain(method)}
							disabled={!store.addressValid}
							title="Use this call's result in a chain"
						>
							+ Chain
						</button>
					{:else}
						{#if store.canWrite}
							{#if store.isLoggedIn}
								<button
									class="btn primary sm"
									onclick={() => store.sendWrite(method)}
									disabled={!store.addressValid || w?.status === 'sending'}
								>
									{w?.status === 'sending' ? sendingLabel(w.phase) : 'Send'}
								</button>
							{:else}
								<button class="btn sm" disabled title="Sign in (top-right) to send"
									>Sign in to send</button
								>
							{/if}
						{:else}
							<span class="hint-inline">Read-only network — use the calldata</span>
						{/if}
						<button
							class="btn sm"
							onclick={() => store.addToBatch(method)}
							disabled={!store.addressValid}
						>
							+ Batch
						</button>
						<button
							class="btn sm"
							onclick={() => store.addToChain(method)}
							disabled={!store.addressValid}
						>
							+ Chain
						</button>
						<button
							class="btn sm"
							onclick={() => encodeWrite(method)}
							disabled={!store.addressValid}
						>
							Encode calldata
						</button>
					{/if}
				</div>

				<!-- Read result -->
				{#if read?.status === 'success'}
					{@const rows = toOutputRows(method, read.decoded)}
					<div class="result ok">
						{#if rows.length === 0}
							<span class="result-empty">✓ (no return value)</span>
						{:else}
							{#each rows as row, i (i)}
								<div class="out-row">
									<span class="out-name">{row.name}<span class="out-type">{row.type}</span></span>
									<SmartOutput type={row.type} value={row.value} />
								</div>
							{/each}
						{/if}
					</div>
				{:else if read?.status === 'error'}
					<div class="result err">{read.error}</div>
				{/if}

				<!-- Write transaction status -->
				{#if w?.status === 'done'}
					<div class="result ok">
						<div class="out-row">
							<span class="out-name">✓ transaction sent</span>
							{#if w.explorerUrl}
								<!-- eslint-disable svelte/no-navigation-without-resolve -->
								<a
									class="out-val link"
									href={w.explorerUrl}
									target="_blank"
									rel="noopener noreferrer">{w.txHash}</a
								>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
							{:else}
								<span class="out-val">{w.txHash}</span>
							{/if}
						</div>
					</div>
				{:else if w?.status === 'error'}
					<div class="result err">{w.error}</div>
				{/if}

				<!-- Write calldata preview -->
				{#if enc}
					{#if enc.ok}
						<div class="result ok">
							<div class="out-row">
								<span class="out-name">calldata</span>
								<button
									class="out-val mono"
									onclick={() => copy(enc.data ?? '', `${sig}-data`)}
									title="Copy"
								>
									{copied === `${sig}-data` ? 'Copied!' : enc.data}
								</button>
							</div>
						</div>
					{:else}
						<div class="result err">{enc.error}</div>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

{#if store.hasImplAbi}
	<div class="source-toggle">
		<button
			class="src-btn"
			class:active={store.abiSource === 'primary'}
			onclick={() => store.setActiveSource('primary')}
		>
			Proxy ABI ({store.primaryMethods.length})
		</button>
		<button
			class="src-btn"
			class:active={store.abiSource === 'implementation'}
			onclick={() => store.setActiveSource('implementation')}
		>
			Implementation ABI ({store.implMethods.length})
		</button>
	</div>
{/if}

{#if store.methods.length > 0}
	{#if store.readMethods.length > 0}
		<section class="card">
			<h3 class="section-title">Read <span class="count">{store.readMethods.length}</span></h3>
			<div class="method-list">
				{#each store.readMethods as method (method.signature)}
					{@render methodCard(method)}
				{/each}
			</div>
		</section>
	{/if}

	{#if store.writeMethods.length > 0}
		<section class="card">
			<h3 class="section-title">Write <span class="count">{store.writeMethods.length}</span></h3>
			<div class="method-list">
				{#each store.writeMethods as method (method.signature)}
					{@render methodCard(method)}
				{/each}
			</div>
		</section>
	{/if}
{/if}

<style>
	.card {
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		padding: var(--space-5);
		box-shadow: var(--shadow-sm);
		margin-bottom: var(--space-4);
	}
	.source-toggle {
		display: inline-flex;
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		overflow: hidden;
		margin-bottom: var(--space-4);
	}
	.src-btn {
		padding: var(--space-2) var(--space-4);
		background: var(--bg-raised);
		border: none;
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.src-btn.active {
		background: var(--accent);
		color: var(--accent-fg);
	}
	.section-title {
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0 0 var(--space-3);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.count {
		font-size: var(--text-xs);
		font-weight: var(--weight-normal);
		color: var(--fg-subtle);
		background: var(--bg-sunken);
		padding: 1px var(--space-2);
		border-radius: var(--radius-full);
	}
	.method-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.method {
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--bg-sunken);
		overflow: hidden;
		transition:
			border-color var(--motion-fast) var(--easing),
			box-shadow var(--motion-fast) var(--easing),
			opacity var(--motion-fast) var(--easing);
	}
	/* Active (expanded) method pops; collapsed siblings recede so the eye focuses. */
	.method.open {
		border-color: color-mix(in srgb, var(--accent) 40%, var(--border-base));
		border-left: 3px solid var(--accent);
		background: var(--bg-raised);
		box-shadow: var(--shadow-md);
	}
	.method.open .method-head {
		background: color-mix(in srgb, var(--accent) 6%, transparent);
	}
	.method:not(.open):hover {
		border-color: var(--border-base);
	}
	.method-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-3);
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
	}
	.method-name {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}
	.method-args {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 40%;
	}
	.spacer {
		flex: 1;
	}
	.badge {
		font-size: var(--text-xs);
		padding: 1px var(--space-2);
		border-radius: var(--radius-full);
	}
	.badge.read {
		background: var(--accent-subtle);
		color: var(--accent);
	}
	.badge.write {
		background: var(--warning-muted);
		color: var(--warning);
	}
	.chevron {
		color: var(--fg-subtle);
		transition: transform var(--motion-fast) var(--easing);
		font-size: var(--text-xs);
	}
	.chevron.up {
		transform: rotate(180deg);
	}
	.method-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-4);
		border-top: 1px solid var(--border-subtle);
	}
	.param {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
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
	.input {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-base);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--fg-base);
	}
	.input.mono {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
	.input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.hint-inline {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.btn {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		background: var(--bg-base);
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
	.btn.sm {
		padding: var(--space-1) var(--space-3);
		font-size: var(--text-xs);
	}
	.result {
		border-radius: var(--radius-md);
		padding: var(--space-3);
		font-size: var(--text-sm);
	}
	.result.ok {
		background: color-mix(in srgb, var(--accent) 4%, var(--bg-base));
		border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border-base));
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.result.err {
		background: var(--error-subtle);
		color: var(--error);
		border: 1px solid color-mix(in srgb, var(--error) 30%, transparent);
		word-break: break-word;
	}
	.result-empty {
		color: var(--success);
		font-size: var(--text-sm);
	}
	.out-row {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.out-name {
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
	.out-type {
		font-family: var(--font-mono);
		color: var(--fg-faint);
		margin-left: var(--space-2);
	}
	.out-val {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--fg-base);
		background: transparent;
		border: none;
		text-align: left;
		padding: 0;
		cursor: pointer;
		word-break: break-all;
	}
	.out-val:hover {
		color: var(--accent);
	}
	.out-val.link {
		color: var(--accent);
		text-decoration: none;
	}
	.out-val.link:hover {
		text-decoration: underline;
	}
</style>
