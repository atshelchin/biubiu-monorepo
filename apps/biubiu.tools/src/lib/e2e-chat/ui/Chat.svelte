<!--
  E2E chat root. Anonymous by default — no wallet needed to start; the session
  controller (ChatStore) drives one calm, progressively-revealed screen.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { t, localizeHref } from '$lib/i18n';
	import { ChatStore } from '../store.svelte.js';
	import { parseInvite, loadResumeContext, saveResumeContext, type Invite } from '../relay.js';
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

		// Reload-resume: with no invite to act on, try to re-join a connected
		// session that was saved when the tab last went away. We re-handshake with
		// a fresh key (see store.resume) — no keys/plaintext are ever restored.
		if (!invite) {
			const ctx = loadResumeContext();
			if (ctx) void store.resume(ctx);
		}

		// Persist the (non-secret) resume context whenever the tab is hidden or
		// unloaded, so a reload can re-join. visibilitychange is more reliable than
		// pagehide on mobile; both are cheap and idempotent.
		const persist = () => {
			const ctx = store.snapshotForResume();
			if (ctx) saveResumeContext(ctx);
		};
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') persist();
		};
		// Only warn before leaving while still WAITING (no peer yet → not resumable);
		// a connected chat now recovers on reload, so we don't nag there.
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			persist();
			if (store.phase === 'waiting') {
				e.preventDefault();
				e.returnValue = '';
			}
		};
		window.addEventListener('pagehide', persist);
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => {
			window.removeEventListener('pagehide', persist);
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('beforeunload', onBeforeUnload);
		};
	});

	onDestroy(() => store.reset());
</script>

<div class="chat-shell">
	{#if store.phase === 'waiting'}
		<ChatWaiting {store} />
	{:else if store.phase === 'connected'}
		<ChatRoom {store} />
	{:else if store.phase === 'handshaking'}
		<StatusView
			loading
			title={t('chat.securing.title')}
			description={store.conn === 'reconnecting' || store.conn === 'connecting'
				? t('chat.room.reconnecting')
				: t('chat.securing.desc')}
		/>
	{:else}
		<ChatLanding {store} {invite} {basePath} />
	{/if}
</div>

<style>
	.chat-shell {
		width: 100%;
	}
</style>
