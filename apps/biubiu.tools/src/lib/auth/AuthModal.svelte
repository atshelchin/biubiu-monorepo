<script lang="ts">
	import { t } from '$lib/i18n';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import { authStore } from './auth-store.svelte.js';
	import { registerPasskey, retryUpload } from './passkey-auth.js';
	import { detectBrowser } from './browser-check.js';
	import type { LocalKey } from './types.js';
	import { walletStore } from '$lib/wallet';
	import type { Eip6963ProviderDetail } from '$lib/wallet';
	import { renderSVG } from 'uqr';
	import { ArrowLeft } from '@lucide/svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
	}

	let { open, onClose }: Props = $props();

	let mode = $state<
		| 'connect'
		| 'login'
		| 'register'
		| 'browser-warning'
		| 'risk-confirm'
		| 'upload-retry'
		| 'walletpair'
	>('connect');
	const browserInfo = detectBrowser();
	let name = $state('');
	let riskAccepted = $state(false);
	let loading = $state(false);
	let error = $state<string | null>(null);
	/** passkey 已创建但上传失败时，保存 localKey 供重试 */
	let pendingLocalKey = $state<LocalKey | null>(null);

	// ── 外部钱包（inject / EIP-6963）──
	let injectedWallets = $state<Eip6963ProviderDetail[]>([]);
	let discovering = $state(false);
	let discovered = false;
	let connectingId = $state<string | null>(null);
	let connectError = $state<string | null>(null);

	// ── walletpair（扫码配对）──
	let walletpairUri = $state<string | null>(null);
	let walletpairFingerprint = $state('');
	let walletpairStarting = $state(false);
	let walletpairCancel: (() => void) | null = null;
	const walletpairQr = $derived(
		walletpairUri ? renderSVG(walletpairUri, { border: 1 }) : ''
	);

	async function handleWalletPair() {
		mode = 'walletpair';
		connectError = null;
		walletpairUri = null;
		walletpairStarting = true;
		try {
			const view = await walletStore.startWalletPair();
			walletpairUri = view.uri;
			walletpairFingerprint = view.fingerprint;
			walletpairCancel = view.cancel;
			walletpairStarting = false;
			const res = await view.done;
			if (res.ok) {
				// 连接成功：会话已交给已连接的 WalletPairWallet（由 walletStore 持有，
				// 断开时才 close）。清掉 cancel 引用，避免 resetState 把活会话关掉。
				walletpairCancel = null;
				handleClose();
			} else {
				connectError =
					res.reason === 'not-smart-account'
						? t('auth.connect.notSmartAccount')
						: (res.message ?? t('auth.connect.connecting'));
				mode = 'connect';
			}
		} catch (err) {
			walletpairStarting = false;
			connectError = err instanceof Error ? err.message : String(err);
			mode = 'connect';
		}
	}

	function cancelWalletPair() {
		walletpairCancel?.();
		walletpairCancel = null;
		walletpairUri = null;
		mode = 'connect';
	}

	// 进入连接选择页时发现注入钱包（每次打开重新发现）。
	$effect(() => {
		if (open && mode === 'connect' && !discovered) {
			discovered = true;
			discovering = true;
			walletStore.discoverInject().then((list) => {
				injectedWallets = list;
				discovering = false;
			});
		}
	});

	async function handleConnectInject(detail: Eip6963ProviderDetail) {
		connectingId = detail.info.uuid;
		connectError = null;
		const res = await walletStore.connectInject(detail);
		connectingId = null;
		if (res.ok) {
			handleClose();
		} else {
			connectError =
				res.reason === 'not-smart-account'
					? t('auth.connect.notSmartAccount')
					: (res.message ?? t('auth.connect.connecting'));
		}
	}

	function resetState() {
		mode = 'connect';
		name = '';
		riskAccepted = false;
		loading = false;
		error = null;
		pendingLocalKey = null;
		injectedWallets = [];
		discovering = false;
		discovered = false;
		connectingId = null;
		connectError = null;
		walletpairCancel?.();
		walletpairCancel = null;
		walletpairUri = null;
		walletpairFingerprint = '';
		walletpairStarting = false;
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
		if (!browserInfo.supported) {
			mode = 'browser-warning';
		} else {
			mode = 'risk-confirm';
		}
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
		mode === 'connect'
			? t('auth.connect.title')
			: mode === 'walletpair'
				? t('auth.connect.walletpair')
				: mode === 'login'
					? t('auth.login.title')
					: mode === 'register'
				? t('auth.register.title')
				: mode === 'upload-retry'
					? t('auth.uploadRetry.title')
					: mode === 'browser-warning'
						? t('auth.browser.title')
						: t('auth.risk.title')
	);
</script>

