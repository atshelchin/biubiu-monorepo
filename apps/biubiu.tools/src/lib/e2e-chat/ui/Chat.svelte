<!--
  E2E chat root. Wallet connection is required (WalletGate), then the session
  controller (ChatStore) drives one calm, progressively-revealed screen.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { t, localizeHref } from '$lib/i18n';
	import WalletGate from '$lib/auth/WalletGate.svelte';
	import { ChatStore } from '../store.svelte.js';
	import { parseInvite, type Invite } from '../relay.js';
	import ChatLanding from './ChatLanding.svelte';
	import ChatWaiting from './ChatWaiting.svelte';
	import ChatRoom from './ChatRoom.svelte';

	const store = new ChatStore();
	const basePath = localizeHref('/apps/chat');
	let invite = $state<Invite | null>(null);

	onMount(() => {
		invite = parseInvite(location.hash);
		// Strip the key from the address bar / history once captured.
		if (invite) history.replaceState(null, '', location.pathname + location.search);
	});

	onDestroy(() => store.reset());
</script>

<WalletGate title={t('chat.gate.title')} description={t('chat.gate.desc')}>
	<div class="chat-shell">
		{#if store.phase === 'waiting'}
			<ChatWaiting {store} />
		{:else if store.phase === 'handshaking' || store.phase === 'connected'}
			{#if store.phase === 'connected'}
				<ChatRoom {store} />
			{:else}
				<section class="securing">
					<div class="spinner" aria-hidden="true"></div>
					<h2>{t('chat.securing.title')}</h2>
					<p>{t('chat.securing.desc')}</p>
				</section>
			{/if}
		{:else}
			<ChatLanding {store} {invite} {basePath} />
		{/if}
	</div>
</WalletGate>

<style>
	.chat-shell {
		width: 100%;
	}

	.securing {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		text-align: center;
		max-width: 420px;
		margin: 0 auto;
		padding: var(--space-12) var(--space-6);
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-sm);
	}
	.securing h2 {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.securing p {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.spinner {
		width: 28px;
		height: 28px;
		border-radius: var(--radius-full);
		border: 2px solid var(--border-base);
		border-top-color: var(--accent);
		animation: spin 0.9s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}
	}
</style>
