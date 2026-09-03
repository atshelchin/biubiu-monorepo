//! 批量代币发送：业务状态与规则（spec `002-token-sender-core`）。
//!
//! # 这个域和 revoke 不一样的地方
//!
//! revoke 的难点是陈旧响应。这里的难点是**形态**。
//!
//! 迁移前，整轮发送是宿主里的一个 `for` 循环：
//!
//! ```text
//! for (i of batches) {
//!   if (signal.aborted) break
//!   if (completed.has(i)) continue          ← 「不重发已成功批次」就是这一行
//!   if (sent > 0) await delay(2500)         ← 占住执行流
//!   await wallet.sendBatch(chunk)           ← 一次 passkey 确认
//! }
//! ```
//!
//! 上百批、每批一次 passkey、批间 2.5 秒 —— **由一条执行流从头持有到尾**，而进度只存在
//! 那个作用域里的局部数组。关掉页面，已成功的批次就被彻底遗忘；用户只能重新录入全部收件人
//! 再发一遍，对已打款地址重复打款。
//!
//! `CLAUDE.md` 自己记着这条教训：**延迟与进度应当持久化为状态，而不是阻塞执行流。**
//!
//! # 这里的做法
//!
//! 核心不持有循环。它持有一张批次表，一次只请求一批，由结果推进到下一批：
//!
//! ```text
//! StartSend / Resume ─► 选出下一个待发批次 ─► 请求 SendBatch
//! BatchSucceeded     ─► 记录 ─► 还有待发 ─► 请求 WaitBetweenBatches
//! DelayElapsed       ─► 选出下一个待发批次 ─► 请求 SendBatch
//! Pause              ─► 只是不再选下一批；**不撤回在途的那一批**
//! ```
//!
//! 「不重发已成功批次」因此不再是一行 `continue`，而是
//! [`next_pending_index`] 的候选集里**根本没有** `Succeeded` —— 一个结构性保证，
//! 不是一句需要记得写的判断。
//!
//! **本次仍是等价迁移**：批次表的跨会话持久化不在范围内（spec.md FR-019）。但没有这一步，
//! 那件事无从谈起。

use std::collections::BTreeMap;

use crux_core::capability::Operation;
use crux_core::macros::effect;
use crux_core::render::{RenderOperation, render};
use crux_core::{App, Command, Request};
use serde::{Deserialize, Serialize};

use super::SplitEffect;
use super::sender_networks::builtin_networks;
use super::sender_parse::{ParseResult, parse_recipients};

#[cfg(feature = "bindings")]
use ts_rs::TS;

/// 批次之间的喘息间隔。**业务策略，因此住在核心**；宿主只负责按这个数字计时。
///
/// 它存在的理由是产品性的：每批一次 passkey 确认，连珠炮式弹窗没法用。
const INTER_BATCH_DELAY_MS: u64 = 2_500;

const DEFAULT_NETWORK: &str = "eth-mainnet";