<ResponsiveModal {open} onClose={handleClose} {title}>
	<div class="auth-content">
		{#if mode === 'connect'}
			<!-- Wallet method picker -->
			<p class="auth-description">{t('auth.connect.subtitle')}</p>

			<!-- Recommended: biubiu built-in -->
			<button
				class="wallet-option recommended"
				onclick={() => { connectError = null; authStore.clearError(); mode = 'login'; }}
				disabled={connectingId !== null}
			>
				<span class="wallet-icon biubiu">B</span>
				<span class="wallet-meta">
					<span class="wallet-name">{t('auth.connect.biubiu')}</span>
					<span class="wallet-sub">{t('auth.connect.biubiuDesc')}</span>
				</span>
				<span class="recommended-badge">{t('auth.connect.recommended')}</span>
			</button>

			<div class="section-label">{t('auth.connect.browserHeading')}</div>

			{#if discovering}
				<div class="wallet-hint"><span class="spinner"></span>{t('auth.connect.discovering')}</div>
			{:else if injectedWallets.length === 0}
				<p class="wallet-hint">{t('auth.connect.noInjected')}</p>
			{:else}
				<div class="wallet-list">
					{#each injectedWallets as w (w.info.uuid)}
						<button
							class="wallet-option"
							onclick={() => handleConnectInject(w)}
							disabled={connectingId !== null}
						>
							{#if w.info.icon}
								<img class="wallet-icon" src={w.info.icon} alt={w.info.name} />
							{:else}
								<span class="wallet-icon">{w.info.name.charAt(0)}</span>
							{/if}
							<span class="wallet-meta"><span class="wallet-name">{w.info.name}</span></span>
							{#if connectingId === w.info.uuid}
								<span class="spinner"></span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}

			<!-- WalletPair (scan QR) -->
			<button class="wallet-option" onclick={handleWalletPair} disabled={connectingId !== null}>
				<span class="wallet-icon">
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<rect x="3" y="3" width="7" height="7" rx="1" />
						<rect x="14" y="3" width="7" height="7" rx="1" />
						<rect x="3" y="14" width="7" height="7" rx="1" />
						<path d="M14 14h3v3" />
						<path d="M21 14v7h-7" />
						<path d="M17 21h.01" />
						<path d="M21 17h.01" />
					</svg>
				</span>
				<span class="wallet-meta"><span class="wallet-name">{t('auth.connect.walletpair')}</span></span>
			</button>

			{#if connectError}
				<p class="auth-error">{connectError}</p>
			{/if}

		{:else if mode === 'walletpair'}
			<!-- WalletPair QR pairing -->
			<p class="auth-description">{t('auth.connect.walletpairHint')}</p>

			{#if walletpairStarting || !walletpairUri}
				<div class="wallet-hint"><span class="spinner"></span>{t('auth.connect.connecting')}</div>
			{:else}
				<div class="qr-wrap">{@html walletpairQr}</div>
				<div class="fingerprint">
					<span class="fingerprint-label">{t('auth.connect.fingerprint')}</span>
					<span class="fingerprint-code">{walletpairFingerprint}</span>
				</div>
			{/if}

			{#if connectError}
				<p class="auth-error">{connectError}</p>
			{/if}

			<button class="auth-btn tertiary back-btn" onclick={cancelWalletPair}
			><ArrowLeft size={14} /> {t('auth.connect.back')}</button
		>

		{:else if mode === 'login'}
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

			<button
				class="auth-btn tertiary back-btn"
				onclick={() => {
					authStore.clearError();
					mode = 'connect';
				}}
			>
				<ArrowLeft size={14} /> {t('auth.connect.back')}
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

		{:else if mode === 'browser-warning'}
			<!-- Browser Incompatibility Warning -->
			<div class="risk-warning">
				<div class="risk-icon">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="10"/>
						<line x1="15" y1="9" x2="9" y2="15"/>
						<line x1="9" y1="9" x2="15" y2="15"/>
					</svg>
				</div>
				<h3 class="risk-heading">{t('auth.browser.heading')}</h3>
				<p class="browser-detected">{t('auth.browser.detected', { browser: browserInfo.name })}</p>
				<ul class="risk-list">
					<li>{t('auth.browser.item1')}</li>
					<li>{t('auth.browser.item2')}</li>
				</ul>
				<p class="browser-supported">{t('auth.browser.supported')}</p>
				<p class="browser-list">Chrome, Safari, Edge, Firefox, Brave, Opera</p>
			</div>

			<button
				class="auth-btn secondary"
				onclick={() => { mode = 'register'; }}
			>
				{t('common.cancel')}
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
					<li>{t('auth.risk.item4')}</li>
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

	/* Wallet method picker */
	.wallet-option {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		color: var(--fg-base);
		text-align: left;
		cursor: pointer;
		transition:
			transform var(--motion-fast) var(--easing),
			border-color var(--motion-fast) var(--easing),
			background var(--motion-fast) var(--easing);
	}

	.wallet-option:not(:disabled):hover {
		transform: translateY(-1px);
		background: var(--bg-elevated);
		border-color: var(--border-strong);
	}

	.wallet-option:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.wallet-option.recommended {
		border-color: var(--accent);
		background: var(--accent-subtle, var(--bg-raised));
	}

	.wallet-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		flex-shrink: 0;
		border-radius: var(--radius-md);
		object-fit: contain;
		background: var(--bg-sunken);
		font-weight: var(--weight-bold);
		font-size: var(--text-sm);
	}

	.wallet-icon.biubiu {
		background: var(--accent);
		color: var(--accent-fg, var(--fg-inverse));
	}

	.wallet-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.wallet-name {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
	}

	.wallet-sub {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	.recommended-badge {
		flex-shrink: 0;
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
		background: var(--accent);
		color: var(--accent-fg, var(--fg-inverse));
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
	}

	/* WalletPair QR */
	.qr-wrap {
		display: flex;
		justify-content: center;
		padding: var(--space-4);
		background: #fff;
		border-radius: var(--radius-lg);
		border: 1px solid var(--border-base);
	}

	.qr-wrap :global(svg) {
		width: 200px;
		height: 200px;
		display: block;
	}

	.fingerprint {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
	}

	.fingerprint-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.fingerprint-code {
		font-family: var(--font-mono);
		font-size: var(--text-2xl);
		font-weight: var(--weight-bold);
		letter-spacing: 0.2em;
		color: var(--fg-base);
	}

	.section-label {
		font-size: var(--text-xs);
		color: var(--fg-faint);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-top: var(--space-1);
	}

	.wallet-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.wallet-hint {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin: 0;
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

	/* Browser warning */
	.browser-detected {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--error);
		margin: 0 0 var(--space-2);
	}

	.browser-supported {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		margin: var(--space-3) 0 var(--space-1);
	}

	.browser-list {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
		margin: 0;
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
