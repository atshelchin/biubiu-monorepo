//! 每个业务域共用的 JSON 桥。
//!
//! ```text
//! dispatch(event_json)             ─► { view, effects: [{ id, operation }], cancelled_effect_ids }
//! resolve_effect(id, result_json)  ─► 同一形状
//! ```
//!
//! 这里没有任何业务语义 —— 它只做 JSON 编解码与 pending 表管理。新增一个域是
//! `lib.rs` 里的一行 [`bridge_class!`] 加 `biubiu-core` 里三行 `SplitEffect`；
//! 桥本身不按域分叉，因此**不可能**按域分叉（`contracts/bridge.md` §2 B-3）。
//!
//! 边界走 JSON 字符串而不是 `serde-wasm-bindgen`，因为 `#[wasm_bindgen]` 导不出
//! 泛型：只要边界是字符串，这一个 `Bridge<A>` 就能服务任意 `App`
//! （research.md D3）。

use std::collections::HashMap;

use crux_core::capability::Operation;
use crux_core::{App, Core, Request};
use serde::Serialize;
use serde::de::DeserializeOwned;
use wasm_bindgen::JsValue;

use biubiu_core::app::SplitEffect;

#[derive(Serialize)]
struct DispatchResult<Op> {
    view: serde_json::Value,
    effects: Vec<ShellEffect<Op>>,
    /// 目前恒为空。本仓库的域用「把请求移出在途表」来作废陈旧操作，而不是让
    /// 宿主 abort —— 扫描是只读的，跑完再丢弃结果没有副作用；撤销**绝不能**
    /// 被中止（交易可能已上链）。字段留着，是因为共享的 effect loop 是产品
    /// 无关的，将来某个域真需要 abort 时不该去改那个循环（research.md D9）。
    cancelled_effect_ids: Vec<u64>,
}

#[derive(Serialize)]
struct ShellEffect<Op> {
    id: u64,
    operation: Op,
}

/// 泛型的那一半。`#[wasm_bindgen]` 不能导出泛型，所以每个导出类都是
/// [`bridge_class!`] 生成的薄壳。
pub(crate) struct Bridge<A>
where
    A: App + Default,
    A::Model: Default,
    A::Effect: SplitEffect,
{
    core: Core<A>,
    pending: HashMap<u64, Request<<A::Effect as SplitEffect>::Op>>,
    next_effect_id: u64,
}

