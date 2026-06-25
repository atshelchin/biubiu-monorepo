export interface NetworkConfig {
    name: string;
    chainId: number;
    rpcs: string[];
    symbol: string;
    decimals: number;
    hasMulticall3?: boolean;
    /** True for user-defined networks (persisted in IndexedDB), false/undefined for built-ins. */
    isCustom?: boolean;
}

/**
 * A single token to query on a network: the native coin or an ERC20 contract.
 * Self-contained (carries symbol + decimals) so it serializes through PDA input
 * and TaskHub jobs without a registry lookup on the other side.
 */
export interface TokenSpec {
    kind: 'native' | 'erc20';
    /** ERC20 contract address; omitted for native. */
    address?: string;
    symbol: string;
    decimals: number;
}

/** Per-network token selection passed from UI/CLI into the executor. */
export interface NetworkTokenSelection {
    network: string;
    tokens: TokenSpec[];
}

export interface NetworkJob {
    network: string;
    token: TokenSpec;
    addresses: string[];
}

export interface NetworkJobResult {
    network: string;
    token: TokenSpec;
    /** `balance` is `null` for a per-address sub-call that FAILED (vs a real '0'). */
    results: { address: string; balance: string | null }[];
}

export interface BalanceResult {
    address: string;
    network: string;
    symbol: string;
    /** ERC20 contract address; undefined for the native coin. */
    tokenAddress?: string;
    balance: string;
    balanceRaw: string;
}

export interface BalanceQuery {
    address: string;
    network: string;
}

export interface ValidatedInput {
    addresses: string[];
    networks: string[];
    /** Resolved token list per network (defaults to the native coin when unspecified). */
    tokensByNetwork: Record<string, TokenSpec[]>;
    /** Merged network registry (built-ins + custom) for this run. */
    networkConfigs: Record<string, NetworkConfig>;
    customNetworks: NetworkConfig[];
    totalQueries: number;
}

export interface BalanceFailure {
    address: string;
    network: string;
    symbol?: string;
    tokenAddress?: string;
    error: string;
}

export interface RunResult {
    results: BalanceResult[];
    failures: BalanceFailure[];
    duration: number;
}
