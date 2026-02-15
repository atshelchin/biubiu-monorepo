/**
 * @shelchin/eth-connectkit
 *
 * UI-agnostic Ethereum wallet connection library.
 * Supports injected wallets (EIP-6963), remote wallets, and Coinbase Smart Wallet.
 *
 * @example
 * ```typescript
 * import { createStore, InjectedConnector, CoinbaseConnector } from '@shelchin/eth-connectkit';
 * import { mainnet, polygon } from '@shelchin/eth-connectkit/chains';
 *
 * const store = createStore({
 *   connectors: [
 *     new InjectedConnector({ chains: [mainnet, polygon] }),
 *     new CoinbaseConnector({ appName: 'My App', chains: [mainnet] }),
 *   ],
 * });
 *
 * // Subscribe to state changes
 * store.subscribe((state) => {
 *   console.log('Address:', state.address);
 *   console.log('Chain:', state.chainId);
 * });
 *
 * // Connect
 * await store.connect('injected');
 * ```
 */

// Types
export type {
  Address,
  Hex,
  RequestArguments,
  ProviderRpcError as ProviderRpcErrorType,
  ProviderConnectInfo,
  ProviderMessage,
  EIP1193EventMap,
  EIP1193Provider,
  EIP6963ProviderInfo,
  EIP6963ProviderDetail,
  Chain,
  ConnectorType,
  ConnectorStatus,
  ConnectorConfig,
  ConnectorAccount,
  ConnectorEvents,
  ConnectionState,
  ConnectKitState,
  StoreEvents,
  StorageAdapter,
  PersistedConnection,
  RemoteInjectConfig,
  RemoteInjectSession,
  CoinbaseConfig,
} from './types.js';

// Store
export { Store, type StoreConfig } from './core/Store.js';
export { EventEmitter } from './core/EventEmitter.js';

// Connectors
export { Connector, type ConnectOptions, type SwitchChainOptions } from './connectors/Connector.js';
export {
  InjectedConnector,
  type InjectedConnectorOptions,
  type InjectedConnectOptions,
} from './connectors/InjectedConnector.js';
export { RemoteInjectConnector } from './connectors/RemoteInjectConnector.js';
export { CoinbaseConnector } from './connectors/CoinbaseConnector.js';

// Storage
export { LocalStorageAdapter } from './storage/LocalStorageAdapter.js';
export { MemoryStorageAdapter } from './storage/MemoryStorageAdapter.js';

// Utilities
export { createEIP6963Store, type EIP6963Store } from './utils/eip6963.js';

// Errors
export {
  ConnectKitError,
  ConnectorError,
  UserRejectedError,
  ChainNotConfiguredError,
  ConnectionTimeoutError,
  ProviderRpcError,
} from './errors.js';

// ============================================================================
// Convenience Factory
// ============================================================================

import { Store, type StoreConfig } from './core/Store.js';

/**
 * Create a ConnectKit store instance
 */
export function createStore(config: StoreConfig): Store {
  return new Store(config);
}
