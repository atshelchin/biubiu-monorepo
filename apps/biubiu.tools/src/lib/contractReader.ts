/**
 * Contract Reader - Simple RPC calls with fallback
 */
import { encodeFunctionData, decodeFunctionResult, type Abi } from 'viem';

const ETHEREUM_DATA_BASE_URL = 'https://ethereum-data.awesometools.dev';

// Cache for chain data
const chainDataCache = new Map<number, ChainData>();

interface ChainData {
	name: string;
	chain: string;
	chainId: number;
	rpc: string[];
	nativeCurrency: {
		name: string;
		symbol: string;
		decimals: number;
	};
}

/**
 * Fetch chain data from ethereum-data API
 */
async function fetchChainData(chainId: number): Promise<ChainData> {
	if (chainDataCache.has(chainId)) {
		return chainDataCache.get(chainId)!;
	}

	const response = await fetch(`${ETHEREUM_DATA_BASE_URL}/chains/eip155-${chainId}.json`);
	if (!response.ok) {
		throw new Error(`Failed to fetch chain data for chainId ${chainId}`);
	}

	const data: ChainData = await response.json();
	chainDataCache.set(chainId, data);
	return data;
}

/**
 * Get valid RPC endpoints for a chain
 */
async function getValidRpcs(chainId: number): Promise<string[]> {
	const chainData = await fetchChainData(chainId);

	// Filter valid HTTP/HTTPS RPC URLs (exclude WSS and templated URLs)
	const validRpcs = chainData.rpc.filter(
		(rpc) =>
			(rpc.startsWith('https://') || rpc.startsWith('http://')) &&
			!rpc.includes('${') &&
			!rpc.includes('API_KEY')
	);

	if (validRpcs.length === 0) {
		throw new Error(`No valid RPC endpoints found for chainId ${chainId}`);
	}

	return validRpcs.slice(0, 5); // Use at most 5 endpoints
}

/**
 * Make an eth_call RPC request
 */
async function ethCall(rpcUrl: string, to: string, data: string): Promise<string> {
	const response = await fetch(rpcUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			jsonrpc: '2.0',
			method: 'eth_call',
			params: [{ to, data }, 'latest'],
			id: 1
		})
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}

	const json = await response.json();

	if (json.error) {
		throw new Error(json.error.message || 'RPC error');
	}

	return json.result;
}

/**
 * Make RPC call with fallback to multiple endpoints
 */
async function callWithFallback(rpcs: string[], to: string, data: string): Promise<string> {
	let lastError: Error | null = null;

	for (const rpc of rpcs) {
		try {
			return await ethCall(rpc, to, data);
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			console.warn(`RPC ${rpc} failed:`, lastError.message);
			// Continue to next RPC
		}
	}

	throw lastError || new Error('All RPC endpoints failed');
}

/**
 * Read contract function
 */
export async function readContract(
	chainId: number,
	contractAddress: string,
	abi: Abi,
	functionName: string,
	args: unknown[] = []
): Promise<unknown> {
	// Encode the function call
	const data = encodeFunctionData({
		abi,
		functionName,
		args
	});

	// Get RPC endpoints and execute with fallback
	const rpcs = await getValidRpcs(chainId);
	const hexResult = await callWithFallback(rpcs, contractAddress, data);

	// Decode the result
	const decoded = decodeFunctionResult({
		abi,
		functionName,
		data: hexResult as `0x${string}`
	});

	return decoded;
}

/**
 * Format decoded value for display
 */
export function formatDecodedValue(value: unknown): string {
	if (value === null || value === undefined) {
		return 'null';
	}

	if (typeof value === 'bigint') {
		return value.toString();
	}

	if (typeof value === 'boolean') {
		return value ? 'true' : 'false';
	}

	if (typeof value === 'string') {
		return value;
	}

	if (Array.isArray(value)) {
		return `[${value.map(formatDecodedValue).join(', ')}]`;
	}

	if (typeof value === 'object') {
		const entries = Object.entries(value)
			.filter(([key]) => isNaN(Number(key))) // Filter out numeric indices
			.map(([key, val]) => `${key}: ${formatDecodedValue(val)}`);
		return `{ ${entries.join(', ')} }`;
	}

	return String(value);
}
