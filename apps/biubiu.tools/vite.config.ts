import devtoolsJson from 'vite-plugin-devtools-json';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { i18nPlugin } from '@shelchin/i18n-sveltekit/vite';
import { execSync } from 'child_process';
// The monorepo resolves two vite versions (6 and 7); sveltekit()/i18nPlugin()
// return Plugin objects typed against vite 6, which are nominally — not
// structurally — incompatible with this app's vite 7 `plugins` type. The plugins
// are runtime-compatible (the build passes), so cast the array to vite 7's type.
import type { PluginOption } from 'vite';

function getGitCommitHash(): string {
	try {
		return execSync('git rev-parse --short HEAD').toString().trim();
	} catch {
		return 'unknown';
	}
}

export default defineConfig({
	define: {
		__COMMIT_HASH__: JSON.stringify(getGitCommitHash())
	},
	server: {
		// Allow all hosts (for Cloudflare Tunnel, ngrok, etc.)
		allowedHosts: true,
	},
	plugins: [
		// Polyfill the Node built-in MODULES that the air-gapped QR libs
		// (@ngraveio/bc-ur, @keystonehq/bc-ur-registry-eth and their CJS deps)
		// import in the browser. globals are intentionally OFF — injecting
		// Buffer/process/global app-wide rewrites unrelated workspace packages
		// (e.g. proeditor-sveltekit) and breaks their SSR. Instead the bc-ur loader
		// (crypto/ur.ts) sets those globals lazily, scoped to when xpub/sign runs.
		nodePolyfills({
			include: [
				'buffer',
				'process',
				'util',
				'stream',
				'events',
				'assert',
				'path',
				'crypto',
				'string_decoder'
			],
			globals: { Buffer: false, global: false, process: false }
		}),
		sveltekit(),
		devtoolsJson(),
		i18nPlugin({
			messagesDir: 'src/messages'
		}),
	] as PluginOption[],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
