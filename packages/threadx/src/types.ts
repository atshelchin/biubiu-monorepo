/**
 * Type utilities for ThreadX
 */

/**
 * Worker state
 */
export type WorkerState = 'init' | 'ready' | 'dead';

/**
 * Options for wrap()
 */
export interface WrapOptions {
  /** Default timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Debug name for logging */
  name?: string;
}

/**
 * Marker interface for TransferDescriptor (avoids circular import)
 * Must include the symbol marker to ensure type safety
 */
interface TransferMarker<T> {
  readonly [key: symbol]: true; // Matches TRANSFER symbol
  readonly value: T;
  readonly transferables: Transferable[];
}

/**
 * Allow a parameter to be the original type or wrapped in TransferDescriptor
 */
type MaybeTransfer<T> = T | TransferMarker<T>;

/**
 * Convert each parameter to allow TransferDescriptor wrapping
 */
type TransferableArgs<A extends unknown[]> = {
  [K in keyof A]: MaybeTransfer<A[K]>;
};

/**
 * Convert a function type to its wrapped version:
 * - Generator<T> → AsyncIterable<T>
 * - AsyncGenerator<T> → AsyncIterable<T>
 * - T | Promise<T> → Promise<T>
 * - Parameters can be wrapped with t() for transfer
 */
export type Promisify<T> = T extends (...args: infer A) => Generator<infer Y, unknown, unknown>
  ? (...args: TransferableArgs<A>) => AsyncIterable<Y>
  : T extends (...args: infer A) => AsyncGenerator<infer Y, unknown, unknown>
    ? (...args: TransferableArgs<A>) => AsyncIterable<Y>
    : T extends (...args: infer A) => infer R
      ? (...args: TransferableArgs<A>) => Promise<Awaited<R>>
      : never;

/**
 * Convert a module of functions to wrapped versions
 */
export type WrapModule<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in keyof T as T[K] extends (...args: any[]) => any ? K : never]: Promisify<T[K]>;
};

/**
 * The wrapped worker proxy type with state hooks
 */
export type WrappedWorker<T> = WrapModule<T> & {
  /** Current worker state */
  readonly $state: WorkerState;
  /** Number of pending calls */
  readonly $pending: number;
  /** Original Worker instance (escape hatch) */
  readonly $worker: Worker;
};
