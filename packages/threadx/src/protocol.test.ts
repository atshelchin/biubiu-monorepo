import { describe, test, expect } from 'bun:test';
import { serializeError } from './protocol';

describe('protocol', () => {
  describe('serializeError()', () => {
    test('should serialize Error instance', () => {
      const error = new Error('Test error');
      const serialized = serializeError(error);

      expect(serialized.name).toBe('Error');
      expect(serialized.message).toBe('Test error');
      expect(serialized.stack).toBeDefined();
      expect(serialized.stack).toContain('Test error');
    });

    test('should serialize TypeError', () => {
      const error = new TypeError('Type mismatch');
      const serialized = serializeError(error);

      expect(serialized.name).toBe('TypeError');
      expect(serialized.message).toBe('Type mismatch');
    });

    test('should serialize custom error', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const error = new CustomError('Custom message');
      const serialized = serializeError(error);

      expect(serialized.name).toBe('CustomError');
      expect(serialized.message).toBe('Custom message');
    });

    test('should handle string thrown as error', () => {
      const serialized = serializeError('String error');

      expect(serialized.name).toBe('Error');
      expect(serialized.message).toBe('String error');
      expect(serialized.stack).toBeUndefined();
    });

    test('should handle number thrown as error', () => {
      const serialized = serializeError(42);

      expect(serialized.name).toBe('Error');
      expect(serialized.message).toBe('42');
    });

    test('should handle null thrown as error', () => {
      const serialized = serializeError(null);

      expect(serialized.name).toBe('Error');
      expect(serialized.message).toBe('null');
    });

    test('should handle undefined thrown as error', () => {
      const serialized = serializeError(undefined);

      expect(serialized.name).toBe('Error');
      expect(serialized.message).toBe('undefined');
    });

    test('should handle object thrown as error', () => {
      const serialized = serializeError({ foo: 'bar' });

      expect(serialized.name).toBe('Error');
      expect(serialized.message).toBe('[object Object]');
    });
  });
});
