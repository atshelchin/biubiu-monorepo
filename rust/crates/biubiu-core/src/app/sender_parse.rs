//! 收件人解析。
//!
//! 搬自迁移前的 `core/parse.ts`，规则逐条对照，**取值与分类未作任何改动**。
//!
//! 它进核心是因为它产出的每一个数字都直接决定用户看到的金额与被收取的费用 ——
//! 有效数、重复数、总额、批次数、总费用。这是业务，不是格式转换（research.md D17）。
//!
//! 地址的 EIP-55 **校验**在这里做（需要 keccak256），因为「这一行为什么非法」是分类规则，
//! 而校验和错误的地址极可能是笔误 —— 在一个经手资金的路径上，那正是最该拦下的一类。
//! 输出的地址是**校验和形式**（与迁移前 `getAddress(addr)` 的产出一致）—— 既然 keccak256
//! 已经为校验而在核心里了，产出这个形式是免费的，而它是用户在界面上看到的那一串。
//!
//! 这一条是实测纠正过来的：我最初以为 viem 的 `isAddress(addr)` 默认宽松，把它写成了只查
//! 形状，那会让全大写和笔误地址静默变成有效收件人（research.md D21）。

use serde::{Deserialize, Serialize};

use super::sender::{DistributionMode, Recipient};

#[cfg(feature = "bindings")]
use ts_rs::TS;

