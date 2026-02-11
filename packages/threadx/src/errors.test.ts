import { describe, test, expect } from 'bun:test';
import { WorkerError, TimeoutError, InitError, UnsupportedRuntimeError } from './errors';

describe('errors', () => {
  describe('WorkerError', () => {
    test('should create WorkerError from serialized error', () => {
      const serialized = {
        name: 'TypeError',
        message: 'Cannot read property',
        stack: 'TypeError: Cannot read property\n    at Worker (worker.js:10:5)',
      };

      const error = new WorkerError(serialized);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(WorkerError);
      expect(error.name).toBe('TypeError');
      expect(error.message).toBe('Cannot read property');
      expect(error.workerStack).toBe(serialized.stack);
    });

    test('should include call site stack when provided', () => {
      const serialized = {
        name: 'Error',
        message: 'Worker failed',
        stack: 'Error: Worker failed\n    at doWork (worker.js:5:3)',
      };
      const callSite = new Error();

      const error = new WorkerError(serialized, callSite);

      expect(error.stack).toContain('Error: Worker failed');
      expect(error.stack).toContain('at Worker');
    });

    test('should default name to WorkerError if not provided', () => {
      const serialized = {
        name: '',
        message: 'Unknown error',
      };

      const error = new WorkerError(serialized);

      expect(error.name).toBe('WorkerError');
    });
  });

  describe('TimeoutError', () => {
    test('should create TimeoutError with method name and timeout', () => {
      const error = new TimeoutError('heavyComputation', 5000);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe("Call to 'heavyComputation' timed out after 5000ms");
    });
  });

  describe('InitError', () => {
    test('should create InitError with message', () => {
      const error = new InitError('Worker failed to load');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(InitError);
      expect(error.name).toBe('InitError');
      expect(error.message).toBe('Worker failed to load');
    });
  });

  describe('UnsupportedRuntimeError', () => {
    test('should create UnsupportedRuntimeError with runtime name', () => {
      const error = new UnsupportedRuntimeError('cloudflare');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(UnsupportedRuntimeError);
      expect(error.name).toBe('UnsupportedRuntimeError');
      expect(error.message).toBe(
        'ThreadX is not supported on cloudflare. Supported runtimes: Browser, Bun, Deno'
      );
    });
  });

  describe('error instanceof checks', () => {
    test('should correctly identify error types', () => {
      const workerError = new WorkerError({ name: 'Error', message: 'test' });
      const timeoutError = new TimeoutError('method', 1000);
      const initError = new InitError('init failed');
      const unsupportedError = new UnsupportedRuntimeError('unknown');

      expect(workerError instanceof WorkerError).toBe(true);
      expect(workerError instanceof TimeoutError).toBe(false);

      expect(timeoutError instanceof TimeoutError).toBe(true);
      expect(timeoutError instanceof WorkerError).toBe(false);

      expect(initError instanceof InitError).toBe(true);
      expect(initError instanceof TimeoutError).toBe(false);

      expect(unsupportedError instanceof UnsupportedRuntimeError).toBe(true);
      expect(unsupportedError instanceof InitError).toBe(false);
    });
  });
});
