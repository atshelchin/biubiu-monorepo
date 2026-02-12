/**
 * Runtime detection and adapter factory
 */

import type { MainThreadAdapter, WorkerSideAdapter, RuntimeEnvironment } from './types.js';
import { WebMainThreadAdapter, WebWorkerSideAdapter } from './web.js';
import { NodeMainThreadAdapter, NodeWorkerSideAdapter, getParentPort, isNodeMainThread } from './node.js';

export * from './types.js';

// Declare global types for runtime detection
declare const Bun: unknown;
declare const Deno: unknown;

/**
 * Detect the current runtime environment
 */
export function detectRuntime(): RuntimeEnvironment {
  // Bun detection (must be before Node.js as Bun also has process.versions.node)
  if (typeof Bun !== 'undefined') {
    return 'bun';
  }

  // Node.js detection
  if (typeof process !== 'undefined' && process.versions?.node && typeof Bun === 'undefined') {
    return 'node';
  }

  // Deno detection
  if (typeof Deno !== 'undefined') {
    return 'deno';
  }

  // Default to web (browser)
  return 'web';
}

/**
 * Check if running in a worker context (not main thread)
 */
export function isWorkerContext(): boolean {
  const runtime = detectRuntime();

  if (runtime === 'node') {
    return !isNodeMainThread();
  }

  // For web/bun/deno, check for DedicatedWorkerGlobalScope
  // This is the only reliable way to detect worker context across runtimes
  if (typeof self !== 'undefined' && typeof DedicatedWorkerGlobalScope !== 'undefined') {
    return self instanceof DedicatedWorkerGlobalScope;
  }

  return false;
}

/**
 * Check if the given object is a Node.js Worker
 */
function isNodeWorker(worker: unknown): boolean {
  if (!worker || typeof worker !== 'object') return false;

  // Check for Node.js Worker characteristics
  const w = worker as { postMessage?: unknown; on?: unknown; terminate?: unknown; threadId?: unknown };
  return (
    typeof w.postMessage === 'function' &&
    typeof w.on === 'function' &&
    typeof w.terminate === 'function' &&
    typeof w.threadId === 'number'
  );
}

/**
 * Create main thread adapter for the given worker
 */
export function createMainThreadAdapter(worker: unknown): MainThreadAdapter {
  // Check if it's a Node.js Worker
  if (isNodeWorker(worker)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Worker: NodeWorker } = require('worker_threads');
    if (worker instanceof NodeWorker) {
      return new NodeMainThreadAdapter(worker);
    }
  }

  // Otherwise treat as Web Worker
  return new WebMainThreadAdapter(worker as Worker);
}

/**
 * Create worker-side adapter
 */
export function createWorkerSideAdapter(): WorkerSideAdapter {
  const runtime = detectRuntime();

  if (runtime === 'node') {
    const parentPort = getParentPort();
    if (parentPort) {
      return new NodeWorkerSideAdapter(parentPort);
    }
    throw new Error('Cannot create worker adapter: not in a worker thread');
  }

  return new WebWorkerSideAdapter();
}