/// 一行为什么被判为非法。四个取值与迁移前逐字一致 —— 界面按它们分类展示。
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
#[serde(rename_all = "kebab-case")]
pub enum InvalidReason {
    InvalidAddress,
    MissingAmount,
    InvalidAmount,
    ZeroAmount,
    /// 均分模式下总额 < 收件人数：每份取整后为 0。
    ///
    /// 迁移前这是一次**修过的 footgun**（`core/parse.ts` 的注释写明了）：每份为 0 会产出一堆
    /// 零额转账，照样烧 gas、照样按批收费，却什么都没转。整个解析被拒，而不是静默发出去。
    AmountTooSmallForRecipientCount,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct InvalidLine {
    /// 行号，从 1 计。
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub line: usize,
    pub text: String,
    pub reason: InvalidReason,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[cfg_attr(feature = "bindings", derive(TS))]
pub struct ParseResult {
    pub recipients: Vec<Recipient>,
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub valid_count: usize,
    /// 重复地址的条数。
    ///
    /// **重复不算非法** —— 它只增加这个计数，不进 `invalid`。界面上是两个不同的数字，
    /// 归错一处会让两个计数同时错。
    #[cfg_attr(feature = "bindings", ts(type = "number"))]
    pub duplicate_count: usize,
    pub invalid: Vec<InvalidLine>,
    /// 十进制字符串。
    pub total_amount: String,
}

/// 十进制字符串 → 最小单位整数，与 viem 的 `parseUnits` 同语义。
///
/// 用 `u128` 而不是引入大整数 crate：`u128::MAX` ≈ 3.4e38，而 ERC20 常见的
/// 18 位精度下这相当于 3.4e20 个代币 —— 单笔转账不会接近它。溢出返回 `None`，
/// 由调用方判为非法金额，而不是静默截断。
fn parse_units(input: &str, decimals: u8) -> Option<u128> {
    let s = input.trim();
    if s.is_empty() {
        return None;
    }
    let (int_part, frac_part) = match s.split_once('.') {
        Some((i, f)) => (i, f),
        None => (s, ""),
    };
    if int_part.is_empty() && frac_part.is_empty() {
        return None;
    }
    if !int_part.bytes().all(|b| b.is_ascii_digit())
        || !frac_part.bytes().all(|b| b.is_ascii_digit())
    {
        return None;
    }

    let decimals = decimals as usize;
    // 小数位多于精度时截断（viem 默认行为：多余位被丢弃，不四舍五入）。
    let frac: String = frac_part
        .chars()
        .chain(std::iter::repeat('0'))
        .take(decimals)
        .collect();

    let combined = format!(
        "{}{}",
        if int_part.is_empty() { "0" } else { int_part },
        frac
    );
    combined.parse::<u128>().ok()
}

/// 地址是否被接受。
///
/// 形状（`0x` + 40 个十六进制字符）**加上** EIP-55 校验和 —— 与迁移前 `parse.ts` 调用的
/// `isAddress(addr)` 完全一致。那个调用没有传 `strict: false`，所以它是严格的：
///
/// ```text
/// 全小写                   接受   （无大小写信息，无从校验）
/// 正确校验和               接受
/// 校验和错误（混合大小写）  拒绝   ← 极可能是笔误
/// 全大写                   拒绝
/// ```
///
/// 上面这张表是**实测**出来的，不是从文档推断的 —— 我最初以为默认是宽松模式，写成了只查形状，
/// 那会让笔误地址静默变成有效收件人。在一个经手资金的路径上，「这个地址是不是打错了」正是
/// 用户最需要的那道拦截（research.md D21）。
///
/// 注意 `revoke` 域的 `isValidAddress` 用的是 `strict: false`，两个域的口径本来就不同，
/// 各自保持各自的。
fn is_accepted_address(candidate: &str) -> bool {
    if candidate.len() != 42 || !candidate.starts_with("0x") {
        return false;
    }
    let body = &candidate[2..];
    if !body.bytes().all(|b| b.is_ascii_hexdigit()) {
        return false;
    }
    // 没有任何大写字母 ⇒ 不携带校验和信息 ⇒ 接受（与 viem 一致）。
    if !body.bytes().any(|b| b.is_ascii_uppercase()) {
        return true;
    }
    body == checksum_body(&body.to_ascii_lowercase())
}

/// EIP-55：对小写地址体做 keccak256，每个十六进制位按对应 nibble 的高位决定大小写。
fn checksum_body(lower_body: &str) -> String {
    use tiny_keccak::{Hasher, Keccak};

    let mut hasher = Keccak::v256();
    hasher.update(lower_body.as_bytes());
    let mut hash = [0u8; 32];
    hasher.finalize(&mut hash);

    lower_body
        .chars()
        .enumerate()
        .map(|(i, c)| {
            let nibble = if i % 2 == 0 {
                hash[i / 2] >> 4
            } else {
                hash[i / 2] & 0x0f
            };
            if nibble >= 8 {
                c.to_ascii_uppercase()
            } else {
                c
            }
        })
        .collect()
}

pub struct ParseInput<'a> {
    pub text: &'a str,
    pub mode: DistributionMode,
    pub decimals: u8,
    /// 均分模式下的总额（用户输入的十进制字符串）。
    pub total_amount: &'a str,
}

/// 解析多行文本。
///
/// - `Specified`：每行 `address,amount`（逗号 / 制表符 / 空格分隔均可）
/// - `Equal`：每行 `address`，金额由 `total_amount` 均分，**首位收余尘**
///
/// 空行与以 `#` 开头的行被忽略，**不计入任何计数**。地址去重保留首次出现。
pub fn parse_recipients(input: ParseInput<'_>) -> ParseResult {
    let mut seen: Vec<String> = Vec::new();
    let mut recipients: Vec<Recipient> = Vec::new();
    let mut amounts: Vec<u128> = Vec::new();
    let mut invalid: Vec<InvalidLine> = Vec::new();
    let mut duplicate_count = 0usize;

    for (index, line) in input.text.split('\n').enumerate() {
        let raw = line.trim();
        if raw.is_empty() || raw.starts_with('#') {
            continue;
        }

        let parts: Vec<&str> = raw
            .split([',', '\t', ' '])
            .map(str::trim)
            .filter(|p| !p.is_empty())
            .collect();
        let Some(&addr) = parts.first() else {
            continue;
        };

        if !is_accepted_address(addr) {
            invalid.push(InvalidLine {
                line: index + 1,
                text: raw.to_owned(),
                reason: InvalidReason::InvalidAddress,
            });
            continue;
        }

        let key = addr.to_ascii_lowercase();
        if seen.contains(&key) {
            // 重复只计数，不进 invalid —— 界面上是两个不同的数字。
            duplicate_count += 1;
            continue;
        }

        let mut amount: u128 = 0;
        if input.mode == DistributionMode::Specified {
            let Some(&amount_str) = parts.get(1) else {
                invalid.push(InvalidLine {
                    line: index + 1,
                    text: raw.to_owned(),
                    reason: InvalidReason::MissingAmount,
                });
                continue;
            };
            let Some(parsed) = parse_units(amount_str, input.decimals) else {
                invalid.push(InvalidLine {
                    line: index + 1,
                    text: raw.to_owned(),
                    reason: InvalidReason::InvalidAmount,
                });
                continue;
            };
            if parsed == 0 {
                invalid.push(InvalidLine {
                    line: index + 1,
                    text: raw.to_owned(),
                    reason: InvalidReason::ZeroAmount,
                });
                continue;
            }
            amount = parsed;
        }

        seen.push(key.clone());
        recipients.push(Recipient {
            // 与迁移前的 `getAddress(addr)` 一致：输出带校验和的形式。
            address: format!("0x{}", checksum_body(&key[2..])),
            amount: amount.to_string(),
        });
        amounts.push(amount);
    }

    // 均分：每人 total / n，**首位收余尘**（与迁移前一致）。
    if input.mode == DistributionMode::Equal && !recipients.is_empty() {
        // 总额缺失或无法解析 ⇒ 整个解析为空（迁移前直接 return 空结果）。
        let Some(total) = parse_units(input.total_amount, input.decimals) else {
            return ParseResult {
                recipients: Vec::new(),
                valid_count: 0,
                duplicate_count,
                invalid,
                total_amount: "0".to_owned(),
            };
        };

        let n = recipients.len() as u128;
        let each = total / n;

        // 每份取整为 0 ⇒ 拒绝整次解析。零额转账照样烧 gas、照样按批收费，却什么都没转
        // （迁移前修过的 footgun）。用户必须提高总额或减少收件人。
        if each == 0 {
            invalid.push(InvalidLine {
                line: 0,
                text: input.total_amount.to_owned(),
                reason: InvalidReason::AmountTooSmallForRecipientCount,
            });
            return ParseResult {
                recipients: Vec::new(),
                valid_count: 0,
                duplicate_count,
                invalid,
                total_amount: "0".to_owned(),
            };
        }

        let dust = total - each * n;
        for (i, recipient) in recipients.iter_mut().enumerate() {
            let value = if i == 0 { each + dust } else { each };
            recipient.amount = value.to_string();
            amounts[i] = value;
        }
    }

    let total_amount: u128 = amounts.iter().sum();

    ParseResult {
        valid_count: recipients.len(),
        recipients,
        duplicate_count,
        invalid,
        total_amount: total_amount.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 实测自 viem 的四种情形（research.md D21）。
    const LOWER: &str = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const CHECKSUMMED: &str = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const BAD_CHECKSUM: &str = "0xA0B86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const ALL_UPPER: &str = "0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48";

    fn parse(text: &str, mode: DistributionMode, decimals: u8, total: &str) -> ParseResult {
        parse_recipients(ParseInput {
            text,
            mode,
            decimals,
            total_amount: total,
        })
    }

    #[test]
    fn address_acceptance_matches_viem_exactly() {
        assert!(is_accepted_address(LOWER), "全小写：无大小写信息，接受");
        assert!(is_accepted_address(CHECKSUMMED), "正确校验和：接受");
        assert!(
            !is_accepted_address(BAD_CHECKSUM),
            "校验和错误：拒绝 —— 极可能是笔误"
        );
        assert!(!is_accepted_address(ALL_UPPER), "全大写：拒绝");
        assert!(!is_accepted_address("0x123"), "长度不对：拒绝");
        assert!(
            !is_accepted_address("0xZZb86991c6218b36c1d19d4a2e9eb0ce3606eb48"),
            "非十六进制：拒绝"
        );
    }

    /// S-10：空行与注释行被忽略，不计入任何计数。
    #[test]
    fn blank_and_comment_lines_are_invisible_to_every_counter() {
        let text = format!("\n# 这是注释\n{LOWER},1\n\n   \n# 又一条注释\n");
        let out = parse(&text, DistributionMode::Specified, 18, "");

        assert_eq!(out.valid_count, 1);
        assert_eq!(out.duplicate_count, 0);
        assert!(out.invalid.is_empty(), "注释与空行不该出现在非法清单里");
    }

    /// S-11：重复地址只增加 duplicate_count，**不进 invalid**。
    #[test]
    fn duplicates_are_counted_but_never_listed_as_invalid() {
        let text = format!("{LOWER},1\n{CHECKSUMMED},2\n{LOWER},3");
        let out = parse(&text, DistributionMode::Specified, 18, "");

        assert_eq!(out.valid_count, 1, "同一个地址只保留首次出现");
        assert_eq!(out.duplicate_count, 2, "另外两行都是重复");
        assert!(
            out.invalid.is_empty(),
            "重复不是非法 —— 界面上是两个不同的数字"
        );
        assert_eq!(
            out.total_amount, "1000000000000000000",
            "只有首次那行的金额计入总额"
        );
    }

    /// S-12：四类非法原因的分类与迁移前一致。
    #[test]
    fn every_invalid_reason_is_classified_as_before() {
        let text = format!(
            "not-an-address,1\n{ALL_UPPER},1\n{LOWER}\n{CHECKSUMMED},abc\n0x{}, 0",
            "b".repeat(40)
        );
        let out = parse(&text, DistributionMode::Specified, 18, "");

        let reasons: Vec<_> = out.invalid.iter().map(|i| (i.line, i.reason)).collect();
        assert_eq!(
            reasons,
            vec![
                (1, InvalidReason::InvalidAddress),
                (2, InvalidReason::InvalidAddress), // 全大写
                (3, InvalidReason::MissingAmount),
                (4, InvalidReason::InvalidAmount),
                (5, InvalidReason::ZeroAmount),
            ]
        );
        assert_eq!(out.valid_count, 0);
    }

    /// S-13：均分模式 —— 余尘归首位，总额恰好等于输入总额。
    #[test]
    fn equal_mode_gives_the_dust_to_the_first_recipient() {
        let a = LOWER;
        let b = format!("0x{}", "b".repeat(40));
        let c = format!("0x{}", "c".repeat(40));
        let text = format!("{a}\n{b}\n{c}");

        // 10 wei / 3 人 = 3 每人，余 1 归首位。用 decimals=0 让数字直观。
        let out = parse(&text, DistributionMode::Equal, 0, "10");

        let amounts: Vec<_> = out.recipients.iter().map(|r| r.amount.as_str()).collect();
        assert_eq!(amounts, vec!["4", "3", "3"]);
        assert_eq!(out.total_amount, "10", "总额必须恰好等于用户输入的总额");
    }

    #[test]
    fn separators_may_be_comma_tab_or_space() {
        let b = format!("0x{}", "b".repeat(40));
        let c = format!("0x{}", "c".repeat(40));
        let text = format!("{LOWER},1\n{b}\t2\n{c} 3");
        let out = parse(&text, DistributionMode::Specified, 0, "");

        assert_eq!(out.valid_count, 3);
        assert_eq!(out.total_amount, "6");
    }

    #[test]
    fn fractional_amounts_beyond_the_precision_are_truncated_not_rounded() {
        // viem 的 parseUnits 丢弃多余小数位，不四舍五入。
        let text = format!("{LOWER},1.999");
        let out = parse(&text, DistributionMode::Specified, 2, "");
        assert_eq!(out.total_amount, "199");
    }

    /// 迁移前的既有测试：输出地址是校验和形式。
    #[test]
    fn output_addresses_carry_the_eip55_checksum() {
        let out = parse(&format!("{LOWER},1"), DistributionMode::Specified, 0, "");
        assert_eq!(out.recipients[0].address, CHECKSUMMED);
    }

    /// 迁移前的既有测试：均分模式下总额缺失 ⇒ 整个解析为空。
    #[test]
    fn equal_mode_without_a_total_yields_nothing() {
        let b = format!("0x{}", "b".repeat(40));
        let out = parse(&format!("{LOWER}\n{b}"), DistributionMode::Equal, 18, "");

        assert_eq!(out.valid_count, 0);
        assert!(out.recipients.is_empty());
        assert_eq!(out.total_amount, "0");
    }

    /// 迁移前修过的 footgun：总额 < 人数 ⇒ 每份取整为 0 ⇒ **拒绝整次解析**。
    ///
    /// 零额转账照样烧 gas、照样按批收费，却什么都没转。这条规则读实现时很容易漏掉 ——
    /// 它是读既有测试才发现的。
    #[test]
    fn a_total_smaller_than_the_recipient_count_is_refused_not_silently_zeroed() {
        let addrs: Vec<String> = ["b", "c", "d", "e"]
            .iter()
            .map(|c| format!("0x{}", c.repeat(40)))
            .collect();
        let text = format!("{LOWER}\n{}", addrs.join("\n"));

        // 5 个收件人分 2 个最小单位 → 每份 0。
        let out = parse(&text, DistributionMode::Equal, 0, "2");

        assert_eq!(out.valid_count, 0);
        assert!(out.recipients.is_empty(), "绝不产出零额转账");
        assert_eq!(out.total_amount, "0");
        assert!(
            out.invalid
                .iter()
                .any(|i| i.reason == InvalidReason::AmountTooSmallForRecipientCount),
            "原因要暴露给界面，和 specified 模式的非法行一致"
        );
    }

    /// 边界：总额恰好等于人数 ⇒ 每份 1，没有零。
    #[test]
    fn a_total_exactly_equal_to_the_recipient_count_is_accepted() {
        let b = format!("0x{}", "b".repeat(40));
        let c = format!("0x{}", "c".repeat(40));
        let out = parse(
            &format!("{LOWER}\n{b}\n{c}"),
            DistributionMode::Equal,
            0,
            "3",
        );

        assert_eq!(out.valid_count, 3);
        let amounts: Vec<_> = out.recipients.iter().map(|r| r.amount.as_str()).collect();
        assert_eq!(amounts, vec!["1", "1", "1"]);
    }

    /// 边界：单个收件人 + 极小总额，不该被除零或取整规则误伤。
    #[test]
    fn a_single_recipient_with_a_tiny_total_still_works() {
        let out = parse(LOWER, DistributionMode::Equal, 0, "1");
        assert_eq!(out.valid_count, 1);
        assert_eq!(out.recipients[0].amount, "1");
    }

    #[test]
    fn empty_input_yields_an_empty_result() {
        let out = parse("", DistributionMode::Specified, 18, "");
        assert_eq!(out.valid_count, 0);
        assert_eq!(out.total_amount, "0");
    }
}
