/** Thin JSON-RPC read helper — routes through the app's /api/bundler proxy (Alchemy-backed). */

interface RpcResponse {
	result?: unknown;
	error?: { message?: string } | string;
}

export async function rpcCall<T = unknown>(network: string, method: string, params: unknown[]): Promise<T> {
	const res = await fetch('/api/bundler', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ network, method, params })
	});
	if (!res.ok) throw new Error(`RPC ${method} failed: HTTP ${res.status}`);
	const json = (await res.json()) as RpcResponse;
	if (json.error) {
		const msg = typeof json.error === 'string' ? json.error : (json.error.message ?? 'RPC error');
		throw new Error(msg);
	}
	return json.result as T;
}
