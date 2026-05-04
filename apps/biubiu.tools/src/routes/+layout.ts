import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { matchRoute } from '@shelchin/i18n-sveltekit';

// Preload all message modules for dynamic import
const messageModules = import.meta.glob('../messages/**/*.json', { eager: false });

// Load messages for a specific route
async function loadMessagesForRoute(routePath: string) {
  let namespaces = matchRoute(routePath);

  // If only _global matched, try progressively shorter parent paths.
  // This ensures /apps/btc-updown-5m/space/xxx loads apps/btc-updown-5m messages.
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

  const messages: Record<string, string> = {};

  for (const ns of namespaces) {
    const path = `../messages/en/${ns}.json`;

    try {
      if (messageModules[path]) {
        const module = (await messageModules[path]()) as { default: Record<string, string> };
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

  const routePath = url.pathname;

  // On browser, load messages (don't set i18nState here - let +layout.svelte handle it)
  if (browser) {
    const messages = await loadMessagesForRoute(routePath);
    return { ...data, messages, locale: 'en' };
  }

  // On server, use data from +layout.server.ts
  return data;
};
