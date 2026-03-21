<script lang="ts">
	import { t } from '$lib/i18n';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import { encode } from 'uqr';

	interface Props {
		open: boolean;
		onClose: () => void;
		address: string;
	}

	let { open, onClose, address }: Props = $props();

	let copiedAddress = $state(false);

	const qrMatrix = $derived.by(() => {
		if (!address) return null;
		const result = encode(address, { ecc: 'M' });
		return result;
	});

	async function copyAddress() {
		try {
			await navigator.clipboard.writeText(address);
			copiedAddress = true;
			setTimeout(() => { copiedAddress = false; }, 1500);
		} catch {
			// Fallback
		}
	}
</script>

<ResponsiveModal {open} {onClose} title={t('auth.wallet.deposit')} zOffset={10}>
	<div class="deposit-content">
		<p class="deposit-description">{t('auth.wallet.depositDescription')}</p>

		<!-- QR Code -->
		{#if qrMatrix}
			<div class="qr-container">
				<svg
					viewBox="0 0 {qrMatrix.size} {qrMatrix.size}"
					class="qr-code"
					xmlns="http://www.w3.org/2000/svg"
				>
					{#each qrMatrix.data as row, y}
						{#each row as cell, x}
							{#if cell}
								<rect {x} {y} width="1" height="1" />
							{/if}
						{/each}
					{/each}
				</svg>
			</div>
		{/if}

		<!-- Address -->
		<button class="address-box" onclick={copyAddress} title={t('auth.profile.clickToCopy')}>
			<span class="address-text">{address}</span>
			{#if copiedAddress}
				<span class="copied-badge">{t('auth.profile.copied')}</span>
			{:else}
				<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
					<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
				</svg>
			{/if}
		</button>

		<p class="deposit-hint">{t('auth.wallet.depositHint')}</p>
	</div>
</ResponsiveModal>

<style>
	.deposit-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
	}

	.deposit-description {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
		text-align: center;
		margin: 0;
	}

	/* QR Code */
	.qr-container {
		padding: var(--space-4);
		background: #fff;
		border-radius: var(--radius-lg);
	}

	.qr-code {
		width: 180px;
		height: 180px;
		display: block;
	}

	.qr-code rect {
		fill: #000;
	}

	/* Address */
	.address-box {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		cursor: pointer;
		text-align: left;
		transition: border-color var(--motion-fast) var(--easing);
	}

	.address-box:hover {
		border-color: var(--border-base);
	}

	.address-text {
		flex: 1;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-muted);
		word-break: break-all;
		line-height: var(--leading-relaxed);
	}

	.copy-icon {
		flex-shrink: 0;
		color: var(--fg-faint);
	}

	.copied-badge {
		flex-shrink: 0;
		font-size: var(--text-xs);
		color: var(--success);
	}

	.deposit-hint {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-align: center;
		margin: 0;
		line-height: var(--leading-relaxed);
	}
</style>
