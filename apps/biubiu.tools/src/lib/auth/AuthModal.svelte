<script lang="ts">
	import { t } from '$lib/i18n';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import { authStore } from './auth-store.svelte.js';
	import { registerPasskey, retryUpload } from './passkey-auth.js';
	import type { LocalKey } from './types.js';

	interface Props {
		open: boolean;
		onClose: () => void;
	}

	let { open, onClose }: Props = $props();

	let mode = $state<'login' | 'register' | 'risk-confirm' | 'upload-retry'>('login');
	let name = $state('');
	let riskAccepted = $state(false);
	let loading = $state(false);
	let error = $state<string | null>(null);
	/** passkey 已创建但上传失败时，保存 localKey 供重试 */
	let pendingLocalKey = $state<LocalKey | null>(null);

	function resetState() {
		mode = 'login';
		name = '';
		riskAccepted = false;
		loading = false;
		error = null;
		pendingLocalKey = null;
		authStore.clearError();
	}

	function handleClose() {
		resetState();
		onClose();
	}

	async function handleLogin() {
		const ok = await authStore.login();
		if (ok) handleClose();
	}

	function proceedToRiskConfirm() {
		if (!name.trim()) return;
		error = null;
		authStore.clearError();
		mode = 'risk-confirm';
	}

	async function handleRegister() {
		if (!riskAccepted) return;
		loading = true;
		error = null;

		const result = await registerPasskey(name.trim());

		if (result.ok) {
			authStore.setUser(result.user);
			loading = false;
			handleClose();
			return;
		}

		loading = false;

		if (result.needsUpload) {
			// passkey 已创建，公钥已存本地，但上传失败
			pendingLocalKey = result.localKey;
			error = result.error;
			mode = 'upload-retry';
		} else {
			error = result.error;
		}
	}

	async function handleRetryUpload() {
		if (!pendingLocalKey) return;
		loading = true;
		error = null;

		const result = await retryUpload(pendingLocalKey);

		if (result.ok) {
			authStore.setUser(result.user);
			loading = false;
			handleClose();
			return;
		}

		error = result.error;
		loading = false;
	}

	const title = $derived(
		mode === 'login'
			? t('auth.login.title')
			: mode === 'register'
				? t('auth.register.title')
				: mode === 'upload-retry'
					? t('auth.uploadRetry.title')
					: t('auth.risk.title')
	);
</script>

