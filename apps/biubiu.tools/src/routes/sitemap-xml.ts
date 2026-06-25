// Shared helpers for the dynamic sitemap endpoints.
//
// Sitemap <loc> values are built from semi-trusted external feed data
// (ethereum-data.awesometools.dev). A stray `&`, `<` or `>` in any feed
// value would otherwise produce malformed XML and crawlers reject the WHOLE
// sitemap file, silently breaking SEO indexing. Every interpolated value
// MUST be passed through xmlEscape().

/** XML-escape a string for safe interpolation into element text / attribute values. */
export function xmlEscape(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/** A chainId is valid only if it is a positive integer. */
export function isValidChainId(chainId: unknown): boolean {
	return typeof chainId === 'number' && Number.isInteger(chainId) && chainId > 0;
}

/** An EVM address is valid only if it matches 0x + 40 hex chars. */
export function isValidAddress(address: unknown): boolean {
	return typeof address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(address);
}
