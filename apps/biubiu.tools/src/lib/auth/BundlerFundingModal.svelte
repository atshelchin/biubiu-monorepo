<script lang="ts">
	import { t } from '$lib/i18n';
	import { formatEther } from 'viem';
	import { encode } from 'uqr';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import {
		fetchBundlerAccountInfo,
		requestSponsorship,
		clearBundlerAccountCache,
		type GasAccountFunding
	} from '$lib/wallet/infra/bundler-account.js';

	interface Props {
		open: boolean;
		funding: GasAccountFunding | null;
		/** Called when the gas account reaches the required balance. */
		onFunded: () => void;
		onClose: () => void;
	}
	let { open, funding, onFunded, onClose }: Props = $props();

	type Step = 'choose' | 'self-fund';
	let step = $state<Step>('choose');
	let requesting = $state(false);
	let checking = $state(false);
	let denialReason = $state<string | undefined>(undefined);
	let copied = $state(false);
	let currentWei = $state(0n);
	let funded = $state(false);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	const POLL_INTERVAL = 10_000;

	// Reset + start fresh whenever a new funding request opens.
	$effect(() => {
		if (open && funding) {
			step = 'choose';
			requesting = false;
			checking = false;
			denialReason = undefined;
			funded = false;
			currentWei = funding.currentWei;
		}
		return () => stopPoll();
	});

	// Poll the gas-account balance while on the self-fund step.
	$effect(() => {
		if (open && funding && step === 'self-fund' && !funded) {
			pollTimer = setInterval(checkBalance, POLL_INTERVAL);
			return () => stopPoll();
		}
	});

	function stopPoll() {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	}

	const qr = $derived(funding ? encode(funding.depositAddress) : null);
	const fmt = (wei: bigint, sym: string) => `${trim(formatEther(wei))} ${sym}`;
	function trim(s: string): string {
		// show up to 6 significant decimals
		if (!s.includes('.')) return s;
		const [a, b] = s.split('.');
		return `${a}.${b.slice(0, 6).replace(/0+$/, '') || '0'}`;
	}

	async function checkBalance() {
		if (!funding) return;
		checking = true;
		clearBundlerAccountCache(funding.chainId, funding.safeAddress);
		try {
			const info = await fetchBundlerAccountInfo(funding.chainId, funding.safeAddress);
			if (info) {
				currentWei = info.spendableBalance;
				if (info.spendableBalance >= funding.requiredWei) {
					funded = true;
					stopPoll();
				}
			}
		} catch {
			/* ignore */
		}
		checking = false;
	}

	async function freeActivation() {
		if (!funding) return;
		requesting = true;
		denialReason = undefined;
		try {
			const res = await requestSponsorship(funding.chainId, funding.safeAddress, funding.requiredWei);
			if (res.sponsored) {
				clearBundlerAccountCache(funding.chainId, funding.safeAddress);
				const info = await fetchBundlerAccountInfo(funding.chainId, funding.safeAddress);
				if (info && info.spendableBalance >= funding.requiredWei) {
					currentWei = info.spendableBalance;
					funded = true;
					requesting = false;
					return;
				}
			}
			denialReason = res.reason ?? 'default';
		} catch {
			denialReason = 'network_error';
		}
		step = 'self-fund';
		requesting = false;
	}

	async function copyAddress() {
		if (!funding) return;
		try {
			await navigator.clipboard.writeText(funding.depositAddress);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* ignore */
		}
	}

	function denialText(reason?: string): string {
		switch (reason) {
			case 'nonce_exceeded': return t('funding.denial.nonceExceeded');
			case 'treasury_depleted': return t('funding.denial.treasuryDepleted');
			case 'wallet_balance_too_low': return t('funding.denial.balanceTooLow');
			case 'no_passkey_registered': return t('funding.denial.noPasskey');
			case 'rate_limited': return t('funding.denial.rateLimited');
			default: return t('funding.denial.default');
		}
	}
