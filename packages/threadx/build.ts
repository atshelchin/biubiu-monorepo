import { readdir, rm, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const srcDir = './src';
const outDir = './dist';

// Clean output directory
await rm(outDir, { recursive: true, force: true });

// Collect all source files (excluding tests)
async function collectFiles(dir: string, base = ''): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = base ? `${base}/${entry.name}` : entry.name;
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath, relativePath)));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(relativePath);
    }
  }

  return files;
}

const files = await collectFiles(srcDir);

console.log(`Building ${files.length} files...`);

// Build each file
for (const file of files) {
  const inputPath = join(srcDir, file);
  const outputPath = join(outDir, file.replace(/\.ts$/, '.js'));
  const outputDir = dirname(outputPath);

  await mkdir(outputDir, { recursive: true });

  const result = await Bun.build({
    entrypoints: [inputPath],
    outdir: outputDir,
    target: 'browser',
    format: 'esm',
    splitting: false,
    sourcemap: 'external',
    minify: false,
    naming: '[name].[ext]',
  });

  if (!result.success) {
    console.error(`Build failed for ${file}:`);
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }
}

console.log('Build complete!');

// Generate type declarations
console.log('Generating type declarations...');
const tsc = Bun.spawn(
  ['bunx', 'tsc', '--emitDeclarationOnly', '--declaration', '--outDir', outDir, '--skipLibCheck'],
  {
    cwd: import.meta.dir,
    stdio: ['inherit', 'pipe', 'pipe'],
  }
);

await tsc.exited;

console.log('Done!');
