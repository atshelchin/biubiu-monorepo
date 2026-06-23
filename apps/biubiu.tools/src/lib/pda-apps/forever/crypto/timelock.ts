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

async function makeClient() {
	const tlock = await import('tlock-js');
	// tlock-js 0.9 has no `defaultChainOptions` export; the constructors apply sane defaults
	// (these are the options the verified Phase 0 spike ran with).
	const chain = new tlock.HttpCachingChain(QUICKNET_URL);
	return { tlock, client: new tlock.HttpChainClient(chain) };
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
