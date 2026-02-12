/**
 * Node.js worker_threads adapter
 */

import type { MainThreadAdapter, WorkerSideAdapter, MessageHandler, ErrorHandler } from './types.js';
import type { Worker as NodeWorker, MessagePort } from 'worker_threads';

/**
 * Main thread adapter for Node.js worker_threads
 */
export class NodeMainThreadAdapter implements MainThreadAdapter {
  constructor(private worker: NodeWorker) {}

  postMessage(data: unknown, transfer?: Transferable[]): void {
    if (transfer?.length) {
      // Node.js accepts transferList as second argument
      this.worker.postMessage(data, transfer as unknown[]);
    } else {
      this.worker.postMessage(data);
    }
  }

  onMessage(handler: MessageHandler): void {
    this.worker.on('message', handler);
  }

  onError(handler: ErrorHandler): void {
    this.worker.on('error', handler);
  }

  terminate(): void {
    this.worker.terminate();
  }

  get raw(): NodeWorker {
    return this.worker;
  }
}

/**
 * Worker side adapter for Node.js worker_threads
 */
export class NodeWorkerSideAdapter implements WorkerSideAdapter {
  private parentPort: MessagePort;

  constructor(parentPort: MessagePort) {
    this.parentPort = parentPort;
  }

  postMessage(data: unknown, transfer?: Transferable[]): void {
    if (transfer?.length) {
      this.parentPort.postMessage(data, transfer as unknown[]);
    } else {
      this.parentPort.postMessage(data);
    }
  }

  onMessage(handler: MessageHandler): void {
    this.parentPort.on('message', handler);
  }
}

/**
 * Get the parentPort for Node.js worker context
 * Returns null if not in a worker thread
 */
export function getParentPort(): MessagePort | null {
  try {
    // Dynamic require to avoid bundler issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const workerThreads = require('worker_threads');
    return workerThreads.parentPort;
  } catch {
    return null;
  }
}

/**
 * Check if running in Node.js main thread
 */
export function isNodeMainThread(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const workerThreads = require('worker_threads');
    return workerThreads.isMainThread;
  } catch {
    return false;
  }
}
