/**
 * Shared JSON-RPC 2.0 POST helper.
 *
 * Both the chain RPC client (rpc-client.ts `tryEndpoint`) and the ERC-4337 bundler
 * client (bundler-client.ts `bundlerCall`) POST an identical `{jsonrpc, id, method,
 * params}` body and unwrap an identical `{result, error}` envelope. The two differ
 * only in transport concerns (abort signal, headers) and in how they translate
 * failures into Errors (chain RPC throws a typed `RpcError` that drives failover;
 * the bundler throws a plain Error with its own HTTP-status message). Those parts
 * stay caller-supplied so behavior is byte-identical to the previous inline code.
 */

/** Canonical JSON-RPC 2.0 response envelope. */
export interface RpcResponse<T = unknown> {
	jsonrpc: '2.0';
	id: number;
	result?: T;
	error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcPostOptions {
	/** Abort signal for a bounded request (omit for no timeout). */
	signal?: AbortSignal;
	/** Request headers (defaults to JSON content-type only). */
	headers?: Record<string, string>;
	/**
	 * Build the Error thrown when `res.ok` is false. Receives the Response so a
	 * caller can read the body (e.g. the bundler appends a truncated error text).
	 * If omitted, throws `Error('HTTP <status>')` (the chain-RPC behavior).
	 */
	httpError?: (res: Response) => Error | Promise<Error>;
	/**
	 * Build the Error thrown when the parsed envelope carries `error`. If omitted,
	 * throws `Error(error.message)` (a plain Error). The chain RPC supplies a typed
	 * RpcError factory here so `rpcCall` can distinguish node errors from transport
	 * failures.
	 */
	rpcError?: (error: NonNullable<RpcResponse['error']>) => Error;
	/**
	 * Validate the parsed JSON shape before reading `result`. If it returns an
	 * Error, that Error is thrown (the chain RPC rejects non-object responses).
	 */
	validate?: (json: unknown) => Error | undefined;
}

/**
 * POST a JSON-RPC 2.0 request and return `result`, or throw per the supplied
 * (or default) error mappers. Does NOT add a timeout itself — pass `signal` for
 * that, exactly as the previous inline implementations did.
 */
export async function jsonRpcPost<T>(
	url: string,
	method: string,
	params: unknown[],
	options: JsonRpcPostOptions = {}
): Promise<T> {
	const res = await fetch(url, {
		method: 'POST',
		headers: options.headers ?? { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
		signal: options.signal
	});
	if (!res.ok) {
		throw options.httpError ? await options.httpError(res) : new Error(`HTTP ${res.status}`);
	}
	const json = (await res.json()) as RpcResponse<T>;
	if (options.validate) {
		const err = options.validate(json);
		if (err) throw err;
	}
	if (json.error) {
		throw options.rpcError ? options.rpcError(json.error) : new Error(json.error.message);
	}
	return json.result as T;
}
