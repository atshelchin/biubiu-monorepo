import { Connector, type ConnectOptions, type SwitchChainOptions } from './Connector.js';
import type {
  EIP1193Provider,
  ConnectorConfig,
  ConnectorAccount,
  Address,
  Chain,
  Hex,
  EIP6963ProviderDetail,
  TransactionRequest,
  TypedData,
} from '../types.js';
import { createEIP6963Store, type EIP6963Store } from '../utils/eip6963.js';
import { ConnectorError, UserRejectedError, ChainNotConfiguredError } from '../errors.js';

export interface InjectedConnectorOptions {
  /** Target a specific wallet by RDNS (e.g., 'io.metamask') */
  target?: string;
  /** Chains supported by this connector */
  chains?: Chain[];
  /** Whether to auto-discover EIP-6963 wallets */
  enableEIP6963?: boolean;
}

export interface InjectedConnectOptions extends ConnectOptions {
  /** Connect to a specific wallet by RDNS (overrides constructor target) */
  target?: string;
  /** Try silent reconnect first (no user approval popup) */
  silent?: boolean;
}

export class InjectedConnector extends Connector {
  readonly config: ConnectorConfig = {
    id: 'injected',
    name: 'Browser Wallet',
    type: 'injected',
  };

  private provider: EIP1193Provider | null = null;
  private eip6963Store: EIP6963Store | null = null;
  private options: InjectedConnectorOptions;
  private chains: Map<number, Chain>;
  private boundHandlers: {
    accountsChanged: (accounts: string[]) => void;
    chainChanged: (chainId: string) => void;
    disconnect: () => void;
  } | null = null;

  constructor(options: InjectedConnectorOptions = {}) {
    super();
    this.options = {
      enableEIP6963: true,
      ...options,
    };
    this.chains = new Map(options.chains?.map((c) => [c.id, c]));

    // Initialize EIP-6963 discovery
    if (this.options.enableEIP6963 && typeof window !== 'undefined') {
      this.eip6963Store = createEIP6963Store();
    }
  }

  /** Get discovered EIP-6963 wallets */
  getDiscoveredWallets(): EIP6963ProviderDetail[] {
    return this.eip6963Store?.getProviders() ?? [];
  }

  /** Subscribe to EIP-6963 wallet discovery */
  onWalletsDiscovered(callback: (wallets: EIP6963ProviderDetail[]) => void): () => void {
    if (!this.eip6963Store) return () => {};
    return this.eip6963Store.subscribe(callback);
  }

  getProvider(): EIP1193Provider | null {
    return this.provider;
  }

  isConnected(): boolean {
    return this._status === 'connected' && this.provider !== null;
  }

  async connect(options?: InjectedConnectOptions): Promise<ConnectorAccount> {
    try {
      this.setStatus('connecting');

      // Find the target provider
      const provider = await this.findProvider(options?.target);
      if (!provider) {
        throw new ConnectorError('No wallet provider found', 'injected');
      }

      this.provider = provider;

      let accounts: Address[];

      // If silent mode, try eth_accounts first (no popup)
      if (options?.silent) {
        accounts = await provider.request<Address[]>({
          method: 'eth_accounts',
        });

        // If no accounts authorized, silent reconnect failed
        if (!accounts.length) {
          throw new ConnectorError('Silent reconnect failed - no authorized accounts', 'injected');
        }
      } else {
        // Request accounts (will show popup)
        accounts = await provider.request<Address[]>({
          method: 'eth_requestAccounts',
        });

        if (!accounts.length) {
          throw new UserRejectedError('injected');
        }
      }

      // Get chain ID
      let chainId = await this.getChainId();

      // Switch chain if requested
      if (options?.chainId && options.chainId !== chainId) {
        try {
          await this.switchChain({ chainId: options.chainId });
          chainId = options.chainId;
        } catch {
          // Continue with current chain if switch fails
        }
      }

      // Set up event listeners
      this.setupListeners();

      this.setStatus('connected');

      const account: ConnectorAccount = {
        address: accounts[0],
        accounts,
        chainId,
      };

      this.emit('connect', account);
      return account;
    } catch (error) {
      this.setStatus('disconnected');
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.removeListeners();
    this.provider = null;
    this.setStatus('disconnected');
    this.emit('disconnect');
  }

  async getAccounts(): Promise<Address[]> {
    if (!this.provider) return [];
    return this.provider.request<Address[]>({ method: 'eth_accounts' });
  }

  async getChainId(): Promise<number> {
    if (!this.provider) throw new ConnectorError('Not connected', 'injected');
    const chainId = await this.provider.request<string>({ method: 'eth_chainId' });
    return parseInt(chainId, 16);
  }

  async switchChain({ chainId }: SwitchChainOptions): Promise<Chain> {
    if (!this.provider) throw new ConnectorError('Not connected', 'injected');

    const chain = this.chains.get(chainId);
    if (!chain) throw new ChainNotConfiguredError(chainId);

    const chainIdHex = `0x${chainId.toString(16)}`;

    try {
      await this.provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });
    } catch (error: unknown) {
      // Chain not added to wallet - try to add it
      if ((error as { code?: number })?.code === 4902) {
        await this.addChain(chain);
      } else {
        throw error;
      }
    }

