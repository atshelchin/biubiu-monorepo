//! 每个业务域在这里得到一个导出类。除此之外，这个 crate 不该增长。
//!
//! **一次构建只导出一个域**（`--features domain-<name>`）。合并导出会让每个页面都下载
//! 全部域的代码 —— 两个域已经是 588 KB，十四个域会到 3.4 MB，而每个工具都是独立页面，
//! 用户通常只用其中一个（spec 004 research.md D31）。

mod bridge;

use bridge::bridge_class;

#[cfg(feature = "domain-revoke")]
bridge_class!(RevokeCore, biubiu_core::app::revoke::RevokeApp, debug);

#[cfg(feature = "domain-sender")]
bridge_class!(SenderCore, biubiu_core::app::sender::SenderApp, debug);
