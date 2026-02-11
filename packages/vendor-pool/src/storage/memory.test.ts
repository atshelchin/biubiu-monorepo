import { describe, it, expect, beforeEach } from 'bun:test';
import { MemoryStorageAdapter } from './memory.js';

describe('MemoryStorageAdapter', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  describe('get/set', () => {
    it('should return null for non-existent key', async () => {
      const result = await storage.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should store and retrieve a string', async () => {
      await storage.set('key1', 'value1');
      const result = await storage.get<string>('key1');
      expect(result).toBe('value1');
    });

    it('should store and retrieve an object', async () => {
      const obj = { name: 'test', count: 42 };
      await storage.set('key1', obj);
      const result = await storage.get<typeof obj>('key1');
      expect(result).toEqual(obj);
    });

    it('should overwrite existing value', async () => {
      await storage.set('key1', 'first');
      await storage.set('key1', 'second');
      const result = await storage.get<string>('key1');
      expect(result).toBe('second');
    });
  });

  describe('delete', () => {
    it('should delete existing key', async () => {
      await storage.set('key1', 'value1');
      await storage.delete('key1');
      const result = await storage.get('key1');
      expect(result).toBeNull();
    });

    it('should not throw when deleting non-existent key', async () => {
      await expect(storage.delete('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('keys', () => {
    it('should return empty array when storage is empty', async () => {
      const keys = await storage.keys();
      expect(keys).toEqual([]);
    });

    it('should return all keys', async () => {
      await storage.set('key1', 'value1');
      await storage.set('key2', 'value2');
      await storage.set('key3', 'value3');
      const keys = await storage.keys();
      expect(keys.sort()).toEqual(['key1', 'key2', 'key3']);
    });

    it('should filter keys by prefix', async () => {
      await storage.set('vendor:openai', { id: 'openai' });
      await storage.set('vendor:anthropic', { id: 'anthropic' });
      await storage.set('config:timeout', 5000);

      const vendorKeys = await storage.keys('vendor:');
      expect(vendorKeys.sort()).toEqual(['vendor:anthropic', 'vendor:openai']);

      const configKeys = await storage.keys('config:');
      expect(configKeys).toEqual(['config:timeout']);
    });
  });

  describe('clear', () => {
    it('should clear all keys', async () => {
      await storage.set('key1', 'value1');
      await storage.set('key2', 'value2');
      await storage.clear();
      expect(storage.size).toBe(0);
    });

    it('should clear only keys matching prefix', async () => {
      await storage.set('vendor:openai', { id: 'openai' });
      await storage.set('vendor:anthropic', { id: 'anthropic' });
      await storage.set('config:timeout', 5000);

      await storage.clear('vendor:');

      expect(storage.size).toBe(1);
      const configValue = await storage.get('config:timeout');
      expect(configValue).toBe(5000);
    });
  });

  describe('size', () => {
    it('should return correct size', async () => {
      expect(storage.size).toBe(0);
      await storage.set('key1', 'value1');
      expect(storage.size).toBe(1);
      await storage.set('key2', 'value2');
      expect(storage.size).toBe(2);
      await storage.delete('key1');
      expect(storage.size).toBe(1);
    });
  });
});
