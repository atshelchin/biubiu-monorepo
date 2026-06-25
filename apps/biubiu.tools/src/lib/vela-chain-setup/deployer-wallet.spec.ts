import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isAddress, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
	getOrCreateDeployerWallet,
	loadExistingWallet,
	clearStoredWallet,
} from './deployer-wallet.js';

// deployer-wallet.ts mixes pure key/address derivation (viem) with
// localStorage-backed persistence. We exercise both by stubbing a tiny
// in-memory localStorage; we never touch RPC (sendDeployerTx /
// getDeployerBalance) or the DOM download helper.

// ─── In-memory localStorage stub ───
class MemoryStorage {
	private map = new Map<string, string>();
	getItem(key: string): string | null {
		return this.map.has(key) ? this.map.get(key)! : null;
	}
	setItem(key: string, value: string): void {
		this.map.set(key, String(value));
	}
	removeItem(key: string): void {
		this.map.delete(key);
	}
	clear(): void {
		this.map.clear();
	}
}

beforeEach(() => {
	(globalThis as unknown as { localStorage: Storage }).localStorage =
		new MemoryStorage() as unknown as Storage;
});

afterEach(() => {
	delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
});

describe('getOrCreateDeployerWallet — key/address derivation', () => {
	it('returns a 32-byte hex private key whose address matches viem derivation', () => {
		const wallet = getOrCreateDeployerWallet(1);
		// private key: 0x + 64 lowercase hex chars
		expect(wallet.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
		// address is valid, checksummed, and exactly what viem derives from the key
		expect(isAddress(wallet.address)).toBe(true);
		expect(wallet.address).toBe(getAddress(wallet.address));
		expect(wallet.address).toBe(privateKeyToAccount(wallet.privateKey).address);
	});

	it('generates a fresh, unpredictable key per distinct chain', () => {
		const a = getOrCreateDeployerWallet(1);
		const b = getOrCreateDeployerWallet(137);
		expect(a.privateKey).not.toBe(b.privateKey);
		expect(a.address).not.toBe(b.address);
	});

	it('is idempotent: re-calling for the same chain returns the same wallet', () => {
		const first = getOrCreateDeployerWallet(42161);
		const second = getOrCreateDeployerWallet(42161);
		expect(second).toEqual(first);
		expect(second.privateKey).toBe(first.privateKey);
	});

	it('persists the wallet so a later loadExistingWallet finds it', () => {
		const created = getOrCreateDeployerWallet(10);
		const loaded = loadExistingWallet(10);
		expect(loaded).toEqual(created);
	});
});

describe('loadExistingWallet', () => {
	it('returns null when no wallet has been created for the chain', () => {
		expect(loadExistingWallet(999)).toBeNull();
	});

	it('does not leak a wallet from one chain into another', () => {
		getOrCreateDeployerWallet(1);
		expect(loadExistingWallet(2)).toBeNull();
	});

	it('returns null for a malformed stored entry (missing fields)', () => {
		// Simulate a corrupt/partial record under the module storage key.
		localStorage.setItem(
			'vela-chain-setup-deployer',
			JSON.stringify({ '5': { address: '0xabc' } }), // no privateKey
		);
		expect(loadExistingWallet(5)).toBeNull();
	});

	it('returns null when storage holds invalid JSON', () => {
		localStorage.setItem('vela-chain-setup-deployer', 'not-json{');
		expect(loadExistingWallet(5)).toBeNull();
	});
});

describe('clearStoredWallet', () => {
	it('removes only the targeted chain, leaving others intact', () => {
		const keep = getOrCreateDeployerWallet(1);
		getOrCreateDeployerWallet(2);

		clearStoredWallet(2);

		expect(loadExistingWallet(2)).toBeNull();
		expect(loadExistingWallet(1)).toEqual(keep);
	});

	it('is a no-op (no throw) when clearing a chain that was never stored', () => {
		expect(() => clearStoredWallet(123456)).not.toThrow();
		expect(loadExistingWallet(123456)).toBeNull();
	});

	it('after clearing, getOrCreateDeployerWallet mints a brand-new wallet', () => {
		const original = getOrCreateDeployerWallet(8453);
		clearStoredWallet(8453);
		const replacement = getOrCreateDeployerWallet(8453);
		expect(replacement.privateKey).not.toBe(original.privateKey);
		expect(replacement.address).not.toBe(original.address);
	});
});
