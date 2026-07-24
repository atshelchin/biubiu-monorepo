<script lang="ts">
	/**
	 * In-band gas fee selector. Lets the user pay network gas with the native coin (default) or
	 * any whitelisted stablecoin the Safe holds — the vela relay reimburses itself from an in-band
	 * transfer batched into the UserOp (see wallet/infra/inband.ts). Shows the live fee estimate and
	 * binds `gasFeeToken` (null = native) + `quotedFee` (signed verbatim by the send path).
	 *
	 * Renders nothing when the chain isn't in-band / the relay can't quote, so a caller can drop it
	 * into any confirm surface unconditionally. Tempo has its own forced pathUSD flow — omit there.
	 */
	import { formatUnits, type Address } from 'viem';
	import { t } from '$lib/i18n';
	import { getInBandGasQuotes } from '$lib/wallet/infra/bundler-client.js';
	import { loadInBandFeeTokenOptions, type FeeTokenOption } from '$lib/wallet/infra/inband.js';
	import { estimateInBandFee, type InBandFeeQuote } from './safe-tx/send-contract-call.js';
	import type { Call } from '$lib/wallet/types.js';

	interface Props {
		chainId: number;
		safeAddress: string;
		publicKeyHex: string;
		network: string;
		/** The send's user calls, for fee estimation. */
		calls: Call[];
		/** Only load/estimate while the confirm surface is active with a valid amount. */
		active: boolean;
		/** Chosen fee asset: null = native, else a held stablecoin contract. */
		gasFeeToken?: Address | null;
		/** Out: the current fee quote — pass to the send as `quotedFee`. */
		quotedFee?: InBandFeeQuote | null;
	}

	let {
		chainId,
		safeAddress,
		publicKeyHex,
		network,
		calls,
		active,
		gasFeeToken = $bindable(null),
		quotedFee = $bindable(null)
	}: Props = $props();

	let options = $state<FeeTokenOption[] | null>(null);
	let estimating = $state(false);

	// Load the fee-asset options (native + held stablecoins) once per chain/Safe.
	$effect(() => {
		const cid = chainId;
		const safe = safeAddress;
		if (!active || !cid || !safe) {
			options = null;
			return;
		}
		let cancelled = false;
		getInBandGasQuotes(safe as Address, cid)
			.then((q) => {
				if (!cancelled) options = loadInBandFeeTokenOptions(q);
			})
			.catch(() => {
				if (!cancelled) options = null;
			});
		return () => {
			cancelled = true;
		};
	});

	// Estimate the fee for the selected asset + calls (debounced; cancels on change).
	$effect(() => {
		const gft = gasFeeToken;
		const c = calls;
		if (!active || !safeAddress || c.length === 0) {
			quotedFee = null;
			estimating = false;
			return;
		}
		let cancelled = false;
		estimating = true;
		const timer = setTimeout(() => {
			estimateInBandFee({ safeAddress: safeAddress as Address, publicKeyHex, network, calls: c, gasFeeToken: gft })
				.then((q) => {
					if (!cancelled) quotedFee = q;
				})
				.catch(() => {
					if (!cancelled) quotedFee = null;
				})
				.finally(() => {
					if (!cancelled) estimating = false;
				});
		}, 400);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	});

	const isActive = (opt: FeeTokenOption): boolean =>
		(gasFeeToken?.toLowerCase() ?? null) === (opt.contract?.toLowerCase() ?? null);

	function fmt(amount: bigint, decimals: number): string {
		const s = formatUnits(amount, decimals);
		const n = Number(s);
		if (!isFinite(n)) return s;
		if (n === 0) return '0';
		return n < 0.0001 ? s : String(Number(n.toPrecision(4)));
	}
</script>

{#if options && options.length > 0}
	<div class="fee-selector">
		<div class="fee-line">
			<span class="fee-label">{t('auth.send.gasFee')}</span>
			<span class="fee-amount" class:muted={estimating || !quotedFee}>
				{#if estimating || !quotedFee}
					…
				{:else}
					≈ {fmt(quotedFee.amount, quotedFee.decimals)} {quotedFee.symbol}
				{/if}
			</span>
		</div>
		{#if options.length > 1}
			<div class="fee-chips">
				{#each options as opt (opt.contract ?? 'native')}
					<button
						type="button"
						class="fee-chip"
						class:active={isActive(opt)}
						onclick={() => (gasFeeToken = opt.contract)}
					>
						{opt.symbol}
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.fee-selector {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}

	.fee-line {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.fee-label {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.fee-amount {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--fg-base);
	}

	.fee-amount.muted {
		color: var(--fg-faint);
	}

	.fee-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.fee-chip {
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--fg-muted);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.fee-chip:hover {
		border-color: var(--border-strong);
		color: var(--fg-base);
	}

	.fee-chip.active {
		border-color: var(--accent);
		background: var(--accent-muted);
		color: var(--accent);
	}
</style>
