#!/usr/bin/env node
/**
 * 按域构建 WASM 产物（spec 004-wasm-per-domain）。
 *
 * 每个域一次 `wasm-pack`，产物落在 `src/lib/wasm/<domain>/`。页面因此只加载它用到的那一个 ——
 * 合并产物会让打开撤销页面也下载批量发送的全部代码，两个域已经 588 KB，十四个域会到 3.4 MB
 * （research.md D31）。
 *
 * 域清单在 `domains.mjs`，同时驱动这里与体积门禁。新增一个域只需在那里加一条。
 *
 * 用法：
 *   node build-wasm.mjs           # release，带体积门禁
 *   node build-wasm.mjs --dev     # 开发构建，含 devtools，跳过门禁
 */
import { execFileSync } from 'node:child_process';
import { rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMAINS } from './domains.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const crate = join(here, '../crates/biubiu-core-wasm');
const outRoot = join(here, '../../apps/biubiu.tools/src/lib/wasm');

const dev = process.argv.includes('--dev');

// 每次重建前清空：删掉一个域之后，它的产物也该消失，否则宿主还能加载到一个已经不存在的域。
rmSync(outRoot, { recursive: true, force: true });

const sizes = [];
for (const domain of DOMAINS) {
	const features = [`domain-${domain.name}`, ...(dev ? ['devtools'] : [])].join(',');
	const args = [
		'build',
		crate,
		'--target',
		'web',
		...(dev ? ['--dev'] : []),
		'--out-dir',
		join(outRoot, domain.name),
		'--out-name',
		'core',
		'--',
		'--no-default-features',
		'--features',
		features,
	];

	process.stdout.write(`  ${domain.name} … `);
	execFileSync('wasm-pack', args, { stdio: ['ignore', 'ignore', 'inherit'] });
	const bytes = statSync(join(outRoot, domain.name, 'core_bg.wasm')).size;
	sizes.push({ domain: domain.name, bytes });
	console.log(`${bytes.toLocaleString()} 字节`);
}

console.log('');
console.log(`已构建 ${sizes.length} 个域产物 → ${outRoot}`);
if (dev) {
	console.log('（开发构建，含 devtools；体积门禁只对 release 生效）');
}
