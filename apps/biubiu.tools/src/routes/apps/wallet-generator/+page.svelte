<script lang="ts">
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import { t, locale, formatNumber } from '$lib/i18n';
	import type { TranslationKey } from '$i18n';
	import { getBaseSEO } from '$lib/seo';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import Stepper from '$lib/ui/Stepper.svelte';
	import ProgressBar from '$lib/ui/ProgressBar.svelte';
	import ConfirmModal from '$lib/ui/ConfirmModal.svelte';
	import Disclosure from '$lib/ui/Disclosure.svelte';
	import { walletGenerator as s, type Tab } from '$lib/pda-apps/wallet-generator/store.svelte.js';
	import { CHAIN_IDS as chainIds } from '$lib/pda-apps/wallet-generator/infra/chains';
	import { ArrowLeft, Copy, Check, ShieldCheck } from '@lucide/svelte';
	import XpubPanel from './XpubPanel.svelte';
	import SignPanel from './SignPanel.svelte';

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
					offers: { price: 0, priceCurrency: 'USD' }
				}
			}
		})
	);

	// Strength meter: map ~bits to a 0–100% bar (128 bits ≈ full).
	const strengthPct = $derived(Math.min(100, Math.round((s.strength.bits / 128) * 100)));

	// Single copy-feedback channel shared by the mnemonic + every table row.
	let copiedKey = $state('');
	let copyTimer: ReturnType<typeof setTimeout>;
	async function copyText(key: string, text: string) {
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
			copiedKey = key;
			clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copiedKey = ''), 1500);
		} catch {
			/* clipboard blocked — ignore */
		}
	}

	// Count input (string-bound for clean empty states + validation). Quick chips
	// just fill the count; there's one Generate action so the path stays obvious.
	let startInput = $state('0');
	let countInput = $state('1000');
	const customStart = $derived(Math.max(0, Math.floor(Number(startInput) || 0)));
	const customCount = $derived(Math.floor(Number(countInput)));
	const customValid = $derived(Number.isFinite(customCount) && customCount >= 1);
	function runCustom() {
		if (!customValid) return;
		s.generate(customStart, customCount);
	}

	// Step 1 advanced summary: shown on the collapsed disclosure so the current
	// chain/path is visible at a glance without expanding.
	const hdShort = $derived(
		(s.chainConfig.hdPaths.find((p) => p.value === s.hdPathType)?.label ?? '').split('—')[0].trim()
	);
	const advSummary = $derived(`${s.chainConfig.name} · ${hdShort}`);
	const advMarked = $derived(s.hdPathType !== 'bip44' || s.addressType !== 'default');

	const tabs: Tab[] = ['generate', 'xpub', 'sign'];

	// Gate plaintext-secret exports behind a confirmation.
	let pendingExport = $state<'pks' | 'all' | null>(null);
	function confirmExport() {
		if (pendingExport === 'pks') s.downloadPrivateKeys();
		else if (pendingExport === 'all') s.downloadAll();
		pendingExport = null;
	}
</script>

<SEO {...seoProps} />

<PageHeader />

