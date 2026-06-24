<!--
  The connected chat: identity header, trust bar (safety code + peer
  verification), message list, composer. Everything is decrypted in-memory only.
-->
<script lang="ts">
	import { t } from '$lib/i18n';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import ConfirmModal from '$lib/ui/ConfirmModal.svelte';
	import MessageBubble from './MessageBubble.svelte';
	import type { ChatStore } from '../store.svelte.js';

	let { store }: { store: ChatStore } = $props();

	let draft = $state('');
	let showSafety = $state(false);
	let showEndConfirm = $state(false);
	let listEl = $state<HTMLDivElement | null>(null);
	let inputEl = $state<HTMLTextAreaElement | null>(null);
	/** True while the list is scrolled to (near) the bottom. */
	let pinned = $state(true);

	const peerShort = $derived(shorten(store.peer?.address ?? ''));

	function shorten(addr: string): string {
		return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
	}

	const degraded = $derived(store.conn !== 'open' || !store.peerOnline);

	// Focus the composer when the room opens — but not on touch (avoids popping
	// the on-screen keyboard the moment you connect).
	$effect(() => {
		if (inputEl && window.matchMedia('(pointer: fine)').matches) inputEl.focus();
	});

	// Auto-scroll to the newest message only when the user is already at the
	// bottom, so scrolling up to re-read isn't interrupted.
	$effect(() => {
		void store.messages.length;
		if (listEl && pinned) listEl.scrollTop = listEl.scrollHeight;
	});

	function onScroll() {
		if (!listEl) return;
		pinned = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 120;
	}

	function autosize() {
		if (!inputEl) return;
		inputEl.style.height = 'auto';
		inputEl.style.height = `${Math.min(inputEl.scrollHeight, 140)}px`;
	}

	async function submit() {
		const text = draft;
		if (!text.trim()) return;
		draft = '';
		if (inputEl) inputEl.style.height = 'auto';
		pinned = true;
		await store.send(text);
		inputEl?.focus();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void submit();
		}
	}

	function confirmEnd() {
		showEndConfirm = false;
		store.end();
	}
</script>

