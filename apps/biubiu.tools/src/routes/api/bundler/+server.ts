import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const ALCHEMY_API_KEY = env.ALCHEMY_API_KEY ?? '';
const BUNDLER_URL = `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

/** 允许的 JSON-RPC 方法白名单 */
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

	let body: { method: string; params: unknown[] };
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

	try {
		const rpcRequest = {
			jsonrpc: '2.0' as const,
			id: Date.now(),
			method: body.method,
			params: body.params ?? []
		};

		const res = await fetch(BUNDLER_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(rpcRequest)
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
			{
				status: 502,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
};
