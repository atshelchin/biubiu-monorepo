<script lang="ts">
	import CapsuleOnboard from '$lib/pda-apps/capsule/CapsuleOnboard.svelte';
	import CapsuleDatePicker from '$lib/pda-apps/capsule/CapsuleDatePicker.svelte';
	import ProfileModal from '$lib/auth/ProfileModal.svelte';
	import BundlerFundingModal from '$lib/auth/BundlerFundingModal.svelte';
	import SubscriptionModal from '$lib/subscription/SubscriptionModal.svelte';
	import SettingsPanel from '$lib/widgets/SettingsPanel.svelte';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import { authStore } from '$lib/auth/auth-store.svelte.js';
	import { capsuleStore, FEE_WEI } from '$lib/pda-apps/capsule/store.svelte.js';
	import { t, locale, formatDate, localizeHref } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import { formatUnits } from 'viem';
	import { Lock, ExternalLink, AlertTriangle, Settings } from '@lucide/svelte';

	const store = capsuleStore;
	let showProfile = $state(false);
	let showSettings = $state(false);

	// Subscription modal state (opened from the profile's "Upgrade Pro" CTA)
	let showSubscription = $state(false);
	let subscriptionMode = $state<'subscribe' | 'renew' | 'transfer'>('subscribe');
	function openSubscription(mode: 'subscribe' | 'renew' | 'transfer') {
		subscriptionMode = mode;
		showSubscription = true;
	}

	// One focused state at a time: compose ('write') OR look back ('past') — never both.
	let view = $state<'write' | 'past'>('write');
	function enterPast() {
		view = 'past';
		if (!store.entries.length && !store.loadingEntries) store.loadEntries();
	}

	// Chain is chosen at the gate before entering, then shown read-only inside.
	const chainLabel = $derived(
		store.network ? store.network.name + (store.network.isTestnet ? t('capsule.chain.testnet') : '') : ''
	);

	const seoProps = $derived(
		getBaseSEO({
			title: t('capsule.meta.title'),
			description: t('capsule.meta.description'),
			currentLocale: locale.value
		})
	);

	const busy = $derived(
		store.status === 'setup' || store.status === 'unlocking' || store.status === 'sealing'
	);

	const feeText = $derived(`${formatUnits(FEE_WEI, 18)} ${store.network?.nativeSymbol ?? ''}`);

	// One writing surface; the placeholder and seal label only shift once you opt into a time-lock.
	const placeholder = $derived(
		store.locked ? t('capsule.write.placeholderLocked') : t('capsule.write.placeholder')
	);
	const sealLabel = $derived(
		store.locked ? t('capsule.seal.buttonLocked') : t('capsule.seal.button')
	);

	// Live tick for capsule countdowns (only while locked notes are shown).
	let now = $state(Math.floor(Date.now() / 1000));
	$effect(() => {
		if (!store.entries.some((e) => e.locked)) return;
		const id = setInterval(() => (now = Math.floor(Date.now() / 1000)), 1000);
		return () => clearInterval(id);
	});

	// When a capsule's unlock time passes while you're watching, re-fetch so it opens itself —
	// no manual refresh. Throttled (the drand beacon may lag a few seconds past the unlock time).
	let lastAutoReload = 0;
	$effect(() => {
		const matured = store.entries.some((e) => e.locked && e.unlockAt <= now);
		if (matured && !store.loadingEntries && now - lastAutoReload >= 15) {
			lastAutoReload = now;
			store.loadEntries();
		}
	});

	function countdown(unlockAt: number): string {
		const s = Math.max(0, unlockAt - now);
		const d = Math.floor(s / 86400);
		const h = Math.floor((s % 86400) / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = s % 60;
		const pad = (n: number) => String(n).padStart(2, '0');
		if (d > 0) return t('capsule.countdown.days', { days: d, hours: h });
		return t('capsule.countdown.hms', { time: `${pad(h)}:${pad(m)}:${pad(sec)}` });
	}

	const longDate = (sec: number) => formatDate(new Date(sec * 1000), { dateStyle: 'long' });
</script>

<SEO {...seoProps} />

<div class="forever">
	<div class="topbar">
		<a class="home" href={localizeHref('/')}>← {t('capsule.home')}</a>
		<div class="topbar-actions">
			<button
				class="icon-pill"
				onclick={() => (showSettings = true)}
				aria-label={t('capsule.settings.aria')}
				title={t('capsule.settings.aria')}
			>
				<Settings size={16} />
			</button>
			{#if authStore.isLoggedIn}
				<button class="account" onclick={() => (showProfile = true)} aria-label={t('capsule.account.aria')}>
					<span class="avatar">{(authStore.user?.name ?? '·').charAt(0).toUpperCase()}</span>
					<span class="acct-name">{authStore.user?.name}</span>
				</button>
			{/if}
		</div>
	</div>

	<header class="masthead">
		<div class="seal-mark" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
				<rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-45 12 12)" />
				<line x1="8.5" y1="8.5" x2="15.5" y2="15.5" />
			</svg>
		</div>
		<h1>{t('capsule.brand')}</h1>
		<div class="rule" aria-hidden="true"></div>
		<p class="lead">{t('capsule.tagline')}</p>
		{#if store.chainEntered}
			<div class="chain-bar">
				<span>{t('capsule.chain.on')}</span>
				<strong class="chain-current">{chainLabel}</strong>
				<button class="chain-switch" onclick={() => store.exitChain()} disabled={busy}>
					{t('capsule.chain.switch')}
				</button>
			</div>
		{/if}
	</header>

	{#if !store.chainEntered}
		<!-- Region gate: choose a chain before entering; it stays fixed until you exit. -->
		<section class="leaf gate">
			<h2>{t('capsule.gate.title')}</h2>
			<p class="gate-sub">{t('capsule.gate.subtitle')}</p>
			<div class="gate-grid">
				{#each store.networks as n (n.slug)}
					<button class="gate-chain" class:testnet={n.isTestnet} onclick={() => store.enterChain(n.slug)}>
						<span class="gate-name">{n.name}</span>
						{#if n.isTestnet}<span class="gate-tag">{t('capsule.chain.testnet')}</span>{/if}
					</button>
				{/each}
			</div>
		</section>
	{:else}

	<CapsuleOnboard>
			<!-- One focus at a time: write the present, or look back. Never both. -->
			<div class="view-switch" role="tablist" aria-label="view">
				<button
					role="tab"
					aria-selected={view === 'write'}
					class:on={view === 'write'}
					onclick={() => (view = 'write')}>{t('capsule.view.write')}</button
				>
				<button
					role="tab"
					aria-selected={view === 'past'}
					class:on={view === 'past'}
					onclick={enterPast}>{t('capsule.archive.title')}</button
				>
			</div>

		{#if view === 'write'}
			<!-- The writing sheet -->
			<section class="leaf sheet">
				<textarea
					class="paper"
					bind:value={store.text}
					rows="6"
					{placeholder}
					disabled={busy}
					aria-label="your letter"
				></textarea>

				<!-- Optional time-lock — the only decision, made right before sealing. -->
				<div class="lock-bar">
					<label class="lock-switch">
						<input type="checkbox" bind:checked={store.locked} disabled={busy} />
						<span class="track" aria-hidden="true"></span>
						<span>{t('capsule.lock.toggle')}</span>
					</label>
					{#if store.locked}
						<label class="lock-detail">
							<span>{t('capsule.lock.until')}</span>
							<CapsuleDatePicker bind:value={store.unlockDate} disabled={busy} placeholder={t('capsule.picker.pick')} />
						</label>
					{/if}
				</div>
				{#if store.locked}
					<p class="lock-hint">{t('capsule.lock.hint')}</p>
				{/if}

				<p class="permanence">{t('capsule.permanence')}</p>

					<footer class="sheet-foot">
					<div class="meta">
						<span>{t('capsule.meta.network', { network: store.network?.name ?? '' })}</span>
						<span class="dot">·</span>
						<span class:over={store.overLimit}>{t('capsule.meta.bytes', { count: store.byteLength })}</span>
						<span class="dot">·</span>
						<span>{t('capsule.meta.oneADay')}</span>
					</div>

					<div class="commit">
						<button
							class="seal-btn"
							onclick={() => store.seal()}
							disabled={busy || !store.text.trim() || store.overLimit}
						>
							<Lock size={15} />
							{store.status === 'sealing' ? t('capsule.seal.sealing') : sealLabel}
						</button>
						<span class="price">{t('capsule.seal.fee', { fee: feeText })}</span>
					</div>
				</footer>
			</section>
		{:else}
			<!-- Past letters -->
			<section class="archive">
				<div class="archive-tools">
					<span class="archive-count">
						{store.entriesTotal ? t('capsule.archive.count', { count: store.entriesTotal }) : ''}
					</span>
					<div class="archive-actions">
						{#if store.entries.length}
							<div class="sort-toggle" role="group" aria-label="sort">
								<button
									class:on={store.sortDir === 'desc'}
									onclick={() => store.setSort('desc')}
									disabled={store.loadingEntries}>{t('capsule.sort.newest')}</button
								>
								<button
									class:on={store.sortDir === 'asc'}
									onclick={() => store.setSort('asc')}
									disabled={store.loadingEntries}>{t('capsule.sort.oldest')}</button
								>
							</div>
						{/if}
						<button class="quiet sm" onclick={() => store.loadEntries()} disabled={store.loadingEntries}>
							{store.loadingEntries
								? t('capsule.archive.loading')
								: store.entries.length
									? t('capsule.archive.refresh')
									: t('capsule.archive.fetch')}
						</button>
					</div>
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
											<div class="sealed-title">{t('capsule.letter.lockedTitle')}</div>
											<div class="sealed-meta">
												{t('capsule.letter.lockedMeta', {
													date: longDate(e.unlockAt),
													countdown: countdown(e.unlockAt)
												})}
											</div>
										</div>
									</div>
								{:else if e.failed}
									<div class="bad"><AlertTriangle size={14} /> {t('capsule.letter.failed')}</div>
								{:else}
									<p class="text">{e.text}</p>
								{/if}
							</li>
						{/each}
					</ul>
					{#if store.hasMore}
						<button class="quiet sm more" onclick={() => store.loadMore()} disabled={store.loadingEntries}>
							{store.loadingEntries
								? t('capsule.archive.loading')
								: t('capsule.archive.more', { count: store.entriesTotal - store.entries.length })}
						</button>
					{/if}
				{:else if !store.loadingEntries}
					<p class="empty">{t('capsule.archive.empty')}</p>
				{/if}
			</section>
		{/if}
	</CapsuleOnboard>
	{/if}

	{#if store.message}
		<div class="toast" class:err={store.status === 'error'} class:ok={store.status === 'done'} role="status">
			<span>{store.message}</span>
			{#if store.explorerTxUrl}
				<a href={store.explorerTxUrl} target="_blank" rel="noreferrer">{t('capsule.toast.viewTx')} <ExternalLink size={12} /></a>
			{/if}
			{#if store.status === 'error' || store.status === 'done'}
				<button class="x" onclick={() => store.clearStatus()}>{t('capsule.toast.close')}</button>
			{/if}
		</div>
	{/if}

	<ProfileModal
		open={showProfile}
		onClose={() => (showProfile = false)}
		onSubscription={openSubscription}
		variant="forever"
	/>

	<SubscriptionModal
		open={showSubscription}
		onClose={() => (showSubscription = false)}
		mode={subscriptionMode}
		variant="forever"
	/>

	<ResponsiveModal open={showSettings} onClose={() => (showSettings = false)} title={t('settings.title')}>
		<div class="capsule-settings">
			<SettingsPanel />
		</div>
	</ResponsiveModal>

	<!-- Empty bundler gas account → offer free sponsorship or self-funding (with QR). -->
	<BundlerFundingModal
		open={!!store.funding}
		funding={store.funding}
		onFunded={() => store.retrySeal()}
		onClose={() => store.dismissFunding()}
	/>
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
	.topbar-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.icon-pill {
		display: inline-grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: var(--radius-full);
		background: transparent;
		border: 1px solid var(--edge);
		color: var(--ink-soft);
		cursor: pointer;
		transition: border-color 0.2s ease, color 0.2s ease, transform 0.12s ease;
	}
	.icon-pill:hover {
		border-color: var(--seal);
		color: var(--seal);
		transform: translateY(-1px);
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
	.chain-current {
		font-family: var(--serif);
		font-weight: 600;
		color: var(--seal);
		letter-spacing: 0.02em;
	}
	.chain-switch {
		margin-left: var(--space-2);
		font-family: var(--serif);
		font-size: var(--text-xs);
		color: var(--ink-soft);
		background: none;
		border: none;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-color: var(--edge);
		transition: color 0.2s ease;
	}
	.chain-switch:hover:not(:disabled) {
		color: var(--seal);
	}
	.chain-switch:disabled {
		opacity: 0.5;
		cursor: default;
	}

	/* ── Region gate (choose your chain before entering) ── */
	.gate {
		padding: var(--space-10) var(--space-8) var(--space-8);
		text-align: center;
	}
	.gate h2 {
		font-family: var(--serif);
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--ink);
		margin: 0 0 var(--space-2);
	}
	.gate-sub {
		font-size: var(--text-sm);
		color: var(--ink-soft);
		line-height: var(--leading-relaxed);
		max-width: 42ch;
		margin: 0 auto var(--space-8);
	}
	.gate-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-3);
	}
	.gate-chain {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: var(--space-2);
		font-family: var(--serif);
		font-size: var(--text-md);
		color: var(--ink);
		background: color-mix(in srgb, var(--bg-base) 40%, transparent);
		border: 1px solid var(--edge);
		border-radius: var(--radius-lg);
		padding: var(--space-4) var(--space-3);
		cursor: pointer;
		transition: border-color 0.16s ease, transform 0.12s ease, color 0.16s ease, background 0.16s ease;
	}
	.gate-chain:hover {
		border-color: var(--seal);
		color: var(--seal);
		transform: translateY(-2px);
		background: var(--seal-soft);
	}
	.gate-tag {
		font-size: var(--text-xs);
		color: var(--ink-soft);
	}
	.gate-chain.testnet {
		grid-column: 1 / -1;
	}

	/* ── View switch (Now / The past — one focus at a time) ── */
	.view-switch {
		display: flex;
		gap: var(--space-6);
		justify-content: center;
		margin-bottom: var(--space-6);
	}
	.view-switch button {
		background: none;
		border: none;
		font-family: var(--serif);
		font-size: var(--text-md);
		color: var(--ink-soft);
		padding: 0 0 var(--space-2);
		border-bottom: 2px solid transparent;
		cursor: pointer;
		letter-spacing: 0.06em;
		transition: color 0.2s ease, border-color 0.2s ease;
	}
	.view-switch button.on {
		color: var(--seal);
		border-bottom-color: var(--seal);
	}
	.view-switch button:hover:not(.on) {
		color: var(--ink);
	}

	/* ── Writing sheet ── */
	.sheet {
		padding: var(--space-6);
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

	/* ── Optional time-lock control ── */
	.lock-bar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-5);
		margin-top: var(--space-4);
	}
	.lock-switch {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
		font-size: var(--text-sm);
		color: var(--ink-soft);
		user-select: none;
	}
	.lock-switch input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.lock-switch .track {
		position: relative;
		flex: none;
		width: 34px;
		height: 20px;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--ink-soft) 26%, transparent);
		border: 1px solid var(--edge);
		transition: background 0.2s ease, border-color 0.2s ease;
	}
	.lock-switch .track::after {
		content: '';
		position: absolute;
		top: 1px;
		left: 1px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
		transition: transform 0.2s ease;
	}
	.lock-switch input:checked + .track {
		background: var(--seal);
		border-color: var(--seal);
	}
	.lock-switch input:checked + .track::after {
		transform: translateX(14px);
	}
	.lock-switch input:focus-visible + .track {
		outline: 2px solid var(--seal);
		outline-offset: 2px;
	}
	.lock-switch:has(input:checked) {
		color: var(--ink);
	}
	.lock-detail {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--ink);
	}
	.lock-detail input {
		font-family: var(--serif);
		background: transparent;
		border: none;
		border-bottom: 1px dashed var(--seal);
		color: var(--ink);
		padding: 2px 4px;
	}
	.lock-hint {
		margin-top: var(--space-2);
		font-size: var(--text-sm);
		font-style: italic;
		color: var(--ink-soft);
	}

	.permanence {
		margin: var(--space-5) 0 0;
		font-size: var(--text-xs);
		font-style: italic;
		letter-spacing: 0.02em;
		line-height: var(--leading-relaxed);
		text-align: center;
		color: color-mix(in srgb, var(--seal) 80%, var(--ink-soft));
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
		margin-top: var(--space-2);
	}
	.archive-tools {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-6);
		padding-bottom: var(--space-3);
		border-bottom: 1px solid var(--edge);
		flex-wrap: wrap;
	}
	.archive-count {
		font-family: var(--serif);
		font-size: var(--text-sm);
		color: var(--ink-soft);
		letter-spacing: 0.03em;
	}
	.archive-actions {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}
	.sort-toggle {
		display: inline-flex;
		gap: var(--space-1);
		padding: 2px;
		border: 1px solid var(--edge);
		border-radius: var(--radius-full);
	}
	.sort-toggle button {
		font-family: var(--serif);
		font-size: var(--text-xs);
		color: var(--ink-soft);
		background: none;
		border: none;
		border-radius: var(--radius-full);
		padding: 3px 12px;
		cursor: pointer;
		transition: background 0.16s ease, color 0.16s ease;
	}
	.sort-toggle button.on {
		background: var(--seal-soft);
		color: var(--seal);
	}
	.sort-toggle button:hover:not(.on):not(:disabled) {
		color: var(--ink);
	}
	.sort-toggle button:disabled {
		opacity: 0.5;
		cursor: default;
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
		white-space: pre-line;
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

	/* ── Settings (reuse the shared panel, re-tinted to the seal palette) ── */
	.capsule-settings {
		--accent: var(--seal);
		--accent-hover: #a9781f;
		--accent-muted: var(--seal-soft);
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
		.seal-btn,
		.icon-pill,
		.lock-switch .track,
		.lock-switch .track::after {
			transition: none;
		}
	}
</style>
