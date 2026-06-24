<script lang="ts">
	/**
	 * Capsule-styled date picker. Replaces <input type="datetime-local"> (whose native calendar
	 * popup can't be themed) with a paper/serif/gold calendar. Date-only — a capsule opens the
	 * morning (09:00 local) of the chosen day. Only future days are selectable. Emits a
	 * datetime-local string ("YYYY-MM-DDT09:00") so the store's unlockUnix parsing is unchanged.
	 */
	import { locale, formatDate } from '$lib/i18n';
	import { portal } from '$lib/actions/portal';

	interface Props {
		value?: string;
		disabled?: boolean;
		placeholder?: string;
	}
	let { value = $bindable(''), disabled = false, placeholder = '' }: Props = $props();

	let open = $state(false);
	let root = $state<HTMLElement>();
	let popEl = $state<HTMLElement>();

	// The popup is portaled to <body> so it can't be clipped by an `overflow`
	// ancestor. That also drops it out of the `.forever` scope, so its position AND
	// the scoped theme vars it relies on are injected inline (read from the trigger,
	// which IS in scope). Globals like --space-*/--radius-* still resolve at :root.
	const FOREVER_VARS = ['--paper', '--edge', '--seal', '--seal-soft', '--ink', '--ink-soft', '--serif'];
	let popStyle = $state('');
	function updatePopPos() {
		if (!root) return;
		const r = root.getBoundingClientRect();
		const w = 280;
		const top = Math.round(r.bottom + 8);
		const left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - w - 8)));
		const cs = getComputedStyle(root);
		const vars = FOREVER_VARS.map((v) => `${v}:${cs.getPropertyValue(v)}`).join(';');
		popStyle = `top:${top}px;left:${left}px;${vars}`;
	}

	// Reposition while open so the popup tracks the trigger through scroll/resize.
	$effect(() => {
		if (!open) return;
		const onMove = () => updatePopPos();
		window.addEventListener('scroll', onMove, true);
		window.addEventListener('resize', onMove);
		return () => {
			window.removeEventListener('scroll', onMove, true);
			window.removeEventListener('resize', onMove);
		};
	});

	const pad = (n: number) => String(n).padStart(2, '0');
	const startOfToday = () => {
		const t = new Date();
		return new Date(t.getFullYear(), t.getMonth(), t.getDate());
	};

	const selected = $derived(value ? new Date(value) : null);
	const hasSelection = $derived(!!selected && !Number.isNaN(selected.getTime()));
	const triggerLabel = $derived(
		hasSelection ? formatDate(selected as Date, { dateStyle: 'long' }) : placeholder
	);

	// The month shown in the grid.
	let viewY = $state(0);
	let viewM = $state(0);
	function initView() {
		const base = hasSelection ? (selected as Date) : new Date();
		viewY = base.getFullYear();
		viewM = base.getMonth();
	}
	function toggle() {
		if (disabled) return;
		if (!open) {
			initView();
			updatePopPos();
		}
		open = !open;
	}

	const loc = $derived(locale.value as string);
	const weekdays = $derived.by(() => {
		const fmt = new Intl.DateTimeFormat(loc, { weekday: 'narrow' });
		// Jan 7 2024 is a Sunday → build Sun..Sat in the active locale.
		return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
	});
	const monthLabel = $derived(
		new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'long' }).format(new Date(viewY, viewM, 1))
	);

	interface Cell {
		d: number;
		date: Date;
		inMonth: boolean;
		disabled: boolean;
		on: boolean;
		today: boolean;
	}
	const grid = $derived.by((): Cell[] => {
		const first = new Date(viewY, viewM, 1);
		const startWd = first.getDay();
		const today = startOfToday().getTime();
		const sel = hasSelection
			? new Date(
					(selected as Date).getFullYear(),
					(selected as Date).getMonth(),
					(selected as Date).getDate()
				).getTime()
			: -1;
		const cells: Cell[] = [];
		for (let i = 0; i < 42; i++) {
			const date = new Date(viewY, viewM, 1 - startWd + i);
			const mid = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
			cells.push({
				d: date.getDate(),
				date,
				inMonth: date.getMonth() === viewM,
				disabled: mid <= today, // only days strictly in the future
				on: mid === sel,
				today: mid === today
			});
		}
		return cells;
	});

	function prevMonth() {
		if (viewM === 0) {
			viewM = 11;
			viewY--;
		} else viewM--;
	}
	function nextMonth() {
		if (viewM === 11) {
			viewM = 0;
			viewY++;
		} else viewM++;
	}
	function pick(c: Cell) {
		if (c.disabled) return;
		value = `${c.date.getFullYear()}-${pad(c.date.getMonth() + 1)}-${pad(c.date.getDate())}T09:00`;
		open = false;
	}

	function onWindowPointerDown(e: PointerEvent) {
		if (!open) return;
		const target = e.target as Node;
		// popEl is portaled out of `root`, so check both before treating a click as "outside".
		if (root?.contains(target) || popEl?.contains(target)) return;
		open = false;
	}
	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onKeydown} />

