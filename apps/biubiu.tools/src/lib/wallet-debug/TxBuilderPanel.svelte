<!--
  Atomic batch builder — the smart-contract-wallet showcase. Compose N calls, add
  presets (native / ERC-20 transfer), preview the MultiSend encoding, estimate gas,
  and send them all atomically via wallet.sendCalls.
-->
<script lang="ts">
	import { type Address, type Hex, numberToHex, parseGwei } from 'viem';
	import { t } from '$lib/i18n';
	import type { Call, SendStatus, SendResult } from '$lib/wallet';
	import { encodeMultiSend } from '$lib/wallet';
	import { rpcCall } from '$lib/wallet/infra/rpc-client.js';
	import { explorerTxUrl } from '$lib/wallet/infra/chains.js';
	import { debug } from './debug-store.svelte.js';
	import { nativeToWei, tokenToUnits, encodeErc20Transfer, isAddress } from './helpers.js';
	import { PHASE_KEY } from './labels.js';
	import Panel from './Panel.svelte';
	import Btn from './Btn.svelte';
	import CodeBlock from './CodeBlock.svelte';
	import { Layers, Plus, Trash2, ChevronDown, Send, Gauge } from '@lucide/svelte';

	interface Draft {
		id: number;
		to: string;
		value: string;
		data: string;
	}

	const wallet = $derived(debug.wallet);
	let seq = 2;
	let calls = $state<Draft[]>([{ id: 1, to: '', value: '', data: '0x' }]);

	let presetOpen = $state(false);
	let pToken = $state('');
	let pTo = $state('');
	let pAmount = $state('');
	let pDecimals = $state('18');

	let gasOpen = $state(false);
	let callGasLimit = $state('');
	let maxFeeGwei = $state('');

	let preview = $state<string | null>(null);
	let estimate = $state<string | null>(null);
	let estimating = $state(false);
	let sending = $state(false);
	let phase = $state<SendStatus | null>(null);
	let result = $state<SendResult | null>(null);
	let err = $state<string | null>(null);

	function addEmpty() {
		calls = [...calls, { id: ++seq, to: '', value: '', data: '0x' }];
	}
	function addNative() {
		calls = [...calls, { id: ++seq, to: '', value: '0.001', data: '0x' }];
	}
	function remove(id: number) {
		calls = calls.filter((c) => c.id !== id);
	}

	function applyErc20() {
		err = null;
		if (!isAddress(pToken)) return void (err = t('wd.tx.errToken'));
		if (!isAddress(pTo)) return void (err = t('wd.tx.errRecipient'));
		let data: Hex;
		try {
			data = encodeErc20Transfer(pTo as Address, tokenToUnits(pAmount, Number(pDecimals) || 18));
		} catch (e) {
			return void (err = e instanceof Error ? e.message : String(e));
		}
		calls = [...calls, { id: ++seq, to: pToken, value: '', data }];
		presetOpen = false;
		pToken = pTo = pAmount = '';
		pDecimals = '18';
	}

	/** Validate + build the Call[] from drafts. Throws a localised error. */
	function build(): Call[] {
		if (calls.length === 0) throw new Error(t('wd.tx.errEmpty'));
		return calls.map((c, i) => {
			if (!isAddress(c.to)) throw new Error(t('wd.tx.errRowAddress', { n: String(i + 1) }));
			const data = (c.data.trim() || '0x') as Hex;
			if (!/^0x([0-9a-fA-F]{2})*$/.test(data)) throw new Error(t('wd.tx.errRowData', { n: String(i + 1) }));
			return { to: c.to as Address, value: nativeToWei(c.value), data };
		});
	}

	function gasOverrides() {
		if (!gasOpen) return undefined;
		const o: { callGasLimit?: bigint; maxFeePerGas?: bigint } = {};
		if (callGasLimit.trim()) o.callGasLimit = BigInt(callGasLimit.trim());
		if (maxFeeGwei.trim()) o.maxFeePerGas = parseGwei(maxFeeGwei.trim());
		return Object.keys(o).length ? o : undefined;
	}

	function togglePreview() {
		err = null;
		if (preview) {
			preview = null;
			return;
		}
		try {
			preview = encodeMultiSend(build());
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		}
	}

	async function doEstimate() {
		if (!wallet) return;
		err = null;
		let built: Call[];
		try {
			built = build();
		} catch (e) {
			return void (err = e instanceof Error ? e.message : String(e));
		}
		estimating = true;
		estimate = null;
		try {
			let total = 0n;
			for (const c of built) {
				const hex = await rpcCall<Hex>(
					'eth_estimateGas',
					[{ from: wallet.address, to: c.to, value: numberToHex(c.value), data: c.data }],
					debug.selectedChainId
				);
				total += BigInt(hex);
			}
			estimate = total.toString();
			debug.push('eth_estimateGas', true, { chainId: debug.selectedChainId, totalGas: total, calls: built.length });
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			debug.push('eth_estimateGas', false, { error: err });
		} finally {
			estimating = false;
		}
	}

	async function send() {
		if (!wallet) return;
		err = null;
		result = null;
		let built: Call[];
		try {
			built = build();
		} catch (e) {
			return void (err = e instanceof Error ? e.message : String(e));
		}
		sending = true;
		phase = 'checking';
		try {
			const res = await wallet.sendCalls(built, {
				chainId: debug.selectedChainId,
				onPhase: (p) => (phase = p),
				explorerTxBaseUrl: explorerTxUrl(debug.selectedChainId) || undefined,
				gasOverrides: gasOverrides()
			});
			result = res;
			debug.push('sendCalls', res.success, {
				chainId: debug.selectedChainId,
				calls: built.length,
				txHash: res.txHash,
				explorerUrl: res.explorerUrl,
				error: res.error
			});
			if (!res.success) err = res.error ?? t('wd.phase.failed');
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			debug.push('sendCalls', false, { error: err });
		} finally {
			sending = false;
			phase = null;
		}
	}
