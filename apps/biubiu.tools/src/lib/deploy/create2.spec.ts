import { describe, it, expect } from 'vitest';
import { keccak256, concat, getAddress, type Hex } from 'viem';
import { CREATE2_PROXY, buildInitCode, predictCreate2Address, isValidSalt } from './create2.js';

// ── Fixtures ──
const BYTECODE: Hex = '0x6080604052';
const SALT_ZERO: Hex = `0x${'00'.repeat(32)}`; // 32 bytes -> 66 chars
const SALT_ONE: Hex = `0x${'00'.repeat(31)}01`;
const DAI = '0x6b175474e89094c44da98b954eedeac495271d0f';

describe('CREATE2_PROXY', () => {
	it('is the canonical Arachnid deterministic-deployment-proxy address', () => {
		// If this constant ever drifts, every predicted address silently changes.
		expect(CREATE2_PROXY).toBe('0x4e59b44847b379578588920cA78FbF26c0B4956C');
	});
});

describe('predictCreate2Address — happy path', () => {
	it('predicts the checksummed address for a zero salt + bytecode', () => {
		expect(predictCreate2Address(SALT_ZERO, BYTECODE)).toBe(
			'0x0E41aa54D633ee06Dc2EE16beEB53478281b096C'
		);
	});

	it('matches the EIP-1014 formula keccak256(0xff||proxy||salt||keccak(initcode))[12:]', () => {
		// Independently recompute the expected address using viem primitives,
		// proving predictCreate2Address implements the standard CREATE2 derivation.
		const initCodeHash = keccak256(BYTECODE);
		const hash = keccak256(concat(['0xff', CREATE2_PROXY, SALT_ZERO, initCodeHash]));
		const expected = getAddress(`0x${hash.slice(26)}`);
		expect(predictCreate2Address(SALT_ZERO, BYTECODE)).toBe(expected);
	});

	it('returns a checksummed (mixed-case) address, not lowercase', () => {
		const addr = predictCreate2Address(SALT_ZERO, BYTECODE)!;
		expect(addr).toBe(getAddress(addr)); // already checksummed -> idempotent
		expect(addr).not.toBe(addr.toLowerCase()); // proves checksum casing applied
	});
});

describe('predictCreate2Address — determinism', () => {
	it('is deterministic: identical inputs always yield the identical address', () => {
		const a = predictCreate2Address(SALT_ONE, BYTECODE);
		const b = predictCreate2Address(SALT_ONE, BYTECODE);
		expect(a).toBe(b);
		expect(a).toBe('0x05E96fA12b872ff96D73a5a6DDED5010c406712C');
	});

	it('changing only the salt changes the predicted address', () => {
		const withZero = predictCreate2Address(SALT_ZERO, BYTECODE);
		const withOne = predictCreate2Address(SALT_ONE, BYTECODE);
		expect(withZero).not.toBe(withOne);
	});

	it('changing only the initcode changes the predicted address', () => {
		const a = predictCreate2Address(SALT_ZERO, BYTECODE);
		const b = predictCreate2Address(SALT_ZERO, '0x6080604053'); // 1 byte differs
		expect(a).not.toBe(b);
	});
});

