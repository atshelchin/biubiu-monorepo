import { describe, test, expect } from 'bun:test';
import { t, isTransferDescriptor, prepareArgs, TRANSFER } from './transfer';

describe('transfer', () => {
  describe('t()', () => {
    test('should create transfer descriptor for single transferable', () => {
      const buffer = new ArrayBuffer(1024);
      const descriptor = t(buffer);

      expect(descriptor[TRANSFER]).toBe(true);
      expect(descriptor.value).toBe(buffer);
      expect(descriptor.transferables).toEqual([buffer]);
    });

    test('should create transfer descriptor with explicit transferables', () => {
      const buffer1 = new ArrayBuffer(512);
      const buffer2 = new ArrayBuffer(256);
      const data = { image: buffer1, mask: buffer2, meta: { width: 100 } };

      const descriptor = t(data, [buffer1, buffer2]);

      expect(descriptor[TRANSFER]).toBe(true);
      expect(descriptor.value).toBe(data);
      expect(descriptor.transferables).toEqual([buffer1, buffer2]);
    });

    test('should work with MessagePort', () => {
      const channel = new MessageChannel();
      const descriptor = t(channel.port1);

      expect(descriptor[TRANSFER]).toBe(true);
      expect(descriptor.value).toBe(channel.port1);
      expect(descriptor.transferables).toEqual([channel.port1]);
    });
  });

  describe('isTransferDescriptor()', () => {
    test('should return true for transfer descriptors', () => {
      const buffer = new ArrayBuffer(1024);
      const descriptor = t(buffer);

      expect(isTransferDescriptor(descriptor)).toBe(true);
    });

    test('should return false for regular objects', () => {
      expect(isTransferDescriptor({})).toBe(false);
      expect(isTransferDescriptor({ value: 1 })).toBe(false);
      expect(isTransferDescriptor(new ArrayBuffer(1024))).toBe(false);
    });

    test('should return false for primitives', () => {
      expect(isTransferDescriptor(null)).toBe(false);
      expect(isTransferDescriptor(undefined)).toBe(false);
      expect(isTransferDescriptor(42)).toBe(false);
      expect(isTransferDescriptor('string')).toBe(false);
    });
  });

  describe('prepareArgs()', () => {
    test('should extract transferables from args', () => {
      const buffer = new ArrayBuffer(1024);
      const result = prepareArgs([1, 'hello', t(buffer), { key: 'value' }]);

      expect(result.args).toEqual([1, 'hello', buffer, { key: 'value' }]);
      expect(result.transfer).toEqual([buffer]);
    });

    test('should handle multiple transferables', () => {
      const buffer1 = new ArrayBuffer(512);
      const buffer2 = new ArrayBuffer(256);
      const result = prepareArgs([t(buffer1), 'middle', t(buffer2)]);

      expect(result.args).toEqual([buffer1, 'middle', buffer2]);
      expect(result.transfer).toEqual([buffer1, buffer2]);
    });

    test('should handle args with no transferables', () => {
      const result = prepareArgs([1, 'hello', { key: 'value' }]);

      expect(result.args).toEqual([1, 'hello', { key: 'value' }]);
      expect(result.transfer).toEqual([]);
    });

    test('should handle empty args', () => {
      const result = prepareArgs([]);

      expect(result.args).toEqual([]);
      expect(result.transfer).toEqual([]);
    });

    test('should handle nested object with explicit transferables', () => {
      const buffer = new ArrayBuffer(1024);
      const data = { nested: { buffer }, meta: 'info' };
      const result = prepareArgs([t(data, [buffer])]);

      expect(result.args).toEqual([data]);
      expect(result.transfer).toEqual([buffer]);
    });
  });
});
