import {
  ErrorType,
  type PoolOptions,
  type StorageAdapter,
  type VendorState,
  type EscalationContext,
  type PoolResult,
} from './types.js';
import { Vendor } from './vendor.js';
import {
  EscalationError,
  LogicError,
  NoVendorAvailableError,
  TimeoutError,
  VendorExecutionError,
} from './errors.js';
import { MemoryStorageAdapter } from './storage/memory.js';

/** Default configuration values */
const DEFAULTS = {
  maxRetries: 10,
  maxConsecutiveFailures: 5,
  timeout: 30_000,
  initialMinTime: 500,
  probeStep: 20,
  rateLimitBackoff: 1.25,
  softFreezeDuration: [5_000, 10_000] as [number, number],
  hardFreezeDuration: [30_000, 60_000] as [number, number],
};

/** Storage key prefix for vendor states */
const STORAGE_PREFIX = 'vendor:';

/**
 * Get a random duration within a range
 */
function randomDuration([min, max]: [number, number]): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pool is the scheduling hub that manages multiple vendors.
 * It handles automatic failover, rate limiting, and escalation.
 *
 * @example
 * ```typescript
 * const pool = new Pool([
 *   new OpenAIVendor(),
 *   new AnthropicVendor(),
 * ]);
 *
 * const result = await pool.do({ message: 'Hello' });
 * ```
 */
export class Pool<TInput = unknown, TOutput = unknown> {
  private vendors: Vendor<TInput, TOutput>[];
  private storage: StorageAdapter;
  private options: Required<Omit<PoolOptions, 'storage' | 'onEscalate'>> & {
    onEscalate?: PoolOptions['onEscalate'];
  };
  private initialized = false;
  private initializePromise: Promise<void> | null = null;

  constructor(vendors: Vendor<TInput, TOutput>[], options: PoolOptions = {}) {
    if (vendors.length === 0) {
      throw new Error('Pool requires at least one vendor');
    }

    this.vendors = vendors;
    this.storage = options.storage ?? new MemoryStorageAdapter();
    this.options = {
      maxRetries: options.maxRetries ?? DEFAULTS.maxRetries,
      maxConsecutiveFailures: options.maxConsecutiveFailures ?? DEFAULTS.maxConsecutiveFailures,
      timeout: options.timeout ?? DEFAULTS.timeout,
      initialMinTime: options.initialMinTime ?? DEFAULTS.initialMinTime,
      probeStep: options.probeStep ?? DEFAULTS.probeStep,
      rateLimitBackoff: options.rateLimitBackoff ?? DEFAULTS.rateLimitBackoff,
      softFreezeDuration: options.softFreezeDuration ?? DEFAULTS.softFreezeDuration,
      hardFreezeDuration: options.hardFreezeDuration ?? DEFAULTS.hardFreezeDuration,
      onEscalate: options.onEscalate,
    };
  }

  /**
   * Initialize all vendors, loading persisted state if available.
   * Thread-safe: concurrent calls will wait for the same initialization.
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    // Prevent concurrent initialization - all callers wait on same promise
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = (async () => {
      for (const vendor of this.vendors) {
        const key = `${STORAGE_PREFIX}${vendor.id}`;
        const savedState = await this.storage.get<VendorState>(key);

        vendor.initialize({
          initialMinTime: this.options.initialMinTime,
          probeStep: this.options.probeStep,
          rateLimitBackoff: this.options.rateLimitBackoff,
          savedState: savedState ?? undefined,
        });
      }

      this.initialized = true;
    })();

    return this.initializePromise;
  }

  /**
   * Persist vendor state to storage.
   * Errors are silently ignored to prevent storage issues from affecting task execution.
   */
  private async saveVendorState(vendor: Vendor<TInput, TOutput>): Promise<void> {
    try {
      const key = `${STORAGE_PREFIX}${vendor.id}`;
      await this.storage.set(key, vendor.getState());
    } catch {
      // Storage errors should not affect task execution
      // In production, you might want to log this
    }
  }

  /**
   * Select the best available vendor.
   * Filters out frozen vendors, then selects the one with lowest queue length.
   * Uses weight as a tiebreaker.
   */
  private selectVendor(): Vendor<TInput, TOutput> | null {
    const available = this.vendors.filter((v) => !v.isFrozen());

    if (available.length === 0) {
      return null;
    }

    // Sort by: queue length (asc), then weight (desc), then success rate (desc)
    available.sort((a, b) => {
      const metricsA = a.getMetrics();
      const metricsB = b.getMetrics();

      // Primary: lowest queue length
      if (metricsA.queueLength !== metricsB.queueLength) {
        return metricsA.queueLength - metricsB.queueLength;
      }

      // Secondary: highest weight
      if (a.weight !== b.weight) {
        return b.weight - a.weight;
      }

      // Tertiary: highest success rate
      return metricsB.successRate - metricsA.successRate;
    });

    return available[0];
  }

  /**
   * Get the nearest unfreeze time among all vendors
   */
  private getNearestUnfreezeTime(): number {
    let nearest = Infinity;
    for (const vendor of this.vendors) {
      const state = vendor.getState();
      if (state.frozenUntil > Date.now() && state.frozenUntil < nearest) {
        nearest = state.frozenUntil;
      }
    }
    return nearest === Infinity ? Date.now() : nearest;
  }

