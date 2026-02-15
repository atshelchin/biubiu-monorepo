import type {
  ConnectKitState,
  StoreEvents,
  ConnectorAccount,
  StorageAdapter,
  PersistedConnection,
  EIP6963ProviderDetail,
  EIP1193Provider,
  Address,
  Hex,
  TransactionRequest,
  TypedData,
} from '../types.js';
import type { Connector } from '../connectors/Connector.js';
import { EventEmitter } from './EventEmitter.js';
import { LocalStorageAdapter } from '../storage/LocalStorageAdapter.js';
import { InjectedConnector } from '../connectors/InjectedConnector.js';
import { RemoteInjectConnector } from '../connectors/RemoteInjectConnector.js';

const STORAGE_KEY = 'connection';
const MAX_RECONNECT_AGE = 24 * 60 * 60 * 1000; // 24 hours

export interface StoreConfig {
  connectors: Connector[];
  storage?: StorageAdapter;
  autoReconnect?: boolean;
}

/**
 * Central state store for wallet connection.
 * Zustand-like subscribe pattern for UI binding.
 */
export class Store extends EventEmitter<StoreEvents> {
  private state: ConnectKitState;
  private connectors: Map<string, Connector>;
  private activeConnector: Connector | null = null;
  private storage: StorageAdapter;
  private autoReconnect: boolean;
  private stateListeners = new Set<(state: ConnectKitState) => void>();
  private reconnectPromise: Promise<void> | null = null;

  constructor(config: StoreConfig) {
    super();

    this.connectors = new Map(config.connectors.map((c) => [c.config.id, c]));
    this.storage = config.storage ?? new LocalStorageAdapter('eth-connectkit:');
    this.autoReconnect = config.autoReconnect ?? true;

    this.state = {
      status: 'disconnected',
      address: null,
      accounts: [],
      chainId: null,
      connectorId: null,
      error: null,
      connectors: config.connectors.map((c) => c.config),
      discoveredWallets: [],
      isReconnecting: false,
    };

    // Set up connector event forwarding
    for (const connector of config.connectors) {
      this.setupConnectorEvents(connector);
    }

    // Subscribe to EIP-6963 wallet discovery
    this.setupEIP6963Discovery();

    // Auto-reconnect if enabled
    if (this.autoReconnect) {
      this.tryAutoReconnect();
    }
  }

  /** Get current state (snapshot) */
  getState(): ConnectKitState {
    return { ...this.state };
  }

