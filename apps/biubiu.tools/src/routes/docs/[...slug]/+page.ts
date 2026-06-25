import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { getDoc } from '$lib/content/docs';

// SSR (no prerender): biubiu serves request-scoped i18n, and the compiled doc
// component is looked up by slug in the page — never serialized through `load`.
export const load: PageLoad = ({ params }) => {
	const doc = getDoc(params.slug);
	if (!doc) {
		error(404, 'Documentation page not found');
	}
	return { slug: doc.slug, meta: doc.meta };
};
