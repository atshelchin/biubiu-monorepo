<script lang="ts">
	/**
	 * Human-readable renderer for a single decoded output value, with a raw
	 * fallback. Numbers are grouped by default; large amounts can be viewed as
	 * token amounts (÷10^d) and timestamps are surfaced as dates.
	 */
	import { t } from '$lib/i18n';
	import { typeCategory } from '$lib/contract-caller/abi.js';
	import { groupDigits, baseToAmount, unixToDate, hexToText } from '$lib/contract-caller/format.js';
	import { Calendar } from '@lucide/svelte';

	interface Props {
		type: string;
		value: string;
	}
	let { type, value }: Props = $props();

	const cat = $derived(typeCategory(type));

	let copied = $state(false);
	function copy() {
		navigator.clipboard.writeText(value);
		copied = true;
		setTimeout(() => (copied = false), 1200);
	}

	type NumMode = 'full' | 'raw' | 'd18' | 'd6' | 'd9';
	let numMode = $state<NumMode>('full');

	function withGroupedInt(decimalStr: string): string {
		const [intp, frac] = decimalStr.split('.');
		const gi = groupDigits(intp);
		return frac ? `${gi}.${frac}` : gi;
	}

	const isBigNumber = $derived.by(() => {
		if (cat !== 'uint' && cat !== 'int') return false;
		try {
			return BigInt(value) >= 1_000_000_000_000n; // ≥1e12 → likely a scaled amount
		} catch {
			return false;
		}
	});

	const numDisplay = $derived.by(() => {
		if (numMode === 'raw') return value;
		if (numMode === 'd18') return withGroupedInt(baseToAmount(value, 18));
		if (numMode === 'd6') return withGroupedInt(baseToAmount(value, 6));
		if (numMode === 'd9') return withGroupedInt(baseToAmount(value, 9));
		return groupDigits(value);
	});

	const dateHint = $derived.by(() => {
		if (cat !== 'uint' && cat !== 'int') return '';
		let n: bigint;
		try {
			n = BigInt(value);
		} catch {
			return '';
		}
		if (n >= 1_000_000_000n && n <= 4_000_000_000n) return unixToDate(value);
		if (n >= 1_000_000_000_000n && n <= 4_000_000_000_000n)
			return t('cc.output.ms', { date: unixToDate((n / 1000n).toString()) });
		return '';
	});

	const bytesText = $derived.by(() => {
		if (cat !== 'bytes') return '';
		const t = hexToText(value);
		return t && /^[ -~]+$/.test(t) ? t : ''; // printable ASCII only
	});

	const showNumTools = $derived(
		(cat === 'uint' || cat === 'int') && (isBigNumber || numMode !== 'full')
	);
</script>

{#if cat === 'bool'}
	<span class="pill {value === 'true' ? 'yes' : 'no'}"
		>{value === 'true' ? t('cc.output.true') : t('cc.output.false')}</span
	>
{:else if cat === 'uint' || cat === 'int'}
	<div class="num">
		<button class="val big" onclick={copy} title={t('cc.output.copyRaw')}
			>{copied ? t('cc.output.copied') : numDisplay}</button
		>
		{#if showNumTools || dateHint}
			<div class="tools">
				{#if showNumTools}
					<button class="chip" class:active={numMode === 'full'} onclick={() => (numMode = 'full')}
						>{t('cc.output.full')}</button
					>
					<button
						class="chip"
						class:active={numMode === 'd18'}
						onclick={() => (numMode = 'd18')}
						title={t('cc.output.d18Title')}>{t('cc.output.d18')}</button
					>
					<button
						class="chip"
						class:active={numMode === 'd6'}
						onclick={() => (numMode = 'd6')}
						title={t('cc.output.d6Title')}>{t('cc.output.d6')}</button
					>
					<button
						class="chip"
						class:active={numMode === 'd9'}
						onclick={() => (numMode = 'd9')}
						title={t('cc.output.gweiTitle')}>{t('cc.output.gwei')}</button
					>
					<button class="chip" class:active={numMode === 'raw'} onclick={() => (numMode = 'raw')}
						>{t('cc.output.raw')}</button
					>
				{/if}
				{#if dateHint}<span class="date"><Calendar size={12} /> {dateHint}</span>{/if}
			</div>
		{/if}
	</div>
{:else if cat === 'bytes'}
	<button class="val mono" onclick={copy} title={t('cc.output.copy')}
		>{copied ? t('cc.output.copied') : value}</button
	>
	{#if bytesText}<span class="sub">"{bytesText}"</span>{/if}
{:else if cat === 'string'}
	<button class="val str" onclick={copy} title={t('cc.output.copy')}
		>{copied ? t('cc.output.copied') : value}</button
	>
{:else}
	<button class="val mono" onclick={copy} title={t('cc.output.copy')}
		>{copied ? t('cc.output.copied') : value}</button
	>
{/if}

<style>
	.num {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.val {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--fg-base);
		background: transparent;
		border: none;
		text-align: left;
		padding: 0;
		cursor: pointer;
		word-break: break-all;
	}
	.val:hover {
		color: var(--accent);
	}
	.val.big {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		letter-spacing: -0.01em;
	}
	.val.str {
		font-family: var(--font-sans);
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
	}
	.chip {
		padding: 1px var(--space-2);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.chip:hover {
		color: var(--fg-base);
	}
	.chip.active {
		background: var(--accent-subtle);
		border-color: var(--accent);
		color: var(--accent);
	}
	.date {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		margin-left: var(--space-1);
	}
	.sub {
		display: block;
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		margin-top: 2px;
	}
	.pill {
		display: inline-block;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		padding: 2px var(--space-3);
		border-radius: var(--radius-full);
	}
	.pill.yes {
		background: var(--success-muted);
		color: var(--success);
	}
	.pill.no {
		background: var(--bg-sunken);
		color: var(--fg-muted);
	}
</style>
