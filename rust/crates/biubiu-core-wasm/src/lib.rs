//! 每个业务域在这里得到一个导出类。除此之外，这个 crate 不该增长。

mod bridge;

use bridge::bridge_class;

bridge_class!(RevokeCore, biubiu_core::app::revoke::RevokeApp, debug);
bridge_class!(SenderCore, biubiu_core::app::sender::SenderApp, debug);
