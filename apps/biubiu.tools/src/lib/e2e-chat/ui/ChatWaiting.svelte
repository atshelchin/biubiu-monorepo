<!--
  Creator's "share the link" screen. The invite carries the room id + the
  creator's ephemeral public key in the URL fragment (never sent to the relay).
-->
<script lang="ts">
	import { t } from '$lib/i18n';
	import QrCanvas from '$lib/ui/QrCanvas.svelte';
	import Spinner from './Spinner.svelte';
	import type { ChatStore } from '../store.svelte.js';

	let { store }: { store: ChatStore } = $props();

	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	async function copy() {
		if (!store.inviteUrl) return;
		try {
			await navigator.clipboard.writeText(store.inviteUrl);
			copied = true;
			if (copyTimer) clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 1800);
		} catch {
			/* clipboard blocked — user can select the text manually */
		}
	}
</script>

<section class="waiting">
	<Spinner />
	<h2>{t('chat.waiting.title')}</h2>
	<p class="desc">{t('chat.waiting.desc')}</p>

	{#if store.inviteUrl}
		<div class="qr">
			<QrCanvas value={store.inviteUrl} size={180} />
		</div>

		<div class="link-row">
			<input
				class="link"
				type="text"
				readonly
				value={store.inviteUrl}
				aria-label={t('chat.waiting.title')}
			/>
			<button class="copy" onclick={copy}>
				{copied ? t('chat.waiting.copied') : t('chat.waiting.copy')}
			</button>
		</div>

		<p class="warn">{t('chat.waiting.linkWarning')}</p>
	{/if}

	<button class="cancel" onclick={() => store.reset()}>{t('chat.waiting.cancel')}</button>
</section>

<style>
	.waiting {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		text-align: center;
		max-width: 460px;
		margin: 0 auto;
		padding: var(--space-10) var(--space-6);
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-sm);
	}

	h2 {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.desc {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
	}

	.qr {
		padding: var(--space-3);
		background: #ffffff;
		border-radius: var(--radius-lg);
		border: 1px solid var(--border-base);
	}

	.link-row {
		display: flex;
		gap: var(--space-2);
		width: 100%;
	}
	.link {
		flex: 1;
		min-width: 0;
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-muted);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
	}
	.copy {
		flex-shrink: 0;
		padding: var(--space-2) var(--space-4);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--accent-fg, var(--fg-inverse));
		background: var(--accent);
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: background var(--motion-fast) var(--easing);
	}
	.copy:hover {
		background: var(--accent-hover);
	}

	.warn {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--warning);
		line-height: var(--leading-snug);
	}

	.cancel {
		margin-top: var(--space-2);
		padding: var(--space-2) var(--space-4);
		font-size: var(--text-sm);
		color: var(--fg-muted);
		background: transparent;
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: border-color var(--motion-fast) var(--easing);
	}
	.cancel:hover {
		border-color: var(--border-strong);
	}
</style>
