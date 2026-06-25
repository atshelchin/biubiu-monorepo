// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
/// <reference types="@mcp-b/webmcp-types" />
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			locale: string;
		}
		interface PageData {
			locale: string;
			messages: Record<string, string>;
		}
		// interface PageState {}
		// interface Platform {}
	}

	/** Injected by vite `define` (vite.config.ts) — the short git commit hash. */
	const __COMMIT_HASH__: string;

	/** Experimental Barcode Detection API (not yet in TS DOM lib). */
	class BarcodeDetector {
		constructor(options?: { formats?: string[] });
		detect(source: CanvasImageSource | Blob): Promise<Array<{ rawValue: string }>>;
	}
}

export {};
