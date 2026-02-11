/**
 * Worker-side API for ThreadX
 */

import type { MainToWorkerMessage, WorkerToMainMessage } from './protocol.js';
import { serializeError } from './protocol.js';
import { isTransferDescriptor } from './transfer.js';

// Re-export t() for Worker-side use
export { t } from './transfer.js';

type AnyFunction = (...args: unknown[]) => unknown;
type MethodMap = Record<string, AnyFunction>;

/**
 * Check if a value is a Generator (sync)
 * Uses duck typing - checks for next() and Symbol.iterator
 */
function isSyncGenerator(value: unknown): value is Generator {
  if (value === null || typeof value !== 'object') return false;
  return (
    typeof (value as Generator).next === 'function' &&
    typeof (value as Generator)[Symbol.iterator] === 'function' &&
    // Exclude AsyncGenerator (which also has next and Symbol.iterator)
    typeof (value as AsyncGenerator)[Symbol.asyncIterator] !== 'function'
  );
}

/**
 * Check if a value is an AsyncGenerator
 * Uses duck typing - checks for next() and Symbol.asyncIterator
 */
function isAsyncGenerator(value: unknown): value is AsyncGenerator {
  if (value === null || typeof value !== 'object') return false;
  return (
    typeof (value as AsyncGenerator).next === 'function' &&
    typeof (value as AsyncGenerator)[Symbol.asyncIterator] === 'function'
  );
}

/**
 * Check if a value is any kind of Generator (sync or async)
 */
function isGenerator(value: unknown): value is Generator | AsyncGenerator {
  return isSyncGenerator(value) || isAsyncGenerator(value);
}

/**
 * Post a message with optional transferables
 */
function postMessage(message: WorkerToMainMessage, value?: unknown): void {
  if (isTransferDescriptor(value)) {
    self.postMessage(message, value.transferables);
  } else {
    self.postMessage(message);
  }
}

/**
 * Expose methods to the main thread
 *
 * @example
 * import { expose } from '@shelchin/threadx/worker'
 *
 * expose({
 *   add(a: number, b: number) {
 *     return a + b
 *   },
 *
 *   async heavyTask(data: ArrayBuffer) {
 *     // Long running computation...
 *     return result
 *   },
 *
 *   *progress(total: number) {
 *     for (let i = 0; i <= total; i++) {
 *       yield i
 *     }
 *   }
 * })
 */
export function expose<T extends MethodMap>(methods: T): void {
  const methodNames = Object.keys(methods);

  // Track active generators for cancellation
  const activeGenerators = new Map<number, Generator | AsyncGenerator>();

  // Send ready message
  self.postMessage({ $type: 'READY', methods: methodNames } satisfies WorkerToMainMessage);

  // Handle incoming messages
  self.onmessage = async (event: MessageEvent<MainToWorkerMessage>) => {
    const msg = event.data;

    // Handle cancellation
    if (msg.$type === 'CANCEL') {
      const gen = activeGenerators.get(msg.$id);
      if (gen && 'return' in gen && typeof gen.return === 'function') {
        try {
          gen.return(undefined);
        } catch {
          // Ignore errors during cancellation
        }
      }
      activeGenerators.delete(msg.$id);
      return;
    }

    // Handle method call
    if (msg.$type === 'CALL') {
      const { $id, method, args } = msg;
      const fn = methods[method];

      // Method not found
      if (!fn) {
        postMessage({
          $type: 'REJECT',
          $id,
          error: { name: 'Error', message: `Method '${method}' not found` },
        });
        return;
      }

      try {
        const result = fn(...args);

        // Handle Generator/AsyncGenerator → streaming
        if (isGenerator(result) || isAsyncGenerator(result)) {
          activeGenerators.set($id, result);

          try {
            // Use for-await to handle both sync and async generators
            for await (const value of result as AsyncIterable<unknown>) {
              // Check if cancelled
              if (!activeGenerators.has($id)) {
                break;
              }
              postMessage({ $type: 'YIELD', $id, value }, value);
            }

            // Only send DONE if not cancelled
            if (activeGenerators.has($id)) {
              postMessage({ $type: 'DONE', $id });
            }
          } finally {
            activeGenerators.delete($id);
          }
        } else {
          // Handle Promise/value → single response
          const value = await result;
          postMessage({ $type: 'RESOLVE', $id, value }, value);
        }
      } catch (error) {
        postMessage({
          $type: 'REJECT',
          $id,
          error: serializeError(error),
        });
      }
    }
  };
}
