import type { EffectWithId } from './effect-loop.js';
import {
	createJsonWasmShell,
	type JsonWasmCore,
	type JsonWasmShellOptions
} from './json-wasm-shell.js';
import { loadCruxWasm, type CruxWasmModule } from './wasm-runtime.js';

export type CruxSession<View, Event, Effect extends EffectWithId, Result> = ReturnType<
	typeof createJsonWasmShell<View, Event, Effect, Result>
>;

export type CruxSessionOptions<
	View,
	Event,
	Effect extends EffectWithId,
	Result
> = JsonWasmShellOptions<View, Event, Effect, Result> & {
	createCore(wasm: CruxWasmModule): JsonWasmCore;
	initialEvent: Event;
};

/**
 * 从共享的 WASM 运行时创建一个域作用域的 Core + Shell 会话。
 *
 * **接入一个新业务域要写的全部东西就是这个调用的五个字段**：核心构造器、初始
 * 事件、渲染回调、operation 执行器、失败翻译。没有一项是循环、编号或状态 ——
 * 这是 SC-007 的验收形式（`contracts/bridge.md` §4）。
 */
export async function createCruxSession<View, Event, Effect extends EffectWithId, Result>(
	options: CruxSessionOptions<View, Event, Effect, Result>
): Promise<CruxSession<View, Event, Effect, Result>> {
	const wasm = await loadCruxWasm();
	const session = createJsonWasmShell(options.createCore(wasm), options);
	session.start(options.initialEvent);
	return session;
}
