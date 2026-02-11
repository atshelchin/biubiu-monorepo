import type { EscalationContext, ErrorType } from './types.js';

/**
 * Base error class for vendor-pool errors
 */
export class VendorPoolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VendorPoolError';
  }
}

/**
 * Thrown when all vendors are exhausted and escalation is triggered.
 * This indicates human intervention is needed.
 */
export class EscalationError extends VendorPoolError {
  public readonly context: EscalationContext;

  constructor(message: string, context: EscalationContext) {
    super(message);
    this.name = 'EscalationError';
    this.context = context;
  }
}

/**
 * Thrown when the global timeout is exceeded
 */
export class TimeoutError extends VendorPoolError {
  public readonly elapsedTime: number;
  public readonly timeout: number;

  constructor(timeout: number, elapsedTime: number) {
    super(`Operation timed out after ${elapsedTime}ms (limit: ${timeout}ms)`);
    this.name = 'TimeoutError';
    this.timeout = timeout;
    this.elapsedTime = elapsedTime;
  }
}

/**
 * Thrown when a vendor encounters a logic error that cannot be retried
 * (e.g., bad parameters, authentication failure)
 */
export class LogicError extends VendorPoolError {
  public readonly vendorId: string;
  public readonly originalError: Error;

  constructor(vendorId: string, originalError: Error) {
    super(`Logic error from vendor "${vendorId}": ${originalError.message}`);
    this.name = 'LogicError';
    this.vendorId = vendorId;
    this.originalError = originalError;
  }
}

/**
 * Thrown when no vendors are available (all frozen or none registered)
 */
export class NoVendorAvailableError extends VendorPoolError {
  public readonly frozenVendors: string[];
  public readonly nearestUnfreezeTime: number;

  constructor(frozenVendors: string[], nearestUnfreezeTime: number) {
    const waitTime = Math.max(0, nearestUnfreezeTime - Date.now());
    super(
      `No vendors available. ${frozenVendors.length} vendors frozen. ` +
        `Nearest unfreeze in ${Math.ceil(waitTime / 1000)}s`
    );
    this.name = 'NoVendorAvailableError';
    this.frozenVendors = frozenVendors;
    this.nearestUnfreezeTime = nearestUnfreezeTime;
  }
}

/**
 * Wrapper for vendor execution errors with classification
 */
export class VendorExecutionError extends VendorPoolError {
  public readonly vendorId: string;
  public readonly errorType: ErrorType;
  public readonly originalError: Error;

  constructor(vendorId: string, errorType: ErrorType, originalError: Error) {
    super(`Vendor "${vendorId}" failed (${errorType}): ${originalError.message}`);
    this.name = 'VendorExecutionError';
    this.vendorId = vendorId;
    this.errorType = errorType;
    this.originalError = originalError;
  }
}
