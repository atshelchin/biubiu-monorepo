<!--
  The connected chat: identity header, a slim trust bar (the safety code, tappable
  for the optional out-of-band check), the message list, and the composer.
  The channel auto-verifies via the encrypted handshake ACK, so there is no manual
  step; the composer just stays locked ("securing…") until that lands. On mobile
  the room is a full-screen overlay whose composer rides above the keyboard.
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

	// Focus the composer when it appears — but not on touch (avoids popping the
	// on-screen keyboard the moment you connect).
	$effect(() => {
		if (inputEl && store.verified && window.matchMedia('(pointer: fine)').matches) inputEl.focus();
	});

	// Auto-scroll to the newest message only when the user is already at the
	// bottom, so scrolling up to re-read isn't interrupted.
	$effect(() => {
		void store.messages.length;
		if (listEl && pinned) listEl.scrollTop = listEl.scrollHeight;
	});

	// Mobile only: lock the page behind the full-screen room and lift the composer
	// above the on-screen keyboard. iOS Safari doesn't resize the layout viewport,
	// so visualViewport is required; Android/Chromium shrink 100dvh via
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
		if (!text.trim() || !store.verified) return;
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

	<button class="trust" onclick={() => (showSafety = true)} aria-label={t('chat.safety.title')}>
		<span class="lock" aria-hidden="true">🔒</span>
		<span class="trust-label">{t('chat.room.safetyTitle')}</span>
		{#if store.safety}
			<span class="digits">{store.safety.digits}</span>
			<span class="emoji">{store.safety.emoji}</span>
		{/if}
		<span class="trust-info" aria-hidden="true">ⓘ</span>
	</button>

	{#if !store.verified}
		<div class="status info" role="status">{t('chat.securing.desc')}</div>
	{:else if degraded}
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
			autocomplete="off"
			autocapitalize="sentences"
			enterkeyhint="send"
			placeholder={t('chat.room.placeholder')}
			aria-label={t('chat.room.placeholder')}
		></textarea>
		<button class="send" type="submit" disabled={!store.verified || !draft.trim()}>
			{t('chat.room.send')}
		</button>
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

	/* Slim trust bar — the safety code, tappable for the optional OOB check. */
	.trust {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2) var(--space-4);
		background: var(--bg-sunken);
		border: none;
		border-bottom: 1px solid var(--border-subtle);
		cursor: pointer;
		text-align: left;
	}
	.lock {
		font-size: var(--text-sm);
		line-height: 1;
	}
	.trust-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.trust .digits {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		letter-spacing: 0.06em;
		color: var(--fg-base);
	}
	.trust .emoji {
		font-size: var(--text-base);
	}
	.trust-info {
		margin-left: auto;
		font-size: var(--text-sm);
		color: var(--fg-faint);
	}

	.status {
		padding: var(--space-2) var(--space-4);
		font-size: var(--text-xs);
		color: var(--warning);
		background: var(--warning-muted);
		text-align: center;
	}
	.status.info {
		color: var(--fg-muted);
		background: var(--bg-sunken);
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
		.room[data-kb-open='true'] .composer {
			padding-bottom: var(--space-3);
		}
		/* 16px keeps iOS from auto-zooming the page when the field is focused. */
		.input {
			font-size: 16px;
		}
	}
</style>
