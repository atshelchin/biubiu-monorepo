//! 授权撤销域的内置探测目标：代币/收藏品与已知授权方。
//!
//! 逐条搬自迁移前的 `registry/tokens.ts` 与 `registry/spenders.ts`，**取值未作任何改动**
//! （spec 001-biubiu-core-crux，FR-026 禁止在迁移中夹带改进）。表由脚本从 TS 源文件生成，
//! 不是手抄 —— 上百个地址手抄必错。
//!
//! 这两份数据进核心、而内置网络表留在宿主，理由见 research.md D12：代币与授权方是 revoke 域
//! **自己的**数据，且带着合并去重的业务规则；网络表派生自钱包的 `CHAINS`，属于尚未迁移的
//! wallet 域，复制进来会制造两份真相。
//!
//! 多一个授权方是**无害的**：只有额度 > 0（或 operator = true）才会成为一行，而对一条链上无代码
//! 的地址发起 Multicall 会失败并被当作 0。因此在各链同地址部署的（Permit2、Seaport、0x、1inch…）
//! 统一列在 `CROSS_CHAIN_SPENDERS` 里对所有链使用。
//!
//! 少一个也不致命：漏掉的授权可由深度扫描与用户自定义条目补上。

use super::revoke::{SpenderEntry, SpenderKind, TokenEntry, TokenStandard};

/// 静态表里的一条代币。`TokenEntry` 持有 `String`，无法在 const 上下文构造，
/// 因此表里存 `&'static str`，取用时再转成 owned。
struct StaticToken {
    standard: TokenStandard,
    address: &'static str,
    symbol: &'static str,
    name: &'static str,
    decimals: Option<u8>,
}

impl StaticToken {
    fn to_entry(&self) -> TokenEntry {
        TokenEntry {
            standard: self.standard,
            address: self.address.to_owned(),
            symbol: self.symbol.to_owned(),
            name: Some(self.name.to_owned()),
            decimals: self.decimals,
            is_custom: false,
        }
    }
}

struct StaticSpender {
    address: &'static str,
    label: &'static str,
    kind: SpenderKind,
}

impl StaticSpender {
    fn to_entry(&self) -> SpenderEntry {
        SpenderEntry {
            address: self.address.to_owned(),
            label: self.label.to_owned(),
            kind: self.kind,
            is_custom: false,
        }
    }
}

const fn t20(
    address: &'static str,
    symbol: &'static str,
    decimals: u8,
    name: &'static str,
) -> StaticToken {
    StaticToken {
        standard: TokenStandard::Erc20,
        address,
        symbol,
        name,
        decimals: Some(decimals),
    }
}

const fn t721(address: &'static str, symbol: &'static str, name: &'static str) -> StaticToken {
    StaticToken {
        standard: TokenStandard::Erc721,
        address,
        symbol,
        name,
        decimals: None,
    }
}

const fn sp(address: &'static str, label: &'static str, kind: SpenderKind) -> StaticSpender {
    StaticSpender {
        address,
        label,
        kind,
    }
}

/// Multicall3 —— 每条链上都是同一个确定性地址。
pub const MULTICALL3: &str = "0xcA11bde05977b3631167028862bE2a173976CA11";

/// Uniswap Permit2 —— 撤销走 `lockdown` 而不是 `approve(0)`。
pub const PERMIT2_ADDRESS: &str = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

