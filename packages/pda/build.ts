import { build } from 'bun';
import { rm } from 'fs/promises';
import { join } from 'path';

const srcDir = './src';
const outDir = './dist';

// Clean dist
await rm(outDir, { recursive: true, force: true });

// Build for Node/Bun (CLI adapter uses readline)
await build({
  entrypoints: [join(srcDir, 'index.ts')],
  outdir: outDir,
  target: 'bun', // Use bun target since CLI adapter needs Node APIs
  format: 'esm',
  splitting: true,
  sourcemap: 'external',
  minify: false,
  external: ['zod', 'readline/promises'],
});

// Generate declaration files using tsc
const proc = Bun.spawn(['bunx', 'tsc', '--emitDeclarationOnly'], {
  stdio: ['inherit', 'inherit', 'inherit'],
});
await proc.exited;

console.log('Build complete!');
