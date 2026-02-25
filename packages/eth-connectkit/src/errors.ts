export class ConnectKitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectKitError';
  }
}

export class ConnectorError extends ConnectKitError {
  constructor(
    message: string,
    public readonly connectorId: string
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}

export class UserRejectedError extends ConnectorError {
  constructor(connectorId: string) {
    super('User rejected the request', connectorId);
    this.name = 'UserRejectedError';
  }
}

export class ChainNotConfiguredError extends ConnectKitError {
  constructor(public readonly chainId: number) {
    super(`Chain ${chainId} is not configured`);
    this.name = 'ChainNotConfiguredError';
  }
}

export class ConnectionTimeoutError extends ConnectorError {
  constructor(connectorId: string, public readonly timeout: number) {
    super(`Connection timeout after ${timeout}ms`, connectorId);
    this.name = 'ConnectionTimeoutError';
  }
}

export class ProviderRpcError extends ConnectKitError {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = 'ProviderRpcError';
  }
}
