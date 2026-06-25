/**
 * SSRF guard for the open proxy (`/api/proxy`).
 *
 * The proxy intentionally fetches *user-configured* strategy backends (the BTC
 * Up/Down feature lets users add arbitrary `https://your-server.com` endpoints),
 * so a static host allowlist is not viable — it would break custom strategies.
 *
 * Instead we defend at the IP level: every candidate URL's host is resolved and
 * EVERY resolved address must be public. This blocks:
 *   - direct internal targets (127.0.0.1, 10/8, 192.168/16, 172.16-31, IMDS 169.254.169.254, IPv6 ::1/ULA/link-local)
 *   - numeric / obfuscated IP forms (e.g. http://2130706433 → 127.0.0.1) — caught after DNS resolution
 *   - attacker hostnames that resolve to internal IPs (DNS rebinding by name)
 *
 * Residual risk (documented): a sub-second DNS-rebinding race between this check
 * and the subsequent fetch re-resolution. Closing it fully requires pinning the
 * socket to the validated IP (custom dispatcher). The caller additionally sets
 * `redirect: 'error'` so an allowed host cannot 302 to an internal target.
 */
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

/** Resolver shape — injectable so the guard is unit-testable without real DNS. */
export type HostResolver = (host: string) => Promise<string[]>;

const defaultResolver: HostResolver = async (host) => {
	const records = await lookup(host, { all: true });
	return records.map((r) => r.address);
};

/** True if an IPv4 literal is in any private / loopback / link-local / reserved range. */
export function isPrivateIPv4(ip: string): boolean {
	const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!m) return false;
	const a = Number(m[1]);
	const b = Number(m[2]);
	if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return true; // malformed → block
	if (a === 0) return true; // 0.0.0.0/8 ("this host")
	if (a === 10) return true; // 10/8 private
	if (a === 127) return true; // loopback
	if (a === 169 && b === 254) return true; // link-local incl. IMDS 169.254.169.254
	if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
	if (a === 192 && b === 168) return true; // 192.168/16 private
	if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
	if (a >= 224) return true; // 224/4 multicast + 240/4 reserved + 255.255.255.255
	return false;
}

/** True if an IPv6 literal is loopback / ULA / link-local / IPv4-mapped-private / unspecified. */
export function isPrivateIPv6(ip: string): boolean {
	const norm = ip.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, ''); // strip brackets + zone id
	if (norm === '::1' || norm === '::') return true; // loopback / unspecified
	const mapped = norm.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/); // IPv4-mapped
	if (mapped) return isPrivateIPv4(mapped[1]);
	if (/^f[cd]/.test(norm)) return true; // fc00::/7 unique-local
	if (/^fe[89ab]/.test(norm)) return true; // fe80::/10 link-local
	return false;
}

/** True if an IP literal (v4 or v6) must not be fetched. Non-IP strings are treated as private (fail-closed). */
export function isPrivateIp(ip: string): boolean {
	const v = isIP(ip);
	if (v === 4) return isPrivateIPv4(ip);
	if (v === 6) return isPrivateIPv6(ip);
	return true; // not a recognizable IP — fail closed
}

export class BlockedUrlError extends Error {
	constructor(reason: string) {
		super(reason);
		this.name = 'BlockedUrlError';
	}
}

export interface AssertPublicUrlOptions {
	/** Reject non-https URLs (set in production). */
	requireHttps?: boolean;
	/** Override DNS resolution (tests). */
	resolve?: HostResolver;
}

/**
 * Validate that `urlStr` is a fetchable, public http(s) URL.
 * Throws BlockedUrlError otherwise. Returns the parsed URL on success.
 */
export async function assertPublicUrl(
	urlStr: string,
	opts: AssertPublicUrlOptions = {}
): Promise<URL> {
	let url: URL;
	try {
		url = new URL(urlStr);
	} catch {
		throw new BlockedUrlError('Invalid URL');
	}

	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new BlockedUrlError('Only http(s) is allowed');
	}
	if (opts.requireHttps && url.protocol !== 'https:') {
		throw new BlockedUrlError('HTTPS required');
	}

	const host = url.hostname.replace(/^\[|\]$/g, '');

	// Literal IP — check directly, no DNS.
	if (isIP(host)) {
		if (isPrivateIp(host)) throw new BlockedUrlError('Private/reserved IP blocked');
		return url;
	}

	// Reject obvious internal names before paying for DNS.
	const lower = host.toLowerCase();
	if (
		lower === 'localhost' ||
		lower.endsWith('.localhost') ||
		lower.endsWith('.local') ||
		lower.endsWith('.internal')
	) {
		throw new BlockedUrlError('Local hostname blocked');
	}

	// Resolve and require EVERY address to be public (defeats rebinding-by-name + numeric forms).
	const resolver = opts.resolve ?? defaultResolver;
	let addresses: string[];
	try {
		addresses = await resolver(host);
	} catch {
		throw new BlockedUrlError('DNS resolution failed');
	}
	if (!addresses.length) throw new BlockedUrlError('No addresses resolved');
	for (const addr of addresses) {
		if (isPrivateIp(addr)) throw new BlockedUrlError(`Resolves to private IP (${addr})`);
	}

	return url;
}
