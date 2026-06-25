import { dev } from '$app/environment';
import { assertPublicUrl, BlockedUrlError } from '$lib/server/ssrf';
import type { RequestHandler } from './$types';

// Abort if the upstream hasn't returned response headers within this window.
// Applied to the connect+headers phase only — cleared once headers arrive so
// long-lived SSE streams are not killed.
const CONNECT_TIMEOUT_MS = 15_000;

export const GET: RequestHandler = async ({ url }) => {
	const targetUrl = url.searchParams.get('url');

	if (!targetUrl) {
		return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Follow redirects MANUALLY, re-validating EACH hop through the SSRF guard so an
	// allowed host cannot 302 to an internal target — while still supporting the
	// legitimate http→https / trailing-slash redirects real strategy backends use
	// (plain redirect:'error' broke those; redirect:'follow' would skip the guard).
	const MAX_REDIRECTS = 5;
	let currentUrl = targetUrl;
	let upstream: Response;
	for (let hop = 0; ; hop++) {
		try {
			await assertPublicUrl(currentUrl, { requireHttps: !dev });
		} catch (err) {
			const reason = err instanceof BlockedUrlError ? err.message : 'Blocked URL';
			return new Response(JSON.stringify({ error: 'Blocked URL', reason }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
		try {
			upstream = await fetch(currentUrl, { redirect: 'manual', signal: controller.signal });
		} catch {
			clearTimeout(timer);
			return new Response(JSON.stringify({ error: 'Upstream request failed' }), {
				status: 502,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		// Headers received — stop the connect timeout so the body (incl. SSE) can stream.
		clearTimeout(timer);

		const location = upstream.headers.get('location');
		if (upstream.status >= 300 && upstream.status < 400 && location) {
			if (hop >= MAX_REDIRECTS) {
				return new Response(JSON.stringify({ error: 'Too many redirects' }), {
					status: 502,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			try {
				currentUrl = new URL(location, currentUrl).href; // resolve relative Location
			} catch {
				return new Response(JSON.stringify({ error: 'Bad redirect location' }), {
					status: 502,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			await upstream.body?.cancel().catch(() => {}); // drain before next hop
			continue;
		}
		break;
	}

	const contentType = upstream.headers.get('content-type') || '';

	// SSE stream — pipe through
	if (contentType.includes('text/event-stream') && upstream.body) {
		return new Response(upstream.body, {
			status: 200,
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache, no-store, must-revalidate',
				'X-Accel-Buffering': 'no'
			}
		});
	}

	// Regular response — forward body and status
	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			'Content-Type': contentType || 'application/json'
		}
	});
};
