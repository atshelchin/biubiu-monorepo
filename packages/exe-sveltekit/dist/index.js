// src/index.ts
import { join as join4 } from "path";
import { writeFile as writeFile2 } from "fs/promises";

// src/constants/const.ts
var ADAPTER_NAME = "exe-sveltekit";
var SVELTEKIT_DIR = `.svelte-kit/${ADAPTER_NAME}`;
var TARGETS_MAP = {
  "linux-x64": "bun-linux-x64",
  "linux-x64-baseline": "bun-linux-x64-baseline",
  "macos-arm64": "bun-macos-arm64",
  "windows-x64": "bun-windows-x64",
  "windows-x64-baseline": "bun-windows-x64-baseline",
  "darwin-x64": "bun-darwin-x64",
  "darwin-arm64": "bun-darwin-arm64",
  "linux-x64-musl": "bun-linux-x64-musl",
  "linux-arm64-musl": "bun-linux-arm64-musl"
};

// src/utils/assets.ts
import { readdir, stat } from "fs/promises";
import { join, relative, parse, normalize } from "path";
import { createHash } from "crypto";
function generateVarName(filePath) {
  const { name, ext } = parse(filePath);
  let cleanName = name.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (/^[0-9]/.test(cleanName))
    cleanName = `asset_${cleanName}`;
  if (!cleanName)
    cleanName = "asset";
  const normalizedPath = normalize(filePath).replace(/\\/g, "/");
  const pathHash = createHash("md5").update(normalizedPath).digest("hex").slice(0, 4);
  const extSuffix = ext.replace(".", "").toUpperCase();
  return `${cleanName}_${extSuffix}_${pathHash}`;
}
async function discoverClientAssets(clientDir, prerenderedDir) {
  const assets = [];
  async function walkDirectory(dir, isPrerendered) {
    if (!await stat(dir).catch(() => false))
      return;
    const entries = await readdir(dir);
    const entryStats = await Promise.all(entries.map(async (entry) => {
      const fullPath = join(dir, entry);
      const stats = await stat(fullPath);
      return { entry, fullPath, stats };
    }));
    const dirPromises = [];
    for (const { fullPath, stats } of entryStats) {
      if (stats.isDirectory()) {
        dirPromises.push(walkDirectory(fullPath, isPrerendered));
      } else {
        const routePath = "/" + relative(isPrerendered ? prerenderedDir : clientDir, fullPath).replace(/\\/g, "/");
        const varName = generateVarName(routePath);
        assets.push({
          filePath: fullPath,
          routePath,
          varName,
          isPrerendered
        });
      }
    }
    await Promise.all(dirPromises);
  }
  await Promise.all([walkDirectory(clientDir, false), walkDirectory(prerenderedDir, true)]);
  return assets;
}
function generateAssetImports(assets) {
  const imports = assets.map((asset) => {
    const relativePath = asset.isPrerendered ? `../prerendered${asset.routePath}` : `../client${asset.routePath}`;
    return `import ${asset.varName} from "${relativePath}" with { type: "file" };`;
  }).join(`
`);
  const mapEntries = assets.map((asset) => `  ["${asset.routePath}", ${asset.varName}]`).join(`,
`);
  return `// Auto-generated asset imports
// @ts-nocheck
${imports}

export const assetMap = new Map([
${mapEntries}
]);

export const assets = {
${assets.map((asset) => `  ${asset.varName}`).join(`,
`)}
};
`;
}

// src/utils/compile.ts
import { execSync } from "child_process";
import { join as join2 } from "path";
import { stat as stat2 } from "fs/promises";
async function compileApplication(builder, options) {
  try {
    const bunVersion = execSync("bun --version", { encoding: "utf8", stdio: "pipe" }).trim();
    const versionParts = bunVersion.split(".").map(Number);
    if (versionParts.length !== 3 || versionParts.some(isNaN)) {
      builder.log.error(`Invalid Bun version format: ${bunVersion}`);
      process.exit(1);
    }
    const major = versionParts[0];
    const minor = versionParts[1];
    const patch = versionParts[2];
    const required = [1, 2, 18];
    const isVersionValid = major > required[0] || major === required[0] && minor > required[1] || major === required[0] && minor === required[1] && patch >= required[2];
    if (!isVersionValid) {
      builder.log.error(`Bun version ${bunVersion} is too old. Please upgrade to ${required.join(".")} or later with bun upgrade.`);
      process.exit(1);
    }
  } catch {
    builder.log.error("Bun is not installed. Please install Bun and try again.");
    process.exit(1);
  }
  const compileArgs = [
    "build",
    "--compile",
    ...options.target ? [`--target=${TARGETS_MAP[options.target]}`] : [],
    join2(SVELTEKIT_DIR, "temp-server/index.ts"),
    "--outfile",
    join2(options.out, options.binaryName)
  ].join(" ");
  execSync(`bun ${compileArgs}`, { stdio: "inherit" });
  const isWindows = process.platform === "win32";
  const binaryPath = join2(options.out, options.binaryName + (isWindows ? ".exe" : ""));
  const { size: sizeInBytes } = await stat2(binaryPath);
  const sizeInMb = (sizeInBytes / (1024 * 1024)).toFixed(1);
  return { binaryPath, sizeInMb };
}

