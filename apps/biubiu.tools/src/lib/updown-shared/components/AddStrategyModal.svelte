<script lang="ts">
	import type { ValidationProgress } from '$lib/btc-updown-strategies';
	import type { TranslateFn } from '../types.js';
	import { VALIDATE_STEP_KEYS } from '../constants.js';

	interface Props {
		open: boolean;
		urlInput: string;
		urlError: string;
		validating: boolean;
		validationSteps: ValidationProgress[];
		t: TranslateFn;
		onClose: () => void;
		onSubmit: () => void;
		onUrlChange: (url: string) => void;
	}

	let {
		open,
		urlInput,
		urlError,
		validating,
		validationSteps,
		t,
		onClose,
		onSubmit,
		onUrlChange
	}: Props = $props();

	function handleClose() {
		if (!validating) onClose();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={handleClose}>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<button class="modal-close" aria-label="Close" disabled={validating} onclick={handleClose}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg
				>
			</button>
			<div class="modal-icon">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path
						d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
					/></svg
				>
			</div>
			<h3 class="modal-title">{t('btcUpdown.strategy.addCustom')}</h3>
			<p class="modal-desc">{t('btcUpdown.strategy.addCustomDesc')}</p>
			<div class="modal-input-wrap" class:input-error={!!urlError}>
				<svg
					class="modal-input-icon"
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path
						d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
					/></svg
				>
				<input
					type="url"
					class="strategy-url-input"
					placeholder="https://your-server.com/api/v1"
					value={urlInput}
					disabled={validating}
					oninput={(e) => onUrlChange(e.currentTarget.value)}
					onkeydown={(e) => {
						if (e.key === 'Enter') onSubmit();
					}}
				/>
			</div>
			{#if urlError}
				<p class="url-error">{urlError}</p>
			{/if}
			{#if validationSteps.length > 0}
				<div class="validation-steps">
					{#each validationSteps as step (step.step)}
						<div
							class="validation-step"
							class:step-ok={step.status === 'ok'}
							class:step-fail={step.status === 'fail'}
							class:step-checking={step.status === 'checking'}
						>
							<span class="step-icon">
								{#if step.status === 'ok'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										stroke-linecap="round"
										stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
									>
								{:else if step.status === 'fail'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										stroke-linecap="round"
										stroke-linejoin="round"
										><line x1="18" y1="6" x2="6" y2="18" /><line
											x1="6"
											y1="6"
											x2="18"
											y2="18"
										/></svg
									>
								{:else if step.status === 'checking'}
									<span class="step-spinner"></span>
								{:else}
									<span class="step-pending-dot"></span>
								{/if}
							</span>
							<span class="step-label"
								>{t(
									VALIDATE_STEP_KEYS[step.step as keyof typeof VALIDATE_STEP_KEYS] ?? step.step
								)}</span
							>
						</div>
					{/each}
				</div>
			{/if}
			<div class="modal-actions">
				<button class="modal-btn cancel" disabled={validating} onclick={handleClose}>
					{t('btcUpdown.strategy.cancel')}
				</button>
				<button
					class="modal-btn primary"
					disabled={validating || !urlInput.trim()}
					onclick={onSubmit}
				>
					{#if validating}
						<span class="btn-spinner"></span>
					{/if}
					{validating ? t('btcUpdown.strategy.validating') : t('btcUpdown.strategy.add')}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 300;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		padding: var(--space-4);
		animation: modal-fade-in 0.2s ease-out;
	}
	@keyframes modal-fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes modal-scale-in {
		from {
			opacity: 0;
			transform: scale(0.96) translateY(8px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}
	.modal {
		position: relative;
		width: 100%;
		max-width: 420px;
		padding: var(--space-8, 2rem) var(--space-7, 1.75rem) var(--space-6);
		border-radius: 16px;
		background: rgba(30, 30, 34, 0.98);
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow:
			0 24px 48px rgba(0, 0, 0, 0.4),
			0 0 0 1px rgba(255, 255, 255, 0.05) inset;
		text-align: center;
		animation: modal-scale-in 0.25s ease-out;
	}
	.modal-close {
		position: absolute;
		top: 12px;
		right: 12px;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.06);
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.modal-close:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--fg-base);
	}
	.modal-icon {
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto var(--space-4);
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.06);
		color: var(--accent);
	}
	.modal-title {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0 0 var(--space-2);
	}
	.modal-desc {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin: 0 0 var(--space-5, 1.25rem);
		line-height: 1.5;
	}
	.modal-input-wrap {
		position: relative;
		display: flex;
		align-items: center;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		background: rgba(0, 0, 0, 0.2);
		transition:
			border-color var(--motion-fast) var(--easing),
			box-shadow var(--motion-fast) var(--easing);
	}
	.modal-input-wrap:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(54, 160, 122, 0.15);
	}
	.modal-input-wrap.input-error {
		border-color: #ef4444;
		box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
	}
	.modal-input-icon {
		position: absolute;
		left: 12px;
		color: var(--fg-muted);
		pointer-events: none;
		flex-shrink: 0;
	}
	.strategy-url-input {
		width: 100%;
		padding: 10px 12px 10px 36px;
		border: none;
		border-radius: 10px;
		background: transparent;
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-family: var(--font-mono, ui-monospace, monospace);
		outline: none;
		box-sizing: border-box;
	}
	.strategy-url-input::placeholder {
		color: rgba(255, 255, 255, 0.25);
	}
	.url-error {
		font-size: var(--text-xs);
		color: #ef4444;
		margin: var(--space-2) 0 0;
		text-align: left;
	}
	.modal-actions {
		display: flex;
		gap: var(--space-3);
		margin-top: var(--space-5, 1.25rem);
	}
	.modal-btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 10px var(--space-4);
		border-radius: 10px;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.modal-btn.cancel {
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.04);
		color: var(--fg-muted);
	}
	.modal-btn.cancel:hover {
		background: rgba(255, 255, 255, 0.08);
		color: var(--fg-base);
	}
	.modal-btn.primary {
		border: none;
		background: var(--accent);
		color: white;
	}
	.modal-btn.primary:hover {
		filter: brightness(1.1);
	}
	.modal-btn.primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		filter: none;
	}
	.btn-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}
	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
	.validation-steps {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 12px;
		margin-top: var(--space-3);
		padding: 10px 12px;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.06);
	}
	.validation-step {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--text-xs);
		color: var(--fg-muted);
		transition: color 0.15s ease;
	}
	.validation-step.step-ok {
		color: #34d399;
	}
	.validation-step.step-fail {
		color: #ef4444;
	}
	.validation-step.step-checking {
		color: var(--fg-base);
	}
	.step-icon {
		width: 14px;
		height: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.step-spinner {
		width: 10px;
		height: 10px;
		border: 1.5px solid rgba(255, 255, 255, 0.2);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}
	.step-pending-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.15);
	}
	/* Light mode */
	:global([data-theme='light']) .modal-overlay {
		background: rgba(0, 0, 0, 0.4);
	}
	:global([data-theme='light']) .modal {
		background: #fff;
		border-color: rgba(0, 0, 0, 0.08);
		box-shadow:
			0 24px 48px rgba(0, 0, 0, 0.15),
			0 0 0 1px rgba(0, 0, 0, 0.04) inset;
	}
	:global([data-theme='light']) .modal-close {
		background: rgba(0, 0, 0, 0.04);
		color: rgba(0, 0, 0, 0.4);
	}
	:global([data-theme='light']) .modal-close:hover {
		background: rgba(0, 0, 0, 0.08);
		color: rgba(0, 0, 0, 0.6);
	}
	:global([data-theme='light']) .modal-icon {
		background: rgba(0, 0, 0, 0.04);
	}
	:global([data-theme='light']) .modal-input-wrap {
		background: rgba(0, 0, 0, 0.03);
		border-color: rgba(0, 0, 0, 0.1);
	}
	:global([data-theme='light']) .modal-input-wrap:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(54, 160, 122, 0.12);
	}
	:global([data-theme='light']) .strategy-url-input::placeholder {
		color: rgba(0, 0, 0, 0.3);
	}
	:global([data-theme='light']) .modal-btn.cancel {
		background: rgba(0, 0, 0, 0.04);
		border-color: rgba(0, 0, 0, 0.08);
	}
	:global([data-theme='light']) .modal-btn.cancel:hover {
		background: rgba(0, 0, 0, 0.08);
	}
	:global([data-theme='light']) .validation-steps {
		background: rgba(0, 0, 0, 0.02);
		border-color: rgba(0, 0, 0, 0.06);
	}
	:global([data-theme='light']) .validation-step.step-ok {
		color: #059669;
	}
	:global([data-theme='light']) .validation-step.step-fail {
		color: #dc2626;
	}
	:global([data-theme='light']) .step-pending-dot {
		background: rgba(0, 0, 0, 0.15);
	}
	:global([data-theme='light']) .step-spinner {
		border-color: rgba(0, 0, 0, 0.1);
		border-top-color: var(--accent);
	}
	@media (max-width: 768px) {
		.strategy-url-input {
			font-size: 16px;
		}
	}
</style>
