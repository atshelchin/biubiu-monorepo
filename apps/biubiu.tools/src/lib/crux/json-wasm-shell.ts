import {
	createEffectLoop,
	type CoreResult,
	type EffectCore,
	type EffectLoopOptions,
	type EffectWithId
} from './effect-loop.js';

/**
 * 桥生成的每个导出类都长这样（`contracts/bridge.md` §1）。
 */
export type JsonWasmCore = {
	dispatch(event: string): string;
	resolve_effect(effectId: bigint, result: string): string;
	view(): string;
	/** 仅 devtools 构建存在。 */
	debug_snapshot?(): string;
	free(): void;
};

export type JsonWasmShellOptions<
	View,
	Event,
	Effect extends EffectWithId,
	Result
> = EffectLoopOptions<View, Event, Effect, Result> & {
	onSnapshot?(source: 'initial' | 'event' | 'effect_result', snapshot: unknown): void;
};

/**
 * JSON 编解码适配层。它同样对业务一无所知：把对象转成字符串送进 wasm，
 * 把字符串转回对象交给事件泵。
 */
export function createJsonWasmShell<View, Event, Effect extends EffectWithId, Result>(
	core: JsonWasmCore,
	options: JsonWasmShellOptions<View, Event, Effect, Result>
) {
	function inspect(source: 'initial' | 'event' | 'effect_result') {
		if (!core.debug_snapshot || !options.onSnapshot) return;
		try {
			options.onSnapshot(source, JSON.parse(core.debug_snapshot()));
		} catch (error) {
			options.onError?.(error);
		}
	}

	const jsonCore: EffectCore<View, Event, Effect, Result> = {
		view: () => {
			const view = JSON.parse(core.view()) as View;
			inspect('initial');
			return view;
		},
		dispatch: (event) => {
			const output = JSON.parse(core.dispatch(JSON.stringify(event))) as CoreResult<View, Effect>;
			inspect('event');
			return output;
		},
		resolve: (effectId, result) => {
			// 桥的 effect_id 是 u64，wasm-bindgen 在 JS 侧要求 BigInt。
			const output = JSON.parse(
				core.resolve_effect(BigInt(effectId), JSON.stringify(result))
			) as CoreResult<View, Effect>;
			inspect('effect_result');
			return output;
		},
		dispose: () => core.free()
	};

	return createEffectLoop(jsonCore, options);
}
