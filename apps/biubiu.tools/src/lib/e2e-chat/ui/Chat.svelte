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
	import StatusView from './StatusView.svelte';

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
		{:else if store.phase === 'connected'}
			<ChatRoom {store} />
		{:else if store.phase === 'handshaking'}
			<StatusView loading title={t('chat.securing.title')} description={t('chat.securing.desc')} />
		{:else}
			<ChatLanding {store} {invite} {basePath} />
		{/if}
	</div>
</WalletGate>

<style>
	.chat-shell {
		width: 100%;
	}
</style>
