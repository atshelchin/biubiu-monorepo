<script lang="ts">
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import { t, locale } from '$lib/i18n';
	import type { TranslationKey } from '$i18n';
	import { getBaseSEO } from '$lib/seo';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import { walletGenerator as s, type Tab } from '$lib/pda-apps/wallet-generator/store.svelte.js';
	import { ArrowLeft } from '@lucide/svelte';

	const seoProps = $derived(
		getBaseSEO({
			title: t('wg.meta.title'),
			description: t('wg.meta.description'),
			currentLocale: locale.value,
			jsonLd: {
				type: 'SoftwareApplication' as const,
				data: {
					name: 'Wallet Generator',
					description: t('wg.meta.description'),
					applicationCategory: 'WebApplication',
					operatingSystem: 'Web Browser',
					offers: { price: 0, priceCurrency: 'USD' },
				},
			},
		}),
	);

	// Strength meter: map ~bits to a 0–100% bar (128 bits ≈ full).
	const strengthPct = $derived(Math.min(100, Math.round((s.strength.bits / 128) * 100)));

	let copied = $state(false);
	async function copyMnemonic() {
		if (!s.mnemonic) return;
		try {
			await navigator.clipboard.writeText(s.mnemonic);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* clipboard blocked — ignore */
		}
	}

	// Custom range inputs (string-bound for clean empty states).
	let startInput = $state('0');
	let countInput = $state('1000');
	function runCustom() {
		s.generate(parseInt(startInput || '0', 10), parseInt(countInput || '1', 10));
	}

	const tabs: { id: Tab; soon: boolean }[] = [
		{ id: 'generate', soon: false },
		{ id: 'xpub', soon: true },
		{ id: 'sign', soon: true },
	];

	function short(v: string): string {
		return v.length > 16 ? `${v.slice(0, 8)}…${v.slice(-6)}` : v;
	}
</script>

<SEO {...seoProps} />

<PageHeader />