  /** Subscribe to state changes */
  subscribe(listener: (state: ConnectKitState) => void): () => void {
    this.stateListeners.add(listener);
    // Emit current state immediately
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  /** Connect with a specific connector */
  async connect(connectorId: string, options?: { chainId?: number; target?: string; silent?: boolean }): Promise<ConnectorAccount> {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }

    this.setState({ status: 'connecting', error: null });

    try {
      const account = await connector.connect(options);

      this.activeConnector = connector;
      this.setState({
        status: 'connected',
        address: account.address,
        accounts: account.accounts,
        chainId: account.chainId,
        connectorId,
        error: null,
      });

      // Persist connection
      this.persistConnection(connectorId);

      this.emit('connected', account);
      return account;
    } catch (error) {
      this.setState({
        status: 'disconnected',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /** Disconnect current wallet */
  async disconnect(): Promise<void> {
    if (this.activeConnector) {
      await this.activeConnector.disconnect();
      this.activeConnector = null;
    }

    this.setState({
      status: 'disconnected',
      address: null,
      accounts: [],
      chainId: null,
      connectorId: null,
      error: null,
    });

    this.clearPersistedConnection();
    this.emit('disconnected');
  }

  /** Switch to a different chain */
  async switchChain(chainId: number): Promise<void> {
    if (!this.activeConnector) {
      throw new Error('Not connected');
    }

    await this.activeConnector.switchChain({ chainId });
    this.setState({ chainId });
  }

  /** Switch to a different account (from available accounts) */
  switchAccount(account: Address): void {
    if (!this.state.accounts.includes(account)) {
      throw new Error('Account not available');
    }
    this.setState({ address: account });
  }

  /** Sign a message with the connected wallet */
  async signMessage(message: string, account?: Address): Promise<Hex> {
    if (!this.activeConnector) {
      throw new Error('Not connected');
    }

    if (!this.activeConnector.signMessage) {
      throw new Error('Connector does not support signing');
    }

    return this.activeConnector.signMessage(message, account ?? this.state.address ?? undefined);
  }

  /** Sign typed data (EIP-712) */
  async signTypedData(data: TypedData, account?: Address): Promise<Hex> {
    if (!this.activeConnector) {
      throw new Error('Not connected');
    }

    if (!this.activeConnector.signTypedData) {
      throw new Error('Connector does not support typed data signing');
    }

    return this.activeConnector.signTypedData(data, account ?? this.state.address ?? undefined);
  }

  /** Send a transaction */
  async sendTransaction(tx: TransactionRequest, account?: Address): Promise<Hex> {
    if (!this.activeConnector) {
      throw new Error('Not connected');
    }

    if (!this.activeConnector.sendTransaction) {
      throw new Error('Connector does not support sending transactions');
    }

    return this.activeConnector.sendTransaction(tx, account ?? this.state.address ?? undefined);
  }

  /** Get the active EIP-1193 provider */
  getProvider(): EIP1193Provider | null {
    return this.activeConnector?.getProvider() ?? null;
  }

  /** Get a specific connector by ID */
  getConnector(connectorId: string): Connector | undefined {
    return this.connectors.get(connectorId);
  }

  /** Get discovered EIP-6963 wallets */
  getDiscoveredWallets(): EIP6963ProviderDetail[] {
    // Find injected connector and get its discovered wallets
    for (const connector of this.connectors.values()) {
      if (connector instanceof InjectedConnector) {
        return connector.getDiscoveredWallets();
      }
    }
    return [];
  }

  /** Subscribe to EIP-6963 wallet discovery */
  onWalletsDiscovered(callback: (wallets: EIP6963ProviderDetail[]) => void): () => void {
    for (const connector of this.connectors.values()) {
      if (connector instanceof InjectedConnector) {
        return connector.onWalletsDiscovered(callback);
      }
    }
    return () => {};
  }

  /** Cleanup all resources */
  destroy(): void {
    for (const connector of this.connectors.values()) {
      connector.destroy();
    }
    this.stateListeners.clear();
    this.removeAllListeners();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private setState(partial: Partial<ConnectKitState>): void {
    this.state = { ...this.state, ...partial };
    const snapshot = this.getState();

    for (const listener of this.stateListeners) {
      try {
        listener(snapshot);
      } catch {
        // Ignore listener errors
      }
    }

    this.emit('stateChange', snapshot);
  }

  private setupEIP6963Discovery(): void {
    // Find injected connector and subscribe to wallet discovery
    for (const connector of this.connectors.values()) {
      if (connector instanceof InjectedConnector) {
        connector.onWalletsDiscovered((wallets) => {
          this.setState({ discoveredWallets: wallets });
        });
        break;
      }
    }
  }

  private setupConnectorEvents(connector: Connector): void {
    connector.on('accountsChanged', (accounts) => {
      if (connector === this.activeConnector) {
        this.setState({
          address: accounts[0] ?? null,
          accounts,
        });
      }
    });

    connector.on('chainChanged', (chainId) => {
      if (connector === this.activeConnector) {
        this.setState({ chainId });
      }
    });

    connector.on('disconnect', () => {
      if (connector === this.activeConnector) {
        this.setState({
          status: 'disconnected',
          address: null,
          accounts: [],
          chainId: null,
          connectorId: null,
        });
        this.activeConnector = null;
        this.clearPersistedConnection();
        this.emit('disconnected');
      }
    });

    connector.on('error', (error) => {
      this.setState({ error });
      this.emit('error', error);
    });
  }

  private persistConnection(connectorId: string): void {
    const connector = this.connectors.get(connectorId);
    const data: PersistedConnection = {
      connectorId,
      lastConnected: Date.now(),
    };

    // Save RemoteInject session data for restoration
    if (connector instanceof RemoteInjectConnector) {
      const session = connector.getSession();
      if (session) {
        data.sessionData = session;
      }
    }

    this.storage.set(STORAGE_KEY, data);
  }

  private clearPersistedConnection(): void {
    this.storage.remove(STORAGE_KEY);
  }

  private async tryAutoReconnect(): Promise<void> {
    // Thread-safe: prevent concurrent reconnect attempts
    if (this.reconnectPromise) return this.reconnectPromise;

    this.reconnectPromise = (async () => {
      const persisted = this.storage.get<PersistedConnection>(STORAGE_KEY);
      if (!persisted) return;

      const connector = this.connectors.get(persisted.connectorId);
      if (!connector) {
        this.clearPersistedConnection();
        return;
      }

      // Check if connection is recent
      if (Date.now() - persisted.lastConnected > MAX_RECONNECT_AGE) {
        this.clearPersistedConnection();
        return;
      }

      // For RemoteInject, check if session is expired
      if (connector instanceof RemoteInjectConnector && persisted.sessionData) {
        if (Date.now() > persisted.sessionData.expiresAt) {
          this.clearPersistedConnection();
          return;
        }
      }

      this.setState({ isReconnecting: true, status: 'reconnecting' });

      try {
        // Use silent reconnect for InjectedConnector (no popup)
        if (connector instanceof InjectedConnector) {
          await this.connect(persisted.connectorId, { silent: true });
        }
        // For RemoteInject, try to restore the session
        else if (connector instanceof RemoteInjectConnector && persisted.sessionData) {
          const account = await connector.restoreSession(persisted.sessionData);
          this.activeConnector = connector;
          this.setState({
            status: 'connected',
            address: account.address,
            accounts: account.accounts,
            chainId: account.chainId,
            connectorId: persisted.connectorId,
            error: null,
          });
          this.emit('connected', account);
        }
        // Other connectors - normal reconnect
        else {
          await this.connect(persisted.connectorId);
        }
      } catch {
        // Reconnect failed - clear persisted data
        this.clearPersistedConnection();
        this.setState({ status: 'disconnected' });
      } finally {
        this.setState({ isReconnecting: false });
      }
    })();

    return this.reconnectPromise;
  }
}
