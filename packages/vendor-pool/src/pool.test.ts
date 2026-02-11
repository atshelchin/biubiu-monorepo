import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { Pool } from './pool.js';
import { Vendor } from './vendor.js';
import { ErrorType } from './types.js';
import {
  EscalationError,
  LogicError,
  TimeoutError,
  NoVendorAvailableError,
} from './errors.js';
import { MemoryStorageAdapter } from './storage/memory.js';

// Test vendor that can be configured to succeed or fail
class MockVendor extends Vendor<string, string> {
  readonly id: string;
  private behavior: 'success' | 'rate-limit' | 'server-error' | 'logic-error' | 'timeout';
  private delay: number;
  public callCount = 0;

  constructor(
    id: string,
    behavior: 'success' | 'rate-limit' | 'server-error' | 'logic-error' | 'timeout' = 'success',
    delay = 0
  ) {
    super();
    this.id = id;
    this.behavior = behavior;
    this.delay = delay;
  }

  setBehavior(behavior: 'success' | 'rate-limit' | 'server-error' | 'logic-error' | 'timeout') {
    this.behavior = behavior;
  }

  async execute(input: string): Promise<string> {
    this.callCount++;

    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }

    switch (this.behavior) {
      case 'success':
        return `${this.id}: ${input}`;
      case 'rate-limit':
        throw new Error('HTTP 429 Too Many Requests');
      case 'server-error':
        throw new Error('HTTP 500 Internal Server Error');
      case 'logic-error':
        throw new Error('HTTP 400 Bad Request - Invalid parameters');
      case 'timeout':
        throw new Error('Request timeout');
    }
  }
}

