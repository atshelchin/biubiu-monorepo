<script lang="ts">
	import { browser } from '$app/environment';
	import { preferences, locale as uiLocale } from '$lib/i18n';
	import type { Snippet } from 'svelte';

	type DateRange = { from: string; to: string };

	interface Props {
		mode?: 'single' | 'range';
		value?: string | DateRange;
		onchange?: () => void;
		presets?: string[];
		navigation?: boolean;
		min?: string;
		max?: string;
		placeholder?: string;
		children?: Snippet;
	}

	let {
		mode = 'single',
		value = $bindable(''),
		onchange,
		presets = [],
		navigation = false,
		min,
		max,
		placeholder = '--/--/--'
	}: Props = $props();

	// --- State ---
	let open = $state(false);
	let viewMonth = $state(new Date());
	let rangeStart = $state<string | null>(null); // for range mode: first click
	let hoverDate = $state<string | null>(null); // for range mode: hover preview
	let triggerEl = $state<HTMLElement | null>(null);

	// --- Derived ---
	const locale = $derived(preferences.dateLocale || 'en-US');
	const lang = $derived(uiLocale.value || 'en');
	const panelBg = $derived.by(() => {
		if (!browser) return '#1a1e1c';
		return document.documentElement.dataset.theme === 'light' ? '#ffffff' : '#1a1e1c';
	});

	const weekStart = $derived(preferences.weekStartDay ?? 1);

	const singleValue = $derived(mode === 'single' ? (value as string) : '');
	const rangeValue = $derived(mode === 'range' ? (value as DateRange) : { from: '', to: '' });

	const displayText = $derived.by(() => {
		if (mode === 'single') {
			if (!singleValue) return placeholder;
			return formatShortDate(singleValue);
		}
		const { from, to } = rangeValue;
		if (!from && !to) return placeholder;
		if (from && to) return `${formatShortDate(from)} – ${formatShortDate(to)}`;
		if (from) return `${formatShortDate(from)} –`;
		return placeholder;
	});

	/** Get today's date string in the browser's local timezone */
	const todayStr = $derived(toDateStr(new Date()));

	const navDate = $derived(mode === 'single' ? singleValue : (rangeValue.from === rangeValue.to ? rangeValue.from : ''));
	const canGoPrev = $derived(!!navDate);
	const canGoNext = $derived.by(() => {
		if (!navDate) return false;
		if (!max) return true;
		return navDate < max;
	});

	// --- Calendar logic ---

	interface DayCell {
		date: string; // YYYY-MM-DD
		day: number;
		isCurrentMonth: boolean;
		isToday: boolean;
		isSelected: boolean;
		isRangeStart: boolean;
		isRangeEnd: boolean;
		isInRange: boolean;
		isDisabled: boolean;
	}

	function toDateStr(d: Date): string {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	}

	function formatShortDate(dateStr: string): string {
		if (!dateStr) return '';
		const [y, m, d] = dateStr.split('-');
		const currentYear = String(new Date().getFullYear());
		if (y === currentYear) return `${m}/${d}`;
		return `${y.slice(2)}/${m}/${d}`;
	}

	function getWeekdayNames(loc: string, start: number): string[] {
		const names: string[] = [];
		// Jan 4 2026 is a Sunday (day 0), so 4 + start gives the correct first day
		const base = new Date(2026, 0, 4 + start);
		const fmt = new Intl.DateTimeFormat(loc, { weekday: 'narrow' });
		for (let i = 0; i < 7; i++) {
			const d = new Date(base);
			d.setDate(base.getDate() + i);
			names.push(fmt.format(d));
		}
		return names;
	}

	function getMonthLabel(d: Date, loc: string): string {
		return new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'long' }).format(d);
	}

	function getCalendarDays(year: number, month: number, ws: number): DayCell[] {
		const firstDay = new Date(year, month, 1);
		const firstDow = firstDay.getDay();
		// How many days from previous month to show
		let offset = firstDow - ws;
		if (offset < 0) offset += 7;

		const cells: DayCell[] = [];
		const startDate = new Date(year, month, 1 - offset);

		// Compute selection state
		let selFrom = '';
		let selTo = '';
		if (mode === 'single') {
			selFrom = selTo = singleValue;
		} else {
			if (rangeStart) {
				// Selecting second date — preview with hover
				const other = hoverDate || rangeStart;
				selFrom = rangeStart < other ? rangeStart : other;
				selTo = rangeStart < other ? other : rangeStart;
			} else {
				// Show pending range when panel is open, otherwise committed value
				const r = open ? pendingRange : rangeValue;
				selFrom = r.from;
				selTo = r.to;
			}
		}

		for (let i = 0; i < 42; i++) {
			const d = new Date(startDate);
			d.setDate(startDate.getDate() + i);
			const ds = toDateStr(d);
			const isCurrentMonth = d.getMonth() === month;

			cells.push({
				date: ds,
				day: d.getDate(),
				isCurrentMonth,
				isToday: ds === todayStr,
				isSelected: ds === selFrom || ds === selTo,
				isRangeStart: ds === selFrom && selFrom !== selTo,
				isRangeEnd: ds === selTo && selFrom !== selTo,
				isInRange: !!(selFrom && selTo && ds > selFrom && ds < selTo),
				isDisabled: !!(min && ds < min) || !!(max && ds > max)
			});
		}
		return cells;
	}

	const weekdays = $derived(getWeekdayNames(locale, weekStart));
	const monthLabel = $derived(getMonthLabel(viewMonth, locale));
	const days = $derived(getCalendarDays(viewMonth.getFullYear(), viewMonth.getMonth(), weekStart));

	// --- Actions ---

	function shiftMonth(delta: number) {
		const d = new Date(viewMonth);
		d.setMonth(d.getMonth() + delta);
		viewMonth = d;
	}

	function shiftDay(delta: number) {
		if (mode === 'single') {
			if (!singleValue) return;
			const d = new Date(singleValue + 'T12:00:00');
			d.setDate(d.getDate() + delta);
			const next = toDateStr(d);
			if (min && next < min) return;
			if (max && next > max) return;
			value = next;
		} else {
			// Range mode: shift single-day range (from === to)
			const { from, to } = rangeValue;
			if (!from || from !== to) return;
			const d = new Date(from + 'T12:00:00');
			d.setDate(d.getDate() + delta);
			const next = toDateStr(d);
			if (min && next < min) return;
			if (max && next > max) return;
			value = { from: next, to: next };
		}
		onchange?.();
	}

	// Pending range selection (not yet confirmed)
	let pendingRange = $state<DateRange>({ from: '', to: '' });

	function selectDate(dateStr: string) {
		if (mode === 'single') {
			value = dateStr;
			open = false;
			onchange?.();
		} else {
			// Range mode — stays open, user must confirm
			if (!rangeStart) {
				rangeStart = dateStr;
			} else {
				const from = rangeStart < dateStr ? rangeStart : dateStr;
				const to = rangeStart < dateStr ? dateStr : rangeStart;
				pendingRange = { from, to };
				rangeStart = null;
				hoverDate = null;
				// Don't close — wait for confirm
			}
		}
	}

	function confirmRange() {
		value = { ...pendingRange };
		pendingRange = { from: '', to: '' };
		open = false;
		onchange?.();
	}

	function applyPreset(key: string) {
		const today = todayStr;
		let result: string | DateRange = '';
		if (key === 'all') {
			result = mode === 'single' ? '' : { from: '', to: '' };
		} else if (key === 'today') {
			result = mode === 'single' ? today : { from: today, to: today };
		} else if (key === 'yesterday') {
			const d = new Date();
			d.setDate(d.getDate() - 1);
			const yd = toDateStr(d);
			result = mode === 'single' ? yd : { from: yd, to: yd };
		} else if (key === '7d') {
			const d = new Date();
			d.setDate(d.getDate() - 6);
			result = { from: toDateStr(d), to: today };
		} else if (key === '30d') {
			const d = new Date();
			d.setDate(d.getDate() - 29);
			result = { from: toDateStr(d), to: today };
		}
		// Presets apply immediately (no confirm needed) — they are complete selections
		value = result;
		pendingRange = typeof result === 'object' ? { ...result } : { from: '', to: '' };
		rangeStart = null;
		open = false;
		onchange?.();
	}

	/** Jump calendar view to today's month without closing or selecting */
	function goToToday() {
		viewMonth = new Date();
	}

	const presetLabels: Record<string, Record<string, string>> = {
		all: { en: 'All', zh: '全部' },
		today: { en: 'Today', zh: '今天' },
		yesterday: { en: 'Yesterday', zh: '昨天' },
		'7d': { en: '7 Days', zh: '7天' },
		'30d': { en: '30 Days', zh: '30天' }
	};

	function getPresetLabel(key: string): string {
		return presetLabels[key]?.[lang === 'zh' ? 'zh' : 'en'] ?? key;
	}

	function isPresetActive(key: string): boolean {
		const today = todayStr;
		if (mode === 'single') {
			if (key === 'all') return !singleValue;
			if (key === 'today') return singleValue === today;
			if (key === 'yesterday') {
				const d = new Date(); d.setDate(d.getDate() - 1);
				return singleValue === toDateStr(d);
			}
		} else {
			const { from, to } = rangeValue;
			if (key === 'all') return !from && !to;
			if (key === 'today') return from === today && to === today;
		}
		return false;
	}

	// Fixed position for the panel (computed from display button rect)
	let panelStyle = $state('');
	let displayBtnEl = $state<HTMLElement | null>(null);

	function updatePanelPos() {
		if (!browser) return;
		const el = displayBtnEl || triggerEl;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const panelWidth = 300;
		const top = rect.bottom + 8;
		// Center panel below the display button
		let left = rect.left + rect.width / 2 - panelWidth / 2;
		// Clamp to viewport edges
		left = Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8));
		panelStyle = `top:${top}px;left:${left}px;background:${panelBg}`;
	}

	function toggleOpen() {
		open = !open;
		if (open) {
			// Set viewMonth to the selected date or today
			const target = mode === 'single' ? singleValue : (rangeValue.from || rangeValue.to);
			if (target) {
				viewMonth = new Date(target + 'T12:00:00');
			} else {
				viewMonth = new Date();
			}
			rangeStart = null;
			hoverDate = null;
			// Initialize pending range from current value
			if (mode === 'range') {
				pendingRange = { ...rangeValue };
			}
			// Calculate panel position
			updatePanelPos();
		}
	}

	/** Svelte action: moves the node to document.body (escapes ancestor transform/stacking) */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			open = false;
			e.stopPropagation();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="datepicker" class:datepicker-open={open} bind:this={triggerEl}>
	<!-- Trigger row -->
	<div class="dp-trigger">
		{#if presets.length > 0}
			<div class="dp-presets">
				{#each presets as key (key)}
					<button
						class="dp-preset-btn"
						class:active={isPresetActive(key)}
						onclick={() => applyPreset(key)}
					>{getPresetLabel(key)}</button>
				{/each}
			</div>
		{/if}

		<div class="dp-nav-group">
			{#if navigation}
				<button class="dp-nav-btn" onclick={() => shiftDay(-1)} disabled={!canGoPrev}>
					<svg width="10" height="10" viewBox="0 0 10 10"><path d="M7 1L3 5L7 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
			{/if}

			<button class="dp-display-btn" bind:this={displayBtnEl} onclick={toggleOpen}>
				<span class="dp-display-text">{displayText}</span>
				<svg class="dp-cal-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
			</button>

			{#if navigation}
				<button class="dp-nav-btn" disabled={!canGoNext} onclick={() => shiftDay(1)}>
					<svg width="10" height="10" viewBox="0 0 10 10"><path d="M3 1L7 5L3 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
			{/if}
		</div>
	</div>
</div>

<!-- Portal: physically moved to document.body to escape ancestor transform stacking -->
{#if open}
	<div use:portal class="dp-portal">
		<div class="dp-backdrop" onclick={() => (open = false)} role="presentation"></div>
		<div
			class="dp-panel"
			role="dialog"
			aria-modal="true"
			aria-label="Date picker"
			onclick={(e) => e.stopPropagation()}
			style={panelStyle}
		>
		<!-- Mobile drag handle -->
		<div class="dp-handle"></div>
		<!-- Month nav -->
		<div class="dp-month-nav">
			<button class="dp-month-btn" onclick={() => shiftMonth(-1)} aria-label="Previous month">
				<svg width="14" height="14" viewBox="0 0 10 10"><path d="M7 1L3 5L7 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
			</button>
			<span class="dp-month-label">{monthLabel}</span>
			<button class="dp-month-btn" onclick={() => shiftMonth(1)} aria-label="Next month">
				<svg width="14" height="14" viewBox="0 0 10 10"><path d="M3 1L7 5L3 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
			</button>
		</div>

		<!-- Weekday headers -->
		<div class="dp-weekdays">
			{#each weekdays as wd}
				<span class="dp-wd">{wd}</span>
			{/each}
		</div>

		<!-- Day grid -->
		<div class="dp-days">
			{#each days as cell (cell.date)}
				<button
					class="dp-day"
					class:other-month={!cell.isCurrentMonth}
					class:today={cell.isToday}
					class:selected={cell.isSelected}
					class:range-start={cell.isRangeStart}
					class:range-end={cell.isRangeEnd}
					class:in-range={cell.isInRange}
					disabled={cell.isDisabled}
					onclick={() => selectDate(cell.date)}
					onmouseenter={() => { if (rangeStart) hoverDate = cell.date; }}
				>
					{cell.day}
				</button>
			{/each}
		</div>

		<!-- Footer: Today jump + confirm -->
		<div class="dp-panel-footer">
			<button class="dp-today-btn" onclick={goToToday}>
				{lang === 'zh' ? '今天' : 'Today'}
			</button>
			{#if mode === 'range'}
				<button
					class="dp-confirm-btn"
					disabled={!pendingRange.from}
					onclick={confirmRange}
				>{lang === 'zh' ? '确定' : 'Confirm'}</button>
			{/if}
		</div>
	</div>
	</div>
{/if}

<style>
	.datepicker {
		position: relative;
		display: inline-flex;
		flex-direction: column;
	}

	/* --- Trigger --- */
	.dp-trigger {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.dp-presets {
		display: flex;
		gap: var(--space-1);
	}
	.dp-nav-group {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.dp-preset-btn {
		padding: var(--space-1) var(--space-3);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--fg-subtle);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		white-space: nowrap;
	}
	.dp-preset-btn:hover {
		border-color: rgba(255, 255, 255, 0.15);
		color: var(--fg-muted);
	}
	.dp-preset-btn.active {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.15);
		color: var(--fg-base);
	}

	.dp-nav-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--fg-subtle);
		cursor: pointer;
		flex-shrink: 0;
		transition: all var(--motion-fast) var(--easing);
	}
	.dp-nav-btn:hover:not(:disabled) {
		border-color: rgba(255, 255, 255, 0.15);
		color: var(--fg-muted);
	}
	.dp-nav-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.dp-display-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md);
		background: rgba(255, 255, 255, 0.05);
		color: var(--fg-base);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.dp-display-btn:hover {
		border-color: rgba(255, 255, 255, 0.15);
	}
	.dp-display-text {
		font-size: var(--text-sm);
		font-family: var(--font-mono, ui-monospace, monospace);
		white-space: nowrap;
	}
	.dp-cal-icon {
		color: var(--fg-subtle);
		flex-shrink: 0;
	}

	/* --- Portal wrapper (lives in document.body) --- */
	.dp-portal {
		position: fixed;
		inset: 0;
		z-index: 9999;
		pointer-events: none;
	}
	.dp-portal > * {
		pointer-events: auto;
	}

	/* --- Backdrop --- */
	.dp-backdrop {
		position: fixed;
		inset: 0;
		background: transparent;
	}

	/* --- Panel --- */
	.dp-panel {
		position: fixed;
		min-width: 280px;
		padding: var(--space-3);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-lg);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
	}

	.dp-handle {
		display: none;
	}

	/* --- Month nav --- */
	.dp-month-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-2);
	}
	.dp-month-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--fg-subtle);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.dp-month-btn:hover {
		background: rgba(255, 255, 255, 0.06);
		color: var(--fg-base);
	}
	.dp-month-label {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		text-transform: capitalize;
	}

	/* --- Weekdays --- */
	.dp-weekdays {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		margin-bottom: var(--space-1);
	}
	.dp-wd {
		text-align: center;
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-weight: var(--weight-medium);
		padding: var(--space-1) 0;
	}

	/* --- Day grid --- */
	.dp-days {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 1px;
	}
	.dp-day {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		margin: 0 auto;
		border: none;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--fg-base);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		position: relative;
	}
	.dp-day:hover:not(:disabled):not(.selected) {
		background: rgba(255, 255, 255, 0.06);
	}
	.dp-day.other-month {
		color: var(--fg-faint);
	}
	.dp-day.today:not(.selected) {
		box-shadow: inset 0 0 0 1.5px var(--accent);
	}
	.dp-day.selected {
		background: var(--accent);
		color: var(--fg-inverse, #fff);
		font-weight: var(--weight-semibold);
	}
	.dp-day.in-range {
		background: var(--accent-subtle, rgba(54, 160, 122, 0.12));
		border-radius: 0;
	}
	.dp-day.range-start {
		border-radius: var(--radius-full) 0 0 var(--radius-full);
	}
	.dp-day.range-end {
		border-radius: 0 var(--radius-full) var(--radius-full) 0;
	}
	.dp-day:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	/* --- Panel footer --- */
	.dp-panel-footer {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-3);
		padding-top: var(--space-2);
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}
	.dp-today-btn {
		padding: var(--space-1) var(--space-3);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--fg-subtle);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.dp-today-btn:hover {
		color: var(--fg-base);
		border-color: rgba(255, 255, 255, 0.15);
	}

	/* --- Confirm button --- */
	.dp-confirm-btn {
		padding: var(--space-1) var(--space-3);
		border: none;
		border-radius: var(--radius-full);
		background: var(--accent);
		color: var(--fg-inverse, #fff);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		cursor: pointer;
		white-space: nowrap;
		transition: opacity var(--motion-fast) var(--easing);
		margin-left: auto;
	}
	.dp-confirm-btn:hover:not(:disabled) {
		opacity: 0.85;
	}
	.dp-confirm-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* --- Light theme --- */
	:global([data-theme='light']) .dp-preset-btn {
		border-color: rgba(0, 0, 0, 0.08);
	}
	:global([data-theme='light']) .dp-preset-btn:hover {
		border-color: rgba(0, 0, 0, 0.15);
		color: var(--fg-muted);
	}
	:global([data-theme='light']) .dp-preset-btn.active {
		background: rgba(0, 0, 0, 0.05);
		border-color: rgba(0, 0, 0, 0.12);
	}
	:global([data-theme='light']) .dp-nav-btn {
		border-color: rgba(0, 0, 0, 0.08);
	}
	:global([data-theme='light']) .dp-nav-btn:hover:not(:disabled) {
		border-color: rgba(0, 0, 0, 0.15);
	}
	:global([data-theme='light']) .dp-display-btn {
		background: rgba(0, 0, 0, 0.03);
		border-color: rgba(0, 0, 0, 0.08);
	}
	:global([data-theme='light']) .dp-display-btn:hover {
		border-color: rgba(0, 0, 0, 0.15);
	}
	:global([data-theme='light']) .dp-panel {
		border-color: rgba(0, 0, 0, 0.08);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
	}
	:global([data-theme='light']) .dp-day:hover:not(:disabled):not(.selected) {
		background: rgba(0, 0, 0, 0.04);
	}
	:global([data-theme='light']) .dp-month-btn:hover {
		background: rgba(0, 0, 0, 0.04);
	}
	:global([data-theme='light']) .dp-panel-footer {
		border-top-color: rgba(0, 0, 0, 0.06);
	}
	:global([data-theme='light']) .dp-today-btn {
		border-color: rgba(0, 0, 0, 0.08);
	}
	:global([data-theme='light']) .dp-today-btn:hover {
		border-color: rgba(0, 0, 0, 0.15);
	}

	/* --- Mobile: bottom sheet --- */
	@media (max-width: 768px) {
		.dp-backdrop {
			background: rgba(0, 0, 0, 0.5);
		}

		.dp-panel {
			top: auto !important;
			left: 0 !important;
			right: 0 !important;
			bottom: 0 !important;
			min-width: unset;
			border-radius: var(--radius-xl) var(--radius-xl) 0 0;
			padding: var(--space-2) var(--space-4) var(--space-6);
			max-height: 70vh;
			overflow-y: auto;
		}

		.dp-handle {
			display: block;
			width: 36px;
			height: 4px;
			margin: 0 auto var(--space-3);
			background: rgba(255, 255, 255, 0.15);
			border-radius: var(--radius-full);
		}
		:global([data-theme='light']) .dp-handle {
			background: rgba(0, 0, 0, 0.12);
		}

		.dp-day {
			width: 40px;
			height: 40px;
			font-size: var(--text-sm);
		}

		.dp-preset-btn {
			padding: var(--space-1) var(--space-2);
		}
		.dp-nav-btn {
			width: 24px;
			height: 24px;
		}
	}
</style>
