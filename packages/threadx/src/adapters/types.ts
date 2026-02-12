/**
 * Adapter interfaces for cross-platform worker communication
 */

/** Message handler callback type */
export type MessageHandler = (data: unknown) => void;

/** Error handler callback type */
export type ErrorHandler = (error: Error) => void;

/**
 * Main thread adapter - abstracts the Worker instance
 */
export interface MainThreadAdapter {
  /** Post a message to the worker */
  postMessage(data: unknown, transfer?: Transferable[]): void;

  /** Set message handler */
  onMessage(handler: MessageHandler): void;

  /** Set error handler */
  onError(handler: ErrorHandler): void;

  /** Terminate the worker */
  terminate(): void;

  /** Original worker instance (for $worker property) */
  readonly raw: unknown;
}

/**
 * Worker side adapter - abstracts the communication channel
 */
export interface WorkerSideAdapter {
  /** Post a message to the main thread */
  postMessage(data: unknown, transfer?: Transferable[]): void;

  /** Set message handler */
  onMessage(handler: MessageHandler): void;
}

/**
 * Runtime environment type
 */
export type RuntimeEnvironment = 'web' | 'node' | 'bun' | 'deno';