// src/utils/docker.ts
import { writeFile } from "fs/promises";
import { join as join3 } from "path";
async function generateDockerfile(options) {
  const binaryName = options.binaryName || "app";
  const out = options.out || "dist";
  const volume = options.volume || "";
  const base = options.target?.endsWith("-musl") ? "alpine:3.20" : "debian:bookworm-slim";
  const content = [
    "# Auto-generated Dockerfile",
    "FROM " + base,
    "",
    "WORKDIR /app",
    "",
    "COPY . .",
    "",
    "# Ensure the binary exists",
    `RUN test -f ./${binaryName}`,
    "",
    `RUN chmod +x ./${binaryName}`,
    "",
    ...volume ? [`VOLUME ["${volume}"]`, ""] : [],
    "EXPOSE 3000",
    "",
    "# Start the application",
    `CMD ["./${binaryName}"]`
  ].join(`
`);
  await writeFile(join3(out, "Dockerfile"), content, "utf-8");
}

// src/index.ts
var adapter = (options) => {
  return {
    name: ADAPTER_NAME,
    adapt: async (builder) => {
      const adapterOptions = { out: "dist", embedStatic: true, binaryName: "app", ...options };
      builder.rimraf(SVELTEKIT_DIR);
      builder.mkdirp(SVELTEKIT_DIR);
      builder.rimraf(adapterOptions.out);
      builder.mkdirp(adapterOptions.out);
      builder.writeClient(join4(SVELTEKIT_DIR, "client"));
      builder.writePrerendered(join4(SVELTEKIT_DIR, "prerendered"));
      builder.writeServer(join4(SVELTEKIT_DIR, "server"));
      builder.rimraf(join4(SVELTEKIT_DIR, "server", "_app"));
      builder.log.success("[EXE] SvelteKit build complete");
      const path = join4(import.meta.dirname, "server");
      builder.copy(path, join4(SVELTEKIT_DIR, "temp-server"));
      builder.log.success("[EXE] Server copied");
      const manifest = builder.generateManifest({ relativePath: "./server" });
      const manifestModule = `const manifest = ${manifest};
export default manifest;`;
      await writeFile2(join4(SVELTEKIT_DIR, "manifest.js"), manifestModule, "utf-8");
      builder.log.success("[EXE] Manifest generated");
      if (adapterOptions.embedStatic) {
        const clientAssets = await discoverClientAssets(join4(SVELTEKIT_DIR, "client"), join4(SVELTEKIT_DIR, "prerendered"));
        const assetImports = generateAssetImports(clientAssets);
        await writeFile2(join4(SVELTEKIT_DIR, "temp-server", "assets.generated.ts"), assetImports);
      } else {
        builder.copy(join4(SVELTEKIT_DIR, "client"), join4(adapterOptions.out, "client"));
        builder.copy(join4(SVELTEKIT_DIR, "prerendered"), join4(adapterOptions.out, "prerendered"));
        await writeFile2(join4(SVELTEKIT_DIR, "temp-server", "assets.generated.ts"), "export const assetMap = new Map([]);");
      }
      builder.log.success("[EXE] Assets generated");
      const { binaryPath, sizeInMb } = await compileApplication(builder, adapterOptions);
      builder.log.success(`[EXE] Application compiled (${sizeInMb} MB)`);
      if (adapterOptions.target === "linux-x64") {
        await generateDockerfile(adapterOptions);
        builder.log.success("[EXE] Dockerfile generated");
      }
      builder.log.success(`[EXE] Start the application with: ./${binaryPath}`);
    },
    supports: {
      read: () => true
    }
  };
};
var src_default = adapter;
export {
  src_default as default
};