/// 内置代币/收藏品，按 chainId 归属。未收录的链返回空表。
const BUILTIN_TOKENS: &[(u64, &[StaticToken])] = &[
    // Ethereum
    (
        1,
        &[
            t20(
                "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                "USDC",
                6,
                "USD Coin",
            ),
            t20(
                "0xdAC17F958D2ee523a2206206994597C13D831ec7",
                "USDT",
                6,
                "Tether USD",
            ),
            t20(
                "0x6B175474E89094C44Da98b954EedeAC495271d0F",
                "DAI",
                18,
                "Dai",
            ),
            t20(
                "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                "WETH",
                18,
                "Wrapped Ether",
            ),
            t20(
                "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
                "WBTC",
                8,
                "Wrapped BTC",
            ),
            t20(
                "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
                "UNI",
                18,
                "Uniswap",
            ),
            t20(
                "0x514910771AF9Ca656af840dff83E8264EcF986CA",
                "LINK",
                18,
                "Chainlink",
            ),
            t20(
                "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
                "AAVE",
                18,
                "Aave",
            ),
            t20(
                "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
                "PEPE",
                18,
                "Pepe",
            ),
            t721(
                "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
                "BAYC",
                "Bored Ape Yacht Club",
            ),
            t721(
                "0x60E4d786628Fea6478F785A6d7e704777c86a7c6",
                "MAYC",
                "Mutant Ape Yacht Club",
            ),
            t721(
                "0xED5AF388653567Af2F388E6224dC7C4b3241C544",
                "AZUKI",
                "Azuki",
            ),
            t721(
                "0xBd3531dA5CF5857e7CfAA92426877b022e612cf8",
                "PPG",
                "Pudgy Penguins",
            ),
        ],
    ),
    // Base
    (
        8453,
        &[
            t20(
                "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                "USDC",
                6,
                "USD Coin",
            ),
            t20(
                "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
                "DAI",
                18,
                "Dai",
            ),
            t20(
                "0x4200000000000000000000000000000000000006",
                "WETH",
                18,
                "Wrapped Ether",
            ),
            t20(
                "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
                "cbBTC",
                8,
                "Coinbase Wrapped BTC",
            ),
        ],
    ),
    // Arbitrum
    (
        42161,
        &[
            t20(
                "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
                "USDC",
                6,
                "USD Coin",
            ),
            t20(
                "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
                "USDT",
                6,
                "Tether USD",
            ),
            t20(
                "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
                "DAI",
                18,
                "Dai",
            ),
            t20(
                "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
                "WETH",
                18,
                "Wrapped Ether",
            ),
            t20(
                "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
                "WBTC",
                8,
                "Wrapped BTC",
            ),
            t20(
                "0x912CE59144191C1204E64559FE8253a0e49E6548",
                "ARB",
                18,
                "Arbitrum",
            ),
        ],
    ),
    // Optimism
    (
        10,
        &[
            t20(
                "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
                "USDC",
                6,
                "USD Coin",
            ),
            t20(
                "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
                "USDT",
                6,
                "Tether USD",
            ),
            t20(
                "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
                "DAI",
                18,
                "Dai",
            ),
            t20(
                "0x4200000000000000000000000000000000000006",
                "WETH",
                18,
                "Wrapped Ether",
            ),
            t20(
                "0x4200000000000000000000000000000000000042",
                "OP",
                18,
                "Optimism",
            ),
        ],
    ),
    // Polygon
    (
        137,
        &[
            t20(
                "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
                "USDC",
                6,
                "USD Coin",
            ),
            t20(
                "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
                "USDC.e",
                6,
                "USD Coin (PoS)",
            ),
            t20(
                "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
                "USDT",
                6,
                "Tether USD",
            ),
            t20(
                "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
                "DAI",
                18,
                "Dai",
            ),
            t20(
                "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
                "WETH",
                18,
                "Wrapped Ether",
            ),
            t20(
                "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
                "WMATIC",
                18,
                "Wrapped Matic",
            ),
        ],
    ),
    // BNB Chain
    (
        56,
        &[
            t20(
                "0x55d398326f99059fF775485246999027B3197955",
                "USDT",
                18,
                "Tether USD",
            ),
            t20(
                "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
                "USDC",
                18,
                "USD Coin",
            ),
            t20(
                "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
                "BUSD",
                18,
                "Binance USD",
            ),
            t20(
                "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
                "WBNB",
                18,
                "Wrapped BNB",
            ),
            t20(
                "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
                "ETH",
                18,
                "Ethereum Token",
            ),
            t20(
                "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
                "CAKE",
                18,
                "PancakeSwap",
            ),
        ],
    ),
    // Avalanche
    (
        43114,
        &[
            t20(
                "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
                "USDC",
                6,
                "USD Coin",
            ),
            t20(
                "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
                "USDT",
                6,
                "Tether USD",
            ),
            t20(
                "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
                "WAVAX",
                18,
                "Wrapped AVAX",
            ),
        ],
    ),
    // Gnosis
    (
        100,
        &[
            t20(
                "0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0",
                "USDC",
                6,
                "USD Coin",
            ),
            t20(
                "0x4ECaBa5870353805a9F068101A40E0f32ed605C6",
                "USDT",
                6,
                "Tether USD",
            ),
            t20(
                "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
                "WXDAI",
                18,
                "Wrapped XDAI",
            ),
        ],
    ),
];

