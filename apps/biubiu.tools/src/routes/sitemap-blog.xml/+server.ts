import type { RequestHandler } from './$types';
import { xmlEscape } from '../sitemap-xml';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '$lib/locales';
import { getAllPosts } from '$lib/content/blog';

export const prerender = true;

const BASE_URL = 'https://biubiu.tools';
const LOCALES = SUPPORTED_LOCALES;

function generateUrl(path: string, lastmod?: string): string {
	// Canonical <loc> is the prefix-free English URL; every language version is
	// declared via the hreflang alternates below (one <url> per page).
	const fullUrl = `${BASE_URL}${path}`;
	const alternates = LOCALES.map((loc) => {
		const altPath = loc === DEFAULT_LOCALE ? path : `/${loc}${path}`;
		return `    <xhtml:link rel="alternate" hreflang="${xmlEscape(loc)}" href="${BASE_URL}${altPath}"/>`;
	}).join('\n');

	return `  <url>
    <loc>${fullUrl}</loc>
${alternates}
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
  </url>`;
}

export const GET: RequestHandler = async () => {
	const urls = [
		generateUrl('/blog'),
		...getAllPosts().map((post) => generateUrl(`/blog/${post.slug}`, post.meta.date))
	];

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>`;

	return new Response(sitemap, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=86400'
		}
	});
};
