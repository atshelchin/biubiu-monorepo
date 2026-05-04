<script lang="ts">
	import { t, preferences } from '$lib/i18n';
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

	// Unified settings state
	let settings = $state<Settings>({
		theme: 'dark',
		textScale: 'md',
		numberLocale: 'en-US',
		dateLocale: 'en-US',
		currency: 'USD',
		timezone: 'UTC',
		timeFormat: '24',
		weekStartDay: 1,
	});

	const localTimezone = browser ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
	const timezoneOptions = $derived.by(() => {
		const base = [
			{ value: localTimezone, label: 'Local' },
			{ value: 'UTC', label: 'UTC' },
			{ value: 'America/New_York', label: 'ET' },
			{ value: 'Asia/Shanghai', label: 'UTC+8' },
		];
		// Deduplicate if local TZ matches a named option
		const seen = new Set<string>();
		return base.filter(o => {
			if (seen.has(o.value)) return false;
			seen.add(o.value);
			return true;
		});
	});

	const textScales = getTextScales();

	// Visual font sizes for text scale options (in px)
	const scaleFontSizes: Record<TextScale, number> = {
		xs: 10, sm: 12, md: 14, lg: 16, xl: 18, '2xl': 20
	};

	// Supported currencies
	const currencies: { code: string; symbol: string; name: string }[] = [
		{ code: 'USD', symbol: '$', name: 'US Dollar' },
		{ code: 'CNY', symbol: '¥', name: '人民币' },
		{ code: 'EUR', symbol: '€', name: 'Euro' },
		{ code: 'GBP', symbol: '£', name: 'British Pound' },
		{ code: 'JPY', symbol: '¥', name: '日本円' },
		{ code: 'KRW', symbol: '₩', name: '한국 원' },
		{ code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
		{ code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
		{ code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
		{ code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
		{ code: 'INR', symbol: '₹', name: 'Indian Rupee' },
		{ code: 'BRL', symbol: 'R$', name: 'Real Brasileiro' },
		{ code: 'MXN', symbol: 'MX$', name: 'Peso Mexicano' },
		{ code: 'TRY', symbol: '₺', name: 'Türk Lirası' },
		{ code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
		{ code: 'IDR', symbol: 'Rp', name: 'Rupiah Indonesia' },
	];

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
			preferences.weekStartDay = settings.weekStartDay;
			settingsLoaded = true;
		}
	});

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

	function handleSetCurrency(code: string) {
		settings = { ...settings, currency: code };
		preferences.currency = code;
		saveSettings(settings);
	}

	function handleSetTimezone(tz: string) {
		settings = { ...settings, timezone: tz };
		preferences.timezone = tz;
		saveSettings(settings);
	}

	function handleSetTimeFormat(format: TimeFormat) {
		settings = { ...settings, timeFormat: format };
		saveSettings(settings);
	}

	function handleSetWeekStartDay(day: number) {
		settings = { ...settings, weekStartDay: day };
		preferences.weekStartDay = day;
		saveSettings(settings);
	}
</script>

<div class="settings-panel">
	<!-- Appearance Section -->
	<section class="settings-section">
		<div class="section-label">
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="12" r="3"/>
				<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
			</svg>
			<span>{t('settings.appearance')}</span>
		</div>

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
	</section>

	<div class="section-divider"></div>

	<!-- Format Section -->
	<section class="settings-section">
		<div class="section-label">
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
				<polyline points="14 2 14 8 20 8"/>
				<line x1="16" y1="13" x2="8" y2="13"/>
				<line x1="16" y1="17" x2="8" y2="17"/>
				<polyline points="10 9 9 9 8 9"/>
			</svg>
			<span>{t('settings.format')}</span>
		</div>

		<!-- Number Format -->
		<div class="setting-row">
			<span class="setting-label">{t('settings.numberFormat')}</span>
			<div class="format-group">
				<button
					class="format-btn"
					class:active={settings.numberLocale === 'en-US'}
					onclick={() => handleSetNumberLocale('en-US')}
				>
					1<span class="sep-thousand">,</span>234<span class="sep-decimal">.</span>56
				</button>
				<button
					class="format-btn"
					class:active={settings.numberLocale === 'de-DE'}
					onclick={() => handleSetNumberLocale('de-DE')}
				>
					1<span class="sep-thousand">.</span>234<span class="sep-decimal">,</span>56
				</button>
			</div>
		</div>

		<!-- Date Format -->
		<div class="setting-row">
			<span class="setting-label">{t('settings.dateFormat')}</span>
			<div class="format-group">
				<button
					class="format-btn with-hint"
					class:active={settings.dateLocale === 'en-US'}
					onclick={() => handleSetDateLocale('en-US')}
				>
					<span class="format-value">2/10/2026</span>
					<span class="format-hint">M/D/Y</span>
				</button>
				<button
					class="format-btn with-hint"
					class:active={settings.dateLocale === 'zh-CN'}
					onclick={() => handleSetDateLocale('zh-CN')}
				>
					<span class="format-value">2026/2/10</span>
					<span class="format-hint">Y/M/D</span>
				</button>
				<button
					class="format-btn with-hint"
					class:active={settings.dateLocale === 'de-DE'}
					onclick={() => handleSetDateLocale('de-DE')}
				>
					<span class="format-value">10.2.2026</span>
					<span class="format-hint">D.M.Y</span>
				</button>
			</div>
		</div>

		<!-- Currency -->
		<div class="setting-block">
			<span class="setting-label">{t('settings.currency')}</span>
			<div class="currency-grid">
				{#each currencies as currency}
					<button
						class="currency-btn"
						class:active={settings.currency === currency.code}
						onclick={() => handleSetCurrency(currency.code)}
						title={currency.name}
					>
						<span class="currency-symbol">{currency.symbol}</span>
						<span class="currency-code">{currency.code}</span>
					</button>
				{/each}
			</div>
		</div>

		<!-- Timezone -->
		<div class="setting-row">
			<span class="setting-label">{t('settings.timezone')}</span>
			<div class="format-group">
				{#each timezoneOptions as tz}
					<button
						class="format-btn"
						class:active={settings.timezone === tz.value}
						onclick={() => handleSetTimezone(tz.value)}
					>
						{tz.label}
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

		<!-- Week Start Day -->
		<div class="setting-row">
			<span class="setting-label">Week starts on</span>
			<div class="format-group">
				<button
					class="format-btn"
					class:active={settings.weekStartDay === 1}
					onclick={() => handleSetWeekStartDay(1)}
				>
					Mon
				</button>
				<button
					class="format-btn"
					class:active={settings.weekStartDay === 0}
					onclick={() => handleSetWeekStartDay(0)}
				>
					Sun
				</button>
			</div>
		</div>
	</section>
</div>

<style>
	.settings-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	/* Section */
	.settings-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.section-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-muted);
	}

	.section-divider {
		height: 1px;
		background: var(--border-subtle);
		margin: var(--space-4) 0;
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

	/* Number format separators - weaken thousand, strengthen decimal */
	.sep-thousand {
		color: var(--fg-faint);
	}

	.sep-decimal {
		color: var(--accent);
		font-weight: var(--weight-bold);
		font-size: 1.4em;
		line-height: 0.8;
	}

	/* Date format with hint */
	.format-btn.with-hint {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: var(--space-2) var(--space-3);
	}

	.format-value {
		font-size: var(--text-sm);
	}

	.format-hint {
		font-size: var(--text-xs);
		color: var(--fg-faint);
		font-weight: var(--weight-normal);
	}

	/* Override colors when format button is active */
	.format-btn.active .sep-thousand,
	.format-btn.active .sep-decimal {
		color: inherit;
	}

	.format-btn.active .format-hint {
		color: inherit;
		opacity: 0.7;
	}

	/* Setting Block (full width label + content) */
	.setting-block {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	/* Currency Grid */
	.currency-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-1);
		padding: var(--space-1);
		background: var(--bg-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}

	.currency-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		padding: var(--space-2) var(--space-1);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.currency-btn:hover {
		background: var(--accent-muted);
	}

	.currency-btn.active {
		background: var(--accent);
	}

	.currency-symbol {
		font-size: var(--text-base);
		font-weight: var(--weight-bold);
		color: var(--fg-base);
		line-height: 1;
	}

	.currency-code {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		font-weight: var(--weight-medium);
	}

	.currency-btn:hover .currency-symbol,
	.currency-btn:hover .currency-code {
		color: var(--fg-base);
	}

	.currency-btn.active .currency-symbol,
	.currency-btn.active .currency-code {
		color: var(--bg-base);
	}

	@media (max-width: 360px) {
		.currency-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}


</style>
