import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { matchRoute } from '@shelchin/i18n';

const SUPPORTED_LOCALES = ['zh', 'en', 'de', 'es', 'ja', 'pt'];

// Extract route path from URL (remove locale prefix)
function getRoutePathFromUrl(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length > 0 && SUPPORTED_LOCALES.includes(parts[0])) {
    parts.shift();
  }
  return '/' + parts.join('/') || '/';
}

// Preload all message modules for dynamic import
const messageModules = import.meta.glob('../messages/**/*.json', { eager: false });

// Load messages for a specific route and locale
async function loadMessagesForRoute(routePath: string, locale: string) {
  const namespaces = matchRoute(routePath);
  const messages: Record<string, string> = {};

  for (const ns of namespaces) {
    const path = `../messages/${locale}/${ns}.json`;
    const fallbackPath = `../messages/en/${ns}.json`;

    try {
      if (messageModules[path]) {
        const module = (await messageModules[path]()) as { default: Record<string, string> };
        Object.assign(messages, module.default);
      } else if (messageModules[fallbackPath]) {
        const module = (await messageModules[fallbackPath]()) as { default: Record<string, string> };
        Object.assign(messages, module.default);
      }
    } catch (e) {
      console.warn(`[i18n] Failed to load messages for ${ns}:`, e);
    }
  }

  return messages;
}

export const load: LayoutLoad = async ({ url, data, depends }) => {
  // Depend on URL to re-run on every navigation
  depends(`url:${url.pathname}`);

  const pathname = url.pathname;
  const parts = pathname.split('/').filter(Boolean);
  const locale = parts[0] && SUPPORTED_LOCALES.includes(parts[0]) ? parts[0] : 'zh';
  const routePath = getRoutePathFromUrl(pathname);

  // On browser, load messages but DON'T set i18nState here
  // Setting state here causes issues with SvelteKit preloading (hover preload overwrites current page messages)
  // Instead, let +layout.svelte handle state updates after navigation completes
  if (browser) {
    const messages = await loadMessagesForRoute(routePath, locale);
    return { ...data, messages, locale };
  }

  // On server, use data from +layout.server.ts
  return data;
};
