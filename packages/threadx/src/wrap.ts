/**
 * Main thread API for ThreadX
 */

import type { WorkerToMainMessage, CallMessage, CancelMessage, SerializedError } from './protocol.js';
import { WorkerError, TimeoutError, InitError } from './errors.js';
import { prepareArgs } from './transfer.js';
import type { WorkerState, WrapOptions, WrappedWorker } from './types.js';

/** Default timeout in milliseconds */
const DEFAULT_TIMEOUT = 30000;

/** Internal state for kill() to access */
interface InternalState {
  setState: (state: WorkerState) => void;
  rejectAll: (error: Error) => void;
}

/** WeakMap to store internal state for each proxy */
const proxyInternals = new WeakMap<object, InternalState>();

/** Pending RPC call */
interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  method: string;
  callSite: Error;
  timeoutId?: ReturnType<typeof setTimeout>;
}

/** Pending streaming call */
interface PendingStream {
  push: (value: unknown) => void;
  done: () => void;
  error: (error: Error) => void;
  method: string;
  callSite: Error;
  timeoutId?: ReturnType<typeof setTimeout>;
}

/** Queued call before ready */
interface QueuedCall {
  message: CallMessage;
  transfer: Transferable[];
}

/**
 * Create an AsyncIterable for streaming results
 */
function createAsyncIterable<T>(
  worker: Worker,
  id: number,
  pending: Map<number, PendingStream>,
  timeout: number,
  method: string
): AsyncIterable<T> {
  // Buffer for values received before consumed
  const buffer: T[] = [];
  // Resolvers waiting for values
  let waitingResolve: ((result: IteratorResult<T>) => void) | null = null;
  let waitingReject: ((error: Error) => void) | null = null;
  let isDone = false;
  let error: Error | null = null;

  // Capture call site for better stack traces
  const callSite = new Error();

  // Set up timeout
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (timeout > 0) {
    timeoutId = setTimeout(() => {
      const timeoutError = new TimeoutError(method, timeout);
      error = timeoutError;
      if (waitingReject) {
        waitingReject(timeoutError);
        waitingResolve = null;
        waitingReject = null;
      }
      pending.delete(id);
      // Send cancel to worker
      worker.postMessage({ $type: 'CANCEL', $id: id } satisfies CancelMessage);
    }, timeout);
  }

  // Register pending stream handler
  pending.set(id, {
    push: (value: unknown) => {
      // Reset timeout on each yield
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          const timeoutError = new TimeoutError(method, timeout);
          error = timeoutError;
          if (waitingReject) {
            waitingReject(timeoutError);
            waitingResolve = null;
            waitingReject = null;
          }
          pending.delete(id);
          worker.postMessage({ $type: 'CANCEL', $id: id } satisfies CancelMessage);
        }, timeout);
      }

      if (waitingResolve) {
        waitingResolve({ value: value as T, done: false });
        waitingResolve = null;
        waitingReject = null;
      } else {
        buffer.push(value as T);
      }
    },
    done: () => {
      if (timeoutId) clearTimeout(timeoutId);
      isDone = true;
      if (waitingResolve) {
        waitingResolve({ value: undefined as T, done: true });
        waitingResolve = null;
        waitingReject = null;
      }
    },
    error: (err: Error) => {
      if (timeoutId) clearTimeout(timeoutId);
      error = err;
      if (waitingReject) {
        waitingReject(err);
        waitingResolve = null;
        waitingReject = null;
      }
    },
    method,
    callSite,
  });

  return {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<T>> {
          // Return buffered value if available
          if (buffer.length > 0) {
            return { value: buffer.shift()!, done: false };
          }

          // Return error if set
          if (error) {
            throw error;
          }

          // Return done if finished
          if (isDone) {
            return { value: undefined as T, done: true };
          }

          // Wait for next value
          return new Promise((resolve, reject) => {
            waitingResolve = resolve;
            waitingReject = reject;
          });
        },

        async return(): Promise<IteratorResult<T>> {
          // Called when for-await is broken
          if (timeoutId) clearTimeout(timeoutId);
          pending.delete(id);
          // Send cancel to worker
          worker.postMessage({ $type: 'CANCEL', $id: id } satisfies CancelMessage);
          return { value: undefined as T, done: true };
        },
      };
    },
  };
}

