/**
 * Test Worker - contains all methods needed for unit tests
 */

import { expose } from './worker.js';

// For testing pending resolution
let pendingResolvers: Map<string, () => void> = new Map();

expose({
  // === Basic RPC ===
  add(a: number, b: number): number {
    return a + b;
  },

  multiply(a: number, b: number): number {
    return a * b;
  },

  async fetchData(id: number): Promise<{ id: number; name: string }> {
    await new Promise((r) => setTimeout(r, 10));
    return { id, name: 'test' };
  },

  getTime(): number {
    return 1234567890;
  },

  doSomething(): void {
    return undefined;
  },

  getNull(): null {
    return null;
  },

  transform(data: { items: number[]; prefix: string }): { result: string[]; count: number } {
    return {
      result: data.items.map((n) => `${data.prefix}${n}`),
      count: data.items.length,
    };
  },

  // === Error handling ===
  failingMethod(): void {
    throw new Error('Something went wrong');
  },

  throwTypeError(): void {
    throw new TypeError('Invalid type');
  },

  // === Timeout ===
  async slowMethod(): Promise<string> {
    await new Promise((r) => setTimeout(r, 1000));
    return 'done';
  },

  async fastMethod(): Promise<string> {
    await new Promise((r) => setTimeout(r, 10));
    return 'fast';
  },

  method(): string {
    return 'result';
  },

  // === Streaming (generators) ===
  *countdown(from: number) {
    for (let i = from; i >= 0; i--) {
      yield i;
    }
  },

  async *asyncStream(count: number) {
    for (let i = 0; i < count; i++) {
      await new Promise((r) => setTimeout(r, 5));
      yield i * 10;
    }
  },

  async *infiniteStream() {
    let i = 0;
    while (true) {
      await new Promise((r) => setTimeout(r, 10));
      yield i++;
    }
  },

  // Slow stream for timeout testing - yields every 100ms
  async *slowStream() {
    let i = 0;
    while (true) {
      await new Promise((r) => setTimeout(r, 100));
      yield i++;
    }
  },

  *empty() {
    // yields nothing
  },

  *failingGenerator() {
    yield 1;
    yield 2;
    throw new Error('Generator failed');
  },

  // === State hooks ===
  slowMethodWithCallback(): Promise<number> {
    return new Promise<number>((resolve) => {
      pendingResolvers.set('slowMethodWithCallback', () => resolve(42));
    });
  },

  resolveSlowMethod(): void {
    const resolver = pendingResolvers.get('slowMethodWithCallback');
    if (resolver) {
      resolver();
      pendingResolvers.delete('slowMethodWithCallback');
    }
  },

  // === Transferables ===
  processBuffer(buffer: ArrayBuffer): number {
    return buffer.byteLength;
  },

  combineBuffers(buf1: ArrayBuffer, buf2: ArrayBuffer): number {
    return buf1.byteLength + buf2.byteLength;
  },
});
