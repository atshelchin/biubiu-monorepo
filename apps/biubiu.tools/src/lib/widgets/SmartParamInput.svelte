<script lang="ts">
	/**
	 * Adaptive parameter input. Renders a control tuned to the ABI type and offers
	 * human-friendly entry helpers (token amounts, ether/gwei, durations, dates,
	 * UTF-8 → hex) while keeping a single canonical string as the bound value.
	 */
	import { isAddress } from 'viem';
	import { typeCategory } from '$lib/contract-caller/abi.js';
	import {
		amountToBase,
		durationToSeconds,
		secondsToHuman,
		dateToUnix,
		unixToDate,
		unixToDatetimeLocal,
		textToHex,
		hexToText,
		groupDigits,
		shortenAddress
	} from '$lib/contract-caller/format.js';
	import { Calendar, Timer } from '@lucide/svelte';
	import { t } from '$lib/i18n';

	interface Props {
		type: string;
		name: string;
		value: string;
		onChange: (value: string) => void;
		nativeSymbol?: string;
	}

	let { type, name, value, onChange, nativeSymbol = 'ETH' }: Props = $props();

	const cat = $derived(typeCategory(type));

	// Number entry mode: how the human value maps to the canonical integer.
	type NumMode = 'raw' | 'amount' | 'ether' | 'gwei' | 'duration' | 'date';
	let numMode = $state<NumMode>('raw');
	let humanAmount = $state('');
	let decimals = $state('18');
	let durValue = $state('');
	let durUnit = $state('days');
	let dateValue = $state('');

	let bytesMode = $state<'hex' | 'text'>('hex');
	let bytesText = $state('');

	function setRaw(v: string) {
		onChange(v);
	}

	function recomputeAmount() {
		const d = parseInt(decimals, 10);
		try {
			onChange(amountToBase(humanAmount, Number.isFinite(d) ? d : 18));
		} catch {
			/* leave canonical untouched on parse error */
		}
	}
	function recomputeUnit(unitDecimals: number) {
		try {
			onChange(amountToBase(humanAmount, unitDecimals));
		} catch {
			/* ignore */
		}
	}
	function recomputeDuration() {
		onChange(durationToSeconds(durValue, durUnit));
	}
	function recomputeDate() {
		onChange(dateToUnix(dateValue));
	}
	function recomputeBytesText() {
		onChange(textToHex(bytesText));
	}

	function pickNumMode(mode: NumMode) {
		numMode = mode;
		if (mode === 'date' && value) dateValue = unixToDatetimeLocal(value);
	}

	// Previews
	const addressOk = $derived(cat === 'address' && isAddress(value.trim()));
	type PreviewPart = { kind: 'date' | 'duration'; text: string };
	const numberPreview = $derived.by(() => {
		if (!value) return null;
		const grouped = groupDigits(value);
		let n: bigint;
		try {
			n = BigInt(value);
		} catch {
			return { grouped, parts: [] as PreviewPart[] };
		}
		const parts: PreviewPart[] = [];
		// Only reveal a date for values in a plausible unix-timestamp range,
		// so token amounts don't get a misleading date hint.
		if (n >= 1_000_000_000n && n <= 4_000_000_000n) {
			const d = unixToDate(value);
			if (d) parts.push({ kind: 'date', text: d });
		} else if (n >= 1_000_000_000_000n && n <= 4_000_000_000_000n) {
			const d = unixToDate((n / 1000n).toString());
			if (d) parts.push({ kind: 'date', text: `${d} (ms)` });
		}
		// Only show a duration reading when the user is entering a duration.
		if (numMode === 'duration') {
			const h = secondsToHuman(value);
			if (h && h !== '0s') parts.push({ kind: 'duration', text: h });
		}
		return { grouped, parts };
	});
	const bytesPreview = $derived.by(() => {
		if (cat !== 'bytes' || !value) return '';
		const t = hexToText(value);
		return t && /^[\x20-\x7e]*$/.test(t) ? `"${t}"` : '';
	});
