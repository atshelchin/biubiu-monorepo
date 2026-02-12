/**
 * Test worker for Node.js worker_threads integration tests
 */

import { expose, t } from '../../worker.js';

// Expose test methods
expose({
  // Basic RPC
  add(a: number, b: number): number {
    return a + b;
  },

  multiply(a: number, b: number): number {
    return a * b;
  },

  // Async method
  async asyncAdd(a: number, b: number): Promise<number> {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return a + b;
  },

  // Return types
  returnUndefined(): void {
    // Returns undefined
  },

  returnNull(): null {
    return null;
  },

  returnObject(): { name: string; value: number } {
    return { name: 'test', value: 42 };
  },

  // Error handling
  throwError(): never {
    throw new Error('Test error');
  },

  throwTypeError(): never {
    throw new TypeError('Type error');
  },

  // Streaming - sync generator
  *countdown(from: number): Generator<number> {
    for (let i = from; i >= 0; i--) {
      yield i;
    }
  },

  // Streaming - async generator
  async *asyncStream(count: number): AsyncGenerator<number> {
    for (let i = 0; i < count; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      yield i;
    }
  },

  // Empty generator
  *empty(): Generator<never> {
    // yields nothing
  },

  // Generator that throws
  *throwingGenerator(): Generator<number> {
    yield 1;
    yield 2;
    throw new Error('Generator error');
  },

  // Slow method for timeout tests
  async slowMethod(ms: number): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return 'done';
  },

  // Transferable handling
  processBuffer(buffer: ArrayBuffer): number {
    return buffer.byteLength;
  },

  // Return a buffer (to test transfer from worker)
  createBuffer(size: number): ArrayBuffer {
    const buffer = new ArrayBuffer(size);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < size; i++) {
      view[i] = i % 256;
    }
    return t(buffer);
  },

  // Multiple buffers
  combineBuffers(a: ArrayBuffer, b: ArrayBuffer): ArrayBuffer {
    const result = new ArrayBuffer(a.byteLength + b.byteLength);
    const view = new Uint8Array(result);
    view.set(new Uint8Array(a), 0);
    view.set(new Uint8Array(b), a.byteLength);
    return t(result);
  },
});
