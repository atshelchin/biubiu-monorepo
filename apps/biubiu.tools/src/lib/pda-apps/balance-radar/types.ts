export interface NetworkConfig {
    name: string;
    chainId: number;
    rpcs: string[];
    symbol: string;
    decimals: number;
    hasMulticall3?: boolean;
}

export interface NetworkJob {
    network: string;
    addresses: string[];
}

export interface NetworkJobResult {
    network: string;
    results: { address: string; balance: string }[];
}

export interface BalanceResult {
    address: string;
    network: string;
    symbol: string;
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
    totalQueries: number;
}

export interface BalanceFailure {
    address: string;
    network: string;
    error: string;
}

export interface RunResult {
    results: BalanceResult[];
    failures: BalanceFailure[];
    duration: number;
}
