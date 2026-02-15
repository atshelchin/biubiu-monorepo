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
const tsFiles = files.filter(f => f.endsWith('.ts'));
const svelteFiles = files.filter(f => f.endsWith('.svelte'));

console.log(`Building ${tsFiles.length} TS files and ${svelteFiles.length} Svelte files...`);

// Copy Svelte files directly (they're processed by consumer's SvelteKit)
for (const file of svelteFiles) {
  const inputPath = join(srcDir, file);
  const outputPath = join(outDir, file);
  const outputDirPath = dirname(outputPath);

  await mkdir(outputDirPath, { recursive: true });
  await copyFile(inputPath, outputPath);
}

console.log(`Copied ${svelteFiles.length} Svelte files`);

// Use TypeScript to transpile .ts files (preserves imports)
console.log('Transpiling TypeScript files...');
const tsc = Bun.spawn(
  [
    'bunx', 'tsc',
    '--outDir', outDir,
    '--declaration',
    '--declarationMap',
    '--skipLibCheck',
    '--module', 'ESNext',
    '--moduleResolution', 'bundler',
    '--target', 'ESNext',
    '--esModuleInterop',
    '--strict',
  ],
  {
    cwd: import.meta.dir,
    stdio: ['inherit', 'pipe', 'pipe'],
  }
);

const exitCode = await tsc.exited;

if (exitCode !== 0) {
  const stderr = await new Response(tsc.stderr).text();
  console.error('TypeScript compilation failed:');
  console.error(stderr);
  process.exit(1);
}

const outputFiles = await collectFiles(outDir);
console.log(`Generated ${outputFiles.length} files in dist/`);
console.log('Done!');
