/**
 * RPC endpoint helpers: filtering, latency probing, and latency classification.
 * Browser-only (uses fetch / WebSocket / performance).
 */

const PROBE_TIMEOUT_MS = 5000;

/** Drop endpoints that require an API key / private template placeholder. */
export function getPublicRpcEndpoints(rpcs: string[]): string[] {
	return rpcs.filter(
		(rpc) => !rpc.includes('${') && !rpc.includes('API_KEY') && !rpc.includes('INFURA')
	);
}

/** Whether an endpoint can be latency-probed (HTTP(S) or WS(S)). */
export function isTestableRpc(rpc: string): boolean {
	return rpc.startsWith('http') || rpc.startsWith('wss://') || rpc.startsWith('ws://');
}

/** Latency tier for colour coding. */
export function latencyTier(latency: number | null): 'good' | 'medium' | 'slow' | 'none' {
	if (latency === null) return 'none';
	if (latency < 200) return 'good';
	if (latency < 500) return 'medium';
	return 'slow';
}

type ProbeResult = { latency: number | null; status: 'success' | 'error' };

async function probeHttp(rpcUrl: string): Promise<ProbeResult> {
	const start = performance.now();
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
	try {
		const response = await fetch(rpcUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
			signal: controller.signal
		});
		if (response.ok) {
			return { latency: Math.round(performance.now() - start), status: 'success' };
		}
		return { latency: null, status: 'error' };
	} catch {
		return { latency: null, status: 'error' };
	} finally {
		clearTimeout(timeoutId);
	}
}

function probeWs(rpcUrl: string): Promise<ProbeResult> {
	return new Promise((resolve) => {
		const start = performance.now();
		let ws: WebSocket | null = null;
		let settled = false;
		let timeoutId: ReturnType<typeof setTimeout>;

		const done = (result: ProbeResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			ws?.close();
			resolve(result);
		};

		try {
			ws = new WebSocket(rpcUrl);
			timeoutId = setTimeout(() => done({ latency: null, status: 'error' }), PROBE_TIMEOUT_MS);
			ws.onopen = () => {
				ws!.send(JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }));
			};
			ws.onmessage = () => done({ latency: Math.round(performance.now() - start), status: 'success' });
			ws.onerror = () => done({ latency: null, status: 'error' });
		} catch {
			done({ latency: null, status: 'error' });
		}
	});
}

/** Probe a single endpoint, dispatching by protocol. */
export function probeRpcLatency(rpcUrl: string): Promise<ProbeResult> {
	if (rpcUrl.startsWith('http')) return probeHttp(rpcUrl);
	if (rpcUrl.startsWith('ws')) return probeWs(rpcUrl);
	return Promise.resolve({ latency: null, status: 'error' });
}