</script>

<div class="param">
	{#if name}
		<div class="param-head">
			<span class="param-name">{name}</span>
			<span class="param-type">{type}</span>
		</div>
	{/if}

	{#if cat === 'bool'}
		<div class="seg">
			<button
				class="seg-btn"
				class:active={value === 'true'}
				onclick={() => setRaw('true')}
				type="button">true</button
			>
			<button
				class="seg-btn"
				class:active={value === 'false'}
				onclick={() => setRaw('false')}
				type="button">false</button
			>
		</div>
	{:else if cat === 'address'}
		<div class="input-row">
			<input
				class="input mono"
				class:ok={addressOk}
				class:bad={value.trim() !== '' && !addressOk}
				placeholder="0x…"
				{value}
				oninput={(e) => setRaw((e.target as HTMLInputElement).value)}
			/>
			{#if addressOk}<span class="badge ok">✓</span>{/if}
		</div>
		{#if addressOk}<p class="preview">{shortenAddress(value.trim())}</p>{/if}
	{:else if cat === 'uint' || cat === 'int'}
		<input
			class="input mono"
			inputmode="numeric"
			placeholder="0"
			{value}
			oninput={(e) => setRaw((e.target as HTMLInputElement).value)}
		/>
		<div class="chips">
			<button
				class="chip"
				class:active={numMode === 'raw'}
				onclick={() => pickNumMode('raw')}
				type="button">{t('widgets.smartParam.raw')}</button
			>
			<button
				class="chip"
				class:active={numMode === 'amount'}
				onclick={() => pickNumMode('amount')}
				type="button">{t('widgets.smartParam.tokenAmount')}</button
			>
			<button
				class="chip"
				class:active={numMode === 'ether'}
				onclick={() => pickNumMode('ether')}
				type="button">{nativeSymbol}</button
			>
			<button
				class="chip"
				class:active={numMode === 'gwei'}
				onclick={() => pickNumMode('gwei')}
				type="button">gwei</button
			>
			<button
				class="chip"
				class:active={numMode === 'duration'}
				onclick={() => pickNumMode('duration')}
				type="button">{t('widgets.smartParam.duration')}</button
			>
			<button
				class="chip"
				class:active={numMode === 'date'}
				onclick={() => pickNumMode('date')}
				type="button">{t('widgets.smartParam.date')}</button
			>
		</div>

		{#if numMode === 'amount'}
			<div class="helper">
				<input
					class="input sm"
					placeholder="1.5"
					bind:value={humanAmount}
					oninput={recomputeAmount}
				/>
				<span class="helper-x">×10^</span>
				<input class="input xs" bind:value={decimals} oninput={recomputeAmount} />
				<span class="helper-label">{t('widgets.smartParam.decimals')}</span>
			</div>
		{:else if numMode === 'ether'}
			<div class="helper">
				<input
					class="input sm"
					placeholder="0.1"
					bind:value={humanAmount}
					oninput={() => recomputeUnit(18)}
				/>
				<span class="helper-label">{nativeSymbol} (×10^18 wei)</span>
			</div>
		{:else if numMode === 'gwei'}
			<div class="helper">
				<input
					class="input sm"
					placeholder="30"
					bind:value={humanAmount}
					oninput={() => recomputeUnit(9)}
				/>
				<span class="helper-label">gwei (×10^9 wei)</span>
			</div>
		{:else if numMode === 'duration'}
			<div class="helper">
				<input class="input sm" placeholder="7" bind:value={durValue} oninput={recomputeDuration} />
				<select class="input sm" bind:value={durUnit} onchange={recomputeDuration}>
					<option value="seconds">{t('widgets.smartParam.unit.seconds')}</option>
					<option value="minutes">{t('widgets.smartParam.unit.minutes')}</option>
					<option value="hours">{t('widgets.smartParam.unit.hours')}</option>
					<option value="days">{t('widgets.smartParam.unit.days')}</option>
					<option value="weeks">{t('widgets.smartParam.unit.weeks')}</option>
					<option value="years">{t('widgets.smartParam.unit.years')}</option>
				</select>
			</div>
		{:else if numMode === 'date'}
			<div class="helper">
				<input
					class="input sm"
					type="datetime-local"
					bind:value={dateValue}
					oninput={recomputeDate}
				/>
				<span class="helper-label">→ unix seconds</span>
			</div>
		{/if}

		{#if numberPreview}
			<p class="preview">
				= {numberPreview.grouped}{#each numberPreview.parts as part (part.kind + part.text)}<span
						class="preview-part"
						>·
						{#if part.kind === 'date'}<Calendar size={12} />{:else}<Timer size={12} />{/if}
						{part.text}</span
					>{/each}
			</p>
		{/if}
	{:else if cat === 'bytes'}
		<div class="chips">
			<button
				class="chip"
				class:active={bytesMode === 'hex'}
				onclick={() => (bytesMode = 'hex')}
				type="button">hex</button
			>
			<button
				class="chip"
				class:active={bytesMode === 'text'}
				onclick={() => (bytesMode = 'text')}
				type="button">{t('widgets.smartParam.fromText')}</button
			>
		</div>
		{#if bytesMode === 'hex'}
			<input
				class="input mono"
				placeholder="0x…"
				{value}
				oninput={(e) => setRaw((e.target as HTMLInputElement).value)}
			/>
		{:else}
			<input
				class="input"
				placeholder="Hello world"
				bind:value={bytesText}
				oninput={recomputeBytesText}
			/>
		{/if}
		{#if value}<p class="preview mono">{value}{bytesPreview ? `  ${bytesPreview}` : ''}</p>{/if}
	{:else if cat === 'array' || cat === 'tuple'}
		<textarea
			class="input mono ta"
			rows="2"
			placeholder={cat === 'array' ? '["0x…", "0x…"]' : '[val1, val2] or {"field": val}'}
			{value}
			oninput={(e) => setRaw((e.target as HTMLTextAreaElement).value)}
		></textarea>
		<p class="preview">JSON · {type}</p>
	{:else}
		<input
			class="input"
			placeholder={type}
			{value}
			oninput={(e) => setRaw((e.target as HTMLInputElement).value)}
		/>
	{/if}
</div>

<style>
	.param {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.param-head {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}
	.param-name {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}
	.param-type {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		background: var(--bg-raised);
		padding: 1px var(--space-2);
		border-radius: var(--radius-sm);
	}
	.input {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--fg-base);
		transition: border-color var(--motion-fast) var(--easing);
	}
	.input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.input.mono {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
	.input.ok {
		border-color: color-mix(in srgb, var(--success) 50%, transparent);
	}
	.input.bad {
		border-color: color-mix(in srgb, var(--error) 50%, transparent);
	}
	.input.sm {
		width: auto;
		flex: 1;
		min-width: 0;
	}
	.input.xs {
		width: 54px;
		flex: 0 0 auto;
		text-align: center;
	}
	.ta {
		resize: vertical;
		line-height: var(--leading-normal);
	}
	.input-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.badge.ok {
		color: var(--success);
		font-size: var(--text-sm);
	}
	.seg {
		display: inline-flex;
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		overflow: hidden;
		width: fit-content;
	}
	.seg-btn {
		padding: var(--space-2) var(--space-4);
		background: var(--bg-raised);
		border: none;
		color: var(--fg-muted);
		font-size: var(--text-sm);
		cursor: pointer;
	}
	.seg-btn.active {
		background: var(--accent);
		color: var(--accent-fg);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.chip {
		padding: 2px var(--space-2);
		background: var(--bg-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		color: var(--fg-muted);
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
	.helper {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.helper-x,
	.helper-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		white-space: nowrap;
	}
	.preview {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		word-break: break-all;
		margin: 0;
	}
	.preview-part {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-left: 6px;
	}
	.preview.mono {
		font-family: var(--font-mono);
	}
</style>
