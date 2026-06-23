import { describe, it, expect } from 'vitest';
import { serializeTransaction, recoverMessageAddress, toBytes, toHex } from 'viem';
import {
	EthSignRequest,
	ETHSignature,
	DataType,
} from '@keystonehq/bc-ur-registry-eth';
import { URDecoder } from '@ngraveio/bc-ur';
import { getXFP } from './derive';
import { buildXpubExport } from './xpub';
import { parseSignRequest, signRequest } from './sign';

// passphrase "test" 24-word mnemonic (see executor.spec.ts golden vectors)
const MNEMONIC =
	'panel custom call awesome sick ready hamster wool patch client reduce clip desk pole hole gesture lion grief firm subway force job choice bargain';
const ADDR_0 = '0xc399E4e21ECE8E2a34150A17d248d0C8a77C1d06';
const HD_PATH = "44'/60'/0'/0/0";

function decodeUr(parts: string[]) {
	const d = new URDecoder();
	for (const p of parts) d.receivePart(p);
	if (!d.isComplete()) throw new Error('UR did not reassemble');
	return d.resultUR();
}

// ── Phase 2: xpub export ──────────────────────────────────────────────────────

describe('buildXpubExport (crypto-hdkey UR)', () => {
	it('produces a single crypto-hdkey UR with xpub + matching XFP', async () => {
		const out = await buildXpubExport(MNEMONIC);
		expect(out.ur.startsWith('ur:crypto-hdkey/')).toBe(true);
		expect(out.xpub.startsWith('xpub')).toBe(true);
		expect(out.path).toBe("m/44'/60'/0'");
		// XFP is the account-node fingerprint (4 bytes), and matches getXFP.
		expect(out.xfp).toMatch(/^0x[0-9a-f]{8}$/);
		expect(out.xfp).toBe(getXFP(MNEMONIC));
	});
});

// ── Phase 3: air-gapped sign round-trip ───────────────────────────────────────

describe('parseSignRequest + signRequest (eth-sign-request → eth-signature)', () => {
	it('signs a personal message and the signature recovers to the derived address', async () => {
		const xfp = getXFP(MNEMONIC).slice(2); // hex, no 0x
		const message = 'Hello air-gapped signer';
		const req = EthSignRequest.constructETHRequest(
			Buffer.from(message, 'utf8'),
			DataType.personalMessage,
			HD_PATH,
			xfp,
			undefined,
			1,
			ADDR_0,
			'biubiu',
		);

		const parsed = await parseSignRequest(req.toUR(), MNEMONIC);
		expect(parsed.dataType).toBe(3);
		expect(parsed.fingerprintMatches).toBe(true);
		expect(parsed.path).toBe('m/' + HD_PATH);
		expect(parsed.message).toBe(message);

		const fragments = await signRequest(MNEMONIC, parsed);
		expect(fragments.length).toBeGreaterThan(0);

		const ur = decodeUr(fragments);
		expect(ur.type).toBe('eth-signature');
		const sig = ETHSignature.fromCBOR(ur.cbor);
		const sigHex = toHex(sig.getSignature());
		expect(sigHex).toHaveLength(2 + 65 * 2); // r||s||v = 65 bytes

		const recovered = await recoverMessageAddress({ message, signature: sigHex });
		expect(recovered).toBe(ADDR_0);
	});

	it('rejects a request whose fingerprint does not match the mnemonic', async () => {
		const req = EthSignRequest.constructETHRequest(
			Buffer.from('x', 'utf8'),
			DataType.personalMessage,
			HD_PATH,
			'deadbeef', // wrong XFP
			undefined,
			1,
			ADDR_0,
			'biubiu',
		);
		const parsed = await parseSignRequest(req.toUR(), MNEMONIC);
		expect(parsed.fingerprintMatches).toBe(false);
	});

	it('parses and signs a typed (EIP-1559) transaction, emitting a 65-byte signature', async () => {
		const xfp = getXFP(MNEMONIC).slice(2);
		const unsigned = serializeTransaction({
			chainId: 1,
			nonce: 0,
			to: '0x1111111111111111111111111111111111111111',
			value: 0n,
			maxFeePerGas: 2_000_000_000n,
			maxPriorityFeePerGas: 1_000_000_000n,
			gas: 21000n,
			type: 'eip1559',
		});
		const req = EthSignRequest.constructETHRequest(
			Buffer.from(toBytes(unsigned)),
			DataType.typedTransaction,
			HD_PATH,
			xfp,
			undefined,
			1,
			ADDR_0,
			'biubiu',
		);

		const parsed = await parseSignRequest(req.toUR(), MNEMONIC);
		expect(parsed.dataType).toBe(4);
		expect(parsed.transaction?.to?.toLowerCase()).toBe(
			'0x1111111111111111111111111111111111111111',
		);
		expect(parsed.chainId).toBe(1);

		const fragments = await signRequest(MNEMONIC, parsed);
		const ur = decodeUr(fragments);
		expect(ur.type).toBe('eth-signature');
		const sig = ETHSignature.fromCBOR(ur.cbor);
		expect(sig.getSignature()).toHaveLength(65);
	});
});
