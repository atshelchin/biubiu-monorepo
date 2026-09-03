#!/usr/bin/env node
/**
 * 构建 biubiu-core 前的工具链前置检查（spec 001-biubiu-core-crux，FR-027）。
 *
 * 存在的理由：缺少 wasm-pack 时，直接跑构建得到的是一句 `command not found`，
 * 或者更糟 —— cargo 关于 wasm32 目标缺失的多行错误。两者都不告诉贡献者该做什么。
 * 这个脚本把「缺什么」和「跑哪条命令」放在同一屏里。
 */
import { execFileSync } from 'node:child_process';

/** 跑一条命令，成功返回 stdout，失败返回 null（不抛）。 */
function probe(command, args) {
	try {
		return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		return null;
	}
}

const missing = [];

const rustc = probe('rustc', ['--version']);
if (!rustc) {
	missing.push({
		what: 'Rust 工具链（rustc / cargo）',
		fix: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
	});
}

// 只有 rustc 在的时候问它装了哪些目标才有意义。
if (rustc) {
	const targets = probe('rustup', ['target', 'list', '--installed']) ?? '';
	if (!targets.split('\n').includes('wasm32-unknown-unknown')) {
		missing.push({
			what: 'wasm32-unknown-unknown 编译目标',
			fix: 'rustup target add wasm32-unknown-unknown',
		});
	}
}

if (!probe('wasm-pack', ['--version'])) {
	missing.push({ what: 'wasm-pack', fix: 'cargo install wasm-pack' });
}

if (missing.length === 0) {
	console.log(`✓ 工具链就绪（${rustc}）`);
	process.exit(0);
}

console.error('');
console.error('构建 biubiu-core 需要的工具链不完整：');
console.error('');
for (const { what, fix } of missing) {
	console.error(`  ✗ 缺少 ${what}`);
	console.error(`    ${fix}`);
	console.error('');
}
console.error('装好后重新运行原来的命令。完整说明见');
console.error('specs/001-biubiu-core-crux/quickstart.md「前置条件」。');
console.error('');
process.exit(1);