  /**
   * Apply freeze to a vendor based on error type
   */
  private freezeVendor(vendor: Vendor<TInput, TOutput>, errorType: ErrorType): void {
    let duration: number;

    switch (errorType) {
      case ErrorType.RATE_LIMIT:
        duration = randomDuration(this.options.softFreezeDuration);
        break;
      case ErrorType.SERVER_ERROR:
      case ErrorType.UNKNOWN:
        duration = randomDuration(this.options.hardFreezeDuration);
        break;
      default:
        // Logic errors don't freeze
        return;
    }

    vendor.freeze(Date.now() + duration);
  }

  /**
   * Execute a task with automatic failover and retry.
   * This is the main entry point.
   *
   * @param input - The task input
   * @returns Promise resolving to the task output with metadata
   * @throws {EscalationError} When all vendors exhausted and escalation triggered
   * @throws {LogicError} When a logic error occurs (no retry possible)
   * @throws {TimeoutError} When global timeout exceeded
   */
  async do(input: TInput): Promise<PoolResult<TOutput>> {
    await this.initialize();

    const startTime = Date.now();
    let totalRetries = 0;
    let consecutiveFailures = 0;
    let lastError: Error = new Error('No vendors available');

    while (true) {
      // Check timeout
      const elapsed = Date.now() - startTime;
      if (elapsed >= this.options.timeout) {
        throw new TimeoutError(this.options.timeout, elapsed);
      }

      // Check escalation conditions
      if (
        totalRetries >= this.options.maxRetries ||
        consecutiveFailures >= this.options.maxConsecutiveFailures
      ) {
        const context: EscalationContext = {
          totalRetries,
          consecutiveFailures,
          elapsedTime: elapsed,
          vendorStates: this.vendors.map((v) => v.getState()),
          lastError,
          taskInput: input,
        };

        // Call escalation callback if provided
        if (this.options.onEscalate) {
          await this.options.onEscalate(context);
        }

        throw new EscalationError('All vendors exhausted - human intervention required', context);
      }

      // Select a vendor
      const vendor = this.selectVendor();

      if (!vendor) {
        // All vendors frozen - wait for nearest unfreeze
        const nearestUnfreeze = this.getNearestUnfreezeTime();
        // Recalculate remaining time (don't use stale `elapsed` from loop start)
        const remainingTimeout = this.options.timeout - (Date.now() - startTime);
        const waitTime = Math.min(
          nearestUnfreeze - Date.now() + 100, // Add 100ms buffer
          remainingTimeout
        );

        if (waitTime > 0) {
          await sleep(waitTime);
          continue;
        } else {
          throw new NoVendorAvailableError(
            this.vendors.map((v) => v.id),
            nearestUnfreeze
          );
        }
      }

      // Mark vendor as having a pending task (for load balancing)
      vendor.incrementPending();

      // Calculate remaining time for timeout enforcement during execution
      const remainingTime = this.options.timeout - (Date.now() - startTime);

      // Create timeout promise with cleanup capability
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new TimeoutError(this.options.timeout, Date.now() - startTime));
        }, remainingTime);
      });

      try {
        // Execute the task with timeout enforcement
        // Note: If timeout wins, vendorPromise may later reject - we must handle it
        // to prevent unhandled promise rejection (which can crash Node.js/Bun)
        const vendorPromise = vendor.schedule(input);
        vendorPromise.catch(() => {}); // Suppress unhandled rejection if timeout wins

        const result = await Promise.race([vendorPromise, timeoutPromise]);

        // Clear timeout timer to prevent memory leak
        clearTimeout(timeoutId!);

        // Decrement pending count
        vendor.decrementPending();

        // Save state on success
        await this.saveVendorState(vendor);

        return {
          result,
          vendorId: vendor.id,
          retries: totalRetries,
          duration: Date.now() - startTime,
        };
      } catch (error) {
        // Clear timeout timer to prevent memory leak
        clearTimeout(timeoutId!);

        // Decrement pending count
        vendor.decrementPending();

        // TimeoutError should not be retried - throw immediately
        if (error instanceof TimeoutError) {
          throw error;
        }

        totalRetries++;
        consecutiveFailures++;

        if (error instanceof VendorExecutionError) {
          lastError = error;

          // Logic errors are not retryable
          if (error.errorType === ErrorType.LOGIC_ERROR) {
            throw new LogicError(error.vendorId, error.originalError);
          }

          // Apply freeze based on error type
          this.freezeVendor(vendor, error.errorType);
          await this.saveVendorState(vendor);
        } else {
          lastError = error instanceof Error ? error : new Error(String(error));
          // Unknown error - apply hard freeze
          this.freezeVendor(vendor, ErrorType.UNKNOWN);
          await this.saveVendorState(vendor);
        }

        // Continue to next iteration (retry with potentially different vendor)
      }
    }
  }

  /**
   * Get current states of all vendors
   */
  getVendorStates(): VendorState[] {
    return this.vendors.map((v) => v.getState());
  }

  /**
   * Reset all vendors to initial state
   */
  async reset(): Promise<void> {
    for (const vendor of this.vendors) {
      vendor.reset(this.options.initialMinTime);
      await this.saveVendorState(vendor);
    }
  }

  /**
   * Clear all persisted state
   */
  async clearStorage(): Promise<void> {
    await this.storage.clear(STORAGE_PREFIX);
  }
}
