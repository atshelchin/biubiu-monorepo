<script lang="ts">
	import { t } from '$lib/i18n';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';

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

	function reset() {
		name = '';
		chainId = '';
		rpcsText = '';
		symbol = '';
		decimals = '18';
		error = '';
		submitting = false;
	}

	function close() {
		reset();
		onClose();
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
		<label class="field">
			<span class="label">{t('widgets.addNetwork.name')}</span>
			<input class="input" bind:value={name} placeholder={t('widgets.addNetwork.namePlaceholder')} />
		</label>

		<div class="row">
			<label class="field">
				<span class="label">{t('widgets.addNetwork.chainId')}</span>
				<input
					class="input"
					type="number"
					bind:value={chainId}
					placeholder={t('widgets.addNetwork.chainIdPlaceholder')}
				/>
			</label>
			<label class="field field-narrow">
				<span class="label">{t('widgets.addNetwork.decimals')}</span>
				<input class="input" type="number" bind:value={decimals} />
			</label>
		</div>

		<label class="field">
			<span class="label">{t('widgets.addNetwork.symbol')}</span>
			<input class="input" bind:value={symbol} placeholder={t('widgets.addNetwork.symbolPlaceholder')} />
		</label>

		<label class="field">
			<span class="label">{t('widgets.addNetwork.rpcs')}</span>
			<textarea
				class="input textarea"
				bind:value={rpcsText}
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
		max-width: 120px;
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
	}

	.textarea {
		resize: vertical;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
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
</style>
