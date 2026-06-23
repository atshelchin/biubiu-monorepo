import { describe, it, expect } from 'vitest';
import { passphraseToMnemonic } from './crypto/mnemonic';
import { createEvmDeriver, deriveEvmWallet, evmPath } from './crypto/derive';
import { validate, formatOutput, executor, type Input } from './executor';

// ─────────────────────────────────────────────────────────────────────────────
// Golden vectors — passphrase "test".
//
// These are the SAME outputs the legacy "brainwallet" tool produces. The
// mnemonics were cross-validated against bitcoinjs `bip39@3.1.0` (the legacy
// lib) and are byte-identical to @scure/bip39. Addresses follow deterministically
// from standard BIP32 derivation. If any of these change, the algorithm has
// drifted and existing wallets would become unrecoverable — treat as a hard fail.
// ─────────────────────────────────────────────────────────────────────────────

const PASS = 'test';
const MNEMONIC_24 =
	'panel custom call awesome sick ready hamster wool patch client reduce clip desk pole hole gesture lion grief firm subway force job choice bargain';
const MNEMONIC_12 = 'another kitten viable middle brush rigid clock six lobster couple unfold unknown';

const VEC = {
	bip44_0: { path: "m/44'/60'/0'/0/0", address: '0xc399E4e21ECE8E2a34150A17d248d0C8a77C1d06' },
	bip44_1: { path: "m/44'/60'/0'/0/1", address: '0x110efe73740AB7F42BC16652497B85b533C5ae7C' },
	ledger_1: { path: "m/44'/60'/1'/0/0", address: '0xA50846e3CCF8b72ab304B3E169425F9678F9524b' },
	legacy_0: { path: "m/44'/60'/0'/0", address: '0x31e990a63E3D2122186891d36c19d9d13F15a5Fa' },
	legacy_1: { path: "m/44'/60'/0'/1", address: '0x5B2fd3952fe59Ff10380481AC6c092BefF7e1F9b' },
};
const PK_24_BIP44_0 = '0x37c8d39afd2f74c41af24bd7c26378f3a043383db1d3c23a8ca3ee65b4c40409';
const ADDR_12_BIP44_0 = '0x6D9ec9eba0f9281Dc50E0014ACd8eEc6A7422857';

// ── mnemonic ─────────────────────────────────────────────────────────────────

describe('passphraseToMnemonic (legacy-compatible)', () => {
	it('24 words via SHA-256 entropy', () => {
		expect(passphraseToMnemonic(PASS, 24)).toBe(MNEMONIC_24);
	});

	it('12 words via MD5 entropy', () => {
		expect(passphraseToMnemonic(PASS, 12)).toBe(MNEMONIC_12);
	});

	it('trims surrounding whitespace before hashing', () => {
		expect(passphraseToMnemonic('  test  ', 24)).toBe(MNEMONIC_24);
		expect(passphraseToMnemonic('\ttest\n', 12)).toBe(MNEMONIC_12);
	});

	it('different passphrases give different mnemonics', () => {
		expect(passphraseToMnemonic('test', 24)).not.toBe(passphraseToMnemonic('test2', 24));
	});
});

// ── EVM path + derivation ─────────────────────────────────────────────────────

describe('evmPath', () => {
	it('bip44 (default)', () => {
		expect(evmPath('bip44', 0)).toBe("m/44'/60'/0'/0/0");
		expect(evmPath('anything-else', 7)).toBe("m/44'/60'/0'/0/7");
	});
	it('ledgerlive', () => {
		expect(evmPath('ledgerlive', 1)).toBe("m/44'/60'/1'/0/0");
	});
	it('legacy', () => {
		expect(evmPath('legacy', 1)).toBe("m/44'/60'/0'/1");
	});
});

