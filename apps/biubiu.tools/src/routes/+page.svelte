<script lang="ts">
	import { t, localizeHref, locale, preferences } from '$lib/i18n';
	import { browser } from '$app/environment';
	import { getBaseSEO, buildSiteJsonLd } from '$lib/seo';
	import SEO from '@shelchin/seo/SEO.svelte';
	import { toggleTheme, setTextScale, getTextScales, type Theme, type TextScale } from '$lib/theme';
	import ChainLogos from '$lib/components/ChainLogos.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import logo from '$lib/assets/logo.svg';

	let showLocaleMenu = $state(false);
	let showMobileDrawer = $state(false);
	let showDrawerLanguage = $state(false);
	let showDrawerFormat = $state(false);
	let showFormatMenu = $state(false);

	// Format sub-sections (all collapsed by default)
	let showNumberFormat = $state(false);
	let showDateFormat = $state(false);
	let showTextScale = $state(false);

	// Theme and text scale state
	let currentTheme = $state<Theme>('dark');
	let currentTextScale = $state<TextScale>('md');

	const textScales = getTextScales();
	// Visual font sizes for text scale options (in px)
	const scaleFontSizes: Record<TextScale, number> = {
		xs: 10, sm: 12, md: 14, lg: 16, xl: 18, '2xl': 20
	};

	// Initialize theme and text scale from DOM
	$effect(() => {
		if (browser) {
			currentTheme = (document.documentElement.getAttribute('data-theme') as Theme) || 'dark';
			currentTextScale = (document.documentElement.getAttribute('data-text-scale') as TextScale) || 'md';
		}
	});

	function handleToggleTheme() {
		currentTheme = toggleTheme();
	}

	function handleSelectTextScale(scale: TextScale) {
		setTextScale(scale);
		currentTextScale = scale;
	}

	const locales: Record<string, { label: string; flag: string }> = {
		en: { label: 'English', flag: '🇺🇸' },
		zh: { label: '中文', flag: '🇨🇳' }
	};

	const currentLocale = $derived(locales[locale.value] || locales.en);

	// Format preferences options
	const numberLocaleOptions: Record<string, { label: string; example: string }> = {
		'en-US': { label: 'English (US)', example: '1,234.56' },
		'zh-CN': { label: '中文 (中国)', example: '1,234.56' },
		'de-DE': { label: 'Deutsch', example: '1.234,56' },
		'ja-JP': { label: '日本語', example: '1,234.56' },
		'pt-BR': { label: 'Português (BR)', example: '1.234,56' },
	};

	const dateLocaleOptions: Record<string, { label: string; example: string }> = {
		'en-US': { label: 'English (US)', example: '2/10/2026' },
		'zh-CN': { label: '中文 (中国)', example: '2026/2/10' },
		'de-DE': { label: 'Deutsch', example: '10.2.2026' },
		'ja-JP': { label: '日本語', example: '2026/2/10' },
		'pt-BR': { label: 'Português (BR)', example: '10/02/2026' },
	};

	const currentNumberLocale = $derived(numberLocaleOptions[preferences.numberLocale] || numberLocaleOptions['en-US']);
	const currentDateLocale = $derived(dateLocaleOptions[preferences.dateLocale] || dateLocaleOptions['en-US']);

	// Track if preferences have been loaded from storage
	let prefsLoaded = $state(false);

	// Load preferences from localStorage on mount (runs first)
	$effect(() => {
		if (browser && !prefsLoaded) {
			const saved = localStorage.getItem('biubiu-format-prefs');
			if (saved) {
				try {
					const parsed = JSON.parse(saved);
					if (parsed.numberLocale) preferences.numberLocale = parsed.numberLocale;
					if (parsed.dateLocale) preferences.dateLocale = parsed.dateLocale;
				} catch {
					// ignore
				}
			}
			prefsLoaded = true;
		}
	});

	// Save preferences to localStorage (only after loaded)
	$effect(() => {
		if (browser && prefsLoaded) {
			// Read all values to track changes
			const data = {
				numberLocale: preferences.numberLocale,
				dateLocale: preferences.dateLocale,
			};
			localStorage.setItem('biubiu-format-prefs', JSON.stringify(data));
		}
	});

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.locale-wrapper')) {
			showLocaleMenu = false;
		}
		if (!target.closest('.format-wrapper')) {
			showFormatMenu = false;
		}
		if (!target.closest('.mobile-drawer') && !target.closest('.mobile-menu-btn')) {
			showMobileDrawer = false;
		}
	}

	function closeMobileDrawer() {
		showMobileDrawer = false;
		showDrawerLanguage = false;
		showDrawerFormat = false;
	}

	function handleLanguageSelect() {
		// Delay closing to show selection feedback
		setTimeout(() => {
			closeMobileDrawer();
		}, 300);
	}

	const seoProps = $derived(getBaseSEO({
		title: t('meta.title'),
		description: t('meta.description'),
		currentLocale: locale.value,
		jsonLd: buildSiteJsonLd(),
		ogParams: {
			type: 'website',
			subtitle: t('hero.description')
		}
	}));

	const comingTools = [
		{
			id: 'token-sender',
			nameKey: 'coming.tools.tokenSender.name',
			descKey: 'coming.tools.tokenSender.desc',
			icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`
		},
		{
			id: 'wallet-sweep',
			nameKey: 'coming.tools.walletSweep.name',
			descKey: 'coming.tools.walletSweep.desc',
			icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>`
		},
		{
			id: 'event-scanner',
			nameKey: 'coming.tools.eventScanner.name',
			descKey: 'coming.tools.eventScanner.desc',
			icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`
		},
		{
			id: 'contract-caller',
			nameKey: 'coming.tools.contractCaller.name',
			descKey: 'coming.tools.contractCaller.desc',
			icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m10 8 4 4-4 4"/></svg>`
		}
	];
