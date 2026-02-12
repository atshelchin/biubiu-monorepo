/**
 * Web Worker adapter for Browser, Bun, and Deno
 */

import type { MainThreadAdapter, WorkerSideAdapter, MessageHandler, ErrorHandler } from './types.js';

/**
 * Main thread adapter for Web Workers
 */
export class WebMainThreadAdapter implements MainThreadAdapter {
  constructor(private worker: Worker) {}

  postMessage(data: unknown, transfer?: Transferable[]): void {
    if (transfer?.length) {
      this.worker.postMessage(data, transfer);
    } else {
      this.worker.postMessage(data);
    }
  }

  onMessage(handler: MessageHandler): void {
    this.worker.onmessage = (event: MessageEvent) => handler(event.data);
  }

  onError(handler: ErrorHandler): void {
    this.worker.onerror = (event: ErrorEvent) => {
      handler(new Error(event.message || 'Worker error'));
    };
  }

  terminate(): void {
    this.worker.terminate();
  }

  get raw(): Worker {
    return this.worker;
  }
}

/**
 * Worker side adapter for Web Workers
 */
export class WebWorkerSideAdapter implements WorkerSideAdapter {
  postMessage(data: unknown, transfer?: Transferable[]): void {
    if (transfer?.length) {
      self.postMessage(data, transfer);
    } else {
      self.postMessage(data);
    }
  }

  onMessage(handler: MessageHandler): void {
    self.onmessage = (event: MessageEvent) => handler(event.data);
  }
}
