//! 把跨越 WASM 边界的 JSON 契约导出为 TypeScript（宪法原则 IV，FR-005/FR-006）。
//!
//! 输出目录不入库，也不得手工编辑：它是 Rust 源码的函数。入库或手改，必然出现
//! 「TS 改了 Rust 没改」的僵尸差异 —— 而 JSON 边界不会在编译期报错。
//!
//! # 每个域一个子目录
//!
//! 文件名就是类型名。两个域各自定义一个叫 `Network` 的类型，写进同一个目录就会互相覆盖 ——
//! **`ts-rs` 不报错，后写的赢**。
//!
//! 这不是假想：spec 002 落地时 `revoke` 与 `sender` 同时有 `Network` 和 `SendPhase`，
//! 覆盖发生了，直到 `svelte-check` 才在十几处报出「属性不存在」。
//!
//! 第一版的应对是「生成后比对内容、发现覆盖就报错」。**那个守卫是假的**：`export_all` 在
//! 每个域的调用里都会重写它注册过的全部类型，最终文件内容取决于最后一次写入，两次快照读到
//! 的内容因此相同，冲突被自己掩盖了。写完之后实测它不响，才发现这一点。
//!
//! 所以改成**按域分目录**：`generated/revoke/` 与 `generated/sender/`。冲突不再需要检测，
//! 因为它不可能发生 —— 让错误的事情做不出来，胜过让它可被发现。
//!
//! 代价是两个域若真有同名同形的类型，会各留一份副本。这恰恰是想要的：每个域的合约自包含，
//! 一个域改自己的线类型不会波及另一个。

use std::{env, fs, path::PathBuf};

use biubiu_core::app::revoke::{RevokeEvent, RevokeOperation, RevokeShellResult, RevokeViewModel};
use biubiu_core::app::sender::{SenderEvent, SenderOperation, SenderShellResult, SenderViewModel};
use ts_rs::{Config, TS};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR")?);
    let root = manifest_dir.join("../../../apps/biubiu.tools/src/lib/generated");

    // 每次重新生成前清空：删掉一个 Rust 类型时，它的 .ts 也该消失，否则宿主还能 import 到
    // 一个已经不存在的合约。
    if root.exists() {
        fs::remove_dir_all(&root)?;
    }

    let revoke_dir = root.join("revoke");
    fs::create_dir_all(&revoke_dir)?;
    let revoke = Config::new().with_out_dir(&revoke_dir);
    RevokeEvent::export_all(&revoke)?;
    RevokeOperation::export_all(&revoke)?;
    RevokeShellResult::export_all(&revoke)?;
    RevokeViewModel::export_all(&revoke)?;

    let sender_dir = root.join("sender");
    fs::create_dir_all(&sender_dir)?;
    let sender = Config::new().with_out_dir(&sender_dir);
    SenderEvent::export_all(&sender)?;
    SenderOperation::export_all(&sender)?;
    SenderShellResult::export_all(&sender)?;
    SenderViewModel::export_all(&sender)?;

    let count = |dir: &PathBuf| -> std::io::Result<usize> {
        Ok(fs::read_dir(dir)?
            .filter_map(Result::ok)
            .filter(|e| e.path().extension().is_some_and(|x| x == "ts"))
            .count())
    };

    println!(
        "已生成 TypeScript 契约: {}\n  revoke/ {} 个类型\n  sender/ {} 个类型",
        root.canonicalize()?.display(),
        count(&revoke_dir)?,
        count(&sender_dir)?,
    );
    Ok(())
}
