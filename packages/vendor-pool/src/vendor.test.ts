import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { Vendor } from './vendor.js';
import { ErrorType } from './types.js';
import { VendorExecutionError } from './errors.js';

// Test implementation of Vendor
class TestVendor extends Vendor<string, string> {
  readonly id = 'test-vendor';
  private mockExecute: (input: string) => Promise<string>;

  constructor(mockFn?: (input: string) => Promise<string>) {
    super();
    this.mockExecute = mockFn ?? (async (input) => `processed: ${input}`);
  }

  setMockExecute(fn: (input: string) => Promise<string>) {
    this.mockExecute = fn;
  }

  async execute(input: string): Promise<string> {
    return this.mockExecute(input);
  }
}

// Vendor with custom error classification
class CustomErrorVendor extends Vendor<string, string> {
  readonly id = 'custom-error-vendor';

  async execute(input: string): Promise<string> {
    if (input === 'rate-limit') {
      throw new Error('Custom rate limit');
    }
    return input;
  }

  classifyError(error: unknown): ErrorType {
    if (error instanceof Error && error.message.includes('Custom rate limit')) {
      return ErrorType.RATE_LIMIT;
    }
    return ErrorType.UNKNOWN;
  }
}

describe('Vendor', () => {
  let vendor: TestVendor;

  beforeEach(() => {
    vendor = new TestVendor();
    vendor.initialize({
      initialMinTime: 100,
      probeStep: 10,
      rateLimitBackoff: 1.25,
    });
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const state = vendor.getState();
      expect(state.id).toBe('test-vendor');
      expect(state.isStable).toBe(false);
      expect(state.minTime).toBe(100);
      expect(state.frozenUntil).toBe(0);
      expect(state.successCount).toBe(0);
      expect(state.failureCount).toBe(0);
    });

    it('should restore saved state', () => {
      const newVendor = new TestVendor();
      newVendor.initialize({
        initialMinTime: 100,
        probeStep: 10,
        rateLimitBackoff: 1.25,
        savedState: {
          id: 'test-vendor',
          isStable: true,
          minTime: 200,
          frozenUntil: 0,
          successCount: 50,
          failureCount: 5,
        },
      });

      const state = newVendor.getState();
      expect(state.isStable).toBe(true);
      expect(state.minTime).toBe(200);
      expect(state.successCount).toBe(50);
      expect(state.failureCount).toBe(5);
    });

    it('should not re-initialize', () => {
      const state1 = vendor.getState();
      vendor.initialize({
        initialMinTime: 999,
        probeStep: 10,
        rateLimitBackoff: 1.25,
      });
      const state2 = vendor.getState();
      expect(state1.minTime).toBe(state2.minTime);
    });
  });

  describe('schedule', () => {
    it('should execute task successfully', async () => {
      const result = await vendor.schedule('hello');
      expect(result).toBe('processed: hello');
    });

    it('should increment success count on success', async () => {
      await vendor.schedule('hello');
      const state = vendor.getState();
      expect(state.successCount).toBe(1);
      expect(state.failureCount).toBe(0);
    });

    it('should speed up when not stable (probing)', async () => {
      const initialMinTime = vendor.getState().minTime;
      await vendor.schedule('hello');
      const newMinTime = vendor.getState().minTime;
      expect(newMinTime).toBe(initialMinTime - 10); // probeStep = 10
    });

    it('should not speed up below minimum (50ms)', async () => {
      // Set minTime close to minimum
      vendor.reset(60);
      await vendor.schedule('hello');
      const state = vendor.getState();
      expect(state.minTime).toBe(50); // Should stop at 50
    });

    it('should not speed up when stable', async () => {
      // Trigger rate limit to become stable
      vendor.setMockExecute(async () => {
        throw new Error('429 Too Many Requests');
      });

      try {
        await vendor.schedule('hello');
      } catch {}

      // Reset to successful execution
      vendor.setMockExecute(async (input) => `processed: ${input}`);

      const stateAfterRateLimit = vendor.getState();
      expect(stateAfterRateLimit.isStable).toBe(true);

      const minTimeAfterRateLimit = stateAfterRateLimit.minTime;
      await vendor.schedule('hello');

      const stateAfterSuccess = vendor.getState();
      expect(stateAfterSuccess.minTime).toBe(minTimeAfterRateLimit); // Should not change
    });
  });

  describe('error handling', () => {
    it('should throw VendorExecutionError on failure', async () => {
      vendor.setMockExecute(async () => {
        throw new Error('Test error');
      });

      try {
        await vendor.schedule('hello');
        expect(true).toBe(false); // Should not reach here
      } catch (e) {
        expect(e).toBeInstanceOf(VendorExecutionError);
      }
    });

    it('should classify rate limit errors', async () => {
      vendor.setMockExecute(async () => {
        throw new Error('HTTP 429 Too Many Requests');
      });

      try {
        await vendor.schedule('hello');
      } catch (e) {
        expect(e).toBeInstanceOf(VendorExecutionError);
        expect((e as VendorExecutionError).errorType).toBe(ErrorType.RATE_LIMIT);
      }
    });

    it('should classify server errors', async () => {
      vendor.setMockExecute(async () => {
        throw new Error('HTTP 500 Internal Server Error');
      });

      try {
        await vendor.schedule('hello');
      } catch (e) {
        expect(e).toBeInstanceOf(VendorExecutionError);
        expect((e as VendorExecutionError).errorType).toBe(ErrorType.SERVER_ERROR);
      }
    });

    it('should classify logic errors', async () => {
      vendor.setMockExecute(async () => {
        throw new Error('HTTP 400 Bad Request');
      });

      try {
        await vendor.schedule('hello');
      } catch (e) {
        expect(e).toBeInstanceOf(VendorExecutionError);
        expect((e as VendorExecutionError).errorType).toBe(ErrorType.LOGIC_ERROR);
      }
    });

    it('should lock and slow down on rate limit', async () => {
      const initialMinTime = vendor.getState().minTime;

      vendor.setMockExecute(async () => {
        throw new Error('429 Rate Limit');
      });

      try {
        await vendor.schedule('hello');
      } catch {}

      const state = vendor.getState();
      expect(state.isStable).toBe(true);
      expect(state.minTime).toBe(Math.ceil(initialMinTime * 1.25));
      expect(state.failureCount).toBe(1);
    });

    it('should record last error', async () => {
      vendor.setMockExecute(async () => {
        throw new Error('Something went wrong');
      });

      try {
        await vendor.schedule('hello');
      } catch {}

      const state = vendor.getState();
      expect(state.lastError).toBe('Something went wrong');
      expect(state.lastErrorAt).toBeGreaterThan(0);
    });
  });

  describe('custom error classification', () => {
    it('should use custom classifyError method', async () => {
      const customVendor = new CustomErrorVendor();
      customVendor.initialize({
        initialMinTime: 100,
        probeStep: 10,
        rateLimitBackoff: 1.25,
      });

      try {
        await customVendor.schedule('rate-limit');
      } catch (e) {
        expect(e).toBeInstanceOf(VendorExecutionError);
        expect((e as VendorExecutionError).errorType).toBe(ErrorType.RATE_LIMIT);
      }
    });
  });

  describe('freeze', () => {
    it('should freeze vendor', () => {
      const futureTime = Date.now() + 10000;
      vendor.freeze(futureTime);
      expect(vendor.isFrozen()).toBe(true);
      expect(vendor.getFrozenFor()).toBeGreaterThan(0);
      expect(vendor.getFrozenFor()).toBeLessThanOrEqual(10000);
    });

    it('should not be frozen when freeze time passed', () => {
      const pastTime = Date.now() - 1000;
      vendor.freeze(pastTime);
      expect(vendor.isFrozen()).toBe(false);
      expect(vendor.getFrozenFor()).toBe(0);
    });
  });

  describe('metrics', () => {
    it('should return correct metrics', async () => {
      await vendor.schedule('hello');
      await vendor.schedule('world');

      const metrics = vendor.getMetrics();
      expect(metrics.isFrozen).toBe(false);
      expect(metrics.frozenFor).toBe(0);
      expect(metrics.successRate).toBe(1);
    });

    it('should calculate success rate correctly', async () => {
      await vendor.schedule('hello');

      vendor.setMockExecute(async () => {
        throw new Error('Server Error 500');
      });

      try {
        await vendor.schedule('fail');
      } catch {}

      const metrics = vendor.getMetrics();
      expect(metrics.successRate).toBe(0.5); // 1 success, 1 failure
    });
  });

  describe('reset', () => {
    it('should reset vendor to initial state', async () => {
      // Make some changes
      await vendor.schedule('hello');
      vendor.freeze(Date.now() + 10000);

      // Reset
      vendor.reset(200);

      const state = vendor.getState();
      expect(state.isStable).toBe(false);
      expect(state.minTime).toBe(200);
      expect(state.frozenUntil).toBe(0);
      expect(state.successCount).toBe(0);
      expect(state.failureCount).toBe(0);
    });
  });

  describe('weight', () => {
    it('should have default weight of 1', () => {
      expect(vendor.weight).toBe(1);
    });

    it('should accept custom weight', () => {
      const weightedVendor = new (class extends Vendor<string, string> {
        readonly id = 'weighted';
        async execute(input: string) {
          return input;
        }
      })({ weight: 5 });

      expect(weightedVendor.weight).toBe(5);
    });
  });
});
