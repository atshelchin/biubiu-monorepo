/**
 * 宿主侧的事件泵。产品无关 —— 它对业务语义一无所知，也**不允许**知道。
 *
 * 这里没有、且不得出现：任何业务判断、任何请求编号、任何「哪个响应是最新的」
 * 比较。那些全部属于 Rust 核心（宪法原则 II、III）。这个文件的全部职责是：
 * 把事件送进核心、把核心要的 I/O 跑起来、把结果送回去、渲染返回的视图。
 *
 * 契约见 `specs/001-biubiu-core-crux/contracts/bridge.md` §3。
 */

export type EffectWithId = { id: number };

export type CoreResult<View, Effect> = {
	view: View;
	effects: Effect[];
	/** 见 research.md D9：本仓库目前恒为空，字段留着以免将来改动这个循环。 */
	cancelled_effect_ids?: number[];
};

export type EffectCore<View, Event, Effect extends EffectWithId, Result> = {
	view(): View;
	dispatch(event: Event): CoreResult<View, Effect>;
	resolve(effectId: number, result: Result): CoreResult<View, Effect>;
	dispose?(): void;
};

export type EffectLoopOptions<View, Event, Effect extends EffectWithId, Result> = {
	/** 渲染。核心每产出一次视图就调用一次。 */
	onView(view: View): void;
	/** 执行一个 operation。**这是整个域里唯一允许做 I/O 的地方。** */
	execute(effect: Effect, signal: AbortSignal): Promise<Result>;
	/** 把一个平台异常翻译成该域的 ShellResult，好让核心按业务规则处理失败。 */
	toFailure(effect: Effect, error: unknown): Result;
	/** 核心自身报错（JSON 解析失败等）。业务失败不走这里，走 toFailure。 */
	onError?(error: unknown): void;
	isAbort?(error: unknown): boolean;
};

/**
 * 创建一个事件泵。Rust/WASM 核心与（将来可能的）纯 TypeScript 核心用同一个循环。
 */
export function createEffectLoop<View, Event, Effect extends EffectWithId, Result>(
	core: EffectCore<View, Event, Effect, Result>,
	options: EffectLoopOptions<View, Event, Effect, Result>
) {
	const controllers = new Map<number, AbortController>();
	let disposed = false;

	function start(initialEvent: Event) {
		options.onView(core.view());
		dispatch(initialEvent);
	}

	function dispatch(event: Event) {
		if (disposed) return;
		try {
			apply(core.dispatch(event));
		} catch (error) {
			options.onError?.(error);
		}
	}

	function apply(result: CoreResult<View, Effect>) {
		options.onView(result.view);

		for (const effectId of result.cancelled_effect_ids ?? []) {
			controllers.get(effectId)?.abort();
			controllers.delete(effectId);
		}

		for (const effect of result.effects) void runEffect(effect);
	}

	async function runEffect(effect: Effect) {
		const controller = new AbortController();
		controllers.set(effect.id, controller);

		try {
			const result = await options.execute(effect, controller.signal);
			resolve(effect.id, result);
		} catch (error) {
			// 中止是核心主动要求的，不是失败 —— 它不该被翻译成一个业务结果送回去。
			if (options.isAbort?.(error) ?? isAbort(error)) return;
			resolve(effect.id, options.toFailure(effect, error));
		} finally {
			controllers.delete(effect.id);
		}
	}

	function resolve(effectId: number, result: Result) {
		if (disposed) return;
		try {
			apply(core.resolve(effectId, result));
		} catch (error) {
			options.onError?.(error);
		}
	}

	function dispose() {
		disposed = true;
		for (const controller of controllers.values()) controller.abort();
		controllers.clear();
		core.dispose?.();
	}

	return { start, dispatch, dispose };
}

function isAbort(error: unknown) {
	return error instanceof DOMException && error.name === 'AbortError';
}