/**
 * Wrap a Worker for seamless RPC communication
 *
 * @example
 * import { wrap } from '@shelchin/threadx'
 * import type * as CalcMethods from './calc.worker'
 *
 * const calc = wrap<typeof CalcMethods>(new Worker('./calc.worker.js'))
 *
 * // Call like a regular async function
 * const result = await calc.add(1, 2)
 *
 * // Streaming with for-await
 * for await (const progress of calc.process(data)) {
 *   console.log(progress)
 * }
 */
export function wrap<T>(worker: Worker, options?: WrapOptions): WrappedWorker<T> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

  // State
  let state: WorkerState = 'init';
  let id = 0;
  const pendingCalls = new Map<number, PendingCall>();
  const pendingStreams = new Map<number, PendingStream>();
  const queue: QueuedCall[] = [];
  let methods: Set<string> = new Set();

  // Flush queued calls after ready
  function flushQueue(): void {
    for (const { message, transfer } of queue) {
      worker.postMessage(message, transfer);
    }
    queue.length = 0;
  }

  // Deserialize error from worker
  function deserializeError(serialized: SerializedError, callSite: Error): Error {
    return new WorkerError(serialized, callSite);
  }

  // Handle messages from worker
  worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
    const msg = event.data;

    // Handle ready message
    if (msg.$type === 'READY') {
      state = 'ready';
      methods = new Set(msg.methods);
      flushQueue();
      return;
    }

    // Handle RPC responses
    if (msg.$type === 'RESOLVE') {
      const call = pendingCalls.get(msg.$id);
      if (call) {
        if (call.timeoutId) clearTimeout(call.timeoutId);
        call.resolve(msg.value);
        pendingCalls.delete(msg.$id);
      }
      return;
    }

    if (msg.$type === 'REJECT') {
      const call = pendingCalls.get(msg.$id);
      if (call) {
        if (call.timeoutId) clearTimeout(call.timeoutId);
        call.reject(deserializeError(msg.error, call.callSite));
        pendingCalls.delete(msg.$id);
        return;
      }

      // Also check streaming calls
      const stream = pendingStreams.get(msg.$id);
      if (stream) {
        stream.error(deserializeError(msg.error, stream.callSite));
        pendingStreams.delete(msg.$id);
      }
      return;
    }

    // Handle streaming responses
    if (msg.$type === 'YIELD') {
      const stream = pendingStreams.get(msg.$id);
      if (stream) {
        stream.push(msg.value);
      }
      return;
    }

    if (msg.$type === 'DONE') {
      const stream = pendingStreams.get(msg.$id);
      if (stream) {
        stream.done();
        pendingStreams.delete(msg.$id);
      }
      return;
    }
  };

  // Function to reject all pending calls (including queued)
  function rejectAllPending(error: Error): void {
    // Reject pending RPC calls
    for (const call of pendingCalls.values()) {
      if (call.timeoutId) clearTimeout(call.timeoutId);
      call.reject(error);
    }
    pendingCalls.clear();

    // Reject pending streams (with timeout cleanup)
    for (const stream of pendingStreams.values()) {
      if (stream.timeoutId) clearTimeout(stream.timeoutId);
      stream.error(error);
    }
    pendingStreams.clear();

    // Clear queued calls - they'll never be sent
    queue.length = 0;
  }

  // Handle worker errors
  worker.onerror = (event) => {
    const error = new InitError(event.message || 'Worker error');
    rejectAllPending(error);
    state = 'dead';
  };

  // Create proxy
  const proxy = new Proxy({} as WrappedWorker<T>, {
    get(_, prop: string | symbol) {
      // State hooks
      if (prop === '$state') return state;
      if (prop === '$pending') return pendingCalls.size + pendingStreams.size;
      if (prop === '$worker') return worker;

      // Symbol properties
      if (typeof prop === 'symbol') return undefined;

      // Method call
      return (...args: unknown[]) => {
        const currentId = ++id;
        const { args: processedArgs, transfer } = prepareArgs(args);

        const message: CallMessage = {
          $type: 'CALL',
          $id: currentId,
          method: prop,
          args: processedArgs,
        };

        // Check if we know it's a streaming method (we don't at compile time)
        // So we need a heuristic or always return a promise that can be iterated
        // For simplicity, we'll use a convention: methods starting with $ or
        // containing 'stream', 'progress', 'iterate' are streaming
        // Actually, let's just return a special object that can be both awaited and iterated

        // Better approach: Return a "dual" object that works as both Promise and AsyncIterable
        // The user's code pattern determines which is used

        // Simpler approach for now: all methods return Promise
        // Streaming methods must be called with forAwait pattern explicitly
        // We detect streaming by checking if YIELD messages come back

        // Actually, the cleanest approach: return an object that:
        // - Has .then() for promise behavior
        // - Has [Symbol.asyncIterator]() for streaming behavior
        // The first YIELD or RESOLVE determines which path

        const callSite = new Error();

        // Create a dual-mode response object
        let isStreaming = false;
        let streamIterable: AsyncIterable<unknown> | null = null;

        // Create internal promise once (to support multiple .then() calls)
        let internalPromise: Promise<unknown> | null = null;
        let promiseResolve: ((value: unknown) => void) | null = null;
        let promiseReject: ((error: Error) => void) | null = null;

        // Lazily create the internal promise
        function getInternalPromise(): Promise<unknown> {
          if (!internalPromise) {
            internalPromise = new Promise<unknown>((resolve, reject) => {
              promiseResolve = resolve;
              promiseReject = reject;
            });
          }
          return internalPromise;
        }

        // Set up timeout for RPC mode
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        if (timeout > 0) {
          timeoutId = setTimeout(() => {
            if (!isStreaming) {
              const timeoutError = new TimeoutError(prop, timeout);
              // Ensure promise exists before rejecting
              getInternalPromise();
              if (promiseReject) {
                promiseReject(timeoutError);
              }
              pendingCalls.delete(currentId);
            }
          }, timeout);
        }

        // Register pending call
        pendingCalls.set(currentId, {
          resolve: (value) => {
            if (timeoutId) clearTimeout(timeoutId);
            // Ensure promise exists before resolving
            getInternalPromise();
            if (promiseResolve) {
              promiseResolve(value);
            }
          },
          reject: (error) => {
            if (timeoutId) clearTimeout(timeoutId);
            // Ensure promise exists before rejecting
            getInternalPromise();
            if (promiseReject) {
              promiseReject(error);
            }
          },
          method: prop,
          callSite,
          timeoutId,
        });

        // Send or queue the message
        if (state === 'ready') {
          worker.postMessage(message, transfer);
        } else if (state === 'init') {
          queue.push({ message, transfer });
        } else {
          // Worker is dead
          const error = new InitError('Worker is terminated');
          if (timeoutId) clearTimeout(timeoutId);
          pendingCalls.delete(currentId);
          return Promise.reject(error);
        }

        // Return dual-mode object
        const dualResult = {
          // Promise interface - use shared internal promise
          then<TResult1 = unknown, TResult2 = never>(
            onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: Error) => TResult2 | PromiseLike<TResult2>) | null
          ): Promise<TResult1 | TResult2> {
            return getInternalPromise().then(onfulfilled, onrejected) as Promise<TResult1 | TResult2>;
          },

          catch<TResult = never>(
            onrejected?: ((reason: Error) => TResult | PromiseLike<TResult>) | null
          ): Promise<unknown | TResult> {
            return getInternalPromise().catch(onrejected);
          },

          finally(onfinally?: (() => void) | null): Promise<unknown> {
            return getInternalPromise().finally(onfinally);
          },

          // AsyncIterable interface
          [Symbol.asyncIterator](): AsyncIterator<unknown> {
            // Switch to streaming mode
            if (!isStreaming) {
              isStreaming = true;

              // Remove from pendingCalls, add to pendingStreams
              const call = pendingCalls.get(currentId);
              if (call?.timeoutId) clearTimeout(call.timeoutId);
              pendingCalls.delete(currentId);

              // Create streaming iterable
              streamIterable = createAsyncIterable(
                worker,
                currentId,
                pendingStreams,
                timeout,
                prop
              );
            }

            return streamIterable![Symbol.asyncIterator]();
          },
        };

        return dualResult;
      };
    },
  });

  // Register internal state for kill()
  proxyInternals.set(proxy, {
    setState: (newState: WorkerState) => {
      state = newState;
    },
    rejectAll: rejectAllPending,
  });

  return proxy;
}

/**
 * Terminate a wrapped worker
 */
export function kill<T>(proxy: WrappedWorker<T>): void {
  const internals = proxyInternals.get(proxy);
  if (internals) {
    const error = new InitError('Worker is terminated');
    internals.rejectAll(error);
    internals.setState('dead');
  }
  proxy.$worker.terminate();
}
