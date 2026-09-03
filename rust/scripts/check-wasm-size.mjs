#!/usr/bin/env node
/**
 * WASM 产物的体积门禁（spec 001-biubiu-core-crux，宪法原则 VII）。
 *
 * 存在的理由：体积会在无人注意的情况下逐次增长。参考实现 vela-wallet 的 i18n
 * catalog 正是因为有这道门禁，才在超出上限 315KB 时被拦下并改成运行时加载 ——
 * 没有门禁的话，那 315KB 会安静地进到每个用户的首屏。
 *
 * 上限**不是**拍脑袋定的：先落地、再实测、再据实测设限（research.md D8）。
 * MAX_BYTES 为 null 时本脚本只报告不拦截，并提示去设定它。
 */
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * release 产物的字节上限。
 *
 * 顺序是刻意的：先落地、再实测、再据实测设限（research.md D8）。在业务进核心之前定一个数字
 * 只会是拍脑袋，然后逼着实现去迁就它。
 *
 * 实测记录（release + wasm-opt）：
 *   骨架 + 一个最小占位域        142,255 字节  （2026-09-03）
 *   骨架 + revoke 域             322,553 字节  （2026-09-03，占位域已移除）
 *
 * 第二行相对第一行是 +180,298 字节 —— 一个域就让产物大了 127%。这不是「固定成本摊薄」，
 * 需要如实记着：其中相当一部分是内置注册表的字符串数据（约 100 条代币/授权方，含名称与标签），
 * 以及 serde 为每个线类型单态化出来的代码。
 *
 * 后续域**是否**线性放大这个数字，现在还不知道 —— 第二个域落地时才会有第二个数据点。
 * 若真呈线性，注册表数据改为运行时按链拉取是第一个该考虑的方向（vela-wallet 的 i18n catalog
 * 就是被这道门禁逼出这个结论的）。
 *
 * 当前上限 = 实测 × 1.3。一次让这个数字显著变化的改动，是一个要重新做的决定，
 * 不是一个可以顺手合入的 diff —— 新数值和理由要一并记进该 spec 的 results.md。
 */
const MAX_BYTES = 419319;

const here = dirname(fileURLToPath(import.meta.url));
const wasmPath = join(here, '../../apps/biubiu.tools/src/lib/wasm/biubiu_core_wasm_bg.wasm');

let size;
try {
	size = statSync(wasmPath).size;
} catch {
	console.error(`✗ 找不到 WASM 产物: ${wasmPath}`);
	console.error('  先跑 `bun run --cwd apps/biubiu.tools wasm:build`。');
	process.exit(1);
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

if (MAX_BYTES === null) {
	console.log(`ℹ WASM 实测 ${size.toLocaleString()} 字节（${kb(size)}）— 上限尚未设定`);
	console.log('  把这个数值记进 specs/001-biubiu-core-crux/results.md，并据此设定 MAX_BYTES。');
	process.exit(0);
}

if (size > MAX_BYTES) {
	console.error('');
	console.error(`✗ WASM 产物超出体积上限`);
	console.error(`    实测: ${size.toLocaleString()} 字节（${kb(size)}）`);
	console.error(`    上限: ${MAX_BYTES.toLocaleString()} 字节（${kb(MAX_BYTES)}）`);
	console.error(`    超出: ${(size - MAX_BYTES).toLocaleString()} 字节`);
	console.error('');
	console.error('  这不是一个改大上限就完事的失败。先弄清多出来的体积是什么：');
	console.error('  新依赖？新 feature 被默认打开了？如果这个增长是有意的，');
	console.error('  把新数值和理由一并记进该 spec 的 results.md 再调整上限。');
	console.error('');
	process.exit(1);
}

const headroom = ((1 - size / MAX_BYTES) * 100).toFixed(0);
console.log(`✓ WASM ${size.toLocaleString()} 字节（${kb(size)}）— 上限 ${kb(MAX_BYTES)}，余量 ${headroom}%`);
