import type { Reroute } from '@sveltejs/kit';
import { removeLocaleFromPathname } from '@shelchin/i18n-sveltekit';
import { SUPPORTED_LOCALES } from '$lib/locales';

// URL-prefixed locales: /zh/chains, /ja/chains, … (English stays bare: /chains).
//
// `reroute` runs on both server and client before routing. We strip the locale
// prefix so the existing, un-prefixed route tree resolves the request — while the
// URL the user sees keeps its prefix (e.g. /zh/chains renders the /chains route).
// Params still resolve (/zh/chains/1 → /chains/1). API routes, sitemaps and bare
// English paths are untouched because their first segment isn't a known locale.
export const reroute: Reroute = ({ url }) =>
  removeLocaleFromPathname(url.pathname, [...SUPPORTED_LOCALES]);
