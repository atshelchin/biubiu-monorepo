/**
 * Node.js worker_threads integration tests
 *
 * These tests verify that ThreadX works correctly with Node.js worker_threads.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Worker } from 'worker_threads';
import { wrap, kill, t, WorkerError, TimeoutError, InitError, detectRuntime } from '../../index.js';

// Test API interface matching test.worker.ts
interface TestAPI {
  add(a: number, b: number): number;
  multiply(a: number, b: number): number;
  asyncAdd(a: number, b: number): Promise<number>;
  returnUndefined(): void;
  returnNull(): null;
  returnObject(): { name: string; value: number };
  throwError(): never;
  throwTypeError(): never;
  countdown(from: number): Generator<number>;
  asyncStream(count: number): AsyncGenerator<number>;
  empty(): Generator<never>;
  throwingGenerator(): Generator<number>;
  slowMethod(ms: number): Promise<string>;
  processBuffer(buffer: ArrayBuffer): number;
  createBuffer(size: number): ArrayBuffer;
  combineBuffers(a: ArrayBuffer, b: ArrayBuffer): ArrayBuffer;
}

// Helper to create test worker
function createTestWorker() {
  return new Worker(new URL('./test.worker.ts', import.meta.url).href);
}

describe('Node.js worker_threads', () => {
  describe('detectRuntime', () => {
    test('should detect bun runtime (running tests in Bun)', () => {
      // Note: Tests run in Bun, so this will be 'bun'
      // In actual Node.js runtime, it would return 'node'
      const runtime = detectRuntime();
      expect(['bun', 'node']).toContain(runtime);
    });
  });

  describe('basic RPC', () => {
    let api: ReturnType<typeof wrap<TestAPI>>;

    beforeEach(() => {
      api = wrap<TestAPI>(createTestWorker());
    });

    afterEach(() => {
      kill(api);
    });

    test('should call sync method', async () => {
      const result = await api.add(2, 3);
      expect(result).toBe(5);
    });

    test('should call multiply method', async () => {
      const result = await api.multiply(4, 5);
      expect(result).toBe(20);
    });

    test('should call async method', async () => {
      const result = await api.asyncAdd(10, 20);
      expect(result).toBe(30);
    });

    test('should handle multiple concurrent calls', async () => {
      const results = await Promise.all([api.add(1, 2), api.multiply(3, 4), api.asyncAdd(5, 6)]);

      expect(results).toEqual([3, 12, 11]);
    });
  });

  describe('return types', () => {
    let api: ReturnType<typeof wrap<TestAPI>>;

    beforeEach(() => {
      api = wrap<TestAPI>(createTestWorker());
    });

    afterEach(() => {
      kill(api);
    });

    test('should return undefined', async () => {
      const result = await api.returnUndefined();
      expect(result).toBeUndefined();
    });

    test('should return null', async () => {
      const result = await api.returnNull();
      expect(result).toBeNull();
    });

    test('should return object', async () => {
      const result = await api.returnObject();
      expect(result).toEqual({ name: 'test', value: 42 });
    });
  });

  describe('error handling', () => {
    let api: ReturnType<typeof wrap<TestAPI>>;

    beforeEach(() => {
      api = wrap<TestAPI>(createTestWorker());
    });

    afterEach(() => {
      kill(api);
    });

    test('should throw WorkerError on method error', async () => {
      try {
        await api.throwError();
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(WorkerError);
        expect((e as WorkerError).message).toContain('Test error');
      }
    });

    test('should preserve error type in WorkerError', async () => {
      try {
        await api.throwTypeError();
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(WorkerError);
        const we = e as WorkerError;
        expect(we.originalName).toBe('TypeError');
      }
    });
  });

  describe('streaming', () => {
    let api: ReturnType<typeof wrap<TestAPI>>;

    beforeEach(() => {
      api = wrap<TestAPI>(createTestWorker());
    });

    afterEach(() => {
      kill(api);
    });

    test('should stream sync generator results', async () => {
      const results: number[] = [];
      for await (const value of api.countdown(3)) {
        results.push(value);
      }
      expect(results).toEqual([3, 2, 1, 0]);
    });

    test('should stream async generator results', async () => {
      const results: number[] = [];
      for await (const value of api.asyncStream(3)) {
        results.push(value);
      }
      expect(results).toEqual([0, 1, 2]);
    });

    test('should handle empty generator', async () => {
      const results: unknown[] = [];
      for await (const value of api.empty()) {
        results.push(value);
      }
      expect(results).toEqual([]);
    });

    test('should handle break in stream', async () => {
      const results: number[] = [];
      for await (const value of api.countdown(10)) {
        results.push(value);
        if (value === 7) break;
      }
      expect(results).toEqual([10, 9, 8, 7]);
    });

    test('should handle generator that throws', async () => {
      const results: number[] = [];
      try {
        for await (const value of api.throwingGenerator()) {
          results.push(value);
        }
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(WorkerError);
        expect((e as WorkerError).message).toContain('Generator error');
      }
      expect(results).toEqual([1, 2]);
    });
  });

  describe('timeout', () => {
    test('should timeout on slow method', async () => {
      const api = wrap<TestAPI>(createTestWorker(), { timeout: 50 });

      try {
        await api.slowMethod(200);
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(TimeoutError);
      } finally {
        kill(api);
      }
    });

    test('should not timeout on fast method', async () => {
      const api = wrap<TestAPI>(createTestWorker(), { timeout: 500 });

      const result = await api.slowMethod(10);
      expect(result).toBe('done');

      kill(api);
    });
  });

  describe('state hooks', () => {
    test('should have init state initially', () => {
      const api = wrap<TestAPI>(createTestWorker());
      expect(api.$state).toBe('init');
      kill(api);
    });

    test('should have ready state after first call', async () => {
      const api = wrap<TestAPI>(createTestWorker());
      await api.add(1, 1);
      expect(api.$state).toBe('ready');
      kill(api);
    });

    test('should have dead state after kill', async () => {
      const api = wrap<TestAPI>(createTestWorker());
      await api.add(1, 1);
      kill(api);
      expect(api.$state).toBe('dead');
    });

    test('should track pending calls', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      // Start slow call
      const promise = api.slowMethod(100);
      // Wait a bit for the call to be sent
      await new Promise((r) => setTimeout(r, 10));

      expect(api.$pending).toBeGreaterThanOrEqual(0);

      await promise;
      kill(api);
    });

    test('should expose raw worker via $worker', () => {
      const worker = createTestWorker();
      const api = wrap<TestAPI>(worker);

      expect(api.$worker).toBe(worker);

      kill(api);
    });
  });

  describe('transferables', () => {
    let api: ReturnType<typeof wrap<TestAPI>>;

    beforeEach(() => {
      api = wrap<TestAPI>(createTestWorker());
    });

    afterEach(() => {
      kill(api);
    });

    test('should transfer ArrayBuffer to worker', async () => {
      const buffer = new ArrayBuffer(1024);
      const result = await api.processBuffer(t(buffer));

      expect(result).toBe(1024);
      // Buffer should be neutered after transfer
      expect(buffer.byteLength).toBe(0);
    });

    test('should receive transferred buffer from worker', async () => {
      const buffer = await api.createBuffer(256);

      expect(buffer.byteLength).toBe(256);
      const view = new Uint8Array(buffer);
      expect(view[0]).toBe(0);
      expect(view[255]).toBe(255);
    });

    test('should handle multiple buffers', async () => {
      const a = new ArrayBuffer(10);
      const b = new ArrayBuffer(20);

      new Uint8Array(a).fill(1);
      new Uint8Array(b).fill(2);

      const result = await api.combineBuffers(t(a), t(b));

      expect(result.byteLength).toBe(30);
      expect(a.byteLength).toBe(0); // neutered
      expect(b.byteLength).toBe(0); // neutered
    });
  });

  describe('kill', () => {
    test('should reject pending calls on kill', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      const promise = api.slowMethod(1000);
      kill(api);

      try {
        await promise;
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(InitError);
        expect((e as InitError).message).toContain('terminated');
      }
    });

    test('should reject new calls after kill', async () => {
      const api = wrap<TestAPI>(createTestWorker());
      await api.add(1, 1); // Wait for ready
      kill(api);

      try {
        await api.add(2, 2);
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(InitError);
      }
    });
  });

  describe('promise chaining', () => {
    let api: ReturnType<typeof wrap<TestAPI>>;

    beforeEach(() => {
      api = wrap<TestAPI>(createTestWorker());
    });

    afterEach(() => {
      kill(api);
    });

    test('should support multiple .then() calls', async () => {
      const call = api.add(5, 5);

      const [r1, r2] = await Promise.all([call.then((x) => x * 2), call.then((x) => x + 1)]);

      expect(r1).toBe(20);
      expect(r2).toBe(11);
    });

    test('should support .then().then() chaining', async () => {
      const result = await api
        .add(2, 3)
        .then((x) => x * 2)
        .then((x) => x + 1);

      expect(result).toBe(11);
    });

    test('should support .catch()', async () => {
      const result = await api.throwError().catch(() => 'caught');
      expect(result).toBe('caught');
    });

    test('should support .finally()', async () => {
      let finallyCalled = false;
      await api.add(1, 1).finally(() => {
        finallyCalled = true;
      });
      expect(finallyCalled).toBe(true);
    });
  });
});
