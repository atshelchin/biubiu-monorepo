/**
 * Time-lock (capsule) crypto for 《致未来 · Forever》 — drand quicknet + tlock-js.
 *
 * Layering (verified in Phase 0b): tlock OUTSIDE, AES INSIDE. The on-chain payload is
 * `tlock_encrypt(round, AES-GCM(DEK, text))`. Before the round's beacon exists, no one —
 * not even the author — can run the outer decryption; after it unlocks, only the author's DEK
 * decrypts the inner layer. So a capsule is "to your future self, sealed until the date."
 *
 * tlock-js pulls heavy BLS pairing crypto, so it's dynamically imported only when a capsule is
 * actually created or opened (lazy chunk; never on the server).
 */
import { concat } from './core.js';

/** drand quicknet — the timelock-capable beacon. Pinned constants (asserted against /info). */
export const QUICKNET_HASH = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971';
/** beaconScheme stored on-chain (bytes32) so future clients know which beacon to use. */
export const QUICKNET_BEACON_SCHEME = `0x${QUICKNET_HASH}` as const;
const QUICKNET_GENESIS = 1_692_803_367;
const QUICKNET_PERIOD = 3; // seconds
const QUICKNET_URL = `https://api.drand.sh/${QUICKNET_HASH}`;
const CAPSULE_VERSION = 1;

/** The drand round whose beacon is published at-or-after `unixSec`. */
export function roundForTime(unixSec: number): number {
	return Math.max(1, Math.floor((unixSec - QUICKNET_GENESIS) / QUICKNET_PERIOD) + 1);
}

/** The approximate unix time at which `round` becomes available. */
export function timeForRound(round: number): number {
	return QUICKNET_GENESIS + (round - 1) * QUICKNET_PERIOD;
}

/**
 * drand quicknet group public key (G2, 96 bytes). Pinned alongside the chain hash so a
 * hostile or MITM'd api.drand.sh cannot feed a forged beacon to open a capsule early.
 * Verified against the authoritative /info (hash, genesis, period all cross-check).
 */
const QUICKNET_PUBLIC_KEY =
	'83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a';

async function makeClient() {
	const tlock = await import('tlock-js');
	const options = {
		disableBeaconVerification: false,
		noCache: false,
		chainVerificationParams: { chainHash: QUICKNET_HASH, publicKey: QUICKNET_PUBLIC_KEY }
	};
	const chain = new tlock.HttpCachingChain(QUICKNET_URL, options);
	return { tlock, client: new tlock.HttpChainClient(chain, options) };
}

/** Wrap an AES blob so it can only be opened at/after `round`. Returns versioned bytes. */
export async function timelockSeal(aesBlob: Uint8Array, round: number): Promise<Uint8Array> {
	const { tlock, client } = await makeClient();
	const armored = await tlock.timelockEncrypt(round, tlock.Buffer.from(aesBlob), client);
	const body = new TextEncoder().encode(armored);
	return concat(new Uint8Array([CAPSULE_VERSION]), body);
}

/** Open a capsule (after unlock) → the inner AES blob. Throws if it's still time-locked. */
export async function timelockOpen(capsule: Uint8Array): Promise<Uint8Array> {
	if (capsule[0] !== CAPSULE_VERSION) throw new Error(`unsupported capsule version ${capsule[0]}`);
	const armored = new TextDecoder().decode(capsule.slice(1));
	const { tlock, client } = await makeClient();
	const out = await tlock.timelockDecrypt(armored, client);
	return new Uint8Array(out);
}