/// 在每条主流 EVM 链上都部署在**同一地址**的授权方（CREATE2 / 确定性部署）。
/// 对所有链探测都是安全的。
///
/// 注意 Permit2 在这里**故意出现两次**（一次作为具名常量，一次作为字面量），沿用迁移前
/// 的写法；`spenders_for_chain` 会按地址去重。
const CROSS_CHAIN_SPENDERS: &[StaticSpender] = &[
    sp(
        "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        "Uniswap Permit2",
        SpenderKind::Permit2,
    ),
    sp(
        "0x0000000000000068F116a894984e2DB1123eB395",
        "OpenSea (Seaport 1.6)",
        SpenderKind::Marketplace,
    ),
    sp(
        "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC",
        "OpenSea (Seaport 1.5)",
        SpenderKind::Marketplace,
    ),
    sp(
        "0x1E0049783F008A0085193E00003D00cd54003c71",
        "OpenSea Conduit",
        SpenderKind::Marketplace,
    ),
    sp(
        "0x111111125421cA6dc452d289314280a0f8842A65",
        "1inch Router v6",
        SpenderKind::Dex,
    ),
    sp(
        "0x1111111254EEB25477B68fb85Ed929f73A960582",
        "1inch Router v5",
        SpenderKind::Dex,
    ),
    sp(
        "0xDef1C0ded9bec7F1a1670819833240f027b25EfF",
        "0x Exchange Proxy",
        SpenderKind::Dex,
    ),
    sp(
        "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        "Uniswap Permit2",
        SpenderKind::Permit2,
    ),
];

/// 链特有的授权方（DEX 路由、市场、借贷），按 chainId 归属。
const PER_CHAIN_SPENDERS: &[(u64, &[StaticSpender])] = &[
    // Ethereum
    (
        1,
        &[
            sp(
                "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
                "Uniswap V2 Router",
                SpenderKind::Dex,
            ),
            sp(
                "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
                "Uniswap V3 SwapRouter02",
                SpenderKind::Dex,
            ),
            sp(
                "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af",
                "Uniswap Universal Router",
                SpenderKind::Dex,
            ),
            sp(
                "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
                "SushiSwap Router",
                SpenderKind::Dex,
            ),
            sp(
                "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110",
                "CoW Protocol (Vault Relayer)",
                SpenderKind::Dex,
            ),
            sp(
                "0x216B4B4Ba9F3e719726886d34a177484278Bfcae",
                "ParaSwap v5",
                SpenderKind::Dex,
            ),
            sp(
                "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
                "Aave V3 Pool",
                SpenderKind::Lending,
            ),
            sp(
                "0x000000000000Ad05Ccc4F10045630fb830B95127",
                "Blur Marketplace",
                SpenderKind::Marketplace,
            ),
            sp(
                "0x00000000000111AbE46ff893f3B2fdF1F759a8A8",
                "Blur Execution Delegate",
                SpenderKind::Marketplace,
            ),
        ],
    ),
    // Base
    (
        8453,
        &[
            sp(
                "0x2626664c2603336E57B271c5C0b26F421741e481",
                "Uniswap V3 SwapRouter02",
                SpenderKind::Dex,
            ),
            sp(
                "0x6fF5693b99212Da76ad316178A184AB56D299b43",
                "Uniswap Universal Router",
                SpenderKind::Dex,
            ),
            sp(
                "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110",
                "CoW Protocol (Vault Relayer)",
                SpenderKind::Dex,
            ),
        ],
    ),
    // Arbitrum
    (
        42161,
        &[
            sp(
                "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
                "Uniswap V3 SwapRouter02",
                SpenderKind::Dex,
            ),
            sp(
                "0x5E325eDA8064b456f4781070C0738d849c824258",
                "Uniswap Universal Router",
                SpenderKind::Dex,
            ),
            sp(
                "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
                "SushiSwap Router",
                SpenderKind::Dex,
            ),
            sp(
                "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
                "Aave V3 Pool",
                SpenderKind::Lending,
            ),
        ],
    ),
    // Optimism
    (
        10,
        &[
            sp(
                "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
                "Uniswap V3 SwapRouter02",
                SpenderKind::Dex,
            ),
            sp(
                "0xCb1355ff08Ab38bBCE60111F1bb2B784bE25D7e8",
                "Uniswap Universal Router",
                SpenderKind::Dex,
            ),
            sp(
                "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
                "Aave V3 Pool",
                SpenderKind::Lending,
            ),
        ],
    ),
    // Polygon
    (
        137,
        &[
            sp(
                "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
                "Uniswap V3 SwapRouter02",
                SpenderKind::Dex,
            ),
            sp(
                "0xec7BE89e9d109e7e3Fec59c222CF297125FEFda2",
                "Uniswap Universal Router",
                SpenderKind::Dex,
            ),
            sp(
                "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
                "Aave V3 Pool",
                SpenderKind::Lending,
            ),
            sp(
                "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
                "SushiSwap Router",
                SpenderKind::Dex,
            ),
        ],
    ),
    // BNB Chain
    (
        56,
        &[
            sp(
                "0x10ED43C718714eb63d5aA57B78B54704E256024E",
                "PancakeSwap V2 Router",
                SpenderKind::Dex,
            ),
            sp(
                "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4",
                "PancakeSwap Smart Router",
                SpenderKind::Dex,
            ),
            sp(
                "0x1A0A18AC4BECDDbd6389559687d1A73d8927E416",
                "PancakeSwap Universal Router",
                SpenderKind::Dex,
            ),
        ],
    ),
    // Avalanche
    (
        43114,
        &[sp(
            "0x60aE616a2155Ee3d9A68541Ba4544862310933d4",
            "Trader Joe Router",
            SpenderKind::Dex,
        )],
    ),
    // Gnosis
    (
        100,
        &[sp(
            "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110",
            "CoW Protocol (Vault Relayer)",
            SpenderKind::Dex,
        )],
    ),
];

