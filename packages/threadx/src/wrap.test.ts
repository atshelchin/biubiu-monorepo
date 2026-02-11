import { describe, test, expect } from 'bun:test';
import { wrap, kill } from './wrap';
import { t } from './transfer';
import { WorkerError, TimeoutError, InitError } from './errors';

// Helper to create real worker
function createTestWorker() {
  return new Worker(new URL('./test.worker.ts', import.meta.url).href);
}

// Interface for test worker
interface TestAPI {
  add(a: number, b: number): number;
  multiply(a: number, b: number): number;
  fetchData(id: number): Promise<{ id: number; name: string }>;
  getTime(): number;
  doSomething(): void;
  getNull(): null;
  transform(data: { items: number[]; prefix: string }): { result: string[]; count: number };
  failingMethod(): void;
  throwTypeError(): void;
  slowMethod(): string;
  fastMethod(): string;
  method(): string;
  countdown(from: number): Generator<number>;
  asyncStream(count: number): AsyncGenerator<number>;
  infiniteStream(): AsyncGenerator<number>;
  slowStream(): AsyncGenerator<number>;
  empty(): Generator<never>;
  failingGenerator(): Generator<number>;
  processBuffer(buffer: ArrayBuffer): number;
  combineBuffers(buf1: ArrayBuffer, buf2: ArrayBuffer): number;
  nonExistent(): void;
}

