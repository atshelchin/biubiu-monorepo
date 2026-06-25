import type { RequestHandler } from './$types';
import { getAllPosts } from '$lib/content/blog';
import { seoConfig } from '$lib/seo';
import { xmlEscape } from '../../sitemap-xml';

export const prerender = true;

export const GET: RequestHandler = () => {
	const { domain, siteName } = seoConfig;
	const posts = getAllPosts();
	const lastBuild =
		posts.length > 0 ? new Date(`${posts[0].meta.date}T00:00:00Z`).toUTCString() : '';

	const items = posts
		.map((post) => {
			const url = `${domain}/blog/${post.slug}`;
			return `
		<item>
			<title>${xmlEscape(post.meta.title)}</title>
			<link>${url}</link>
			<guid isPermaLink="true">${url}</guid>
			<pubDate>${new Date(`${post.meta.date}T00:00:00Z`).toUTCString()}</pubDate>
			<description>${xmlEscape(post.meta.description)}</description>
			${(post.meta.tags ?? []).map((tag) => `<category>${xmlEscape(tag)}</category>`).join('')}
		</item>`;
		})
		.join('');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
	<channel>
		<title>${xmlEscape(siteName)} Blog</title>
		<link>${domain}/blog</link>
		<atom:link href="${domain}/blog/rss.xml" rel="self" type="application/rss+xml" />
		<description>Product updates, guides, and notes from the ${xmlEscape(siteName)} team.</description>
		<language>en</language>
		${lastBuild ? `<lastBuildDate>${lastBuild}</lastBuildDate>` : ''}${items}
	</channel>
</rss>`;

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 's-maxage=3600, stale-while-revalidate'
		}
	});
};
