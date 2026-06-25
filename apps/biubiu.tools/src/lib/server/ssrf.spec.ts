import { describe, expect, it } from 'vitest';
import {
	assertPublicUrl,
	BlockedUrlError,
	isPrivateIp,
	isPrivateIPv4,
	isPrivateIPv6
} from './ssrf';

// A resolver stub: map known hosts to fixed IPs; throw on unknown.
const stubResolver = (map: Record<string, string[]>) => async (host: string) => {
	if (host in map) return map[host];
	throw new Error('NXDOMAIN');
};

describe('isPrivateIPv4', () => {
	it('flags loopback / private / link-local / CGNAT / multicast', () => {
		for (const ip of [
			'127.0.0.1',
			'10.0.0.5',
			'192.168.1.1',
			'172.16.0.1',
			'172.31.255.255',
			'169.254.169.254', // AWS/GCP/Azure IMDS
			'100.64.0.1',
			'0.0.0.0',
			'224.0.0.1',
			'255.255.255.255'
		]) {
			expect(isPrivateIPv4(ip), ip).toBe(true);
		}
	});
	it('allows public IPv4', () => {
		for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1']) {
			expect(isPrivateIPv4(ip), ip).toBe(false);
		}
	});
});

describe('isPrivateIPv6', () => {
	it('flags loopback / ULA / link-local / mapped-private', () => {
		for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:169.254.169.254']) {
			expect(isPrivateIPv6(ip), ip).toBe(true);
		}
	});
	it('allows public IPv6 incl mapped-public', () => {
		expect(isPrivateIPv6('2606:4700:4700::1111')).toBe(false);
		expect(isPrivateIPv6('::ffff:8.8.8.8')).toBe(false);
	});
});

describe('isPrivateIp', () => {
	it('fails closed on non-IP input', () => {
		expect(isPrivateIp('not-an-ip')).toBe(true);
	});
});

describe('assertPublicUrl', () => {
	const resolve = stubResolver({
		'api.example.com': ['93.184.216.34'],
		'rebind.evil.com': ['169.254.169.254'], // DNS rebinding by name → IMDS
		'mixed.evil.com': ['8.8.8.8', '10.0.0.1'] // one public, one private → must block
	});

	it('allows a public https host', async () => {
		const u = await assertPublicUrl('https://api.example.com/strategy', { resolve });
		expect(u.hostname).toBe('api.example.com');
	});

	it('blocks the AWS metadata IP directly (no DNS needed)', async () => {
		await expect(
			assertPublicUrl('http://169.254.169.254/latest/meta-data/iam/security-credentials/', { resolve })
		).rejects.toBeInstanceOf(BlockedUrlError);
	});

	it('blocks loopback / private literal IPs', async () => {
		for (const url of ['http://127.0.0.1/', 'http://[::1]/', 'http://10.0.0.1/', 'http://192.168.0.1/']) {
			await expect(assertPublicUrl(url, { resolve }), url).rejects.toBeInstanceOf(BlockedUrlError);
		}
	});

	it('blocks numeric / obfuscated IPv4 (2130706433 = 127.0.0.1) via resolution', async () => {
		// getaddrinfo resolves the decimal form to loopback; stub mirrors that.
		const r = stubResolver({ '2130706433': ['127.0.0.1'] });
		await expect(assertPublicUrl('http://2130706433/', { resolve: r })).rejects.toBeInstanceOf(
			BlockedUrlError
		);
	});

	it('blocks a hostname that resolves to an internal IP (DNS rebinding)', async () => {
		await expect(assertPublicUrl('https://rebind.evil.com/', { resolve })).rejects.toThrow(
			/private IP/
		);
	});

	it('blocks when ANY resolved address is private', async () => {
		await expect(assertPublicUrl('https://mixed.evil.com/', { resolve })).rejects.toBeInstanceOf(
			BlockedUrlError
		);
	});

	it('blocks localhost and *.local / *.internal names', async () => {
		for (const url of ['http://localhost/', 'http://foo.local/', 'http://svc.internal/']) {
			await expect(assertPublicUrl(url, { resolve }), url).rejects.toBeInstanceOf(BlockedUrlError);
		}
	});

	it('blocks non-http(s) schemes', async () => {
		for (const url of ['file:///etc/passwd', 'gopher://x/', 'ftp://x/']) {
			await expect(assertPublicUrl(url, { resolve }), url).rejects.toBeInstanceOf(BlockedUrlError);
		}
	});

	it('enforces requireHttps when set', async () => {
		await expect(
			assertPublicUrl('http://api.example.com/', { resolve, requireHttps: true })
		).rejects.toThrow(/HTTPS/);
		// without the flag, http is allowed for a public host
		await expect(assertPublicUrl('http://api.example.com/', { resolve })).resolves.toBeInstanceOf(
			URL
		);
	});

	it('blocks when DNS resolution fails (fail closed)', async () => {
		await expect(assertPublicUrl('https://nonexistent.invalid/', { resolve })).rejects.toBeInstanceOf(
			BlockedUrlError
		);
	});
});
