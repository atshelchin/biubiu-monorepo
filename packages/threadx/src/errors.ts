import type { SerializedError } from './protocol.js';

/**
 * Error thrown when Worker execution fails
 */
export class WorkerError extends Error {
  /** Stack trace from the Worker side */
  workerStack?: string;

  constructor(serialized: SerializedError, callSite?: Error) {
    super(serialized.message);
    this.name = serialized.name || 'WorkerError';
    this.workerStack = serialized.stack;

    // Combine stacks: Worker error + call site
    if (callSite?.stack) {
      this.stack = `${this.name}: ${this.message}\n` +
        `    at Worker\n` +
        callSite.stack.split('\n').slice(1).join('\n');
    }
  }
}

/**
 * Error thrown when a call times out
 */
export class TimeoutError extends Error {
  constructor(method: string, timeout: number) {
    super(`Call to '${method}' timed out after ${timeout}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when Worker initialization fails
 */
export class InitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InitError';
  }
}

/**
 * Error thrown on unsupported runtime
 */
export class UnsupportedRuntimeError extends Error {
  constructor(runtime: string) {
    super(`ThreadX is not supported on ${runtime}. Supported runtimes: Browser, Bun, Deno`);
    this.name = 'UnsupportedRuntimeError';
  }
}
