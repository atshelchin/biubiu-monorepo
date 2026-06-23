/**
 * Lazy loader for the UR / Keystone libraries.
 *
 * `@ngraveio/bc-ur` and `@keystonehq/bc-ur-registry-eth` (and their CJS deps:
 * readable-stream, assert, cbor-sync…) assume Node globals: `Buffer`, `process`
 * and `global`. Rather than polyfill app-wide (shared vite.config), we:
 *   1. dynamic-import the libs so they code-split out of the main bundle, and
 *   2. install the globals *before* that import resolves, scoping the polyfill
 *      to this feature (it only runs when xpub/sign is actually used).
 *
 * In Node (tests) these are already defined, so ensurePolyfills() is a no-op.
 */
let polyfillsReady: Promise<void> | null = null;

function ensurePolyfills(): Promise<void> {
	if (polyfillsReady) return polyfillsReady;
	polyfillsReady = (async () => {
		const g = globalThis as Record<string, unknown>;
		if (typeof g.global === 'undefined') g.global = globalThis;
		if (typeof g.process === 'undefined') {
			g.process = {
				env: { NODE_ENV: 'production' },
				browser: true,
				version: '',
				versions: {},
				nextTick: (cb: (...a: unknown[]) => void, ...args: unknown[]) =>
					queueMicrotask(() => cb(...args)),
			};
		}
		if (typeof g.Buffer === 'undefined') {
			const mod = await import('buffer');
			g.Buffer = mod.Buffer;
		}
	})();
	return polyfillsReady;
}

export async function loadBcUr() {
	await ensurePolyfills();
	return import('@ngraveio/bc-ur');
}

export async function loadKeystoneEth() {
	await ensurePolyfills();
	return import('@keystonehq/bc-ur-registry-eth');
}
