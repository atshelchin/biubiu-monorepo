<script lang="ts">
	import { t } from '$lib/i18n';
	import { walletGenerator as s } from '$lib/pda-apps/wallet-generator/store.svelte.js';
	import { buildXpubExport, type XpubExport } from '$lib/pda-apps/wallet-generator/crypto/xpub';
	import AnimatedQr from './AnimatedQr.svelte';
	import { TriangleAlert } from '@lucide/svelte';

	let result = $state<XpubExport | null>(null);
	let loading = $state(false);
	let err = $state('');
	let lastMnemonic = '';
	let copied = $state(false);

	async function generate(mnemonic: string) {
		loading = true;
		err = '';
		try {
			result = await buildXpubExport(mnemonic);
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			result = null;
		} finally {
			loading = false;
		}
	}

	// (Re)generate whenever the derived mnemonic changes.
	$effect(() => {
		const m = s.mnemonic;
		if (m && m !== lastMnemonic) {
			lastMnemonic = m;
			generate(m);
		}
	});

	async function copyXpub() {
		if (!result) return;
		try {
			await navigator.clipboard.writeText(result.xpub);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* ignore */
		}
	}
</script>

<div class="xpub">
	<p class="desc">{t('wg.xpub.desc')}</p>

	{#if loading}
		<p class="muted center">{t('wg.xpub.loading')}</p>
	{:else if err}
		<div class="alert" role="alert">
			<TriangleAlert size={16} />
			<span>{err}</span>
		</div>
	{:else if result}
		<div class="qr-wrap">
			<AnimatedQr frames={[result.ur]} size={240} />
		</div>

		<div class="meta">
			<div class="meta-row">
				<span class="meta-label">{t('wg.xpub.path')}</span>
				<span class="mono">{result.path}</span>
			</div>
			<div class="meta-row">
				<span class="meta-label">{t('wg.xpub.xfp')}</span>
				<span class="mono">{result.xfp}</span>
			</div>
			<div class="meta-row">
				<span class="meta-label">{t('wg.xpub.xpubLabel')}</span>
				<button class="link" onclick={copyXpub}
					>{copied ? t('wg.mnemonic.copied') : t('wg.mnemonic.copy')}</button
				>
			</div>
			<div class="xpub-box mono">{result.xpub}</div>
		</div>
	{/if}
</div>

<style>
	.xpub {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
	}
	.desc {
		color: var(--fg-muted);
		font-size: var(--text-sm);
		text-align: center;
		max-width: 460px;
		margin: 0;
		line-height: var(--leading-relaxed);
	}
	.qr-wrap {
		padding: var(--space-3);
		background: #fff;
		border-radius: var(--radius-lg);
	}
	.meta {
		width: 100%;
		max-width: 520px;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.meta-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: var(--text-sm);
	}
	.meta-label {
		color: var(--fg-subtle);
	}
	.xpub-box {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
		word-break: break-all;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.muted {
		color: var(--fg-subtle);
	}
	.center {
		text-align: center;
		padding: var(--space-6) 0;
	}
	.alert {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		max-width: 520px;
		padding: var(--space-3) var(--space-4);
		background: var(--error-subtle);
		border: 1px solid var(--error-muted);
		border-radius: var(--radius-md);
		color: var(--error);
		font-size: var(--text-sm);
		line-height: var(--leading-snug);
	}
	.link {
		background: none;
		border: none;
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
		padding: 0;
	}
</style>
