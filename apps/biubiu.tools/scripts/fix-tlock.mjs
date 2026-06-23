// Workaround for a dual-version @noble conflict.
//
// `tlock-js` → `drand-client` import `@noble/hashes/sha256` (a 1.x subpath). The monorepo also
// needs @noble/hashes@2.x (for @scure/bip39, @shazow/whatsabi), which bun hoists as the shared
// version. Vite resolves drand-client's import to that hoisted 2.x — which lacks `/sha256` — so
// capsule (time-lock) crypto throws. bun `overrides` don't fix vite's resolution.
//
// Fix: make node_modules/tlock-js a REAL directory (not the .bun symlink) and nest the 1.x
// @noble + tlock's other runtime deps under it, so Node/Vite resolve the correct versions for
// tlock-js's subtree. Sources everything from the local .bun store, so it's portable.
//
// Runs on postinstall. Idempotent. No-op (with a warning) if the .bun store isn't found.
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, cpSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const appNm = join(appDir, 'node_modules');
const bunStore = findBunStore(appNm);

if (!bunStore) {
	console.warn('[fix-tlock] .bun store not found — skipping (tlock-js capsule mode may not resolve @noble correctly)');
	process.exit(0);
}

// Find a package dir in the .bun store: e.g. pkg("@noble/hashes", "1.") → .../@noble+hashes@1.8.0/node_modules/@noble/hashes
function pkg(name, versionPrefix = '') {
	const flat = name.replace('/', '+');
	const match = readdirSync(bunStore)
		.filter((d) => d.startsWith(`${flat}@${versionPrefix}`))
		.sort()
		.pop();
	if (!match) return null;
	const p = join(bunStore, match, 'node_modules', name);
	return existsSync(p) ? p : null;
}

const tlockSrc = pkg('tlock-js');
if (!tlockSrc) {
	console.warn('[fix-tlock] tlock-js not in .bun store — skipping');
	process.exit(0);
}

// 1) Replace node_modules/tlock-js (symlink) with a real-dir copy.
const tlockDest = join(appNm, 'tlock-js');
if (existsSync(tlockDest) && lstatSync(tlockDest).isSymbolicLink()) rmSync(tlockDest);
else if (existsSync(tlockDest) && realpathSync(tlockDest) !== realpathSync(tlockSrc)) rmSync(tlockDest, { recursive: true, force: true });
if (!existsSync(tlockDest)) cpSync(tlockSrc, tlockDest, { recursive: true, dereference: true });

// 2) Nest tlock-js's runtime deps at the correct (1.x) versions.
const nested = join(tlockDest, 'node_modules');
mkdirSync(nested, { recursive: true });
const deps = [
	['@noble/hashes', '1.'],
	['@noble/curves', '1.'],
	['@stablelib/chacha20poly1305', ''],
	['@stablelib/aead', ''],
	['@stablelib/binary', ''],
	['@stablelib/wipe', ''],
	['@stablelib/constant-time', ''],
	['@stablelib/poly1305', ''],
	['@stablelib/chacha', ''],
	['@stablelib/int', ''],
	['drand-client', ''],
	['buffer', ''],
	['base64-js', ''],
	['ieee754', ''],
	['debug', ''],
	['ms', '']
];
let copied = 0;
for (const [name, vp] of deps) {
	const src = pkg(name, vp);
	if (!src) continue;
	const dest = join(nested, name);
	mkdirSync(dirname(dest), { recursive: true });
	if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
	cpSync(src, dest, { recursive: true, dereference: true });
	copied++;
}
console.log(`[fix-tlock] tlock-js pinned to nested @noble 1.x (${copied} deps nested).`);

function findBunStore(startNm) {
	// .bun lives at the workspace root's node_modules; walk up.
	let dir = startNm;
	for (let i = 0; i < 5; i++) {
		const candidate = join(dir, '.bun');
		if (existsSync(candidate)) return candidate;
		const parentNm = join(dir, '..', '..', 'node_modules');
		if (parentNm === dir) break;
		dir = parentNm;
	}
	return null;
}
