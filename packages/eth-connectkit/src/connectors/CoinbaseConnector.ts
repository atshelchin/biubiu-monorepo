import { Connector, type ConnectOptions, type SwitchChainOptions } from './Connector.js';
import type {
  EIP1193Provider,
  ConnectorConfig,
  ConnectorAccount,
  Address,
  Chain,
  Hex,
  CoinbaseConfig,
  TransactionRequest,
  TypedData,
} from '../types.js';
import { ConnectorError } from '../errors.js';

// Dynamic import type for Coinbase SDK
type CoinbaseWalletSDKType = typeof import('@coinbase/wallet-sdk').CoinbaseWalletSDK;

let CoinbaseWalletSDK: CoinbaseWalletSDKType | null = null;

export class CoinbaseConnector extends Connector {
  readonly config: ConnectorConfig = {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    type: 'coinbase',
    icon: 'https://www.coinbase.com/favicon.ico',
  };

  private sdk: InstanceType<CoinbaseWalletSDKType> | null = null;
  private provider: EIP1193Provider | null = null;
  private appConfig: CoinbaseConfig;
  private chains: Map<number, Chain>;
  private boundHandlers: {
    accountsChanged: (accounts: string[]) => void;
    chainChanged: (chainId: string) => void;
    disconnect: () => void;
  } | null = null;

  constructor(config: CoinbaseConfig & { chains?: Chain[] }) {
    super();
    this.appConfig = {
      appName: config.appName,
      appLogoUrl: config.appLogoUrl,
    };
    this.chains = new Map(config.chains?.map((c) => [c.id, c]));
  }

  getProvider(): EIP1193Provider | null {
    return this.provider;
  }

  isConnected(): boolean {
    return this._status === 'connected' && this.provider !== null;
  }

  async connect(options?: ConnectOptions): Promise<ConnectorAccount> {
    try {
      this.setStatus('connecting');

      // Dynamically import Coinbase SDK
      if (!CoinbaseWalletSDK) {
        const module = await import('@coinbase/wallet-sdk');
        CoinbaseWalletSDK = module.CoinbaseWalletSDK;
      }

      // Initialize SDK
      this.sdk = new CoinbaseWalletSDK({
        appName: this.appConfig.appName,
        appLogoUrl: this.appConfig.appLogoUrl,
      });

      // Create Web3 provider (Smart Wallet / Passkey)
      this.provider = this.sdk.makeWeb3Provider() as unknown as EIP1193Provider;

      // Request accounts (triggers passkey authentication)
      const accounts = await this.provider.request<Address[]>({
        method: 'eth_requestAccounts',
      });

      if (!accounts.length) {
        throw new ConnectorError('No accounts returned', 'coinbase');
      }

      // Get chain ID
      let chainId = await this.getChainId();

      // Switch chain if requested
      if (options?.chainId && options.chainId !== chainId) {
        try {
          await this.switchChain({ chainId: options.chainId });
          chainId = options.chainId;
        } catch {
          // Continue with current chain
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

    // Coinbase SDK doesn't have explicit disconnect, but we reset state
    this.provider = null;
    this.sdk = null;

    this.setStatus('disconnected');
    this.emit('disconnect');
  }

  async getAccounts(): Promise<Address[]> {
    if (!this.provider) return [];
    return this.provider.request<Address[]>({ method: 'eth_accounts' });
  }

  async getChainId(): Promise<number> {
    if (!this.provider) throw new ConnectorError('Not connected', 'coinbase');
    const chainId = await this.provider.request<string>({ method: 'eth_chainId' });
    return parseInt(chainId, 16);
  }

  async switchChain({ chainId }: SwitchChainOptions): Promise<Chain> {
    if (!this.provider) throw new ConnectorError('Not connected', 'coinbase');

    const chain = this.chains.get(chainId);
    if (!chain) throw new Error(`Chain ${chainId} not configured`);

    await this.provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${chainId.toString(16)}` }],
    });

    return chain;
  }

  async signMessage(message: string, account?: Address): Promise<Hex> {
    if (!this.provider) throw new ConnectorError('Not connected', 'coinbase');

    const accounts = await this.getAccounts();
    const from = account ?? accounts[0];
    if (!from) throw new ConnectorError('No account available', 'coinbase');

    return this.provider.request<Hex>({
      method: 'personal_sign',
      params: [message, from],
    });
  }

  async signTypedData(data: TypedData, account?: Address): Promise<Hex> {
    if (!this.provider) throw new ConnectorError('Not connected', 'coinbase');

    const accounts = await this.getAccounts();
    const from = account ?? accounts[0];
    if (!from) throw new ConnectorError('No account available', 'coinbase');

    return this.provider.request<Hex>({
      method: 'eth_signTypedData_v4',
      params: [from, JSON.stringify(data)],
    });
  }

  async sendTransaction(tx: TransactionRequest, account?: Address): Promise<Hex> {
    if (!this.provider) throw new ConnectorError('Not connected', 'coinbase');

    const accounts = await this.getAccounts();
    const from = account ?? accounts[0];
    if (!from) throw new ConnectorError('No account available', 'coinbase');

    return this.provider.request<Hex>({
      method: 'eth_sendTransaction',
      params: [{ ...tx, from }],
    });
  }

  destroy(): void {
    this.removeListeners();
    this.provider = null;
    this.sdk = null;
    this.removeAllListeners();
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