describe('Pool', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  describe('constructor', () => {
    it('should throw if no vendors provided', () => {
      expect(() => new Pool([])).toThrow('Pool requires at least one vendor');
    });

    it('should create pool with single vendor', () => {
      const pool = new Pool([new MockVendor('v1')]);
      expect(pool).toBeDefined();
    });

    it('should create pool with multiple vendors', () => {
      const pool = new Pool([new MockVendor('v1'), new MockVendor('v2')]);
      expect(pool).toBeDefined();
    });
  });

  describe('do() - basic execution', () => {
    it('should execute task successfully with single vendor', async () => {
      const pool = new Pool([new MockVendor('v1')], { storage });
      const result = await pool.do('hello');

      expect(result.result).toBe('v1: hello');
      expect(result.vendorId).toBe('v1');
      expect(result.retries).toBe(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should execute task successfully with multiple vendors', async () => {
      const pool = new Pool([new MockVendor('v1'), new MockVendor('v2')], { storage });
      const result = await pool.do('hello');

      expect(result.result).toMatch(/^v[12]: hello$/);
      expect(result.retries).toBe(0);
    });

    it('should return metadata in result', async () => {
      const pool = new Pool([new MockVendor('v1')], { storage });
      const result = await pool.do('test');

      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('vendorId');
      expect(result).toHaveProperty('retries');
      expect(result).toHaveProperty('duration');
    });
  });

  describe('do() - failover', () => {
    it('should failover to second vendor when first fails', async () => {
      const v1 = new MockVendor('v1', 'server-error');
      const v2 = new MockVendor('v2', 'success');

      const pool = new Pool([v1, v2], {
        storage,
        softFreezeDuration: [100, 100],
        hardFreezeDuration: [100, 100],
      });

      const result = await pool.do('hello');

      expect(result.vendorId).toBe('v2');
      expect(result.retries).toBe(1);
      expect(v1.callCount).toBe(1);
      expect(v2.callCount).toBe(1);
    });

    it('should try multiple vendors before succeeding', async () => {
      const v1 = new MockVendor('v1', 'server-error');
      const v2 = new MockVendor('v2', 'server-error');
      const v3 = new MockVendor('v3', 'success');

      const pool = new Pool([v1, v2, v3], {
        storage,
        hardFreezeDuration: [50, 50],
      });

      const result = await pool.do('hello');

      expect(result.vendorId).toBe('v3');
      expect(result.retries).toBe(2);
    });

    it('should respect vendor freeze after failure', async () => {
      const v1 = new MockVendor('v1', 'server-error');
      const v2 = new MockVendor('v2', 'success');

      const pool = new Pool([v1, v2], {
        storage,
        hardFreezeDuration: [5000, 5000], // Long freeze
      });

      // First call - v1 fails, v2 succeeds
      await pool.do('hello');

      // Second call - v1 should still be frozen, v2 should be used
      v1.callCount = 0;
      v2.callCount = 0;

      await pool.do('world');

      expect(v1.callCount).toBe(0); // Should not be called (frozen)
      expect(v2.callCount).toBe(1);
    });
  });

  describe('do() - rate limiting', () => {
    it('should soft freeze vendor on rate limit', async () => {
      const v1 = new MockVendor('v1', 'rate-limit');
      const v2 = new MockVendor('v2', 'success');

      const pool = new Pool([v1, v2], {
        storage,
        softFreezeDuration: [100, 100],
      });

      const result = await pool.do('hello');

      expect(result.vendorId).toBe('v2');

      // Check v1 is frozen
      const states = pool.getVendorStates();
      const v1State = states.find((s) => s.id === 'v1');
      expect(v1State?.frozenUntil).toBeGreaterThan(Date.now());
      expect(v1State?.isStable).toBe(true); // Should be locked
    });

    it('should back off further when already stable vendor hits rate limit again', async () => {
      // Create a vendor that alternates between success and rate limit
      let callCount = 0;
      const DynamicVendor = class extends Vendor<string, string> {
        readonly id = 'dynamic';
        async execute(input: string): Promise<string> {
          callCount++;
          // First 5 calls succeed, then rate limit
          if (callCount <= 5) return `ok: ${input}`;
          throw new Error('HTTP 429 Too Many Requests');
        }
      };

      const v1 = new DynamicVendor();
      const pool = new Pool([v1], {
        storage,
        initialMinTime: 500, // Start at 2 QPS
        rateLimitBackoff: 1.25,
        softFreezeDuration: [10, 10], // Very short freeze
        timeout: 5000,
      });

      // First 5 calls succeed
      for (let i = 0; i < 5; i++) {
        await pool.do(`task-${i}`);
      }

      const statesBefore = pool.getVendorStates();
      const minTimeBefore = statesBefore[0].minTime;
      expect(statesBefore[0].isStable).toBe(false); // Not yet stable

      // 6th call triggers rate limit, locks it
      try {
        await pool.do('trigger-limit');
      } catch (e) {
        // May throw escalation, that's ok
      }

      const statesAfter = pool.getVendorStates();
      expect(statesAfter[0].isStable).toBe(true); // Now stable
      expect(statesAfter[0].minTime).toBeGreaterThan(minTimeBefore); // minTime increased
    });
  });

  describe('do() - logic errors', () => {
    it('should throw LogicError immediately without retry', async () => {
      const v1 = new MockVendor('v1', 'logic-error');
      const v2 = new MockVendor('v2', 'success');

      const pool = new Pool([v1, v2], { storage });

      await expect(pool.do('hello')).rejects.toThrow(LogicError);

      // v2 should not be called for logic errors
      expect(v2.callCount).toBe(0);
    });

    it('should include vendor id and original error in LogicError', async () => {
      const v1 = new MockVendor('v1', 'logic-error');

      const pool = new Pool([v1], { storage });

      try {
        await pool.do('hello');
      } catch (e) {
        expect(e).toBeInstanceOf(LogicError);
        expect((e as LogicError).vendorId).toBe('v1');
        expect((e as LogicError).originalError.message).toContain('400');
      }
    });
  });

  describe('do() - escalation', () => {
    it('should escalate after max retries', async () => {
      const v1 = new MockVendor('v1', 'server-error');

      const pool = new Pool([v1], {
        storage,
        maxRetries: 3,
        hardFreezeDuration: [10, 10], // Short freeze to allow quick retries
        timeout: 10000,
      });

      await expect(pool.do('hello')).rejects.toThrow(EscalationError);
    });

    it('should escalate after max consecutive failures', async () => {
      const v1 = new MockVendor('v1', 'server-error');
      const v2 = new MockVendor('v2', 'server-error');

      const pool = new Pool([v1, v2], {
        storage,
        maxConsecutiveFailures: 3,
        hardFreezeDuration: [10, 10],
        timeout: 10000,
      });

      await expect(pool.do('hello')).rejects.toThrow(EscalationError);
    });

    it('should call onEscalate callback before throwing', async () => {
      const v1 = new MockVendor('v1', 'server-error');
      let escalationCalled = false;
      let escalationContext: any = null;

      const pool = new Pool([v1], {
        storage,
        maxRetries: 2,
        hardFreezeDuration: [10, 10],
        timeout: 10000,
        onEscalate: async (context) => {
          escalationCalled = true;
          escalationContext = context;
        },
      });

      await expect(pool.do('test-input')).rejects.toThrow(EscalationError);

      expect(escalationCalled).toBe(true);
      expect(escalationContext).not.toBeNull();
      expect(escalationContext.taskInput).toBe('test-input');
      expect(escalationContext.totalRetries).toBeGreaterThanOrEqual(2);
      expect(escalationContext.vendorStates).toHaveLength(1);
    });

    it('should include context in EscalationError', async () => {
      const v1 = new MockVendor('v1', 'server-error');

      const pool = new Pool([v1], {
        storage,
        maxRetries: 2,
        hardFreezeDuration: [10, 10],
        timeout: 10000,
      });

      try {
        await pool.do('hello');
      } catch (e) {
        expect(e).toBeInstanceOf(EscalationError);
        const error = e as EscalationError;
        expect(error.context.totalRetries).toBeGreaterThanOrEqual(2);
        expect(error.context.vendorStates).toHaveLength(1);
        expect(error.context.taskInput).toBe('hello');
      }
    });
  });

  describe('do() - timeout', () => {
    it('should throw TimeoutError when timeout exceeded during retries', async () => {
      const v1 = new MockVendor('v1', 'server-error');

      const pool = new Pool([v1], {
        storage,
        timeout: 100,
        hardFreezeDuration: [50, 50],
        maxRetries: 100, // High limit so timeout triggers first
      });

      await expect(pool.do('hello')).rejects.toThrow(TimeoutError);
    });

    it('should throw TimeoutError when single execution exceeds timeout', async () => {
      // This tests that timeout is enforced DURING execution, not just between retries
      const slowVendor = new MockVendor('slow', 'success', 3000); // 3 second delay

      const pool = new Pool([slowVendor], {
        storage,
        timeout: 500, // 500ms timeout
        maxRetries: 10,
      });

      const start = Date.now();
      await expect(pool.do('hello')).rejects.toThrow(TimeoutError);
      const elapsed = Date.now() - start;

      // Should timeout around 500ms, not wait for 3 seconds
      expect(elapsed).toBeLessThan(1000);
      expect(elapsed).toBeGreaterThanOrEqual(450);
    });

    it('should include elapsed time and timeout in TimeoutError', async () => {
      const slowVendor = new MockVendor('slow', 'success', 2000);

      const pool = new Pool([slowVendor], {
        storage,
        timeout: 200,
      });

      try {
        await pool.do('hello');
        expect(true).toBe(false); // Should not reach here
      } catch (e) {
        expect(e).toBeInstanceOf(TimeoutError);
        const err = e as TimeoutError;
        expect(err.timeout).toBe(200);
        expect(err.elapsedTime).toBeGreaterThanOrEqual(200);
        expect(err.elapsedTime).toBeLessThan(500);
      }
    });
  });

  describe('do() - waiting for unfreeze', () => {
    it('should wait for vendor to unfreeze when all are frozen', async () => {
      const v1 = new MockVendor('v1', 'server-error');

      // After first failure, change to success
      let firstCall = true;
      const originalExecute = v1.execute.bind(v1);
      v1.execute = async (input: string) => {
        if (firstCall) {
          firstCall = false;
          throw new Error('HTTP 500 Server Error');
        }
        return `v1: ${input}`;
      };

      const pool = new Pool([v1], {
        storage,
        hardFreezeDuration: [50, 50], // Short freeze
        timeout: 5000,
      });

      const result = await pool.do('hello');

      expect(result.vendorId).toBe('v1');
      expect(result.retries).toBe(1);
    });
  });

  describe('vendor selection', () => {
    it('should prefer vendor with lower queue length', async () => {
      // This is hard to test directly, but we can verify the pool distributes work
      const v1 = new MockVendor('v1', 'success', 10);
      const v2 = new MockVendor('v2', 'success', 10);

      const pool = new Pool([v1, v2], { storage });

      // Run multiple concurrent requests
      await Promise.all([pool.do('a'), pool.do('b'), pool.do('c'), pool.do('d')]);

      // Both vendors should have been used
      expect(v1.callCount + v2.callCount).toBe(4);
    });

    it('should prefer vendor with higher weight when queue lengths equal', async () => {
      const v1 = new MockVendor('v1', 'success');
      const v2 = new (class extends MockVendor {
        constructor() {
          super('v2', 'success');
        }
      })();

      // Create v2 with higher weight
      const HighWeightVendor = class extends Vendor<string, string> {
        readonly id = 'v2-weighted';
        readonly weight = 10;
        async execute(input: string) {
          return `v2-weighted: ${input}`;
        }
      };

      const pool = new Pool([v1, new HighWeightVendor()], { storage });
      const result = await pool.do('hello');

      // Higher weight vendor should be preferred
      expect(result.vendorId).toBe('v2-weighted');
    });
  });

  describe('concurrent load distribution', () => {
    it('should distribute concurrent tasks across multiple vendors', async () => {
      // Create vendors with some delay to simulate real work
      const v1 = new MockVendor('v1', 'success', 100);
      const v2 = new MockVendor('v2', 'success', 100);
      const v3 = new MockVendor('v3', 'success', 100);

      const pool = new Pool([v1, v2, v3], { storage });

      // Launch 30 concurrent tasks
      const tasks = Array.from({ length: 30 }, (_, i) => pool.do(`task-${i}`));
      await Promise.all(tasks);

      // Each vendor should handle roughly equal number of tasks
      // Allow for some variance, but ensure distribution is not heavily skewed
      expect(v1.callCount).toBeGreaterThan(5);
      expect(v2.callCount).toBeGreaterThan(5);
      expect(v3.callCount).toBeGreaterThan(5);
      expect(v1.callCount + v2.callCount + v3.callCount).toBe(30);
    });

    it('should track pending tasks for load balancing', async () => {
      // Create a slow vendor
      const v1 = new MockVendor('v1', 'success', 200);
      const v2 = new MockVendor('v2', 'success', 200);

      const pool = new Pool([v1, v2], { storage });

      // Launch concurrent tasks - they should be distributed
      const tasks = [pool.do('a'), pool.do('b'), pool.do('c'), pool.do('d')];
      await Promise.all(tasks);

      // Both vendors should have been used due to pending count tracking
      expect(v1.callCount).toBeGreaterThanOrEqual(1);
      expect(v2.callCount).toBeGreaterThanOrEqual(1);
    });

    it('should distribute work across multiple vendors', async () => {
      // Multiple vendors - work should be distributed
      const v1Multi = new MockVendor('v1-multi', 'success', 30);
      const v2Multi = new MockVendor('v2-multi', 'success', 30);
      const v3Multi = new MockVendor('v3-multi', 'success', 30);
      const poolMulti = new Pool([v1Multi, v2Multi, v3Multi], {
        storage: new MemoryStorageAdapter(),
        initialMinTime: 10, // High QPS to minimize rate limiting impact
      });

      await Promise.all(Array.from({ length: 6 }, (_, i) => poolMulti.do(`task-${i}`)));

      // Multi-vendor pool should distribute work across vendors
      expect(v1Multi.callCount + v2Multi.callCount + v3Multi.callCount).toBe(6);
      expect(v1Multi.callCount).toBeGreaterThanOrEqual(1);
      expect(v2Multi.callCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('state persistence', () => {
    it('should persist vendor state after success', async () => {
      const v1 = new MockVendor('v1', 'success');
      const pool = new Pool([v1], { storage });

      await pool.do('hello');

      const savedState = await storage.get('vendor:v1');
      expect(savedState).not.toBeNull();
      expect((savedState as any).successCount).toBe(1);
    });

    it('should persist vendor state after failure', async () => {
      const v1 = new MockVendor('v1', 'server-error');
      const v2 = new MockVendor('v2', 'success');

      const pool = new Pool([v1, v2], {
        storage,
        hardFreezeDuration: [100, 100],
      });

      await pool.do('hello');

      const savedState = await storage.get('vendor:v1');
      expect(savedState).not.toBeNull();
      expect((savedState as any).failureCount).toBe(1);
      expect((savedState as any).frozenUntil).toBeGreaterThan(Date.now());
    });

    it('should restore state on next pool creation', async () => {
      const v1 = new MockVendor('v1', 'success');
      const pool1 = new Pool([v1], { storage });

      // Execute some tasks
      await pool1.do('hello');
      await pool1.do('world');

      // Create new pool with same storage
      const v1New = new MockVendor('v1', 'success');
      const pool2 = new Pool([v1New], { storage });

      await pool2.do('test');

      // Should have restored count and incremented
      const states = pool2.getVendorStates();
      expect(states[0].successCount).toBe(3);
    });
  });

  describe('getVendorStates', () => {
    it('should return states of all vendors', async () => {
      const pool = new Pool([new MockVendor('v1'), new MockVendor('v2')], { storage });

      await pool.do('hello');

      const states = pool.getVendorStates();
      expect(states).toHaveLength(2);
      expect(states.map((s) => s.id).sort()).toEqual(['v1', 'v2']);
    });
  });

  describe('reset', () => {
    it('should reset all vendors to initial state', async () => {
      const v1 = new MockVendor('v1', 'success');
      const pool = new Pool([v1], { storage, initialMinTime: 200 });

      await pool.do('hello');
      await pool.reset();

      const states = pool.getVendorStates();
      expect(states[0].successCount).toBe(0);
      expect(states[0].failureCount).toBe(0);
      expect(states[0].isStable).toBe(false);
      expect(states[0].minTime).toBe(200);
    });
  });

  describe('clearStorage', () => {
    it('should clear all persisted state', async () => {
      const pool = new Pool([new MockVendor('v1')], { storage });

      await pool.do('hello');
      expect(storage.size).toBeGreaterThan(0);

      await pool.clearStorage();

      const keys = await storage.keys('vendor:');
      expect(keys).toHaveLength(0);
    });
  });
});
