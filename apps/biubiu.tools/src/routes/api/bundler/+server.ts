/**
 * Bundler + RPC 代理。
 *
 * 适配器模式：通过 BUNDLER_PROVIDER env 切换 bundler 提供商。
 * Bundler 方法（UserOp）→ Pimlico / Alchemy
 * 标准 RPC 方法 → Alchemy
 */
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

// ─── Config ───

const ALCHEMY_API_KEY = env.ALCHEMY_API_KEY ?? '';
const PIMLICO_API_KEY = env.PIMLICO_API_KEY ?? '';
const BUNDLER_PROVIDER = env.BUNDLER_PROVIDER ?? 'pimlico'; // 'pimlico' | 'alchemy'

// ─── Network Maps ───

/** Legacy network key → chainId (for backwards compat with existing code) */
const CHAIN_IDS: Record<string, number> = {
	'eth-mainnet': 1,
	'arb-mainnet': 42161,
	'base-mainnet': 8453,
	'opt-mainnet': 10,
	'matic-mainnet': 137,
	'bnb-mainnet': 56,
	'avax-mainnet': 43114,
	'polygon-amoy': 80002
};

const ALCHEMY_SLUGS: Record<string, string> = {
	'eth-mainnet': 'eth-mainnet',
	'arb-mainnet': 'arb-mainnet',
	'base-mainnet': 'base-mainnet',
	'opt-mainnet': 'opt-mainnet',
	'matic-mainnet': 'polygon-mainnet',
	'bnb-mainnet': 'bnb-mainnet',
	'avax-mainnet': 'avax-mainnet',
	'polygon-amoy': 'polygon-amoy'
};

/** Resolve chainId from request: accept `chainId` number directly or `network` key */
function resolveChainId(body: { network?: string; chainId?: number }): number | null {
	if (body.chainId && typeof body.chainId === 'number') return body.chainId;
	if (body.network && CHAIN_IDS[body.network]) return CHAIN_IDS[body.network];
	return null;
}

/** Resolve Alchemy slug from network key (legacy RPC methods only) */
function resolveAlchemySlug(body: { network?: string; chainId?: number }): string | null {
	if (body.network && ALCHEMY_SLUGS[body.network]) return ALCHEMY_SLUGS[body.network];
	return null;
}

// ─── Bundler Adapters ───

interface BundlerAdapter {
	name: string;
	buildUrl(network: string): string | null;
	/** Pimlico 专用方法 */
	extraMethods?: string[];
}

const adapters: Record<string, BundlerAdapter> = {
	pimlico: {
		name: 'Pimlico',
		buildUrl(network: string) {
			if (!PIMLICO_API_KEY) return null;
			const chainId = CHAIN_IDS[network];
			if (!chainId) return null;
			return `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${PIMLICO_API_KEY}`;
		},
		extraMethods: ['pimlico_getUserOperationGasPrice']
	},
	alchemy: {
		name: 'Alchemy',
		buildUrl(network: string) {
			if (!ALCHEMY_API_KEY) return null;
			const slug = ALCHEMY_SLUGS[network];
			if (!slug) return null;
			return `https://${slug}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
		}
	}
};

// ─── Method Classification ───

const BUNDLER_METHODS = new Set([
	'eth_estimateUserOperationGas',
	'eth_sendUserOperation',
	'eth_getUserOperationReceipt',
	'eth_getUserOperationByHash',
	'eth_supportedEntryPoints',
	// Paymaster methods
	'pm_getPaymasterStubData',
	'pm_getPaymasterData',
	'pimlico_getTokenQuotes'
]);

const RPC_METHODS = new Set([
	'eth_getCode',
	'eth_call',
	'eth_gasPrice',
	'eth_maxPriorityFeePerGas'
]);

// ─── Handler ───

export const POST: RequestHandler = async ({ request }) => {
	let body: { method: string; params: unknown[]; network?: string; chainId?: number };
	try {
		body = await request.json();
	} catch {
		return jsonError('Invalid JSON', 400);
	}

	const method = body.method;
	const adapter = adapters[BUNDLER_PROVIDER];
	const adapterExtras = new Set(adapter?.extraMethods ?? []);

	if (!method || (!BUNDLER_METHODS.has(method) && !RPC_METHODS.has(method) && !adapterExtras.has(method))) {
		return jsonError(`Method not allowed: ${method}`, 403);
	}

	const chainId = resolveChainId(body);
	if (!chainId) {
		return jsonError(`Missing or unsupported network/chainId`, 400);
	}

	// 路由：bundler 方法 → bundler adapter，标准 RPC → Alchemy
	let targetUrl: string | null;

	if (BUNDLER_METHODS.has(method) || adapterExtras.has(method)) {
		if (!adapter) return jsonError(`Unknown bundler provider: ${BUNDLER_PROVIDER}`, 503);
		// Pimlico uses chainId directly — works for any chain Pimlico supports
		targetUrl = adapter.buildUrl(body.network ?? String(chainId));
		if (!targetUrl) {
			// Fallback: build Pimlico URL directly from chainId
			if (BUNDLER_PROVIDER === 'pimlico' && PIMLICO_API_KEY) {
				targetUrl = `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${PIMLICO_API_KEY}`;
			} else {
				return jsonError(`${adapter.name} not configured or network unsupported`, 503);
			}
		}
	} else {
		// 标准 RPC → Alchemy (only works with known slugs)
		const slug = resolveAlchemySlug(body);
		if (!slug || !ALCHEMY_API_KEY) {
			console.error('[bundler] Alchemy not available for chainId', chainId);
			return jsonError('RPC not configured for this chain', 503);
		}
		targetUrl = `https://${slug}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
	}

	console.log(`[bundler] ${method} → ${targetUrl.replace(/[?=].*/, '...')}`);

	try {
		const res = await fetch(targetUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: Date.now(),
				method,
				params: body.params ?? []
			})
		});

		if (!res.ok) {
			const text = await res.text().catch(() => '');
			console.error(`[bundler] ${method} → ${res.status}: ${text}`);
			return jsonRpcError(`Provider returned ${res.status}`, 502);
		}

		const data = await res.json();
		return new Response(JSON.stringify(data), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		const cause = err instanceof Error && err.cause ? ` cause: ${err.cause}` : '';
		console.error(`[bundler] ${method} failed: ${msg}${cause}`);
		console.error(`[bundler] targetUrl: ${targetUrl}`);
		return jsonRpcError(`Request failed: ${msg}`, 502);
	}
};

function jsonError(message: string, status: number) {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function jsonRpcError(message: string, status: number) {
	return new Response(
		JSON.stringify({ jsonrpc: '2.0', id: Date.now(), error: { code: -32000, message } }),
		{ status, headers: { 'Content-Type': 'application/json' } }
	);
}