describe('createEvmDeriver — byte-identical to legacy tool', () => {
	const d = createEvmDeriver(MNEMONIC_24);

	it('bip44 #0 (address + path + private key)', () => {
		const w = d.derive('bip44', 0);
		expect(w.path).toBe(VEC.bip44_0.path);
		expect(w.address).toBe(VEC.bip44_0.address);
		expect(w.privateKey).toBe(PK_24_BIP44_0);
	});

	it('bip44 #1', () => {
		expect(d.derive('bip44', 1).address).toBe(VEC.bip44_1.address);
	});

	it('ledgerlive #1', () => {
		const w = d.derive('ledgerlive', 1);
		expect(w.path).toBe(VEC.ledger_1.path);
		expect(w.address).toBe(VEC.ledger_1.address);
	});

	it('legacy #0 and #1 (non-standard path depth)', () => {
		expect(d.derive('legacy', 0).address).toBe(VEC.legacy_0.address);
		expect(d.derive('legacy', 1).address).toBe(VEC.legacy_1.address);
	});

	it('12-word mnemonic derives its own distinct address', () => {
		expect(deriveEvmWallet(MNEMONIC_12, 'bip44', 0).address).toBe(ADDR_12_BIP44_0);
	});
});

// ── executor ──────────────────────────────────────────────────────────────────

function mockCtx() {
	return {
		info: () => {},
		progress: () => {},
		// eslint-disable-next-line require-yield
		*select() {
			return '';
		},
		// eslint-disable-next-line require-yield
		*confirm() {
			return false;
		},
	};
}

async function drive(input: Input) {
	// Input is the pre-parse shape (defaults optional); executor wants the parsed
	// shape. Cast at the boundary — call sites are still checked against Input.
	const gen = executor(input as never, mockCtx() as never);
	let r = await gen.next();
	while (!r.done) r = await gen.next(undefined);
	return r.value;
}

describe('validate', () => {
	it('rejects empty passphrase', () => {
		expect(() => validate({ passphrase: '   ' })).toThrow('Passphrase must not be empty');
	});
	it('defaults wordsLen=24, chain=evm, hdPath=bip44, start=0, count=1', () => {
		const v = validate({ passphrase: PASS });
		expect(v).toMatchObject({ wordsLen: 24, chain: 'evm', hdPathType: 'bip44', start: 0, count: 1 });
	});
	it('coerces non-12 wordsLen to 24', () => {
		expect(validate({ passphrase: PASS, wordsLen: 12 }).wordsLen).toBe(12);
		expect(validate({ passphrase: PASS, wordsLen: 24 }).wordsLen).toBe(24);
	});
	it('rejects invalid hd path', () => {
		expect(() => validate({ passphrase: PASS, hdPathType: 'nope' })).toThrow('Invalid HD path');
	});
	it('rejects count over the cap', () => {
		expect(() => validate({ passphrase: PASS, count: 1_000_000 })).toThrow('exceed');
	});
});

describe('executor integration', () => {
	it('derives a single wallet matching the golden vector', async () => {
		const out = await drive({ passphrase: PASS });
		expect(out.mnemonic).toBe(MNEMONIC_24);
		expect(out.wallets).toHaveLength(1);
		expect(out.wallets[0]).toMatchObject(VEC.bip44_0);
		expect(out.stats.count).toBe(1);
	});

	it('batch-derives a sequential range from `start`', async () => {
		const out = await drive({ passphrase: PASS, start: 0, count: 2 });
		expect(out.wallets.map((w) => w.address)).toEqual([VEC.bip44_0.address, VEC.bip44_1.address]);
	});

	it('honours wordsLen=12', async () => {
		const out = await drive({ passphrase: PASS, wordsLen: 12, count: 1 });
		expect(out.mnemonic).toBe(MNEMONIC_12);
		expect(out.wallets[0].address).toBe(ADDR_12_BIP44_0);
	});

	it('formatOutput strips to the output schema shape', () => {
		const out = formatOutput({
			mnemonic: MNEMONIC_24,
			wallets: [{ index: 0, ...VEC.bip44_0, privateKey: PK_24_BIP44_0 }],
			duration: 5,
		});
		expect(out.stats).toEqual({ count: 1, duration: 5 });
		expect(out.wallets[0]).toEqual({ index: 0, ...VEC.bip44_0, privateKey: PK_24_BIP44_0 });
	});
});
