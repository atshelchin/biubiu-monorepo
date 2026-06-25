import type { PageLoad } from './$types';
import { loadAllChains, type ChainListItem } from '$lib/chains';

export type { ChainListItem };

/**
 * Load the full chain index in a `load` function so the list — and every
 * `<a href="/chains/{id}">` it links to — is rendered into the server HTML.
 * Previously this ran in a client-side `$effect`, so SSR emitted only the
 * skeleton and crawlers saw no chains/links (bad for SEO/indexing).
 *
 * Universal (`+page.ts`, not `+page.server.ts`): the fetch runs on the server
 * during SSR (result serialized into the page payload, so the client does not
 * re-fetch) and on the client during in-app navigation. `loadAllChains`'s
 * module-level cache means the SSR binary fetches the ~2.6k entries once and
 * reuses them across requests.
 *
 * SSR, not `prerender = true`, on purpose:
 *  - per-request locale: SSR resolves `locals.locale` so each of the 15 locales
 *    gets correct HTML; a prerender would freeze the page to the build locale.
 *  - the chain index is remote and changes; prerender would bake it at build time.
 */
export const load: PageLoad = async ({ fetch }) => {
	const chains = await loadAllChains(fetch);
	return { chains };
};
