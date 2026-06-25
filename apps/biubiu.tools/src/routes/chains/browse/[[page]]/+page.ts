import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import { loadAllChains } from '$lib/chains';

/**
 * Crawlable, paginated index of EVERY chain.
 *
 * The main `/chains` list only renders the first page of chains into SSR HTML
 * (the rest arrive via client-side infinite scroll, which crawlers don't run),
 * so ~2.5k chain detail pages had no internal link pointing at them and Google
 * deprioritised them. This route emits a plain `<a href>` to every chain across
 * a handful of paginated pages, giving crawlers a complete path to all of them.
 *
 * Universal (`+page.ts`) + SSR so the links land in the server HTML; the
 * module-level `loadAllChains` cache means the ~2.6k index is fetched once.
 */
export const _PAGE_SIZE = 200;

export const load: PageLoad = async ({ params, fetch }) => {
	const chains = await loadAllChains(fetch);
	const totalPages = Math.max(1, Math.ceil(chains.length / _PAGE_SIZE));

	// `[[page]]` is optional: `/chains/browse` is page 1.
	const page = params.page === undefined ? 1 : Number(params.page);
	if (!Number.isInteger(page) || page < 1 || page > totalPages) {
		throw error(404, 'Page not found');
	}

	const start = (page - 1) * _PAGE_SIZE;
	return {
		chains: chains.slice(start, start + _PAGE_SIZE),
		page,
		totalPages,
		total: chains.length
	};
};
