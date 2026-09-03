//! 授权撤销：业务状态与规则（spec `001-biubiu-core-crux`）。
//!
//! # 这里拥有什么
//!
//! 「同一个所有者 + 同一条链只自动扫一次」「切链使在途扫描失效」「撤销进行中不接受新请求」
//! 「成功后从表中移除对应行」「成功提示是短暂的、失败提示不是」「自定义条目变更后必须重扫」
//! 「持久化失败不影响本次会话」。
//!
//! # 这里不拥有什么
//!
//! Multicall 组装、RPC 故障转移、ABI 编码（`approve(spender,0)` / `setApprovalForAll` /
//! `Permit2.lockdown`）、钱包签名、IndexedDB 读写、`setTimeout`。这些是**怎么做**，不是
//! **是否允许做** —— 全部留在宿主（research.md D6）。
//!
//! # 为什么这些规则值得搬过来
//!
//! 迁移前它们住在 `pda-apps/revoke/store.svelte.ts` 里，与异步流程缠在一起：
//!
//! - 「切链后旧扫描结果不得落到新链」靠一个私有的 `scanGen` 单调计数器 + 三处 `if (gen !==
//!   this.scanGen) return`。验证它需要真浏览器、真网络、真竞态。
//! - 「关闭提示后自动收起不得再触发」靠记得调 `clearTimeout`。忘一次就是一个幽灵状态变更。
//!
//! 搬进核心后，这两条都归结为同一个机制：**每个跨宿主的操作带一个核心分配的 `operation_id`，
//! 结果回来时先查在途表，查不到就丢弃**。正确性不再依赖宿主的自律，也不再需要浏览器才能测。

use std::collections::BTreeMap;

use crux_core::macros::effect;
use crux_core::render::{RenderOperation, render};
use crux_core::{App, Command, Request};
use serde::{Deserialize, Serialize};

use super::SplitEffect;
use crux_core::capability::Operation;

pub mod registry {
    pub use super::super::revoke_registry::*;
}
use registry::{MULTICALL3, spenders_for_chain, tokens_for_chain};

#[cfg(feature = "bindings")]
use ts_rs::TS;

/// 成功提示自动收起的时长。**这是业务策略，所以住在核心**；宿主只负责按这个数字计时
/// （research.md D5）。
const NOTICE_DISMISS_MS: u64 = 6_000;

/// 解析不到当前 slug 时回退到的网络。与迁移前的 `DEFAULT_SLUG` 一致。
const DEFAULT_SLUG: &str = "eth-mainnet";

// ---------------------------------------------------------------------------
// 值类型
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[serde(rename_all = "snake_case")]
pub enum TokenStandard {
    Erc20,
    Erc721,
    Erc1155,
}

impl TokenStandard {
    /// 行标识里的段名。**必须与迁移前逐字一致**（FR-021）。
    fn id_segment(self) -> &'static str {
        match self {
            Self::Erc20 => "erc20",
            Self::Erc721 => "erc721",
            Self::Erc1155 => "erc1155",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[serde(rename_all = "snake_case")]
pub enum SpenderKind {
    Dex,
    Permit2,
    Marketplace,
    Bridge,
    Lending,
    Other,
}

/// 一个要探测授权的代币/收藏品。
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct TokenEntry {
    pub standard: TokenStandard,
    pub address: String,
    pub symbol: String,
    pub name: Option<String>,
    /// 仅 ERC20。
    pub decimals: Option<u8>,
    #[serde(default)]
    pub is_custom: bool,
}

impl TokenEntry {
    /// 去重键：标准 + 小写地址。
    fn dedupe_key(&self) -> String {
        format!(
            "{}:{}",
            self.standard.id_segment(),
            self.address.to_ascii_lowercase()
        )
    }
}

/// 一个已知的授权接收方。
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct SpenderEntry {
    pub address: String,
    pub label: String,
    pub kind: SpenderKind,
    #[serde(default)]
    pub is_custom: bool,
}

/// 一条可扫描的网络。
///
/// 内置网络由**宿主**在启动时供给（research.md D12）：它们派生自钱包的 `CHAINS`，属于尚未
/// 迁移的 wallet 域，复制进核心会制造两份真相。核心拥有的是网络相关的**规则**，不是那张表。
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct Network {
    pub slug: String,
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub chain_id: u64,
    pub name: String,
    pub symbol: String,
    /// 读取 RPC，故障转移顺序，首个为主。
    pub rpcs: Vec<String>,
    /// 区块浏览器基址，无尾部斜杠。
    pub explorer_url: String,
    pub multicall3: String,
    #[serde(default)]
    pub is_testnet: bool,
    #[serde(default)]
    pub is_custom: bool,
}

/// 宿主扫描出来的一条原始授权，**不带 id**。
///
/// id 由核心生成（FR-021）。这不是形式主义：逐行状态（进行中的转圈）靠 id 对齐，规则一变，
/// 重新扫描后逐行状态就会错位。让宿主生成，就等于把这条规则复制到每一个平台壳里，然后指望
/// 它们各自不写错。宿主**没有机会**弄错，才是这条要求的实质。
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct ScannedApproval {
    pub standard: TokenStandard,
    pub token: String,
    pub token_symbol: String,
    pub token_name: Option<String>,
    pub decimals: Option<u8>,
    pub spender: String,
    pub spender_label: Option<String>,
    pub spender_kind: Option<SpenderKind>,
    /// 十进制字符串，仅 ERC20。核心不对它做算术（research.md D4）。
    pub allowance: Option<String>,
    pub approved_for_all: Option<bool>,
    /// 额度实际无上限 —— 高风险的那一类。**由宿主在读链时判定**（256 位比较）。
    pub unlimited: bool,
    #[serde(default)]
    pub from_logs: bool,
    /// Permit2 子额度：撤销走 `lockdown` 而不是 `approve(0)`。
    #[serde(default)]
    pub is_permit2: bool,
}

impl ScannedApproval {
    /// `{standard}:{token}:{spender}`，三段全小写。
    ///
    /// Permit2 子额度的标准段是字面量 `permit2`，不是它底层代币的标准 —— 与迁移前
    /// `infra/multicall.ts` 的 `rowId('permit2', …)` 逐字一致。
    fn into_row(self) -> ApprovalRow {
        let segment = if self.is_permit2 {
            "permit2"
        } else {
            self.standard.id_segment()
        };
        ApprovalRow {
            id: format!(
                "{segment}:{}:{}",
                self.token.to_ascii_lowercase(),
                self.spender.to_ascii_lowercase()
            ),
            standard: self.standard,
            token: self.token,
            token_symbol: self.token_symbol,
            token_name: self.token_name,
            decimals: self.decimals,
            spender: self.spender,
            spender_label: self.spender_label,
            spender_kind: self.spender_kind,
            allowance: self.allowance,
            approved_for_all: self.approved_for_all,
            unlimited: self.unlimited,
            from_logs: self.from_logs,
            is_permit2: self.is_permit2,
        }
    }
}

/// 一条当前生效的授权 —— 表格里的一行。
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct ApprovalRow {
    /// 稳定标识 `{standard}:{token}:{spender}`，三段全小写。
    pub id: String,
    pub standard: TokenStandard,
    pub token: String,
    pub token_symbol: String,
    pub token_name: Option<String>,
    pub decimals: Option<u8>,
    pub spender: String,
    pub spender_label: Option<String>,
    pub spender_kind: Option<SpenderKind>,
    /// 十进制字符串，仅 ERC20。核心不对它做算术（research.md D4）。
    pub allowance: Option<String>,
    pub approved_for_all: Option<bool>,
    /// 额度实际无上限 —— 高风险的那一类。**由宿主在读链时判定**（256 位比较）。
    pub unlimited: bool,
    #[serde(default)]
    pub from_logs: bool,
    /// Permit2 子额度：撤销走 `lockdown` 而不是 `approve(0)`。
    #[serde(default)]
    pub is_permit2: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[serde(rename_all = "snake_case")]
pub enum RowFilter {
    #[default]
    All,
    Unlimited,
}

/// 撤销的进度档位。逐字沿用宿主既有的 `SendStatus`
/// （`apps/biubiu.tools/src/lib/auth/safe-tx/send-token.ts`）—— 少一档就是少一档用户可见的
/// 进度反馈。
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[serde(rename_all = "snake_case")]
pub enum SendPhase {
    Checking,
    Building,
    Estimating,
    Signing,
    Submitting,
    Waiting,
    Confirmed,
    Failed,
}

/// 提示条。成功是短暂的，失败要人来关 —— 这个区别是业务决定，因此编码在类型里。
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Notice {
    Success {
        tx_hash: Option<String>,
        explorer_url: Option<String>,
    },
    Failure {
        message: String,
    },
}

// ---------------------------------------------------------------------------
// Model —— 内部状态，永不出现在 ViewModel 里
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq)]
enum ScanState {
    /// 尚未扫描（刚切链、还没有 owner）。
    Idle,
    /// 有一次扫描在途。
    Scanning,
    /// 至少成功过一次（结果可能是空表）。
    Scanned,
    Failed(String),
}

/// 一个已发出、尚未有答案的宿主请求。
///
/// **这张表是整个设计的支点**：任何结果回到核心，第一步永远是 `in_flight.remove(&id)`，
/// 拿不到就丢弃。宿主因此不需要、也不允许持有任何代次计数器。
#[derive(Clone, Debug, PartialEq, Eq)]
enum InFlightOp {
    Scan {
        chain_id: u64,
        owner: String,
    },
    Revoke {
        row_ids: Vec<String>,
    },
    Persist,
    /// 提示条的自动收起计时。
    Dismiss,
    /// 按 chainId 添加网络时的元数据取数。
    ChainMetadata {
        chain_id: u64,
        rpc_override: Option<String>,
    },
}

pub struct RevokeModel {
    network_slug: String,
    /// 由宿主在启动时供给（research.md D12）。
    builtin_networks: Vec<Network>,
    custom_networks: Vec<Network>,
    custom_tokens: BTreeMap<u64, Vec<TokenEntry>>,
    custom_spenders: BTreeMap<u64, Vec<SpenderEntry>>,
    rows: Vec<ApprovalRow>,
    scan: ScanState,
    /// `"<owner 小写>:<chain_id>"` —— 自动扫描的去重键。
    last_scan_key: Option<String>,
    filter: RowFilter,
    /// 保持用户点选顺序。
    selected_ids: Vec<String>,
    revoke_phase: Option<SendPhase>,
    /// 正在撤销的行；空 ⇒ 当前没有撤销在进行。
    revoking_ids: Vec<String>,
    notice: Option<Notice>,
    owner: Option<String>,
    gas_fee_token: Option<String>,
    /// 钱包是否是 biubiu 内置钱包（自定义链上它没有 bundler 基础设施）。
    wallet_is_biubiu: bool,
    in_flight: BTreeMap<u64, InFlightOp>,
    next_operation_id: u64,
}

impl Default for RevokeModel {
    fn default() -> Self {
        Self {
            network_slug: DEFAULT_SLUG.to_owned(),
            builtin_networks: Vec::new(),
            custom_networks: Vec::new(),
            custom_tokens: BTreeMap::new(),
            custom_spenders: BTreeMap::new(),
            rows: Vec::new(),
            scan: ScanState::Idle,
            last_scan_key: None,
            filter: RowFilter::All,
            selected_ids: Vec::new(),
            revoke_phase: None,
            revoking_ids: Vec::new(),
            notice: None,
            owner: None,
            gas_fee_token: None,
            wallet_is_biubiu: false,
            in_flight: BTreeMap::new(),
            next_operation_id: 0,
        }
    }
}

impl RevokeModel {
    fn is_revoking(&self) -> bool {
        !self.revoking_ids.is_empty()
    }

