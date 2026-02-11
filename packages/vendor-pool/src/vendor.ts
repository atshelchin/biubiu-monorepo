import Bottleneck from 'bottleneck';
import { ErrorType, type VendorState, type VendorMetrics } from './types.js';
import { VendorExecutionError } from './errors.js';

/**
 * Default error classifier that maps common HTTP errors to ErrorType
 */
function defaultClassifyError(error: unknown): ErrorType {
  if (!(error instanceof Error)) {
    return ErrorType.UNKNOWN;
  }

  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Check for rate limit indicators
  if (
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('quota exceeded')
  ) {
    return ErrorType.RATE_LIMIT;
  }

  // Check for server errors
  if (
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    name.includes('timeout')
  ) {
    return ErrorType.SERVER_ERROR;
  }

  // Check for logic errors (client-side issues)
  if (
    message.includes('400') ||
    message.includes('401') ||
    message.includes('403') ||
    message.includes('404') ||
    message.includes('invalid') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('not found') ||
    message.includes('bad request')
  ) {
    return ErrorType.LOGIC_ERROR;
  }

  return ErrorType.UNKNOWN;
}

/**
 * Configuration options for a Vendor
 */
export interface VendorOptions {
  /** Initial minTime in ms (default: inherited from Pool) */
  initialMinTime?: number;
  /** Weight for load balancing (higher = more traffic, default: 1) */
  weight?: number;
}

/**
 * Abstract base class for vendors.
 * Extend this class to implement your own vendor.
 *
 * @example
 * ```typescript
 * class OpenAIVendor extends Vendor<ChatInput, ChatResponse> {
 *   readonly id = 'openai';
 *
 *   async execute(input: ChatInput): Promise<ChatResponse> {
 *     const response = await fetch('https://api.openai.com/v1/chat/completions', {
 *       method: 'POST',
 *       headers: { 'Authorization': `Bearer ${this.apiKey}` },
 *       body: JSON.stringify(input),
 *     });
 *     if (!response.ok) throw new Error(`HTTP ${response.status}`);
 *     return response.json();
 *   }
 * }
 * ```
 */
export abstract class Vendor<TInput = unknown, TOutput = unknown> {
  /** Unique identifier for this vendor */
  abstract readonly id: string;

  /** Weight for load balancing (higher = more traffic) */
  readonly weight: number;

  /** Internal limiter instance */
  private limiter: Bottleneck | null = null;

  /** Current state */
  private state: VendorState | null = null;

  /** Whether the vendor has been initialized */
  private initialized = false;

  /** Pending task count (selected but not yet completed) */
  private pendingCount = 0;

  /** Probe step (how much to decrease minTime per success) */
  private probeStep = 20;

  /** Rate limit backoff multiplier */
  private rateLimitBackoff = 1.25;

  constructor(options: VendorOptions = {}) {
    this.weight = options.weight ?? 1;
  }

  /**
   * Execute the task. Implement this in your vendor subclass.
   * @param input - The task input
   * @returns Promise resolving to the task output
   * @throws Error on failure (will be classified by classifyError)
   */
  abstract execute(input: TInput): Promise<TOutput>;

  /**
   * Classify an error to determine retry/freeze behavior.
   * Override this to customize error classification for your vendor.
   * @param error - The error to classify
   * @returns ErrorType indicating how to handle the error
   */
  classifyError(error: unknown): ErrorType {
    return defaultClassifyError(error);
  }

  /**
   * Initialize the vendor with configuration from the Pool.
   * Called internally by Pool.
   * @internal
   */
  initialize(config: {
    initialMinTime: number;
    probeStep: number;
    rateLimitBackoff: number;
    savedState?: VendorState;
  }): void {
    if (this.initialized) return;

    this.probeStep = config.probeStep;
    this.rateLimitBackoff = config.rateLimitBackoff;

    // Restore or create initial state
    this.state = config.savedState ?? {
      id: this.id,
      isStable: false,
      minTime: config.initialMinTime,
      lastSuccessMinTime: config.initialMinTime,
      frozenUntil: 0,
      successCount: 0,
      failureCount: 0,
    };

    // Create limiter with current minTime
    this.limiter = new Bottleneck({
      minTime: this.state.minTime,
      maxConcurrent: 1,
    });

    this.initialized = true;
  }