<div class="dp" bind:this={root}>
	<button
		type="button"
		class="dp-trigger"
		class:empty={!hasSelection}
		onclick={toggle}
		{disabled}
		aria-haspopup="dialog"
		aria-expanded={open}
	>
		{triggerLabel}
	</button>

	{#if open}
		<div class="dp-pop" use:portal bind:this={popEl} style={popStyle} role="dialog" aria-label={placeholder}>
			<div class="dp-head">
				<button type="button" class="dp-nav" onclick={prevMonth} aria-label="previous month">←</button>
				<span class="dp-month">{monthLabel}</span>
				<button type="button" class="dp-nav" onclick={nextMonth} aria-label="next month">→</button>
			</div>
			<div class="dp-grid dp-wd">
				{#each weekdays as w, i (i)}<span class="dp-w">{w}</span>{/each}
			</div>
			<div class="dp-grid">
				{#each grid as c, i (i)}
					<button
						type="button"
						class="dp-day"
						class:out={!c.inMonth}
						class:on={c.on}
						class:today={c.today}
						disabled={c.disabled}
						onclick={() => pick(c)}>{c.d}</button
					>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	/* Inherits --seal, --seal-soft, --ink, --ink-soft, --paper, --edge, --serif from the .forever scope. */
	.dp {
		position: relative;
		display: inline-block;
	}
	.dp-trigger {
		font-family: var(--serif);
		font-size: var(--text-sm);
		background: transparent;
		border: none;
		border-bottom: 1px dashed var(--seal);
		color: var(--seal);
		cursor: pointer;
		padding: 2px 4px;
	}
	.dp-trigger.empty {
		color: var(--ink-soft);
		font-style: italic;
	}
	.dp-trigger:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.dp-pop {
		/* Portaled to <body>; positioned via inline top/left from the trigger rect. */
		position: fixed;
		z-index: 9999;
		width: 280px;
		padding: var(--space-3);
		background: var(--paper);
		border: 1px solid var(--edge);
		border-radius: var(--radius-lg);
		box-shadow: 0 2px 8px rgba(40, 30, 10, 0.1), 0 16px 40px rgba(40, 30, 10, 0.16);
	}
	.dp-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-3);
	}
	.dp-month {
		font-family: var(--serif);
		font-size: var(--text-md);
		font-weight: 600;
		color: var(--ink);
		letter-spacing: 0.02em;
	}
	.dp-nav {
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		background: transparent;
		border: 1px solid var(--edge);
		border-radius: var(--radius-full);
		color: var(--ink-soft);
		cursor: pointer;
		font-size: var(--text-sm);
		transition: color 0.15s ease, border-color 0.15s ease;
	}
	.dp-nav:hover {
		color: var(--seal);
		border-color: var(--seal);
	}
	.dp-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
	}
	.dp-wd {
		margin-bottom: var(--space-1);
	}
	.dp-w {
		display: grid;
		place-items: center;
		height: 26px;
		font-family: var(--serif);
		font-size: var(--text-xs);
		color: var(--ink-soft);
		letter-spacing: 0.04em;
	}
	.dp-day {
		height: 34px;
		display: grid;
		place-items: center;
		font-family: var(--serif);
		font-size: var(--text-sm);
		color: var(--ink);
		background: transparent;
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: background 0.12s ease, color 0.12s ease;
	}
	.dp-day:hover:not(:disabled) {
		background: var(--seal-soft);
		color: var(--seal);
	}
	.dp-day.out {
		color: color-mix(in srgb, var(--ink-soft) 50%, transparent);
	}
	.dp-day.today:not(.on) {
		box-shadow: inset 0 0 0 1px var(--edge);
	}
	.dp-day.on {
		background: linear-gradient(180deg, #c8972f, #a9781f);
		color: #fff;
		font-weight: 600;
	}
	.dp-day:disabled {
		color: color-mix(in srgb, var(--ink-soft) 35%, transparent);
		cursor: default;
	}

	@media (prefers-reduced-motion: reduce) {
		.dp-nav,
		.dp-day {
			transition: none;
		}
	}
</style>