</script>

<Panel title={t('wd.tx.title')} description={t('wd.tx.desc')} icon={Layers}>
	{#snippet actions()}
		<span class="count wd-mono">{t('wd.tx.count', { n: String(calls.length) })}</span>
	{/snippet}

	<div class="calls">
		{#each calls as c, i (c.id)}
			<div class="call">
				<div class="call-head">
					<span class="idx wd-mono">#{i + 1}</span>
					<button class="rm wd-focusable" title={t('wd.tx.remove')} aria-label={t('wd.tx.remove')} onclick={() => remove(c.id)} disabled={calls.length === 1}>
						<Trash2 size={13} />
					</button>
				</div>
				<input class="wd-input mono" name="wd-call-to-{c.id}" bind:value={c.to} placeholder={t('wd.tx.to')} autocomplete="off" spellcheck="false" />
				<div class="call-grid">
					<input class="wd-input" name="wd-call-value-{c.id}" bind:value={c.value} placeholder={t('wd.tx.value')} autocomplete="off" />
					<input class="wd-input mono" name="wd-call-data-{c.id}" bind:value={c.data} placeholder="0x" autocomplete="off" spellcheck="false" />
				</div>
			</div>
		{/each}
	</div>

	<div class="add-row">
		<Btn size="sm" variant="ghost" onclick={addEmpty}><Plus size={13} />{t('wd.tx.addCall')}</Btn>
		<Btn size="sm" variant="ghost" onclick={addNative}>{t('wd.tx.presetNative')}</Btn>
		<Btn size="sm" variant="ghost" onclick={() => (presetOpen = !presetOpen)}>{t('wd.tx.presetErc20')}</Btn>
	</div>

	{#if presetOpen}
		<div class="preset">
			<input class="wd-input mono" name="wd-erc20-token" bind:value={pToken} placeholder={t('wd.tx.erc20Token')} spellcheck="false" />
			<input class="wd-input mono" name="wd-erc20-to" bind:value={pTo} placeholder={t('wd.tx.erc20To')} spellcheck="false" />
			<div class="preset-grid">
				<input class="wd-input" name="wd-erc20-amount" bind:value={pAmount} placeholder={t('wd.tx.erc20Amount')} />
				<input class="wd-input" name="wd-erc20-decimals" bind:value={pDecimals} placeholder={t('wd.tx.erc20Decimals')} />
			</div>
			<Btn size="sm" onclick={applyErc20}>{t('wd.tx.erc20Add')}</Btn>
		</div>
	{/if}

	<button class="disclosure wd-focusable" onclick={() => (gasOpen = !gasOpen)}>
		<ChevronDown size={14} class={gasOpen ? 'open' : ''} />{t('wd.tx.gasOverrides')}
	</button>
	{#if gasOpen}
		<div class="preset-grid gas">
			<input class="wd-input" name="wd-gas-limit" bind:value={callGasLimit} placeholder={t('wd.tx.callGasLimit')} autocomplete="off" />
			<input class="wd-input" name="wd-max-fee" bind:value={maxFeeGwei} placeholder={t('wd.tx.maxFeeGwei')} autocomplete="off" />
		</div>
	{/if}

	<div class="footer">
		<Btn size="sm" variant="ghost" onclick={togglePreview}>{t('wd.tx.preview')}</Btn>
		<Btn size="sm" loading={estimating} onclick={doEstimate}><Gauge size={14} />{t('wd.tx.estimate')}</Btn>
		<Btn variant="primary" loading={sending} disabled={!wallet} onclick={send}>
			<Send size={14} />{t('wd.tx.send')}
		</Btn>
	</div>

	{#if estimate}
		<p class="line">{t('wd.tx.estimateResult', { gas: estimate })}</p>
	{/if}
	{#if preview}
		<CodeBlock value={preview} label={t('wd.tx.previewLabel')} />
		<p class="wd-hint">{t('wd.tx.previewNote')}</p>
	{/if}
	{#if phase}
		<p class="line"><span class="wd-spinner"></span>{t(PHASE_KEY[phase])}</p>
	{/if}
	{#if result?.success}
		<p class="line ok">
			{t('wd.tx.sent')}
			{#if result.explorerUrl}
				· <a href={result.explorerUrl} target="_blank" rel="noopener noreferrer">{t('wd.tx.viewTx')}</a>
			{/if}
		</p>
	{/if}
	{#if err}<p class="wd-alert error">{err}</p>{/if}
</Panel>

<style>
	.count {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.calls {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.call {
		padding: var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.call-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.idx {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--fg-subtle);
	}
	.rm {
		display: inline-flex;
		padding: 2px;
		border: none;
		background: transparent;
		color: var(--fg-subtle);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.rm:hover:not(:disabled) {
		color: var(--error);
	}
	.rm:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.call-grid,
	.preset-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
	}
	.add-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.preset {
		margin-top: var(--space-3);
		padding: var(--space-3);
		border: 1px dashed var(--border-base);
		border-radius: var(--radius-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.disclosure {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-3);
		padding: 0;
		border: none;
		background: transparent;
		color: var(--fg-muted);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		cursor: pointer;
	}
	.disclosure :global(svg) {
		transition: transform var(--motion-fast) var(--easing);
	}
	.disclosure :global(svg.open) {
		transform: rotate(180deg);
	}
	.gas {
		margin-top: var(--space-2);
	}
	.footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border-subtle);
	}
	.line {
		margin: var(--space-3) 0 0;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--fg-base);
	}
	.line.ok {
		color: var(--success);
	}
	.line a {
		color: var(--accent);
	}
	@media (max-width: 520px) {
		.call-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
