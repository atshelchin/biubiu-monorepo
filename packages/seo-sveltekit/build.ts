import { readdir, rm, mkdir, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const srcDir = './src';
const outDir = './dist';

// Clean output directory
await rm(outDir, { recursive: true, force: true });

// Collect all source files
async function collectFiles(dir: string, base = ''): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = base ? `${base}/${entry.name}` : entry.name;
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath, relativePath)));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.svelte')) {
      files.push(relativePath);
    }
  }

  return files;
}

const files = await collectFiles(srcDir);
const tsFiles = files.filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));
const svelteFiles = files.filter(f => f.endsWith('.svelte'));
const dtsFiles = files.filter(f => f.endsWith('.d.ts'));

console.log(`Building ${tsFiles.length} TS files and ${svelteFiles.length} Svelte files...`);

// Determine if file needs Node.js target
function needsNodeTarget(filePath: string): boolean {
  return filePath.startsWith('og/');
}

// External dependencies
const externals = [
  'svelte',
  'svelte/*',
  '@sveltejs/kit',
  '$app/stores',
  '$app/environment',
  'satori',
  '@resvg/resvg-js',
];

// Build TypeScript files
for (const file of tsFiles) {
  const inputPath = join(srcDir, file);
  const outputPath = join(outDir, file.replace(/\.ts$/, '.js'));
  const outputDir = dirname(outputPath);

  await mkdir(outputDir, { recursive: true });

  const target = needsNodeTarget(file) ? 'node' : 'browser';

  const result = await Bun.build({
    entrypoints: [inputPath],
    outdir: outputDir,
    target,
    format: 'esm',
    splitting: false,
    sourcemap: 'external',
    minify: false,
    external: externals,
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

// Copy Svelte files (they are compiled by the consumer's build process)
for (const file of svelteFiles) {
  const inputPath = join(srcDir, file);
  const outputPath = join(outDir, file);
  const outputDir = dirname(outputPath);

  await mkdir(outputDir, { recursive: true });
  await copyFile(inputPath, outputPath);
}

// Copy manual type declaration files (.d.ts)
for (const file of dtsFiles) {
  const inputPath = join(srcDir, file);
  const outputPath = join(outDir, file);
  const outputDir = dirname(outputPath);

  await mkdir(outputDir, { recursive: true });
  await copyFile(inputPath, outputPath);
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

// Check output
const outputFiles = await collectFiles(outDir);
console.log(`Generated ${outputFiles.length} files in dist/`);
console.log('Done!');