<ResponsiveModal {open} onClose={handleClose} {title}>
	<div class="auth-content">
		{#if mode === 'login'}
			<!-- Login View -->
			<p class="auth-description">{t('auth.login.description')}</p>

			<button class="auth-btn primary" onclick={handleLogin} disabled={authStore.loading}>
				{#if authStore.loading}
					<span class="spinner"></span>
					{t('auth.login.loading')}
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
						<polyline points="10 17 15 12 10 7"/>
						<line x1="15" y1="12" x2="3" y2="12"/>
					</svg>
					{t('auth.login.button')}
				{/if}
			</button>

			{#if authStore.error}
				<p class="auth-error">{authStore.error}</p>
			{/if}

			<div class="auth-divider">
				<span>{t('auth.or')}</span>
			</div>

			<button
				class="auth-btn secondary"
				onclick={() => { authStore.clearError(); mode = 'register'; }}
			>
				{t('auth.register.switch')}
			</button>

		{:else if mode === 'register'}
			<!-- Register View -->
			<p class="auth-description">{t('auth.register.description')}</p>

			<div class="input-group">
				<label for="passkey-name" class="input-label">{t('auth.register.nameLabel')}</label>
				<input
					id="passkey-name"
					type="text"
					class="input-field"
					placeholder={t('auth.register.namePlaceholder')}
					bind:value={name}
					maxlength="32"
					onkeydown={(e) => { if (e.key === 'Enter') proceedToRiskConfirm(); }}
				/>
				<p class="input-hint">{t('auth.register.nameHint')}</p>
			</div>

			{#if error}
				<p class="auth-error">{error}</p>
			{/if}

			<button
				class="auth-btn primary"
				onclick={proceedToRiskConfirm}
				disabled={!name.trim()}
			>
				{t('auth.register.continue')}
			</button>

			<button
				class="auth-btn tertiary"
				onclick={() => { error = null; authStore.clearError(); mode = 'login'; }}
			>
				{t('auth.login.switch')}
			</button>

		{:else if mode === 'risk-confirm'}
			<!-- Risk Confirmation View -->
			<div class="risk-warning">
				<div class="risk-icon">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
						<line x1="12" y1="9" x2="12" y2="13"/>
						<line x1="12" y1="17" x2="12.01" y2="17"/>
					</svg>
				</div>
				<h3 class="risk-heading">{t('auth.risk.heading')}</h3>
				<ul class="risk-list">
					<li>{t('auth.risk.item1')}</li>
					<li>{t('auth.risk.item2')}</li>
					<li>{t('auth.risk.item3')}</li>
				</ul>
			</div>

			<label class="risk-checkbox">
				<input type="checkbox" bind:checked={riskAccepted} />
				<span>{t('auth.risk.accept')}</span>
			</label>

			{#if error}
				<p class="auth-error">{error}</p>
			{/if}

			<button
				class="auth-btn primary"
				onclick={handleRegister}
				disabled={!riskAccepted || loading}
			>
				{#if loading}
					<span class="spinner"></span>
					{t('auth.register.loading')}
				{:else}
					{t('auth.register.button')}
				{/if}
			</button>

			<button
				class="auth-btn tertiary"
				onclick={() => { mode = 'register'; riskAccepted = false; }}
				disabled={loading}
			>
				{t('common.cancel')}
			</button>

		{:else if mode === 'upload-retry'}
			<!-- Upload Retry View -->
			<div class="retry-info">
				<div class="retry-icon">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
						<line x1="12" y1="9" x2="12" y2="13"/>
						<line x1="12" y1="17" x2="12.01" y2="17"/>
					</svg>
				</div>
				<p class="retry-description">{t('auth.uploadRetry.description')}</p>
			</div>

			{#if error}
				<p class="auth-error">{error}</p>
			{/if}

			<button
				class="auth-btn primary"
				onclick={handleRetryUpload}
				disabled={loading}
			>
				{#if loading}
					<span class="spinner"></span>
					{t('auth.uploadRetry.loading')}
				{:else}
					{t('auth.uploadRetry.button')}
				{/if}
			</button>
		{/if}
	</div>
</ResponsiveModal>

<style>
	.auth-content {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.auth-description {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
		margin: 0;
	}

	/* Buttons */
	.auth-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-3) var(--space-4);
		border: none;
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.auth-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.auth-btn.primary {
		background: var(--accent);
		color: var(--accent-fg, var(--fg-inverse));
	}

	.auth-btn.primary:not(:disabled):hover {
		background: var(--accent-hover);
	}

	.auth-btn.secondary {
		background: var(--bg-raised);
		color: var(--fg-base);
		border: 1px solid var(--border-base);
	}

	.auth-btn.secondary:not(:disabled):hover {
		background: var(--bg-elevated);
		border-color: var(--border-strong);
	}

	.auth-btn.tertiary {
		background: transparent;
		color: var(--fg-muted);
	}

	.auth-btn.tertiary:not(:disabled):hover {
		color: var(--fg-base);
	}

	/* Divider */
	.auth-divider {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.auth-divider::before,
	.auth-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border-subtle);
	}

	.auth-divider span {
		font-size: var(--text-xs);
		color: var(--fg-faint);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* Input */
	.input-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.input-label {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.input-field {
		width: 100%;
		padding: var(--space-3) var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-family: var(--font-sans);
		outline: none;
		transition: border-color var(--motion-fast) var(--easing);
		box-sizing: border-box;
	}

	.input-field::placeholder {
		color: var(--fg-faint);
	}

	.input-field:focus {
		border-color: var(--accent);
	}

	.input-hint {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		margin: 0;
	}

	/* Error */
	.auth-error {
		font-size: var(--text-sm);
		color: var(--error);
		margin: 0;
		padding: var(--space-2) var(--space-3);
		background: var(--error-muted);
		border-radius: var(--radius-md);
	}

	/* Risk Warning */
	.risk-warning {
		padding: var(--space-4);
		background: rgba(234, 179, 8, 0.06);
		border: 1px solid rgba(234, 179, 8, 0.2);
		border-radius: var(--radius-lg);
		text-align: center;
	}

	.risk-icon {
		display: flex;
		justify-content: center;
		margin-bottom: var(--space-3);
		color: var(--warning);
	}

	.risk-heading {
		font-size: var(--text-base);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0 0 var(--space-3);
	}

	.risk-list {
		text-align: left;
		margin: 0;
		padding-left: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.risk-list li {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
	}

	/* Checkbox */
	.risk-checkbox {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		cursor: pointer;
		font-size: var(--text-sm);
		color: var(--fg-base);
		line-height: var(--leading-normal);
	}

	.risk-checkbox input[type='checkbox'] {
		margin-top: 2px;
		accent-color: var(--accent);
		cursor: pointer;
	}

	/* Retry Info */
	.retry-info {
		text-align: center;
		padding: var(--space-4);
		background: rgba(234, 179, 8, 0.06);
		border: 1px solid rgba(234, 179, 8, 0.2);
		border-radius: var(--radius-lg);
	}

	.retry-icon {
		display: flex;
		justify-content: center;
		margin-bottom: var(--space-3);
		color: var(--warning);
	}

	.retry-description {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
		margin: 0;
	}

	/* Spinner */
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: currentColor;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}
	}
</style>
