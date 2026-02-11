/**
 * Mock Worker for testing
 * Simulates Worker message passing in the same thread
 */

import type { MainToWorkerMessage, WorkerToMainMessage } from './protocol.js';
import { serializeError } from './protocol.js';

type MessageHandler = (event: MessageEvent<WorkerToMainMessage>) => void;

export interface MockWorkerMethods {
  [key: string]: (...args: unknown[]) => unknown;
}

/**
 * Create a mock Worker that runs in the same thread
 * Useful for testing without actual Worker threads
 */
export function createMockWorker(methods: MockWorkerMethods): Worker {
  let onmessageHandler: MessageHandler | null = null;
  let onerrorHandler: ((event: ErrorEvent) => void) | null = null;
  let isTerminated = false;

  // Track active generators for cancellation
  const activeGenerators = new Map<number, Generator | AsyncGenerator>();

  const mockWorker = {
    postMessage(data: MainToWorkerMessage, _transfer?: Transferable[]) {
      if (isTerminated) return;

      // Simulate async message passing
      queueMicrotask(async () => {
        if (isTerminated) return;

        if (data.$type === 'CANCEL') {
          const gen = activeGenerators.get(data.$id);
          if (gen && 'return' in gen && typeof gen.return === 'function') {
            try {
              gen.return(undefined);
            } catch {
              // Ignore
            }
          }
          activeGenerators.delete(data.$id);
          return;
        }

        if (data.$type === 'CALL') {
          const { $id, method, args } = data;
          const fn = methods[method];

          if (!fn) {
            sendMessage({
              $type: 'REJECT',
              $id,
              error: { name: 'Error', message: `Method '${method}' not found` },
            });
            return;
          }

          try {
            const result = fn(...args);

            // Check if generator
            if (isGenerator(result)) {
              activeGenerators.set($id, result);

              try {
                for await (const value of result as AsyncIterable<unknown>) {
                  if (!activeGenerators.has($id) || isTerminated) break;
                  sendMessage({ $type: 'YIELD', $id, value });
                }

                if (activeGenerators.has($id) && !isTerminated) {
                  sendMessage({ $type: 'DONE', $id });
                }
              } finally {
                activeGenerators.delete($id);
              }
            } else {
              const value = await result;
              if (!isTerminated) {
                sendMessage({ $type: 'RESOLVE', $id, value });
              }
            }
          } catch (error) {
            if (!isTerminated) {
              sendMessage({ $type: 'REJECT', $id, error: serializeError(error) });
            }
          }
        }
      });
    },

    set onmessage(handler: MessageHandler | null) {
      onmessageHandler = handler;
    },

    get onmessage() {
      return onmessageHandler;
    },

    set onerror(handler: ((event: ErrorEvent) => void) | null) {
      onerrorHandler = handler;
    },

    get onerror() {
      return onerrorHandler;
    },

    terminate() {
      isTerminated = true;
      activeGenerators.clear();
    },

    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  };

  function sendMessage(message: WorkerToMainMessage) {
    if (onmessageHandler && !isTerminated) {
      onmessageHandler({ data: message } as MessageEvent<WorkerToMainMessage>);
    }
  }

  function isGenerator(value: unknown): value is Generator | AsyncGenerator {
    if (value === null || typeof value !== 'object') return false;
    return (
      typeof (value as Generator).next === 'function' &&
      (typeof (value as Generator)[Symbol.iterator] === 'function' ||
        typeof (value as AsyncGenerator)[Symbol.asyncIterator] === 'function')
    );
  }

  // Send READY message after a microtask (simulating Worker startup)
  queueMicrotask(() => {
    if (!isTerminated) {
      sendMessage({ $type: 'READY', methods: Object.keys(methods) });
    }
  });

  return mockWorker as unknown as Worker;
}

/**
 * Create a mock Worker that delays READY message
 */
export function createSlowStartWorker(methods: MockWorkerMethods, delay: number): Worker {
  const worker = createMockWorker(methods);
  const originalOnmessage = Object.getOwnPropertyDescriptor(worker, 'onmessage');

  // Intercept the first READY message and delay it
  let readyDelayed = false;
  let pendingReady: WorkerToMainMessage | null = null;
  let actualHandler: MessageHandler | null = null;

  Object.defineProperty(worker, 'onmessage', {
    set(handler: MessageHandler | null) {
      actualHandler = handler;
      if (originalOnmessage?.set) {
        originalOnmessage.set.call(worker, (event: MessageEvent<WorkerToMainMessage>) => {
          if (!readyDelayed && event.data.$type === 'READY') {
            pendingReady = event.data;
            readyDelayed = true;
            setTimeout(() => {
              if (actualHandler && pendingReady) {
                actualHandler({ data: pendingReady } as MessageEvent<WorkerToMainMessage>);
              }
            }, delay);
          } else if (actualHandler) {
            actualHandler(event);
          }
        });
      }
    },
    get() {
      return actualHandler;
    },
  });

  return worker;
}

/**
 * Create a mock Worker that fails on initialization
 */
export function createFailingWorker(errorMessage: string): Worker {
  let onerrorHandler: ((event: ErrorEvent) => void) | null = null;

  const mockWorker = {
    postMessage() {},
    set onmessage(_handler: MessageHandler | null) {},
    get onmessage() {
      return null;
    },
    set onerror(handler: ((event: ErrorEvent) => void) | null) {
      onerrorHandler = handler;
      // Trigger error after microtask
      queueMicrotask(() => {
        if (onerrorHandler) {
          onerrorHandler({ message: errorMessage } as ErrorEvent);
        }
      });
    },
    get onerror() {
      return onerrorHandler;
    },
    terminate() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  };

  return mockWorker as unknown as Worker;
}