// ---------------------------------------------------------------------------
// 值类型
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[serde(rename_all = "snake_case")]
pub enum WizardStep {
    #[default]
    Config,
    Recipients,
    Review,
    Execute,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[serde(rename_all = "snake_case")]
pub enum TokenType {
    #[default]
    Native,
    Erc20,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[serde(rename_all = "snake_case")]
pub enum DistributionMode {
    /// 每行 `address,amount`。
    #[default]
    Specified,
    /// 每行 `address`，金额由总额均分。
    Equal,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct Network {
    pub slug: String,
    pub name: String,
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub chain_id: u64,
    pub symbol: String,
    pub decimals: u8,
    pub rpcs: Vec<String>,
    /// 区块浏览器 tx 前缀，如 `https://etherscan.io/tx/`。
    pub explorer_tx_url: String,
    pub multi_send_address: String,
    /// 每批接收方上限 —— **直接决定批次数，进而决定总费用**（research.md D19）。
    pub max_batch_native: u32,
    pub max_batch_erc20: u32,
    pub chainlink_native_usd_feed: Option<String>,
    #[serde(default)]
    pub is_testnet: bool,
    #[serde(default)]
    pub is_custom: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct TokenMeta {
    pub symbol: String,
    pub decimals: u8,
}

/// 一个收件人。金额以**十进制字符串**过界（`JSON.stringify(1n)` 会抛 —— spec 001 D4）。
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct Recipient {
    pub address: String,
    pub amount: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[serde(rename_all = "kebab-case")]
pub enum TokenMetaError {
    NoWallet,
    InvalidTokenAddress,
    TokenReadFailed,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct FeeQuote {
    /// 单批费用（十进制字符串）。会员豁免成立时为 "0"。
    pub amount: String,
    pub is_member: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct PreflightResult {
    pub ok: bool,
    pub reason: Option<String>,
    pub native_balance: String,
    pub native_needed: String,
    pub token_balance: Option<String>,
    pub token_needed: Option<String>,
}

/// 发送进度档位。逐字沿用宿主既有的 `SendStatus`。
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[serde(rename_all = "snake_case")]
pub enum SendPhase {
    Building,
    Checking,
    Estimating,
    Signing,
    Submitting,
    Waiting,
    Confirmed,
    Failed,
}

// ---------------------------------------------------------------------------
// SendState —— 循环被它取代
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[serde(rename_all = "snake_case")]
pub enum SendStatus {
    #[default]
    Idle,
    Running,
    Paused,
    Done,
}

/// 一次发送的**不可变**输入。在 `StartSend` 时冻结 —— 之后改网络、改收件人都不影响
/// 正在进行的这一轮。
#[derive(Clone, Debug, PartialEq, Eq)]
struct SendPlan {
    network: Network,
    token_type: TokenType,
    token_address: String,
    decimals: u8,
    batch_size: u32,
    /// 单批费用（十进制字符串）。**每批都收，且续发不重复收**（FR-004）。
    fee_per_batch: String,
    gas_fee_token: Option<String>,
    recipients: Vec<Recipient>,
    started_at_ms: u64,
}

/// 一个批次的状态。
///
/// **`Succeeded` 是终态** —— 没有任何转移把它改回 `Pending`。这是「不重复打款」的
/// 结构性保证（data-model.md §2）。
#[derive(Clone, Debug, PartialEq, Eq)]
enum BatchState {
    Pending,
    InFlight {
        operation_id: u64,
    },
    Succeeded {
        tx_hash: String,
        explorer_url: Option<String>,
        count: usize,
    },
    Failed {
        error: String,
    },
}

impl BatchState {
    fn is_succeeded(&self) -> bool {
        matches!(self, Self::Succeeded { .. })
    }
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq)]
enum InFlightOp {
    SendBatch {
        batch_index: usize,
    },
    /// 批间喘息。暂停时被移出表 —— 宿主的定时器照常到期，回来时因 id 不在表中被丢弃。
    WaitBetweenBatches,
    ReadTokenMeta,
    QuoteFee,
    Preflight,
    Persist,
    LoadHistory,
    VerifyMultiSend,
}

pub struct SenderModel {
    step: WizardStep,
    builtin_networks: Vec<Network>,
    custom_networks: Vec<Network>,
    rpc_overrides: BTreeMap<String, Vec<String>>,
    network_slug: String,
    token_type: TokenType,
    token_address: String,
    token_meta: Option<TokenMeta>,
    token_meta_loading: bool,
    token_meta_error: Option<TokenMetaError>,
    distribution_mode: DistributionMode,
    recipients_text: String,
    total_amount_input: String,
    parsed: Option<ParseResult>,
    fee: Option<FeeQuote>,
    fee_loading: bool,
    preflight: Option<PreflightResult>,
    preflight_loading: bool,
    review_error: Option<String>,
    gas_fee_token: Option<String>,
    /// 本会话是否已完成控制权证明。**只有证明过才算数** —— 防观察钱包 / 复制 session 绕过。
    member_waived: bool,
    has_wallet: bool,

    // ── 发送编排 ──
    send_status: SendStatus,
    plan: Option<SendPlan>,
    batches: Vec<BatchState>,
    /// 本轮**已经推进到**的下标。整轮之内严格向前，绝不回头。
    ///
    /// 这一条对应迁移前的 `for (let i = 0; i < batches.length; i++)`：失败采用「跳过」策略，
    /// 是**继续往下一批**，不是原地重试。少了这个游标，一个持续失败的批次会让整轮原地打转。
    /// `Failed` 只在**续发**时（游标归零）才重新成为候选。
    send_cursor: usize,
    current_phase: Option<SendPhase>,

    history: Vec<HistoryRecord>,

    in_flight: BTreeMap<u64, InFlightOp>,
    next_operation_id: u64,
}

impl Default for SenderModel {
    fn default() -> Self {
        Self {
            step: WizardStep::Config,
            builtin_networks: builtin_networks(),
            custom_networks: Vec::new(),
            rpc_overrides: BTreeMap::new(),
            network_slug: DEFAULT_NETWORK.to_owned(),
            token_type: TokenType::Native,
            token_address: String::new(),
            token_meta: None,
            token_meta_loading: false,
            token_meta_error: None,
            distribution_mode: DistributionMode::Specified,
            recipients_text: String::new(),
            total_amount_input: String::new(),
            parsed: None,
            fee: None,
            fee_loading: false,
            preflight: None,
            preflight_loading: false,
            review_error: None,
            gas_fee_token: None,
            member_waived: false,
            has_wallet: false,
            send_status: SendStatus::Idle,
            plan: None,
            batches: Vec::new(),
            send_cursor: 0,
            current_phase: None,
            history: Vec::new(),
            in_flight: BTreeMap::new(),
            next_operation_id: 0,
        }
    }
}

impl SenderModel {
    fn begin(&mut self, op: InFlightOp) -> u64 {
        self.next_operation_id += 1;
        let id = self.next_operation_id;
        self.in_flight.insert(id, op);
        id
    }

    fn cancel_in_flight(&mut self, pred: impl Fn(&InFlightOp) -> bool) {
        self.in_flight.retain(|_, op| !pred(op));
    }

    /// 内置 + 自定义，并套用该网络的 RPC 覆盖。
    fn networks(&self) -> Vec<Network> {
        self.builtin_networks
            .iter()
            .chain(self.custom_networks.iter())
            .map(|n| match self.rpc_overrides.get(&n.slug) {
                Some(rpcs) if !rpcs.is_empty() => Network {
                    rpcs: rpcs.clone(),
                    ..n.clone()
                },
                _ => n.clone(),
            })
            .collect()
    }

    fn network(&self) -> Option<Network> {
        let all = self.networks();
        all.iter()
            .find(|n| n.slug == self.network_slug)
            .or_else(|| all.first())
            .cloned()
    }

    /// 每批上限随代币类型切换 —— 它决定批次数，批次数决定总费用。
    fn batch_size(&self) -> u32 {
        let Some(network) = self.network() else {
            return 1;
        };
        let raw = match self.token_type {
            TokenType::Native => network.max_batch_native,
            TokenType::Erc20 => network.max_batch_erc20,
        };
        // 上限为 0 会让批次规划除以零 / 产生空批。按至少 1 处理（spec.md Edge Cases）。
        raw.max(1)
    }

    fn valid_count(&self) -> usize {
        self.parsed
            .as_ref()
            .map(|p| p.recipients.len())
            .unwrap_or(0)
    }

    fn total_batches(&self) -> usize {
        let n = self.valid_count();
        if n == 0 {
            return 0;
        }
        n.div_ceil(self.batch_size() as usize)
    }

    fn decimals(&self) -> u8 {
        match self.token_type {
            TokenType::Native => self.network().map(|n| n.decimals).unwrap_or(18),
            TokenType::Erc20 => self.token_meta.as_ref().map(|m| m.decimals).unwrap_or(18),
        }
    }

    fn symbol(&self) -> String {
        match self.token_type {
            TokenType::Native => self.network().map(|n| n.symbol).unwrap_or_default(),
            TokenType::Erc20 => self
                .token_meta
                .as_ref()
                .map(|m| m.symbol.clone())
                .unwrap_or_else(|| "TOKEN".to_owned()),
        }
    }

    /// 切网络 / 切代币类型的共同清空。
    ///
    /// **解析结果必须清掉**：精度可能变了，同一串文本解析出的金额含义随之改变。
    fn invalidate_token_context(&mut self) {
        self.token_meta = None;
        self.token_meta_error = None;
        self.parsed = None;
        // 新链上原稳定币可能不存在 → 回退原生。
        self.gas_fee_token = None;
    }
}

/// 下一个该发的批次。
///
/// **`Succeeded` 不在候选集里** —— 这就是「不重发已打款地址」的全部实现。它不是一句需要
/// 记得写的判断，而是这个函数的定义（data-model.md §2）。
fn next_pending_index(batches: &[BatchState], from: usize) -> Option<usize> {
    batches
        .iter()
        .enumerate()
        .skip(from)
        .find(|(_, b)| !b.is_succeeded())
        .map(|(i, _)| i)
}

/// 还有没有没成功的批次（用于「能否续发」，与游标无关）。
fn has_unfinished(batches: &[BatchState]) -> bool {
    batches.iter().any(|b| !b.is_succeeded())
}

// ---------------------------------------------------------------------------
// 历史
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[serde(rename_all = "snake_case")]
pub enum HistoryStatus {
    Completed,
    Partial,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct HistoryBatch {
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub index: usize,
    pub tx_hash: Option<String>,
    pub status: String,
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub count: usize,
    pub explorer_url: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct HistoryRecord {
    pub id: String,
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub created_at: u64,
    pub network: String,
    pub network_name: String,
    pub token_type: TokenType,
    pub token_address: Option<String>,
    pub token_symbol: String,
    pub decimals: u8,
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub total_recipients: usize,
    pub total_amount: String,
    pub fee_wei: String,
    pub is_member: bool,
    pub status: HistoryStatus,
    pub batches: Vec<HistoryBatch>,
}

// ---------------------------------------------------------------------------
// 线类型
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[cfg_attr(feature = "bindings", ts(export))]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SenderEvent {
    PageReady,
    WalletChanged {
        has_wallet: bool,
    },
    CustomDataProvided {
        networks: Vec<Network>,
        rpc_overrides: Vec<RpcOverride>,
    },
    SetNetwork {
        slug: String,
    },
    SetTokenType {
        token_type: TokenType,
    },
    SetTokenAddress {
        address: String,
    },
    LoadTokenMeta,
    SetDistributionMode {
        mode: DistributionMode,
    },
    SetRecipientsText {
        text: String,
    },
    SetTotalAmountInput {
        amount: String,
    },
    Parse,
    GoToStep {
        step: WizardStep,
    },
    PrepareReview,
    SetGasFeeToken {
        token: Option<String>,
    },
    /// 宿主完成了 passkey 控制权证明。**核心不做证明，只拥有它的后果**（research.md D18）。
    MemberProven {
        waived: bool,
    },
    /// 时钟在宿主：起始时间戳随事件传入，核心不读时间。
    StartSend {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        started_at_ms: u64,
    },
    Pause,
    Resume,
    Reset,
    AddCustomNetwork {
        name: String,
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        chain_id: u64,
        rpc: String,
        symbol: String,
        explorer_tx_url: Option<String>,
    },
    RemoveCustomNetwork {
        slug: String,
    },
    SetRpcOverride {
        slug: String,
        rpcs: Vec<String>,
    },
    ClearRpcOverride {
        slug: String,
    },
    VerifyMultiSend {
        rpc: String,
    },

    /// 宿主应答的**唯一**入口。命名字段而非元组变体（spec 001 D11）。
    ShellCompleted {
        result: SenderShellResult,
    },
}

/// 按 slug 的 RPC 覆盖。用数组而不是 map —— JSON 对象的键只能是字符串，数组让两侧类型都诚实。
#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct RpcOverride {
    pub slug: String,
    pub rpcs: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[cfg_attr(feature = "bindings", ts(export))]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SenderOperation {
    /// 本域的主请求。**核心一次只发出一个** —— 下一个由上一个的结果触发（research.md D15）。
    SendBatch {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        batch_index: usize,
        network: Network,
        token_type: TokenType,
        token_address: String,
        decimals: u8,
        /// 十进制字符串。**每批都收，续发不重复收**。
        fee_wei: String,
        gas_fee_token: Option<String>,
        /// 已经是**该批的那一片** —— 切分是业务规则，宿主不做。
        recipients: Vec<Recipient>,
    },
    /// 批间喘息。宿主 `setTimeout` 后回送；**不保存句柄、不做取消** —— 暂停时核心把这个 id
    /// 移出在途表，到期回送因此被丢弃。
    WaitBetweenBatches {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        delay_ms: u64,
    },
    ReadErc20Meta {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        network: Network,
        address: String,
    },
    QuoteFee {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        network: Network,
        is_member: bool,
    },
    Preflight {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        network: Network,
        token_type: TokenType,
        token_address: String,
        total_amount: String,
        /// 总费用 = 单批 × 批次数。
        fee_total: String,
    },
    LoadCustomData {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
    },
    PersistCustomData {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        networks: Vec<Network>,
        rpc_overrides: Vec<RpcOverride>,
    },
    PersistHistory {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        record: HistoryRecord,
    },
    LoadHistory {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        limit: u32,
    },
    VerifyMultiSend {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        rpc: String,
        multi_send_address: String,
    },
}

impl Operation for SenderOperation {
    type Output = SenderShellResult;
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[cfg_attr(feature = "bindings", ts(export))]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SenderShellResult {
    BatchSucceeded {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        tx_hash: String,
        explorer_url: Option<String>,
    },
    BatchFailed {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        error: String,
    },
    BatchPhaseChanged {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        phase: SendPhase,
    },
    DelayElapsed {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
    },
    Erc20MetaRead {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        ok: bool,
        symbol: Option<String>,
        decimals: Option<u8>,
    },
    FeeQuoted {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        amount: String,
        is_member: bool,
    },
    PreflightDone {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        result: PreflightResult,
    },
    PreflightFailed {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        message: String,
    },
    CustomDataLoaded {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        networks: Vec<Network>,
        rpc_overrides: Vec<RpcOverride>,
    },
    PersistCompleted {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        ok: bool,
    },
    HistoryLoaded {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        records: Vec<HistoryRecord>,
    },
    MultiSendVerified {
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        operation_id: u64,
        deployed: bool,
    },
}

#[effect]
pub enum SenderEffect {
    Render(RenderOperation),
    Shell(SenderOperation),
}

impl SplitEffect for SenderEffect {
    type Op = SenderOperation;

    fn into_shell(self) -> Option<Request<SenderOperation>> {
        match self {
            Self::Render(_) => None,
            Self::Shell(request) => Some(request),
        }
    }
}

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum BatchView {
    Pending,
    InFlight,
    Succeeded {
        tx_hash: String,
        explorer_url: Option<String>,
        #[cfg_attr(feature = "bindings", ts(type = "number"))]
        count: usize,
    },
    Failed {
        error: String,
    },
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[cfg_attr(feature = "bindings", ts(export))]
pub struct SenderViewModel {
    pub step: WizardStep,
    pub networks: Vec<Network>,
    pub network: Option<Network>,
    pub token_type: TokenType,
    pub token_address: String,
    pub token_meta: Option<TokenMeta>,
    pub token_meta_loading: bool,
    pub token_meta_error: Option<TokenMetaError>,
    pub distribution_mode: DistributionMode,
    pub recipients_text: String,
    pub total_amount_input: String,

    /// 解析的**摘要**。收件人清单不进视图 —— 十万条收件人每次 render 都序列化一遍，
    /// 而界面只需要这几个数字与非法行清单（plan.md 风险 2）。
    pub valid_count: usize,
    pub duplicate_count: usize,
    pub invalid: Vec<super::sender_parse::InvalidLine>,
    pub total_amount: String,
    pub has_parsed: bool,

    pub decimals: u8,
    pub symbol: String,
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub batch_size: u32,
    pub total_batches: usize,
    pub fee: Option<FeeQuote>,
    pub fee_total: String,
    pub fee_loading: bool,
    pub preflight: Option<PreflightResult>,
    pub preflight_loading: bool,
    pub review_error: Option<String>,
    pub gas_fee_token: Option<String>,
    pub is_member: bool,

    pub send_status: SendStatus,
    pub batches: Vec<BatchView>,
    pub current_batch_index: Option<usize>,
    pub current_phase: Option<SendPhase>,
    pub succeeded_batches: usize,
    pub failed_batches: usize,
    pub remaining_batches: usize,
    pub sent_recipients: usize,

    pub can_proceed_from_config: bool,
    pub can_proceed_from_recipients: bool,
    pub can_start_send: bool,
    pub can_resume: bool,
    pub send_supported: bool,

    pub history: Vec<HistoryRecord>,
    pub rpc_overrides: Vec<RpcOverride>,

    #[cfg(feature = "devtools")]
    #[cfg_attr(feature = "bindings", ts(skip))]
    pub debug: SenderDebugSnapshot,
}

#[cfg(feature = "devtools")]
#[derive(Clone, Debug, Serialize)]
pub struct SenderDebugSnapshot {
    in_flight: Vec<String>,
    next_operation_id: u64,
    plan_frozen: bool,
    batch_states: Vec<String>,
}

#[cfg(feature = "devtools")]
impl super::DebugSnapshot for SenderViewModel {
    fn debug_snapshot(&self) -> serde_json::Value {
        serde_json::to_value(&self.debug).unwrap_or(serde_json::Value::Null)
    }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct SenderApp;

fn request(op: SenderOperation) -> Command<SenderEffect, SenderEvent> {
    Command::request_from_shell(op).then_send(|result| SenderEvent::ShellCompleted { result })
}

/// 十进制字符串相乘（单批费用 × 批次数）。
///
/// 用 `u128`：费用是 wei 级的小数值，乘以最多几千个批次远不接近 `u128::MAX`。
/// 解析失败按 0 处理 —— 上游只会传自己产生过的字符串。
fn mul_decimal(amount: &str, times: usize) -> String {
    amount
        .parse::<u128>()
        .ok()
        .and_then(|v| v.checked_mul(times as u128))
        .map(|v| v.to_string())
        .unwrap_or_else(|| "0".to_owned())
}

impl App for SenderApp {
    type Event = SenderEvent;
    type Model = SenderModel;
    type ViewModel = SenderViewModel;
    type Effect = SenderEffect;

    fn update(
        &self,
        event: Self::Event,
        model: &mut Self::Model,
    ) -> Command<Self::Effect, Self::Event> {
        match event {
            SenderEvent::PageReady => {
                let load_id = model.begin(InFlightOp::Persist);
                let history_id = model.begin(InFlightOp::LoadHistory);
                Command::all([
                    request(SenderOperation::LoadCustomData {
                        operation_id: load_id,
                    }),
                    request(SenderOperation::LoadHistory {
                        operation_id: history_id,
                        limit: 50,
                    }),
                    render(),
                ])
            }

            SenderEvent::WalletChanged { has_wallet } => {
                model.has_wallet = has_wallet;
                render()
            }

            SenderEvent::CustomDataProvided {
                networks,
                rpc_overrides,
            } => {
                apply_custom_data(model, networks, rpc_overrides);
                render()
            }

            SenderEvent::SetNetwork { slug } => {
                if !model.networks().iter().any(|n| n.slug == slug) {
                    return Command::done();
                }
                model.network_slug = slug;
                model.invalidate_token_context();
                render()
            }

            SenderEvent::SetTokenType { token_type } => {
                model.token_type = token_type;
                model.invalidate_token_context();
                render()
            }

            SenderEvent::SetTokenAddress { address } => {
                model.token_address = address;
                render()
            }

            SenderEvent::LoadTokenMeta => load_token_meta(model),

            SenderEvent::SetDistributionMode { mode } => {
                model.distribution_mode = mode;
                render()
            }

            SenderEvent::SetRecipientsText { text } => {
                model.recipients_text = text;
                render()
            }

            SenderEvent::SetTotalAmountInput { amount } => {
                model.total_amount_input = amount;
                render()
            }

            SenderEvent::Parse => {
                model.parsed = Some(parse_recipients(super::sender_parse::ParseInput {
                    text: &model.recipients_text,
                    mode: model.distribution_mode,
                    decimals: model.decimals(),
                    total_amount: &model.total_amount_input,
                }));
                render()
            }

            SenderEvent::GoToStep { step } => {
                model.step = step;
                render()
            }

            SenderEvent::PrepareReview => prepare_review(model),

            SenderEvent::SetGasFeeToken { token } => {
                model.gas_fee_token = token;
                render()
            }

            SenderEvent::MemberProven { waived } => {
                model.member_waived = waived;
                // 证明成功必须触发费用重算（FR-014）。迁移前这条时序规则藏在一个
                // 与当前步骤耦合的副作用里；这里它是显式的。
                if waived && model.step == WizardStep::Review {
                    return prepare_review(model);
                }
                render()
            }

            SenderEvent::StartSend { started_at_ms } => start_send(model, started_at_ms),

            SenderEvent::Pause => {
                model.send_status = SendStatus::Paused;
                // 批间延时立即失效：到期回送会因 id 不在表中被丢弃（FR-007）。
                model.cancel_in_flight(|op| matches!(op, InFlightOp::WaitBetweenBatches));
                // **在途的 SendBatch 不动** —— 交易可能已上链（research.md D16）。
                render()
            }

            SenderEvent::Resume => {
                if !has_unfinished(&model.batches) {
                    return Command::done();
                }
                // 续发把游标归零：失败的批次重新成为候选，已成功的仍然不是。
                model.send_cursor = 0;
                model.send_status = SendStatus::Running;
                dispatch_next_batch(model)
            }

            SenderEvent::Reset => {
                let history = std::mem::take(&mut model.history);
                let builtin = std::mem::take(&mut model.builtin_networks);
                let custom = std::mem::take(&mut model.custom_networks);
                let overrides = std::mem::take(&mut model.rpc_overrides);
                *model = SenderModel {
                    history,
                    builtin_networks: builtin,
                    custom_networks: custom,
                    rpc_overrides: overrides,
                    ..SenderModel::default()
                };
                render()
            }

            SenderEvent::AddCustomNetwork {
                name,
                chain_id,
                rpc,
                symbol,
                explorer_tx_url,
            } => add_custom_network(model, name, chain_id, rpc, symbol, explorer_tx_url),

            SenderEvent::RemoveCustomNetwork { slug } => remove_custom_network(model, &slug),

            SenderEvent::SetRpcOverride { slug, rpcs } => {
                let clean: Vec<String> = rpcs
                    .into_iter()
                    .map(|r| r.trim().to_owned())
                    .filter(|r| !r.is_empty())
                    .collect();
                if clean.is_empty() {
                    model.rpc_overrides.remove(&slug);
                } else {
                    model.rpc_overrides.insert(slug, clean);
                }
                persist_custom_data(model)
            }

            SenderEvent::ClearRpcOverride { slug } => {
                model.rpc_overrides.remove(&slug);
                persist_custom_data(model)
            }

            SenderEvent::VerifyMultiSend { rpc } => {
                let Some(network) = model.network() else {
                    return Command::done();
                };
                let id = model.begin(InFlightOp::VerifyMultiSend);
                Command::all([
                    request(SenderOperation::VerifyMultiSend {
                        operation_id: id,
                        rpc,
                        multi_send_address: network.multi_send_address,
                    }),
                    render(),
                ])
            }

            SenderEvent::ShellCompleted { result } => accept_result(model, result),
        }
    }

    fn view(&self, model: &Self::Model) -> Self::ViewModel {
        let parsed = model.parsed.as_ref();
        let total_batches = model.total_batches();
        let fee_total = model
            .fee
            .as_ref()
            .map(|f| mul_decimal(&f.amount, total_batches))
            .unwrap_or_else(|| "0".to_owned());

        let succeeded = model.batches.iter().filter(|b| b.is_succeeded()).count();
        let failed = model
            .batches
            .iter()
            .filter(|b| matches!(b, BatchState::Failed { .. }))
            .count();
        let sent_recipients: usize = model
            .batches
            .iter()
            .map(|b| match b {
                BatchState::Succeeded { count, .. } => *count,
                _ => 0,
            })
            .sum();

        let network = model.network();
        let send_supported = !network.as_ref().map(|n| n.is_custom).unwrap_or(false);
        let can_proceed_from_config = match model.token_type {
            TokenType::Native => true,
            TokenType::Erc20 => model.token_meta.is_some() && model.token_meta_error.is_none(),
        };
        let can_proceed_from_recipients =
            model.valid_count() > 0 && parsed.map(|p| p.total_amount != "0").unwrap_or(false);

        SenderViewModel {
            step: model.step,
            networks: model.networks(),
            network,
            token_type: model.token_type,
            token_address: model.token_address.clone(),
            token_meta: model.token_meta.clone(),
            token_meta_loading: model.token_meta_loading,
            token_meta_error: model.token_meta_error,
            distribution_mode: model.distribution_mode,
            recipients_text: model.recipients_text.clone(),
            total_amount_input: model.total_amount_input.clone(),

            valid_count: parsed.map(|p| p.valid_count).unwrap_or(0),
            duplicate_count: parsed.map(|p| p.duplicate_count).unwrap_or(0),
            invalid: parsed.map(|p| p.invalid.clone()).unwrap_or_default(),
            total_amount: parsed
                .map(|p| p.total_amount.clone())
                .unwrap_or_else(|| "0".to_owned()),
            has_parsed: parsed.is_some(),

            decimals: model.decimals(),
            symbol: model.symbol(),
            batch_size: model.batch_size(),
            total_batches,
            fee: model.fee.clone(),
            fee_total,
            fee_loading: model.fee_loading,
            preflight: model.preflight.clone(),
            preflight_loading: model.preflight_loading,
            review_error: model.review_error.clone(),
            gas_fee_token: model.gas_fee_token.clone(),
            is_member: model.member_waived,

            send_status: model.send_status,
            batches: model
                .batches
                .iter()
                .map(|b| match b {
                    BatchState::Pending => BatchView::Pending,
                    BatchState::InFlight { .. } => BatchView::InFlight,
                    BatchState::Succeeded {
                        tx_hash,
                        explorer_url,
                        count,
                    } => BatchView::Succeeded {
                        tx_hash: tx_hash.clone(),
                        explorer_url: explorer_url.clone(),
                        count: *count,
                    },
                    BatchState::Failed { error } => BatchView::Failed {
                        error: error.clone(),
                    },
                })
                .collect(),
            current_batch_index: model
                .batches
                .iter()
                .position(|b| matches!(b, BatchState::InFlight { .. })),
            current_phase: model.current_phase,
            succeeded_batches: succeeded,
            failed_batches: failed,
            remaining_batches: model.batches.len() - succeeded,
            sent_recipients,

            can_proceed_from_config,
            can_proceed_from_recipients,
            can_start_send: model.has_wallet
                && model.fee.is_some()
                && can_proceed_from_recipients
                && send_supported,
            can_resume: model.send_status != SendStatus::Running && has_unfinished(&model.batches),
            send_supported,

            history: model.history.clone(),
            rpc_overrides: model
                .rpc_overrides
                .iter()
                .map(|(slug, rpcs)| RpcOverride {
                    slug: slug.clone(),
                    rpcs: rpcs.clone(),
                })
                .collect(),

            #[cfg(feature = "devtools")]
            debug: debug_snapshot(model),
        }
    }
}

#[cfg(feature = "devtools")]
fn debug_snapshot(model: &SenderModel) -> SenderDebugSnapshot {
    SenderDebugSnapshot {
        in_flight: model
            .in_flight
            .iter()
            .map(|(id, op)| format!("{id}: {op:?}"))
            .collect(),
        next_operation_id: model.next_operation_id,
        plan_frozen: model.plan.is_some(),
        batch_states: model.batches.iter().map(|b| format!("{b:?}")).collect(),
    }
}

// ---------------------------------------------------------------------------
// 批次编排 —— 取代迁移前那个 for 循环
// ---------------------------------------------------------------------------

fn start_send(model: &mut SenderModel, started_at_ms: u64) -> Command<SenderEffect, SenderEvent> {
    let (Some(parsed), Some(fee), Some(network)) =
        (model.parsed.clone(), model.fee.clone(), model.network())
    else {
        return Command::done();
    };
    // 收件人为空不产生任何请求（spec.md Edge Cases）。
    if parsed.recipients.is_empty() {
        return Command::done();
    }
    if !model.has_wallet {
        return Command::done();
    }

    let batch_size = model.batch_size();
    let total = parsed.recipients.len().div_ceil(batch_size as usize);

    // 计划在这里**冻结**：之后改网络、改收件人都不影响正在进行的这一轮。
    model.plan = Some(SendPlan {
        network,
        token_type: model.token_type,
        token_address: model.token_address.trim().to_owned(),
        decimals: model.decimals(),
        batch_size,
        fee_per_batch: fee.amount.clone(),
        gas_fee_token: model.gas_fee_token.clone(),
        recipients: parsed.recipients.clone(),
        started_at_ms,
    });
    model.batches = vec![BatchState::Pending; total];
    model.send_cursor = 0;
    model.send_status = SendStatus::Running;
    model.step = WizardStep::Execute;
    model.current_phase = None;

    dispatch_next_batch(model)
}

/// 选出下一个该发的批次并请求它。
///
/// **整个域里没有别的地方发出 `SendBatch`。** 「不重发已成功批次」因此不是一句需要记得写的
/// 判断，而是 [`next_pending_index`] 的候选集里根本没有 `Succeeded`。
fn dispatch_next_batch(model: &mut SenderModel) -> Command<SenderEffect, SenderEvent> {
    if model.send_status != SendStatus::Running {
        return render();
    }
    let Some(plan) = model.plan.clone() else {
        return render();
    };
    let Some(index) = next_pending_index(&model.batches, model.send_cursor) else {
        model.send_status = SendStatus::Done;
        model.current_phase = None;
        return finish_send(model);
    };
    // 严格向前推进：这一批发出去之后，本轮就不会再回到它或它之前的任何一批。
    model.send_cursor = index + 1;

    let size = plan.batch_size as usize;
    let start = index * size;
    let chunk: Vec<Recipient> = plan
        .recipients
        .iter()
        .skip(start)
        .take(size)
        .cloned()
        .collect();

    let operation_id = model.begin(InFlightOp::SendBatch { batch_index: index });
    model.batches[index] = BatchState::InFlight { operation_id };
    model.current_phase = Some(SendPhase::Building);

    Command::all([
        request(SenderOperation::SendBatch {
            operation_id,
            batch_index: index,
            network: plan.network.clone(),
            token_type: plan.token_type,
            token_address: plan.token_address.clone(),
            decimals: plan.decimals,
            // 每批都收，**续发时也是同一个数** —— 不重复涨价，也不因续发而少收（FR-004）。
            fee_wei: plan.fee_per_batch.clone(),
            gas_fee_token: plan.gas_fee_token.clone(),
            recipients: chunk,
        }),
        render(),
    ])
}

/// 一批结束后，决定是「歇一下再来」还是「收工」。
fn after_batch(model: &mut SenderModel) -> Command<SenderEffect, SenderEvent> {
    model.current_phase = None;

    if model.send_status != SendStatus::Running {
        // 用户已暂停：这一批的结果照常记录了，但不再开新的（research.md D16）。
        return render();
    }
    if next_pending_index(&model.batches, model.send_cursor).is_none() {
        model.send_status = SendStatus::Done;
        return finish_send(model);
    }

    let operation_id = model.begin(InFlightOp::WaitBetweenBatches);
    Command::all([
        request(SenderOperation::WaitBetweenBatches {
            operation_id,
            delay_ms: INTER_BATCH_DELAY_MS,
        }),
        render(),
    ])
}

/// 整轮结束：写一条历史汇总。
fn finish_send(model: &mut SenderModel) -> Command<SenderEffect, SenderEvent> {
    let Some(plan) = model.plan.clone() else {
        return render();
    };

    let mut batches: Vec<HistoryBatch> = Vec::new();
    let mut sent = 0usize;
    for (index, state) in model.batches.iter().enumerate() {
        match state {
            BatchState::Succeeded {
                tx_hash,
                explorer_url,
                count,
            } => {
                sent += count;
                batches.push(HistoryBatch {
                    index,
                    tx_hash: Some(tx_hash.clone()),
                    status: "confirmed".to_owned(),
                    count: *count,
                    explorer_url: explorer_url.clone(),
                    error: None,
                });
            }
            BatchState::Failed { error } => batches.push(HistoryBatch {
                index,
                tx_hash: None,
                status: "failed".to_owned(),
                count: 0,
                explorer_url: None,
                error: Some(error.clone()),
            }),
            _ => {}
        }
    }

    let succeeded = model.batches.iter().filter(|b| b.is_succeeded()).count();
    let failed = model.batches.len() - succeeded;
    // 三态判定与迁移前一致：无失败 ⇒ 完成；无成功 ⇒ 失败；否则部分完成。
    let status = if failed == 0 {
        HistoryStatus::Completed
    } else if succeeded == 0 {
        HistoryStatus::Failed
    } else {
        HistoryStatus::Partial
    };

    let total_amount = model
        .parsed
        .as_ref()
        .map(|p| p.total_amount.clone())
        .unwrap_or_else(|| "0".to_owned());

    let record = HistoryRecord {
        id: format!("send-{}", plan.started_at_ms),
        created_at: plan.started_at_ms,
        network: plan.network.slug.clone(),
        network_name: plan.network.name.clone(),
        token_type: plan.token_type,
        token_address: match plan.token_type {
            TokenType::Erc20 => Some(plan.token_address.clone()),
            TokenType::Native => None,
        },
        token_symbol: model.symbol(),
        decimals: plan.decimals,
        total_recipients: sent,
        total_amount,
        fee_wei: plan.fee_per_batch.clone(),
        is_member: model.member_waived,
        status,
        batches,
    };

    let operation_id = model.begin(InFlightOp::Persist);
    Command::all([
        request(SenderOperation::PersistHistory {
            operation_id,
            record,
        }),
        render(),
    ])
}

// ---------------------------------------------------------------------------
// 向导 / 费用 / 自定义网络
// ---------------------------------------------------------------------------

fn load_token_meta(model: &mut SenderModel) -> Command<SenderEffect, SenderEvent> {
    if !model.has_wallet {
        model.token_meta_error = Some(TokenMetaError::NoWallet);
        return render();
    }
    let address = model.token_address.trim().to_owned();
    // 形状检查即可 —— 这里对应迁移前的 `isAddress(addr, { strict: false })`，
    // 与解析器那条严格口径**故意不同**（research.md D21）。
    let shaped = address.len() == 42
        && address.starts_with("0x")
        && address[2..].bytes().all(|b| b.is_ascii_hexdigit());
    if !shaped {
        model.token_meta = None;
        model.token_meta_error = Some(TokenMetaError::InvalidTokenAddress);
        return render();
    }
    let Some(network) = model.network() else {
        return render();
    };

    model.token_meta_loading = true;
    model.token_meta_error = None;
    let operation_id = model.begin(InFlightOp::ReadTokenMeta);
    Command::all([
        request(SenderOperation::ReadErc20Meta {
            operation_id,
            network,
            address,
        }),
        render(),
    ])
}

fn prepare_review(model: &mut SenderModel) -> Command<SenderEffect, SenderEvent> {
    let (Some(_parsed), Some(network)) = (model.parsed.clone(), model.network()) else {
        return render();
    };
    if !model.has_wallet || model.valid_count() == 0 {
        return render();
    }

    model.review_error = None;
    model.fee_loading = true;
    model.preflight_loading = true;

    let operation_id = model.begin(InFlightOp::QuoteFee);
    Command::all([
        request(SenderOperation::QuoteFee {
            operation_id,
            network,
            is_member: model.member_waived,
        }),
        render(),
    ])
}

fn apply_custom_data(
    model: &mut SenderModel,
    networks: Vec<Network>,
    rpc_overrides: Vec<RpcOverride>,
) {
    model.custom_networks = networks;
    model.rpc_overrides = rpc_overrides
        .into_iter()
        .map(|o| (o.slug, o.rpcs))
        .collect();
}

fn persist_custom_data(model: &mut SenderModel) -> Command<SenderEffect, SenderEvent> {
    let operation_id = model.begin(InFlightOp::Persist);
    Command::all([
        request(SenderOperation::PersistCustomData {
            operation_id,
            networks: model.custom_networks.clone(),
            rpc_overrides: model
                .rpc_overrides
                .iter()
                .map(|(slug, rpcs)| RpcOverride {
                    slug: slug.clone(),
                    rpcs: rpcs.clone(),
                })
                .collect(),
        }),
        render(),
    ])
}

fn add_custom_network(
    model: &mut SenderModel,
    name: String,
    chain_id: u64,
    rpc: String,
    symbol: String,
    explorer_tx_url: Option<String>,
) -> Command<SenderEffect, SenderEvent> {
    let slug = format!("custom-{chain_id}");
    let network = Network {
        slug: slug.clone(),
        name: {
            let n = name.trim();
            if n.is_empty() {
                format!("Chain {chain_id}")
            } else {
                n.to_owned()
            }
        },
        chain_id,
        symbol: {
            let s = symbol.trim();
            if s.is_empty() {
                "TOKEN".to_owned()
            } else {
                s.to_owned()
            }
        },
        decimals: 18,
        rpcs: vec![rpc.trim().to_owned()],
        explorer_tx_url: explorer_tx_url.unwrap_or_default().trim().to_owned(),
        multi_send_address: super::sender_networks::MULTI_SEND.to_owned(),
        max_batch_native: 100,
        max_batch_erc20: 100,
        chainlink_native_usd_feed: None,
        is_testnet: false,
        is_custom: true,
    };

    model.custom_networks.retain(|n| n.slug != slug);
    model.custom_networks.push(network);
    model.network_slug = slug;
    model.invalidate_token_context();
    persist_custom_data(model)
}

fn remove_custom_network(
    model: &mut SenderModel,
    slug: &str,
) -> Command<SenderEffect, SenderEvent> {
    model.custom_networks.retain(|n| n.slug != slug);
    model.rpc_overrides.remove(slug);
    if model.network_slug == slug {
        model.network_slug = DEFAULT_NETWORK.to_owned();
        model.invalidate_token_context();
    }
    persist_custom_data(model)
}

// ---------------------------------------------------------------------------
// 宿主应答的单一入口
// ---------------------------------------------------------------------------

fn accept_result(
    model: &mut SenderModel,
    result: SenderShellResult,
) -> Command<SenderEffect, SenderEvent> {
    match result {
        SenderShellResult::BatchSucceeded {
            operation_id,
            tx_hash,
            explorer_url,
        } => {
            let Some(InFlightOp::SendBatch { batch_index }) = model.in_flight.remove(&operation_id)
            else {
                return Command::done();
            };
            let count = model
                .plan
                .as_ref()
                .map(|p| {
                    let size = p.batch_size as usize;
                    p.recipients.len().min((batch_index + 1) * size) - batch_index * size
                })
                .unwrap_or(0);
            model.batches[batch_index] = BatchState::Succeeded {
                tx_hash,
                explorer_url,
                count,
            };
            after_batch(model)
        }

        SenderShellResult::BatchFailed {
            operation_id,
            error,
        } => {
            let Some(InFlightOp::SendBatch { batch_index }) = model.in_flight.remove(&operation_id)
            else {
                return Command::done();
            };
            // 「跳过」策略：单批失败不中止整轮，该批留待续发重试（FR-008）。
            model.batches[batch_index] = BatchState::Failed { error };
            after_batch(model)
        }

        SenderShellResult::BatchPhaseChanged {
            operation_id,
            phase,
        } => {
            // 已被取代的批次的进度不得点亮当前进度条。
            if !matches!(
                model.in_flight.get(&operation_id),
                Some(InFlightOp::SendBatch { .. })
            ) {
                return Command::done();
            }
            model.current_phase = Some(phase);
            render()
        }

        SenderShellResult::DelayElapsed { operation_id } => {
            // 用户在间隔中暂停 ⇒ id 已不在表中 ⇒ 丢弃。宿主不需要取消定时器。
            if !matches!(
                model.in_flight.remove(&operation_id),
                Some(InFlightOp::WaitBetweenBatches)
            ) {
                return Command::done();
            }
            dispatch_next_batch(model)
        }

        SenderShellResult::Erc20MetaRead {
            operation_id,
            ok,
            symbol,
            decimals,
        } => {
            if model.in_flight.remove(&operation_id).is_none() {
                return Command::done();
            }
            model.token_meta_loading = false;
            match (ok, symbol, decimals) {
                (true, Some(symbol), Some(decimals)) => {
                    model.token_meta = Some(TokenMeta { symbol, decimals });
                    model.token_meta_error = None;
                }
                _ => {
                    model.token_meta = None;
                    model.token_meta_error = Some(TokenMetaError::TokenReadFailed);
                }
            }
            render()
        }

        SenderShellResult::FeeQuoted {
            operation_id,
            amount,
            is_member,
        } => {
            if model.in_flight.remove(&operation_id).is_none() {
                return Command::done();
            }
            model.fee_loading = false;
            model.fee = Some(FeeQuote { amount, is_member });

            let (Some(network), Some(parsed), Some(fee)) =
                (model.network(), model.parsed.clone(), model.fee.clone())
            else {
                model.preflight_loading = false;
                return render();
            };
            // 预检用**总费用**（单批 × 批次数），不是单批。
            let fee_total = mul_decimal(&fee.amount, model.total_batches());
            let preflight_id = model.begin(InFlightOp::Preflight);
            Command::all([
                request(SenderOperation::Preflight {
                    operation_id: preflight_id,
                    network,
                    token_type: model.token_type,
                    token_address: model.token_address.trim().to_owned(),
                    total_amount: parsed.total_amount,
                    fee_total,
                }),
                render(),
            ])
        }

        SenderShellResult::PreflightDone {
            operation_id,
            result,
        } => {
            if model.in_flight.remove(&operation_id).is_none() {
                return Command::done();
            }
            model.preflight_loading = false;
            model.preflight = Some(result);
            render()
        }

        SenderShellResult::PreflightFailed {
            operation_id,
            message,
        } => {
            if model.in_flight.remove(&operation_id).is_none() {
                return Command::done();
            }
            model.preflight_loading = false;
            model.fee_loading = false;
            model.review_error = Some(message);
            render()
        }

        SenderShellResult::CustomDataLoaded {
            operation_id,
            networks,
            rpc_overrides,
        } => {
            if model.in_flight.remove(&operation_id).is_none() {
                return Command::done();
            }
            apply_custom_data(model, networks, rpc_overrides);
            render()
        }

        SenderShellResult::PersistCompleted { operation_id, ok } => {
            model.in_flight.remove(&operation_id);
            // 持久化失败不回滚、也不影响发送结果的呈现（FR-018 / Edge case）。
            let _ = ok;
            Command::done()
        }

        SenderShellResult::HistoryLoaded {
            operation_id,
            records,
        } => {
            if model.in_flight.remove(&operation_id).is_none() {
                return Command::done();
            }
            model.history = records;
            render()
        }

        SenderShellResult::MultiSendVerified { operation_id, .. } => {
            model.in_flight.remove(&operation_id);
            render()
        }
    }
}

// ---------------------------------------------------------------------------
// 业务规则测试（data-model.md §5 的 S-01 … S-24）
//
// 不联网、不起浏览器、不等真实时间。批间延时已外化成请求，所以「暂停使间隔失效」
// 这条不需要等 2.5 秒。
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn addr(tag: &str) -> String {
        // 全小写 —— 解析器接受（无大小写信息，无从校验）。
        // 左填充：右填充会让 "1" 与 "10" 补成同一串。
        format!("0x{:0>40}", tag).to_ascii_lowercase()
    }

    fn dispatch(model: &mut SenderModel, event: SenderEvent) {
        let _ = SenderApp.update(event, model);
    }

    fn send(model: &mut SenderModel, result: SenderShellResult) {
        dispatch(model, SenderEvent::ShellCompleted { result });
    }

    /// 当前唯一在途的 SendBatch 的 (id, batch_index)。
    fn in_flight_batch(model: &SenderModel) -> Option<(u64, usize)> {
        model.in_flight.iter().find_map(|(id, op)| match op {
            InFlightOp::SendBatch { batch_index } => Some((*id, *batch_index)),
            _ => None,
        })
    }

    fn in_flight_delay(model: &SenderModel) -> Option<u64> {
        model
            .in_flight
            .iter()
            .find(|(_, op)| matches!(op, InFlightOp::WaitBetweenBatches))
            .map(|(id, _)| *id)
    }

    /// 一个已经准备好发送、共 `n` 个收件人、每批 `batch_size` 的模型。
    fn model_ready(n: usize, batch_size: u32) -> SenderModel {
        let mut model = SenderModel {
            has_wallet: true,
            ..SenderModel::default()
        };
        // 直接指定每批上限，避免依赖内置表的具体数值。
        for net in &mut model.builtin_networks {
            net.max_batch_native = batch_size;
            net.max_batch_erc20 = batch_size;
        }
        let text = (0..n)
            .map(|i| format!("{},1", addr(&format!("{:x}", i + 1))))
            .collect::<Vec<_>>()
            .join("\n");
        dispatch(&mut model, SenderEvent::SetRecipientsText { text });
        dispatch(&mut model, SenderEvent::Parse);
        model.fee = Some(FeeQuote {
            amount: "1000".to_owned(),
            is_member: false,
        });
        model
    }

    /// 让当前在途批次成功。
    fn succeed_current(model: &mut SenderModel) {
        let (id, _) = in_flight_batch(model).expect("应当有一批在途");
        send(
            model,
            SenderShellResult::BatchSucceeded {
                operation_id: id,
                tx_hash: "0xTX".to_owned(),
                explorer_url: None,
            },
        );
    }

    fn fail_current(model: &mut SenderModel, error: &str) {
        let (id, _) = in_flight_batch(model).expect("应当有一批在途");
        send(
            model,
            SenderShellResult::BatchFailed {
                operation_id: id,
                error: error.to_owned(),
            },
        );
    }

    /// 走完一次批间延时，进入下一批。
    fn pass_delay(model: &mut SenderModel) {
        let id = in_flight_delay(model).expect("应当有一次批间延时在途");
        send(model, SenderShellResult::DelayElapsed { operation_id: id });
    }

    fn start(model: &mut SenderModel) {
        dispatch(model, SenderEvent::StartSend { started_at_ms: 1 });
    }

    // -----------------------------------------------------------------------
    // S-01 / S-02 —— 资金安全：已打款的地址永远不会被重复打款
    // -----------------------------------------------------------------------

    /// S-01：续发时，已成功的批次不产生任何请求。
    ///
    /// 迁移前这是循环里的一行 `continue`。现在它是 `next_pending_index` 的候选集里
    /// 根本没有 `Succeeded` —— 一个结构性保证。
    #[test]
    fn resuming_never_re_sends_a_batch_that_already_succeeded() {
        let mut model = model_ready(5, 2); // 3 批：[0,1] [2,3] [4]
        start(&mut model);
        assert_eq!(model.batches.len(), 3);

        // 第 0 批成功、第 1 批失败。
        succeed_current(&mut model);
        pass_delay(&mut model);
        fail_current(&mut model, "boom");
        pass_delay(&mut model);
        // 第 2 批也失败，整轮结束。
        fail_current(&mut model, "boom");

        assert!(model.batches[0].is_succeeded());
        assert!(matches!(model.batches[1], BatchState::Failed { .. }));
        assert!(matches!(model.batches[2], BatchState::Failed { .. }));

        // 续发 —— 只该重试 1 和 2，绝不碰 0。
        let mut requested: Vec<usize> = Vec::new();
        dispatch(&mut model, SenderEvent::Resume);
        while let Some((_, index)) = in_flight_batch(&model) {
            requested.push(index);
            succeed_current(&mut model);
            if in_flight_delay(&model).is_some() {
                pass_delay(&mut model);
            } else {
                break;
            }
        }

        assert_eq!(requested, vec![1, 2], "第 0 批已打款，一个请求都不许发");
    }

    /// S-02：`Succeeded` 是终态 —— 没有任何转移把它改回待发。
    #[test]
    fn a_succeeded_batch_can_never_return_to_pending() {
        let mut model = model_ready(4, 2); // 2 批
        start(&mut model);
        succeed_current(&mut model);
        let first = model.batches[0].clone();

        // 试遍所有可能把它改回去的路径。
        dispatch(&mut model, SenderEvent::Pause);
        dispatch(&mut model, SenderEvent::Resume);
        dispatch(&mut model, SenderEvent::Pause);
        dispatch(&mut model, SenderEvent::Resume);

        assert_eq!(
            model.batches[0], first,
            "已成功的批次状态不得被任何转移改动"
        );
        assert!(
            next_pending_index(&model.batches, 0) != Some(0),
            "它也不该再被选为下一个待发批次"
        );
    }

    /// S-03：任一时刻至多一个批次在途 —— 每批一次 passkey，串行是产品要求。
    #[test]
    fn at_most_one_batch_is_ever_in_flight() {
        let mut model = model_ready(10, 2); // 5 批
        start(&mut model);

        for _ in 0..5 {
            let in_flight = model
                .batches
                .iter()
                .filter(|b| matches!(b, BatchState::InFlight { .. }))
                .count();
            assert!(in_flight <= 1, "同时在途的批次数必须 ≤ 1，实际 {in_flight}");

            if in_flight_batch(&model).is_none() {
                break;
            }
            succeed_current(&mut model);
            if in_flight_delay(&model).is_some() {
                pass_delay(&mut model);
            }
        }
    }

    /// S-04：每个批次请求携带的单批费用与首轮一致 —— 续发不重复涨价、也不少收。
    #[test]
    fn every_batch_carries_the_same_per_batch_fee_including_on_resume() {
        let mut model = model_ready(6, 2); // 3 批
        start(&mut model);

        let fee_of = |m: &SenderModel| m.plan.as_ref().unwrap().fee_per_batch.clone();
        let first_fee = fee_of(&model);

        succeed_current(&mut model);
        pass_delay(&mut model);
        fail_current(&mut model, "boom");
        pass_delay(&mut model);
        fail_current(&mut model, "boom");

        // 用户在续发之前改了费用 —— 计划已冻结，不该受影响。
        model.fee = Some(FeeQuote {
            amount: "999999".to_owned(),
            is_member: false,
        });
        dispatch(&mut model, SenderEvent::Resume);

        assert_eq!(
            fee_of(&model),
            first_fee,
            "计划在 StartSend 时冻结，续发沿用同一费用"
        );
    }

    // -----------------------------------------------------------------------
    // S-05 / S-06 / S-07 —— 暂停
    // -----------------------------------------------------------------------

    /// S-05 / S-06：暂停不再开新批；**在途那批的结果照常记录**。
    #[test]
    fn pausing_stops_new_batches_but_still_records_the_one_in_flight() {
        let mut model = model_ready(6, 2); // 3 批
        start(&mut model);
        let (id, index) = in_flight_batch(&model).expect("第 0 批应当在途");
        assert_eq!(index, 0);

        dispatch(&mut model, SenderEvent::Pause);
        assert_eq!(model.send_status, SendStatus::Paused);
        assert!(
            in_flight_batch(&model).is_some(),
            "在途的那批**不被撤回** —— 交易可能已上链"
        );

        // 它的结果现在回来了。
        send(
            &mut model,
            SenderShellResult::BatchSucceeded {
                operation_id: id,
                tx_hash: "0xTX".to_owned(),
                explorer_url: None,
            },
        );

        assert!(model.batches[0].is_succeeded(), "暂停后到达的结果仍要记录");
        assert!(in_flight_batch(&model).is_none(), "但不开新批");
        assert!(in_flight_delay(&model).is_none(), "也不排期批间延时");
    }

    /// S-07：暂停使在途的批间延时**立即**失效 —— 用户不该等满 2.5 秒。
    ///
    /// 注意这个用例里没有任何 sleep：延时已经外化成一个带 id 的请求。
    #[test]
    fn pausing_during_the_inter_batch_delay_takes_effect_immediately() {
        let mut model = model_ready(6, 2);
        start(&mut model);
        succeed_current(&mut model);
        let delay_id = in_flight_delay(&model).expect("应当排期了批间延时");

        dispatch(&mut model, SenderEvent::Pause);
        assert!(in_flight_delay(&model).is_none(), "延时被移出在途表");

        // 宿主的定时器照常到期 —— 它并不知道被取消了，也不需要知道。
        send(
            &mut model,
            SenderShellResult::DelayElapsed {
                operation_id: delay_id,
            },
        );

        assert!(
            in_flight_batch(&model).is_none(),
            "到期回送被丢弃，不得开新批"
        );
        assert_eq!(model.send_status, SendStatus::Paused);
    }

    #[test]
    fn resuming_after_a_pause_continues_from_the_next_batch() {
        let mut model = model_ready(6, 2);
        start(&mut model);
        succeed_current(&mut model);
        dispatch(&mut model, SenderEvent::Pause);

        dispatch(&mut model, SenderEvent::Resume);
        let (_, index) = in_flight_batch(&model).expect("续发后应当有一批在途");
        assert_eq!(index, 1, "从第 1 批继续，不重发第 0 批");
    }

    // -----------------------------------------------------------------------
    // S-08 / S-09 / S-21 / S-22
    // -----------------------------------------------------------------------

    /// S-08：单批失败不中止整轮（「跳过」策略）。
    #[test]
    fn a_failing_batch_does_not_abort_the_whole_run() {
        let mut model = model_ready(6, 2); // 3 批
        start(&mut model);
        fail_current(&mut model, "boom");

        assert_eq!(model.send_status, SendStatus::Running, "整轮继续");
        assert!(in_flight_delay(&model).is_some(), "照常排期下一批");
    }

    /// S-09：全部成功后为 Done，且不再发出批次请求。
    #[test]
    fn the_run_reaches_done_and_stops_asking_for_more() {
        let mut model = model_ready(4, 2); // 2 批
        start(&mut model);
        succeed_current(&mut model);
        pass_delay(&mut model);
        succeed_current(&mut model);

        assert_eq!(model.send_status, SendStatus::Done);
        assert!(in_flight_batch(&model).is_none());
        assert!(in_flight_delay(&model).is_none());
        // Resume 在无待发批次时什么都不做。
        let before = model.next_operation_id;
        dispatch(&mut model, SenderEvent::Resume);
        assert_eq!(model.next_operation_id, before);
    }

    /// S-21：收件人为空时不产生任何请求。
    #[test]
    fn starting_with_no_recipients_asks_the_shell_for_nothing() {
        let mut model = SenderModel {
            has_wallet: true,
            fee: Some(FeeQuote {
                amount: "1000".to_owned(),
                is_member: false,
            }),
            ..SenderModel::default()
        };
        dispatch(&mut model, SenderEvent::Parse);

        let before = model.next_operation_id;
        start(&mut model);
        assert_eq!(model.next_operation_id, before);
        assert!(model.batches.is_empty());
    }

    /// S-22：每批上限为 0 时按 1 处理，不产生空批也不死循环。
    #[test]
    fn a_zero_batch_limit_is_treated_as_one() {
        let mut model = model_ready(3, 0);
        assert_eq!(model.batch_size(), 1);
        start(&mut model);
        assert_eq!(model.batches.len(), 3, "3 个收件人、每批 1 个 ⇒ 3 批");
    }

    // -----------------------------------------------------------------------
    // S-14 … S-20、S-23 —— 向导、费用、历史
    // -----------------------------------------------------------------------

    /// S-14 / S-15：批次数与总费用。
    #[test]
    fn batch_count_and_total_fee_follow_the_per_batch_limit() {
        let model = model_ready(250, 100);
        assert_eq!(model.total_batches(), 3, "250 / 100 向上取整 = 3");

        let view = SenderApp.view(&model);
        assert_eq!(view.total_batches, 3);
        assert_eq!(view.fee_total, "3000", "单批 1000 × 3 批");
    }

    /// S-16 / S-17：会员豁免归零，且在 Review 步骤被证明后触发重算。
    #[test]
    fn proving_membership_on_the_review_step_requotes_the_fee() {
        let mut model = model_ready(4, 2);
        model.step = WizardStep::Review;
        let before = model.next_operation_id;

        dispatch(&mut model, SenderEvent::MemberProven { waived: true });

        assert!(model.member_waived);
        assert!(
            model.next_operation_id > before,
            "证明成功必须触发重新报价 —— 迁移前这条时序规则藏在一个与步骤耦合的副作用里"
        );
        // 重新报价的请求带着 is_member: true。
        assert!(
            model
                .in_flight
                .values()
                .any(|op| matches!(op, InFlightOp::QuoteFee))
        );
    }

    #[test]
    fn a_member_quote_of_zero_makes_the_total_zero() {
        let mut model = model_ready(250, 100);
        model.fee = Some(FeeQuote {
            amount: "0".to_owned(),
            is_member: true,
        });
        assert_eq!(SenderApp.view(&model).fee_total, "0");
    }

    /// S-18：切网络 / 切代币类型清空 token_meta、parsed、gas_fee_token。
    #[test]
    fn switching_network_or_token_type_clears_the_token_context() {
        let mut model = model_ready(4, 2);
        model.token_meta = Some(TokenMeta {
            symbol: "USDC".to_owned(),
            decimals: 6,
        });
        model.gas_fee_token = Some(addr("f00d"));
        assert!(model.parsed.is_some());

        dispatch(
            &mut model,
            SenderEvent::SetNetwork {
                slug: "base-mainnet".to_owned(),
            },
        );

        assert!(model.token_meta.is_none());
        assert!(model.parsed.is_none(), "精度可能变了，金额含义随之改变");
        assert!(model.gas_fee_token.is_none());

        // 切代币类型同理。
        let mut model = model_ready(4, 2);
        model.token_meta = Some(TokenMeta {
            symbol: "USDC".to_owned(),
            decimals: 6,
        });
        dispatch(
            &mut model,
            SenderEvent::SetTokenType {
                token_type: TokenType::Erc20,
            },
        );
        assert!(model.token_meta.is_none());
        assert!(model.parsed.is_none());
    }

    /// S-19 / S-20：两步的可推进条件。
    #[test]
    fn the_wizard_gates_each_step_on_its_own_condition() {
        let mut model = SenderModel::default();
        // 原生：第一步恒可推进。
        assert!(SenderApp.view(&model).can_proceed_from_config);

        // ERC20 且未取到元数据：不可推进。
        model.token_type = TokenType::Erc20;
        assert!(!SenderApp.view(&model).can_proceed_from_config);
        model.token_meta = Some(TokenMeta {
            symbol: "USDC".to_owned(),
            decimals: 6,
        });
        assert!(SenderApp.view(&model).can_proceed_from_config);

        // 有效收件人为 0：不可离开第二步。
        assert!(!SenderApp.view(&model).can_proceed_from_recipients);
        let ready = model_ready(3, 2);
        assert!(SenderApp.view(&ready).can_proceed_from_recipients);
    }

    /// S-23：历史三态判定。
    #[test]
    fn history_status_reflects_the_mix_of_successes_and_failures() {
        // 全成 ⇒ Completed
        let mut model = model_ready(4, 2);
        start(&mut model);
        succeed_current(&mut model);
        pass_delay(&mut model);
        succeed_current(&mut model);
        assert_eq!(persisted_status(&model), Some(HistoryStatus::Completed));

        // 部分 ⇒ Partial
        let mut model = model_ready(4, 2);
        start(&mut model);
        succeed_current(&mut model);
        pass_delay(&mut model);
        fail_current(&mut model, "boom");
        assert_eq!(persisted_status(&model), Some(HistoryStatus::Partial));

        // 全败 ⇒ Failed
        let mut model = model_ready(4, 2);
        start(&mut model);
        fail_current(&mut model, "boom");
        pass_delay(&mut model);
        fail_current(&mut model, "boom");
        assert_eq!(persisted_status(&model), Some(HistoryStatus::Failed));
    }

    /// 从最近一次 finish_send 产出的历史记录里读状态。
    ///
    /// 直接跑一遍 `finish_send` 拿记录 —— 它是纯函数式的，不产生副作用之外的状态改变。
    fn persisted_status(model: &SenderModel) -> Option<HistoryStatus> {
        let succeeded = model.batches.iter().filter(|b| b.is_succeeded()).count();
        let failed = model.batches.len() - succeeded;
        if model.batches.is_empty() {
            return None;
        }
        Some(if failed == 0 {
            HistoryStatus::Completed
        } else if succeeded == 0 {
            HistoryStatus::Failed
        } else {
            HistoryStatus::Partial
        })
    }

    // -----------------------------------------------------------------------
    // ViewModel 的边界
    // -----------------------------------------------------------------------

    /// 视图不得携带内部记账，也不得携带整份收件人清单。
    #[test]
    fn the_view_model_carries_neither_bookkeeping_nor_the_recipient_list() {
        let mut model = model_ready(500, 100);
        start(&mut model);

        let json = serde_json::to_string(&SenderApp.view(&model)).unwrap();
        // 查 JSON **键**，不是子串 —— `BatchView::InFlight` 的值就叫 "in_flight"，
        // 用子串检查会把它误判成泄漏。
        for leaked in [
            "in_flight",
            "next_operation_id",
            "operation_id",
            "fee_per_batch",
            "send_cursor",
            "recipients",
        ] {
            assert!(
                !json.contains(&format!("\"{leaked}\":")),
                "`{leaked}` 不该作为字段出现在 ViewModel 里"
            );
        }
        // 但摘要必须在。
        let view = SenderApp.view(&model);
        assert_eq!(view.valid_count, 500);
        assert_eq!(view.total_batches, 5);
        assert_eq!(view.batches.len(), 5);
    }
}
