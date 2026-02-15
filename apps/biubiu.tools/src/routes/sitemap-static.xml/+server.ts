import type { RequestHandler } from './$types';

export const prerender = true;

const BASE_URL = 'https://biubiu.tools';
const LOCALES = ['en', 'zh'];
const DEFAULT_LOCALE = 'en';

// Static pages that don't have dynamic parameters
const STATIC_PAGES = [
	'/' // Homepage
	// Add more static pages here as they are created
	// '/tools/balance-radar',
	// '/docs',
];

function generateUrl(path: string, locale: string, lastmod?: string): string {
	const locPath = locale === DEFAULT_LOCALE ? path : `/${locale}${path}`;
	const fullUrl = `${BASE_URL}${locPath}`;

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
		for (const locale of LOCALES) {
			urls.push(generateUrl(page, locale));
		}
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