</script>

<ResponsiveModal {open} {onClose} title={t('funding.title')} zOffset={10}>
	{#if funding}
		<div class="fund">
			<p class="fund-intro">{t('funding.intro')}</p>

			<div class="fund-stats">
				<div class="stat">
					<span class="stat-k">{t('funding.balance')}</span>
					<span class="stat-v">{fmt(currentWei, funding.nativeSym)}</span>
				</div>
				<div class="stat">
					<span class="stat-k">{t('funding.required')}</span>
					<span class="stat-v">{fmt(funding.requiredWei, funding.nativeSym)}</span>
				</div>
			</div>

			{#if funded}
				<div class="fund-done">
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
					<span>{t('funding.funded')}</span>
				</div>
				<button class="fund-btn primary" onclick={onFunded}>{t('funding.continue')}</button>
			{:else if step === 'choose'}
				<button class="fund-btn primary" onclick={freeActivation} disabled={requesting}>
					{requesting ? t('funding.requesting') : t('funding.free')}
				</button>
				<span class="fund-hint">{t('funding.freeHint')}</span>
				<button class="fund-btn ghost" onclick={() => (step = 'self-fund')}>{t('funding.selfFund')}</button>
			{:else}
				{#if denialReason}
					<p class="fund-denial">{denialText(denialReason)}</p>
				{/if}
				<p class="fund-hint">{t('funding.selfFundHint')}</p>

				{#if qr}
					<div class="qr-box">
						<svg viewBox="0 0 {qr.size} {qr.size}" class="qr" xmlns="http://www.w3.org/2000/svg">
							{#each qr.data as row, y}
								{#each row as cell, x}
									{#if cell}<rect {x} {y} width="1" height="1" />{/if}
								{/each}
							{/each}
						</svg>
					</div>
				{/if}

				<button class="addr" onclick={copyAddress} title={t('funding.copy')}>
					<span class="addr-text">{funding.depositAddress}</span>
					<span class="addr-copy">{copied ? t('funding.copied') : t('funding.copy')}</span>
				</button>

				<button class="fund-btn ghost" onclick={checkBalance} disabled={checking}>
					{checking ? t('funding.checking') : t('funding.checkBalance')}
				</button>
			{/if}
		</div>
	{/if}
</ResponsiveModal>

<style>
	.fund {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.fund-intro {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.fund-stats {
		display: flex;
		gap: var(--space-3);
	}
	.stat {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--bg-raised);
	}
	.stat-k {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.stat-v {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		font-family: var(--font-mono);
	}
	.fund-done {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--success);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
	}
	.fund-denial {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		background: var(--warning-muted);
		color: var(--warning);
		font-size: var(--text-xs);
	}
	.fund-hint {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-align: center;
	}
	.fund-btn {
		padding: var(--space-3);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.fund-btn.primary {
		border: 1px solid var(--accent);
		background: var(--accent);
		color: var(--bg-base);
	}
	.fund-btn.primary:hover {
		background: var(--accent-hover);
	}
	.fund-btn.primary:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.fund-btn.ghost {
		border: 1px solid var(--border-base);
		background: transparent;
		color: var(--fg-muted);
	}
	.fund-btn.ghost:hover {
		background: var(--bg-elevated);
		color: var(--fg-base);
	}
	.qr-box {
		display: flex;
		justify-content: center;
		padding: var(--space-4);
		background: #fff;
		border-radius: var(--radius-lg);
	}
	.qr {
		width: 180px;
		height: 180px;
		shape-rendering: crispEdges;
		fill: #000;
	}
	.addr {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		background: var(--bg-raised);
		cursor: pointer;
	}
	.addr-text {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-base);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.addr-copy {
		flex-shrink: 0;
		font-size: var(--text-xs);
		color: var(--accent);
		font-weight: var(--weight-medium);
	}
</style>
