import { Connector, type ConnectOptions, type SwitchChainOptions } from './Connector.js';
import type {
  EIP1193Provider,
  ConnectorConfig,
  ConnectorAccount,
  Address,
  Chain,
  Hex,
  RemoteInjectConfig,
  RemoteInjectSession,
  RemoteInjectMessage,
  RequestArguments,
  EIP1193EventMap,
  TransactionRequest,
  TypedData,
} from '../types.js';
import { ConnectorError, ConnectionTimeoutError } from '../errors.js';
import { EventEmitter } from '../core/EventEmitter.js';

const DEFAULT_SERVER = 'https://remote-inject.awesometools.dev';
const DEFAULT_TIMEOUT = 120_000; // 2 minutes

/**
 * RemoteInjectConnector connects to wallets on remote devices via WebSocket.
 * Uses the Remote Inject relay protocol for cross-device wallet signing.
 */
export class RemoteInjectConnector extends Connector {
  readonly config: ConnectorConfig = {
    id: 'remote-inject',
    name: 'Remote Wallet',
    type: 'remote-inject',
  };

  private options: Required<RemoteInjectConfig>;
  private session: RemoteInjectSession | null = null;
  private ws: WebSocket | null = null;
  private remoteProvider: RemoteProvider | null = null;
  private pendingRequests = new Map<
    number,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private requestId = 0;
  private chains: Map<number, Chain>;
  private currentChainId: number | null = null;
  private currentAccounts: Address[] = [];
  private connectResolver: ((account: ConnectorAccount) => void) | null = null;
  private connectRejecter: ((error: Error) => void) | null = null;

  constructor(options: RemoteInjectConfig & { chains?: Chain[] } = {}) {
    super();
    this.options = {
      serverUrl: options.serverUrl ?? DEFAULT_SERVER,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
    };
    this.chains = new Map(options.chains?.map((c) => [c.id, c]));
  }

  /** Get current session (for QR code display) */
  getSession(): RemoteInjectSession | null {
    return this.session;
  }

  getProvider(): EIP1193Provider | null {
    return this.remoteProvider;
  }

  isConnected(): boolean {
    return this._status === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(options?: ConnectOptions): Promise<ConnectorAccount> {
    try {
      this.setStatus('connecting');

      // Create session on server
      this.session = await this.createSession();

      // Connect WebSocket
      await this.connectWebSocket();

      // Create remote provider proxy
      this.remoteProvider = this.createRemoteProvider();

      // Wait for wallet to connect (user scans QR)
      const account = await this.waitForConnection();

      // Switch chain if requested
      if (options?.chainId && options.chainId !== account.chainId) {
        try {
          await this.switchChain({ chainId: options.chainId });
          account.chainId = options.chainId;
        } catch {
          // Continue with current chain
        }
      }

      this.setStatus('connected');
      this.emit('connect', account);
      return account;
    } catch (error) {
      this.cleanup();
      this.setStatus('disconnected');
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.cleanup();
    this.setStatus('disconnected');
    this.emit('disconnect');
  }

  async getAccounts(): Promise<Address[]> {
    return this.currentAccounts;
  }

  async getChainId(): Promise<number> {
    if (!this.currentChainId) throw new ConnectorError('Not connected', 'remote-inject');
    return this.currentChainId;
  }

  async switchChain({ chainId }: SwitchChainOptions): Promise<Chain> {
    if (!this.remoteProvider) throw new ConnectorError('Not connected', 'remote-inject');

    const chain = this.chains.get(chainId);
    if (!chain) throw new Error(`Chain ${chainId} not configured`);

    // Already on the target chain
    if (this.currentChainId === chainId) {
      return chain;
    }

    const chainIdHex = `0x${chainId.toString(16)}`;

    // Create a promise that resolves when chainChanged event fires
    const chainChangedPromise = new Promise<void>((resolve) => {
      const handler = (newChainId: number) => {
        if (newChainId === chainId) {
          this.off('chainChanged', handler);
          resolve();
        }
      };
      this.on('chainChanged', handler);

      // Timeout after 2 seconds - chain didn't switch, need to add it
      setTimeout(() => {
        this.off('chainChanged', handler);
        resolve();
      }, 2000);
    });

    try {
      await this.remoteProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });

      // Wait for chainChanged event or timeout
      await chainChangedPromise;

      // If chain still didn't switch, proactively send addChain with full info
      if (this.currentChainId !== chainId) {
        await this.addChain(chain);
      }
    } catch (error: unknown) {
      // Chain not added to wallet - try to add it with full chain info
      if ((error as { code?: number })?.code === 4902) {
        await this.addChain(chain);
      } else {
        throw error;
      }
    }

    this.currentChainId = chainId;
    return chain;
  }

