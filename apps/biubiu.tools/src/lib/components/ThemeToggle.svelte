<script lang="ts">
	import {
		toggleTheme,
		setTextScale,
		getTextScales,
		type Theme,
		type TextScale
	} from '$lib/theme';
	import { browser } from '$app/environment';

	let currentTheme = $state<Theme>('dark');
	let currentTextScale = $state<TextScale>('md');
	let showTextScaleMenu = $state(false);

	const textScales = getTextScales();
	const scaleLabels: Record<TextScale, string> = {
		xs: 'XS',
		sm: 'S',
		md: 'M',
		lg: 'L',
		xl: 'XL',
		'2xl': '2XL'
	};

	$effect(() => {
		if (browser) {
			currentTheme =
				(document.documentElement.getAttribute('data-theme') as Theme) || 'dark';
			currentTextScale =
				(document.documentElement.getAttribute('data-text-scale') as TextScale) || 'md';
		}
	});

	function handleToggleTheme() {
		currentTheme = toggleTheme();
	}

	function handleSelectTextScale(scale: TextScale) {
		setTextScale(scale);
		currentTextScale = scale;
		showTextScaleMenu = false;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.text-scale-wrapper')) {
			showTextScaleMenu = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="theme-toggle">
	<!-- Theme Toggle -->
	<button
		class="toggle-btn"
		onclick={handleToggleTheme}
		aria-label={currentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
		title={currentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
	>
		{#if currentTheme === 'dark'}
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="12" r="4"/>
				<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
			</svg>
		{:else}
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
			</svg>
		{/if}
	</button>

	<!-- Text Scale Toggle -->
	<div class="text-scale-wrapper">
		<button
			class="toggle-btn text-scale-btn"
			onclick={() => (showTextScaleMenu = !showTextScaleMenu)}
			aria-label="Change text size"
			title="Change text size"
		>
			<svg class="text-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M4 7V4h16v3"/>
				<path d="M9 20h6"/>
				<path d="M12 4v16"/>
			</svg>
			<span class="scale-label">{scaleLabels[currentTextScale]}</span>
		</button>

		{#if showTextScaleMenu}
			<div class="text-scale-menu">
				{#each textScales as scale}
					<button
						class="scale-option"
						class:active={scale === currentTextScale}
						onclick={() => handleSelectTextScale(scale)}
					>
						{scaleLabels[scale]}
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.theme-toggle {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.toggle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		background: var(--bg-raised);
		color: var(--fg-muted);
		transition:
			background-color var(--motion-fast) var(--easing),
			border-color var(--motion-fast) var(--easing),
			color var(--motion-fast) var(--easing);
	}

	.toggle-btn:hover {
		background: var(--bg-elevated);
		border-color: var(--border-strong);
		color: var(--fg-base);
	}

	.text-scale-wrapper {
		position: relative;
	}

	.text-scale-btn {
		min-width: 52px;
		gap: var(--space-1);
	}

	.text-icon {
		flex-shrink: 0;
	}

	.scale-label {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
	}

	.text-scale-menu {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: var(--space-2);
		padding: var(--space-1);
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		z-index: var(--z-dropdown);
	}

	.scale-option {
		padding: var(--space-2) var(--space-4);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		text-align: center;
		transition:
			background-color var(--motion-fast) var(--easing),
			color var(--motion-fast) var(--easing);
	}

	.scale-option:hover {
		background: var(--accent-muted);
		color: var(--fg-base);
	}

	.scale-option.active {
		background: var(--accent);
		color: var(--accent-fg);
	}
</style>
