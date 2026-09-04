#!/usr/bin/env node
/**
 * WASM 产物的体积门禁（宪法原则 VII）。
 *
 * 存在的理由：体积会在无人注意的情况下逐次增长。参考实现 vela-wallet 的 i18n catalog 正是
 * 因为有这道门禁，才在超出上限 315KB 时被拦下并改成运行时加载 —— 没有门禁的话，那 315KB
 * 会安静地进到每个用户的首屏。
 *
 * # 逐域检查（spec 004）
 *
 * 产物按域切分之后，每个域一条线。上限**不是拍脑袋定的**：先落地、再实测、再据实测设限；
 * 数值与推导记在 `specs/004-wasm-per-domain/results.md`，阈值本身在 `domains.mjs`。
 *
 * # 共享底座怎么看
 *
 * 底座（`crux_core` + `serde_json` + 泛型桥，实测约 112 KB）在**每个**产物里各存一份，
 * 所以它涨 10 KB 就是每一页都涨 10 KB —— 比某个域自己涨 10 KB 严重得多。
 *
 * 这个脚本**不单独测底座**，因为切分之后无从只测它：任何一个产物都是「底座 + 某个域」，
 * 而两者的拆分需要再构建一次合并产物。但底座的增长有一个明确的信号 ——
 * **所有域会同时涨、且涨幅接近**。脚本因此在报告里给出每个域相对基准的偏移，让这个信号
 * 一眼可见（research.md D33）。
 *
 * 要精确重测底座：临时用 `--features domain-revoke,domain-sender` 构建一次合并产物，
 * 底座 = revoke + sender − 合并。
 */
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMAINS } from './domains.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const wasmRoot = join(here, '../../apps/biubiu.tools/src/lib/wasm');
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

const measured = [];
for (const domain of DOMAINS) {
	const path = join(wasmRoot, domain.name, 'core_bg.wasm');
	try {
		measured.push({ ...domain, bytes: statSync(path).size });
	} catch {
		console.error(`✗ 找不到 ${domain.name} 域的产物: ${path}`);
		console.error('  先跑 `bun run --cwd apps/biubiu.tools wasm:build`。');
		process.exit(1);
	}
}

const failures = measured.filter((d) => d.bytes > d.maxBytes);
if (failures.length > 0) {
	console.error('');
	console.error('✗ WASM 产物超出体积上限');
	console.error('');
	for (const { name, bytes, maxBytes } of failures) {
		console.error(
			`  ${name}: ${bytes.toLocaleString()}（${kb(bytes)}）> 上限 ` +
				`${maxBytes.toLocaleString()}（${kb(maxBytes)}），超出 ${(bytes - maxBytes).toLocaleString()} 字节`,
		);
	}
	console.error('');
	if (failures.length === measured.length && measured.length > 1) {
		console.error('  **所有域同时超限** —— 这多半是共享底座变大了（新依赖？升级了 crux_core？），');
		console.error('  而不是某个域自己的问题。底座在每个产物里各存一份，每页都会跟着涨。');
		console.error('');
	}
	console.error('  这不是一个改大上限就完事的失败。先弄清多出来的体积是什么；');
	console.error('  若增长是有意的，把新数值和理由记进 specs/004-wasm-per-domain/results.md，');
	console.error('  再调整 rust/scripts/domains.mjs 里的阈值。');
	console.error('');
	process.exit(1);
}

for (const { name, bytes, maxBytes } of measured) {
	const headroom = ((1 - bytes / maxBytes) * 100).toFixed(0);
	console.log(
		`✓ ${name.padEnd(8)} ${bytes.toLocaleString().padStart(9)} 字节（${kb(bytes)}）— 余量 ${headroom}%`,
	);
}
console.log(
	`  每页只加载其中一个；共享底座（约 112 KB）在每个产物里各一份 —— ` +
		`若哪天所有域一起涨，先怀疑它。`,
);
