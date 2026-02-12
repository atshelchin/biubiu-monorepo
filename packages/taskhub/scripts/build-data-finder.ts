#!/usr/bin/env bun
/**
 * 构建 data-finder 为 Windows 可执行文件
 *
 * 用法:
 *   bun run build:data-finder
 *
 * 输出:
 *   dist/bin/data-finder-win-x64.exe   (64位 Windows)
 *   dist/bin/data-finder-win-ia32.exe  (32位 Windows)
 */

import { $ } from 'bun';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const entryFile = join(rootDir, 'examples/data-finder.ts');
const outputDir = join(rootDir, 'dist/bin');

// Bun 支持的 Windows 目标平台
const targets = [
  { name: 'win-x64', target: 'bun-windows-x64' },
  { name: 'win-ia32', target: 'bun-windows-x64-baseline' }, // x86 兼容模式
];

async function build() {
  console.log('🔨 开始构建 data-finder...\n');

  await mkdir(outputDir, { recursive: true });

  for (const { name, target } of targets) {
    const outputFile = join(outputDir, `data-finder-${name}.exe`);
    console.log(`  构建 ${name}...`);

    try {
      // --external 排除 better-sqlite3（data-finder 只用 memory 模式）
      await $`bun build ${entryFile} --compile --target=${target} --outfile=${outputFile} --external better-sqlite3`;
      console.log(`  ✅ ${outputFile}`);
    } catch (error) {
      console.error(`  ❌ 构建 ${name} 失败:`, error);
    }
  }

  // 也构建当前平台版本
  console.log(`\n  构建 macOS 版本...`);
  const macOutput = join(outputDir, 'data-finder');
  try {
    await $`bun build ${entryFile} --compile --outfile=${macOutput} --external better-sqlite3`;
    console.log(`  ✅ ${macOutput}`);
  } catch (error) {
    console.error(`  ❌ 构建 macOS 失败:`, error);
  }

  console.log('\n✨ 构建完成！\n');
  console.log('输出目录:', outputDir);
  console.log('\n使用方法 (Windows):');
  console.log('  data-finder-win-x64.exe C:\\Users\\xxx\\Documents');
  console.log('  data-finder-win-x64.exe D:\\ --min-size=500MB');
}

build().catch(console.error);
