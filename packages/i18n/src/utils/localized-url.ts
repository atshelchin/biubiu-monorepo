import { i18nState } from '../core/state.svelte.js';

/**
 * Check if a URL is an external link
 */
function isExternalUrl(url: string): boolean {
  return (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('//') ||
    url.startsWith('mailto:') ||
    url.startsWith('tel:') ||
    url.startsWith('#')
  );
}

/**
 * Get localized href based on current locale from i18nState
 *
 * Automatically detects internal vs external links:
 * - External links (http://, https://, mailto:, etc.) are returned unchanged
 * - Internal links get the current locale prefix added
 *
 * @param path - The path or URL to localize (e.g., '/dashboard', 'https://example.com')
 * @param options - Optional configuration
 * @param options.locale - Override locale (uses i18nState.locale if not provided)
 * @param options.defaultLocale - Default locale that doesn't need prefix (default: none)
 * @returns The localized path for internal links, or unchanged URL for external links
 *
 * @example
 * // If i18nState.locale is 'zh'
 * localizeHref('/dashboard') // returns '/zh/dashboard'
 * localizeHref('https://google.com') // returns 'https://google.com' (unchanged)
 *
 * // With defaultLocale option
 * localizeHref('/dashboard', { defaultLocale: 'en' }) // returns '/zh/dashboard' (zh != en)
 * // If i18nState.locale is 'en' and defaultLocale is 'en'
 * localizeHref('/dashboard', { defaultLocale: 'en' }) // returns '/dashboard' (no prefix)
 */
export function localizeHref(
  path: string,
  options?: {
    locale?: string;
    defaultLocale?: string;
  }
): string {
  // External URLs are returned unchanged
  if (isExternalUrl(path)) {
    return path;
  }

  const locale = options?.locale ?? i18nState.locale;
  const defaultLocale = options?.defaultLocale;

  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Skip prefix for default locale (if configured)
  if (defaultLocale && locale === defaultLocale) {
    return normalizedPath;
  }

  // Add locale prefix
  return `/${locale}${normalizedPath}`;
}

/**
 * Extract locale from a pathname
 *
 * @param pathname - The URL pathname (e.g., '/zh/dashboard')
 * @param supportedLocales - Array of supported locale codes
 * @returns The locale if found in pathname, or undefined
 */
export function extractLocaleFromPathname(
  pathname: string,
  supportedLocales: string[]
): string | undefined {
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  return supportedLocales.includes(firstSegment) ? firstSegment : undefined;
}

/**
 * Remove locale prefix from pathname
 *
 * @param pathname - The URL pathname (e.g., '/zh/dashboard')
 * @param supportedLocales - Array of supported locale codes
 * @returns Pathname without locale prefix
 */
export function removeLocaleFromPathname(
  pathname: string,
  supportedLocales: string[]
): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length > 0 && supportedLocales.includes(parts[0])) {
    parts.shift();
  }
  return '/' + parts.join('/') || '/';
}
