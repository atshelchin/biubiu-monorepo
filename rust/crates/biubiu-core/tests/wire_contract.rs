//! 契约级往返测试：宿主应答的嵌套标签必须可序列化、可反序列化。
//!
//! 这个用例是被一次实测逼出来的（research.md D11）。把 `ShellCompleted` 写成**元组变体**
//! （`ShellCompleted(ShellResult)`）时，内部标签枚举直接套内部标签枚举，两层都写 `type`：
//!
//! ```text
//! 序列化   → {"type":"shell_completed","type":"approvals_scanned",…}   ← 重复键
//! 反序列化 → Err("duplicate field `type`")
//! ```
//!
//! **这个形状根本无法往返**，而且不会在编译期报错，只会在第一次真正跨界时炸掉。参考实现
//! crux-demo 的 `ReleaseEvent::ShellCompleted(ReleaseShellResult)` 正是这个形状，照抄就会踩。
//!
//! 命名字段 `result` 把内层隔进一个独立对象，两层标签各归各的。这个用例把该格式钉死，
//! 以免日后有人「顺手简化」回去。

use biubiu_core::app::revoke::{RevokeEvent, RevokeShellResult};

#[test]
fn shell_result_survives_a_json_round_trip() {
    let event = RevokeEvent::ShellCompleted {
        result: RevokeShellResult::PersistCompleted {
            operation_id: 7,
            ok: true,
        },
    };

    let json = serde_json::to_string(&event).expect("事件应当可序列化");
    assert_eq!(
        json,
        r#"{"type":"shell_completed","result":{"type":"persist_completed","operation_id":7,"ok":true}}"#
    );

    let back: RevokeEvent = serde_json::from_str(&json).expect("事件应当可反序列化");
    assert!(matches!(
        back,
        RevokeEvent::ShellCompleted {
            result: RevokeShellResult::PersistCompleted {
                operation_id: 7,
                ok: true
            }
        }
    ));
}

/// 宿主手写这个 JSON 时最容易犯的错：把内层字段摊平到外层。核心必须拒绝，而不是静默接受。
#[test]
fn a_flattened_shell_result_is_rejected_rather_than_silently_accepted() {
    let flattened = r#"{"type":"shell_completed","operation_id":7,"ok":true}"#;
    assert!(serde_json::from_str::<RevokeEvent>(flattened).is_err());
}
