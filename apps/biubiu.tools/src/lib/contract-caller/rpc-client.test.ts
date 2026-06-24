import { describe, it, expect } from 'vitest';
import { isRetryableRpcError } from './rpc-client.js';

describe('isRetryableRpcError', () => {
	it('treats transport failures as retryable (try another RPC)', () => {
		expect(isRetryableRpcError(new Error('The request timed out.'))).toBe(true);
		expect(isRetryableRpcError({ name: 'TimeoutError', message: 'timed out' })).toBe(true);
		expect(isRetryableRpcError(new Error('HTTP request failed. Status: 429'))).toBe(true);
		expect(isRetryableRpcError(new Error('Failed to fetch'))).toBe(true);
		expect(isRetryableRpcError('socket hang up')).toBe(true);
	});

	it('treats deterministic EVM outcomes as NOT retryable (same on any node)', () => {
		expect(isRetryableRpcError(new Error('execution reverted: insufficient balance'))).toBe(false);
		expect(isRetryableRpcError({ shortMessage: 'execution reverted' })).toBe(false);
		expect(isRetryableRpcError(new Error('out of gas'))).toBe(false);
		expect(isRetryableRpcError(new Error('reverted with custom error 0xabcdef12'))).toBe(false);
	});

	it('defaults unknown errors to retryable', () => {
		expect(isRetryableRpcError(new Error('something weird'))).toBe(true);
		expect(isRetryableRpcError(undefined)).toBe(true);
	});
});
