import { redirect, type Handle } from '@sveltejs/kit';
import { i18nState, setMessageLoader, setRouteMessages, matchRoute } from '@shelchin/i18n';
import { routeMessages } from '$i18n/routes';

const SUPPORTED_LOCALES = ['en', 'zh'];
const DEFAULT_LOCALE = 'en';
const DEFAULT_THEME = 'dark';
const DEFAULT_TEXT_SCALE = 'md';
const VALID_TEXT_SCALES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];

// Set route messages mapping (server-side initialization)
setRouteMessages(routeMessages);

// Server-side message loader
async function serverMessageLoader(locale: string, namespace: string) {
  try {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const messagesDir = join(process.cwd(), 'src/messages');
    const filePath = join(messagesDir, locale, `${namespace}.json`);
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
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

  // Get locale from URL
  const pathParts = pathname.split('/').filter(Boolean);
  const pathLocale = pathParts[0];

  // If no valid locale in path, redirect to default locale
  if (!pathLocale || !SUPPORTED_LOCALES.includes(pathLocale)) {
    // Try to get preferred locale from cookie or Accept-Language
    const cookieLocale = event.cookies.get('locale');
    const acceptLanguage = event.request.headers.get('accept-language');
    let preferredLocale = DEFAULT_LOCALE;

    if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale)) {
      preferredLocale = cookieLocale;
    } else if (acceptLanguage) {
      // Parse Accept-Language header
      const langMatch = acceptLanguage.match(/^([a-z]{2})/i);
      if (langMatch && SUPPORTED_LOCALES.includes(langMatch[1].toLowerCase())) {
        preferredLocale = langMatch[1].toLowerCase();
      }
    }

    // Redirect to locale-prefixed path
    throw redirect(302, `/${preferredLocale}${pathname}`);
  }

  // Set locale
  const locale = pathLocale;
  event.locals.locale = locale;
  i18nState.locale = locale;

  // Set cookie
  event.cookies.set('locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
    sameSite: 'lax',
  });

  // Get actual route path (without locale prefix)
  const routePath = '/' + pathParts.slice(1).join('/') || '/';

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
