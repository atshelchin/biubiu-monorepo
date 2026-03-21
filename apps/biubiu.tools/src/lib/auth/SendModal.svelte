<script lang="ts">
	import { t } from '$lib/i18n';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import { authStore } from './auth-store.svelte.js';
	import { sendToken, type SendStatus, type SendResult } from './safe-tx/send-token.js';
	import { formatBalance, type TokenBalance } from './wallet.js';
	import { isAddress } from 'viem';

	interface Props {
		open: boolean;
		onClose: () => void;
		/** 当前有余额的 token 列表 */
		balances: TokenBalance[];
	}

	let { open, onClose, balances }: Props = $props();

	let selectedIndex = $state(0);
	let recipient = $state('');
	let amount = $state('');
	let status = $state<SendStatus | null>(null);
	let result = $state<SendResult | null>(null);
	let error = $state<string | null>(null);

	const user = $derived(authStore.user);
	const selectedToken = $derived(balances[selectedIndex] ?? null);
	const isValidRecipient = $derived(recipient.length === 42 && isAddress(recipient));
	const isValidAmount = $derived(() => {
		if (!selectedToken) return false;
		const num = parseFloat(amount);
		return num > 0 && num <= parseFloat(selectedToken.balance);
	});
	const canSubmit = $derived(isValidRecipient && isValidAmount() && !status && selectedToken);

	function handleClose() {
		if (status && status !== 'confirmed' && status !== 'failed') return;
		recipient = '';
		amount = '';
		selectedIndex = 0;
		status = null;
		result = null;
		error = null;
		onClose();
	}

	function setMax() {
		if (!selectedToken) return;
		const isNative = !selectedToken.tokenAddress;
		if (isNative) {
			const max = Math.max(0, parseFloat(selectedToken.balance) - 0.0003);
			amount = max > 0 ? formatBalance(String(max)) : '0';
		} else {
			amount = formatBalance(selectedToken.balance);
		}
	}

	async function handleSend() {
		if (!user || !canSubmit || !selectedToken) return;
		error = null;
		result = null;

		const sendResult = await sendToken({
			safeAddress: user.safeAddress as `0x${string}`,
			publicKeyHex: user.publicKey,
			credentialId: user.credentialId,
			rpId: user.rpId,
			recipient: recipient as `0x${string}`,
			amount,
			network: selectedToken.network,
			tokenAddress: selectedToken.tokenAddress ?? null,
			decimals: selectedToken.decimals,
			onStatus: (s) => { status = s; }
		});

		result = sendResult;
		if (!sendResult.success) {
			error = sendResult.error ?? 'Unknown error';
		}
	}

	function getStatusMessage(s: SendStatus): string {
		switch (s) {
			case 'checking': return t('auth.send.statusChecking');
			case 'building': return t('auth.send.statusBuilding');
			case 'estimating': return t('auth.send.statusEstimating');
			case 'signing': return t('auth.send.statusSigning');
			case 'submitting': return t('auth.send.statusSubmitting');
			case 'waiting': return t('auth.send.statusWaiting');
			case 'confirmed': return t('auth.send.statusConfirmed');
			case 'failed': return t('auth.send.statusFailed');
		}
	}
</script>

