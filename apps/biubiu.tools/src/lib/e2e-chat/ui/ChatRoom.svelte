<!--
  The connected chat: identity header, trust bar (safety-code state), message
  list, and the bottom region — which is the mandatory Safety-Code verification
  panel until the user confirms the code, then the composer. Everything is
  decrypted in-memory only. On mobile the room is a full-screen overlay whose
  bottom region rides above the on-screen keyboard.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { t } from '$lib/i18n';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import ConfirmModal from '$lib/ui/ConfirmModal.svelte';
	import MessageBubble from './MessageBubble.svelte';
	import { shortenAddress } from '../format.js';
	import type { ChatStore } from '../store.svelte.js';

	let { store }: { store: ChatStore } = $props();

	let draft = $state('');
	let showSafety = $state(false);
	let showEndConfirm = $state(false);
	let listEl = $state<HTMLDivElement | null>(null);
	let inputEl = $state<HTMLTextAreaElement | null>(null);
	let roomEl = $state<HTMLElement | null>(null);
	/** True while the list is scrolled to (near) the bottom. */
	let pinned = $state(true);
	/** True while the mobile on-screen keyboard is open (drives the layout lift). */
	let kbOpen = $state(false);

	const peerShort = $derived(shortenAddress(store.peer?.address ?? ''));
	const degraded = $derived(store.conn !== 'open' || !store.peerOnline);
	/** Stable, code-derived order for the 6-way picker (don't reshuffle on every render). */
	const choices = $derived([...(store.safety?.choices ?? [])].sort());
	/** A re-verify (vs the first one) — there's already history on screen. */
	const isRekey = $derived(!store.verified && store.messages.length > 0);

	// Focus the composer when it appears — but not on touch (avoids popping the
	// on-screen keyboard the moment you connect / unlock).
	$effect(() => {
		if (inputEl && window.matchMedia('(pointer: fine)').matches) inputEl.focus();
	});

	// Auto-scroll to the newest message only when the user is already at the
	// bottom, so scrolling up to re-read isn't interrupted.
	$effect(() => {
		void store.messages.length;
		if (listEl && pinned) listEl.scrollTop = listEl.scrollHeight;
	});

	// Mobile only: lock the page behind the full-screen room and lift the bottom
	// region above the on-screen keyboard. iOS Safari doesn't resize the layout
	// viewport, so visualViewport is required; Android/Chromium shrink 100dvh via
	// interactive-widget=resizes-content (then overlap is ~0 — no double-count).
	$effect(() => {
		const el = roomEl;
		if (!el || !window.matchMedia('(max-width: 640px)').matches) return;

		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		const vv = window.visualViewport;
		const vk = (navigator as unknown as { virtualKeyboard?: { overlaysContent: boolean } })
			.virtualKeyboard;
		if (vk) {
			try {
				vk.overlaysContent = true;
			} catch {
				/* not supported — visualViewport handles it */
			}
		}

		const update = () => {
			if (!vv) return;
			const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
			el.style.setProperty('--kb', `${overlap}px`);
			kbOpen = overlap > 80;
			if (untrack(() => pinned) && listEl) listEl.scrollTop = listEl.scrollHeight;
		};

		vv?.addEventListener('resize', update);
		vv?.addEventListener('scroll', update);
		update();

		return () => {
			document.body.style.overflow = prevOverflow;
			vv?.removeEventListener('resize', update);
			vv?.removeEventListener('scroll', update);
			el.style.removeProperty('--kb');
			kbOpen = false;
		};
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

<section class="room" bind:this={roomEl} data-kb-open={kbOpen}>
	<header class="head">
		<div class="who">
			<span class="peer-avatar" aria-hidden="true">{store.peer?.avatar ?? '👤'}</span>
			<span class="who-text">
				{#if store.peer?.address}
					<span class="peer-addr">{peerShort}</span>
					{#if store.peer.verified}
						<span class="wallet-ok" title={t('chat.room.walletVerified')} aria-hidden="true">✓</span
						>
					{/if}
				{:else}
					<span class="peer-name">{t('chat.room.anon')}</span>
				{/if}
			</span>
		</div>
		<button class="end" onclick={() => (showEndConfirm = true)}>{t('chat.room.end')}</button>
	</header>

	<div class="trust" data-state={store.verified ? 'ok' : 'pending'}>
		<button
			class="trust-main"
			onclick={() => (showSafety = true)}
			aria-label={t('chat.safety.title')}
		>
			<span class="trust-label">{t('chat.room.safetyTitle')}</span>
			{#if store.safety}
				<span class="digits">{store.safety.digits}</span>
				{#if store.verified}<span class="emoji">{store.safety.emoji}</span>{/if}
			{/if}
		</button>
		{#if store.verified}
			<span class="trust-pill ok">✓ {t('chat.room.confirmed')}</span>
		{:else}
			<span class="trust-pill warn">{t('chat.room.confirmPrompt')}</span>
		{/if}
	</div>

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

	{#if !store.verified}
		<div class="verify">
			<div class="verify-head">
				<strong>{t('chat.verify.title')}</strong>
				{#if isRekey}<span class="verify-rekey">{t('chat.verify.codeChanged')}</span>{/if}
			</div>
			{#if store.safety}
				<div class="verify-code">
					<span class="digits">{store.safety.digits}</span>
					<span class="emoji">{store.safety.emoji}</span>
				</div>
			{/if}
			<p class="verify-help">{t('chat.verify.help')}</p>
			<div class="verify-choices" role="group" aria-label={t('chat.verify.pickAria')}>
				{#each choices as choice (choice)}
					<button class="choice" onclick={() => store.confirmSafety(choice)}>{choice}</button>
				{/each}
			</div>
			{#if store.verifyMismatch}
				<div class="verify-warn" role="alert">{t('chat.verify.mismatch')}</div>
			{/if}
		</div>
	{:else}
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
	{/if}
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
	.who-text {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
	}
	.peer-avatar {
		font-size: var(--text-xl);
		line-height: 1;
	}
	.peer-addr {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--fg-base);
	}
	.peer-name {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}
	.wallet-ok {
		font-size: var(--text-xs);
		color: var(--success);
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
		border-bottom: 1px solid var(--border-subtle);
	}
	.trust-main {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
		padding: 0;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
	}
	.trust-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.trust .digits {
		font-family: var(--font-mono);
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		letter-spacing: 0.08em;
		color: var(--fg-base);
	}
	.trust .emoji {
		font-size: var(--text-lg);
	}
	.trust-pill {
		display: inline-flex;
		align-items: center;
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		white-space: nowrap;
	}
	.trust-pill.ok {
		color: var(--success);
		background: var(--success-muted);
	}
	.trust-pill.warn {
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
		flex: 1 1 auto;
		min-height: 0;
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

	/* ── verification panel (replaces the composer until the code is confirmed) ── */
	.verify {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
		border-top: 1px solid var(--border-subtle);
		background: var(--bg-elevated);
	}
	.verify-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.verify-head strong {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.verify-rekey {
		font-size: var(--text-xs);
		color: var(--warning);
	}
	.verify-code {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.verify-code .digits {
		font-family: var(--font-mono);
		font-size: var(--text-xl);
		font-weight: var(--weight-bold);
		letter-spacing: 0.12em;
		color: var(--fg-base);
	}
	.verify-code .emoji {
		font-size: var(--text-2xl);
		line-height: 1;
	}
	.verify-help {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--fg-muted);
		line-height: var(--leading-snug);
	}
	.verify-choices {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-2);
		margin-top: var(--space-1);
	}
	.choice {
		padding: var(--space-2) 0;
		font-size: var(--text-2xl);
		line-height: 1;
		background: var(--bg-base);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition:
			border-color var(--motion-fast) var(--easing),
			transform var(--motion-fast) var(--easing);
	}
	.choice:hover {
		border-color: var(--accent);
	}
	.choice:active {
		transform: translateY(1px);
	}
	.verify-warn {
		margin-top: var(--space-1);
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-xs);
		color: var(--error);
		background: var(--error-muted);
		border-radius: var(--radius-md);
		line-height: var(--leading-snug);
	}

	.composer {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
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

	/* ── mobile: full-screen overlay that rides above the on-screen keyboard ── */
	@media (max-width: 640px) {
		.room {
			position: fixed;
			inset: 0;
			z-index: 100;
			box-sizing: border-box;
			height: 100dvh;
			max-width: none;
			margin: 0;
			border: none;
			border-radius: 0;
			box-shadow: none;
			padding-bottom: var(--kb, 0px);
		}
		.head {
			padding-top: calc(var(--space-3) + env(safe-area-inset-top, 0px));
		}
		.room[data-kb-open='true'] .composer,
		.room[data-kb-open='true'] .verify {
			padding-bottom: var(--space-3);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.choice {
			transition: none;
		}
	}
</style>
