//! 把跨越 WASM 边界的 JSON 契约导出为 TypeScript（宪法原则 IV，FR-005/FR-006）。
//!
//! 输出目录不入库，也不得手工编辑：它是 Rust 源码的函数。入库或手改，必然出现
//! 「TS 改了 Rust 没改」的僵尸差异 —— 而 JSON 边界不会在编译期报错。
//!
//! `export_all` 是递归的：给一个根类型，它连带写出其中嵌套的每个事件、视图、
//! 请求与结果类型。

use std::{env, fs, path::PathBuf};

use biubiu_core::app::revoke::{RevokeEvent, RevokeOperation, RevokeShellResult, RevokeViewModel};
use biubiu_core::app::sender::{SenderEvent, SenderOperation, SenderShellResult, SenderViewModel};
use ts_rs::{Config, TS};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR")?);
    let output_dir = manifest_dir.join("../../../apps/biubiu.tools/src/lib/generated");
    fs::create_dir_all(&output_dir)?;

    let config = Config::new().with_out_dir(&output_dir);

    RevokeEvent::export_all(&config)?;
    RevokeOperation::export_all(&config)?;
    RevokeShellResult::export_all(&config)?;
    RevokeViewModel::export_all(&config)?;

    SenderEvent::export_all(&config)?;
    SenderOperation::export_all(&config)?;
    SenderShellResult::export_all(&config)?;
    SenderViewModel::export_all(&config)?;

    println!(
        "已生成 TypeScript 契约: {}",
        output_dir.canonicalize()?.display()
    );
    Ok(())
}
