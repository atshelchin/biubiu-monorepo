/**
 * 每个业务域的 WASM 模块，按域缓存。
 *
 * spec 004 之前这里只有一个全局模块 —— 所有域编在一个产物里，加载一次就有了全部。那样做的
 * 代价是**每个页面都要下载全部域的代码**：两个域已经 588 KB，十四个域会到 3.4 MB，而每个
 * 工具都是独立页面，用户通常只用其中一个（spec 004 research.md D31）。
 *
 * 现在每个域一个产物，页面只加载它用到的那一个。缓存因此按域分开：同一个域在一个标签页里
 * 只加载一次，不同的域各自加载。
 *
 * 这里仍然是**产品无关**的：它不知道任何域的业务，只知道域名到产物的对应。新增一个域是
 * 下面 `LOADERS` 里的一行 —— Vite 需要静态可分析的 `import()`，所以不能用模板字符串拼路径。
 */

/** 一个域的 WASM 模块。各域的导出类名不同，因此这里只约定「有 default 初始化函数」。 */
export type CruxWasmModule = { default: (...args: unknown[]) => Promise<unknown> } & Record<
	string,
	unknown
>;

/**
 * 域名 → 产物加载器。
 *
 * **必须是字面量 `import()`**：Vite 靠静态分析决定把哪些 wasm 发射为资源，
 * 拼出来的路径它看不见，构建产物里就不会有那个文件。
 */
const LOADERS: Record<string, () => Promise<unknown>> = {
	revoke: () => import('$lib/wasm/revoke/core.js'),
	sender: () => import('$lib/wasm/sender/core.js'),
};

const runtimes = new Map<string, Promise<CruxWasmModule>>();

export function loadCruxWasm(domain: string): Promise<CruxWasmModule> {
	const cached = runtimes.get(domain);
	if (cached) return cached;

	const load = LOADERS[domain];
	if (!load) {
		return Promise.reject(
			new Error(`未知的业务域 "${domain}" —— 在 wasm-runtime.ts 的 LOADERS 里加一行`),
		);
	}

	const promise = load()
		.then(async (module) => {
			const wasm = module as CruxWasmModule;
			await wasm.default();
			return wasm;
		})
		.catch((error) => {
			// 失败的 Promise 会被永久缓存，此后每次调用都拿到同一个旧错误。
			// 清掉它，让下一次调用真的重试一遍。
			runtimes.delete(domain);
			throw error;
		});

	runtimes.set(domain, promise);
	return promise;
}