describe('wrap', () => {
  describe('basic RPC', () => {
    test('should call simple synchronous method', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      const result = await api.add(2, 3);
      expect(result).toBe(5);

      kill(api);
    });

    test('should call async method', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      const result = await api.fetchData(42);
      expect(result).toEqual({ id: 42, name: 'test' });

      kill(api);
    });

    test('should handle multiple concurrent calls', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      const results = await Promise.all([api.multiply(2, 3), api.multiply(4, 5), api.multiply(6, 7)]);

      expect(results).toEqual([6, 20, 42]);

      kill(api);
    });

    test('should handle method with no arguments', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      const result = await api.getTime();
      expect(result).toBe(1234567890);

      kill(api);
    });

    test('should handle method returning undefined', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      const result = await api.doSomething();
      expect(result).toBeUndefined();

      kill(api);
    });

    test('should handle method returning null', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      const result = await api.getNull();
      expect(result).toBeNull();

      kill(api);
    });

    test('should handle complex object arguments and return values', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      const result = await api.transform({ items: [1, 2, 3], prefix: 'item-' });
      expect(result).toEqual({
        result: ['item-1', 'item-2', 'item-3'],
        count: 3,
      });

      kill(api);
    });
  });

  describe('error handling', () => {
    test('should throw WorkerError when method throws', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      let caught: Error | null = null;
      try {
        await api.failingMethod();
        expect.unreachable('Should have thrown');
      } catch (e) {
        caught = e as Error;
      }

      expect(caught).toBeInstanceOf(WorkerError);
      expect((caught as WorkerError).message).toBe('Something went wrong');

      kill(api);
    });

    test('should preserve error type name', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      try {
        await api.throwTypeError();
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(WorkerError);
        expect((e as WorkerError).name).toBe('TypeError');
      }

      kill(api);
    });

    test('should throw WorkerError when method not found', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      let caught: Error | null = null;
      try {
        await api.nonExistent();
        expect.unreachable('Should have thrown');
      } catch (e) {
        caught = e as Error;
      }

      expect(caught).toBeInstanceOf(WorkerError);
      expect((caught as WorkerError).message).toContain('nonExistent');
      expect((caught as WorkerError).message).toContain('not found');

      kill(api);
    });

    test('should throw InitError when worker fails', async () => {
      const failingWorker = new Worker(new URL('./test-fail.worker.ts', import.meta.url).href);
      const api = wrap<TestAPI>(failingWorker);

      let caught: Error | null = null;
      try {
        await api.method();
        expect.unreachable('Should have thrown');
      } catch (e) {
        caught = e as Error;
      }

      expect(caught).toBeInstanceOf(InitError);
    });
  });

  describe('timeout', () => {
    test('should timeout slow methods', async () => {
      const api = wrap<TestAPI>(createTestWorker(), { timeout: 50 });

      let caught: Error | null = null;
      try {
        await api.slowMethod();
        expect.unreachable('Should have thrown');
      } catch (e) {
        caught = e as Error;
      }

      expect(caught).toBeInstanceOf(TimeoutError);

      kill(api);
    });

    test('should not timeout fast methods', async () => {
      const api = wrap<TestAPI>(createTestWorker(), { timeout: 500 });

      const result = await api.fastMethod();
      expect(result).toBe('fast');

      kill(api);
    });

    test('should use default timeout when not specified', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      // Default timeout is 30000ms, this should not timeout
      const result = await api.method();
      expect(result).toBe('result');

      kill(api);
    });
  });

  describe('streaming (generators)', () => {
    test('should stream values from sync generator', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      const values: number[] = [];
      for await (const n of api.countdown(3)) {
        values.push(n);
      }

      expect(values).toEqual([3, 2, 1, 0]);

      kill(api);
    });

    test('should stream values from async generator', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      const values: number[] = [];
      for await (const n of api.asyncStream(3)) {
        values.push(n);
      }

      expect(values).toEqual([0, 10, 20]);

      kill(api);
    });

    test('should support breaking out of streaming early', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      const values: number[] = [];
      for await (const n of api.infiniteStream()) {
        values.push(n);
        if (n >= 2) break;
      }

      expect(values).toEqual([0, 1, 2]);

      kill(api);
    });

    test('should handle empty generator', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      const values: unknown[] = [];
      for await (const n of api.empty()) {
        values.push(n);
      }

      expect(values).toEqual([]);

      kill(api);
    });

    test('should handle generator that throws', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      const values: number[] = [];
      await expect(
        (async () => {
          for await (const n of api.failingGenerator()) {
            values.push(n);
          }
        })()
      ).rejects.toThrow('Generator failed');

      expect(values).toEqual([1, 2]);

      kill(api);
    });
  });

  describe('state hooks', () => {
    test('should expose $state', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      // Initially in init state
      expect(api.$state).toBe('init');

      // Wait for ready
      await api.method();
      expect(api.$state).toBe('ready');

      kill(api);
    });

    test('should expose $pending count', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      expect(api.$pending).toBe(0);

      // Start a slow call
      const promise = api.slowMethod();
      promise.catch(() => {}); // Suppress unhandled rejection when killed
      // After calling but before resolving
      await new Promise((r) => setTimeout(r, 10));
      expect(api.$pending).toBe(1);

      // Don't wait for slowMethod to finish, just verify pending count
      kill(api);
    });

    test('should expose $worker', () => {
      const worker = createTestWorker();
      const api = wrap<TestAPI>(worker);

      expect(api.$worker).toBe(worker);

      kill(api);
    });
  });

  describe('transferables', () => {
    test('should handle transferable arguments', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      const buffer = new ArrayBuffer(1024);
      const result = await api.processBuffer(t(buffer));

      expect(result).toBe(1024);
      // After transfer, original buffer is neutered
      expect(buffer.byteLength).toBe(0);

      kill(api);
    });

    test('should handle multiple transferables', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      const buf1 = new ArrayBuffer(100);
      const buf2 = new ArrayBuffer(200);
      const result = await api.combineBuffers(t(buf1), t(buf2));

      expect(result).toBe(300);
      // Both buffers should be neutered
      expect(buf1.byteLength).toBe(0);
      expect(buf2.byteLength).toBe(0);

      kill(api);
    });
  });

  describe('kill', () => {
    test('should terminate worker', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      // Wait for ready
      await api.method();
      expect(api.$state).toBe('ready');

      // Kill the worker
      kill(api);

      // State should be dead
      expect(api.$state).toBe('dead');
    });

    test('should reject calls after kill', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      // Wait for ready
      await api.method();

      // Kill the worker
      kill(api);

      // Calling after kill should throw
      let caught: Error | null = null;
      try {
        await api.method();
        expect.unreachable('Should have thrown');
      } catch (e) {
        caught = e as Error;
      }

      expect(caught).toBeInstanceOf(InitError);
      expect(caught?.message).toContain('terminated');
    });

    test('should reject pending calls on kill', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      // Start a slow call
      const promise = api.slowMethod();

      // Give it time to start
      await new Promise((r) => setTimeout(r, 10));

      // Kill while pending
      kill(api);

      // Pending call should be rejected
      let caught: Error | null = null;
      try {
        await promise;
        expect.unreachable('Should have thrown');
      } catch (e) {
        caught = e as Error;
      }

      expect(caught).toBeInstanceOf(InitError);
      expect(caught?.message).toContain('terminated');
    });
  });

  describe('call buffering before ready', () => {
    test('should buffer calls made before ready and execute after', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      // Make calls immediately (before ready)
      const p1 = api.add(1, 2);
      const p2 = api.multiply(3, 4);

      const results = await Promise.all([p1, p2]);

      expect(results).toEqual([3, 12]);

      kill(api);
    });
  });

  describe('promise chaining', () => {
    test('should support multiple .then() calls on same result', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      const result = api.add(1, 2);

      // Multiple .then() calls should all receive the same value
      const results = await Promise.all([
        result.then((v) => v),
        result.then((v) => (v as number) * 2),
        result.then((v) => (v as number) + 10),
      ]);

      expect(results).toEqual([3, 6, 13]);

      kill(api);
    });

    test('should support .then().then() chaining', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      const result = await api
        .add(1, 2)
        .then((v) => (v as number) * 2)
        .then((v) => v + 10);

      expect(result).toBe(16); // (1+2)*2+10

      kill(api);
    });

    test('should support .catch() and .finally()', async () => {
      const api = wrap<TestAPI>(createTestWorker());

      let finallyCalled = false;
      let catchCalled = false;

      // Test successful case with finally
      const result = await api.add(1, 2).finally(() => {
        finallyCalled = true;
      });
      expect(result).toBe(3);
      expect(finallyCalled).toBe(true);

      // Test error case with catch
      try {
        await api.failingMethod().catch((e) => {
          catchCalled = true;
          throw e;
        });
      } catch {
        // Expected
      }
      expect(catchCalled).toBe(true);

      kill(api);
    });
  });

  describe('streaming timeout', () => {
    test('should timeout streaming calls', async () => {
      // slowStream yields every 100ms, timeout is 50ms
      // First value takes 100ms which exceeds 50ms timeout
      const api = wrap<TestAPI>(createTestWorker(), { timeout: 50 });

      const values: number[] = [];
      let caught: Error | null = null;

      try {
        for await (const n of api.slowStream()) {
          values.push(n);
        }
      } catch (e) {
        caught = e as Error;
      }

      expect(caught).toBeInstanceOf(TimeoutError);
      // Should timeout before receiving any values (100ms > 50ms)
      expect(values.length).toBe(0);

      kill(api);
    });

    test('should reset timeout on each yield', async () => {
      // infiniteStream yields every 10ms, timeout is 50ms
      // Should receive multiple values as timeout resets on each yield
      const api = wrap<TestAPI>(createTestWorker(), { timeout: 50 });

      const values: number[] = [];
      for await (const n of api.infiniteStream()) {
        values.push(n);
        if (n >= 3) break; // Stop after receiving 4 values (0,1,2,3)
      }

      // Should have received values without timeout
      expect(values).toEqual([0, 1, 2, 3]);

      kill(api);
    });
  });
});