</script>

<svelte:window onclick={handleClickOutside} />

<SEO {...seoProps} />

<div class="page">
	<!-- Header -->
	<header class="header">
		<div class="header-content">
			<a href={localizeHref('/')} class="logo">
				<img src={logo} alt="BiuBiu Tools" class="logo-icon" />
				<span class="logo-text">BiuBiu</span>
				<span class="logo-accent">Tools</span>
			</a>

			<!-- Desktop Actions -->
			<div class="header-actions desktop-only">
				<div class="locale-wrapper">
					<button
						class="locale-trigger"
						onclick={() => (showLocaleMenu = !showLocaleMenu)}
						aria-label="Change language"
					>
						<svg class="locale-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="10"/>
							<line x1="2" y1="12" x2="22" y2="12"/>
							<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
						</svg>
						<span class="locale-current">{currentLocale.label}</span>
						<svg class="locale-chevron" class:open={showLocaleMenu} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="6 9 12 15 18 9"/>
						</svg>
					</button>

					{#if showLocaleMenu}
						<div class="locale-menu">
							{#each Object.entries(locales) as [code, loc]}
								<a
									href="/{code}"
									class="locale-option"
									class:active={locale.value === code}
									onclick={() => (showLocaleMenu = false)}
								>
									<span class="locale-flag">{loc.flag}</span>
									<span class="locale-label">{loc.label}</span>
								</a>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Settings Dropdown (Format + Text Scale) -->
				<div class="format-wrapper">
					<button
						class="format-trigger"
						onclick={() => (showFormatMenu = !showFormatMenu)}
						aria-label="Settings"
					>
						<svg class="format-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="3"/>
							<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
						</svg>
						<svg class="format-chevron" class:open={showFormatMenu} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="6 9 12 15 18 9"/>
						</svg>
					</button>

					{#if showFormatMenu}
						<div class="format-menu">
							<!-- Text Scale -->
							<div class="format-group">
								<button class="format-group-toggle" onclick={() => (showTextScale = !showTextScale)}>
									<span class="format-group-label">{t('settings.textSize')}</span>
									<span class="format-group-value text-scale-preview" style="font-size: {scaleFontSizes[currentTextScale]}px;">A</span>
									<svg class="format-group-chevron" class:open={showTextScale} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
								</button>
								{#if showTextScale}
									<div class="format-group-options text-scale-options">
										{#each textScales as scale}
											<button class="text-scale-option" class:active={currentTextScale === scale} onclick={() => handleSelectTextScale(scale)} title={scale.toUpperCase()}>
												<span class="text-scale-letter" style="font-size: {scaleFontSizes[scale]}px;">A</span>
											</button>
										{/each}
									</div>
								{/if}
							</div>

							<!-- Number Format -->
							<div class="format-group">
								<button class="format-group-toggle" onclick={() => (showNumberFormat = !showNumberFormat)}>
									<span class="format-group-label">{t('settings.numberFormat')}</span>
									<span class="format-group-value">{currentNumberLocale.example}</span>
									<svg class="format-group-chevron" class:open={showNumberFormat} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
								</button>
								{#if showNumberFormat}
									<div class="format-group-options">
										{#each Object.entries(numberLocaleOptions) as [code, opt]}
											<button class="format-option" class:active={preferences.numberLocale === code} onclick={() => (preferences.numberLocale = code)}>
												<span class="format-option-label">{opt.label}</span>
												<span class="format-option-example">{opt.example}</span>
											</button>
										{/each}
									</div>
								{/if}
							</div>

							<!-- Date Format -->
							<div class="format-group">
								<button class="format-group-toggle" onclick={() => (showDateFormat = !showDateFormat)}>
									<span class="format-group-label">{t('settings.dateFormat')}</span>
									<span class="format-group-value">{currentDateLocale.example}</span>
									<svg class="format-group-chevron" class:open={showDateFormat} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
								</button>
								{#if showDateFormat}
									<div class="format-group-options">
										{#each Object.entries(dateLocaleOptions) as [code, opt]}
											<button class="format-option" class:active={preferences.dateLocale === code} onclick={() => (preferences.dateLocale = code)}>
												<span class="format-option-label">{opt.label}</span>
												<span class="format-option-example">{opt.example}</span>
											</button>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- Theme Toggle -->
				<button
					class="theme-toggle-btn"
					onclick={handleToggleTheme}
					aria-label={currentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
					title={currentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
				>
					{#if currentTheme === 'dark'}
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="4"/>
							<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
						</svg>
					{/if}
				</button>
			</div>

			<!-- Mobile Menu Button -->
			<button
				class="mobile-menu-btn mobile-only"
				onclick={() => (showMobileDrawer = !showMobileDrawer)}
				aria-label="Open menu"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="3" y1="12" x2="21" y2="12"/>
					<line x1="3" y1="6" x2="21" y2="6"/>
					<line x1="3" y1="18" x2="21" y2="18"/>
				</svg>
			</button>
		</div>
	</header>

	<!-- Mobile Drawer -->
	{#if showMobileDrawer}
		<div class="mobile-overlay" onclick={closeMobileDrawer}></div>
	{/if}
	<div class="mobile-drawer" class:open={showMobileDrawer}>
		<div class="drawer-header">
			<span class="drawer-title">{t('settings.title')}</span>
			<button class="drawer-close" onclick={closeMobileDrawer} aria-label="Close menu">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="18" y1="6" x2="6" y2="18"/>
					<line x1="6" y1="6" x2="18" y2="18"/>
				</svg>
			</button>
		</div>

		<div class="drawer-content">
			<!-- Language Selection -->
			<div class="drawer-section">
				<button
					class="drawer-section-title drawer-section-toggle"
					onclick={() => (showDrawerLanguage = !showDrawerLanguage)}
				>
					<div class="drawer-section-left">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="10"/>
							<line x1="2" y1="12" x2="22" y2="12"/>
							<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
						</svg>
						<span>{t('language')}</span>
						<span class="drawer-current-value">{currentLocale.label}</span>
					</div>
					<svg class="drawer-chevron" class:open={showDrawerLanguage} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="6 9 12 15 18 9"/>
					</svg>
				</button>
				{#if showDrawerLanguage}
					<div class="drawer-options">
						{#each Object.entries(locales) as [code, loc]}
							<a
								href="/{code}"
								class="drawer-option"
								class:active={locale.value === code}
								onclick={handleLanguageSelect}
							>
								<span class="locale-flag">{loc.flag}</span>
								<span>{loc.label}</span>
							</a>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Settings (Text Scale, Number, Date) -->
			<div class="drawer-section">
				<button
					class="drawer-section-title drawer-section-toggle"
					onclick={() => (showDrawerFormat = !showDrawerFormat)}
				>
					<div class="drawer-section-left">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="3"/>
							<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
						</svg>
						<span>{t('settings.title')}</span>
					</div>
					<svg class="drawer-chevron" class:open={showDrawerFormat} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="6 9 12 15 18 9"/>
					</svg>
				</button>
				{#if showDrawerFormat}
					<div class="drawer-format-content">
						<!-- Text Scale -->
						<div class="drawer-format-group">
							<button class="drawer-format-toggle" onclick={() => (showTextScale = !showTextScale)}>
								<span class="drawer-format-label">{t('settings.textSize')}</span>
								<span class="drawer-format-value text-scale-preview" style="font-size: {scaleFontSizes[currentTextScale]}px;">A</span>
								<svg class="drawer-format-chevron" class:open={showTextScale} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
							</button>
							{#if showTextScale}
								<div class="drawer-format-options text-scale-options">
									{#each textScales as scale}
										<button class="text-scale-option" class:active={currentTextScale === scale} onclick={() => handleSelectTextScale(scale)} title={scale.toUpperCase()}>
											<span class="text-scale-letter" style="font-size: {scaleFontSizes[scale]}px;">A</span>
										</button>
									{/each}
								</div>
							{/if}
						</div>

						<!-- Number Format -->
						<div class="drawer-format-group">
							<button class="drawer-format-toggle" onclick={() => (showNumberFormat = !showNumberFormat)}>
								<span class="drawer-format-label">{t('settings.numberFormat')}</span>
								<span class="drawer-format-value">{currentNumberLocale.example}</span>
								<svg class="drawer-format-chevron" class:open={showNumberFormat} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
							</button>
							{#if showNumberFormat}
								<div class="drawer-format-options">
									{#each Object.entries(numberLocaleOptions) as [code, opt]}
										<button class="drawer-format-option" class:active={preferences.numberLocale === code} onclick={() => (preferences.numberLocale = code)}>
											<span>{opt.label}</span>
											<span class="format-example">{opt.example}</span>
										</button>
									{/each}
								</div>
							{/if}
						</div>

						<!-- Date Format -->
						<div class="drawer-format-group">
							<button class="drawer-format-toggle" onclick={() => (showDateFormat = !showDateFormat)}>
								<span class="drawer-format-label">{t('settings.dateFormat')}</span>
								<span class="drawer-format-value">{currentDateLocale.example}</span>
								<svg class="drawer-format-chevron" class:open={showDateFormat} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
							</button>
							{#if showDateFormat}
								<div class="drawer-format-options">
									{#each Object.entries(dateLocaleOptions) as [code, opt]}
										<button class="drawer-format-option" class:active={preferences.dateLocale === code} onclick={() => (preferences.dateLocale = code)}>
											<span>{opt.label}</span>
											<span class="format-example">{opt.example}</span>
										</button>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<!-- Theme Toggle -->
			<div class="drawer-theme-section">
				<button
					class="drawer-theme-btn"
					class:active={currentTheme === 'light'}
					onclick={handleToggleTheme}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="4"/>
						<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
					</svg>
					{t('settings.theme.light')}
				</button>
				<button
					class="drawer-theme-btn"
					class:active={currentTheme === 'dark'}
					onclick={handleToggleTheme}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
					</svg>
					{t('settings.theme.dark')}
				</button>
			</div>
		</div>
	</div>

	<main class="main">
		<!-- Hero Section -->
		<section class="hero">
			<!-- Background Gradient Orbs -->
			<div class="hero-orb hero-orb-1"></div>
			<div class="hero-orb hero-orb-2"></div>
			<div class="hero-glow"></div>

			<div class="hero-content">
				<h1 class="hero-title">
					{t('hero.tagline')}
					<span class="gradient-text">{t('hero.taglineHighlight')}</span>
				</h1>

				<p class="hero-description">{t('hero.description')}</p>

				<div class="hero-actions">
					<button class="hero-cta" onclick={() => document.getElementById('featured')?.scrollIntoView({ behavior: 'smooth' })}>
						{t('hero.cta')}
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="12" y1="5" x2="12" y2="19"/>
							<polyline points="19 12 12 19 5 12"/>
						</svg>
					</button>
				</div>

				<ChainLogos />
			</div>
		</section>

		<!-- Featured Tool Section -->
		<section id="featured" class="featured" use:fadeInUp={{ delay: 0 }}>
			<div class="section-header">
				<h2 class="section-title">{t('featured.title')}</h2>
			</div>

			<div class="tool-card glass-card">
				<div class="tool-icon">
					<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="10"/>
						<line x1="2" y1="12" x2="22" y2="12"/>
						<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
					</svg>
				</div>
				<div class="tool-content">
					<h3 class="tool-name">{t('featured.balanceRadar.name')}</h3>
					<p class="tool-description">{t('featured.balanceRadar.description')}</p>

					<div class="tool-features">
						<div class="feature">
							<div class="feature-icon">
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
									<polyline points="22 4 12 14.01 9 11.01"/>
								</svg>
							</div>
							<div class="feature-text">
								<span class="feature-title">{t('featured.balanceRadar.feature1')}</span>
								<span class="feature-desc">{t('featured.balanceRadar.feature1Desc')}</span>
							</div>
						</div>
						<div class="feature">
							<div class="feature-icon">
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
									<polyline points="22 4 12 14.01 9 11.01"/>
								</svg>
							</div>
							<div class="feature-text">
								<span class="feature-title">{t('featured.balanceRadar.feature2')}</span>
								<span class="feature-desc">{t('featured.balanceRadar.feature2Desc')}</span>
							</div>
						</div>
						<div class="feature">
							<div class="feature-icon">
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
									<polyline points="22 4 12 14.01 9 11.01"/>
								</svg>
							</div>
							<div class="feature-text">
								<span class="feature-title">{t('featured.balanceRadar.feature3')}</span>
								<span class="feature-desc">{t('featured.balanceRadar.feature3Desc')}</span>
							</div>
						</div>
					</div>

					<a href={localizeHref('/tools/balance-radar')} class="tool-cta">
						{t('featured.balanceRadar.cta')}
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="5" y1="12" x2="19" y2="12"/>
							<polyline points="12 5 19 12 12 19"/>
						</svg>
					</a>
				</div>
			</div>
		</section>

		<!-- Coming Soon Section -->
		<section class="coming-tools" use:fadeInUp={{ delay: 100 }}>
			<div class="section-header">
				<h2 class="section-title">{t('coming.title')}</h2>
				<p class="section-subtitle">{t('coming.subtitle')}</p>
			</div>

			<div class="tools-grid">
				{#each comingTools as tool}
					<div class="coming-card glass-card">
						<div class="coming-icon">
							{@html tool.icon}
						</div>
						<h3 class="coming-name">{t(tool.nameKey)}</h3>
						<p class="coming-desc">{t(tool.descKey)}</p>
						<span class="coming-badge">{t('coming.badge')}</span>
					</div>
				{/each}
			</div>
		</section>
	</main>

	<!-- Footer -->
	<footer class="footer" use:fadeInUp={{ delay: 200 }}>
		<div class="footer-content">
			<div class="social-links">
				<a href="https://github.com/atshelchin/biubiu.tools" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="GitHub">
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
					</svg>
				</a>
				<a href="https://x.com/biubiu_tools" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="X">
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
						<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
					</svg>
				</a>
				<a href="https://discord.gg/GWXXQ7fXaZ" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="Discord">
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
						<path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>
					</svg>
				</a>
				<a href="https://t.me/+ABMpMG1islA4NTVl" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="Telegram">
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
						<path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
					</svg>
				</a>
				<a href="https://www.youtube.com/@biubiu_tools" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="YouTube">
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
						<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
					</svg>
				</a>
			</div>
			<p class="footer-text">
				{@html t('footer.madeWith',{love:`<span style="color: var(--error);">&#9829;</span>`})}  · {t('footer.openSource')}
			</p>
		</div>
	</footer>
</div>

<style>
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	/* Header */
	.header {
		position: sticky;
		top: 0;
		z-index: var(--z-sticky);
		background: var(--glass-bg);
		backdrop-filter: blur(var(--blur-md));
		border-bottom: 1px solid var(--border-subtle);
	}

	.header-content {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--space-4) var(--space-6);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-6);
	}

	.logo {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xl);
		font-weight: var(--weight-bold);
		text-decoration: none;
	}

	.logo-icon {
		width: 32px;
		height: 32px;
		border-radius: var(--radius-md);
	}

	.logo-text {
		color: var(--fg-base);
	}

	.logo-accent {
		color: var(--accent);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.locale-wrapper {
		position: relative;
	}

	.locale-trigger {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.locale-trigger:hover {
		background: var(--bg-elevated);
		border-color: var(--border-strong);
		color: var(--fg-base);
	}

	.locale-icon {
		flex-shrink: 0;
	}

	.locale-current {
		white-space: nowrap;
	}

	.locale-chevron {
		transition: transform var(--motion-fast) var(--easing);
	}

	.locale-chevron.open {
		transform: rotate(180deg);
	}

	.locale-menu {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: var(--space-2);
		min-width: 140px;
		padding: var(--space-1);
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		z-index: var(--z-dropdown);
	}

	.locale-option {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		text-decoration: none;
		color: var(--fg-muted);
		font-size: var(--text-sm);
		transition: all var(--motion-fast) var(--easing);
	}

	.locale-option:hover {
		background: var(--accent-muted);
		color: var(--fg-base);
	}

	.locale-option.active {
		background: var(--accent);
		color: var(--accent-fg);
	}

	.locale-flag {
		font-size: var(--text-base);
	}

	.locale-label {
		flex: 1;
	}

	/* Format Dropdown */
	.format-wrapper {
		position: relative;
	}

	.format-trigger {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.format-trigger:hover {
		background: var(--bg-elevated);
		border-color: var(--border-strong);
		color: var(--fg-base);
	}

	.format-icon {
		flex-shrink: 0;
	}

	/* Theme Toggle Button */
	.theme-toggle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		background: var(--bg-raised);
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.theme-toggle-btn:hover {
		background: var(--bg-elevated);
		border-color: var(--border-strong);
		color: var(--fg-base);
	}

	.format-chevron {
		transition: transform var(--motion-fast) var(--easing);
	}

	.format-chevron.open {
		transform: rotate(180deg);
	}

	.format-menu {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: var(--space-2);
		min-width: 260px;
		max-height: 80vh;
		overflow-y: auto;
		padding: var(--space-2);
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		z-index: var(--z-dropdown);
	}

	.format-group {
		margin-bottom: var(--space-1);
	}

	.format-group:last-child {
		margin-bottom: 0;
	}

	.format-group-toggle {
		display: flex;
		align-items: center;
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: none;
		border-radius: var(--radius-sm);
		background: var(--bg-raised);
		color: var(--fg-base);
		font-size: var(--text-sm);
		text-align: left;
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.format-group-toggle:hover {
		background: var(--accent-muted);
	}

	.format-group-label {
		font-weight: var(--weight-medium);
		margin-right: auto;
	}

	.format-group-value {
		font-size: var(--text-xs);
		color: var(--accent);
		margin-right: var(--space-2);
	}

	.format-group-chevron {
		flex-shrink: 0;
		color: var(--fg-muted);
		transition: transform var(--motion-fast) var(--easing);
	}

	.format-group-chevron.open {
		transform: rotate(180deg);
	}

	.format-group-options {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-top: var(--space-1);
		padding-left: var(--space-2);
	}

	/* Text Scale Options - visual layout with "A" letters */
	.format-group-options.text-scale-options {
		flex-direction: row;
		flex-wrap: nowrap;
		gap: var(--space-1);
		align-items: baseline;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		border-radius: var(--radius-md);
	}

	.text-scale-preview {
		font-weight: var(--weight-bold);
		line-height: 1;
	}

	.text-scale-option {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 28px;
		height: 32px;
		padding: var(--space-1);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.text-scale-option:hover {
		background: var(--accent-muted);
	}

	.text-scale-option.active {
		background: var(--accent);
	}

	.text-scale-letter {
		font-weight: var(--weight-bold);
		line-height: 1;
		color: var(--fg-muted);
		transition: color var(--motion-fast) var(--easing);
	}

	.text-scale-option:hover .text-scale-letter {
		color: var(--fg-base);
	}

	.text-scale-option.active .text-scale-letter {
		color: var(--accent-fg);
	}

	.format-option {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--fg-muted);
		font-size: var(--text-sm);
		text-align: left;
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.format-option:hover {
		background: var(--accent-muted);
		color: var(--fg-base);
	}

	.format-option.active {
		background: var(--accent);
		color: var(--accent-fg);
	}

	.format-option-label {
		flex: 1;
	}

	.format-option-example {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	.format-option.active .format-option-example {
		color: var(--accent-fg);
	}

	/* Main */
	.main {
		flex: 1;
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 var(--space-6);
		width: 100%;
	}

	/* Hero */
	.hero {
		position: relative;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		overflow: hidden;
		/* Break out of parent container to full width */
		width: 100vw;
		margin-left: calc(-50vw + 50%);
		margin-top: -80px;
		padding: calc(80px + var(--space-12)) var(--space-6) var(--space-12);
	}

	/* Hero Background Orbs */
	.hero-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(80px);
		pointer-events: none;
	}

	.hero-orb-1 {
		top: -10%;
		right: 0;
		width: 700px;
		height: 700px;
		background: radial-gradient(circle, var(--accent) 0%, transparent 65%);
		opacity: 0.25;
	}

	.hero-orb-2 {
		bottom: 0;
		left: -15%;
		width: 600px;
		height: 600px;
		background: radial-gradient(circle, var(--accent-secondary) 0%, transparent 65%);
		opacity: 0.2;
	}

	.hero-glow {
		position: absolute;
		inset: 0;
		background: var(--gradient-hero);
		pointer-events: none;
	}

	.hero-content {
		position: relative;
		z-index: 1;
		max-width: 900px;
		padding: 0 var(--space-4);
		text-align: center;
	}

	.hero-title {
		font-size: var(--text-6xl);
		font-weight: var(--weight-bold);
		line-height: var(--leading-tight);
		color: var(--fg-base);
		margin-bottom: var(--space-6);
	}

	.gradient-text {
		background: var(--gradient-text);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.hero-description {
		font-size: var(--text-xl);
		color: var(--fg-muted);
		max-width: 700px;
		margin: 0 auto var(--space-10);
		line-height: var(--leading-relaxed);
	}

	.hero-actions {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		margin-bottom: var(--space-12);
		flex-wrap: wrap;
	}

	.hero-cta {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-4) var(--space-8);
		background: var(--accent);
		color: var(--accent-fg);
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		text-decoration: none;
		border: none;
		cursor: pointer;
		border-radius: var(--radius-lg);
		box-shadow: var(--glow-accent);
		transition: all var(--motion-fast) var(--easing);
		overflow: hidden;
	}

	.hero-cta::before {
		content: '';
		position: absolute;
		inset: -2px;
		border-radius: inherit;
		background: var(--gradient-accent);
		filter: blur(8px);
		opacity: 0;
		z-index: -1;
		animation: pulse-glow 2s ease-in-out infinite;
	}

	@keyframes pulse-glow {
		0%, 100% { opacity: 0.3; transform: scale(1); }
		50% { opacity: 0.6; transform: scale(1.02); }
	}

	.hero-cta:hover {
		background: var(--accent-hover);
		transform: translateY(-2px);
		box-shadow: var(--glow-intense);
	}

	/* Glass Card */
	.glass-card {
		background: var(--glass-bg);
		backdrop-filter: blur(var(--blur-md));
		-webkit-backdrop-filter: blur(var(--blur-md));
		border: 0.5px solid var(--border-base);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
	}

	/* Featured Section */
	.featured {
		padding: var(--space-16) 0;
	}

	.section-header {
		margin-bottom: var(--space-8);
	}

	.section-title {
		font-size: var(--text-2xl);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}

	.section-subtitle {
		font-size: var(--text-base);
		color: var(--fg-muted);
		margin-top: var(--space-2);
	}

	.tool-card {
		display: flex;
		gap: var(--space-8);
		padding: var(--space-8);
		border-radius: var(--radius-xl);
		transition: all var(--motion-normal) var(--easing);
	}

	.tool-card:hover {
		border-color: var(--border-strong);
		box-shadow: var(--shadow-lg);
	}

	.tool-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 64px;
		height: 64px;
		background: var(--accent-muted);
		border-radius: var(--radius-lg);
		color: var(--accent);
	}

	.tool-content {
		flex: 1;
	}

	.tool-name {
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin-bottom: var(--space-2);
	}

	.tool-description {
		font-size: var(--text-base);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
		margin-bottom: var(--space-6);
	}

	.tool-features {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-4);
		margin-bottom: var(--space-6);
	}

	.feature {
		display: flex;
		gap: var(--space-3);
	}

	.feature-icon {
		flex-shrink: 0;
		color: var(--success);
	}

	.feature-text {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.feature-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.feature-desc {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	.tool-cta {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		background: var(--accent-muted);
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		text-decoration: none;
		border-radius: var(--radius-md);
		transition: all var(--motion-fast) var(--easing);
	}

	.tool-cta:hover {
		background: var(--accent);
		color: var(--accent-fg);
	}

	/* Coming Tools Section */
	.coming-tools {
		padding: var(--space-16) 0;
	}

	.tools-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: var(--space-6);
	}

	.coming-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: var(--space-8);
		border-radius: var(--radius-xl);
		transition: all var(--motion-normal) var(--easing);
	}

	.coming-card:hover {
		border-color: var(--border-strong);
		transform: translateY(-4px);
	}

	.coming-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		margin-bottom: var(--space-4);
		color: var(--fg-muted);
		opacity: 0.6;
	}

	.coming-name {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin-bottom: var(--space-2);
	}

	.coming-desc {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
		margin-bottom: var(--space-4);
	}

	.coming-badge {
		display: inline-block;
		padding: var(--space-1) var(--space-3);
		background: var(--accent-subtle);
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		border-radius: var(--radius-full);
	}

	/* Footer */
	.footer {
		border-top: 1px solid var(--border-subtle);
		padding: var(--space-8) 0;
	}

	.footer-content {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 var(--space-6);
		text-align: center;
	}

	.social-links {
		display: flex;
		justify-content: center;
		gap: var(--space-4);
		margin-bottom: var(--space-4);
	}

	.social-link {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		color: var(--fg-muted);
		background: var(--bg-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-full);
		transition: all var(--motion-fast) var(--easing);
	}

	.social-link:hover {
		color: var(--accent);
		border-color: var(--accent);
		transform: translateY(-2px);
	}

	.footer-text {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
	}

	/* Mobile/Desktop visibility */
	.mobile-only {
		display: none;
	}

	.desktop-only {
		display: flex;
	}

	/* Mobile Menu Button */
	.mobile-menu-btn {
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		background: var(--bg-raised);
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.mobile-menu-btn:hover {
		background: var(--bg-elevated);
		border-color: var(--border-strong);
		color: var(--fg-base);
	}

	/* Mobile Overlay */
	.mobile-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: var(--z-modal);
		animation: fadeIn var(--motion-fast) var(--easing);
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	/* Mobile Drawer */
	.mobile-drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 280px;
		max-width: 85vw;
		background: var(--bg-elevated);
		border-left: 1px solid var(--border-base);
		z-index: calc(var(--z-modal) + 1);
		transform: translateX(100%);
		transition: transform var(--motion-normal) var(--easing);
		display: flex;
		flex-direction: column;
	}

	.mobile-drawer.open {
		transform: translateX(0);
	}

	.drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4);
		border-bottom: 1px solid var(--border-subtle);
	}

	.drawer-title {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}

	.drawer-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.drawer-close:hover {
		background: var(--bg-raised);
		color: var(--fg-base);
	}

	.drawer-content {
		flex: 1;
		padding: var(--space-4);
		overflow-y: auto;
	}

	.drawer-section {
		margin-bottom: var(--space-6);
	}

	.drawer-section-title {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-muted);
		margin-bottom: var(--space-3);
	}

	.drawer-section-toggle {
		width: 100%;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		margin-bottom: 0;
		background: var(--bg-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.drawer-section-toggle:hover {
		background: var(--bg-elevated);
		border-color: var(--border-base);
	}

	.drawer-section-left {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.drawer-current-value {
		color: var(--accent);
		font-weight: var(--weight-semibold);
	}

	.drawer-chevron {
		transition: transform var(--motion-fast) var(--easing);
		flex-shrink: 0;
	}

	.drawer-chevron.open {
		transform: rotate(180deg);
	}

	.drawer-options {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-top: var(--space-2);
	}

	.drawer-option {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		text-decoration: none;
		color: var(--fg-muted);
		font-size: var(--text-base);
		transition: all var(--motion-fast) var(--easing);
	}

	.drawer-option:hover {
		background: var(--accent-muted);
		color: var(--fg-base);
	}

	.drawer-option.active {
		background: var(--accent);
		color: var(--accent-fg);
	}

	.drawer-theme-section {
		display: flex;
		gap: var(--space-2);
	}

	/* Drawer Format Section */
	.drawer-format-content {
		margin-top: var(--space-3);
		padding-left: var(--space-2);
	}

	.drawer-format-group {
		margin-bottom: var(--space-2);
	}

	.drawer-format-group:last-child {
		margin-bottom: 0;
	}

	.drawer-format-toggle {
		display: flex;
		align-items: center;
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: none;
		border-radius: var(--radius-sm);
		background: var(--bg-raised);
		color: var(--fg-base);
		font-size: var(--text-sm);
		text-align: left;
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.drawer-format-toggle:hover {
		background: var(--accent-muted);
	}

	.drawer-format-label {
		font-weight: var(--weight-medium);
		margin-right: auto;
	}

	.drawer-format-value {
		font-size: var(--text-xs);
		color: var(--accent);
		margin-right: var(--space-2);
	}

	.drawer-format-chevron {
		flex-shrink: 0;
		color: var(--fg-subtle);
		transition: transform var(--motion-fast) var(--easing);
	}

	.drawer-format-chevron.open {
		transform: rotate(180deg);
	}

	/* Drawer Format Options - consistent with desktop */
	.drawer-format-options {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-top: var(--space-1);
		padding-left: var(--space-2);
	}

	.drawer-format-option {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--fg-muted);
		font-size: var(--text-sm);
		text-align: left;
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.drawer-format-option:hover {
		background: var(--accent-muted);
		color: var(--fg-base);
	}

	.drawer-format-option.active {
		background: var(--accent);
		color: var(--accent-fg);
	}

	.drawer-format-option .format-example {
		margin-left: auto;
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	.drawer-format-option.active .format-example {
		color: var(--accent-fg);
	}

	/* Text Scale Options in drawer - horizontal layout */
	.drawer-format-options.text-scale-options {
		flex-direction: row;
		flex-wrap: nowrap;
		gap: var(--space-1);
		align-items: baseline;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		border-radius: var(--radius-md);
	}

	/* Drawer Theme Buttons */
	.drawer-theme-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 1;
		padding: var(--space-2) var(--space-3);
		border: none;
		border-radius: var(--radius-md);
		background: var(--bg-raised);
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.drawer-theme-btn:hover {
		background: var(--accent-muted);
		color: var(--fg-base);
	}

	.drawer-theme-btn.active {
		background: var(--accent);
		color: var(--accent-fg);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.mobile-only {
			display: flex;
		}

		.desktop-only {
			display: none;
		}

		.header-content {
			padding: var(--space-3) var(--space-4);
		}

		.hero {
			min-height: 100vh;
			min-height: 100dvh;
			margin-top: -64px;
			padding: calc(64px + var(--space-8)) var(--space-4) var(--space-8);
		}

		.hero-orb-1 {
			width: 300px;
			height: 300px;
			top: 0;
			right: -10%;
		}

		.hero-orb-2 {
			width: 250px;
			height: 250px;
			bottom: 10%;
			left: -15%;
		}

		.hero-title {
			font-size: var(--text-3xl);
		}

		.hero-description {
			font-size: var(--text-base);
		}

		.hero-actions {
			flex-direction: column;
			gap: var(--space-3);
			width: 100%;
			justify-content: center;
		}

		.hero-cta {
			width: 100%;
			justify-content: center;
		}

		.tool-card {
			flex-direction: column;
			padding: var(--space-6);
		}

		.tool-features {
			grid-template-columns: 1fr;
		}

		.tools-grid {
			grid-template-columns: 1fr;
		}
	}

	/* Reduced Motion */
	@media (prefers-reduced-motion: reduce) {
		.hero-cta::before {
			animation: none;
		}
	}
</style>
