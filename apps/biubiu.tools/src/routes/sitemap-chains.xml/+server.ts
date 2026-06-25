import type { RequestHandler } from './$types';
import { xmlEscape, isValidChainId } from '../sitemap-xml';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '$lib/locales';

export const prerender = true;

const BASE_URL = 'https://biubiu.tools';
const LOCALES = SUPPORTED_LOCALES;
const ETHEREUM_DATA_BASE_URL = 'https://ethereum-data.awesometools.dev';

interface ChainItem {
	chainId: number;
	name: string;
	shortName: string;
	nativeCurrencySymbol: string;
}

function generateUrl(chainId: number): string {
	const path = `/chains/${chainId}`;
	// Canonical <loc> is the prefix-free English URL; every language version is
	// declared via the hreflang alternates below. One <url> per item (not one per
	// locale) keeps the sitemap under Google's 50MB / 50,000-URL limits.
	const fullUrl = `${BASE_URL}${path}`;

	// Generate alternate links for all locales
	const alternates = LOCALES.map((loc) => {
		const altPath = loc === DEFAULT_LOCALE ? path : `/${loc}${path}`;
		return `    <xhtml:link rel="alternate" hreflang="${xmlEscape(loc)}" href="${BASE_URL}${altPath}"/>`;
	}).join('\n');

	return `  <url>
    <loc>${fullUrl}</loc>
${alternates}
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
}

export const GET: RequestHandler = async ({ fetch }) => {
	try {
		// Fetch all chains from the index
		const response = await fetch(`${ETHEREUM_DATA_BASE_URL}/index/fuse-chains.json`);
		const json = await response.json();
		const chains: ChainItem[] = json.data || [];

		const urls: string[] = [];

		// Generate URLs for each chain in each locale.
		// Skip entries whose chainId isn't a positive integer — never emit them.
		for (const chain of chains) {
			if (!isValidChainId(chain.chainId)) continue;
			urls.push(generateUrl(chain.chainId));
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
		console.error('Failed to generate chains sitemap:', error);
		return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', {
			headers: {
				'Content-Type': 'application/xml'
			}
		});
	}
};
