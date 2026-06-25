<script lang="ts">
	import { t, preferences, locale } from '$lib/i18n';
	import { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_NAMES, type AppLanguage } from '$lib/locales';
	import { localizeHref as buildLocaleHref, removeLocaleFromPathname } from '@shelchin/i18n-sveltekit';
	import { browser } from '$app/environment';
	import {
		loadSettings,
		saveSettings,
		setTheme,
		setTextScale,
		getTextScales,
		type Theme,
		type TextScale,
		type TimeFormat,
		type Settings
	} from '$lib/settings';
	import Disclosure from '$lib/ui/Disclosure.svelte';
	import ServiceNodesModal from '$lib/widgets/ServiceNodesModal.svelte';
	import { CURRENCIES } from '$lib/wallet/infra/currency-catalog.js';

	let showServiceNodes = $state(false);

	// Unified settings state
	let settings = $state<Settings>({
		theme: 'dark',
		textScale: 'md',
		numberLocale: 'en-US',
		dateLocale: 'en-US',
		currency: 'USD',
		timezone: 'UTC',
		timeFormat: '24',
	});

	// Format presets shown by live example. The locale strings drive Intl directly,
	// so each example is exactly what the app renders. Timezone always follows the
	// browser — it isn't a user choice.
	const dateSample = new Date(Date.UTC(2026, 5, 13, 12, 0, 0));
	const numExample = (loc: string) =>
		new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1234567.89);
	const dateExample = (loc: string) =>
		new Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeZone: 'UTC' }).format(dateSample);

	const numberFormatOptions = [
		{ value: 'en-US', label: numExample('en-US') }, // 1,234,567.89
		{ value: 'de-DE', label: numExample('de-DE') }, // 1.234.567,89
		{ value: 'fr-FR', label: numExample('fr-FR') }, // 1 234 567,89
		{ value: 'en-IN', label: numExample('en-IN') }, // 12,34,567.89 (Indian grouping)
	];
	const dateFormatOptions = [
		{ value: 'en-US', label: dateExample('en-US') }, // Jun 13, 2026
		{ value: 'en-GB', label: dateExample('en-GB') }, // 13 Jun 2026
		{ value: 'de-DE', label: dateExample('de-DE') }, // 13.06.2026
		{ value: 'ja-JP', label: dateExample('ja-JP') }, // 2026/06/13
	];

	const textScales = getTextScales();

	// Visual font sizes for text scale options (in px)
	const scaleFontSizes: Record<TextScale, number> = {
		xs: 10, sm: 12, md: 14, lg: 16, xl: 18, '2xl': 20
	};


	// Load settings on mount
	let settingsLoaded = $state(false);
	$effect(() => {
		if (browser && !settingsLoaded) {
			settings = loadSettings();
			// Sync i18n preferences
			preferences.numberLocale = settings.numberLocale;
			preferences.dateLocale = settings.dateLocale;
			preferences.currency = settings.currency;
			preferences.timezone = settings.timezone;
			settingsLoaded = true;
		}
	});

	// Current UI language (resolved server-side, exposed via the i18n store)
	const currentLocale = $derived(locale.value as string);

	// Collapsed-state previews (built from existing data — no new i18n keys).
	const languageSummary = $derived(LOCALE_NAMES[currentLocale as AppLanguage] ?? '');
	const themeLabel = $derived(
		settings.theme === 'dark' ? t('settings.theme.dark') : t('settings.theme.light')
	);
	const appearanceSummary = $derived(`${themeLabel} · ${settings.textScale.toUpperCase()}`);
	const formatSummary = $derived(`${numExample(settings.numberLocale)} · ${settings.currency}`);

	function handleSetLocale(code: AppLanguage) {
		if (!browser || code === currentLocale) return;
		// Locales live in the URL (English bare, others prefixed). Navigate to the
		// SAME page under the new locale; a full load re-renders it server-side in
		// that language. The cookie just remembers the choice for the bare-root redirect.
		document.cookie = `locale=${code};path=/;max-age=31536000;SameSite=Lax`;
		const base = removeLocaleFromPathname(location.pathname, [...SUPPORTED_LOCALES]);
		const target =
			buildLocaleHref(base, { locale: code, defaultLocale: DEFAULT_LOCALE }) +
			location.search +
			location.hash;
		location.assign(target);
	}

	// Handlers
	function handleSetTheme(theme: Theme) {
		if (settings.theme !== theme) {
			setTheme(theme);
			settings = { ...settings, theme };
		}
	}

	function handleSetTextScale(scale: TextScale) {
		setTextScale(scale);
		settings = { ...settings, textScale: scale };
	}

	function handleSetNumberLocale(loc: string) {
		settings = { ...settings, numberLocale: loc };
		preferences.numberLocale = loc;
		saveSettings(settings);
	}

	function handleSetDateLocale(loc: string) {
		settings = { ...settings, dateLocale: loc };
		preferences.dateLocale = loc;
		saveSettings(settings);
	}

	function handleSetTimeFormat(format: TimeFormat) {
		settings = { ...settings, timeFormat: format };
		saveSettings(settings);
	}

	function handleSetCurrency(code: string) {
		settings = { ...settings, currency: code };
		preferences.currency = code;
		saveSettings(settings);
	}
