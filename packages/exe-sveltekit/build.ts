import { cp } from "fs/promises";

await Bun.build({
	entrypoints: ["./src/index.ts"],
	outdir: "./dist",
	target: "node",
	format: "esm",
});

await cp("./src/server", "./dist/server", { recursive: true });
await cp("./src/types", "./dist/types", { recursive: true });

console.log("Build complete");
