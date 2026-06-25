import { AsyncLocalStorage } from 'node:async_hooks';
import { type Handle } from '@sveltejs/kit';
import {
  setMessageLoader,
  setRouteMessages,
  matchRoute,
  extractLocaleFromPathname,
  removeLocaleFromPathname,
  setI18nContextResolver,
  type I18nContext,
} from '@shelchin/i18n-sveltekit';
import { routeMessages } from '$i18n/routes';
import { isSupportedLocale, DEFAULT_LOCALE, SUPPORTED_LOCALES } from '$lib/locales';

// Per-request i18n context. The i18n state singleton is module-global and would
// otherwise bleed locale/messages across concurrent SSR requests; AsyncLocalStorage
// gives each request its own. The resolver is read by the library's getters (t,
// localizeHref, format*); when no context is active (browser, or non-request server
// code) they fall back to the singleton, so client behaviour is unchanged.
const i18nALS = new AsyncLocalStorage<I18nContext>();
setI18nContextResolver(() => i18nALS.getStore());

const DEFAULT_THEME = 'dark';
const DEFAULT_TEXT_SCALE = 'md';
const VALID_TEXT_SCALES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];

// Format preferences defaults
const DEFAULT_NUMBER_LOCALE = 'en-US';
const DEFAULT_DATE_LOCALE = 'en-US';
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_TIMEZONE = 'UTC';

// Conservative, provably-safe security headers.
//
// The CSP intentionally only restricts directives the app never uses
// (framing, plugin objects, <base> injection). It does NOT constrain
// script/style/connect/img/font sources, so it cannot break script loading,
// WASM (OG image generation), wallet connections, or RPC/upstream fetches.
// `frame-ancestors 'none'` is the modern, provably-equivalent successor to
// X-Frame-Options: DENY — critical for a wallet/sign/sweep/revoke app where
// any framing enables clickjacking / UI-redress on on-chain actions.
const SECURITY_CSP =
  "frame-ancestors 'none'; object-src 'none'; base-uri 'self'";

export function applySecurityHeaders(headers: Headers): Headers {
  // Don't sniff MIME types (defends against content-type confusion).
  if (!headers.has('X-Content-Type-Options')) {
    headers.set('X-Content-Type-Options', 'nosniff');
  }
  // Belt-and-suspenders clickjacking defense alongside CSP frame-ancestors.
  if (!headers.has('X-Frame-Options')) {
    headers.set('X-Frame-Options', 'DENY');
  }
  // Don't leak full URLs (which may carry addresses) to other origins.
  if (!headers.has('Referrer-Policy')) {
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  }
  if (!headers.has('Content-Security-Policy')) {
    headers.set('Content-Security-Policy', SECURITY_CSP);
  }
  return headers;
}

// Set route messages mapping (server-side initialization)
setRouteMessages(routeMessages);

// Preload all message modules using import.meta.glob (handles special chars in filenames)
const messageModules = import.meta.glob('./messages/**/*.json', { eager: false });

// Load a single namespace file for one locale (handles [brackets] in filenames)
async function loadNamespace(locale: string, namespace: string): Promise<Record<string, string>> {
  const path = `./messages/${locale}/${namespace}.json`;
  try {
    if (messageModules[path]) {
      const module = (await messageModules[path]()) as { default: Record<string, string> };
      return module.default;
    }
    return {};
  } catch {
    return {};
  }
}

// Server-side message loader: English base, with the target locale layered on top
// so any missing key falls back to English per-key.
async function serverMessageLoader(locale: string, namespace: string) {
  const en = await loadNamespace(DEFAULT_LOCALE, namespace);
  if (locale === DEFAULT_LOCALE) return en;
  const localized = await loadNamespace(locale, namespace);
  return { ...en, ...localized };
}

// Set server-side message loader
setMessageLoader(serverMessageLoader);