describe('predictCreate2Address — invalid inputs return null', () => {
	it('rejects a salt shorter than 32 bytes', () => {
		expect(predictCreate2Address('0x00', BYTECODE)).toBeNull();
	});

	it('rejects an odd-length (65-char) salt', () => {
		expect(predictCreate2Address(`0x${'00'.repeat(31)}0` as Hex, BYTECODE)).toBeNull();
	});

	it('rejects a salt longer than 32 bytes (33 bytes / 68 chars)', () => {
		expect(predictCreate2Address(`0x${'00'.repeat(33)}` as Hex, BYTECODE)).toBeNull();
	});

	it('rejects empty initcode "0x"', () => {
		expect(predictCreate2Address(SALT_ZERO, '0x')).toBeNull();
	});

	it('rejects falsy/empty-string initcode', () => {
		expect(predictCreate2Address(SALT_ZERO, '' as Hex)).toBeNull();
	});

	it('accepts a salt with mixed-case hex as long as it is 32 bytes', () => {
		const salt = `0xAbCdEf${'00'.repeat(28)}FF` as Hex; // 6 + 56 + 2 = 64 hex = 32 bytes
		expect(salt.length).toBe(66);
		expect(predictCreate2Address(salt, BYTECODE)).toBe(
			'0x29F3e4FbF048Fa2f5677Ec04D0b1DE8C65910be9'
		);
	});

	// REGRESSION GUARD (P2): a salt with the correct LENGTH (66) but invalid HEX
	// must be rejected. keccak256/concat do NOT throw on non-hex input, so a
	// length-only check (salt.length === 66) silently produced a confident-but-
	// WRONG predicted address and corrupt deploy calldata. (Fixed via isValidSalt.)
	it('rejects a 66-char salt that contains NON-HEX characters (returns null)', () => {
		const badSalt = `0x${'ZZ'}${'00'.repeat(31)}` as Hex; // 66 chars, not hex
		expect(badSalt.length).toBe(66);
		expect(predictCreate2Address(badSalt, BYTECODE)).toBeNull();
	});

	it('rejects a 66-char salt with a stray non-hex char in the middle', () => {
		const badSalt = `0x${'00'.repeat(15)}g0${'00'.repeat(16)}` as Hex; // 30+2+32=64 hex, 'g' not hex
		expect(badSalt.length).toBe(66);
		expect(predictCreate2Address(badSalt, BYTECODE)).toBeNull();
	});

	it('rejects a salt missing the 0x prefix even when 66 chars total', () => {
		const noPrefix = `${'a'.repeat(66)}` as Hex; // 66 chars but no 0x
		expect(noPrefix.length).toBe(66);
		expect(predictCreate2Address(noPrefix, BYTECODE)).toBeNull();
	});
});

describe('isValidSalt — strict 0x + 64-hex guard', () => {
	it('accepts a canonical zero salt', () => {
		expect(isValidSalt(`0x${'00'.repeat(32)}`)).toBe(true);
	});

	it('accepts mixed-case hex', () => {
		expect(isValidSalt(`0x${'aB'.repeat(32)}`)).toBe(true);
	});

	it('rejects valid length but non-hex content', () => {
		expect(isValidSalt(`0x${'ZZ'}${'00'.repeat(31)}`)).toBe(false);
	});

	it('rejects a salt without the 0x prefix', () => {
		expect(isValidSalt('00'.repeat(32))).toBe(false);
	});

	it('rejects too-short and too-long salts', () => {
		expect(isValidSalt('0x00')).toBe(false);
		expect(isValidSalt(`0x${'00'.repeat(33)}`)).toBe(false);
	});

	it('rejects the empty string', () => {
		expect(isValidSalt('')).toBe(false);
	});
});

describe('buildInitCode — no constructor', () => {
	it('returns the bytecode unchanged when there are no constructor inputs', () => {
		expect(buildInitCode(BYTECODE, [], [])).toBe(BYTECODE);
	});
});

describe('buildInitCode — scalar constructor args', () => {
	it('ABI-encodes and appends a uint256 arg', () => {
		expect(buildInitCode(BYTECODE, [{ name: 'x', type: 'uint256' }], ['42'])).toBe(
			'0x6080604052000000000000000000000000000000000000000000000000000000000000002a'
		);
	});

	it('encodes an address arg (left-padded to 32 bytes)', () => {
		expect(buildInitCode(BYTECODE, [{ name: 'a', type: 'address' }], [DAI])).toBe(
			'0x60806040520000000000000000000000006b175474e89094c44da98b954eedeac495271d0f'
		);
	});

	it('treats "1" as a true bool', () => {
		expect(buildInitCode(BYTECODE, [{ name: 'b', type: 'bool' }], ['1'])).toBe(
			'0x60806040520000000000000000000000000000000000000000000000000000000000000001'
		);
	});

	it('treats "false" as a false bool', () => {
		expect(buildInitCode(BYTECODE, [{ name: 'b', type: 'bool' }], ['false'])).toBe(
			'0x60806040520000000000000000000000000000000000000000000000000000000000000000'
		);
	});

	it('treats any non-"true"/"1" string as a false bool', () => {
		expect(buildInitCode(BYTECODE, [{ name: 'b', type: 'bool' }], ['xyz'])).toBe(
			'0x60806040520000000000000000000000000000000000000000000000000000000000000000'
		);
	});

	it('encodes dynamic bytes with the standard offset+length+data layout', () => {
		expect(buildInitCode(BYTECODE, [{ name: 'd', type: 'bytes' }], ['0x1234'])).toBe(
			'0x6080604052' +
				'0000000000000000000000000000000000000000000000000000000000000020' +
				'0000000000000000000000000000000000000000000000000000000000000002' +
				'1234000000000000000000000000000000000000000000000000000000000000'
		);
	});

	it('treats a missing scalar arg as "" -> BigInt("") -> 0 for uint', () => {
		// argValues[i] ?? '' and BigInt('') === 0n
		expect(buildInitCode(BYTECODE, [{ name: 'x', type: 'uint256' }], [])).toBe(
			'0x60806040520000000000000000000000000000000000000000000000000000000000000000'
		);
	});
});