</script>

<div class="settings-panel">
	<!-- Appearance — open by default: small, frequently-toggled controls -->
	<Disclosure title={t('settings.appearance')} summary={appearanceSummary} open>
		{#snippet icon()}
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="12" r="3"/>
				<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
			</svg>
		{/snippet}

		<div class="body-stack">
			<!-- Theme -->
			<div class="setting-row">
				<span class="setting-label">{t('settings.theme.title')}</span>
				<div class="button-group compact">
					<button
						class="option-btn icon-btn"
						class:active={settings.theme === 'light'}
						onclick={() => handleSetTheme('light')}
						title={t('settings.theme.light')}
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="4"/>
							<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
						</svg>
					</button>
					<button
						class="option-btn icon-btn"
						class:active={settings.theme === 'dark'}
						onclick={() => handleSetTheme('dark')}
						title={t('settings.theme.dark')}
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
						</svg>
					</button>
				</div>
			</div>

			<!-- Text Scale -->
			<div class="setting-row">
				<span class="setting-label">{t('settings.textSize')}</span>
				<div class="text-scale-group">
					{#each textScales as scale}
						<button
							class="scale-btn"
							class:active={settings.textScale === scale}
							onclick={() => handleSetTextScale(scale)}
							title={scale.toUpperCase()}
						>
							<span class="scale-letter" style="font-size: {scaleFontSizes[scale]}px;">A</span>
						</button>
					{/each}
				</div>
			</div>
		</div>
	</Disclosure>

	<!-- Language — collapsed: the 15-locale grid is the tallest block -->
	<Disclosure title={t('settings.language')} summary={languageSummary}>
		{#snippet icon()}
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="12" r="10"/>
				<path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
			</svg>
		{/snippet}

		<div class="lang-grid">
			{#each SUPPORTED_LOCALES as code}
				<button
					class="lang-btn"
					class:active={currentLocale === code}
					onclick={() => handleSetLocale(code)}
					lang={code}
				>
					{LOCALE_NAMES[code]}
				</button>
			{/each}
		</div>
	</Disclosure>

	<!-- Format — collapsed: number / date / time / currency -->
	<Disclosure title={t('settings.format')} summary={formatSummary}>
		{#snippet icon()}
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
				<polyline points="14 2 14 8 20 8"/>
				<line x1="16" y1="13" x2="8" y2="13"/>
				<line x1="16" y1="17" x2="8" y2="17"/>
				<polyline points="10 9 9 9 8 9"/>
			</svg>
		{/snippet}

		<div class="body-stack">
			<!-- Number Format -->
			<div class="setting-row stacked">
				<span class="setting-label">{t('settings.numberFormat')}</span>
				<div class="format-grid">
					{#each numberFormatOptions as opt}
						<button
							class="format-btn chip"
							class:active={settings.numberLocale === opt.value}
							onclick={() => handleSetNumberLocale(opt.value)}
						>
							{opt.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Date Format -->
			<div class="setting-row stacked">
				<span class="setting-label">{t('settings.dateFormat')}</span>
				<div class="format-grid">
					{#each dateFormatOptions as opt}
						<button
							class="format-btn chip"
							class:active={settings.dateLocale === opt.value}
							onclick={() => handleSetDateLocale(opt.value)}
						>
							{opt.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Time Format -->
			<div class="setting-row">
				<span class="setting-label">{t('settings.timeFormat')}</span>
				<div class="format-group">
					<button
						class="format-btn"
						class:active={settings.timeFormat === '24'}
						onclick={() => handleSetTimeFormat('24')}
					>
						14:30
					</button>
					<button
						class="format-btn"
						class:active={settings.timeFormat === '12'}
						onclick={() => handleSetTimeFormat('12')}
					>
						2:30 PM
					</button>
				</div>
			</div>

			<!-- Currency -->
			<div class="setting-row">
				<span class="setting-label">{t('settings.currency')}</span>
				<select
					class="currency-select"
					value={settings.currency}
					onchange={(e) => handleSetCurrency(e.currentTarget.value)}
				>
					{#each CURRENCIES as cur}
						<option value={cur.code}>{cur.code} · {cur.name}</option>
					{/each}
				</select>
			</div>
		</div>
	</Disclosure>

	<!-- Service Nodes — navigation row into its own modal -->
	<Disclosure
		title={t('settings.serviceNodes')}
		summary={t('settings.sn.desc')}
		onActivate={() => (showServiceNodes = true)}
	>
		{#snippet icon()}
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
				<rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
				<line x1="6" y1="6" x2="6.01" y2="6"/>
				<line x1="6" y1="18" x2="6.01" y2="18"/>
			</svg>
		{/snippet}
	</Disclosure>
</div>

<ServiceNodesModal open={showServiceNodes} onClose={() => (showServiceNodes = false)} />

<style>
	.settings-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	/* Stacks the rows inside a disclosure body */
	.body-stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	/* Setting Row */
	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.setting-label {
		font-size: var(--text-sm);
		color: var(--fg-base);
	}

	/* Button Group */
	.button-group {
		display: flex;
		gap: var(--space-2);
	}

	.button-group.compact {
		gap: var(--space-1);
	}

	.option-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		background: var(--bg-raised);
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.option-btn:hover {
		background: var(--bg-elevated);
		border-color: var(--border-strong);
		color: var(--fg-base);
	}

	.option-btn.active {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg-base);
	}

	.option-btn.icon-btn {
		padding: var(--space-2);
	}


	/* Text Scale Group */
	.text-scale-group {
		display: flex;
		align-items: baseline;
		gap: var(--space-1);
		padding: var(--space-1);
		background: var(--bg-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}

	.scale-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 28px;
		height: 28px;
		padding: var(--space-1);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.scale-btn:hover {
		background: var(--accent-muted);
	}

	.scale-btn.active {
		background: var(--accent);
	}

	.scale-letter {
		font-weight: var(--weight-bold);
		line-height: 1;
		color: var(--fg-muted);
		transition: color var(--motion-fast) var(--easing);
	}

	.scale-btn:hover .scale-letter {
		color: var(--fg-base);
	}

	.scale-btn.active .scale-letter {
		color: var(--bg-base);
	}

	/* Language Grid */
	.lang-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-1);
	}

	.lang-btn {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--bg-raised);
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		text-align: left;
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.lang-btn:hover {
		background: var(--bg-elevated);
		border-color: var(--border-base);
		color: var(--fg-base);
	}

	.lang-btn.active {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg-base);
	}

	/* Format Group */
	.format-group {
		display: flex;
		gap: var(--space-1);
		padding: var(--space-1);
		background: var(--bg-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}

	.format-btn {
		padding: var(--space-1) var(--space-3);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		white-space: nowrap;
	}

	.format-btn:hover {
		background: var(--accent-muted);
		color: var(--fg-base);
	}

	.format-btn.active {
		background: var(--accent);
		color: var(--bg-base);
	}

	/* Stacked row: label sits above a grid of format chips (for many/wide options) */
	.setting-row.stacked {
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-2);
	}

	.format-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-1);
	}

	.format-btn.chip {
		padding: var(--space-2);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--bg-raised);
		text-align: center;
	}

	.format-btn.chip:hover {
		background: var(--bg-elevated);
		border-color: var(--border-base);
		color: var(--fg-base);
	}

	.format-btn.chip.active {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg-base);
	}

	/* Currency select */
	.currency-select {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		background: var(--bg-raised);
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		max-width: 60%;
	}

	.currency-select:focus {
		outline: none;
		border-color: var(--accent);
	}
</style>