    /// 内置 + 自定义，显示顺序。
    fn networks(&self) -> Vec<&Network> {
        self.builtin_networks
            .iter()
            .chain(self.custom_networks.iter())
            .collect()
    }

    /// 当前选中的网络；解析不到时回退默认网络，再回退第一个。
    fn network(&self) -> Option<&Network> {
        let all = self.networks();
        all.iter()
            .find(|n| n.slug == self.network_slug)
            .or_else(|| all.iter().find(|n| n.slug == DEFAULT_SLUG))
            .or(all.first())
            .copied()
    }

    fn chain_id(&self) -> Option<u64> {
        self.network().map(|n| n.chain_id)
    }

    /// 分配一个在途操作 id 并登记。
    fn begin(&mut self, op: InFlightOp) -> u64 {
        self.next_operation_id += 1;
        let id = self.next_operation_id;
        self.in_flight.insert(id, op);
        id
    }

    /// 作废某一类在途操作（切链让扫描失效、关闭提示让自动收起失效）。
    fn cancel_in_flight(&mut self, pred: impl Fn(&InFlightOp) -> bool) {
        self.in_flight.retain(|_, op| !pred(op));
    }
}

// ---------------------------------------------------------------------------
// 线类型：Event / Operation / ShellResult
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[cfg_attr(feature = "bindings", ts(export))]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RevokeEvent {
    /// 页面挂载。触发自定义数据回灌。
    PageReady,
    /// 钱包连接 / 切换 / 断开。
    WalletChanged {
        owner: Option<String>,
        #[serde(default)]
        is_biubiu: bool,
    },
    /// 宿主供给内置网络表（research.md D12）。
    NetworksProvided {
        networks: Vec<Network>,
    },
    SetNetwork {
        slug: String,
    },
    RequestScan,
    SetFilter {
        filter: RowFilter,
    },
    ToggleRow {
        id: String,
    },
    SelectAllVisible,
    ClearSelection,
    SetGasFeeToken {
        token: Option<String>,
    },
    RevokeOne {
        id: String,
    },
    RevokeSelected,
    DismissNotice,
    AddCustomToken {
        standard: TokenStandard,
        address: String,
        symbol: String,
        name: Option<String>,
        decimals: Option<u8>,
    },
    RemoveCustomToken {
        address: String,
    },
    AddCustomSpender {
        address: String,
        label: String,
    },
    RemoveCustomSpender {
        address: String,
    },
    AddNetworkByChainId {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        chain_id: u64,
        rpc_override: Option<String>,
    },
    RemoveCustomNetwork {
        slug: String,
    },

    /// 宿主的应答**统一**从这里进核心。
    ///
    /// 只有一个入口，所以「先查在途表」这一步只写一次，不可能被某个新增分支绕过。
    /// 命名字段而不是元组变体 —— 内部标签枚举直接套内部标签枚举会产生重复的 `type` 键且
    /// 完全无法反序列化（research.md D11）。
    ShellCompleted {
        result: RevokeShellResult,
    },
}

/// 核心对宿主的请求。每一句都只表达意图 —— 没有端点、没有超时、没有重试策略。
///
/// 它是**生成入口的一个根**：宿主的 `execute()` 要对它做穷尽 switch，新增一个 operation 时
/// TypeScript 才会报未覆盖。从 Event / ShellResult / ViewModel 都到不了它，所以必须显式导出。
#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[cfg_attr(feature = "bindings", ts(export))]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RevokeOperation {
    ScanApprovals {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        chain_id: u64,
        rpcs: Vec<String>,
        multicall3: String,
        owner: String,
        /// 内置与自定义**已合并去重**。宿主不查注册表，只按这份清单扫。
        tokens: Vec<TokenEntry>,
        spenders: Vec<SpenderEntry>,
    },
    RevokeApprovals {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        chain_id: u64,
        explorer_url: String,
        gas_fee_token: Option<String>,
        rows: Vec<RevokeTarget>,
    },
    /// 请在 `delay_ms` 之后叫我。宿主**不需要**保存 timer 句柄以便取消 —— 取消由核心的 id
    /// 判定完成（research.md D5）。
    ScheduleDismiss {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        delay_ms: u64,
    },
    FetchChainMetadata {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        chain_id: u64,
    },
    LoadCustomData {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
    },
    /// 整体回写，而非增量指令 —— 核心是这三张表的唯一真相来源，宿主只负责落盘。
    PersistCustomData {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        networks: Vec<Network>,
        tokens: Vec<ChainTokens>,
        spenders: Vec<ChainSpenders>,
    },
}

/// 待撤销的一行，只带宿主编码交易需要的业务标识。
#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct RevokeTarget {
    pub id: String,
    pub standard: TokenStandard,
    pub token: String,
    pub spender: String,
    pub is_permit2: bool,
}

/// 按链归属的自定义代币。用数组而不是 map，因为 JSON 对象的键只能是字符串，
/// 而 `chain_id` 是数字 —— 数组让两侧的类型都保持诚实。
#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct ChainTokens {
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub chain_id: u64,
    pub tokens: Vec<TokenEntry>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct ChainSpenders {
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub chain_id: u64,
    pub spenders: Vec<SpenderEntry>,
}

impl Operation for RevokeOperation {
    type Output = RevokeShellResult;
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[cfg_attr(feature = "bindings", ts(export))]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RevokeShellResult {
    ApprovalsScanned {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        rows: Vec<ScannedApproval>,
    },
    ScanFailed {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        message: String,
    },
    /// 纯进度通知，但**同样带 id** —— 一次已被取代的撤销的进度不得点亮当前的进度条。
    RevokePhaseChanged {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        phase: SendPhase,
    },
    RevokeCompleted {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        success: bool,
        tx_hash: Option<String>,
        explorer_url: Option<String>,
        error: Option<String>,
    },
    DismissDue {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
    },
    ChainMetadataFetched {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        found: bool,
        name: Option<String>,
        symbol: Option<String>,
        explorer_url: Option<String>,
        rpcs: Vec<String>,
        #[serde(default)]
        is_testnet: bool,
    },
    CustomDataLoaded {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        networks: Vec<Network>,
        tokens: Vec<ChainTokens>,
        spenders: Vec<ChainSpenders>,
    },
    PersistCompleted {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        ok: bool,
    },
}

#[effect]
pub enum RevokeEffect {
    Render(RenderOperation),
    Shell(RevokeOperation),
}

impl SplitEffect for RevokeEffect {
    type Op = RevokeOperation;