describe('buildInitCode — array constructor args (regression: numeric arrays)', () => {
	// REGRESSION GUARD: `uint256[]`.startsWith('uint') is true, so the array
	// branch MUST be checked before the scalar branch — otherwise BigInt('[1,2,3]')
	// throws and buildInitCode silently returns null. (Fixed in create2.ts.)
	it('encodes a uint256[] from a JSON array (does NOT return null)', () => {
		const out = buildInitCode(BYTECODE, [{ name: 'a', type: 'uint256[]' }], ['[1,2,3]']);
		expect(out).not.toBeNull();
		expect(out).toBe(
			'0x6080604052' +
				'0000000000000000000000000000000000000000000000000000000000000020' +
				'0000000000000000000000000000000000000000000000000000000000000003' +
				'0000000000000000000000000000000000000000000000000000000000000001' +
				'0000000000000000000000000000000000000000000000000000000000000002' +
				'0000000000000000000000000000000000000000000000000000000000000003'
		);
	});

	it('encodes a signed int8[] including negative values (twos-complement)', () => {
		const out = buildInitCode(BYTECODE, [{ name: 'a', type: 'int8[]' }], ['[-1,2,3]']);
		expect(out).toContain(
			'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
		); // -1 as int8 word
	});

	it('encodes an address[] from a JSON array of strings', () => {
		const out = buildInitCode(BYTECODE, [{ name: 'a', type: 'address[]' }], [`["${DAI}"]`]);
		expect(out).toBe(
			'0x6080604052' +
				'0000000000000000000000000000000000000000000000000000000000000020' +
				'0000000000000000000000000000000000000000000000000000000000000001' +
				'0000000000000000000000006b175474e89094c44da98b954eedeac495271d0f'
		);
	});
});

describe('buildInitCode — invalid args return null (encoding errors swallowed)', () => {
	it('returns null for a non-numeric uint value', () => {
		expect(buildInitCode(BYTECODE, [{ name: 'x', type: 'uint256' }], ['notanumber'])).toBeNull();
	});

	it('returns null for a malformed address (wrong length)', () => {
		expect(buildInitCode(BYTECODE, [{ name: 'a', type: 'address' }], ['0x1234'])).toBeNull();
	});

	it('returns null when an array value is not valid JSON', () => {
		expect(buildInitCode(BYTECODE, [{ name: 'a', type: 'uint256[]' }], ['123'])).toBeNull();
	});

	it('returns null when an array arg is missing (JSON.parse("") throws)', () => {
		expect(buildInitCode(BYTECODE, [{ name: 'a', type: 'uint256[]' }], [])).toBeNull();
	});

	it('returns null for a too-short fixed bytes32 value (length enforced)', () => {
		expect(buildInitCode(BYTECODE, [{ name: 'd', type: 'bytes32' }], ['0x12'])).toBeNull();
	});

	it('returns null for a non-hex fixed bytes32 value', () => {
		expect(buildInitCode(BYTECODE, [{ name: 'd', type: 'bytes32' }], ['nothex'])).toBeNull();
	});
});

describe('buildInitCode + predictCreate2Address — combined flow', () => {
	it('predicts a stable address for a constructor-bearing initcode', () => {
		const salt: Hex = `0x${'00'.repeat(31)}07`;
		const initCode = buildInitCode(BYTECODE, [{ name: 'x', type: 'uint256' }], ['42'])!;
		expect(initCode).toBe(
			'0x6080604052000000000000000000000000000000000000000000000000000000000000002a'
		);
		expect(predictCreate2Address(salt, initCode)).toBe(
			'0x3012BF0F57D9DD68361848D77d3661F4dEB99005'
		);
	});
});
