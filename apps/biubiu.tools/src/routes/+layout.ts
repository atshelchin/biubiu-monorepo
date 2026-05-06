import type { LayoutLoad } from './$types';
import { matchRoute, setRouteMessages } from '@shelchin/i18n-sveltekit';
import { routeMessages } from '$i18n/routes';

// Ensure route messages are registered (hooks.server.ts does this for SSR,
// but on the client this module may load before $lib/i18n.ts)
setRouteMessages(routeMessages);

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
  const messages = await loadMessagesForRoute(routePath);
  return { ...data, messages, locale: 'en' };
};
