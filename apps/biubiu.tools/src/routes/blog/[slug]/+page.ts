import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { getPost } from '$lib/content/blog';

export const load: PageLoad = ({ params }) => {
	const post = getPost(params.slug);
	if (!post || post.meta.draft) {
		error(404, 'Post not found');
	}
	return {
		slug: post.slug,
		meta: post.meta,
		readingMinutes: post.readingMinutes
	};
};
