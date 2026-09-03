/**
 * 整个浏览器标签页共用的那一个 WASM 模块实例。
 *
 * 每个业务域各自 `new` 自己的核心，但模块只加载一次 —— 加载它要下载并编译
 * 一份 wasm，按域重复是纯浪费。
 */
export type CruxWasmModule = typeof import('$lib/wasm/biubiu_core_wasm.js');

let runtimePromise: Promise<CruxWasmModule> | null = null;

export function loadCruxWasm(): Promise<CruxWasmModule> {
	if (!runtimePromise) {
		runtimePromise = import('$lib/wasm/biubiu_core_wasm.js')
			.then(async (wasm) => {
				await wasm.default();
				return wasm;
			})
			.catch((error) => {
				// 失败的 Promise 会被永久缓存，此后每次调用都拿到同一个旧错误。
				// 清空它，让下一次调用真的重试一遍。
				runtimePromise = null;
				throw error;
			});
	}

	return runtimePromise;
}