  /**
   * Schedule a task execution through the rate limiter.
   * Called internally by Pool.
   * @internal
   */
  async schedule(input: TInput): Promise<TOutput> {
    if (!this.limiter || !this.state) {
      throw new Error(`Vendor "${this.id}" not initialized`);
    }

    return this.limiter.schedule(async () => {
      try {
        const result = await this.execute(input);
        this.onSuccess();
        return result;
      } catch (error) {
        const errorType = this.classifyError(error);
        this.onFailure(error instanceof Error ? error : new Error(String(error)), errorType);
        throw new VendorExecutionError(
          this.id,
          errorType,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    });
  }

  /**
   * Handle successful execution - speed up if not stable
   */
  private onSuccess(): void {
    if (!this.state || !this.limiter) return;

    this.state.successCount++;

    // If not locked, try to speed up
    if (!this.state.isStable && this.state.minTime > 50) {
      // Record current minTime as last known good BEFORE speeding up
      this.state.lastSuccessMinTime = this.state.minTime;
      this.state.minTime = Math.max(50, this.state.minTime - this.probeStep);
      this.limiter.updateSettings({ minTime: this.state.minTime });
    }
  }

  /**
   * Handle failed execution - slow down and potentially lock
   */
  private onFailure(error: Error, errorType: ErrorType): void {
    if (!this.state || !this.limiter) return;

    this.state.failureCount++;
    this.state.lastError = error.message;
    this.state.lastErrorAt = Date.now();

    // On rate limit, lock and backoff
    if (errorType === ErrorType.RATE_LIMIT) {
      if (this.state.isStable) {
        // Already locked but still hitting rate limit - need to slow down more
        // Back off from CURRENT minTime since the locked rate is still too fast
        this.state.minTime = Math.ceil(this.state.minTime * this.rateLimitBackoff);
      } else {
        // First time hitting rate limit - lock and backoff from last known good
        this.state.isStable = true;
        this.state.minTime = Math.ceil(this.state.lastSuccessMinTime * this.rateLimitBackoff);
      }
      this.limiter.updateSettings({ minTime: this.state.minTime });
    }
  }

  /**
   * Get current vendor state for persistence
   * @internal
   */
  getState(): VendorState {
    if (!this.state) {
      return {
        id: this.id,
        isStable: false,
        minTime: 500,
        lastSuccessMinTime: 500,
        frozenUntil: 0,
        successCount: 0,
        failureCount: 0,
      };
    }
    return { ...this.state };
  }

  /**
   * Update frozen state
   * @internal
   */
  freeze(until: number): void {
    if (this.state) {
      this.state.frozenUntil = until;
    }
  }

  /**
   * Check if vendor is currently frozen
   */
  isFrozen(): boolean {
    if (!this.state) return false;
    return this.state.frozenUntil > Date.now();
  }

  /**
   * Get time until unfrozen (0 if not frozen)
   */
  getFrozenFor(): number {
    if (!this.state) return 0;
    return Math.max(0, this.state.frozenUntil - Date.now());
  }

  /**
   * Get metrics for vendor selection
   * @internal
   */
  getMetrics(): VendorMetrics {
    const state = this.state;
    const total = state ? state.successCount + state.failureCount : 0;

    return {
      // Include both Bottleneck queue AND pending count for accurate load balancing
      queueLength: (this.limiter?.counts().QUEUED ?? 0) + this.pendingCount,
      isFrozen: this.isFrozen(),
      frozenFor: this.getFrozenFor(),
      successRate: total > 0 ? (state?.successCount ?? 0) / total : 1,
    };
  }

  /**
   * Increment pending count when task is assigned to this vendor
   * @internal
   */
  incrementPending(): void {
    this.pendingCount++;
  }

  /**
   * Decrement pending count when task completes (success or failure)
   * @internal
   */
  decrementPending(): void {
    this.pendingCount = Math.max(0, this.pendingCount - 1);
  }

  /**
   * Reset vendor to initial state (for testing)
   * @internal
   */
  reset(initialMinTime = 500): void {
    this.state = {
      id: this.id,
      isStable: false,
      minTime: initialMinTime,
      lastSuccessMinTime: initialMinTime,
      frozenUntil: 0,
      successCount: 0,
      failureCount: 0,
    };
    if (this.limiter) {
      this.limiter.updateSettings({ minTime: initialMinTime });
    }
  }
}