/// 某条链上要探测的内置代币。未收录的链返回空表。
pub fn tokens_for_chain(chain_id: u64) -> Vec<TokenEntry> {
    BUILTIN_TOKENS
        .iter()
        .find(|(id, _)| *id == chain_id)
        .map(|(_, list)| list.iter().map(StaticToken::to_entry).collect())
        .unwrap_or_default()
}

/// 某条链上要探测的全部内置授权方：跨链集合 + 该链特有的，按地址去重。
///
/// 去重保留**首次**出现，与迁移前的 `dedupeBy` 一致（research.md D13）。
pub fn spenders_for_chain(chain_id: u64) -> Vec<SpenderEntry> {
    let per_chain = PER_CHAIN_SPENDERS
        .iter()
        .find(|(id, _)| *id == chain_id)
        .map(|(_, list)| *list)
        .unwrap_or(&[]);

    let merged = CROSS_CHAIN_SPENDERS
        .iter()
        .chain(per_chain.iter())
        .map(StaticSpender::to_entry);
    super::dedupe_by(merged, |s| s.address.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cross_chain_permit2_is_listed_twice_but_probed_once() {
        // 迁移前的注释写明这是有意的重复；去重发生在 spenders_for_chain。
        let listed = CROSS_CHAIN_SPENDERS
            .iter()
            .filter(|s| s.address.eq_ignore_ascii_case(PERMIT2_ADDRESS))
            .count();
        assert_eq!(listed, 2, "跨链表里 Permit2 应当仍是两条（沿用迁移前写法）");

        let probed = spenders_for_chain(1)
            .iter()
            .filter(|s| s.address.eq_ignore_ascii_case(PERMIT2_ADDRESS))
            .count();
        assert_eq!(probed, 1, "去重后只应探测一次");
    }

    #[test]
    fn an_uncurated_chain_has_no_builtin_tokens_but_still_has_cross_chain_spenders() {
        assert!(tokens_for_chain(999_999).is_empty());
        assert_eq!(spenders_for_chain(999_999).len(), 7); // 8 条列出，Permit2 去重后 7
    }
}