    return chain;
  }

  async addChain(chain: Chain): Promise<void> {
    if (!this.provider) throw new ConnectorError('Not connected', 'injected');

    await this.provider.request({
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
    if (!this.provider) throw new ConnectorError('Not connected', 'injected');

    const accounts = await this.getAccounts();
    const from = account ?? accounts[0];
    if (!from) throw new ConnectorError('No account available', 'injected');

    return this.provider.request<Hex>({
      method: 'personal_sign',
      params: [message, from],
    });
  }

  async signTypedData(data: TypedData, account?: Address): Promise<Hex> {
    if (!this.provider) throw new ConnectorError('Not connected', 'injected');

    const accounts = await this.getAccounts();
    const from = account ?? accounts[0];
    if (!from) throw new ConnectorError('No account available', 'injected');

    return this.provider.request<Hex>({
      method: 'eth_signTypedData_v4',
      params: [from, JSON.stringify(data)],
    });
  }

  async sendTransaction(tx: TransactionRequest, account?: Address): Promise<Hex> {
    if (!this.provider) throw new ConnectorError('Not connected', 'injected');

    const accounts = await this.getAccounts();
    const from = account ?? accounts[0];
    if (!from) throw new ConnectorError('No account available', 'injected');

    return this.provider.request<Hex>({
      method: 'eth_sendTransaction',
      params: [{ ...tx, from }],
    });
  }

  destroy(): void {
    this.removeListeners();
    this.eip6963Store?.destroy();
    this.provider = null;
    this.removeAllListeners();
  }

  /** Find the target provider (EIP-6963 or legacy window.ethereum) */
  private async findProvider(target?: string): Promise<EIP1193Provider | null> {
    const targetRdns = target ?? this.options.target;

    // Try EIP-6963 first
    if (this.options.enableEIP6963 && this.eip6963Store) {
      const wallets = this.eip6963Store.getProviders();

      // If target specified, find that specific wallet
      if (targetRdns) {
        const wallet = wallets.find((w) => w.info.rdns === targetRdns);
        if (wallet) return wallet.provider;
      }

      // Return first discovered wallet
      if (wallets.length > 0) {
        return wallets[0].provider;
      }
    }

    // Fallback to window.ethereum
    if (typeof window !== 'undefined' && (window as unknown as { ethereum?: EIP1193Provider }).ethereum) {
      return (window as unknown as { ethereum: EIP1193Provider }).ethereum;
    }

    return null;
  }

  private setupListeners(): void {
    if (!this.provider) return;

    this.boundHandlers = {
      accountsChanged: (accounts: string[]) => {
        this.emit('accountsChanged', accounts as Address[]);
        if (accounts.length === 0) {
          this.disconnect();
        }
      },
      chainChanged: (chainId: string) => {
        this.emit('chainChanged', parseInt(chainId, 16));
      },
      disconnect: () => {
        this.disconnect();
      },
    };

    this.provider.on('accountsChanged', this.boundHandlers.accountsChanged);
    this.provider.on('chainChanged', this.boundHandlers.chainChanged);
    this.provider.on('disconnect', this.boundHandlers.disconnect);
  }

  private removeListeners(): void {
    if (!this.provider || !this.boundHandlers) return;

    this.provider.removeListener('accountsChanged', this.boundHandlers.accountsChanged);
    this.provider.removeListener('chainChanged', this.boundHandlers.chainChanged);
    this.provider.removeListener('disconnect', this.boundHandlers.disconnect);

    this.boundHandlers = null;
  }
}
