export interface NetworkConfig {
    name: string;
    chainId: number;
    rpcs: string[];
    symbol: string;
    decimals: number;
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

/** Dependencies injected by adapter — browser vs server use different implementations */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TaskHubDeps {
    createTaskHub: (...args: any[]) => Promise<any>;
    computeMerkleRoot: (ids: string[]) => Promise<string>;
    generateJobId: (input: unknown) => Promise<string>;
}