    fn into_shell(self) -> Option<Request<RevokeOperation>> {
        match self {
            Self::Render(_) => None,
            Self::Shell(request) => Some(request),
        }
    }
}

// ---------------------------------------------------------------------------
// ViewModel —— 对外投影
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct NetworkView {
    pub slug: String,
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub chain_id: u64,
    pub name: String,
    pub symbol: String,
    pub explorer_url: String,
    pub is_testnet: bool,
    pub is_custom: bool,
}

impl From<&Network> for NetworkView {
    fn from(n: &Network) -> Self {
        Self {
            slug: n.slug.clone(),
            chain_id: n.chain_id,
            name: n.name.clone(),
            symbol: n.symbol.clone(),
            explorer_url: n.explorer_url.clone(),
            is_testnet: n.is_testnet,
            is_custom: n.is_custom,
        }
    }
}

/// 已经是可渲染形态：`is_selected` / `is_pending` 是核心算好的布尔值，宿主模板里不该再出现
/// `selectedIds.includes(id)` 这类集合查找。
#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct ApprovalRowView {
    pub id: String,
    pub standard: TokenStandard,
    pub token: String,
    pub token_symbol: String,
    pub token_name: Option<String>,
    pub decimals: Option<u8>,
    pub spender: String,
    pub spender_label: Option<String>,
    pub spender_kind: Option<SpenderKind>,
    pub allowance: Option<String>,
    pub approved_for_all: Option<bool>,
    pub unlimited: bool,
    pub from_logs: bool,
    pub is_permit2: bool,
    pub is_selected: bool,
    pub is_pending: bool,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct RevokeViewModel {
    pub networks: Vec<NetworkView>,
    pub network: Option<NetworkView>,
    pub owner: Option<String>,
    /// 已应用 filter 的可见行。
    pub rows: Vec<ApprovalRowView>,
    pub total_count: usize,
    pub unlimited_count: usize,
    pub filter: RowFilter,
    pub selected_count: usize,
    pub is_scanning: bool,
    pub has_scanned: bool,
    pub scan_error: Option<String>,
    pub is_revoking: bool,
    pub revoke_phase: Option<SendPhase>,
    pub notice: Option<Notice>,
    pub gas_fee_token: Option<String>,
    pub can_scan: bool,
    pub can_revoke_selected: bool,
    /// 自定义链 + biubiu 钱包 ⇒ false（自定义链上没有 bundler 基础设施）。
    pub send_supported: bool,
    pub custom_tokens: Vec<TokenEntry>,
    pub custom_spenders: Vec<SpenderEntry>,

    /// 开发期快照。release 构建中这个字段不存在，因此内部记账**不可能**泄漏到生产视图。
    #[cfg(feature = "devtools")]
    #[cfg_attr(feature = "bindings", ts(skip))]
    pub debug: RevokeDebugSnapshot,
}

/// 开发期快照。**只在 `--features devtools` 下存在**，release 构建里这段代码不编译。
///
/// 它存在的理由是让内部记账**不必**为了可观测而挤进 `ViewModel`：在途表、单调计数器、
/// 自动扫描去重键对渲染毫无用处，一旦进了视图，宿主早晚会去读它，业务判断也就漏回了宿主。
#[cfg(feature = "devtools")]
#[derive(Clone, Debug, Serialize)]
pub struct RevokeDebugSnapshot {
    /// `"<id>: <操作种类>"`，便于一眼看出谁还在途。
    in_flight: Vec<String>,
    next_operation_id: u64,
    last_scan_key: Option<String>,
    scan: String,
    revoking_ids: Vec<String>,
    selected_ids: Vec<String>,
}

#[cfg(feature = "devtools")]
impl super::DebugSnapshot for RevokeViewModel {
    fn debug_snapshot(&self) -> serde_json::Value {
        serde_json::to_value(&self.debug).unwrap_or(serde_json::Value::Null)
    }
}

#[cfg(feature = "devtools")]
fn debug_snapshot(model: &RevokeModel) -> RevokeDebugSnapshot {
    RevokeDebugSnapshot {
        in_flight: model
            .in_flight
            .iter()
            .map(|(id, op)| {
                let kind = match op {
                    InFlightOp::Scan { chain_id, .. } => format!("scan(chain {chain_id})"),
                    InFlightOp::Revoke { row_ids } => format!("revoke({} rows)", row_ids.len()),
                    InFlightOp::Persist => "persist".to_owned(),
                    InFlightOp::Dismiss => "dismiss".to_owned(),
                    InFlightOp::ChainMetadata { chain_id, .. } => {
                        format!("chain-metadata({chain_id})")
                    }
                };
                format!("{id}: {kind}")
            })
            .collect(),
        next_operation_id: model.next_operation_id,
        last_scan_key: model.last_scan_key.clone(),
        scan: format!("{:?}", model.scan),
        revoking_ids: model.revoking_ids.clone(),
        selected_ids: model.selected_ids.clone(),
    }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct RevokeApp;

impl App for RevokeApp {
    type Event = RevokeEvent;
    type Model = RevokeModel;
    type ViewModel = RevokeViewModel;
    type Effect = RevokeEffect;

    fn update(
        &self,
        event: Self::Event,
        model: &mut Self::Model,
    ) -> Command<Self::Effect, Self::Event> {
        match event {
            RevokeEvent::PageReady => {
                let id = model.begin(InFlightOp::Persist);
                // 启动回灌走 Persist 这一类在途标记：它与持久化共用「失败不回滚」的语义。
                let load = request(RevokeOperation::LoadCustomData { operation_id: id });
                Command::all([load, render()])
            }

            RevokeEvent::NetworksProvided { networks } => {
                model.builtin_networks = networks;
                maybe_auto_scan(model)
            }

            RevokeEvent::WalletChanged { owner, is_biubiu } => {
                let owner = owner.map(|o| o.to_ascii_lowercase());
                model.wallet_is_biubiu = is_biubiu;
                // 同一个钱包再次上报（页面重新挂载、无关的钱包状态刷新）**不是**换目标：
                // 迁移前 `autoScan` 的去重键是 owner+chain，同一个钱包不会触发第二次扫描。
                // 无条件 reset 会把 last_scan_key 清空，变成每次上报都重扫 —— 一次行为改变。
                if owner == model.owner {
                    return render();
                }
                model.owner = owner;
                reset_for_new_target(model);
                maybe_auto_scan(model)
            }

            RevokeEvent::SetNetwork { slug } => set_network(model, slug),

            RevokeEvent::RequestScan => start_scan(model),

            RevokeEvent::SetFilter { filter } => {
                model.filter = filter;
                render()
            }

            RevokeEvent::ToggleRow { id } => {
                if let Some(pos) = model.selected_ids.iter().position(|x| *x == id) {
                    model.selected_ids.remove(pos);
                } else {
                    model.selected_ids.push(id);
                }
                render()
            }

            RevokeEvent::SelectAllVisible => {
                model.selected_ids = visible_rows(model).map(|r| r.id.clone()).collect();
                render()
            }

            RevokeEvent::ClearSelection => {
                model.selected_ids.clear();
                render()
            }

            RevokeEvent::SetGasFeeToken { token } => {
                model.gas_fee_token = token;
                render()
            }

            RevokeEvent::RevokeOne { id } => revoke_rows(model, vec![id]),

            RevokeEvent::RevokeSelected => {
                let ids = model.selected_ids.clone();
                revoke_rows(model, ids)
            }

            RevokeEvent::DismissNotice => {
                model.notice = None;
                // 作废在途的自动收起：它之后即使触发，id 也已不在表中。
                model.cancel_in_flight(|op| matches!(op, InFlightOp::Dismiss));
                render()
            }

            RevokeEvent::AddCustomToken {
                standard,
                address,
                symbol,
                name,
                decimals,
            } => add_custom_token(model, standard, address, symbol, name, decimals),

            RevokeEvent::RemoveCustomToken { address } => remove_custom_token(model, &address),

            RevokeEvent::AddCustomSpender { address, label } => {
                add_custom_spender(model, address, label)
            }

            RevokeEvent::RemoveCustomSpender { address } => remove_custom_spender(model, &address),

            RevokeEvent::AddNetworkByChainId {
                chain_id,
                rpc_override,
            } => add_network_by_chain_id(model, chain_id, rpc_override),

            RevokeEvent::RemoveCustomNetwork { slug } => remove_custom_network(model, &slug),

            RevokeEvent::ShellCompleted { result } => accept_result(model, result),
        }
    }

    fn view(&self, model: &Self::Model) -> Self::ViewModel {
        let selected: std::collections::BTreeSet<&String> = model.selected_ids.iter().collect();
        let pending: std::collections::BTreeSet<&String> = model.revoking_ids.iter().collect();
        let chain_id = model.chain_id();

        let rows = visible_rows(model)
            .map(|r| ApprovalRowView {
                id: r.id.clone(),
                standard: r.standard,
                token: r.token.clone(),
                token_symbol: r.token_symbol.clone(),
                token_name: r.token_name.clone(),
                decimals: r.decimals,
                spender: r.spender.clone(),
                spender_label: r.spender_label.clone(),
                spender_kind: r.spender_kind,
                allowance: r.allowance.clone(),
                approved_for_all: r.approved_for_all,
                unlimited: r.unlimited,
                from_logs: r.from_logs,
                is_permit2: r.is_permit2,
                is_selected: selected.contains(&r.id),
                is_pending: pending.contains(&r.id),
            })
            .collect::<Vec<_>>();

        let network = model.network();
        // 自定义链上 biubiu 钱包没有 bundler 基础设施；外部钱包可以。
        let send_supported =
            !(network.map(|n| n.is_custom).unwrap_or(false) && model.wallet_is_biubiu);
        let is_scanning = model.scan == ScanState::Scanning;

        RevokeViewModel {
            networks: model
                .networks()
                .into_iter()
                .map(NetworkView::from)
                .collect(),
            network: network.map(NetworkView::from),
            owner: model.owner.clone(),
            rows,
            total_count: model.rows.len(),
            unlimited_count: model.rows.iter().filter(|r| r.unlimited).count(),
            filter: model.filter,
            selected_count: model.selected_ids.len(),
            is_scanning,
            has_scanned: model.scan == ScanState::Scanned,
            scan_error: match &model.scan {
                ScanState::Failed(message) => Some(message.clone()),
                _ => None,
            },
            is_revoking: model.is_revoking(),
            revoke_phase: model.revoke_phase,
            notice: model.notice.clone(),
            gas_fee_token: model.gas_fee_token.clone(),
            can_scan: model.owner.is_some() && !is_scanning,
            can_revoke_selected: !model.selected_ids.is_empty()
                && !model.is_revoking()
                && send_supported,
            send_supported,
            custom_tokens: chain_id
                .and_then(|c| model.custom_tokens.get(&c))
                .cloned()
                .unwrap_or_default(),
            custom_spenders: chain_id
                .and_then(|c| model.custom_spenders.get(&c))
                .cloned()
                .unwrap_or_default(),
            #[cfg(feature = "devtools")]
            debug: debug_snapshot(model),
        }
    }
}

fn request(op: RevokeOperation) -> Command<RevokeEffect, RevokeEvent> {
    Command::request_from_shell(op).then_send(|result| RevokeEvent::ShellCompleted { result })
}

fn visible_rows(model: &RevokeModel) -> impl Iterator<Item = &ApprovalRow> {
    model
        .rows
        .iter()
        .filter(move |r| model.filter == RowFilter::All || r.unlimited)
}

// ---------------------------------------------------------------------------
// 扫描（data-model.md §4.1）
// ---------------------------------------------------------------------------

/// 切链 / 换钱包后的清空。**在途扫描被移出在途表**，因此它的结果回来时会被丢弃 ——
/// 这取代了迁移前的 `scanGen` 单调计数器（宪法原则 III）。
fn reset_for_new_target(model: &mut RevokeModel) {
    model.cancel_in_flight(|op| matches!(op, InFlightOp::Scan { .. }));
    model.rows.clear();
    model.scan = ScanState::Idle;
    model.selected_ids.clear();
    model.notice = None;
    model.cancel_in_flight(|op| matches!(op, InFlightOp::Dismiss));
    // 切链后所选稳定币可能不存在于新链 → 回退原生。
    model.gas_fee_token = None;
    // 强制新链上重新自动扫描。
    model.last_scan_key = None;
}

fn set_network(model: &mut RevokeModel, slug: String) -> Command<RevokeEffect, RevokeEvent> {
    if slug == model.network_slug {
        return Command::done();
    }
    model.network_slug = slug;
    reset_for_new_target(model);
    maybe_auto_scan(model)
}

/// 同一个 `owner + chain` 只自动扫一次（FR-011）。切链会把 `last_scan_key` 置空，
/// 因此切回来也算一次新的组合。
fn maybe_auto_scan(model: &mut RevokeModel) -> Command<RevokeEffect, RevokeEvent> {
    let (Some(owner), Some(chain_id)) = (model.owner.clone(), model.chain_id()) else {
        return render();
    };
    let key = format!("{owner}:{chain_id}");
    if model.last_scan_key.as_deref() == Some(key.as_str()) || model.scan == ScanState::Scanning {
        return render();
    }
    model.last_scan_key = Some(key);
    start_scan(model)
}

fn start_scan(model: &mut RevokeModel) -> Command<RevokeEffect, RevokeEvent> {
    let (Some(owner), Some(network)) = (model.owner.clone(), model.network().cloned()) else {
        return render();
    };

    // 一次新的扫描作废先前那次：先前那次的结果回来时 id 已不在表中。
    model.cancel_in_flight(|op| matches!(op, InFlightOp::Scan { .. }));

    let chain_id = network.chain_id;
    let tokens = merged_tokens(model, chain_id);
    let spenders = merged_spenders(model, chain_id);

    let operation_id = model.begin(InFlightOp::Scan {
        chain_id,
        owner: owner.clone(),
    });
    model.scan = ScanState::Scanning;
    model.selected_ids.clear();

    let multicall3 = if network.multicall3.is_empty() {
        MULTICALL3.to_owned()
    } else {
        network.multicall3.clone()
    };

    Command::all([
        request(RevokeOperation::ScanApprovals {
            operation_id,
            chain_id,
            rpcs: network.rpcs.clone(),
            multicall3,
            owner,
            tokens,
            spenders,
        }),
        render(),
    ])
}

/// 内置 + 自定义，按去重键保留**首次**出现 —— 因此同键时内置胜出（research.md D13）。
fn merged_tokens(model: &RevokeModel, chain_id: u64) -> Vec<TokenEntry> {
    let custom = model
        .custom_tokens
        .get(&chain_id)
        .cloned()
        .unwrap_or_default();
    super::dedupe_by(tokens_for_chain(chain_id).into_iter().chain(custom), |t| {
        t.dedupe_key()
    })
}

fn merged_spenders(model: &RevokeModel, chain_id: u64) -> Vec<SpenderEntry> {
    let custom = model
        .custom_spenders
        .get(&chain_id)
        .cloned()
        .unwrap_or_default();
    super::dedupe_by(
        spenders_for_chain(chain_id).into_iter().chain(custom),
        |s| s.address.to_ascii_lowercase(),
    )
}

/// 排序规则与迁移前一致：`unlimited` 降序 → symbol 升序 → spender 升序。
fn sort_rows(rows: &mut [ApprovalRow]) {
    rows.sort_by(|a, b| {
        b.unlimited
            .cmp(&a.unlimited)
            .then_with(|| a.token_symbol.cmp(&b.token_symbol))
            .then_with(|| a.spender.cmp(&b.spender))
    });
}

// ---------------------------------------------------------------------------
// 撤销（data-model.md §4.2）
// ---------------------------------------------------------------------------

fn revoke_rows(model: &mut RevokeModel, ids: Vec<String>) -> Command<RevokeEffect, RevokeEvent> {
    // 撤销进行中忽略新的触发（FR-014）。
    if model.is_revoking() {
        return Command::done();
    }

    let targets: Vec<RevokeTarget> = model
        .rows
        .iter()
        .filter(|r| ids.contains(&r.id))
        .map(|r| RevokeTarget {
            id: r.id.clone(),
            standard: r.standard,
            token: r.token.clone(),
            spender: r.spender.clone(),
            is_permit2: r.is_permit2,
        })
        .collect();

    // 空集合不产生任何对外请求（FR-014）。
    if targets.is_empty() {
        return Command::done();
    }

    let Some(network) = model.network().cloned() else {
        return Command::done();
    };

    // 开始撤销前先清掉旧提示，连带作废在途的自动收起。
    model.notice = None;
    model.cancel_in_flight(|op| matches!(op, InFlightOp::Dismiss));

    let row_ids: Vec<String> = targets.iter().map(|t| t.id.clone()).collect();
    let operation_id = model.begin(InFlightOp::Revoke {
        row_ids: row_ids.clone(),
    });
    model.revoking_ids = row_ids;
    model.revoke_phase = Some(SendPhase::Checking);

    Command::all([
        request(RevokeOperation::RevokeApprovals {
            operation_id,
            chain_id: network.chain_id,
            explorer_url: network.explorer_url.clone(),
            gas_fee_token: model.gas_fee_token.clone(),
            rows: targets,
        }),
        render(),
    ])
}

// ---------------------------------------------------------------------------
// 自定义条目（data-model.md §4.3）
// ---------------------------------------------------------------------------

/// 变更自定义条目后：整体回写 + 重扫。
///
/// 重扫前把 `last_scan_key` 置空，否则 `maybe_auto_scan` 会认为这个 owner+chain 已经扫过。
fn persist_and_rescan(model: &mut RevokeModel) -> Command<RevokeEffect, RevokeEvent> {
    let operation_id = model.begin(InFlightOp::Persist);
    let persist = request(RevokeOperation::PersistCustomData {
        operation_id,
        networks: model.custom_networks.clone(),
        tokens: chain_tokens(model),
        spenders: chain_spenders(model),
    });
    model.last_scan_key = None;
    Command::all([persist, maybe_auto_scan(model)])
}

fn chain_tokens(model: &RevokeModel) -> Vec<ChainTokens> {
    model
        .custom_tokens
        .iter()
        .map(|(chain_id, tokens)| ChainTokens {
            chain_id: *chain_id,
            tokens: tokens.clone(),
        })
        .collect()
}

fn chain_spenders(model: &RevokeModel) -> Vec<ChainSpenders> {
    model
        .custom_spenders
        .iter()
        .map(|(chain_id, spenders)| ChainSpenders {
            chain_id: *chain_id,
            spenders: spenders.clone(),
        })
        .collect()
}

fn add_custom_token(
    model: &mut RevokeModel,
    standard: TokenStandard,
    address: String,
    symbol: String,
    name: Option<String>,
    decimals: Option<u8>,
) -> Command<RevokeEffect, RevokeEvent> {
    let Some(chain_id) = model.chain_id() else {
        return Command::done();
    };
    let address = address.trim().to_owned();
    let entry = TokenEntry {
        standard,
        address,
        symbol,
        name,
        decimals,
        is_custom: true,
    };
    let list = model.custom_tokens.entry(chain_id).or_default();
    // 同键先移除再追加：重复添加同一个代币是更新，不是新增一条。
    let key = entry.dedupe_key();
    list.retain(|t| t.dedupe_key() != key);
    list.push(entry);
    persist_and_rescan(model)
}

fn remove_custom_token(
    model: &mut RevokeModel,
    address: &str,
) -> Command<RevokeEffect, RevokeEvent> {
    let Some(chain_id) = model.chain_id() else {
        return Command::done();
    };
    let lower = address.to_ascii_lowercase();
    if let Some(list) = model.custom_tokens.get_mut(&chain_id) {
        list.retain(|t| t.address.to_ascii_lowercase() != lower);
    }
    persist_and_rescan(model)
}

fn add_custom_spender(
    model: &mut RevokeModel,
    address: String,
    label: String,
) -> Command<RevokeEffect, RevokeEvent> {
    let Some(chain_id) = model.chain_id() else {
        return Command::done();
    };
    let address = address.trim().to_owned();
    let label = label.trim().to_owned();
    // 空标签回退为地址缩写，与迁移前一致。
    let label = if label.is_empty() {
        short_address(&address)
    } else {
        label
    };
    let entry = SpenderEntry {
        address,
        label,
        kind: SpenderKind::Other,
        is_custom: true,
    };
    let list = model.custom_spenders.entry(chain_id).or_default();
    let lower = entry.address.to_ascii_lowercase();
    list.retain(|s| s.address.to_ascii_lowercase() != lower);
    list.push(entry);
    persist_and_rescan(model)
}

fn remove_custom_spender(
    model: &mut RevokeModel,
    address: &str,
) -> Command<RevokeEffect, RevokeEvent> {
    let Some(chain_id) = model.chain_id() else {
        return Command::done();
    };
    let lower = address.to_ascii_lowercase();
    if let Some(list) = model.custom_spenders.get_mut(&chain_id) {
        list.retain(|s| s.address.to_ascii_lowercase() != lower);
    }
    persist_and_rescan(model)
}

/// `0x1234…abcd` —— 与迁移前的 `${addr.slice(0,6)}…${addr.slice(-4)}` 一致。
fn short_address(address: &str) -> String {
    if address.len() <= 10 {
        return address.to_owned();
    }
    format!("{}…{}", &address[..6], &address[address.len() - 4..])
}

fn custom_network_slug(chain_id: u64) -> String {
    format!("custom-{chain_id}")
}

fn add_network_by_chain_id(
    model: &mut RevokeModel,
    chain_id: u64,
    rpc_override: Option<String>,
) -> Command<RevokeEffect, RevokeEvent> {
    // 已有（内置或先前添加）⇒ 直接选中，不新增重复条目（FR-019）。
    if let Some(existing) = model
        .networks()
        .into_iter()
        .find(|n| n.chain_id == chain_id)
        .map(|n| n.slug.clone())
    {
        return set_network(model, existing);
    }

    let operation_id = model.begin(InFlightOp::ChainMetadata {
        chain_id,
        rpc_override,
    });
    Command::all([
        request(RevokeOperation::FetchChainMetadata {
            operation_id,
            chain_id,
        }),
        render(),
    ])
}

fn remove_custom_network(
    model: &mut RevokeModel,
    slug: &str,
) -> Command<RevokeEffect, RevokeEvent> {
    model.custom_networks.retain(|n| n.slug != slug);

    let operation_id = model.begin(InFlightOp::Persist);
    let persist = request(RevokeOperation::PersistCustomData {
        operation_id,
        networks: model.custom_networks.clone(),
        tokens: chain_tokens(model),
        spenders: chain_spenders(model),
    });

    // 删掉的正是当前选中的 ⇒ 回退默认网络，并执行切链的全部清空规则（FR-020）。
    let switch = if model.network_slug == slug {
        set_network(model, DEFAULT_SLUG.to_owned())
    } else {
        render()
    };

    Command::all([persist, switch])
}

// ---------------------------------------------------------------------------
// 宿主应答的单一入口
// ---------------------------------------------------------------------------

/// **每一个**宿主结果都从这里进核心，因此「先查在途表」这一步只写一次。
///
/// 拿不到 id ⇒ 答案活得比问题久（用户切了链、又发起了一次撤销、手动关了提示）。丢弃，
/// 不改变任何状态。这一条取代了迁移前散落在各处的 `if (gen !== this.scanGen) return`
/// 与 `clearTimeout`（宪法原则 III）。
fn accept_result(
    model: &mut RevokeModel,
    result: RevokeShellResult,
) -> Command<RevokeEffect, RevokeEvent> {
    match result {
        RevokeShellResult::ApprovalsScanned { operation_id, rows } => {
            let Some(InFlightOp::Scan { chain_id, .. }) = model.in_flight.remove(&operation_id)
            else {
                return Command::done();
            };
            // 即使 id 还在表中，也要确认它扫的是**当前**这条链。
            if model.chain_id() != Some(chain_id) {
                return Command::done();
            }
            let mut rows: Vec<ApprovalRow> =
                rows.into_iter().map(ScannedApproval::into_row).collect();
            sort_rows(&mut rows);
            model.rows = rows;
            model.scan = ScanState::Scanned;
            render()
        }

        RevokeShellResult::ScanFailed {
            operation_id,
            message,
        } => {
            let Some(InFlightOp::Scan { chain_id, .. }) = model.in_flight.remove(&operation_id)
            else {
                return Command::done();
            };
            // 陈旧的**失败**同样不得冒出来 —— 否则切链后会看到上一条链的报错。
            if model.chain_id() != Some(chain_id) {
                return Command::done();
            }
            model.scan = ScanState::Failed(message);
            model.rows.clear();
            render()
        }

        RevokeShellResult::RevokePhaseChanged {
            operation_id,
            phase,
        } => {
            // 纯进度通知，但一次已被取代的撤销的进度不得点亮当前进度条。
            if !matches!(
                model.in_flight.get(&operation_id),
                Some(InFlightOp::Revoke { .. })
            ) {
                return Command::done();
            }
            model.revoke_phase = Some(phase);
            render()
        }

        RevokeShellResult::RevokeCompleted {
            operation_id,
            success,
            tx_hash,
            explorer_url,
            error,
        } => {
            let Some(InFlightOp::Revoke { row_ids }) = model.in_flight.remove(&operation_id) else {
                return Command::done();
            };

            model.revoking_ids.clear();
            model.revoke_phase = None;

            if !success {
                // 失败提示持续到用户关闭 —— **不**排期自动收起。
                model.notice = Some(Notice::Failure {
                    message: error.unwrap_or_else(|| "failed".to_owned()),
                });
                return render();
            }

            model.rows.retain(|r| !row_ids.contains(&r.id));
            model.selected_ids.retain(|id| !row_ids.contains(id));
            model.notice = Some(Notice::Success {
                tx_hash,
                explorer_url,
            });

            // 成功提示是短暂的。时钟在宿主，但「6 秒」这个策略在核心（research.md D5）。
            let dismiss_id = model.begin(InFlightOp::Dismiss);
            Command::all([
                request(RevokeOperation::ScheduleDismiss {
                    operation_id: dismiss_id,
                    delay_ms: NOTICE_DISMISS_MS,
                }),
                render(),
            ])
        }

        RevokeShellResult::DismissDue { operation_id } => {
            // 用户已手动关闭、或又发生了一次撤销 ⇒ id 不在表中 ⇒ 丢弃。
            //
            // **即使宿主没有调用 clearTimeout、定时器照常触发**，也不会有第二次状态变更。
            // 正确性不依赖宿主的自律。
            if !matches!(
                model.in_flight.remove(&operation_id),
                Some(InFlightOp::Dismiss)
            ) {
                return Command::done();
            }
            model.notice = None;
            render()
        }

        RevokeShellResult::ChainMetadataFetched {
            operation_id,
            found,
            name,
            symbol,
            explorer_url,
            rpcs,
            is_testnet,
        } => {
            let Some(InFlightOp::ChainMetadata {
                chain_id,
                rpc_override,
            }) = model.in_flight.remove(&operation_id)
            else {
                return Command::done();
            };

            // 用户提供的 RPC 优先于取回来的，去重后保序。
            let merged = super::dedupe_by(
                rpc_override
                    .into_iter()
                    .filter(|r| !r.trim().is_empty())
                    .chain(rpcs),
                |r| r.clone(),
            );

            // 一条公开 RPC 都没有、用户也没给 ⇒ 明确失败，不添加网络（FR-019）。
            if merged.is_empty() {
                model.notice = Some(Notice::Failure {
                    message: "need-rpc".to_owned(),
                });
                return render();
            }

            let slug = custom_network_slug(chain_id);
            let network = Network {
                slug: slug.clone(),
                chain_id,
                name: name
                    .filter(|_| found)
                    .unwrap_or_else(|| format!("Chain {chain_id}")),
                symbol: symbol.filter(|_| found).unwrap_or_else(|| "ETH".to_owned()),
                rpcs: merged,
                explorer_url: explorer_url
                    .unwrap_or_default()
                    .trim_end_matches('/')
                    .to_owned(),
                multicall3: MULTICALL3.to_owned(),
                is_testnet,
                is_custom: true,
            };
            model.custom_networks.retain(|n| n.slug != slug);
            model.custom_networks.push(network);

            let persist_id = model.begin(InFlightOp::Persist);
            let persist = request(RevokeOperation::PersistCustomData {
                operation_id: persist_id,
                networks: model.custom_networks.clone(),
                tokens: chain_tokens(model),
                spenders: chain_spenders(model),
            });
            Command::all([persist, set_network(model, slug)])
        }

        RevokeShellResult::CustomDataLoaded {
            operation_id,
            networks,
            tokens,
            spenders,
        } => {
            if model.in_flight.remove(&operation_id).is_none() {
                return Command::done();
            }
            model.custom_networks = networks;
            model.custom_tokens = tokens.into_iter().map(|c| (c.chain_id, c.tokens)).collect();
            model.custom_spenders = spenders
                .into_iter()
                .map(|c| (c.chain_id, c.spenders))
                .collect();
            maybe_auto_scan(model)
        }

        RevokeShellResult::PersistCompleted { operation_id, ok } => {
            model.in_flight.remove(&operation_id);
            // 持久化失败**不回滚**内存中的条目（FR-018）。
            //
            // 这是一条业务决定 —— 它选择了可用性优先：本次会话仍然可用，只是重开后要重加。
            // 迁移前这条决定散落在四个 `try { … } catch { /* ignore */ }` 里，没有任何地方
            // 记录它是一个决定而不是偷懒。
            let _ = ok;
            Command::done()
        }
    }
}

// ---------------------------------------------------------------------------
// 业务规则测试（data-model.md §5 的 R-01 … R-21）
//
// 这些用例**不联网、不起浏览器、不等真实时间**（宪法原则 V）。时钟已经外化成一个请求，
// 所以「6 秒后自动收起」是用一个事件验证的，不是 sleep 6 秒。
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ---- 测试夹具 ----

    fn network(slug: &str, chain_id: u64) -> Network {
        Network {
            slug: slug.to_owned(),
            chain_id,
            name: slug.to_owned(),
            symbol: "ETH".to_owned(),
            rpcs: vec!["https://rpc.example".to_owned()],
            explorer_url: "https://explorer.example".to_owned(),
            multicall3: MULTICALL3.to_owned(),
            is_testnet: false,
            is_custom: false,
        }
    }

    /// 一个已连接钱包、已供给内置网络、停在 eth-mainnet 的模型。
    fn ready_model() -> RevokeModel {
        let app = RevokeApp;
        let mut model = RevokeModel::default();
        let _ = app.update(
            RevokeEvent::NetworksProvided {
                networks: vec![network(DEFAULT_SLUG, 1), network("base", 8453)],
            },
            &mut model,
        );
        let _ = app.update(
            RevokeEvent::WalletChanged {
                owner: Some("0xOWNER".to_owned()),
                is_biubiu: false,
            },
            &mut model,
        );
        model
    }

    /// 宿主会送来的形状 —— **不带 id**，id 由核心生成。
    fn row(
        standard: TokenStandard,
        token: &str,
        spender: &str,
        unlimited: bool,
    ) -> ScannedApproval {
        ScannedApproval {
            standard,
            token: token.to_owned(),
            token_symbol: "TKN".to_owned(),
            token_name: None,
            decimals: Some(18),
            spender: spender.to_owned(),
            spender_label: None,
            spender_kind: None,
            allowance: Some("1".to_owned()),
            approved_for_all: None,
            unlimited,
            from_logs: false,
            is_permit2: false,
        }
    }

    /// 已入核心的行（供不经过扫描路径的单元测试使用）。
    fn stored_row(
        standard: TokenStandard,
        token: &str,
        spender: &str,
        unlimited: bool,
    ) -> ApprovalRow {
        row(standard, token, spender, unlimited).into_row()
    }

    /// 当前唯一在途的扫描 id。
    fn scan_id(model: &RevokeModel) -> u64 {
        model
            .in_flight
            .iter()
            .find(|(_, op)| matches!(op, InFlightOp::Scan { .. }))
            .map(|(id, _)| *id)
            .expect("应当有一次扫描在途")
    }

    fn revoke_id(model: &RevokeModel) -> u64 {
        model
            .in_flight
            .iter()
            .find(|(_, op)| matches!(op, InFlightOp::Revoke { .. }))
            .map(|(id, _)| *id)
            .expect("应当有一次撤销在途")
    }

    fn dismiss_id(model: &RevokeModel) -> u64 {
        model
            .in_flight
            .iter()
            .find(|(_, op)| matches!(op, InFlightOp::Dismiss))
            .map(|(id, _)| *id)
            .expect("应当有一次自动收起在途")
    }

    fn send(model: &mut RevokeModel, result: RevokeShellResult) {
        let _ = RevokeApp.update(RevokeEvent::ShellCompleted { result }, model);
    }

    fn dispatch(model: &mut RevokeModel, event: RevokeEvent) {
        let _ = RevokeApp.update(event, model);
    }

    // -----------------------------------------------------------------------
    // R-01 … R-04 —— 陈旧响应。逐条对照迁移前 store.svelte.spec.ts 的 5 个断言。
    // -----------------------------------------------------------------------

    /// R-01：切链后，先前那次扫描的成功结果被丢弃。
    ///
    /// 迁移前对照：`discards a chain-A scan that resolves after switching to chain B`。
    #[test]
    fn stale_scan_from_the_previous_chain_is_discarded() {
        let mut model = ready_model();
        let chain_a_scan = scan_id(&model);

        dispatch(
            &mut model,
            RevokeEvent::SetNetwork {
                slug: "base".into(),
            },
        );

        // A 链的扫描现在才返回。
        send(
            &mut model,
            RevokeShellResult::ApprovalsScanned {
                operation_id: chain_a_scan,
                rows: vec![row(TokenStandard::Erc20, "0xAAA", "0xBBB", true)],
            },
        );

        assert!(model.rows.is_empty(), "A 链的结果不得落到 B 链上");
    }

    /// R-02：两次扫描交错时，只有最后一次的结果落地 —— 无论谁先返回。
    ///
    /// 迁移前对照：`lets the chain-B scan win even if the chain-A scan resolves last`
    /// 与 `only the latest of two overlapping same-chain scans writes rows`。
    #[test]
    fn only_the_latest_scan_writes_rows_regardless_of_arrival_order() {
        let mut model = ready_model();
        let first = scan_id(&model);

        // 同一条链上再发起一次扫描（例如刚加了一个自定义代币）。
        dispatch(&mut model, RevokeEvent::RequestScan);
        let second = scan_id(&model);
        assert_ne!(first, second);

        // 后发起的先返回。
        send(
            &mut model,
            RevokeShellResult::ApprovalsScanned {
                operation_id: second,
                rows: vec![row(TokenStandard::Erc20, "0xNEW", "0xBBB", true)],
            },
        );
        // 先发起的后返回 —— 必须被丢弃，不能覆盖。
        send(
            &mut model,
            RevokeShellResult::ApprovalsScanned {
                operation_id: first,
                rows: vec![row(TokenStandard::Erc20, "0xOLD", "0xBBB", true)],
            },
        );

        assert_eq!(model.rows.len(), 1);
        assert_eq!(model.rows[0].token, "0xNEW", "陈旧结果不得覆盖最新结果");
    }

    /// R-03：切链后，先前那次扫描的**失败**不产生错误提示。
    ///
    /// 迁移前对照：`does not surface a chain-A scan error after switching chains`。
    #[test]
    fn stale_scan_failure_does_not_surface_an_error() {
        let mut model = ready_model();
        let chain_a_scan = scan_id(&model);

        dispatch(
            &mut model,
            RevokeEvent::SetNetwork {
                slug: "base".into(),
            },
        );

        send(
            &mut model,
            RevokeShellResult::ScanFailed {
                operation_id: chain_a_scan,
                message: "chain A RPC died".to_owned(),
            },
        );

        let view = RevokeApp.view(&model);
        assert_eq!(view.scan_error, None, "陈旧失败不得冒到界面上");
    }

    /// R-04：较早的扫描结束，不得清除仍在途扫描的加载态。
    ///
    /// 迁移前对照：`an earlier scan finishing does not clear the spinner for a later
    /// in-flight scan` —— 那里靠 `if (gen === this.scanGen) this.scanning = false`。
    #[test]
    fn an_earlier_scan_finishing_leaves_the_later_one_loading() {
        let mut model = ready_model();
        let first = scan_id(&model);
        dispatch(&mut model, RevokeEvent::RequestScan);

        send(
            &mut model,
            RevokeShellResult::ApprovalsScanned {
                operation_id: first,
                rows: vec![],
            },
        );

        assert!(
            RevokeApp.view(&model).is_scanning,
            "后一次扫描仍在途，转圈不得停"
        );
    }

    // -----------------------------------------------------------------------
    // R-05 / R-06 / R-21 —— 自动扫描去重与切链清空
    // -----------------------------------------------------------------------

    /// R-05：同一 owner+chain 只自动扫描一次；切链后视为新组合。
    #[test]
    fn auto_scan_runs_once_per_owner_and_chain() {
        let mut model = ready_model();
        let first = scan_id(&model);

        // 同一个钱包再次上报（页面重新挂载、无关的钱包状态刷新）—— 不得再扫一次。
        dispatch(
            &mut model,
            RevokeEvent::WalletChanged {
                owner: Some("0xOWNER".to_owned()),
                is_biubiu: false,
            },
        );
        assert_eq!(scan_id(&model), first, "同一个钱包不该触发第二次扫描");

        // 已扫完之后再来一次同样的上报，仍然不扫。
        send(
            &mut model,
            RevokeShellResult::ApprovalsScanned {
                operation_id: first,
                rows: vec![],
            },
        );
        let before = model.next_operation_id;
        dispatch(
            &mut model,
            RevokeEvent::WalletChanged {
                owner: Some("0xowner".to_owned()),
                is_biubiu: false,
            },
        );
        assert_eq!(
            model.next_operation_id, before,
            "owner 大小写不同但是同一个地址 —— 仍然是同一个组合"
        );

        // 换一条链才算新组合。
        dispatch(
            &mut model,
            RevokeEvent::SetNetwork {
                slug: "base".into(),
            },
        );
        assert_ne!(scan_id(&model), first);
    }

    /// R-06：切链清空 rows / scanned / error / selected / notice / gas_fee_token。
    #[test]
    fn switching_network_clears_every_chain_scoped_piece_of_state() {
        let mut model = ready_model();
        let sid = scan_id(&model);
        send(
            &mut model,
            RevokeShellResult::ApprovalsScanned {
                operation_id: sid,
                rows: vec![row(TokenStandard::Erc20, "0xAAA", "0xBBB", true)],
            },
        );
        dispatch(&mut model, RevokeEvent::SelectAllVisible);
        dispatch(
            &mut model,
            RevokeEvent::SetGasFeeToken {
                token: Some("0xUSDC".to_owned()),
            },
        );
        model.notice = Some(Notice::Failure {
            message: "old".to_owned(),
        });

        dispatch(
            &mut model,
            RevokeEvent::SetNetwork {
                slug: "base".into(),
            },
        );

        assert!(model.rows.is_empty());
        assert!(model.selected_ids.is_empty());
        assert_eq!(model.notice, None);
        assert_eq!(
            model.gas_fee_token, None,
            "新链上原稳定币可能不存在 → 回退原生"
        );
        let view = RevokeApp.view(&model);
        assert!(!view.has_scanned);
        assert_eq!(view.scan_error, None);
    }

    /// R-21：`Scanning` 与在途 `Scan` 条目同生共死。
    #[test]
    fn scanning_state_and_the_in_flight_entry_always_agree() {
        let mut model = ready_model();
        let has_entry = |m: &RevokeModel| {
            m.in_flight
                .values()
                .any(|op| matches!(op, InFlightOp::Scan { .. }))
        };

        assert_eq!(model.scan == ScanState::Scanning, has_entry(&model));

        let sid = scan_id(&model);
        send(
            &mut model,
            RevokeShellResult::ApprovalsScanned {
                operation_id: sid,
                rows: vec![],
            },
        );
        assert_eq!(model.scan == ScanState::Scanning, has_entry(&model));

        dispatch(
            &mut model,
            RevokeEvent::SetNetwork {
                slug: "base".into(),
            },
        );
        assert_eq!(model.scan == ScanState::Scanning, has_entry(&model));
    }

    // -----------------------------------------------------------------------
    // R-07 / R-19 / R-20 —— 筛选、标识、排序
    // -----------------------------------------------------------------------

    /// R-07：`Unlimited` 筛选下「全选可见」只选中可见行。
    #[test]
    fn select_all_visible_respects_the_unlimited_filter() {
        let mut model = ready_model();
        let sid = scan_id(&model);
        send(
            &mut model,
            RevokeShellResult::ApprovalsScanned {
                operation_id: sid,
                rows: vec![
                    row(TokenStandard::Erc20, "0xAAA", "0xS1", true),
                    row(TokenStandard::Erc20, "0xBBB", "0xS2", false),
                ],
            },
        );

        dispatch(
            &mut model,
            RevokeEvent::SetFilter {
                filter: RowFilter::Unlimited,
            },
        );
        dispatch(&mut model, RevokeEvent::SelectAllVisible);

        assert_eq!(model.selected_ids.len(), 1);
        assert!(model.selected_ids[0].contains("0xaaa"));
    }

    /// R-19：行标识为 `{standard}:{token}:{spender}`，三段全小写。
    #[test]
    fn row_id_format_matches_the_pre_migration_rule() {
        let r = stored_row(TokenStandard::Erc20, "0xAbCd", "0xEfGh", false);
        assert_eq!(r.id, "erc20:0xabcd:0xefgh");

        let nft = stored_row(TokenStandard::Erc721, "0xAbCd", "0xEfGh", true);
        assert_eq!(nft.id, "erc721:0xabcd:0xefgh");

        // Permit2 子额度的标准段是字面量 `permit2`，不是底层代币的标准。
        let permit2 = ScannedApproval {
            is_permit2: true,
            ..row(TokenStandard::Erc20, "0xAbCd", "0xEfGh", true)
        }
        .into_row();
        assert_eq!(permit2.id, "permit2:0xabcd:0xefgh");
    }

    /// R-20：排序为 unlimited 降序 → symbol 升序 → spender 升序。
    #[test]
    fn rows_sort_unlimited_first_then_symbol_then_spender() {
        let mut rows = vec![
            ApprovalRow {
                token_symbol: "ZZZ".into(),
                ..stored_row(TokenStandard::Erc20, "0x1", "0xB", false)
            },
            ApprovalRow {
                token_symbol: "AAA".into(),
                ..stored_row(TokenStandard::Erc20, "0x2", "0xB", false)
            },
            ApprovalRow {
                token_symbol: "MMM".into(),
                ..stored_row(TokenStandard::Erc20, "0x3", "0xB", true)
            },
            ApprovalRow {
                token_symbol: "MMM".into(),
                ..stored_row(TokenStandard::Erc20, "0x4", "0xA", true)
            },
        ];
        sort_rows(&mut rows);

        let order: Vec<_> = rows
            .iter()
            .map(|r| (r.unlimited, r.token_symbol.as_str(), r.spender.as_str()))
            .collect();
        assert_eq!(
            order,
            vec![
                (true, "MMM", "0xA"),
                (true, "MMM", "0xB"),
                (false, "AAA", "0xB"),
                (false, "ZZZ", "0xB"),
            ]
        );
    }
    // -----------------------------------------------------------------------
    // R-08 / R-09 / R-10 / R-13 —— 撤销策略
    // -----------------------------------------------------------------------

    /// 已扫出两行、并选中它们的模型。
    fn model_with_two_selected_rows() -> RevokeModel {
        let mut model = ready_model();
        let sid = scan_id(&model);
        send(
            &mut model,
            RevokeShellResult::ApprovalsScanned {
                operation_id: sid,
                rows: vec![
                    row(TokenStandard::Erc20, "0xAAA", "0xS1", true),
                    row(TokenStandard::Erc20, "0xBBB", "0xS2", true),
                ],
            },
        );
        dispatch(&mut model, RevokeEvent::SelectAllVisible);
        model
    }

    /// R-08：撤销进行中忽略新的撤销触发。
    #[test]
    fn a_second_revoke_is_ignored_while_one_is_running() {
        let mut model = model_with_two_selected_rows();
        dispatch(&mut model, RevokeEvent::RevokeSelected);
        let first = revoke_id(&model);

        dispatch(&mut model, RevokeEvent::RevokeSelected);

        let in_flight_revokes = model
            .in_flight
            .values()
            .filter(|op| matches!(op, InFlightOp::Revoke { .. }))
            .count();
        assert_eq!(in_flight_revokes, 1, "不得出现并发撤销");
        assert_eq!(revoke_id(&model), first);
    }

    /// R-09：空行集合的撤销不产生任何对外请求。
    #[test]
    fn revoking_an_empty_selection_asks_the_shell_for_nothing() {
        let mut model = ready_model();
        let before = model.next_operation_id;

        dispatch(&mut model, RevokeEvent::RevokeSelected);
        assert_eq!(model.next_operation_id, before, "没有选中项，不该发请求");

        // 选中一个**不存在于结果里**的 id，同样不该发。
        dispatch(
            &mut model,
            RevokeEvent::RevokeOne {
                id: "erc20:0xghost:0xghost".to_owned(),
            },
        );
        assert_eq!(model.next_operation_id, before);
    }

    /// R-10：撤销成功后移除对应行与对应选中项。
    #[test]
    fn a_successful_revoke_removes_the_rows_and_their_selection() {
        let mut model = model_with_two_selected_rows();
        dispatch(
            &mut model,
            RevokeEvent::RevokeOne {
                id: "erc20:0xaaa:0xs1".to_owned(),
            },
        );
        let rid = revoke_id(&model);

        send(
            &mut model,
            RevokeShellResult::RevokeCompleted {
                operation_id: rid,
                success: true,
                tx_hash: Some("0xTX".to_owned()),
                explorer_url: Some("https://explorer.example/tx/0xTX".to_owned()),
                error: None,
            },
        );

        assert_eq!(model.rows.len(), 1);
        assert_eq!(model.rows[0].token, "0xBBB");
        assert_eq!(model.selected_ids, vec!["erc20:0xbbb:0xs2".to_owned()]);
        assert!(!model.is_revoking());
    }

    /// R-13：撤销期间切链 —— 结果仍然落地。**这是迁移前的行为，刻意保持**。
    ///
    /// 我在 spec 里原本把这一条写成「结果被丢弃」，那是**发明**，不是观察：读
    /// `store.svelte.ts` 的 `revokeRows` 可以确认它没有任何代次保护，切链后回来的撤销结果
    /// 照样设置 `lastResult`、照样弹横幅。
    ///
    /// 保持一致有两层理由。其一是宪法原则 VI：迁移不夹带改进，否则任何回归都分不清是搬错了
    /// 还是改错了。其二是这个「缺陷」并不显然：那笔撤销**真的成功了**，把它的成功提示整个吞掉
    /// 会让用户以为什么都没发生。真正的问题只是横幅上的浏览器链接指向的是上一条链。
    ///
    /// 这一点已作为「发现但未修」记入 `specs/001-biubiu-core-crux/results.md`。
    ///
    /// 与扫描的区别值得留意：扫描是只读的，陈旧结果覆盖界面纯属有害；撤销是**已经发生的
    /// 事实**，丢弃它就是丢弃信息。同一个在途表能表达两种策略 —— 扫描在切链时被移出表，
    /// 撤销不被移出。
    #[test]
    fn a_revoke_result_still_lands_after_a_chain_switch_as_before_the_migration() {
        let mut model = model_with_two_selected_rows();
        dispatch(&mut model, RevokeEvent::RevokeSelected);
        let rid = revoke_id(&model);

        dispatch(
            &mut model,
            RevokeEvent::SetNetwork {
                slug: "base".into(),
            },
        );
        send(
            &mut model,
            RevokeShellResult::RevokeCompleted {
                operation_id: rid,
                success: true,
                tx_hash: Some("0xTX".to_owned()),
                explorer_url: None,
                error: None,
            },
        );

        assert!(
            matches!(model.notice, Some(Notice::Success { .. })),
            "迁移前会弹这条提示，迁移后也要弹"
        );
        assert!(!model.is_revoking(), "撤销状态要正常结束");
        // 新链的行不受影响：旧链的行 id 不在新链的结果里。
        assert!(model.rows.is_empty());
    }

    /// 一次已被取代的撤销的进度，不得点亮当前的进度条。
    #[test]
    fn a_stale_phase_update_does_not_light_up_the_progress_bar() {
        let mut model = model_with_two_selected_rows();
        dispatch(&mut model, RevokeEvent::RevokeSelected);
        let rid = revoke_id(&model);
        send(
            &mut model,
            RevokeShellResult::RevokeCompleted {
                operation_id: rid,
                success: true,
                tx_hash: None,
                explorer_url: None,
                error: None,
            },
        );
        assert_eq!(model.revoke_phase, None);

        send(
            &mut model,
            RevokeShellResult::RevokePhaseChanged {
                operation_id: rid,
                phase: SendPhase::Signing,
            },
        );
        assert_eq!(model.revoke_phase, None, "已结束的撤销不得再报进度");
    }

    // -----------------------------------------------------------------------
    // R-11 / R-12 —— 提示条。**没有一行 sleep**：时钟已外化成请求（research.md D5）。
    // -----------------------------------------------------------------------

    fn revoke_once(model: &mut RevokeModel, success: bool) -> u64 {
        dispatch(model, RevokeEvent::RevokeSelected);
        let rid = revoke_id(model);
        send(
            model,
            RevokeShellResult::RevokeCompleted {
                operation_id: rid,
                success,
                tx_hash: None,
                explorer_url: None,
                error: if success {
                    None
                } else {
                    Some("boom".to_owned())
                },
            },
        );
        rid
    }

    /// R-11：成功提示排期收起；失败提示不排期。
    #[test]
    fn success_schedules_a_dismissal_and_failure_does_not() {
        let mut model = model_with_two_selected_rows();
        revoke_once(&mut model, true);

        assert!(matches!(model.notice, Some(Notice::Success { .. })));
        assert!(
            model
                .in_flight
                .values()
                .any(|op| matches!(op, InFlightOp::Dismiss)),
            "成功提示应当排期自动收起"
        );

        let mut model = model_with_two_selected_rows();
        revoke_once(&mut model, false);

        assert!(matches!(model.notice, Some(Notice::Failure { .. })));
        assert!(
            !model
                .in_flight
                .values()
                .any(|op| matches!(op, InFlightOp::Dismiss)),
            "失败提示必须由用户关闭，不得自动收起"
        );
    }

    /// R-12：手动关闭后到达的 `dismiss_due` 被丢弃。
    ///
    /// 这一条是整个迁移的缩影。迁移前它靠 `clearTimeout(this.successTimer)`：忘一次，
    /// 六秒后就会有一个幽灵状态变更。现在即使宿主**根本没有取消定时器**、定时器照常触发，
    /// 核心也会因为 id 不在在途表中而丢弃它 —— 正确性不再依赖宿主的自律。
    #[test]
    fn a_dismissal_that_fires_after_the_user_closed_the_notice_is_discarded() {
        let mut model = model_with_two_selected_rows();
        revoke_once(&mut model, true);
        let dismiss = dismiss_id(&model);

        // 用户手动关闭。
        dispatch(&mut model, RevokeEvent::DismissNotice);
        assert_eq!(model.notice, None);

        // 再发起一次撤销并成功 —— 现在有了一条**新的**成功提示。
        model.rows = vec![stored_row(TokenStandard::Erc20, "0xCCC", "0xS3", true)];
        model.selected_ids = vec!["erc20:0xccc:0xs3".to_owned()];
        revoke_once(&mut model, true);
        assert!(matches!(model.notice, Some(Notice::Success { .. })));

        // 宿主没取消的那个旧定时器现在触发了。
        send(
            &mut model,
            RevokeShellResult::DismissDue {
                operation_id: dismiss,
            },
        );

        assert!(
            matches!(model.notice, Some(Notice::Success { .. })),
            "旧的自动收起不得关掉新的提示"
        );
    }

    /// 排期正常到期时，提示确实会被收起。
    #[test]
    fn a_live_dismissal_clears_the_notice() {
        let mut model = model_with_two_selected_rows();
        revoke_once(&mut model, true);
        let dismiss = dismiss_id(&model);

        send(
            &mut model,
            RevokeShellResult::DismissDue {
                operation_id: dismiss,
            },
        );

        assert_eq!(model.notice, None);
    }

    // -----------------------------------------------------------------------
    // R-14 … R-18 —— 自定义条目
    // -----------------------------------------------------------------------

    fn add_a_custom_token(model: &mut RevokeModel) {
        dispatch(
            model,
            RevokeEvent::AddCustomToken {
                standard: TokenStandard::Erc20,
                address: "0xCUSTOM".to_owned(),
                symbol: "CUS".to_owned(),
                name: Some("Custom".to_owned()),
                decimals: Some(18),
            },
        );
    }

    /// R-14：持久化失败**不回滚**内存中的条目。
    #[test]
    fn a_failed_persist_leaves_the_entry_usable_for_this_session() {
        let mut model = ready_model();
        add_a_custom_token(&mut model);
        let persist = model
            .in_flight
            .iter()
            .find(|(_, op)| matches!(op, InFlightOp::Persist))
            .map(|(id, _)| *id)
            .expect("应当有一次持久化在途");

        send(
            &mut model,
            RevokeShellResult::PersistCompleted {
                operation_id: persist,
                ok: false,
            },
        );

        assert_eq!(
            model.custom_tokens.get(&1).map(|v| v.len()),
            Some(1),
            "落盘失败不该让本次会话丢掉这个条目"
        );
    }

    /// R-15：添加/移除自定义条目后触发重扫。
    #[test]
    fn changing_custom_entries_triggers_a_rescan() {
        let mut model = ready_model();
        // 先让首次自动扫描结束，好让「又出现一次扫描」这件事无歧义。
        let first = scan_id(&model);
        send(
            &mut model,
            RevokeShellResult::ApprovalsScanned {
                operation_id: first,
                rows: vec![],
            },
        );
        assert!(
            !model
                .in_flight
                .values()
                .any(|op| matches!(op, InFlightOp::Scan { .. }))
        );

        add_a_custom_token(&mut model);
        assert_ne!(scan_id(&model), first, "加了探测目标就该重扫");

        // 自定义条目确实进了发给宿主的清单里。
        let tokens = merged_tokens(&model, 1);
        assert!(
            tokens
                .iter()
                .any(|t| t.address == "0xCUSTOM" && t.is_custom)
        );

        // 移除同样重扫。
        let after_add = scan_id(&model);
        send(
            &mut model,
            RevokeShellResult::ApprovalsScanned {
                operation_id: after_add,
                rows: vec![],
            },
        );
        dispatch(
            &mut model,
            RevokeEvent::RemoveCustomToken {
                address: "0xcustom".to_owned(),
            },
        );
        assert_ne!(scan_id(&model), after_add);
        assert!(
            model
                .custom_tokens
                .get(&1)
                .map(|v| v.is_empty())
                .unwrap_or(true)
        );
    }

    /// 内置条目在与自定义条目同键时胜出（research.md D13）。
    #[test]
    fn a_builtin_token_wins_over_a_custom_entry_with_the_same_key() {
        let mut model = ready_model();
        // 以太坊上的 USDC 是内置条目。
        dispatch(
            &mut model,
            RevokeEvent::AddCustomToken {
                standard: TokenStandard::Erc20,
                address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".to_owned(),
                symbol: "FAKE".to_owned(),
                name: None,
                decimals: Some(0),
            },
        );

        let merged = merged_tokens(&model, 1);
        let usdc: Vec<_> = merged
            .iter()
            .filter(|t| {
                t.address
                    .eq_ignore_ascii_case("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")
            })
            .collect();
        assert_eq!(usdc.len(), 1, "同键只应出现一次");
        assert_eq!(
            usdc[0].symbol, "USDC",
            "内置胜出 —— 与迁移前的 dedupeBy 一致"
        );
    }

    /// R-16：添加一个已存在的链 ⇒ 直接选中，不新增。
    #[test]
    fn adding_an_existing_chain_just_selects_it() {
        let mut model = ready_model();
        let before = model.custom_networks.len();

        dispatch(
            &mut model,
            RevokeEvent::AddNetworkByChainId {
                chain_id: 8453,
                rpc_override: None,
            },
        );

        assert_eq!(model.network_slug, "base");
        assert_eq!(model.custom_networks.len(), before, "不得产生重复条目");
        assert!(
            !model
                .in_flight
                .values()
                .any(|op| matches!(op, InFlightOp::ChainMetadata { .. })),
            "已知的链不需要去取元数据"
        );
    }

    /// R-17：无可用 RPC 且未提供覆盖值 ⇒ `need-rpc`，不新增网络。
    #[test]
    fn a_chain_with_no_rpc_is_refused_instead_of_added() {
        let mut model = ready_model();
        dispatch(
            &mut model,
            RevokeEvent::AddNetworkByChainId {
                chain_id: 424242,
                rpc_override: None,
            },
        );
        let meta = model
            .in_flight
            .iter()
            .find(|(_, op)| matches!(op, InFlightOp::ChainMetadata { .. }))
            .map(|(id, _)| *id)
            .expect("应当去取元数据");

        send(
            &mut model,
            RevokeShellResult::ChainMetadataFetched {
                operation_id: meta,
                found: true,
                name: Some("Nowhere".to_owned()),
                symbol: Some("NOW".to_owned()),
                explorer_url: None,
                rpcs: vec![],
                is_testnet: false,
            },
        );

        assert!(model.custom_networks.is_empty(), "没有 RPC 就不该添加");
        assert_eq!(
            model.notice,
            Some(Notice::Failure {
                message: "need-rpc".to_owned()
            })
        );
    }

    /// 用户提供的 RPC 覆盖值让同一条链得以添加。
    #[test]
    fn a_user_supplied_rpc_lets_the_chain_be_added() {
        let mut model = ready_model();
        dispatch(
            &mut model,
            RevokeEvent::AddNetworkByChainId {
                chain_id: 424242,
                rpc_override: Some("https://my.rpc".to_owned()),
            },
        );
        let meta = model
            .in_flight
            .iter()
            .find(|(_, op)| matches!(op, InFlightOp::ChainMetadata { .. }))
            .map(|(id, _)| *id)
            .unwrap();

        send(
            &mut model,
            RevokeShellResult::ChainMetadataFetched {
                operation_id: meta,
                found: false,
                name: None,
                symbol: None,
                explorer_url: None,
                rpcs: vec![],
                is_testnet: false,
            },
        );

        assert_eq!(model.custom_networks.len(), 1);
        let added = &model.custom_networks[0];
        assert_eq!(added.slug, "custom-424242");
        assert_eq!(added.rpcs, vec!["https://my.rpc".to_owned()]);
        assert_eq!(added.name, "Chain 424242", "元数据取不到时按 chainId 兜底");
        assert_eq!(model.network_slug, "custom-424242", "添加后自动选中");
    }

    /// R-18：移除当前选中的自定义网络 ⇒ 回退默认并执行切链清空。
    #[test]
    fn removing_the_selected_custom_network_falls_back_to_the_default() {
        let mut model = ready_model();
        model.custom_networks.push(Network {
            is_custom: true,
            ..network("custom-424242", 424242)
        });
        dispatch(
            &mut model,
            RevokeEvent::SetNetwork {
                slug: "custom-424242".into(),
            },
        );
        let sid = scan_id(&model);
        send(
            &mut model,
            RevokeShellResult::ApprovalsScanned {
                operation_id: sid,
                rows: vec![row(TokenStandard::Erc20, "0xAAA", "0xS1", true)],
            },
        );
        dispatch(&mut model, RevokeEvent::SelectAllVisible);

        dispatch(
            &mut model,
            RevokeEvent::RemoveCustomNetwork {
                slug: "custom-424242".into(),
            },
        );

        assert_eq!(model.network_slug, DEFAULT_SLUG);
        assert!(model.custom_networks.is_empty());
        assert!(model.rows.is_empty(), "回退默认链要走完整的切链清空");
        assert!(model.selected_ids.is_empty());
    }

    // -----------------------------------------------------------------------
    // ViewModel 不得泄漏内部记账（宪法原则 II）
    // -----------------------------------------------------------------------

    #[test]
    fn the_view_model_never_carries_internal_bookkeeping() {
        let mut model = model_with_two_selected_rows();
        dispatch(&mut model, RevokeEvent::RevokeSelected);

        let json = serde_json::to_string(&RevokeApp.view(&model)).unwrap();
        for leaked in [
            "in_flight",
            "next_operation_id",
            "last_scan_key",
            "operation_id",
        ] {
            assert!(
                !json.contains(leaked),
                "`{leaked}` 不得出现在 ViewModel 里 —— 宿主一旦能读到它，业务判断就会漏回宿主"
            );
        }
    }

    /// 逐行状态由核心算好，宿主不做集合查找。
    #[test]
    fn row_views_carry_selection_and_pending_as_precomputed_booleans() {
        let mut model = model_with_two_selected_rows();
        dispatch(
            &mut model,
            RevokeEvent::RevokeOne {
                id: "erc20:0xaaa:0xs1".to_owned(),
            },
        );

        let view = RevokeApp.view(&model);
        let first = view
            .rows
            .iter()
            .find(|r| r.id == "erc20:0xaaa:0xs1")
            .unwrap();
        let second = view
            .rows
            .iter()
            .find(|r| r.id == "erc20:0xbbb:0xs2")
            .unwrap();

        assert!(first.is_selected && first.is_pending);
        assert!(second.is_selected && !second.is_pending);
    }
}
