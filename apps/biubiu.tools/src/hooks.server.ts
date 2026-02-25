import { type Handle } from '@sveltejs/kit';
import { i18nState, setMessageLoader, setRouteMessages, matchRoute } from '@shelchin/i18n-sveltekit';
import { routeMessages } from '$i18n/routes';

const SUPPORTED_LOCALES = ['en', 'zh'];
const DEFAULT_LOCALE = 'en';
const DEFAULT_THEME = 'dark';
const DEFAULT_TEXT_SCALE = 'md';
const VALID_TEXT_SCALES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];

// Format preferences defaults
const DEFAULT_NUMBER_LOCALE = 'en-US';
const DEFAULT_DATE_LOCALE = 'en-US';
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_TIMEZONE = 'UTC';

// Set route messages mapping (server-side initialization)
setRouteMessages(routeMessages);

// Preload all message modules using import.meta.glob (handles special chars in filenames)
const messageModules = import.meta.glob('./messages/**/*.json', { eager: false });

// Server-side message loader using import.meta.glob (handles [brackets] in filenames)
async function serverMessageLoader(locale: string, namespace: string) {
  const path = `./messages/${locale}/${namespace}.json`;
  const fallbackPath = `./messages/${DEFAULT_LOCALE}/${namespace}.json`;

  try {
    if (messageModules[path]) {
      const module = (await messageModules[path]()) as { default: Record<string, string> };
      return module.default;
    } else if (messageModules[fallbackPath]) {
      const module = (await messageModules[fallbackPath]()) as { default: Record<string, string> };
      return module.default;
    }
    return {};
  } catch {
    // Try fallback
    if (locale !== DEFAULT_LOCALE) {
      return serverMessageLoader(DEFAULT_LOCALE, namespace);
    }
    return {};
  }
}

// Set server-side message loader
setMessageLoader(serverMessageLoader);

// Load and merge messages
async function loadAndMergeMessages(locale: string, namespaces: string[]) {
  const messages: Record<string, string> = {};
  for (const ns of namespaces) {
    const nsMessages = await serverMessageLoader(locale, ns);
    Object.assign(messages, nsMessages);
  }
  i18nState.setMessages(messages);
}

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;

  // Skip i18n for API routes (they don't need locale prefix)
  if (pathname.startsWith('/api/')) {
    return resolve(event);
  }

  // Get locale from URL
  const pathParts = pathname.split('/').filter(Boolean);
  const pathLocale = pathParts[0];

  // Determine locale: use URL prefix if valid, otherwise default to 'en'
  // No redirect - URLs without locale prefix are treated as English
  const locale = SUPPORTED_LOCALES.includes(pathLocale) ? pathLocale : DEFAULT_LOCALE;
  event.locals.locale = locale;
  i18nState.locale = locale;

  // Set cookie
  event.cookies.set('locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
    sameSite: 'lax',
  });

  // Get actual route path (without locale prefix if present)
  const hasLocalePrefix = SUPPORTED_LOCALES.includes(pathLocale);
  const routePath = hasLocalePrefix
    ? '/' + pathParts.slice(1).join('/') || '/'
    : pathname;

  // Use matchRoute to automatically match namespaces (supports dynamic routes)
  const namespaces = matchRoute(routePath);

  // Load messages
  await loadAndMergeMessages(locale, namespaces);

  // Get theme from cookie (default to dark)
  const themeCookie = event.cookies.get('theme');
  const theme = themeCookie === 'light' ? 'light' : DEFAULT_THEME;

  // Get text-scale from cookie (default to md)
  const textScaleCookie = event.cookies.get('text-scale');
  const textScale = textScaleCookie && VALID_TEXT_SCALES.includes(textScaleCookie)
    ? textScaleCookie
    : DEFAULT_TEXT_SCALE;

  // Get format preferences from cookies and set in i18nState
  const numberLocale = event.cookies.get('number-locale') || DEFAULT_NUMBER_LOCALE;
  const dateLocale = event.cookies.get('date-locale') || DEFAULT_DATE_LOCALE;
  const currency = event.cookies.get('currency') || DEFAULT_CURRENCY;
  const timezoneCookie = event.cookies.get('timezone');
  const timezone = timezoneCookie ? decodeURIComponent(timezoneCookie) : DEFAULT_TIMEZONE;

  // Apply format preferences to i18nState for SSR
  i18nState.preferences.numberLocale = numberLocale;
  i18nState.preferences.dateLocale = dateLocale;
  i18nState.preferences.currency = currency;
  i18nState.preferences.timezone = timezone;

  // Handle request
  const response = await resolve(event, {
    transformPageChunk: ({ html }) => {
      return html
        .replace('%lang%', locale)
        .replace('%theme%', theme)
        .replace('%text-scale%', textScale);
    },
  });

  return response;
};