  async addChain(chain: Chain): Promise<void> {
    if (!this.remoteProvider) throw new ConnectorError('Not connected', 'remote-inject');

    await this.remoteProvider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: `0x${chain.id.toString(16)}`,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls.default.http,
          blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
        },
      ],
    });

    this.chains.set(chain.id, chain);
  }

  async signMessage(message: string, account?: Address): Promise<Hex> {
    if (!this.remoteProvider) throw new ConnectorError('Not connected', 'remote-inject');

    const from = account ?? this.currentAccounts[0];
    if (!from) throw new ConnectorError('No account available', 'remote-inject');

    return this.remoteProvider.request<Hex>({
      method: 'personal_sign',
      params: [message, from],
    });
  }

  async signTypedData(data: TypedData, account?: Address): Promise<Hex> {
    if (!this.remoteProvider) throw new ConnectorError('Not connected', 'remote-inject');

    const from = account ?? this.currentAccounts[0];
    if (!from) throw new ConnectorError('No account available', 'remote-inject');

    return this.remoteProvider.request<Hex>({
      method: 'eth_signTypedData_v4',
      params: [from, JSON.stringify(data)],
    });
  }

  async sendTransaction(tx: TransactionRequest, account?: Address): Promise<Hex> {
    if (!this.remoteProvider) throw new ConnectorError('Not connected', 'remote-inject');

    const from = account ?? this.currentAccounts[0];
    if (!from) throw new ConnectorError('No account available', 'remote-inject');

    return this.remoteProvider.request<Hex>({
      method: 'eth_sendTransaction',
      params: [{ ...tx, from }],
    });
  }

  destroy(): void {
    this.cleanup();
    this.removeAllListeners();
  }

  /** Restore session from persisted data */
  async restoreSession(sessionData: RemoteInjectSession): Promise<ConnectorAccount> {
    // Check if session is still valid
    if (Date.now() > sessionData.expiresAt) {
      throw new ConnectorError('Session expired', 'remote-inject');
    }

    try {
      this.setStatus('connecting');
      this.session = sessionData;

      // Try to reconnect to existing WebSocket session
      await this.connectWebSocket();

      // Create remote provider proxy
      this.remoteProvider = this.createRemoteProvider();

      // Wait for wallet to reconnect (if still connected on mobile)
      const account = await this.waitForConnection();

      this.setStatus('connected');
      this.emit('connect', account);
      return account;
    } catch (error) {
      this.cleanup();
      this.setStatus('disconnected');
      throw error;
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async createSession(): Promise<RemoteInjectSession> {
    // Server accepts POST with optional JSON body for DApp metadata
    const response = await fetch(`${this.options.serverUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const text = await response.text();

    if (!response.ok) {
      throw new ConnectorError(`Failed to create session: ${response.status} ${response.statusText} - ${text}`, 'remote-inject');
    }

    // Server returns: { id, url, expiresAt }
    // QR code must be generated client-side from the URL
    let data: { id?: string; url?: string; expiresAt?: number };
    try {
      data = JSON.parse(text);
    } catch {
      throw new ConnectorError(`Invalid JSON response from server: ${text.slice(0, 200)}`, 'remote-inject');
    }

    if (!data.id || !data.url) {
      throw new ConnectorError(`Invalid session response: ${JSON.stringify(data)}`, 'remote-inject');
    }

    return {
      sessionId: data.id,
      url: data.url,
      expiresAt: data.expiresAt ?? Date.now() + this.options.timeout,
    };
  }

  private connectWebSocket(): Promise<void> {
    const wsUrl = this.options.serverUrl.replace('https://', 'wss://').replace('http://', 'ws://');

    const url = `${wsUrl}/ws?session=${this.session!.sessionId}&role=dapp`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new ConnectorError('WebSocket error', 'remote-inject'));
      this.ws.onclose = () => this.handleDisconnect();
      this.ws.onmessage = (event) => this.handleMessage(JSON.parse(event.data));
    });
  }

  private createRemoteProvider(): RemoteProvider {
    return new RemoteProvider((method, params) => this.sendRequest(method, params), {
      onAccountsChanged: (accounts) => {
        this.currentAccounts = accounts;
        this.emit('accountsChanged', accounts);
      },
      onChainChanged: (chainId) => {
        this.currentChainId = chainId;
        this.emit('chainChanged', chainId);
      },
      onDisconnect: () => this.disconnect(),
    });
  }

  private waitForConnection(): Promise<ConnectorAccount> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.connectResolver = null;
        this.connectRejecter = null;
        reject(new ConnectionTimeoutError('remote-inject', this.options.timeout));
      }, this.options.timeout);

      this.connectResolver = (account) => {
        clearTimeout(timeoutId);
        this.connectResolver = null;
        this.connectRejecter = null;
        resolve(account);
      };

      this.connectRejecter = (error) => {
        clearTimeout(timeoutId);
        this.connectResolver = null;
        this.connectRejecter = null;
        reject(error);
      };
    });
  }

  private sendRequest(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new ConnectorError('WebSocket not connected', 'remote-inject'));
        return;
      }

      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });

      // Remote Inject protocol requires type: 'request'
      const message = {
        type: 'request',
        id,
        method,
        params: params ?? [],
      };

      this.ws.send(JSON.stringify(message));
    });
  }

  private handleMessage(message: RemoteInjectMessage): void {
    // Handle RPC response
    if (message.type === 'response' && message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          // -32000: Peer not connected - mobile wallet disconnected
          if (message.error.code === -32000) {
            this.disconnect();
          }
          // Preserve error code for proper error handling (e.g., 4902 for chain not added)
          const error = new Error(message.error.message) as Error & { code: number };
          error.code = message.error.code;
          pending.reject(error);
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }

    // Handle ready event (WebSocket connected to relay)
    if (message.type === 'ready') {
      return;
    }

    // Handle connect event (mobile wallet connected)
    // Format: { type: 'connect', address: '0x...', chainId: number }
    if (message.type === 'connect') {
      const address = (message as unknown as { address: Address }).address;
      const chainId = (message as unknown as { chainId: number }).chainId;

      if (address && chainId !== undefined) {
        this.currentAccounts = [address];
        this.currentChainId = chainId;

        if (this.connectResolver) {
          this.connectResolver({
            address,
            accounts: this.currentAccounts,
            chainId,
          });
        }
      }
      return;
    }

    if (message.type === 'accountsChanged' && message.accounts) {
      this.currentAccounts = message.accounts as Address[];
      this.emit('accountsChanged', this.currentAccounts);
      if (this.currentAccounts.length === 0) {
        this.disconnect();
      }
      return;
    }

    if (message.type === 'chainChanged' && message.chainId) {
      // chainId comes as number, not hex string
      const chainId = typeof message.chainId === 'string'
        ? parseInt(message.chainId, 16)
        : message.chainId as number;
      this.currentChainId = chainId;
      this.emit('chainChanged', chainId);
      return;
    }

    if (message.type === 'disconnect') {
      this.disconnect();
      return;
    }

    // Handle error messages from server (e.g., peer disconnected)
    if (message.type === 'error') {
      const errorMsg = message as unknown as { code: number; message: string };
      // -32000: Peer not connected - mobile wallet disconnected
      if (errorMsg.code === -32000) {
        this.disconnect();
      }
      return;
    }
  }

  private handleDisconnect(): void {
    if (this._status === 'connected') {
      this.cleanup();
      this.setStatus('disconnected');
      this.emit('disconnect');
    } else if (this._status === 'connecting' && this.connectRejecter) {
      this.connectRejecter(new ConnectorError('Connection closed', 'remote-inject'));
    }
  }

  private cleanup(): void {
    // Reject all pending requests
    for (const [, { reject }] of this.pendingRequests) {
      reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    // Close WebSocket
    if (this.ws) {
      this.ws.onclose = null; // Prevent recursive disconnect
      this.ws.close();
      this.ws = null;
    }

    this.session = null;
    this.remoteProvider = null;
    this.currentAccounts = [];
    this.currentChainId = null;
    this.connectResolver = null;
    this.connectRejecter = null;
  }
}

/**
 * Remote EIP-1193 Provider Proxy
 */
class RemoteProvider implements EIP1193Provider {
  private events = new EventEmitter<EIP1193EventMap>();

  constructor(
    private sendRequest: (method: string, params?: unknown) => Promise<unknown>,
    private callbacks: {
      onAccountsChanged: (accounts: Address[]) => void;
      onChainChanged: (chainId: number) => void;
      onDisconnect: () => void;
    }
  ) {}

  async request<T = unknown>(args: RequestArguments): Promise<T> {
    return this.sendRequest(args.method, args.params) as Promise<T>;
  }

  on<K extends keyof EIP1193EventMap>(event: K, listener: EIP1193EventMap[K]): void {
    this.events.on(event, listener);
  }

  removeListener<K extends keyof EIP1193EventMap>(event: K, listener: EIP1193EventMap[K]): void {
    this.events.off(event, listener);
  }
}