<ResponsiveModal {open} onClose={handleClose} title={t('auth.send.title')} zOffset={10}>
	<div class="send-content">
		{#if !status}
			<!-- Token Selector -->
			{#if balances.length > 1}
				<div class="token-selector">
					{#each balances as token, i}
						<button
							class="token-option"
							class:selected={selectedIndex === i}
							onclick={() => { selectedIndex = i; amount = ''; }}
						>
							<span class="token-symbol-badge">{token.symbol}</span>
							<span class="token-chain-name">{token.chainName}</span>
							<span class="token-bal">{formatBalance(token.balance)}</span>
						</button>
					{/each}
				</div>
			{:else if balances.length === 1}
				<div class="single-token">
					<span class="token-symbol-badge">{balances[0].symbol}</span>
					<span class="token-chain-name">{balances[0].chainName}</span>
					<span class="token-bal">{formatBalance(balances[0].balance)}</span>
				</div>
			{/if}

			<!-- Recipient -->
			<div class="input-group">
				<label class="input-label" for="send-recipient">{t('auth.send.recipient')}</label>
				<input
					id="send-recipient"
					type="text"
					class="input-field"
					placeholder="0x..."
					bind:value={recipient}
					spellcheck="false"
				/>
			</div>

			<!-- Amount -->
			<div class="input-group">
				<div class="amount-header">
					<label class="input-label" for="send-amount">{t('auth.send.amount')}</label>
					<button class="max-btn" onclick={setMax}>Max</button>
				</div>
				<div class="amount-row">
					<input
						id="send-amount"
						type="number"
						class="input-field amount-input"
						placeholder="0.0"
						bind:value={amount}
						step="any"
						min="0"
					/>
					<span class="amount-unit">{selectedToken?.symbol ?? ''}</span>
				</div>
			</div>

			{#if error}
				<p class="send-error">{error}</p>
			{/if}

			<button class="send-btn" onclick={handleSend} disabled={!canSubmit}>
				{t('auth.send.button')}
			</button>

		{:else}
			<!-- Status Phase -->
			<div class="status-section">
				{#if status === 'confirmed' && result}
					<div class="status-icon success">
						<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="20 6 9 17 4 12"/>
						</svg>
					</div>
					<p class="status-text">{t('auth.send.statusConfirmed')}</p>
					{#if result.explorerUrl}
						<a class="tx-link" href={result.explorerUrl} target="_blank" rel="noopener noreferrer">
							{t('auth.send.viewOnExplorer')}
						</a>
					{/if}
					<button class="done-btn" onclick={handleClose}>{t('auth.send.done')}</button>

				{:else if status === 'failed'}
					<div class="status-icon error">
						<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="18" y1="6" x2="6" y2="18"/>
							<line x1="6" y1="6" x2="18" y2="18"/>
						</svg>
					</div>
					<p class="status-text">{t('auth.send.statusFailed')}</p>
					{#if error}
						<p class="send-error">{error}</p>
					{/if}
					<button class="done-btn" onclick={() => { status = null; error = null; result = null; }}>
						{t('common.retry')}
					</button>

				{:else}
					<div class="status-spinner">
						<span class="spinner-lg"></span>
					</div>
					<p class="status-text">{getStatusMessage(status)}</p>
					{#if selectedToken}
						<div class="tx-summary">
							<span>{amount} {selectedToken.symbol} → {recipient.slice(0, 6)}...{recipient.slice(-4)}</span>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</ResponsiveModal>

<style>
	.send-content {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	/* Token selector */
	.token-selector {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		max-height: 160px;
		overflow-y: auto;
	}

	.token-option {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: transparent;
		cursor: pointer;
		text-align: left;
		transition: all var(--motion-fast) var(--easing);
	}

	.token-option:hover {
		background: var(--bg-raised);
	}

	.token-option.selected {
		border-color: var(--accent);
		background: var(--accent-subtle);
	}

	.single-token {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border-radius: var(--radius-md);
	}

	.token-symbol-badge {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}

	.token-chain-name {
		font-size: var(--text-xs);
		color: var(--fg-faint);
	}

	.token-bal {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--fg-muted);
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
		padding: var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-family: var(--font-mono);
		outline: none;
		transition: border-color var(--motion-fast) var(--easing);
		box-sizing: border-box;
	}

	.input-field::placeholder { color: var(--fg-faint); }
	.input-field:focus { border-color: var(--accent); }

	.amount-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.max-btn {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.max-btn:hover { background: var(--accent-muted); }

	.amount-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.amount-input { flex: 1; }

	.amount-unit {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-muted);
	}

	/* Send button */
	.send-btn {
		width: 100%;
		padding: var(--space-3);
		border: none;
		border-radius: var(--radius-md);
		background: var(--accent);
		color: var(--accent-fg, var(--fg-inverse));
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.send-btn:not(:disabled):hover { background: var(--accent-hover); }
	.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	.send-error {
		font-size: var(--text-sm);
		color: var(--error);
		margin: 0;
		padding: var(--space-2) var(--space-3);
		background: var(--error-muted);
		border-radius: var(--radius-md);
		word-break: break-word;
	}

	/* Status */
	.status-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-4) 0;
	}

	.status-icon {
		width: 56px;
		height: 56px;
		border-radius: var(--radius-full);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.status-icon.success { background: var(--success-muted); color: var(--success); }
	.status-icon.error { background: var(--error-muted); color: var(--error); }

	.status-text {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		text-align: center;
		margin: 0;
	}

	.status-spinner { display: flex; justify-content: center; }

	.spinner-lg {
		width: 32px;
		height: 32px;
		border: 3px solid var(--border-base);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	.tx-summary {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-faint);
	}

	.tx-link {
		font-size: var(--text-sm);
		color: var(--accent);
		text-decoration: none;
	}

	.tx-link:hover { text-decoration: underline; }

	.done-btn {
		width: 100%;
		padding: var(--space-3);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.done-btn:hover { background: var(--bg-raised); }

	@media (prefers-reduced-motion: reduce) {
		.spinner-lg { animation: none; }
	}
</style>
