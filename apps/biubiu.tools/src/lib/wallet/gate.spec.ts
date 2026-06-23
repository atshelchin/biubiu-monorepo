import { describe, it, expect } from 'vitest';
import { classifyAccount, isSmartAccountOnChain, NotSmartAccountError } from './gate.js';
import type { Eip1193Provider } from './eip1193.js';

function providerWithCode(code: string | null): Eip1193Provider {
	return {
		request: async ({ method }) => {
			if (method === 'eth_getCode') return code;
			throw new Error(`unexpected ${method}`);
		}
	};
}

const ADDR = '0x1111111111111111111111111111111111111111';

describe('classifyAccount', () => {
	it('detects EIP-7702 delegated EOA (0xef0100 prefix)', async () => {
		const code = '0xef0100' + '22'.repeat(20);
		expect(await classifyAccount(providerWithCode(code), ADDR, 8453)).toBe('eip7702');
	});

	it('detects a deployed smart contract wallet', async () => {
		expect(await classifyAccount(providerWithCode('0x6080604052'), ADDR, 1)).toBe('smart-contract');
	});

	it('rejects a plain EOA (empty code)', async () => {
		await expect(classifyAccount(providerWithCode('0x'), ADDR, 1)).rejects.toBeInstanceOf(
			NotSmartAccountError
		);
	});

	it('rejects when code is null', async () => {
		await expect(classifyAccount(providerWithCode(null), ADDR, 1)).rejects.toBeInstanceOf(
			NotSmartAccountError
		);
	});

	it('is case-insensitive on the 7702 prefix', async () => {
		const code = '0xEF0100' + 'AB'.repeat(20);
		expect(await classifyAccount(providerWithCode(code), ADDR, 1)).toBe('eip7702');
	});
});

describe('isSmartAccountOnChain', () => {
	it('true for smart contract', async () => {
		expect(await isSmartAccountOnChain(providerWithCode('0x6080'), ADDR, 1)).toBe(true);
	});
	it('false for plain EOA', async () => {
		expect(await isSmartAccountOnChain(providerWithCode('0x'), ADDR, 1)).toBe(false);
	});
});
