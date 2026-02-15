/**
 * PDA Error types
 */

export class PDAError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PDAError';
  }
}

export class ValidationError extends PDAError {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class StateTransitionError extends PDAError {
  constructor(
    public readonly from: string,
    public readonly to: string
  ) {
    super(`Invalid state transition: ${from} -> ${to}`);
    this.name = 'StateTransitionError';
  }
}

export class InteractionTimeoutError extends PDAError {
  constructor(
    public readonly requestId: string,
    public readonly timeout: number
  ) {
    super(`Interaction timeout after ${timeout}ms (requestId: ${requestId})`);
    this.name = 'InteractionTimeoutError';
  }
}

export class ExecutionCancelledError extends PDAError {
  constructor(reason?: string) {
    super(reason ?? 'Execution cancelled');
    this.name = 'ExecutionCancelledError';
  }
}
