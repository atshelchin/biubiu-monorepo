<script lang="ts">
	import { t, localizeHref } from '$lib/i18n';
	import { goto } from '$app/navigation';

	let searchValue = $state('');
	let inputRef: HTMLInputElement | undefined = $state();

	const tools = [
		{ id: 'balance-radar', keywords: ['balance', 'wallet', 'multi-chain', '余额', '钱包', '多链'] }
	];

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && searchValue.trim()) {
			const query = searchValue.toLowerCase();
			const match = tools.find(tool =>
				tool.keywords.some(k => k.toLowerCase().includes(query)) ||
				tool.id.includes(query)
			);
			if (match) {
				goto(localizeHref(`/tools/${match.id}`));
			} else {
				goto(localizeHref('/tools'));
			}
		}
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			inputRef?.focus();
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="search-container">
	<svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<circle cx="11" cy="11" r="8"/>
		<line x1="21" y1="21" x2="16.65" y2="16.65"/>
	</svg>
	<input
		bind:this={inputRef}
		bind:value={searchValue}
		type="text"
		class="search-input"
		placeholder={t('hero.searchPlaceholder')}
		onkeydown={handleKeydown}
	/>
	<kbd class="search-kbd">⌘K</kbd>
</div>

<style>
	.search-container {
		--search-height: 56px;
		--search-height-mobile: 48px;

		position: relative;
		display: flex;
		align-items: center;
		width: 100%;
		max-width: 480px;
		height: var(--search-height);
		margin: 0 auto;
		background: var(--glass-bg);
		backdrop-filter: blur(var(--blur-md));
		-webkit-backdrop-filter: blur(var(--blur-md));
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		transition: all var(--motion-fast) var(--easing);
	}

	.search-container:focus-within {
		border-color: var(--accent);
		box-shadow: var(--glow-accent);
	}

	.search-icon {
		position: absolute;
		left: var(--space-4);
		color: var(--fg-muted);
		pointer-events: none;
	}

	.search-input {
		flex: 1;
		height: 100%;
		padding: 0 var(--space-12) 0 calc(var(--space-4) + 20px + var(--space-3));
		background: transparent;
		border: none;
		outline: none;
		font-size: var(--text-base);
		color: var(--fg-base);
	}

	.search-input::placeholder {
		color: var(--fg-subtle);
	}

	.search-kbd {
		position: absolute;
		right: var(--space-4);
		padding: var(--space-1) var(--space-2);
		background: var(--bg-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		font-family: var(--font-sans);
		color: var(--fg-muted);
		pointer-events: none;
	}

	@media (max-width: 768px) {
		.search-container {
			height: var(--search-height-mobile);
		}

		.search-kbd {
			display: none;
		}
	}
</style>