<main class="page">
	<header class="hero" use:fadeInUp={{ delay: 0 }}>
		<h1 class="title">{t('wg.title')}</h1>
		<p class="subtitle">{t('wg.subtitle')}</p>
	</header>

	<!-- Security / offline note — compact; details available on expand. -->
	<div class="warn" use:fadeInUp={{ delay: 40 }}>
		<ShieldCheck class="warn-icon" size={18} />
		<div class="warn-body">
			<strong>{t('wg.security.title')}</strong>
			<p>{t('wg.security.body')}</p>
		</div>
	</div>

	<!-- Step indicator -->
	<div class="steps-wrap" use:fadeInUp={{ delay: 60 }}>
		<Stepper
			steps={[t('wg.step.secret'), t('wg.step.wallets')]}
			current={s.step - 1}
			onNavigate={(i) => {
				if (i === 0) s.back();
			}}
		/>
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
				<div class="bar">
					<div class="fill" data-level={s.strength.label} style="width:{strengthPct}%"></div>
				</div>
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

			<!-- Advanced: mnemonic preview + chain/path. Hidden by default so a
			     first-time user only sees secret → length → continue. The summary
			     keeps the current chain/path visible without expanding. -->
			<div class="advanced">
				<Disclosure title={t('wg.advanced')} summary={advSummary} marked={advMarked}>
					<div class="adv-body">
						<div class="mnemonic">
							<div class="mnemonic-head">
								<span class="field-label">{t('wg.mnemonic.label')}</span>
								<div class="mnemonic-actions">
									<button
										class="link"
										aria-pressed={s.revealMnemonic}
										onclick={() => (s.revealMnemonic = !s.revealMnemonic)}
									>
										{s.revealMnemonic ? t('wg.mnemonic.hide') : t('wg.mnemonic.reveal')}
									</button>
									<button
										class="link"
										disabled={!s.mnemonic}
										onclick={() => copyText('mnemonic', s.mnemonic)}
									>
										{copiedKey === 'mnemonic' ? t('wg.mnemonic.copied') : t('wg.mnemonic.copy')}
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

						<div class="opts">
							<div class="opt">
								<span class="field-label">{t('wg.chain.label')}</span>
								{#if chainIds.length > 1}
									<select
										class="opt-select"
										value={s.chain}
										onchange={(e) => s.setChain(e.currentTarget.value as 'evm')}
									>
										{#each chainIds as id (id)}
											<option value={id}>{id.toUpperCase()}</option>
										{/each}
									</select>
								{:else}
									<div class="opt-static">{s.chainConfig.name}</div>
								{/if}
							</div>
							{#if s.chainConfig.addressTypes.length > 1}
								<div class="opt">
									<span class="field-label">{t('wg.addressType.label')}</span>
									<select class="opt-select" bind:value={s.addressType}>
										{#each s.chainConfig.addressTypes as a (a.value)}
											<option value={a.value}>{a.label}</option>
										{/each}
									</select>
								</div>
							{/if}
							<div class="opt">
								<span class="field-label">{t('wg.hdPath.label')}</span>
								{#if s.chainConfig.hdPaths.length > 1}
									<select class="opt-select" bind:value={s.hdPathType}>
										{#each s.chainConfig.hdPaths as p (p.value)}
											<option value={p.value}>{p.label}</option>
										{/each}
									</select>
								{:else}
									<div class="opt-static">{s.chainConfig.hdPaths[0].label}</div>
								{/if}
							</div>
						</div>
					</div>
				</Disclosure>
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
				<div class="tabbar" role="tablist">
					{#each tabs as id (id)}
						<button
							class="tab"
							class:active={s.tab === id}
							role="tab"
							aria-selected={s.tab === id}
							onclick={() => (s.tab = id)}
						>
							{t(`wg.tab.${id}` as TranslationKey)}
						</button>
					{/each}
				</div>
			</div>

			{#if s.tab === 'generate'}
				<div class="gen">
					<div class="gen-row">
						<label class="inline-field grow">
							<span>{t('wg.gen.count')}</span>
							<input
								class="num wide"
								class:invalid={countInput !== '' && !customValid}
								type="text"
								inputmode="numeric"
								bind:value={countInput}
							/>
						</label>
						<button class="btn primary" disabled={s.generating || !customValid} onclick={runCustom}>
							{t('wg.gen.run')}
						</button>
					</div>
					<div class="gen-quick">
						<button class="chip" disabled={s.generating} onclick={() => (countInput = '100')}
							>100</button
						>
						<button class="chip" disabled={s.generating} onclick={() => (countInput = '1000')}>
							1000
						</button>
						<button class="chip" disabled={s.generating} onclick={() => (countInput = '10000')}>
							10000
						</button>
						<span class="gen-max">{t('wg.gen.max', { n: formatNumber(s.maxCount) })}</span>
					</div>
					<Disclosure
						title={t('wg.advanced')}
						summary="{t('wg.gen.start')} {customStart}"
						marked={customStart > 0}
					>
						<label class="inline-field">
							<span>{t('wg.gen.start')}</span>
							<input class="num" type="text" inputmode="numeric" bind:value={startInput} />
						</label>
					</Disclosure>
				</div>

				{#if s.generating}
					<div class="gen-progress">
						<ProgressBar
							percent={s.progressPct}
							status={t('wg.gen.generating', { pct: s.progressPct })}
						/>
					</div>
				{/if}

				{#if s.wallets.length === 0 && !s.generating}
					<p class="muted empty">{t('wg.gen.empty')}</p>
				{:else if s.wallets.length > 0}
					<div class="results-head">
						<span class="count">{t('wg.gen.done', { n: formatNumber(s.wallets.length) })}</span>
						<div class="results-actions">
							<button
								class="link"
								aria-pressed={s.revealKeys}
								onclick={() => (s.revealKeys = !s.revealKeys)}
							>
								{s.revealKeys ? t('wg.keys.hide') : t('wg.keys.reveal')}
							</button>
							<span class="dl-group">
								<button class="btn ghost small" onclick={() => s.downloadAddresses()}
									>{t('wg.download.addresses')}</button
								>
								<button class="btn ghost small" onclick={() => (pendingExport = 'pks')}
									>{t('wg.download.pks')}</button
								>
								<button class="btn ghost small" onclick={() => (pendingExport = 'all')}
									>{t('wg.download.all')}</button
								>
							</span>
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
										<td class="mono">
											<span class="cell">
												<span class="cell-val">{w.address}</span>
												<button
													class="copy-btn"
													title={t('wg.mnemonic.copy')}
													aria-label={t('wg.mnemonic.copy')}
													onclick={() => copyText(`a${w.index}`, w.address)}
												>
													{#if copiedKey === `a${w.index}`}<Check size={13} />{:else}<Copy
															size={13}
														/>{/if}
												</button>
											</span>
										</td>
										<td class="mono small key">
											{#if s.revealKeys}
												<span class="cell">
													<span class="cell-val">{w.privateKey}</span>
													<button
														class="copy-btn"
														title={t('wg.mnemonic.copy')}
														aria-label={t('wg.mnemonic.copy')}
														onclick={() => copyText(`k${w.index}`, w.privateKey)}
													>
														{#if copiedKey === `k${w.index}`}<Check size={13} />{:else}<Copy
																size={13}
															/>{/if}
													</button>
												</span>
											{:else}
												<span class="masked" aria-label={t('wg.keys.hide')}>••••••••••••••••</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					{#if s.pageCount > 1}
						<div class="pager">
							<button
								class="btn small"
								disabled={s.page === 0}
								onclick={() => s.setPage(s.page - 1)}
							>
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
			{:else if s.tab === 'xpub'}
				<XpubPanel />
			{:else if s.tab === 'sign'}
				<SignPanel />
			{/if}
		</section>
	{/if}
</main>

<ConfirmModal
	open={pendingExport !== null}
	destructive
	title={t('wg.download.warnTitle')}
	message={t('wg.download.warnBody')}
	confirmText={t('wg.download.warnConfirm')}
	onConfirm={confirmExport}
	onCancel={() => (pendingExport = null)}
/>

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

	/* House card pattern (token-driven, theme-correct — see agent-rules/UI-DESIGN-RULES.md). */
	.glass-card {
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-sm);
		padding: var(--space-5) var(--space-6);
	}

	/* Compact security note — calm, not a billboard. */
	.warn {
		display: flex;
		gap: var(--space-3);
		align-items: flex-start;
		padding: var(--space-3) var(--space-4);
		background: var(--warning-subtle);
		border: 1px solid var(--warning-muted);
		border-radius: var(--radius-lg);
	}
	.warn :global(.warn-icon) {
		flex-shrink: 0;
		margin-top: 1px;
		color: var(--warning);
	}
	.warn-body {
		min-width: 0;
	}
	.warn strong {
		display: block;
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.warn p {
		margin: var(--space-1) 0 0;
		color: var(--fg-muted);
		font-size: var(--text-xs);
		line-height: var(--leading-normal);
	}

	.steps-wrap {
		max-width: 420px;
		width: 100%;
		margin: 0 auto;
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
		box-shadow: 0 0 0 3px var(--accent-ring);
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
		background: var(--error);
	}
	.fill[data-level='fair'] {
		background: var(--warning);
	}
	.fill[data-level='strong'] {
		background: var(--success);
	}
	.strength-text {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		white-space: nowrap;
	}
	.strength-text[data-level='weak'] {
		color: var(--error);
	}
	.strength-text[data-level='fair'] {
		color: var(--warning);
	}
	.strength-text[data-level='strong'] {
		color: var(--success);
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
		color: var(--accent-fg);
	}

	.advanced {
		margin-top: var(--space-5);
	}
	.adv-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	/* Inside the disclosure the gap handles spacing — drop the standalone margins. */
	.adv-body .mnemonic,
	.adv-body .opts {
		margin-top: 0;
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

	.opts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--space-3);
		margin-top: var(--space-5);
	}
	.opt {
		display: flex;
		flex-direction: column;
	}
	.opt-select {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		color: var(--fg-base);
		font-size: var(--text-sm);
	}
	.opt-select:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	/* Single-option fields: shown as read-only info, not a one-item dropdown. */
	.opt-static {
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-family: var(--font-mono);
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
		color: var(--accent-fg);
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
		color: var(--accent-fg);
	}
	.tab:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
	.gen {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.gen-row {
		display: flex;
		align-items: flex-end;
		gap: var(--space-3);
	}
	.gen-quick {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.chip {
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--fg-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		font-family: var(--font-mono);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.chip:hover:not(:disabled) {
		border-color: var(--border-strong);
		color: var(--fg-base);
	}
	.chip:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.gen-max {
		margin-left: auto;
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.inline-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
	.inline-field.grow {
		flex: 1;
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
	.num.wide {
		width: 100%;
	}
	.num:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.num.invalid {
		border-color: var(--error);
	}
	.num.invalid:focus {
		box-shadow: 0 0 0 3px var(--error-muted);
	}
	.gen-progress {
		margin-top: var(--space-4);
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
		gap: var(--space-4);
		flex-wrap: wrap;
	}
	.dl-group {
		display: inline-flex;
		gap: var(--space-1);
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
		border-bottom: 1px solid var(--border-subtle);
		white-space: nowrap;
	}
	td.key {
		color: var(--fg-subtle);
	}
	.cell {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.copy-btn {
		display: inline-grid;
		place-items: center;
		width: 22px;
		height: 22px;
		flex-shrink: 0;
		border: none;
		background: transparent;
		color: var(--fg-subtle);
		border-radius: var(--radius-sm);
		cursor: pointer;
		opacity: 0;
		transition:
			opacity var(--motion-fast) var(--easing),
			color var(--motion-fast) var(--easing),
			background var(--motion-fast) var(--easing);
	}
	tr:hover .copy-btn,
	.copy-btn:focus-visible {
		opacity: 1;
	}
	.copy-btn:hover {
		color: var(--fg-base);
		background: var(--bg-elevated);
	}
	/* Touch devices have no hover — keep the copy affordance visible. */
	@media (hover: none) {
		.copy-btn {
			opacity: 1;
		}
	}
	.masked {
		color: var(--fg-faint);
		letter-spacing: 2px;
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
		.gen-row {
			flex-wrap: wrap;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.fill,
		.copy-btn,
		.btn {
			transition: none;
		}
	}
</style>
