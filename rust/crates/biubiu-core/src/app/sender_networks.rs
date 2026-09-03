//! 批量代币发送域的内置网络表。
//!
//! 逐条搬自迁移前的 `infra/networks.ts`，**取值未作任何改动**，由脚本生成而非手抄。
//!
//! 这张表进核心、而 revoke 的网络表留在宿主 —— 判据是同一条，结论相反（research.md D19）：
//! revoke 的表逐条派生自钱包的 `CHAINS`，属于尚未迁移的 wallet 域；这张表是**本域自己**
//! 维护的，带着 `max_batch_native` / `max_batch_erc20` / `multi_send_address` 这些只有批量
//! 发送才关心的字段，没有别的域读它。
//!
//! 而且这些字段**直接参与业务规则**：每批上限决定批次数，批次数决定总费用。留在宿主，
//! 「250 个收件人分几批、总共收多少费」就无从测起。

use super::sender::SenderNetwork;

/// Safe MultiSend 1.4.1 —— 全链同址。
pub const MULTI_SEND: &str = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";

/// 每批接收方上限的默认值。迁移前 9 条网络全部沿用默认值。
const DEFAULT_MAX_BATCH: u32 = 100;

struct StaticNetwork {
    slug: &'static str,
    name: &'static str,
    chain_id: u64,
    symbol: &'static str,
    rpcs: &'static [&'static str],
    explorer_tx_url: &'static str,
    is_testnet: bool,
    chainlink_native_usd_feed: Option<&'static str>,
}

impl StaticNetwork {
    fn to_network(&self) -> SenderNetwork {
        SenderNetwork {
            slug: self.slug.to_owned(),
            name: self.name.to_owned(),
            chain_id: self.chain_id,
            symbol: self.symbol.to_owned(),
            decimals: 18,
            rpcs: self.rpcs.iter().map(|r| (*r).to_owned()).collect(),
            explorer_tx_url: self.explorer_tx_url.to_owned(),
            multi_send_address: MULTI_SEND.to_owned(),
            max_batch_native: DEFAULT_MAX_BATCH,
            max_batch_erc20: DEFAULT_MAX_BATCH,
            chainlink_native_usd_feed: self.chainlink_native_usd_feed.map(|f| f.to_owned()),
            is_testnet: self.is_testnet,
            is_custom: false,
        }
    }
}

const BUILTIN: &[StaticNetwork] = &[
    StaticNetwork {
        slug: "eth-mainnet",
        name: "Ethereum",
        chain_id: 1,
        symbol: "ETH",
        rpcs: &[
            "https://eth.llamarpc.com",
            "https://ethereum-rpc.publicnode.com",
        ],
        explorer_tx_url: "https://etherscan.io/tx/",
        is_testnet: false,
        chainlink_native_usd_feed: Some("0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"),
    },
    StaticNetwork {
        slug: "arb-mainnet",
        name: "Arbitrum",
        chain_id: 42161,
        symbol: "ETH",
        rpcs: &[
            "https://arbitrum.llamarpc.com",
            "https://arbitrum-one-rpc.publicnode.com",
        ],
        explorer_tx_url: "https://arbiscan.io/tx/",
        is_testnet: false,
        chainlink_native_usd_feed: Some("0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612"),
    },
    StaticNetwork {
        slug: "base-mainnet",
        name: "Base",
        chain_id: 8453,
        symbol: "ETH",
        rpcs: &[
            "https://mainnet.base.org",
            "https://base-rpc.publicnode.com",
        ],
        explorer_tx_url: "https://basescan.org/tx/",
        is_testnet: false,
        chainlink_native_usd_feed: Some("0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70"),
    },
    StaticNetwork {
        slug: "opt-mainnet",
        name: "Optimism",
        chain_id: 10,
        symbol: "ETH",
        rpcs: &[
            "https://optimism.llamarpc.com",
            "https://optimism-rpc.publicnode.com",
        ],
        explorer_tx_url: "https://optimistic.etherscan.io/tx/",
        is_testnet: false,
        chainlink_native_usd_feed: Some("0x13e3Ee699D1909E989722E753853AE30b17e08c5"),
    },
    StaticNetwork {
        slug: "matic-mainnet",
        name: "Polygon",
        chain_id: 137,
        symbol: "POL",
        rpcs: &[
            "https://polygon.llamarpc.com",
            "https://polygon-bor-rpc.publicnode.com",
        ],
        explorer_tx_url: "https://polygonscan.com/tx/",
        is_testnet: false,
        chainlink_native_usd_feed: Some("0xAB594600376Ec9fD91F8e885dADF0CE036862dE0"),
    },
    StaticNetwork {
        slug: "bnb-mainnet",
        name: "BNB Chain",
        chain_id: 56,
        symbol: "BNB",
        rpcs: &[
            "https://bsc-dataseed.bnbchain.org",
            "https://bsc-rpc.publicnode.com",
        ],
        explorer_tx_url: "https://bscscan.com/tx/",
        is_testnet: false,
        chainlink_native_usd_feed: Some("0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE"),
    },
    StaticNetwork {
        slug: "avax-mainnet",
        name: "Avalanche",
        chain_id: 43114,
        symbol: "AVAX",
        rpcs: &[
            "https://api.avax.network/ext/bc/C/rpc",
            "https://avalanche-c-chain-rpc.publicnode.com",
        ],
        explorer_tx_url: "https://snowtrace.io/tx/",
        is_testnet: false,
        chainlink_native_usd_feed: Some("0x0A77230d17318075983913bC2145DB16C7366156"),
    },
    StaticNetwork {
        slug: "gnosis-mainnet",
        name: "Gnosis",
        chain_id: 100,
        symbol: "xDAI",
        rpcs: &[
            "https://rpc.gnosischain.com",
            "https://gnosis-rpc.publicnode.com",
        ],
        explorer_tx_url: "https://gnosisscan.io/tx/",
        is_testnet: false,
        chainlink_native_usd_feed: Some("0x678df3415fc31947dA4324eC63212874be5a82f8"),
    },
    StaticNetwork {
        slug: "polygon-amoy",
        name: "Polygon Amoy (Testnet)",
        chain_id: 80002,
        symbol: "POL",
        rpcs: &[
            "https://rpc-amoy.polygon.technology",
            "https://polygon-amoy-bor-rpc.publicnode.com",
        ],
        explorer_tx_url: "https://amoy.polygonscan.com/tx/",
        is_testnet: true,
        chainlink_native_usd_feed: None,
    },
];

/// 内置网络，注册顺序即显示顺序（与迁移前的 `Object.values(NETWORKS)` 一致）。
pub fn builtin_networks() -> Vec<SenderNetwork> {
    BUILTIN.iter().map(StaticNetwork::to_network).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_table_matches_the_pre_migration_registry() {
        let nets = builtin_networks();
        assert_eq!(nets.len(), 9, "迁移前是 9 条网络");
        assert_eq!(nets[0].slug, "eth-mainnet", "注册顺序即显示顺序");
        assert!(nets.iter().all(|n| n.decimals == 18), "EVM 原生精度恒为 18");
        assert!(
            nets.iter()
                .all(|n| n.max_batch_native == 100 && n.max_batch_erc20 == 100),
            "迁移前 9 条全部沿用默认每批上限 100"
        );
        assert_eq!(
            nets.iter().filter(|n| n.is_testnet).count(),
            1,
            "只有 polygon-amoy 是测试网"
        );
    }
}
