<script lang="ts">
	import ForeverOnboard from '$lib/pda-apps/forever/ForeverOnboard.svelte';
	import ProfileModal from '$lib/auth/ProfileModal.svelte';
	import { authStore } from '$lib/auth/auth-store.svelte.js';
	import { foreverStore, FEE_WEI } from '$lib/pda-apps/forever/store.svelte.js';
	import { formatDate, localizeHref } from '$lib/i18n';
	import { formatUnits } from 'viem';
	import { Lock, ExternalLink, AlertTriangle } from '@lucide/svelte';

	const store = foreverStore;
	let showProfile = $state(false);

	const busy = $derived(
		store.status === 'setup' || store.status === 'unlocking' || store.status === 'sealing'
	);

	const feeText = $derived(`${formatUnits(FEE_WEI, 18)} ${store.network?.nativeSymbol ?? ''}`);

	const placeholder = $derived(
		store.mode === 'capsule'
			? '写给未来的自己……到那一天，才会重见。'
			: '写下此刻。只有你，能再次读到它。'
	);

	const sealLabel = $derived(store.mode === 'capsule' ? '封存 · 寄往未来' : '封缄 · 永久写下');

	// Live tick for capsule countdowns (only while locked notes are shown).
	let now = $state(Math.floor(Date.now() / 1000));
	$effect(() => {
		if (!store.entries.some((e) => e.locked)) return;
		const id = setInterval(() => (now = Math.floor(Date.now() / 1000)), 1000);
		return () => clearInterval(id);
	});

	function countdown(unlockAt: number): string {
		const s = Math.max(0, unlockAt - now);
		const d = Math.floor(s / 86400);
		const h = Math.floor((s % 86400) / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = s % 60;
		const pad = (n: number) => String(n).padStart(2, '0');
		if (d > 0) return `还有 ${d} 天 ${h} 小时`;
		return `还有 ${pad(h)}:${pad(m)}:${pad(sec)}`;
	}

	const longDate = (sec: number) => formatDate(new Date(sec * 1000), { dateStyle: 'long' });
</script>

<svelte:head><title>致未来 · Forever</title></svelte:head>

<div class="forever">
	<div class="topbar">
		<a class="home" href={localizeHref('/')}>← biubiu.tools</a>
		{#if authStore.isLoggedIn}
			<button class="account" onclick={() => (showProfile = true)} aria-label="账户">
				<span class="avatar">{(authStore.user?.name ?? '·').charAt(0).toUpperCase()}</span>
				<span class="acct-name">{authStore.user?.name}</span>
			</button>
		{/if}
	</div>

	<header class="masthead">
		<div class="seal-mark" aria-hidden="true"><Lock size={18} /></div>
		<h1>致未来 · Forever</h1>
		<div class="rule" aria-hidden="true"></div>
		<p class="lead">写给未来的自己。加密上链，永不遗失，只有你能读。</p>
		<p class="lead-en">A letter to your future self — sealed on-chain, readable only by you.</p>
		<div class="chain-bar">
			<span>落笔于</span>
			<select bind:value={store.networkSlug} disabled={busy} aria-label="network">
				{#each store.networks as n (n.slug)}
					<option value={n.slug}>{n.name}{n.isTestnet ? '（测试网）' : ''}</option>
				{/each}
			</select>
		</div>
	</header>

	<ForeverOnboard>
			<!-- The writing sheet -->
			<section class="leaf sheet">
				<div class="modes" role="tablist" aria-label="note type">
					<button
						role="tab"
						aria-selected={store.mode === 'private'}
						class:on={store.mode === 'private'}
						onclick={() => (store.mode = 'private')}
						disabled={busy}>写给现在 · 私密</button
					>
					<button
						role="tab"
						aria-selected={store.mode === 'capsule'}
						class:on={store.mode === 'capsule'}
						onclick={() => (store.mode = 'capsule')}
						disabled={busy}>寄往未来 · 胶囊</button
					>
				</div>

				{#if store.mode === 'capsule'}
					<label class="capsule-line">
						<span>封存至</span>
						<input type="datetime-local" bind:value={store.unlockDate} disabled={busy} />
						<span class="hint">在那一刻之前，连你也打不开。</span>
					</label>
				{/if}

				<textarea
					class="paper"
					bind:value={store.text}
					rows="6"
					{placeholder}
					disabled={busy}
					aria-label="your note"
				></textarea>

				<footer class="sheet-foot">
					<div class="meta">
						<span>在 {store.network?.name} 上</span>
						<span class="dot">·</span>
						<span class:over={store.overLimit}>{store.byteLength} 字节</span>
						<span class="dot">·</span>
						<span>每条链每天一封</span>
					</div>

					<div class="commit">
						<button
							class="seal-btn"
							onclick={() => store.seal()}
							disabled={busy || !store.text.trim() || store.overLimit}
						>
							<Lock size={15} />
							{store.status === 'sealing' ? '封缄中…' : sealLabel}
						</button>
						<span class="price">付 {feeText}</span>
					</div>
				</footer>
			</section>

			<!-- Past letters -->
			<section class="archive">
				<div class="archive-head">
					<h2>往昔</h2>
					<button class="quiet sm" onclick={() => store.loadEntries()} disabled={store.loadingEntries || busy}>
						{store.loadingEntries ? '取信中…' : store.entries.length ? '刷新' : '取回我的信'}
					</button>
				</div>

				{#if store.entries.length}
					<ul class="letters">
						{#each store.entries as e (e.createdAt)}
							<li class="letter" class:sealed={e.locked}>
								<div class="when">{longDate(e.createdAt)}</div>
								{#if e.locked}
									<div class="sealed-body">
										<span class="wax" aria-hidden="true"><Lock size={16} /></span>
										<div>
											<div class="sealed-title">尚未开启 · 寄往未来的信</div>
											<div class="sealed-meta">
												将于 {longDate(e.unlockAt)} 开启 — {countdown(e.unlockAt)}
											</div>
										</div>
									</div>
								{:else if e.failed}
									<div class="bad"><AlertTriangle size={14} /> 无法解密这封信</div>
								{:else}
									<p class="text">{e.text}</p>
								{/if}
							</li>
						{/each}
					</ul>
					{#if store.hasMore}
						<button class="quiet sm more" onclick={() => store.loadMore()} disabled={store.loadingEntries}>
							{store.loadingEntries ? '取信中…' : `读更早的（还有 ${store.entriesTotal - store.entries.length} 封）`}
						</button>
					{/if}
				{:else if !store.loadingEntries}
					<p class="empty">这条链上还没有你的信。<br />写下第一封吧。</p>
				{/if}
			</section>
	</ForeverOnboard>

	{#if store.message}
		<div class="toast" class:err={store.status === 'error'} class:ok={store.status === 'done'} role="status">
			<span>{store.message}</span>
			{#if store.explorerTxUrl}
				<a href={store.explorerTxUrl} target="_blank" rel="noreferrer">查看交易 <ExternalLink size={12} /></a>
			{/if}
			{#if store.status === 'error' || store.status === 'done'}
				<button class="x" onclick={() => store.clearStatus()}>关闭</button>
			{/if}
		</div>
	{/if}

	<ProfileModal open={showProfile} onClose={() => (showProfile = false)} variant="forever" />
</div>

<style>
	.forever {
		--ink: var(--fg-base);
		--ink-soft: var(--fg-muted);
		--seal: #b8862f;
		--seal-soft: rgba(184, 134, 47, 0.12);
		--paper: color-mix(in srgb, var(--bg-raised) 88%, #c8972f 4%);
		--edge: var(--border-subtle, rgba(128, 110, 70, 0.18));
		--serif: 'Georgia', 'Songti SC', 'Noto Serif SC', 'Source Han Serif SC', serif;

		max-width: 600px;
		margin: 0 auto;
		padding: var(--space-16) var(--space-5) var(--space-24);
		font-family: var(--serif);
	}

	/* ── Topbar (quiet, on-theme) ── */
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-8);
		min-height: 34px;
	}
	.home {
		font-family: var(--serif);
		font-size: var(--text-sm);
		color: var(--ink-soft);
		text-decoration: none;
		letter-spacing: 0.02em;
		transition: color 0.2s ease;
	}
	.home:hover {
		color: var(--seal);
	}
	.account {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		background: transparent;
		border: 1px solid var(--edge);
		border-radius: var(--radius-full);
		padding: 4px 14px 4px 4px;
		cursor: pointer;
		transition: border-color 0.2s ease, transform 0.12s ease;
	}
	.account:hover {
		border-color: var(--seal);
		transform: translateY(-1px);
	}
	.avatar {
		width: 26px;
		height: 26px;
		display: grid;
		place-items: center;
		border-radius: var(--radius-full);
		background: var(--seal-soft);
		color: var(--seal);
		font-family: var(--serif);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.acct-name {
		font-family: var(--serif);
		font-size: var(--text-sm);
		color: var(--ink);
		max-width: 160px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* ── Masthead ── */
	.masthead {
		text-align: center;
		margin-bottom: var(--space-12);
	}
	.seal-mark {
		width: 40px;
		height: 40px;
		margin: 0 auto var(--space-4);
		display: grid;
		place-items: center;
		border-radius: var(--radius-full);
		color: var(--seal);
		background: var(--seal-soft);
		border: 1px solid color-mix(in srgb, var(--seal) 30%, transparent);
	}
	.masthead h1 {
		font-family: var(--serif);
		font-weight: 700;
		font-size: var(--text-4xl);
		letter-spacing: 0.01em;
		color: var(--ink);
	}
	.rule {
		width: 48px;
		height: 1px;
		margin: var(--space-4) auto;
		background: linear-gradient(90deg, transparent, var(--seal), transparent);
		opacity: 0.7;
	}
	.lead {
		font-size: var(--text-lg);
		color: var(--ink);
		line-height: var(--leading-relaxed);
	}
	.lead-en {
		margin-top: var(--space-1);
		font-size: var(--text-sm);
		font-style: italic;
		color: var(--ink-soft);
	}

	/* ── Leaf cards (paper) ── */
	.leaf {
		background: var(--paper);
		border: 1px solid var(--edge);
		border-radius: var(--radius-xl);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 10px 30px rgba(40, 30, 10, 0.06);
	}

	.chain-bar {
		margin-top: var(--space-5);
		font-size: var(--text-sm);
		color: var(--ink-soft);
		letter-spacing: 0.02em;
	}
	.chain-bar select {
		font-family: var(--serif);
		font-size: var(--text-sm);
		background: transparent;
		border: none;
		border-bottom: 1px dashed var(--seal);
		color: var(--seal);
		cursor: pointer;
		padding: 1px 4px;
	}

	/* ── Writing sheet ── */
	.sheet {
		padding: var(--space-5) var(--space-6) var(--space-6);
	}
	.modes {
		display: flex;
		gap: var(--space-6);
		justify-content: center;
		border-bottom: 1px solid var(--edge);
		margin-bottom: var(--space-5);
	}
	.modes button {
		background: none;
		border: none;
		font-family: var(--serif);
		font-size: var(--text-md);
		color: var(--ink-soft);
		padding: 0 0 var(--space-3);
		margin-bottom: -1px;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition: color 0.2s ease;
	}
	.modes button.on {
		color: var(--seal);
		border-bottom-color: var(--seal);
	}
	.modes button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.capsule-line {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		font-size: var(--text-md);
		color: var(--ink);
		margin-bottom: var(--space-4);
	}
	.capsule-line input {
		font-family: var(--serif);
		background: transparent;
		border: none;
		border-bottom: 1px dashed var(--seal);
		color: var(--ink);
		padding: 2px 4px;
	}
	.capsule-line .hint {
		flex-basis: 100%;
		font-size: var(--text-sm);
		font-style: italic;
		color: var(--ink-soft);
	}

	.paper {
		width: 100%;
		min-height: 180px;
		resize: vertical;
		background: transparent;
		border: none;
		outline: none;
		font-family: var(--serif);
		font-size: var(--text-xl);
		line-height: 1.85;
		color: var(--ink);
		/* faint ruled-paper baseline */
		background-image: repeating-linear-gradient(
			to bottom,
			transparent,
			transparent calc(1.85 * var(--text-xl) - 1px),
			color-mix(in srgb, var(--seal) 14%, transparent) calc(1.85 * var(--text-xl))
		);
	}
	.paper::placeholder {
		color: var(--ink-soft);
		font-style: italic;
		opacity: 0.7;
	}

	.sheet-foot {
		margin-top: var(--space-5);
		padding-top: var(--space-4);
		border-top: 1px solid var(--edge);
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--ink-soft);
	}
	.meta .dot {
		opacity: 0.5;
	}
	.meta .over {
		color: var(--error, #c0492f);
	}
	.commit {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
	}
	.price {
		font-size: var(--text-xs);
		color: var(--ink-soft);
	}

	/* ── Buttons ── */
	.seal-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-family: var(--serif);
		font-size: var(--text-md);
		font-weight: 600;
		letter-spacing: 0.02em;
		color: #fff;
		background: linear-gradient(180deg, #c8972f, #a9781f);
		border: 1px solid #93661a;
		border-radius: var(--radius-lg);
		padding: var(--space-3) var(--space-6);
		cursor: pointer;
		box-shadow: 0 1px 2px rgba(80, 50, 10, 0.25);
		transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
	}
	.seal-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 14px rgba(120, 80, 20, 0.28);
	}
	.seal-btn:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.quiet {
		background: none;
		border: none;
		font-family: var(--serif);
		font-size: var(--text-sm);
		color: var(--ink-soft);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-color: var(--edge);
	}
	.quiet:hover:not(:disabled) {
		color: var(--seal);
	}
	.quiet:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.quiet.sm {
		font-size: var(--text-sm);
	}

	/* ── Archive ── */
	.archive {
		margin-top: var(--space-12);
	}
	.archive-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: var(--space-5);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--edge);
	}
	.archive-head h2 {
		font-family: var(--serif);
		font-size: var(--text-xl);
		font-weight: 600;
		color: var(--ink);
		letter-spacing: 0.04em;
	}
	.letters {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}
	.letter .when {
		font-size: var(--text-sm);
		color: var(--seal);
		letter-spacing: 0.03em;
		margin-bottom: var(--space-2);
	}
	.letter .text {
		font-family: var(--serif);
		font-size: var(--text-lg);
		line-height: 1.8;
		color: var(--ink);
		white-space: pre-wrap;
		word-break: break-word;
		margin: 0;
	}
	.letter.sealed {
		background: var(--seal-soft);
		border: 1px solid color-mix(in srgb, var(--seal) 26%, transparent);
		border-radius: var(--radius-lg);
		padding: var(--space-4) var(--space-5);
	}
	.letter.sealed .when {
		color: var(--ink-soft);
	}
	.sealed-body {
		display: flex;
		gap: var(--space-3);
		align-items: center;
	}
	.wax {
		flex: none;
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		border-radius: var(--radius-full);
		color: var(--seal);
		background: color-mix(in srgb, var(--seal) 18%, transparent);
	}
	.sealed-title {
		font-size: var(--text-md);
		color: var(--ink);
	}
	.sealed-meta {
		font-size: var(--text-sm);
		color: var(--ink-soft);
		font-variant-numeric: tabular-nums;
	}
	.bad {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--error, #c0492f);
	}
	.more {
		display: block;
		margin: var(--space-6) auto 0;
	}
	.empty {
		text-align: center;
		color: var(--ink-soft);
		line-height: var(--leading-relaxed);
		padding: var(--space-10) 0;
	}

	/* ── Toast ── */
	.toast {
		margin-top: var(--space-6);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-lg);
		background: var(--paper);
		border: 1px solid var(--edge);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		flex-wrap: wrap;
		font-size: var(--text-sm);
		color: var(--ink);
	}
	.toast.err {
		color: var(--error, #c0492f);
		border-color: color-mix(in srgb, var(--error, #c0492f) 30%, transparent);
	}
	.toast.ok {
		color: var(--seal);
	}
	.toast a {
		color: var(--seal);
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.x {
		background: none;
		border: none;
		color: var(--ink-soft);
		text-decoration: underline;
		cursor: pointer;
		font-family: var(--serif);
	}

	@media (max-width: 560px) {
		.sheet-foot {
			flex-direction: column;
			align-items: stretch;
		}
		.commit {
			align-items: stretch;
		}
		.seal-btn {
			justify-content: center;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.seal-btn {
			transition: none;
		}
	}
</style>
