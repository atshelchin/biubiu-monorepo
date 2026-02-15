import type { RequestHandler } from './$types';

export const prerender = true;

const BASE_URL = 'https://biubiu.tools';

export const GET: RequestHandler = async () => {
	const sitemaps = [
		`${BASE_URL}/sitemap-static.xml`,
		`${BASE_URL}/sitemap-chains.xml`
	];

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.map((url) => `  <sitemap>
    <loc>${url}</loc>
  </sitemap>`).join('\n')}
</sitemapindex>`;

	return new Response(sitemap, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=86400'
		}
	});
};
