<!--
  Entry screen: create a room, join via a pasted link, or accept an invite that
  was opened from a link. Also renders the "ended" and "error" terminal states.
-->
<script lang="ts">
	import { t } from '$lib/i18n';
	import { parseInvite, type Invite } from '../relay.js';
	import type { ChatStore } from '../store.svelte.js';

	let { store, invite, basePath }: { store: ChatStore; invite: Invite | null; basePath: string } =
		$props();

	let linkInput = $state('');
	let linkError = $state(false);

	function joinFromPaste() {
		const raw = linkInput.trim();
		const hashIdx = raw.indexOf('#');
		const parsed = parseInvite(hashIdx >= 0 ? raw.slice(hashIdx) : raw);
		if (!parsed) {
			linkError = true;
			return;
		}
		linkError = false;
		void store.join(parsed.roomId, parsed.creatorPub);
	}

	function acceptInvite() {
		if (invite) void store.join(invite.roomId, invite.creatorPub);
	}

	const endedTitle = $derived(
		store.endReason === 'peer'
			? t('chat.ended.peerTitle')
			: store.endReason === 'overflow'
				? t('chat.ended.overflowTitle')
				: t('chat.ended.selfTitle')
	);

	const errorMsg = $derived.by(() => {
		switch (store.errorCode) {
			case 'noWallet':
				return t('chat.error.noWallet');
			case 'noSign':
				return t('chat.error.noSign');
			case 'signFailed':
				return t('chat.error.signFailed');
			case 'roomFull':
				return t('chat.error.roomFull');
			case 'tampered':
				return t('chat.error.tampered');
			case 'connectFailed':
				return t('chat.error.connectFailed');
			default:
				return '';
		}
	});
</script>

{#if store.phase === 'ended'}
	<section class="card center">
		<div class="mark">🔒</div>
		<h2>{endedTitle}</h2>
		<p>{t('chat.ended.desc')}</p>
		<button class="primary" onclick={() => store.reset()}>{t('chat.ended.restart')}</button>
	</section>
{:else if store.phase === 'error'}
	<section class="card center">
		<div class="mark error">!</div>
		<h2>{t('chat.error.title')}</h2>
		<p>{errorMsg}</p>
		<button class="primary" onclick={() => store.reset()}>{t('chat.error.retry')}</button>
	</section>
{:else if store.phase === 'preparing'}
	<section class="card center">
		<div class="spinner" aria-hidden="true"></div>
		<h2>{t('chat.landing.preparing')}</h2>
		<p>{t('chat.landing.preparingDesc')}</p>
	</section>
{:else if invite}
	<section class="card center">
		<div class="mark">💬</div>
		<h2>{t('chat.landing.inviteTitle')}</h2>
		<p>{t('chat.landing.inviteDesc')}</p>
		<button class="primary" onclick={acceptInvite}>
			{t('chat.landing.inviteBtn')}
		</button>
	</section>
{:else}
	<div class="grid">
		<section class="card">
			<h3>{t('chat.landing.createTitle')}</h3>
			<p>{t('chat.landing.createDesc')}</p>
			<button class="primary" onclick={() => store.create(basePath)}>
				{t('chat.landing.createBtn')}
			</button>
		</section>

		<section class="card">
			<h3>{t('chat.landing.joinTitle')}</h3>
			<p>{t('chat.landing.joinDesc')}</p>
			<input
				class="link-input"
				class:invalid={linkError}
				type="text"
				bind:value={linkInput}
				oninput={() => (linkError = false)}
				placeholder={t('chat.landing.joinPlaceholder')}
				aria-label={t('chat.landing.joinTitle')}
			/>
			{#if linkError}<span class="hint">{t('chat.landing.invalidLink')}</span>{/if}
			<button class="ghost" onclick={joinFromPaste} disabled={!linkInput.trim()}>
				{t('chat.landing.joinBtn')}
			</button>
		</section>
	</div>
{/if}

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: var(--space-4);
		max-width: 760px;
		margin: 0 auto;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-6);
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-sm);
	}
	.card.center {
		align-items: center;
		text-align: center;
		max-width: 460px;
		margin: 0 auto;
	}

	.card h2 {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.card h3 {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.card p {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
	}

	.mark {
		font-size: var(--text-4xl);
		line-height: 1;
	}
	.mark.error {
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
		border-radius: var(--radius-full);
		background: var(--error-muted);
		color: var(--error);
		font-weight: var(--weight-bold);
		font-size: var(--text-2xl);
	}

	.primary {
		margin-top: var(--space-1);
		padding: var(--space-3) var(--space-5);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--accent-fg, var(--fg-inverse));
		background: var(--accent);
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: background var(--motion-fast) var(--easing);
	}
	.primary:hover {
		background: var(--accent-hover);
	}

	.ghost {
		padding: var(--space-2) var(--space-4);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: border-color var(--motion-fast) var(--easing);
	}
	.ghost:hover:not(:disabled) {
		border-color: var(--border-strong);
	}
	.ghost:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.link-input {
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-sm);
		color: var(--fg-base);
		background: var(--bg-base);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
	}
	.link-input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.link-input.invalid {
		border-color: var(--error);
	}
	.hint {
		font-size: var(--text-xs);
		color: var(--error);
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
