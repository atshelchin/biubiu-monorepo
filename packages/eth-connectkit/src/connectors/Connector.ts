import type {
  EIP1193Provider,
  ConnectorConfig,
  ConnectorEvents,
  ConnectorStatus,
  ConnectorAccount,
  Address,
  Chain,
  Hex,
  TransactionRequest,
  TypedData,
} from '../types.js';
import { EventEmitter } from '../core/EventEmitter.js';

export interface ConnectOptions {
  chainId?: number;
}

export interface SwitchChainOptions {
  chainId: number;
}

/**
 * Abstract base class for wallet connectors.
 * All connectors must implement these methods.
 */
export abstract class Connector extends EventEmitter<ConnectorEvents> {
  abstract readonly config: ConnectorConfig;

  protected _status: ConnectorStatus = 'disconnected';

  get status(): ConnectorStatus {
    return this._status;
  }

  abstract getProvider(): EIP1193Provider | null;

  abstract isConnected(): boolean;

  abstract connect(options?: ConnectOptions): Promise<ConnectorAccount>;

  abstract disconnect(): Promise<void>;

  abstract getAccounts(): Promise<Address[]>;

  abstract getChainId(): Promise<number>;

  abstract switchChain(options: SwitchChainOptions): Promise<Chain>;

  async addChain?(chain: Chain): Promise<void>;

  async signMessage?(message: string, account?: Address): Promise<Hex>;

  async signTypedData?(data: TypedData, account?: Address): Promise<Hex>;

  async sendTransaction?(tx: TransactionRequest, account?: Address): Promise<Hex>;

  abstract destroy(): void;

  protected setStatus(status: ConnectorStatus): void {
    if (this._status !== status) {
      this._status = status;
      this.emit('statusChange', status);
    }
  }
}