<section class="room">
	<header class="head">
		<div class="who">
			<span class="peer-label">{t('chat.room.peer')}</span>
			<span class="peer-addr">{peerShort}</span>
		</div>
		<button class="end" onclick={() => (showEndConfirm = true)}>{t('chat.room.end')}</button>
	</header>

	<button class="trust" onclick={() => (showSafety = true)} aria-label={t('chat.safety.title')}>
		<span class="trust-code">
			<span class="trust-label">{t('chat.room.safetyTitle')}</span>
			{#if store.safety}
				<span class="safety-code">
					<span class="digits">{store.safety.digits}</span>
					<span class="emoji">{store.safety.emoji}</span>
				</span>
			{/if}
		</span>
		{#if store.peer?.verified}
			<span class="verify ok">✓ {t('chat.room.verified')}</span>
		{:else}
			<span class="verify warn">⚠ {t('chat.room.unverified')}</span>
		{/if}
	</button>

	{#if degraded}
		<div class="status" role="status">
			{store.conn !== 'open' ? t('chat.room.reconnecting') : t('chat.room.peerOffline')}
		</div>
	{/if}

	<div class="list" bind:this={listEl} onscroll={onScroll}>
		{#if store.messages.length === 0}
			<div class="empty">
				<h3>{t('chat.room.emptyTitle')}</h3>
				<p>{t('chat.room.emptyDesc')}</p>
			</div>
		{:else}
			{#each store.messages as message (message.id)}
				<MessageBubble {message} />
			{/each}
		{/if}
	</div>

	<form
		class="composer"
		onsubmit={(e) => {
			e.preventDefault();
			void submit();
		}}
	>
		<textarea
			class="input"
			rows="1"
			bind:this={inputEl}
			bind:value={draft}
			oninput={autosize}
			onkeydown={onKeydown}
			placeholder={t('chat.room.placeholder')}
			aria-label={t('chat.room.placeholder')}
		></textarea>
		<button class="send" type="submit" disabled={!draft.trim()}>{t('chat.room.send')}</button>
	</form>
</section>

<ResponsiveModal
	open={showSafety}
	onClose={() => (showSafety = false)}
	title={t('chat.safety.title')}
>
	<div class="safety-modal">
		{#if store.safety}
			<div class="safety-big">
				<span class="digits">{store.safety.digits}</span>
				<span class="emoji">{store.safety.emoji}</span>
			</div>
		{/if}
		<p>{t('chat.safety.body')}</p>
		<button class="modal-close" onclick={() => (showSafety = false)}
			>{t('chat.safety.close')}</button
		>
	</div>
</ResponsiveModal>

<ConfirmModal
	open={showEndConfirm}
	title={t('chat.room.endConfirm.title')}
	message={t('chat.room.endConfirm.message')}
	confirmText={t('chat.room.endConfirm.confirm')}
	destructive
	onConfirm={confirmEnd}
	onCancel={() => (showEndConfirm = false)}
/>

<style>
	.room {
		display: flex;
		flex-direction: column;
		height: min(72vh, 720px);
		max-width: 760px;
		margin: 0 auto;
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border-subtle);
	}
	.who {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
	.peer-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.peer-addr {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--fg-base);
	}
	.end {
		flex-shrink: 0;
		padding: var(--space-1) var(--space-3);
		font-size: var(--text-sm);
		color: var(--error);
		background: transparent;
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: border-color var(--motion-fast) var(--easing);
	}
	.end:hover {
		border-color: var(--error);
	}

	.trust {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
		width: 100%;
		padding: var(--space-2) var(--space-4);
		background: var(--bg-sunken);
		border: none;
		border-bottom: 1px solid var(--border-subtle);
		cursor: pointer;
		text-align: left;
	}
	.trust-code {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}
	.trust-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.safety-code {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.safety-code .digits {
		font-family: var(--font-mono);
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		letter-spacing: 0.08em;
		color: var(--fg-base);
	}
	.safety-code .emoji {
		font-size: var(--text-lg);
	}
	.verify {
		display: inline-flex;
		align-items: center;
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		white-space: nowrap;
	}
	.verify.ok {
		color: var(--success);
		background: var(--success-muted);
	}
	.verify.warn {
		color: var(--warning);
		background: var(--warning-muted);
	}

	.status {
		padding: var(--space-2) var(--space-4);
		font-size: var(--text-xs);
		color: var(--warning);
		background: var(--warning-muted);
		text-align: center;
	}

	.list {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.empty {
		margin: auto;
		text-align: center;
		color: var(--fg-muted);
	}
	.empty h3 {
		margin: 0 0 var(--space-1);
		font-size: var(--text-base);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}
	.empty p {
		margin: 0;
		font-size: var(--text-sm);
		max-width: 320px;
	}

	.composer {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border-top: 1px solid var(--border-subtle);
	}
	.input {
		flex: 1;
		resize: none;
		height: auto;
		max-height: 140px;
		overflow-y: auto;
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-sans);
		font-size: var(--text-base);
		line-height: var(--leading-normal);
		color: var(--fg-base);
		background: var(--bg-base);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		transition: border-color var(--motion-fast) var(--easing);
	}
	.input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.send {
		flex-shrink: 0;
		padding: var(--space-2) var(--space-5);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--accent-fg, var(--fg-inverse));
		background: var(--accent);
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: background var(--motion-fast) var(--easing);
	}
	.send:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.send:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.safety-modal {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-2);
		text-align: center;
	}
	.safety-big {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
	}
	.safety-big .digits {
		font-family: var(--font-mono);
		font-size: var(--text-3xl);
		font-weight: var(--weight-bold);
		letter-spacing: 0.1em;
		color: var(--fg-base);
	}
	.safety-big .emoji {
		font-size: var(--text-4xl);
	}
	.safety-modal p {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
		max-width: 420px;
	}
	.modal-close {
		padding: var(--space-2) var(--space-6);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--accent-fg, var(--fg-inverse));
		background: var(--accent);
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
	}
	.modal-close:hover {
		background: var(--accent-hover);
	}
</style>
