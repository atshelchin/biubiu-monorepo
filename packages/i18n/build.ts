import { readdir, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const srcDir = './src';
const outDir = './dist';

// 清理输出目录
await rm(outDir, { recursive: true, force: true });

// 收集所有源文件
async function collectFiles(dir: string, base = ''): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = base ? `${base}/${entry.name}` : entry.name;
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath, relativePath)));
    } else if (entry.name.endsWith('.ts')) {
      files.push(relativePath);
    }
  }

  return files;
}

const files = await collectFiles(srcDir);

console.log(`Building ${files.length} files...`);

// 判断是否需要 Node.js 运行时
function needsNodeTarget(filePath: string): boolean {
  return filePath.startsWith('vite-plugin/') || filePath.startsWith('sveltekit/');
}

// 逐个构建每个文件，保持目录结构
for (const file of files) {
  const inputPath = join(srcDir, file);
  const outputPath = join(outDir, file.replace(/\.ts$/, '.js'));
  const outputDir = dirname(outputPath);

  await mkdir(outputDir, { recursive: true });

  // vite-plugin 和 sveltekit 模块需要 Node.js API
  const target = needsNodeTarget(file) ? 'node' : 'browser';

  // 外部依赖 (不打包这些)
  const externals = ['svelte', 'svelte/*', '@sveltejs/kit', 'vite'];

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

console.log('Build complete!');

// 生成类型声明 (使用 tsc，忽略 node_modules 错误)
console.log('Generating type declarations...');
const tsc = Bun.spawn(
  ['bunx', 'tsc', '--emitDeclarationOnly', '--declaration', '--outDir', outDir, '--skipLibCheck'],
  {
    cwd: import.meta.dir,
    stdio: ['inherit', 'pipe', 'pipe'],
  }
);

await tsc.exited;

// 检查输出
const outputFiles = await collectFiles(outDir);
console.log(`Generated ${outputFiles.length} files in dist/`);
console.log('Done!');
