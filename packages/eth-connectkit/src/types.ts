// ============================================================================
// EIP-1193 Types
// ============================================================================

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export interface RequestArguments {
  readonly method: string;
  readonly params?: readonly unknown[] | object;
}

export interface ProviderRpcError extends Error {
  code: number;
  data?: unknown;
}

export interface ProviderConnectInfo {
  chainId: string;
}

export interface ProviderMessage {
  type: string;
  data: unknown;
}

export interface EIP1193EventMap {
  accountsChanged: (accounts: Address[]) => void;
  chainChanged: (chainId: string) => void;
  connect: (info: ProviderConnectInfo) => void;
  disconnect: (error: ProviderRpcError) => void;
  message: (message: ProviderMessage) => void;
}

export interface EIP1193Provider {
  request<T = unknown>(args: RequestArguments): Promise<T>;
  on<K extends keyof EIP1193EventMap>(event: K, listener: EIP1193EventMap[K]): void;
  removeListener<K extends keyof EIP1193EventMap>(event: K, listener: EIP1193EventMap[K]): void;
}

// ============================================================================
// EIP-6963 Types (Multi-wallet Discovery)
// ============================================================================

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}

export interface EIP6963AnnounceProviderEvent extends CustomEvent {
  type: 'eip6963:announceProvider';
  detail: EIP6963ProviderDetail;
}

// ============================================================================
// Chain Types
// ============================================================================

export interface Chain {
  id: number;
  name: string;
  network: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: {
    default: { http: string[] };
    public?: { http: string[] };
  };
  blockExplorers?: {
    default: { name: string; url: string };
  };
}

// ============================================================================
// Connector Types
// ============================================================================

export type ConnectorType = 'injected' | 'remote-inject' | 'coinbase';

export type ConnectorStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export interface ConnectorConfig {
  id: string;
  name: string;
  type: ConnectorType;
  icon?: string;
}

export interface ConnectorAccount {
  address: Address;
  accounts: Address[];
  chainId: number;
}

export interface ConnectorEvents {
  connect: (account: ConnectorAccount) => void;
  disconnect: () => void;
  accountsChanged: (accounts: Address[]) => void;
  chainChanged: (chainId: number) => void;
  error: (error: Error) => void;
  statusChange: (status: ConnectorStatus) => void;
}

// ============================================================================
// Store Types
// ============================================================================

export interface ConnectionState {
  status: ConnectorStatus;
  address: Address | null;
  accounts: Address[];
  chainId: number | null;
  connectorId: string | null;
  error: Error | null;
}

export interface ConnectKitState extends ConnectionState {
  connectors: ConnectorConfig[];
  discoveredWallets: EIP6963ProviderDetail[];
  isReconnecting: boolean;
}

export interface StoreEvents {
  stateChange: (state: ConnectKitState) => void;
  connected: (account: ConnectorAccount) => void;
  disconnected: () => void;
  error: (error: Error) => void;
}

// ============================================================================
// Storage Types
// ============================================================================

export interface StorageAdapter {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

export interface PersistedConnection {
  connectorId: string;
  sessionData?: RemoteInjectSession;
  lastConnected: number;
}

// ============================================================================
// Remote Inject Types
// ============================================================================

export interface RemoteInjectConfig {
  serverUrl?: string;
  timeout?: number;
}

export interface RemoteInjectSession {
  sessionId: string;
  url: string;
  expiresAt: number;
  /** QR code data URL - generated client-side, not from server */
  qrCode?: string;
}

export interface RemoteInjectMessage {
  type?: string;
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
  chainId?: string;
  accounts?: string[];
}

// ============================================================================
// Coinbase Types
// ============================================================================

export interface CoinbaseConfig {
  appName: string;
  appLogoUrl?: string;
}

// ============================================================================
// Transaction Types
// ============================================================================

export interface TransactionRequest {
  to: Address;
  value?: Hex;
  data?: Hex;
  gas?: Hex;
  gasPrice?: Hex;
  maxFeePerGas?: Hex;
  maxPriorityFeePerGas?: Hex;
  nonce?: Hex;
}

export interface TypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: Address;
  salt?: Hex;
}

export interface TypedDataField {
  name: string;
  type: string;
}

export type TypedDataTypes = Record<string, TypedDataField[]>;

export interface TypedData {
  domain: TypedDataDomain;
  types: TypedDataTypes;
  primaryType: string;
  message: Record<string, unknown>;
}
