<script lang="ts">
	import { authStore } from '$lib/auth/auth-store.svelte.js';
	import { foreverStore, FEE_WEI } from '$lib/pda-apps/forever/store.svelte.js';
	import { formatDate } from '$lib/i18n';
	import { formatUnits } from 'viem';
	import { Lock, AlertTriangle, ExternalLink } from '@lucide/svelte';

	const store = foreverStore;

	const feeText = $derived(() => {
		const sym = store.network?.nativeSymbol ?? '';
		return `${formatUnits(FEE_WEI, 18)} ${sym}`;
	});

	const busy = $derived(store.status === 'setup' || store.status === 'unlocking' || store.status === 'sealing');

	async function connect() {
		await authStore.login();
	}
</script>

<svelte:head><title>致未来 · Forever</title></svelte:head>

<div class="page">
	<section class="hero">
		<h1>致未来 · Forever</h1>
		<p class="tagline">写给未来的自己，加密上链，永不遗失，只有你能读。</p>
		<p class="sub">A permanent, encrypted note on the chain you choose — readable only by you.</p>
	</section>

	{#if !authStore.isLoggedIn}
		<div class="card center">
			<p>Sign in with your passkey wallet to begin.</p>
			<button class="primary" onclick={connect} disabled={authStore.loading}>
				{authStore.loading ? 'Connecting…' : 'Connect passkey'}
			</button>
		</div>
	{:else if !store.hasKey}
		<div class="card center">
			<h2>Create your Forever key</h2>
			<p class="muted">
				A one-time setup creates a dedicated encryption passkey and publishes your encrypted key
				on-chain. Only this passkey can ever decrypt your notes.
			</p>
			<button class="primary" onclick={() => store.setupKey()} disabled={busy}>
				{store.status === 'setup' ? 'Setting up…' : 'Create encryption key'}
			</button>
		</div>
	{:else}
		<div class="card composer">
			<div class="field">
				<label for="net">Network</label>
				<select id="net" bind:value={store.networkSlug} disabled={busy}>
					{#each store.networks as n (n.slug)}
						<option value={n.slug}>{n.name}{n.isTestnet ? '' : ` · ${n.nativeSymbol}`}</option>
					{/each}
				</select>
			</div>

			<div class="field">
				<span class="lbl">Type</span>
				<div class="seg">
					<button type="button" class:active={store.mode === 'private'} onclick={() => (store.mode = 'private')} disabled={busy}>
						私密日记 · Private
					</button>
					<button type="button" class:active={store.mode === 'capsule'} onclick={() => (store.mode = 'capsule')} disabled={busy}>
						时间胶囊 · Capsule
					</button>
				</div>
			</div>

			{#if store.mode === 'capsule'}
				<div class="field">
					<label for="unlock">Unlock date</label>
					<input id="unlock" type="datetime-local" bind:value={store.unlockDate} disabled={busy} />
					<span class="muted">写给未来——到这一刻之前，连你自己也打不开。</span>
				</div>
			{/if}

			<div class="field">
				<label for="msg">Your note</label>
				<textarea
					id="msg"
					bind:value={store.text}
					rows="5"
					placeholder="写下此刻……"
					disabled={busy}
				></textarea>
				<div class="meta">
					<span class:over={store.overLimit}>{store.byteLength} bytes</span>
					<span class="muted">Fee {feeText()} · one note per network / 24h</span>
				</div>
			</div>

			{#if !store.unlocked}
				<button class="ghost" onclick={() => store.unlock()} disabled={busy}>Unlock to write</button>
			{/if}

			<button
				class="primary"
				onclick={() => store.seal()}
				disabled={busy || !store.text.trim() || store.overLimit}
			>
				{store.status === 'sealing' ? 'Sealing…' : '封缄 · Seal forever'}
			</button>
		</div>

		<section class="timeline">
			<div class="tl-head">
				<h2>Your notes</h2>
				<button class="ghost small" onclick={() => store.loadEntries()} disabled={store.loadingEntries || busy}>
					{store.loadingEntries ? 'Loading…' : store.entries.length ? 'Refresh' : 'Show my notes'}
				</button>
			</div>

			{#if store.entries.length}
				<ul class="entries">
					{#each store.entries as e (e.createdAt)}
						<li class="entry">
							<div class="entry-date">{formatDate(new Date(e.createdAt * 1000), { dateStyle: 'medium' })}</div>
							{#if e.locked}
								<div class="entry-body locked">
									<Lock size={14} />Time capsule · unlocks {formatDate(new Date(e.unlockAt * 1000), {
										dateStyle: 'medium'
									})}
								</div>
							{:else if e.failed}
								<div class="entry-body failed"><AlertTriangle size={14} />Could not decrypt</div>
							{:else}
								<div class="entry-body">{e.text}</div>
							{/if}
						</li>
					{/each}
				</ul>
				{#if store.hasMore}
					<button class="ghost small more" onclick={() => store.loadMore()} disabled={store.loadingEntries}>
						{store.loadingEntries ? 'Loading…' : `Load older (${store.entriesTotal - store.entries.length} more)`}
					</button>
				{/if}
			{:else if !store.loadingEntries}
				<p class="muted empty">No notes yet on {store.network?.name}.</p>
			{/if}
		</section>
	{/if}

	{#if store.message}
		<div class="status" class:err={store.status === 'error'} class:ok={store.status === 'done'}>
			<span>{store.message}</span>
			{#if store.explorerTxUrl}
				<a href={store.explorerTxUrl} target="_blank" rel="noreferrer"
					>View transaction <ExternalLink size={13} /></a
				>
			{/if}
			{#if store.status === 'error' || store.status === 'done'}
				<button class="link" onclick={() => store.clearStatus()}>Dismiss</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.page {
		max-width: 640px;
		margin: 0 auto;
		padding: var(--space-12) var(--space-5) var(--space-20);
	}
	.hero {
		text-align: center;
		margin-bottom: var(--space-10);
	}
	.hero h1 {
		font-size: var(--text-4xl);
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--fg-base);
	}
	.tagline {
		margin-top: var(--space-3);
		color: var(--fg-base);
		font-size: var(--text-lg);
	}
	.sub {
		margin-top: var(--space-1);
		color: var(--fg-muted);
		font-size: var(--text-sm);
	}
	.card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-xl);
		padding: var(--space-6);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}
	.center {
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		align-items: center;
	}
	.center h2 {
		font-weight: 700;
		font-size: var(--text-xl);
	}
	.composer {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	label,
	.lbl {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.seg {
		display: flex;
		gap: var(--space-2);
	}
	.seg button {
		flex: 1;
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.seg button.active {
		background: var(--accent, #36a07a);
		color: var(--accent-fg, #fff);
		border-color: transparent;
	}
	input[type='datetime-local'] {
		width: 100%;
		background: var(--bg-sunken, rgba(0, 0, 0, 0.2));
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-lg);
		padding: var(--space-3);
		color: var(--fg-base);
		font: inherit;
	}
	select,
	textarea {
		width: 100%;
		background: var(--bg-sunken, rgba(0, 0, 0, 0.2));
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-lg);
		padding: var(--space-3);
		color: var(--fg-base);
		font: inherit;
		resize: vertical;
	}
	textarea:focus,
	select:focus {
		outline: none;
		border-color: var(--accent, #36a07a);
	}
	.meta {
		display: flex;
		justify-content: space-between;
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
	.meta .over {
		color: var(--error, #d2564b);
	}
	.muted {
		color: var(--fg-muted);
	}
	button {
		border-radius: var(--radius-lg);
		padding: var(--space-3) var(--space-5);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.06);
		color: var(--fg-base);
		transition: transform 0.12s ease, background 0.12s ease;
	}
	button:hover:not(:disabled) {
		transform: translateY(-1px);
	}
	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	button.primary {
		background: var(--accent, #36a07a);
		color: var(--accent-fg, #fff);
		border-color: transparent;
	}
	button.ghost {
		background: transparent;
	}
	button.link {
		background: none;
		border: none;
		padding: 0;
		color: var(--fg-muted);
		text-decoration: underline;
	}
	.status {
		margin-top: var(--space-5);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-lg);
		background: rgba(255, 255, 255, 0.05);
		display: flex;
		gap: var(--space-4);
		align-items: center;
		justify-content: center;
		font-size: var(--text-sm);
		flex-wrap: wrap;
	}
	.status.err {
		color: var(--error, #d2564b);
	}
	.status.ok {
		color: var(--success, #36a07a);
	}
	.status a {
		color: var(--accent, #36a07a);
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.timeline {
		margin-top: var(--space-8);
	}
	.tl-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-4);
	}
	.tl-head h2 {
		font-size: var(--text-lg);
		font-weight: 700;
		color: var(--fg-base);
	}
	button.small {
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-sm);
	}
	.entries {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.entry {
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: var(--radius-lg);
		padding: var(--space-4);
	}
	.entry-date {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		margin-bottom: var(--space-2);
	}
	.entry-body {
		white-space: pre-wrap;
		word-break: break-word;
		color: var(--fg-base);
		line-height: var(--leading-relaxed);
	}
	.entry-body.locked {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--fg-muted);
		font-size: var(--text-sm);
	}
	.entry-body.failed {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--error, #d2564b);
		font-size: var(--text-sm);
	}
	.empty {
		text-align: center;
		padding: var(--space-6);
		font-size: var(--text-sm);
	}
	.more {
		display: block;
		margin: var(--space-4) auto 0;
	}
</style>
