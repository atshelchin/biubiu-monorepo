<!--
  Entry screen: create a room, or join via a pasted link / an opened invite.
  Also renders the "ended" and "error" terminal states (via StatusView).
-->
<script lang="ts">
	import { t } from '$lib/i18n';
	import { walletStore } from '$lib/wallet';
	import AuthModal from '$lib/auth/AuthModal.svelte';
	import { parseInvite, type Invite } from '../relay.js';
	import type { ChatStore } from '../store.svelte.js';
	import StatusView from './StatusView.svelte';

	let { store, invite, basePath }: { store: ChatStore; invite: Invite | null; basePath: string } =
		$props();

	let linkInput = $state('');
	let linkError = $state(false);
	let showAuth = $state(false);

	const walletAddr = $derived(walletStore.activeWallet?.address ?? '');
	const shortAddr = $derived(walletAddr ? `${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)}` : '');

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
	<StatusView icon="🔒" title={endedTitle} description={t('chat.ended.desc')}>
		{#snippet action()}
			<button class="primary" onclick={() => store.reset()}>{t('chat.ended.restart')}</button>
		{/snippet}
	</StatusView>
{:else if store.phase === 'error'}
	<StatusView icon="!" tone="error" title={t('chat.error.title')} description={errorMsg}>
		{#snippet action()}
			<button class="primary" onclick={() => store.reset()}>{t('chat.error.retry')}</button>
		{/snippet}
	</StatusView>
{:else if store.phase === 'preparing'}
	<StatusView
		loading
		title={t('chat.landing.preparing')}
		description={t('chat.landing.preparingDesc')}
	/>
{:else if invite}
	<StatusView
		icon="💬"
		title={t('chat.landing.inviteTitle')}
		description={t('chat.landing.inviteDesc')}
	>
		{#snippet action()}
			<button class="primary" onclick={acceptInvite}>{t('chat.landing.inviteBtn')}</button>
		{/snippet}
	</StatusView>
{:else}
	<div class="start">
		<ol class="steps">
			<li><span class="num">1</span><span>{t('chat.landing.steps.create')}</span></li>
			<li><span class="num">2</span><span>{t('chat.landing.steps.share')}</span></li>
			<li><span class="num">3</span><span>{t('chat.landing.steps.chat')}</span></li>
		</ol>

		<div class="card primary-card">
			<h3>{t('chat.landing.createTitle')}</h3>
			<p>{t('chat.landing.createDesc')}</p>
			<button class="primary lg" onclick={() => store.create(basePath)}>
				{t('chat.landing.createBtn')}
			</button>
		</div>

		<div class="join">
			<span class="join-label">{t('chat.landing.joinTitle')}</span>
			<div class="join-row">
				<input
					class="link-input"
					class:invalid={linkError}
					type="text"
					bind:value={linkInput}
					oninput={() => (linkError = false)}
					onkeydown={(e) => e.key === 'Enter' && joinFromPaste()}
					placeholder={t('chat.landing.joinPlaceholder')}
					aria-label={t('chat.landing.joinTitle')}
				/>
				<button class="ghost" onclick={joinFromPaste} disabled={!linkInput.trim()}>
					{t('chat.landing.joinBtn')}
				</button>
			</div>
			{#if linkError}<span class="hint">{t('chat.landing.invalidLink')}</span>{/if}
		</div>

		<div class="identity">
			{#if walletStore.isConnected}
				<span class="id-badge">✓ {shortAddr}</span>
				<span class="id-note">{t('chat.room.verified')}</span>
			{:else}
				<span class="id-note">{t('chat.landing.identityNote')}</span>
				<button class="link-btn" onclick={() => (showAuth = true)}>
					{t('chat.landing.connectOptional')}
				</button>
			{/if}
		</div>
	</div>

	<AuthModal open={showAuth} onClose={() => (showAuth = false)} />
{/if}

<style>
	.start {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		max-width: 480px;
		margin: 0 auto;
	}

	/* How it works */
	.steps {
		display: flex;
		justify-content: center;
		gap: var(--space-4);
		list-style: none;
		margin: 0;
		padding: 0;
		flex-wrap: wrap;
	}
	.steps li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
	.num {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: var(--radius-full);
		background: var(--accent-muted);
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
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
	.primary-card {
		align-items: center;
		text-align: center;
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

	.primary {
		padding: var(--space-3) var(--space-5);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--accent-fg, var(--fg-inverse));
		background: var(--accent);
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition:
			background var(--motion-fast) var(--easing),
			transform var(--motion-fast) var(--easing);
	}
	.primary:hover {
		background: var(--accent-hover);
	}
	.primary:active {
		transform: translateY(1px);
	}
	.primary.lg {
		margin-top: var(--space-1);
		padding: var(--space-3) var(--space-8);
		font-size: var(--text-base);
	}

	/* Secondary: paste a link */
	.join {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.join-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-align: center;
	}
	.join-row {
		display: flex;
		gap: var(--space-2);
	}
	.link-input {
		flex: 1;
		min-width: 0;
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-sm);
		color: var(--fg-base);
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		transition: border-color var(--motion-fast) var(--easing);
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
		text-align: center;
	}

	.ghost {
		flex-shrink: 0;
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

	/* Identity footer (anonymous by default; optional wallet) */
	.identity {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--border-subtle);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-align: center;
	}
	.id-badge {
		font-family: var(--font-mono);
		color: var(--success);
		font-weight: var(--weight-medium);
	}
	.id-note {
		color: var(--fg-subtle);
	}
	.link-btn {
		padding: 0;
		font-size: var(--text-xs);
		color: var(--accent);
		background: none;
		border: none;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.link-btn:hover {
		color: var(--accent-hover);
	}
</style>