// Load and merge messages for the request (returned, not written to the global —
// the caller puts them in the per-request i18n context).
async function loadAndMergeMessages(locale: string, namespaces: string[]) {
  const messages: Record<string, string> = {};
  for (const ns of namespaces) {
    const nsMessages = await serverMessageLoader(locale, ns);
    Object.assign(messages, nsMessages);
  }
  return messages;
}

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;

  // Skip i18n for API routes (they don't need locale prefix)
  if (pathname.startsWith('/api/')) {
    const apiResponse = await resolve(event);
    applySecurityHeaders(apiResponse.headers);
    return apiResponse;
  }

  const supported = [...SUPPORTED_LOCALES];
  const urlLocale = extractLocaleFromPathname(pathname, supported);

  // Canonicalize bare English: /en/x → /x (English is served prefix-free, so an
  // /en/ prefix would be a duplicate URL). 301 so crawlers fold it into /x.
  if (urlLocale === DEFAULT_LOCALE) {
    const location = removeLocaleFromPathname(pathname, supported) + event.url.search;
    return new Response(null, { status: 301, headers: { location } });
  }

  // Returning users: on the bare root only, honor a previously chosen language.
  // Cookie-gated + root-only, so crawlers (no cookie) always get the English root.
  if (!urlLocale && pathname === '/') {
    const cookieLocale = event.cookies.get('locale');
    if (isSupportedLocale(cookieLocale) && cookieLocale !== DEFAULT_LOCALE) {
      return new Response(null, { status: 302, headers: { location: `/${cookieLocale}` } });
    }
  }

  // The URL is the source of truth for locale; bare paths are English.
  const locale = urlLocale ?? DEFAULT_LOCALE;
  event.locals.locale = locale;

  // Namespace matching runs against the de-prefixed path (e.g. /zh/chains → /chains).
  const routePath = removeLocaleFromPathname(pathname, supported);

  // Use matchRoute to automatically match namespaces (supports dynamic routes)
  let namespaces = matchRoute(routePath);

  // If only _global matched, try parent paths (e.g. /apps/btc-updown-5m/space/xxx → /apps/btc-updown-5m)
  if (namespaces.length === 1 && namespaces[0] === '_global') {
    let parentPath = routePath;
    while (parentPath.lastIndexOf('/') > 0) {
      parentPath = parentPath.slice(0, parentPath.lastIndexOf('/'));
      const parentNs = matchRoute(parentPath);
      if (parentNs.length > 1 || (parentNs.length === 1 && parentNs[0] !== '_global')) {
        namespaces = parentNs;
        break;
      }
    }
  }

  // Load messages for this request
  const messages = await loadAndMergeMessages(locale, namespaces);

  // Get theme from cookie (default to dark)
  const themeCookie = event.cookies.get('theme');
  const theme = themeCookie === 'light' ? 'light' : DEFAULT_THEME;

  // Get text-scale from cookie (default to md)
  const textScaleCookie = event.cookies.get('text-scale');
  const textScale = textScaleCookie && VALID_TEXT_SCALES.includes(textScaleCookie)
    ? textScaleCookie
    : DEFAULT_TEXT_SCALE;

  // Get format preferences from cookies (applied via the per-request i18n context below)
  const numberLocale = event.cookies.get('number-locale') || DEFAULT_NUMBER_LOCALE;
  const dateLocale = event.cookies.get('date-locale') || DEFAULT_DATE_LOCALE;
  const currency = event.cookies.get('currency') || DEFAULT_CURRENCY;
  const timezoneCookie = event.cookies.get('timezone');
  const timezone = timezoneCookie ? decodeURIComponent(timezoneCookie) : DEFAULT_TIMEZONE;

  // Build this request's isolated i18n context and render inside it, so locale,
  // messages, and format preferences can't bleed across concurrent SSR requests.
  const i18nContext: I18nContext = {
    preferences: { locale, numberLocale, dateLocale, currency, timezone, weekStartDay: 1 },
    messages,
  };

  const response = await i18nALS.run(i18nContext, () =>
    resolve(event, {
      transformPageChunk: ({ html }) => {
        return html
          .replace('%lang%', locale)
          .replace('%theme%', theme)
          .replace('%text-scale%', textScale);
      },
    })
  );

  applySecurityHeaders(response.headers);
  return response;
};
