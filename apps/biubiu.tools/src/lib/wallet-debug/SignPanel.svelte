<!-- Sign + verify message / typed data. biubiu → Safe ERC-1271 + local P-256 verify;
     external → personal_sign / v4 + on-chain ERC-1271 verify. -->
<script lang="ts">
	import { t } from '$lib/i18n';
	import type { VerifyResult } from '$lib/wallet';
	import { debug } from './debug-store.svelte.js';
	import { truncateMiddle } from './helpers.js';
	import Panel from './Panel.svelte';
	import Btn from './Btn.svelte';
	import CopyButton from './CopyButton.svelte';
	import { PenLine, CheckCircle2, AlertTriangle } from '@lucide/svelte';

	const wallet = $derived(debug.wallet);
	const isBuiltin = $derived(wallet?.kind === 'biubiu');

	const SAMPLE_TYPED_DATA = JSON.stringify(
		{
			domain: { name: 'biubiu', version: '1', chainId: 8453 },
			types: { Mail: [{ name: 'from', type: 'string' }, { name: 'contents', type: 'string' }] },
			primaryType: 'Mail',
			message: { from: 'biubiu.tools', contents: 'gm' }
		},
		null,
		2
	);

	let message = $state('Hello from biubiu.tools 👋');
	let typedData = $state(SAMPLE_TYPED_DATA);

	let messageSig = $state<string | null>(null);
	let typedSig = $state<string | null>(null);
	let messageVerify = $state<VerifyResult | null>(null);
	let typedVerify = $state<VerifyResult | null>(null);
	let messageBusy = $state(false);
	let typedBusy = $state(false);
	let messageVerifyBusy = $state(false);
	let typedVerifyBusy = $state(false);
	let err = $state<string | null>(null);

	function methodLabel(v: VerifyResult): string {
		return v.method === 'webauthn-p256' ? t('wd.sign.verifyP256') : t('wd.sign.verifyErc1271');
	}

	async function signMessage() {
		if (!wallet?.signMessage) return;
		messageBusy = true;
		err = null;
		messageVerify = null;
		try {
			const res = await wallet.signMessage(message, { chainId: debug.selectedChainId });
			if (res.ok) {
				messageSig = res.signature ?? null;
				debug.push('signMessage', true, { message, signature: res.signature });
			} else {
				messageSig = null;
				err = res.error ?? 'Failed';
				debug.push('signMessage', false, { error: res.error });
			}
		} finally {
			messageBusy = false;
		}
	}

	async function verifyMessage() {
		if (!wallet?.verifyMessage || !messageSig) return;
		messageVerifyBusy = true;
		try {
			const res = await wallet.verifyMessage(message, messageSig as `0x${string}`, {
				chainId: debug.selectedChainId
			});
			messageVerify = res;
			debug.push('verifyMessage', res.ok, res);
		} finally {
			messageVerifyBusy = false;
		}
	}

	async function signTyped() {
		if (!wallet?.signTypedData) return;
		typedBusy = true;
		err = null;
		typedVerify = null;
		try {
			const res = await wallet.signTypedData(typedData, { chainId: debug.selectedChainId });
			if (res.ok) {
				typedSig = res.signature ?? null;
				debug.push('signTypedData', true, { signature: res.signature });
			} else {
				typedSig = null;
				err = res.error ?? 'Failed';
				debug.push('signTypedData', false, { error: res.error });
			}
		} finally {
			typedBusy = false;
		}
	}

	async function verifyTyped() {
		if (!wallet?.verifyTypedData || !typedSig) return;
		typedVerifyBusy = true;
		try {
			const res = await wallet.verifyTypedData(typedData, typedSig as `0x${string}`, {
				chainId: debug.selectedChainId
			});
			typedVerify = res;
			debug.push('verifyTypedData', res.ok, res);
		} finally {
			typedVerifyBusy = false;
		}
	}
</script>

{#snippet verifyRow(sig: string | null, verify: VerifyResult | null, busy: boolean, onVerify: () => void)}
	{#if sig}
		<div class="act">
			<code class="sig wd-mono" title={sig}>{truncateMiddle(sig, 10, 8)}</code>
			<CopyButton value={sig} />
			<Btn size="sm" variant="ghost" loading={busy} onclick={onVerify}>{t('wd.sign.verify')}</Btn>
		</div>
		{#if verify}
			{#if verify.ok && verify.valid}
				<p class="wd-alert success"><CheckCircle2 size={14} />{t('wd.sign.valid')} · {methodLabel(verify)}</p>
			{:else if verify.ok}
				<p class="wd-alert warn"><AlertTriangle size={14} />{t('wd.sign.invalid')} · {methodLabel(verify)}</p>
			{:else}
				<p class="wd-alert error"><AlertTriangle size={14} />{verify.error}</p>
			{/if}
		{/if}
	{/if}
{/snippet}

<Panel title={t('wd.sign.title')} description={t('wd.sign.desc')} icon={PenLine}>
	<label class="wd-field">
		<span class="wd-label">{t('wd.sign.messageLabel')}</span>
		<textarea
			class="wd-textarea"
			name="wd-sign-message"
			bind:value={message}
			oninput={() => { messageSig = null; messageVerify = null; }}
			rows="2"
			placeholder={t('wd.sign.messagePlaceholder')}
		></textarea>
	</label>
	<Btn size="sm" loading={messageBusy} onclick={signMessage}>{t('wd.sign.signMessage')}</Btn>
	{@render verifyRow(messageSig, messageVerify, messageVerifyBusy, verifyMessage)}

	<div class="gap"></div>

	<label class="wd-field">
		<span class="wd-label">{t('wd.sign.typedLabel')}</span>
		<textarea
			class="wd-textarea mono"
			name="wd-sign-typed"
			bind:value={typedData}
			oninput={() => { typedSig = null; typedVerify = null; }}
			rows="8"
			spellcheck="false"
		></textarea>
	</label>
	<Btn size="sm" loading={typedBusy} onclick={signTyped}>{t('wd.sign.signTyped')}</Btn>
	{@render verifyRow(typedSig, typedVerify, typedVerifyBusy, verifyTyped)}

	{#if isBuiltin}
		<p class="wd-alert info">{t('wd.sign.erc1271Note')}</p>
	{/if}
	{#if err}<p class="wd-alert error">{err}</p>{/if}
</Panel>

<style>
	.gap {
		height: var(--space-5);
	}
	.act {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-3);
		flex-wrap: wrap;
	}
	.sig {
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
</style>
