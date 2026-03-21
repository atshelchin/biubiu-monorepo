import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const ALCHEMY_API_KEY = env.ALCHEMY_API_KEY ?? '';

/** Alchemy 网络标识 → RPC slug */
const NETWORK_SLUGS: Record<string, string> = {
	'eth-mainnet': 'eth-mainnet',
	'arb-mainnet': 'arb-mainnet',
	'base-mainnet': 'base-mainnet',
	'opt-mainnet': 'opt-mainnet',
	'matic-mainnet': 'polygon-mainnet',
	'bnb-mainnet': 'bnb-mainnet',
	'avax-mainnet': 'avax-mainnet'
};

const ALLOWED_METHODS = new Set([
	'eth_estimateUserOperationGas',
	'eth_sendUserOperation',
	'eth_getUserOperationReceipt',
	'eth_getUserOperationByHash',
	'eth_supportedEntryPoints',
	'eth_getCode',
	'eth_call',
	'eth_gasPrice',
	'eth_maxPriorityFeePerGas'
]);

export const POST: RequestHandler = async ({ request }) => {
	if (!ALCHEMY_API_KEY) {
		return new Response(JSON.stringify({ error: 'Bundler not configured' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	let body: { method: string; params: unknown[]; network?: string };
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (!body.method || !ALLOWED_METHODS.has(body.method)) {
		return new Response(JSON.stringify({ error: `Method not allowed: ${body.method}` }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const network = body.network ?? 'arb-mainnet';
	const slug = NETWORK_SLUGS[network];
	if (!slug) {
		return new Response(JSON.stringify({ error: `Unsupported network: ${network}` }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const bundlerUrl = `https://${slug}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

	try {
		const res = await fetch(bundlerUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: Date.now(),
				method: body.method,
				params: body.params ?? []
			})
		});

		const data = await res.json();
		return new Response(JSON.stringify(data), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch {
		return new Response(
			JSON.stringify({
				jsonrpc: '2.0',
				id: Date.now(),
				error: { code: -32000, message: 'Bundler request failed' }
			}),
			{ status: 502, headers: { 'Content-Type': 'application/json' } }
		);
	}
};
