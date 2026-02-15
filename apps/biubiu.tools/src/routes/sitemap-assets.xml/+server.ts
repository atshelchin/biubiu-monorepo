import type { RequestHandler } from './$types';

export const prerender = true;

const BASE_URL = 'https://biubiu.tools';
const LOCALES = ['en', 'zh'];
const DEFAULT_LOCALE = 'en';
const ETHEREUM_DATA_BASE_URL = 'https://ethereum-data.awesometools.dev';

interface AssetItem {
	chainId: number;
	address: string;
	name: string;
	symbol: string;
	decimals: number;
	hasLogo?: boolean;
}

function generateUrl(chainId: number, address: string, locale: string): string {
	const path = `/assets/${chainId}/${address}`;
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
    <priority>0.5</priority>
  </url>`;
}

export const GET: RequestHandler = async ({ fetch }) => {
	try {
		// Fetch all assets from the index
		const response = await fetch(`${ETHEREUM_DATA_BASE_URL}/index/fuse-assets.json`);
		const json = await response.json();
		const assets: AssetItem[] = json.data || [];

		const urls: string[] = [];

		// Generate URLs for each asset in each locale
		for (const asset of assets) {
			for (const locale of LOCALES) {
				urls.push(generateUrl(asset.chainId, asset.address, locale));
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
	} catch (error) {
		console.error('Failed to generate assets sitemap:', error);
		return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', {
			headers: {
				'Content-Type': 'application/xml'
			}
		});
	}
};
