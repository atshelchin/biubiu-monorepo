import { join } from "path";
import { writeFile } from "fs/promises";

import type { AdapterOptions } from "./types/AdapterOptions";
import type { Adapter } from "@sveltejs/kit";

import { ADAPTER_NAME, SVELTEKIT_DIR } from "./constants/const";
import { discoverClientAssets, generateAssetImports } from "./utils/assets";
import { compileApplication } from "./utils/compile";
import { generateDockerfile } from "./utils/docker";

/**
 * Create the EXE SvelteKit adapter
 * @param {AdapterOptions} [options] - Adapter options
 * @returns {Adapter} Returns an adapter object
 */
const adapter = (options?: AdapterOptions): Adapter => {
	return {
		name: ADAPTER_NAME,
		adapt: async (builder) => {
			const adapterOptions = { out: "dist", embedStatic: true, binaryName: "app", ...options };

			// Step 1: Cleanups
			builder.rimraf(SVELTEKIT_DIR);
			builder.mkdirp(SVELTEKIT_DIR);
			builder.rimraf(adapterOptions.out);
			builder.mkdirp(adapterOptions.out);

			// Step 2: Write build outputs
			builder.writeClient(join(SVELTEKIT_DIR, "client"));
			builder.writePrerendered(join(SVELTEKIT_DIR, "prerendered"));
			builder.writeServer(join(SVELTEKIT_DIR, "server"));
			builder.rimraf(join(SVELTEKIT_DIR, "server", "_app"));

			builder.log.success("[EXE] SvelteKit build complete");

			// Step 3: Copy the server wrapper
			const path = join(import.meta.dirname, "server");
			builder.copy(path, join(SVELTEKIT_DIR, "temp-server"));
			builder.log.success("[EXE] Server copied");

			// Step 4: Generate manifest file
			const manifest = builder.generateManifest({ relativePath: "./server" });
			const manifestModule = `const manifest = ${manifest};\nexport default manifest;`;
			await writeFile(join(SVELTEKIT_DIR, "manifest.js"), manifestModule, "utf-8");
			builder.log.success("[EXE] Manifest generated");

			// Step 5: Generate assets imports
			if (adapterOptions.embedStatic) {
				const clientAssets = await discoverClientAssets(
					join(SVELTEKIT_DIR, "client"),
					join(SVELTEKIT_DIR, "prerendered")
				);
				const assetImports = generateAssetImports(clientAssets);
				await writeFile(join(SVELTEKIT_DIR, "temp-server", "assets.generated.ts"), assetImports);
			} else {
				builder.copy(join(SVELTEKIT_DIR, "client"), join(adapterOptions.out, "client"));
				builder.copy(join(SVELTEKIT_DIR, "prerendered"), join(adapterOptions.out, "prerendered"));
				await writeFile(
					join(SVELTEKIT_DIR, "temp-server", "assets.generated.ts"),
					"export const assetMap = new Map([]);"
				);
			}
			builder.log.success("[EXE] Assets generated");

			// Step 6: Compile the app
			const { binaryPath, sizeInMb } = await compileApplication(builder, adapterOptions);
			builder.log.success(`[EXE] Application compiled (${sizeInMb} MB)`);

			// Step 7: Generate Dockerfile
			if (adapterOptions.target === "linux-x64") {
				await generateDockerfile(adapterOptions);
				builder.log.success("[EXE] Dockerfile generated");
			}

			builder.log.success(`[EXE] Start the application with: ./${binaryPath}`);
		},
		supports: {
			read: () => true,
		},
	};
};

export default adapter;
