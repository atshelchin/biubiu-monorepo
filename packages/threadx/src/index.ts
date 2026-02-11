/**
 * ThreadX - Seamless Worker Communication
 *
 * @example
 * // Main thread
 * import { wrap, t, kill } from '@shelchin/threadx'
 * import type * as CalcMethods from './calc.worker'
 *
 * const calc = wrap<typeof CalcMethods>(new Worker('./calc.worker.js'))
 *
 * // RPC call
 * const sum = await calc.add(1, 2)
 *
 * // Streaming call
 * for await (const progress of calc.process(data)) {
 *   console.log(progress)
 * }
 *
 * // Zero-copy transfer
 * await calc.processBuffer(t(arrayBuffer))
 *
 * // Terminate
 * kill(calc)
 *
 * @example
 * // Worker side (calc.worker.ts)
 * import { expose } from '@shelchin/threadx/worker'
 *
 * expose({
 *   add: (a, b) => a + b,
 *   *process(data) {
 *     for (let i = 0; i <= 100; i++) {
 *       yield i
 *     }
 *   }
 * })
 */

// Main thread API
export { wrap, kill } from './wrap.js';
export { t } from './transfer.js';

// Error types
export { WorkerError, TimeoutError, InitError, UnsupportedRuntimeError } from './errors.js';

// Types
export type { WrapOptions, WrappedWorker, WorkerState } from './types.js';
export type { TransferDescriptor } from './transfer.js';
