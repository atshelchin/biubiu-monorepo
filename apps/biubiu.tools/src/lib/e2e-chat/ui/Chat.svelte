<!--
  E2E chat root. Anonymous by default — no wallet needed to start; the session
  controller (ChatStore) drives one calm, progressively-revealed screen.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { t, localizeHref } from '$lib/i18n';
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

		// Guard against accidentally closing/reloading an active chat (which would
		// end it for good — keys are in memory only).
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			if (store.phase === 'connected' || store.phase === 'waiting') {
				e.preventDefault();
				e.returnValue = '';
			}
		};
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	});

	onDestroy(() => store.reset());
</script>

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

<style>
	.chat-shell {
		width: 100%;
	}
</style>