<main class="page">
	<header class="hero" use:fadeInUp={{ delay: 0 }}>
		<h1 class="title">{t('wg.title')}</h1>
		<p class="subtitle">{t('wg.subtitle')}</p>
	</header>

	<!-- Security / offline warning -->
	<div class="warn glass-card" use:fadeInUp={{ delay: 40 }}>
		<strong>{t('wg.security.title')}</strong>
		<p>{t('wg.security.body')}</p>
	</div>

	<!-- Step indicator -->
	<div class="steps" use:fadeInUp={{ delay: 60 }}>
		<span class="step" class:active={s.step === 1}>1 · {t('wg.step.secret')}</span>
		<span class="dash"></span>
		<span class="step" class:active={s.step === 2}>2 · {t('wg.step.wallets')}</span>
	</div>

	{#if s.step === 1}
		<!-- ───────────────── STEP 1: secret + options ───────────────── -->
		<section class="glass-card" use:fadeInUp={{ delay: 80 }}>
			<label class="field-label" for="wg-pass">{t('wg.pass.label')}</label>
			<textarea
				id="wg-pass"
				class="pass-input"
				rows="3"
				placeholder={t('wg.pass.placeholder')}
				bind:value={s.passphrase}
			></textarea>

			<div class="strength">
				<div class="bar"><div class="fill" data-level={s.strength.label} style="width:{strengthPct}%"></div></div>
				<span class="strength-text" data-level={s.strength.label}>
					{t(`wg.strength.${s.strength.label}` as TranslationKey)}
					{#if s.strength.bits > 0}· {t('wg.strength.bits', { bits: s.strength.bits })}{/if}
				</span>
			</div>

			<!-- Mnemonic length -->
			<div class="row">
				<span class="field-label">{t('wg.words.label')}</span>
				<div class="seg">
					<button class:active={s.wordsLen === 12} onclick={() => (s.wordsLen = 12)}>
						{t('wg.words.12')}<small>{t('wg.words.12hint')}</small>
					</button>
					<button class:active={s.wordsLen === 24} onclick={() => (s.wordsLen = 24)}>
						{t('wg.words.24')}<small>{t('wg.words.24hint')}</small>
					</button>
				</div>
			</div>

			<!-- Mnemonic preview -->
			<div class="mnemonic">
				<div class="mnemonic-head">
					<span class="field-label">{t('wg.mnemonic.label')}</span>
					<div class="mnemonic-actions">
						<button class="link" onclick={() => (s.revealMnemonic = !s.revealMnemonic)}>
							{s.revealMnemonic ? t('wg.mnemonic.hide') : t('wg.mnemonic.reveal')}
						</button>
						<button class="link" disabled={!s.mnemonic} onclick={copyMnemonic}>
							{copied ? t('wg.mnemonic.copied') : t('wg.mnemonic.copy')}
						</button>
					</div>
				</div>
				<div class="mnemonic-box mono" class:masked={!s.revealMnemonic}>
					{#if !s.mnemonic}
						<span class="muted">—</span>
					{:else if s.revealMnemonic}
						{s.mnemonic}
					{:else}
						<span class="muted">{t('wg.mnemonic.hidden')}</span>
					{/if}
				</div>
			</div>

			<!-- Chain / address type / HD path -->
			<div class="grid3">
				<label class="select-field">
					<span class="field-label">{t('wg.chain.label')}</span>
					<select value={s.chain} onchange={(e) => s.setChain(e.currentTarget.value as 'evm')}>
						<option value="evm">{s.chainConfig.name}</option>
					</select>
				</label>
				<label class="select-field">
					<span class="field-label">{t('wg.addressType.label')}</span>
					<select bind:value={s.addressType}>
						{#each s.chainConfig.addressTypes as a (a.value)}
							<option value={a.value}>{a.label}</option>
						{/each}
					</select>
				</label>
				<label class="select-field">
					<span class="field-label">{t('wg.hdPath.label')}</span>
					<select bind:value={s.hdPathType}>
						{#each s.chainConfig.hdPaths as p (p.value)}
							<option value={p.value}>{p.label}</option>
						{/each}
					</select>
				</label>
			</div>

			<div class="actions-end">
				<button class="btn primary" disabled={!s.hasPassphrase} onclick={() => s.proceed()}>
					{t('wg.next')}
				</button>
			</div>
		</section>
	{:else}
		<!-- ───────────────── STEP 2: wallets ───────────────── -->
		<section class="glass-card" use:fadeInUp={{ delay: 80 }}>
			<div class="step2-head">
				<button class="btn ghost back-btn" onclick={() => s.back()}
					><ArrowLeft size={14} /> {t('wg.back')}</button
				>
				<div class="tabbar">
					{#each tabs as tb (tb.id)}
						<button
							class="tab"
							class:active={s.tab === tb.id}
							disabled={tb.soon}
							onclick={() => (s.tab = tb.id)}
						>
							{t(`wg.tab.${tb.id}` as TranslationKey)}
							{#if tb.soon}<span class="soon-badge">{t('wg.tab.soon')}</span>{/if}
						</button>
					{/each}
				</div>
			</div>

			{#if s.tab === 'generate'}
				<div class="gen-controls">
					<button class="btn" disabled={s.generating} onclick={() => s.generate(0, 100)}>
						{t('wg.gen.get100')}
					</button>
					<button class="btn" disabled={s.generating} onclick={() => s.generate(0, 1000)}>
						{t('wg.gen.get1000')}
					</button>
					<span class="divider"></span>
					<label class="inline-field">
						<span>{t('wg.gen.start')}</span>
						<input class="num" type="text" inputmode="numeric" bind:value={startInput} />
					</label>
					<label class="inline-field">
						<span>{t('wg.gen.count')}</span>
						<input class="num" type="text" inputmode="numeric" bind:value={countInput} />
					</label>
					<button class="btn primary" disabled={s.generating} onclick={runCustom}>
						{t('wg.gen.run')}
					</button>
				</div>

				{#if s.generating}
					<div class="progress">
						<div class="progress-fill" style="width:{s.progressPct}%"></div>
						<span class="progress-label">{t('wg.gen.generating', { pct: s.progressPct })}</span>
					</div>
				{/if}

				{#if s.wallets.length === 0 && !s.generating}
					<p class="muted empty">{t('wg.gen.empty')}</p>
				{:else if s.wallets.length > 0}
					<div class="results-head">
						<span class="count">{t('wg.gen.done', { n: s.wallets.length })}</span>
						<div class="results-actions">
							<button class="link" onclick={() => (s.revealKeys = !s.revealKeys)}>
								{s.revealKeys ? t('wg.keys.hide') : t('wg.keys.reveal')}
							</button>
							<button class="btn small" onclick={() => s.downloadAddresses()}>{t('wg.download.addresses')}</button>
							<button class="btn small" onclick={() => s.downloadPrivateKeys()}>{t('wg.download.pks')}</button>
							<button class="btn small" onclick={() => s.downloadAll()}>{t('wg.download.all')}</button>
						</div>
					</div>

					<div class="table-wrap">
						<table class="wallets">
							<thead>
								<tr>
									<th>{t('wg.table.index')}</th>
									<th>{t('wg.table.path')}</th>
									<th>{t('wg.table.address')}</th>
									<th>{t('wg.table.pk')}</th>
								</tr>
							</thead>
							<tbody>
								{#each s.pagedWallets as w (w.index)}
									<tr>
										<td class="muted">{w.index}</td>
										<td class="mono small">{w.path}</td>
										<td class="mono">{w.address}</td>
										<td class="mono small key">
											{s.revealKeys ? w.privateKey : short(w.privateKey).replace(/./g, '•')}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					{#if s.pageCount > 1}
						<div class="pager">
							<button class="btn small" disabled={s.page === 0} onclick={() => s.setPage(s.page - 1)}>
								{t('wg.page.prev')}
							</button>
							<span class="muted">{t('wg.page.of', { page: s.page + 1, total: s.pageCount })}</span>
							<button
								class="btn small"
								disabled={s.page >= s.pageCount - 1}
								onclick={() => s.setPage(s.page + 1)}
							>
								{t('wg.page.next')}
							</button>
						</div>
					{/if}
				{/if}
			{:else}
				<p class="muted empty">{t('wg.soon.body')}</p>
			{/if}
		</section>
	{/if}
</main>

<PageFooter />

<style>
	.page {
		max-width: 920px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.hero {
		text-align: center;
		padding: var(--space-8) 0 var(--space-2);
	}
	.title {
		font-size: var(--text-4xl);
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--fg-base);
		margin: 0;
	}
	.subtitle {
		font-size: var(--text-lg);
		color: var(--fg-muted);
		margin: var(--space-3) auto 0;
		max-width: 560px;
	}

	.glass-card {
		background: linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%);
		backdrop-filter: blur(20px) saturate(180%);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-md);
		padding: var(--space-5) var(--space-6);
	}

	.warn {
		border-color: var(--warning-muted, rgba(251, 191, 36, 0.3));
	}
	.warn strong {
		display: block;
		color: var(--warning, #fbbf24);
		font-size: var(--text-md);
		margin-bottom: var(--space-2);
	}
	.warn p {
		margin: 0;
		color: var(--fg-muted);
		font-size: var(--text-sm);
		line-height: var(--leading-relaxed);
	}

	.steps {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		font-size: var(--text-sm);
		color: var(--fg-subtle);
	}
	.step.active {
		color: var(--accent);
		font-weight: 600;
	}
	.dash {
		width: 32px;
		height: 1px;
		background: var(--border-base);
	}

	.field-label {
		display: block;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--fg-muted);
		margin-bottom: var(--space-2);
	}

	.pass-input {
		width: 100%;
		resize: vertical;
		font-family: var(--font-mono);
		font-size: var(--text-md);
		color: var(--fg-base);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		padding: var(--space-3);
		box-sizing: border-box;
	}
	.pass-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.strength {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-3);
	}
	.bar {
		flex: 1;
		height: 6px;
		border-radius: var(--radius-full);
		background: var(--bg-sunken);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		transition: width var(--motion-normal) var(--easing);
	}
	.fill[data-level='weak'] {
		background: var(--error, #f87171);
	}
	.fill[data-level='fair'] {
		background: var(--warning, #fbbf24);
	}
	.fill[data-level='strong'] {
		background: var(--success, #34d399);
	}
	.strength-text {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		white-space: nowrap;
	}
	.strength-text[data-level='weak'] {
		color: var(--error, #f87171);
	}
	.strength-text[data-level='strong'] {
		color: var(--success, #34d399);
	}

	.row {
		margin-top: var(--space-5);
	}
	.seg {
		display: inline-flex;
		gap: 2px;
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		padding: 2px;
	}
	.seg button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		padding: var(--space-2) var(--space-4);
		border: none;
		background: transparent;
		color: var(--fg-muted);
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.seg button small {
		font-size: 10px;
		font-weight: 400;
		opacity: 0.7;
	}
	.seg button.active {
		background: var(--accent);
		color: var(--accent-fg, #fff);
	}

	.mnemonic {
		margin-top: var(--space-5);
	}
	.mnemonic-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.mnemonic-actions {
		display: flex;
		gap: var(--space-3);
	}
	.mnemonic-box {
		margin-top: var(--space-2);
		padding: var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		line-height: var(--leading-relaxed);
		color: var(--fg-base);
		word-spacing: 4px;
		min-height: 1.5em;
	}
	.mnemonic-box.masked {
		font-style: italic;
	}

	.grid3 {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-3);
		margin-top: var(--space-5);
	}
	.select-field select {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		color: var(--fg-base);
		font-size: var(--text-sm);
	}

	.actions-end {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--space-6);
	}

	.btn {
		padding: var(--space-3) var(--space-5);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		background: var(--bg-raised);
		color: var(--fg-base);
		font-weight: 600;
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--motion-normal) var(--easing);
	}
	.btn:hover:not(:disabled) {
		transform: translateY(-1px);
	}
	.btn.primary {
		background: var(--accent);
		color: var(--accent-fg, #fff);
		border-color: transparent;
	}
	.btn.ghost {
		background: transparent;
	}
	.back-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.btn.small {
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-xs);
	}
	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.link {
		background: none;
		border: none;
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
		padding: 0;
	}
	.link:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.step2-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
		flex-wrap: wrap;
	}
	.tabbar {
		display: inline-flex;
		gap: 2px;
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		padding: 2px;
	}
	.tab {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border: none;
		background: transparent;
		color: var(--fg-muted);
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.tab.active {
		background: var(--accent);
		color: var(--accent-fg, #fff);
	}
	.tab:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
	.soon-badge {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		background: var(--bg-elevated);
		color: var(--fg-subtle);
		padding: 1px 5px;
		border-radius: var(--radius-full);
	}

	.gen-controls {
		display: flex;
		align-items: flex-end;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.divider {
		width: 1px;
		align-self: stretch;
		background: var(--border-base);
		margin: 0 var(--space-1);
	}
	.inline-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
	.num {
		width: 100px;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		color: var(--fg-base);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}

	.progress {
		position: relative;
		margin-top: var(--space-4);
		height: 24px;
		background: var(--bg-sunken);
		border-radius: var(--radius-md);
		overflow: hidden;
	}
	.progress-fill {
		height: 100%;
		background: var(--accent);
		transition: width var(--motion-fast) var(--easing);
	}
	.progress-label {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--text-xs);
		color: var(--fg-base);
	}

	.results-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-top: var(--space-5);
		flex-wrap: wrap;
	}
	.count {
		font-weight: 600;
		color: var(--fg-base);
	}
	.results-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.table-wrap {
		margin-top: var(--space-3);
		overflow-x: auto;
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
	}
	table.wallets {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}
	table.wallets th {
		text-align: left;
		padding: var(--space-2) var(--space-3);
		color: var(--fg-subtle);
		font-weight: 600;
		border-bottom: 1px solid var(--border-base);
		background: var(--bg-sunken);
	}
	table.wallets td {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border-subtle, var(--border-base));
		white-space: nowrap;
	}
	td.key {
		color: var(--fg-subtle);
	}

	.pager {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		margin-top: var(--space-4);
	}

	.mono {
		font-family: var(--font-mono);
	}
	.small {
		font-size: var(--text-xs);
	}
	.muted {
		color: var(--fg-subtle);
	}
	.empty {
		text-align: center;
		padding: var(--space-8) 0;
	}

	@media (max-width: 640px) {
		.title {
			font-size: var(--text-3xl);
		}
		.grid3 {
			grid-template-columns: 1fr;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.fill,
		.progress-fill,
		.btn {
			transition: none;
		}
	}
</style>
