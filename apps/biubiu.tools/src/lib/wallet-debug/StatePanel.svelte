<!-- Account state: address, account type, chain, balance, smart-contract check. -->
<script lang="ts">
	import { type Hex, formatEther } from 'viem';
	import { t } from '$lib/i18n';
	import { rpcCall } from '$lib/wallet/infra/rpc-client.js';
	import { debug } from './debug-store.svelte.js';
	import { CURATED_CHAINS } from './helpers.js';
	import { ACCT_KEY } from './labels.js';
	import Panel from './Panel.svelte';
	import Btn from './Btn.svelte';
	import CopyButton from './CopyButton.svelte';
	import { Info, Coins, ShieldCheck } from '@lucide/svelte';

	const wallet = $derived(debug.wallet);
	const acctLabel = $derived(wallet ? t(ACCT_KEY[wallet.accountType]) : '');
	const chain = $derived(CURATED_CHAINS.find((c) => c.chainId === debug.selectedChainId));
	const walletChainId = $derived(
		wallet && 'chainId' in wallet ? (wallet as { chainId: number }).chainId : null
	);

	let balance = $state<string | null>(null);
	let balanceBusy = $state(false);
	let codeState = $state<'idle' | 'busy' | 'contract' | 'eoa'>('idle');
	let err = $state<string | null>(null);

	async function getBalance() {
		if (!wallet) return;
		balanceBusy = true;
		err = null;
		try {
			const wei = BigInt(
				await rpcCall<Hex>('eth_getBalance', [wallet.address, 'latest'], debug.selectedChainId)
			);
			balance = `${formatEther(wei)} ${chain?.nativeSymbol ?? ''}`.trim();
			debug.push('eth_getBalance', true, {
				chainId: debug.selectedChainId,
				address: wallet.address,
				wei,
				formatted: balance
			});
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			debug.push('eth_getBalance', false, { error: err });
		} finally {
			balanceBusy = false;
		}
	}

	async function verifyContract() {
		if (!wallet) return;
		codeState = 'busy';
		err = null;
		try {
			const code = await rpcCall<Hex>('eth_getCode', [wallet.address, 'latest'], debug.selectedChainId);
			const bytes = code && code !== '0x' ? (code.length - 2) / 2 : 0;
			codeState = bytes > 0 ? 'contract' : 'eoa';
			debug.push('eth_getCode', true, { chainId: debug.selectedChainId, hasCode: bytes > 0, codeBytes: bytes });
		} catch (e) {
			codeState = 'idle';
			err = e instanceof Error ? e.message : String(e);
			debug.push('eth_getCode', false, { error: err });
		}
	}
</script>

<Panel title={t('wd.state.title')} description={t('wd.state.desc')} icon={Info}>
	{#if wallet}
		<dl class="rows">
			<div class="row">
				<dt>{t('wd.state.address')}</dt>
				<dd class="wd-mono">
					<span class="ellipsis">{wallet.address}</span>
					<CopyButton value={wallet.address} />
				</dd>
			</div>
			<div class="row">
				<dt>{t('wd.state.accountType')}</dt>
				<dd>{acctLabel}</dd>
			</div>
			{#if walletChainId !== null}
				<div class="row">
					<dt>{t('wd.state.walletChain')}</dt>
					<dd class="wd-mono">{walletChainId}</dd>
				</div>
			{/if}
			<div class="row">
				<dt>{t('wd.state.targetChain')}</dt>
				<dd>{chain?.name ?? t('wd.bar.chain', { id: String(debug.selectedChainId) })}
					<span class="muted wd-mono">· {debug.selectedChainId}</span></dd>
			</div>
		</dl>

		<div class="actions">
			<Btn size="sm" loading={balanceBusy} onclick={getBalance}>
				<Coins size={14} />{t('wd.state.getBalance')}
			</Btn>
			{#if balance !== null}
				<span class="result mono">{balance}</span>
			{/if}
		</div>

		<div class="actions">
			<Btn size="sm" loading={codeState === 'busy'} onclick={verifyContract}>
				<ShieldCheck size={14} />{t('wd.state.verify')}
			</Btn>
			{#if codeState === 'contract'}
				<span class="result ok">{t('wd.state.verified')}</span>
			{:else if codeState === 'eoa'}
				<span class="result warn">{t('wd.state.notDeployed')}</span>
			{/if}
		</div>

		{#if err}<p class="wd-alert error">{err}</p>{/if}
	{/if}
</Panel>

<style>
	.rows {
		margin: 0 0 var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--border-subtle);
	}
	.row:last-child {
		border-bottom: none;
	}
	dt {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		flex: none;
	}
	dd {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-base);
		text-align: right;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
	.ellipsis {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.muted {
		color: var(--fg-subtle);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-2);
		flex-wrap: wrap;
	}
	.result {
		font-size: var(--text-sm);
		color: var(--fg-base);
	}
	.result.ok {
		color: var(--success);
	}
	.result.warn {
		color: var(--warning);
	}
</style>
