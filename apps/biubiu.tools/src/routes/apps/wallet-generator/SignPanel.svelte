<script lang="ts">
	import { formatEther } from 'viem';
	import { t } from '$lib/i18n';
	import type { TranslationKey } from '$i18n';
	import { walletGenerator as s } from '$lib/pda-apps/wallet-generator/store.svelte.js';
	import {
		parseSignRequest,
		signRequest,
		type ParsedSignRequest,
	} from '$lib/pda-apps/wallet-generator/crypto/sign';
	import AnimatedQr from './AnimatedQr.svelte';
	import UrScanner from './UrScanner.svelte';

	let scanner = $state<UrScanner | null>(null);
	let parsed = $state<ParsedSignRequest | null>(null);
	let fragments = $state<string[] | null>(null);
	let signing = $state(false);
	let err = $state('');

	interface ScannedUr {
		type: string;
		cbor: Buffer;
	}

	function startScan() {
		err = '';
		parsed = null;
		fragments = null;
		scanner?.start();
	}

	async function onComplete(ur: ScannedUr) {
		try {
			parsed = await parseSignRequest(ur, s.mnemonic);
		} catch {
			err = t('wg.sign.error');
		}
	}

	async function doSign() {
		if (!parsed) return;
		signing = true;
		err = '';
		try {
			fragments = await signRequest(s.mnemonic, parsed);
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			signing = false;
		}
	}

	function reset() {
		parsed = null;
		fragments = null;
		err = '';
	}

	const dtKey = $derived(
		parsed
			? parsed.dataType === 2
				? 'typedData'
				: parsed.dataType === 3
					? 'message'
					: 'tx'
			: 'tx',
	);

	function short(v: string, n = 10): string {
		return v.length > n * 2 ? `${v.slice(0, n)}…${v.slice(-6)}` : v;
	}
</script>

<div class="sign">
	<UrScanner bind:this={scanner} {onComplete} onCancel={() => {}} />

	{#if err}<p class="err">{err}</p>{/if}

	{#if fragments}
		<!-- ── Signature result ── -->
		<h3 class="result-title">{t('wg.sign.resultTitle')}</h3>
		<div class="qr-wrap"><AnimatedQr frames={fragments} size={240} /></div>
		<p class="tip">{t('wg.sign.resultTip')}</p>
		<button class="btn" onclick={startScan}>{t('wg.sign.scanAnother')}</button>
	{:else if parsed}
		<!-- ── Review before signing ── -->
		<div class="fp" class:bad={!parsed.fingerprintMatches}>
			{parsed.fingerprintMatches ? t('wg.sign.fpOk') : t('wg.sign.fpBad')}
		</div>

		<div class="preview">
			<div class="prow">
				<span class="plabel">{t(`wg.sign.dt.${dtKey}` as TranslationKey)}</span>
			</div>
			<div class="prow">
				<span class="plabel">{t('wg.sign.path')}</span>
				<span class="mono">{parsed.path}</span>
			</div>

			{#if parsed.dataType === 1 || parsed.dataType === 4}
				<div class="prow">
					<span class="plabel">{t('wg.sign.to')}</span>
					<span class="mono">{parsed.transaction?.to ?? '—'}</span>
				</div>
				<div class="prow">
					<span class="plabel">{t('wg.sign.value')}</span>
					<span class="mono">{formatEther(parsed.transaction?.value ?? 0n)} ETH</span>
				</div>
				<div class="prow">
					<span class="plabel">{t('wg.sign.chainId')}</span>
					<span class="mono">{parsed.chainId ?? '—'}</span>
				</div>
				{#if parsed.transaction?.data && parsed.transaction.data !== '0x'}
					<div class="prow">
						<span class="plabel">{t('wg.sign.data')}</span>
						<span class="mono small">{short(parsed.transaction.data, 14)}</span>
					</div>
				{/if}
			{:else if parsed.dataType === 3}
				<div class="prow col">
					<span class="plabel">{t('wg.sign.message')}</span>
					<pre class="msg">{parsed.message}</pre>
				</div>
			{:else if parsed.dataType === 2}
				<div class="prow col">
					<span class="plabel">{t('wg.sign.dt.typedData')}</span>
					<pre class="msg">{parsed.typedData}</pre>
				</div>
			{/if}
		</div>

		<div class="actions">
			<button class="btn ghost" onclick={reset}>{t('wg.sign.scanAnother')}</button>
			<button class="btn primary" disabled={signing} onclick={doSign}>
				{signing ? t('wg.sign.signing') : t('wg.sign.signBtn')}
			</button>
		</div>
	{:else}
		<!-- ── Idle ── -->
		<p class="desc">{t('wg.sign.desc')}</p>
		<button class="btn primary" onclick={startScan}>{t('wg.sign.scan')}</button>
	{/if}
</div>

<style>
	.sign {
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
	.fp {
		font-size: var(--text-sm);
		color: var(--success);
		text-align: center;
	}
	.fp.bad {
		color: var(--error);
	}
	.preview {
		width: 100%;
		max-width: 520px;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		padding: var(--space-4);
	}
	.prow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		font-size: var(--text-sm);
	}
	.prow.col {
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-2);
	}
	.plabel {
		color: var(--fg-subtle);
		font-weight: 600;
	}
	.msg {
		margin: 0;
		max-height: 180px;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-word;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-base);
		background: var(--bg-base);
		border-radius: var(--radius-sm);
		padding: var(--space-2);
	}
	.actions {
		display: flex;
		gap: var(--space-3);
	}
	.result-title {
		margin: 0;
		font-size: var(--text-lg);
		color: var(--fg-base);
	}
	.qr-wrap {
		padding: var(--space-3);
		background: #fff;
		border-radius: var(--radius-lg);
	}
	.tip {
		color: var(--fg-muted);
		font-size: var(--text-sm);
		text-align: center;
		max-width: 420px;
		margin: 0;
	}
	.err {
		color: var(--error);
		font-size: var(--text-sm);
		text-align: center;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.small {
		font-size: var(--text-xs);
	}
	.btn {
		padding: var(--space-3) var(--space-5);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		background: var(--bg-raised);
		color: var(--fg-base);
		font-weight: 600;
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--motion-normal) var(--easing);
	}
	.btn:hover:not(:disabled) {
		transform: translateY(-1px);
	}
	.btn.primary {
		background: var(--accent);
		color: var(--accent-fg, #fff);
		border-color: transparent;
	}
	.btn.ghost {
		background: transparent;
	}
	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	@media (prefers-reduced-motion: reduce) {
		.btn {
			transition: none;
		}
	}
</style>
