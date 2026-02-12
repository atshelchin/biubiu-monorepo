import { build } from 'bun';
import { readdir, rm } from 'fs/promises';
import { join } from 'path';

const srcDir = './src';
const outDir = './dist';

// Clean dist
await rm(outDir, { recursive: true, force: true });

// Get all entry points
const entries = ['index.ts', 'browser.ts'];

await build({
  entrypoints: entries.map(e => join(srcDir, e)),
  outdir: outDir,
  target: 'browser', // Use browser for maximum compatibility
  format: 'esm',
  splitting: true,
  sourcemap: 'external',
  minify: false,
  external: ['better-sqlite3', 'bun:sqlite'],
});

// Generate declaration files using tsc
const proc = Bun.spawn(['bunx', 'tsc', '--emitDeclarationOnly'], {
  stdio: ['inherit', 'inherit', 'inherit'],
});
await proc.exited;

console.log('Build complete!');
