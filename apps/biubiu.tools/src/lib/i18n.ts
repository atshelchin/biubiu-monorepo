import {
  createI18n,
  setMessageLoader,
  localizeHref as _localizeHref,
  enableProductionDevTools,
  disableProductionDevTools,
  isProductionDevToolsEnabled,
} from '@shelchin/i18n';
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

// Export localizeHref helper
export const localizeHref = (path: string) => _localizeHref(path);

// Export devTools functions for translation debugging
export { enableProductionDevTools, disableProductionDevTools, isProductionDevToolsEnabled };
