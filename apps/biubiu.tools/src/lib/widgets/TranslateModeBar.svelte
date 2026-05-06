<script lang="ts">
	import { t } from '$lib/i18n';
	import { translateMode, shortcutKey } from '$lib/translate-mode.svelte';
</script>

{#if translateMode.enabled}
	<div class="translate-mode-bar">
		<div class="bar-content">
			<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M12 20h9"/>
				<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
			</svg>
			<span>{t('settings.helpTranslate.hint', { key: shortcutKey })}</span>
		</div>
		<button class="close-btn" onclick={() => translateMode.disable()} aria-label="Close">
			<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="18" y1="6" x2="6" y2="18"/>
				<line x1="6" y1="6" x2="18" y2="18"/>
			</svg>
		</button>
	</div>
{/if}

<style>
	.translate-mode-bar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		padding: var(--space-2) var(--space-4);
		background: var(--accent);
		color: var(--bg-base);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
	}

	.bar-content {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-1);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: inherit;
		cursor: pointer;
		opacity: 0.7;
		transition: opacity var(--motion-fast) var(--easing);
	}

	.close-btn:hover {
		opacity: 1;
	}
</style>
