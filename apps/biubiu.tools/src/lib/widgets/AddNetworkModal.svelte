<script lang="ts">
	import { onDestroy } from 'svelte';
	import { t } from '$lib/i18n';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import { lookupChain } from '$lib/evm/chain-registry';

	interface Props {
		open: boolean;
		onClose: () => void;
		existingChainIds: number[];
		onSubmit: (data: {
			name: string;
			chainId: number;
			rpcs: string[];
			symbol: string;
			decimals: number;
		}) => Promise<void> | void;
	}

	let { open, onClose, existingChainIds, onSubmit }: Props = $props();

	let name = $state('');
	let chainId = $state('');
	let rpcsText = $state('');
	let symbol = $state('');
	let decimals = $state('18');
	let error = $state('');
	let submitting = $state(false);

	// Auto-lookup: type a chain ID → fill name/symbol/decimals/RPCs from the
	// public chain registry. `manualEdit` guards against clobbering anything the
	// user typed themselves (and keeps the manual-entry path fully intact).
	let lookupStatus = $state<'idle' | 'loading' | 'found' | 'notfound' | 'error'>('idle');
	let manualEdit = $state(false);
	let lookupTimer: ReturnType<typeof setTimeout> | undefined;
	let lookupAbort: AbortController | undefined;
	let lastLookedUp = '';

	onDestroy(() => {
		if (lookupTimer) clearTimeout(lookupTimer);
		lookupAbort?.abort();
	});

	function reset() {
		name = '';
		chainId = '';
		rpcsText = '';
		symbol = '';
		decimals = '18';
		error = '';
		submitting = false;
		lookupStatus = 'idle';
		manualEdit = false;
		lastLookedUp = '';
		if (lookupTimer) clearTimeout(lookupTimer);
		lookupAbort?.abort();
	}

	function close() {
		reset();
		onClose();
	}

	function onChainIdInput(value: string) {
		chainId = value;
		error = '';
		if (lookupTimer) clearTimeout(lookupTimer);
		const id = Number(value);
		if (!Number.isInteger(id) || id <= 0) {
			lookupStatus = 'idle';
			return;
		}
		lookupTimer = setTimeout(() => runLookup(id), 500);
	}

	async function runLookup(id: number) {
		if (String(id) === lastLookedUp) return;
		lastLookedUp = String(id);
		lookupAbort?.abort();
		const ctrl = new AbortController();
		lookupAbort = ctrl;
		lookupStatus = 'loading';
		try {
			const info = await lookupChain(id, ctrl.signal);
			if (ctrl.signal.aborted) return;
			if (!info) {
				lookupStatus = 'notfound';
				return;
			}
			lookupStatus = 'found';
			// Only fill from the registry if the user hasn't typed their own values.
			if (!manualEdit) {
				if (info.name) name = info.name;
				if (info.symbol) symbol = info.symbol;
				decimals = String(info.decimals);
				if (info.rpcs.length) rpcsText = info.rpcs.join('\n');
			}
		} catch (e) {
			if ((e as Error)?.name === 'AbortError') return;
			lookupStatus = 'error';
		}
	}

	async function handleSubmit() {
		error = '';
		const trimmedName = name.trim();
		const id = Number(chainId);
		const rpcs = rpcsText
			.split('\n')
			.map((r) => r.trim())
			.filter((r) => /^https?:\/\//.test(r));
		const dec = Number(decimals);

		if (!trimmedName) return (error = t('widgets.addNetwork.errorName'));
		if (!Number.isInteger(id) || id <= 0) return (error = t('widgets.addNetwork.errorChainId'));
		if (existingChainIds.includes(id)) return (error = t('widgets.addNetwork.errorDuplicate'));
		if (rpcs.length === 0) return (error = t('widgets.addNetwork.errorRpcs'));
		if (!symbol.trim()) return (error = t('widgets.addNetwork.errorSymbol'));

		submitting = true;
		try {
			await onSubmit({
				name: trimmedName,
				chainId: id,
				rpcs,
				symbol: symbol.trim(),
				decimals: Number.isFinite(dec) ? dec : 18,
			});
			close();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			submitting = false;
		}
	}
</script>

<ResponsiveModal {open} onClose={close} title={t('widgets.addNetwork.title')}>
	<div class="form">
		<!-- Chain ID drives auto-fill from the public chain registry -->
		<label class="field">
			<span class="label">{t('widgets.addNetwork.chainId')}</span>
			<input
				class="input"
				type="number"
				value={chainId}
				oninput={(e) => onChainIdInput((e.currentTarget as HTMLInputElement).value)}
				placeholder={t('widgets.addNetwork.chainIdPlaceholder')}
			/>
			{#if lookupStatus === 'loading'}
				<span class="lookup lookup-loading">{t('widgets.addNetwork.lookingUp')}</span>
			{:else if lookupStatus === 'found'}
				<span class="lookup lookup-ok">{t('widgets.addNetwork.lookupFound')}</span>
			{:else if lookupStatus === 'notfound'}
				<span class="lookup lookup-warn">{t('widgets.addNetwork.lookupNotFound')}</span>
			{:else if lookupStatus === 'error'}
				<span class="lookup lookup-warn">{t('widgets.addNetwork.lookupError')}</span>
			{:else}
				<span class="lookup lookup-hint">{t('widgets.addNetwork.lookupHint')}</span>
			{/if}
		</label>

		<div class="row">
			<label class="field">
				<span class="label">{t('widgets.addNetwork.name')}</span>
				<input
					class="input"
					bind:value={name}
					oninput={() => (manualEdit = true)}
					placeholder={t('widgets.addNetwork.namePlaceholder')}
				/>
			</label>
			<label class="field field-narrow">
				<span class="label">{t('widgets.addNetwork.symbol')}</span>
				<input
					class="input"
					bind:value={symbol}
					oninput={() => (manualEdit = true)}
					placeholder={t('widgets.addNetwork.symbolPlaceholder')}
				/>
			</label>
			<label class="field field-narrow">
				<span class="label">{t('widgets.addNetwork.decimals')}</span>
				<input
					class="input"
					type="number"
					bind:value={decimals}
					oninput={() => (manualEdit = true)}
				/>
			</label>
		</div>

		<label class="field">
			<span class="label">{t('widgets.addNetwork.rpcs')}</span>
			<textarea
				class="input textarea"
				bind:value={rpcsText}
				oninput={() => (manualEdit = true)}
				rows="3"
				placeholder={t('widgets.addNetwork.rpcsPlaceholder')}
			></textarea>
		</label>

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<div class="actions">
			<button class="btn btn-secondary" onclick={close} disabled={submitting}>
				{t('widgets.addNetwork.cancel')}
			</button>
			<button class="btn btn-primary" onclick={handleSubmit} disabled={submitting}>
				{t('widgets.addNetwork.submit')}
			</button>
		</div>
	</div>
</ResponsiveModal>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.row {
		display: flex;
		gap: var(--space-3);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		flex: 1;
	}

	.field-narrow {
		max-width: 110px;
	}

	.label {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--fg-muted);
	}

	.input {
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--fg-base);
		transition: border-color var(--motion-fast) var(--easing);
	}

	.input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}

	.textarea {
		resize: vertical;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.lookup {
		font-size: var(--text-xs);
		margin-top: 2px;
	}

	.lookup-hint {
		color: var(--fg-subtle);
	}

	.lookup-loading {
		color: var(--fg-muted);
	}

	.lookup-ok {
		color: var(--success);
	}

	.lookup-warn {
		color: var(--warning);
	}

	.error {
		font-size: var(--text-sm);
		color: var(--error);
		margin: 0;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.btn {
		padding: var(--space-2) var(--space-5);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		border: none;
		transition: all var(--motion-fast) var(--easing);
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.btn-primary {
		background: var(--accent);
		color: var(--accent-fg);
	}

	.btn-primary:not(:disabled):hover {
		background: var(--accent-hover);
	}

	.btn-secondary {
		background: var(--bg-raised);
		color: var(--fg-base);
		border: 1px solid var(--border-base);
	}

	.btn-secondary:not(:disabled):hover {
		border-color: var(--border-strong);
	}

	@media (max-width: 640px) {
		.row {
			flex-wrap: wrap;
		}
		.field-narrow {
			max-width: none;
		}
	}
</style>
