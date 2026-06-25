import { describe, it, expect } from 'vitest';
import type { Address, PublicClient } from 'viem';
import { isRetryableRpcError, dedupRpcs, isDeployedWith } from './rpc-client.js';

const ADDR = '0x0000000000000000000000000000000000000001' as Address;

/** Minimal stub exposing only the getCode the helper uses. */
function fakeClient(getCode: PublicClient['getCode']): PublicClient {
	return { getCode } as unknown as PublicClient;
}

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

	it('still fails over on transport errors that embed the request calldata (the failover bug)', () => {
		// viem's CallExecutionError ALWAYS embeds the request — incl. the function
		// selector — even for a 429/timeout. Must NOT be misread as a revert.
		const rateLimited = new Error(
			'HTTP request failed. Status: 429\nURL: https://rpc.example\n' +
				'Request body: {"method":"eth_call","params":[{"to":"0x6b175474e89094c44da98b954eedeac495271d0f","data":"0x06fdde03"}]}'
		);
		expect(isRetryableRpcError(rateLimited)).toBe(true);

		const timedOut = {
			name: 'TimeoutError',
			shortMessage: 'The request took too long to respond.',
			details: 'call to 0x6b175474, data 0x70a08231'
		};
		expect(isRetryableRpcError(timedOut)).toBe(true);
	});
});

describe('dedupRpcs', () => {
	it('drops falsy entries and de-duplicates, preserving first-occurrence order', () => {
		expect(dedupRpcs(['https://a', 'https://b', 'https://a', 'https://c'])).toEqual([
			'https://a',
			'https://b',
			'https://c'
		]);
	});

	it('returns an empty list when every entry is falsy', () => {
		expect(dedupRpcs(['', undefined, null])).toEqual([]);
	});
});

describe('isDeployedWith', () => {
	it('is true when getCode returns non-empty bytecode', async () => {
		const client = fakeClient((async () => '0x60806040' as `0x${string}`) as PublicClient['getCode']);
		expect(await isDeployedWith(client, ADDR)).toBe(true);
	});

	it('is false for an empty "0x" result and for a getCode rejection', async () => {
		const empty = fakeClient((async () => '0x' as `0x${string}`) as PublicClient['getCode']);
		expect(await isDeployedWith(empty, ADDR)).toBe(false);

		const throwing = fakeClient((async () => {
			throw new Error('rpc down');
		}) as PublicClient['getCode']);
		expect(await isDeployedWith(throwing, ADDR)).toBe(false);
	});
});
