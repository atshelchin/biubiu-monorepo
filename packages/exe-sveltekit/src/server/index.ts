// Libs
import { file } from "bun";
import path from "node:path";
import { execPath } from "process";

// ============================================
// Parse command line arguments
// ============================================
const binaryDir = path.dirname(execPath);
// In compiled Bun binaries:
// Bun.argv[0] = actual binary path
// Bun.argv[1] = internal bundle path (/$bunfs/root/...)
// Bun.argv[2+] = actual CLI arguments
const args = Bun.argv.filter(arg => !arg.startsWith("/$bunfs/")).slice(1);

function parseArgs() {
	let envFilePath: string | null = null;
	let showHelp = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--env-file" || arg === "-e") {
			envFilePath = args[i + 1];
			i++;
		} else if (arg?.startsWith("--env-file=")) {
			envFilePath = arg.split("=")[1];
		} else if (arg === "--help" || arg === "-h") {
			showHelp = true;
		}
	}

	return { envFilePath, showHelp };
}

const { envFilePath, showHelp } = parseArgs();

if (showHelp) {
	console.log(`
Usage: ./biubiu [options]

Options:
  -e, --env-file <path>  Path to .env file (default: .env in binary directory)
  -h, --help             Show this help message

Environment variables:
  PORT                   Server port (default: 3000)
  BUN_IDLE_TIMEOUT       Idle timeout in seconds (default: 255)
`);
	process.exit(0);
}

// ============================================
// Load .env file
// ============================================
async function loadEnvFile(envPath: string) {
	const envFile = file(envPath);
	if (await envFile.exists()) {
		const content = await envFile.text();
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			// Skip empty lines and comments
			if (!trimmed || trimmed.startsWith("#")) continue;

			const eqIndex = trimmed.indexOf("=");
			if (eqIndex === -1) continue;

			const key = trimmed.slice(0, eqIndex).trim();
			let value = trimmed.slice(eqIndex + 1).trim();

			// Handle quoted values
			if ((value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))) {
				value = value.slice(1, -1);
			}

			if (key) {
				process.env[key] = value;
				Bun.env[key] = value;
			}
		}
		console.log(`Loaded .env from ${envPath}`);
		return true;
	}
	return false;
}

// Determine env file path: CLI arg > default (.env in binary dir)
const resolvedEnvPath = envFilePath
	? path.isAbsolute(envFilePath) ? envFilePath : path.join(process.cwd(), envFilePath)
	: path.join(binaryDir, ".env");

await loadEnvFile(resolvedEnvPath);

// @ts-ignore
import { assetMap } from "./assets.generated.ts";

// Types
import type { Server as ServerType } from "@sveltejs/kit";
import type { SSRManifest } from "@sveltejs/kit";

// Variables
const manifest = await getSvelteKitManifest();
const prerenderedRoutes = await getPrerenderedRoutes(manifest);
const svelteKitServer = await instantiateServer(manifest);
const staticServer = {
	respond: async (req: Request) => {
		const url = new URL(req.url);
		const headers = new Headers({
			"Cache-Control": "max-age=0, must-revalidate",
		});

		if (prerenderedRoutes.includes(url.pathname)) {
			const htmlPath = url.pathname === "/" ? "/index.html" : `${url.pathname}.html`;
			const htmlFile = await getFile(htmlPath);
			if (htmlFile) {
				headers.set("Content-Type", htmlFile.type || "application/octet-stream");
				return new Response(htmlFile, {
					headers,
				});
			}
		}

		const assetFile = await getFile(url.pathname);
		if (assetFile) {
			if (url.pathname.startsWith(`/${manifest.appDir}/immutable/`))
				headers.set("Cache-Control", "public, max-age=31536000, immutable");
			headers.set("Content-Type", assetFile.type || "application/octet-stream");
			return new Response(assetFile, {
				headers,
			});
		}

		return null;
	},
};

async function getSvelteKitManifest() {
	// @ts-ignore
	const manifestModule = await import("../manifest.js");
	const manifest = manifestModule.default;
	return manifest as SSRManifest;
}

async function getPrerenderedRoutes(manifest: SSRManifest) {
	return Array.from(manifest._.prerendered_routes);
}

async function instantiateServer(manifest: SSRManifest) {
	const serverModule = await import("../server/index.js");
	const { Server } = serverModule as { Server: new (manifest: SSRManifest) => ServerType };

	const server = new Server(manifest);
	await server.init({ env: Bun.env as Record<string, string> });

	return server;
}

async function getFile(pathname: string) {
	let decodedPathname: string;
	try {
		decodedPathname = decodeURIComponent(pathname);
		// Prevent path traversal
		if (decodedPathname.includes("../") || decodedPathname.includes("..\\")) return null;
	} catch {
		decodedPathname = pathname;
	}

	// Search in embedded assetMap
	if (assetMap.has(decodedPathname)) return file(assetMap.get(decodedPathname));

	// Search on disk
	const staticBuildDirs = ["client", "prerendered"];

	for (const dir of staticBuildDirs) {
		const externalFile = file(path.join(binaryDir, dir, decodedPathname));
		if (await externalFile.exists()) return externalFile;
	}
}

async function gracefulShutdown(reason: 'SIGINT' | 'SIGTERM') {
	console.info('Stopping server...');
	// @ts-expect-error custom events cannot be typed
	process.emit('sveltekit:shutdown', reason);
	await server.stop(true);
	console.info('Stopped server');

	process.removeListener('SIGINT', gracefulShutdown);
	process.removeListener('SIGTERM', gracefulShutdown);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

const server = Bun.serve({
	port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
	hostname: "0.0.0.0",
	idleTimeout: process.env.BUN_IDLE_TIMEOUT ? parseInt(process.env.BUN_IDLE_TIMEOUT) : 255,
	async fetch(req: Request, bunServer: Bun.Server) {
		// Handle static assets
		const staticResponse = await staticServer.respond(req);
		if (staticResponse) return staticResponse;

		// Handle other routes (SSR, API endpoints, etc.)
		return await svelteKitServer.respond(req, {
			getClientAddress() {
				return bunServer.requestIP(req)?.address || "127.0.0.1";
			},
		});
	},
	error() {
		return Response.json(
			{
				code: 500,
				message: "Something went wrong",
			},
			{ status: 500 }
		);
	},
});

console.log(`Listening on http://localhost:${server.port}`);
