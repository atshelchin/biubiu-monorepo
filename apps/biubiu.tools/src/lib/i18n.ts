import {
  createI18n,
  setMessageLoader,
  enableProductionDevTools,
  disableProductionDevTools,
  isProductionDevToolsEnabled,
  localizeHref as libLocalizeHref,
} from '@shelchin/i18n-sveltekit';
import { DEFAULT_LOCALE } from '$lib/locales';
import type { TranslationKey, InterpolateParams } from '$i18n';
import { routeMessages } from '$i18n/routes';
import { lineIndex } from '$i18n/line-index';

// Client-side message loader
async function clientMessageLoader(locale: string, namespace: string) {
  try {
    const module = await import(`../messages/${locale}/${namespace}.json`);
    return module.default;
  } catch {
    console.warn(`[i18n] Message file not found: ${locale}/${namespace}`);
    return {};
  }
}

// Set message loader
setMessageLoader(clientMessageLoader);

export const i18n = createI18n({
  defaultLocale: 'en',
  fallbackLocale: 'en',
  preferences: {
    locale: 'en',
    numberLocale: 'en-US',
    currency: 'USD',
    dateLocale: 'en-US',
    timezone: 'UTC',
  },
  messageLoader: clientMessageLoader,
  routeMessages,
  devTools: {
    repoUrl: 'https://github.com/atshelchin/biubiu-monorepo',
    repoMessagesPath: 'apps/biubiu.tools/src/messages',
    branch: 'main',
    lineIndex,
  },
});

const {
  t: _t,
  locale,
  preferences,
  formatNumber,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  parseNumber,
} = i18n;

// Type-safe translation function
export const t = _t as (key: TranslationKey, params?: InterpolateParams) => string;

export { locale, preferences, formatNumber, formatCurrency, formatDate, formatDateTime, formatRelativeTime, parseNumber };

// localizeHref - the single chokepoint every internal link goes through.
// Locales live in the URL: English stays bare (/chains), the other 14 get a
// prefix (/zh/chains, /ja/chains). It reads the current locale from i18nState
// (set per-request on the server, synced from page data on the client), so
// every <a href={localizeHref(...)}>/goto(localizeHref(...)) gets the right
// prefix automatically — no call-site changes.
// (The eslint rule svelte/no-navigation-without-resolve can't see through this
//  wrapper, so it stays disabled in eslint.config.js.)
export const localizeHref = (path: string): string =>
  libLocalizeHref(path, { defaultLocale: DEFAULT_LOCALE });

// Export devTools functions for translation debugging
export { enableProductionDevTools, disableProductionDevTools, isProductionDevToolsEnabled };