impl<A> Bridge<A>
where
    A: App + Default,
    A::Model: Default,
    A::Event: DeserializeOwned,
    A::ViewModel: Serialize,
    A::Effect: SplitEffect,
    <A::Effect as SplitEffect>::Op: Clone + Serialize,
    <<A::Effect as SplitEffect>::Op as Operation>::Output: DeserializeOwned,
{
    pub(crate) fn new() -> Self {
        Self {
            core: Core::new(),
            pending: HashMap::new(),
            next_effect_id: 0,
        }
    }

    pub(crate) fn dispatch(&mut self, event_json: &str) -> Result<String, JsValue> {
        let event: A::Event = serde_json::from_str(event_json)
            .map_err(|error| JsValue::from_str(&format!("宿主送来的事件无法解析: {error}")))?;
        let effects = self.core.process_event(event);
        self.serialize(effects)
    }

    pub(crate) fn resolve_effect(
        &mut self,
        effect_id: u64,
        result_json: &str,
    ) -> Result<String, JsValue> {
        let result: <<A::Effect as SplitEffect>::Op as Operation>::Output =
            serde_json::from_str(result_json)
                .map_err(|error| JsValue::from_str(&format!("宿主送来的结果无法解析: {error}")))?;

        // 未知 id ⇒ 答案活得比问题久：宿主回送了一个早已被放弃的操作。这是
        // 正常情况，不是故障 —— 报告当前视图，什么都不改
        // （`contracts/bridge.md` §2 B-2）。
        let Some(mut request) = self.pending.remove(&effect_id) else {
            return self.serialize(Vec::new());
        };

        match self.core.resolve(&mut request, result) {
            Ok(effects) => self.serialize(effects),
            // 同一件事再往下一层：拥有这个请求的 Command 在答案到达前就被丢弃了。
            Err(_) => self.serialize(Vec::new()),
        }
    }

    pub(crate) fn view(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.core.view())
            .map_err(|error| JsValue::from_str(&format!("视图无法序列化: {error}")))
    }

    fn serialize(&mut self, effects: Vec<A::Effect>) -> Result<String, JsValue> {
        let mut shell_effects = Vec::new();
        for effect in effects {
            // 渲染不需要宿主做任何事；视图本身已经在返回体里。
            let Some(request) = effect.into_shell() else {
                continue;
            };
            // 单调递增、全域唯一、永不复用：一个 id 只能被 resolve 一次
            // （`contracts/bridge.md` §2 B-1）。
            self.next_effect_id += 1;
            let id = self.next_effect_id;
            let operation = request.operation.clone();
            self.pending.insert(id, request);
            shell_effects.push(ShellEffect { id, operation });
        }

        let view = serde_json::to_value(self.core.view())
            .map_err(|error| JsValue::from_str(&format!("视图无法序列化: {error}")))?;

        serde_json::to_string(&DispatchResult {
            view,
            effects: shell_effects,
            cancelled_effect_ids: Vec::new(),
        })
        .map_err(|error| JsValue::from_str(&format!("返回体无法序列化: {error}")))
    }

    #[cfg(feature = "devtools")]
    pub(crate) fn debug_snapshot(&self) -> Result<String, JsValue>
    where
        A::ViewModel: biubiu_core::app::DebugSnapshot,
    {
        use biubiu_core::app::DebugSnapshot as _;
        serde_json::to_string(&self.core.view().debug_snapshot())
            .map_err(|error| JsValue::from_str(&format!("快照无法序列化: {error}")))
    }
}

/// 把泛型 [`Bridge`] 包装成一个 `#[wasm_bindgen]` 导出类。每个业务域一行。
///
/// ```ignore
/// bridge_class!(RevokeCore, biubiu_core::app::revoke::RevokeApp, debug);
/// bridge_class!(PingCore,   biubiu_core::app::ping::Ping);
/// ```
///
/// 带 `debug` 的形式额外导出 `debug_snapshot()`，要求该域的 `ViewModel` 实现
/// [`biubiu_core::app::DebugSnapshot`]。不带的形式不导出 —— 一个域可以先不提供
/// 开发期快照，而不是被迫写一个空实现（空实现比没有更糟：它看起来像是有）。
macro_rules! bridge_class {
    ($name:ident, $app:path) => {
        $crate::bridge::bridge_class!(@base $name, $app);
    };

    ($name:ident, $app:path, debug) => {
        $crate::bridge::bridge_class!(@base $name, $app);

        #[cfg(feature = "devtools")]
        #[wasm_bindgen::prelude::wasm_bindgen]
        impl $name {
            /// 开发期的脱敏内部快照。release 构建不含此方法。
            pub fn debug_snapshot(&self) -> Result<String, wasm_bindgen::JsValue> {
                self.inner.debug_snapshot()
            }
        }
    };

    (@base $name:ident, $app:path) => {
        #[wasm_bindgen::prelude::wasm_bindgen]
        pub struct $name {
            inner: $crate::bridge::Bridge<$app>,
        }

        #[wasm_bindgen::prelude::wasm_bindgen]
        impl $name {
            #[wasm_bindgen::prelude::wasm_bindgen(constructor)]
            pub fn new() -> Self {
                Self {
                    inner: $crate::bridge::Bridge::new(),
                }
            }

            pub fn dispatch(
                &mut self,
                event_json: &str,
            ) -> Result<String, wasm_bindgen::JsValue> {
                self.inner.dispatch(event_json)
            }

            pub fn resolve_effect(
                &mut self,
                effect_id: u64,
                result_json: &str,
            ) -> Result<String, wasm_bindgen::JsValue> {
                self.inner.resolve_effect(effect_id, result_json)
            }

            pub fn view(&self) -> Result<String, wasm_bindgen::JsValue> {
                self.inner.view()
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }
    };
}

pub(crate) use bridge_class;
