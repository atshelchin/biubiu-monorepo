import type { RequestHandler } from './$types';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '$lib/locales';

export const prerender = true;

const BASE_URL = 'https://biubiu.tools';
const LOCALES = SUPPORTED_LOCALES;

// Static pages that don't have dynamic parameters
const STATIC_PAGES = [
	'/' // Homepage
	// /docs and /blog indexes live in sitemap-docs.xml / sitemap-blog.xml.
	// Add more static pages here as they are created.
];

function generateUrl(path: string, lastmod?: string): string {
	// Canonical <loc> is the prefix-free English URL; every language version is
	// declared via the hreflang alternates below (one <url> per page).
	const fullUrl = `${BASE_URL}${path}`;

	// Generate alternate links for all locales
	const alternates = LOCALES.map((loc) => {
		const altPath = loc === DEFAULT_LOCALE ? path : `/${loc}${path}`;
		return `    <xhtml:link rel="alternate" hreflang="${loc}" href="${BASE_URL}${altPath}"/>`;
	}).join('\n');

	return `  <url>
    <loc>${fullUrl}</loc>
${alternates}
    <changefreq>weekly</changefreq>
    <priority>${path === '/' ? '1.0' : '0.8'}</priority>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
  </url>`;
}

export const GET: RequestHandler = async () => {
	const urls: string[] = [];

	// Generate URLs for each static page in each locale
	for (const page of STATIC_PAGES) {
		urls.push(generateUrl(page));
	}

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
