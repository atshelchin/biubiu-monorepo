//! 业务域模块的组合根，以及桥与业务域之间唯一的通用契约。
//!
//! 每个域自己拥有 Event、Model、ViewModel、Operation、ShellResult 与业务单测。
//! 这个文件只负责装配，不含任何业务语义 —— 新增一个域不该让它变长（除了一行
//! `pub mod`）。

use crux_core::Request;
use crux_core::capability::Operation;

pub mod revoke;
mod revoke_registry;

/// 让产品无关的管道（WASM 桥、测试驱动）能在不了解任何业务域的前提下，把
/// 「重新渲染」和「请宿主做事」区分开。
///
/// 每个域实现它只需三行。桥因此写一次就够，也就不可能按域分叉 ——
/// `contracts/bridge.md` §2 B-3。
pub trait SplitEffect {
    /// 这个域的宿主请求类型。
    type Op: Operation;

    /// 是宿主请求就交出来，是渲染就 `None`。
    fn into_shell(self) -> Option<Request<Self::Op>>;
}

/// 开发期的脱敏内部快照。
///
/// 存在的理由是**不**让内部记账进入 `ViewModel`：在途请求表、单调计数器、
/// 自动扫描去重键这些东西对渲染毫无用处，一旦出现在视图里，宿主早晚会去读它，
/// 业务判断也就重新漏回了宿主（宪法原则 II）。
///
/// 需要看这些内部状态的是开发者，不是页面。因此它走一条独立的、默认关闭的
/// 通道：`--features devtools` 才编译，release 构建里根本不存在。
///
/// 实现者要自己做脱敏 —— 快照会原样送到浏览器控制台。
#[cfg(feature = "devtools")]
pub trait DebugSnapshot {
    fn debug_snapshot(&self) -> serde_json::Value;
}

/// 按计算出的键去重，**保留首次出现**并保持输入顺序。
///
/// 方向很重要：多处注册表把内置列表与用户自定义条目合并，顺序是 `[内置…, 自定义…]`，
/// 因此同键时**内置胜出**。这是迁移前 `infra/dedupe.ts` 的语义，逐字保持 —— 方向反了，
/// 用户给内置代币添加同地址自定义条目时符号/精度就会变，那是一次静默的行为改变
/// （research.md D13）。
pub(crate) fn dedupe_by<T, K, F>(items: impl IntoIterator<Item = T>, key: F) -> Vec<T>
where
    F: Fn(&T) -> K,
    K: Ord,
{
    let mut seen = std::collections::BTreeSet::new();
    items
        .into_iter()
        .filter(|item| seen.insert(key(item)))
        .collect()
}
