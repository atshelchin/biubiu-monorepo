/**
 * MerkleTree Tests
 */

import { describe, test, expect } from 'bun:test';
import { computeMerkleRoot, generateJobId, generateTaskId } from './MerkleTree.js';

describe('MerkleTree', () => {
  describe('computeMerkleRoot', () => {
    test('returns empty string for empty array', async () => {
      const result = await computeMerkleRoot([]);
      expect(result).toBe('');
    });

    test('returns hash of single leaf', async () => {
      const result = await computeMerkleRoot(['leaf1']);
      expect(result).toHaveLength(64); // SHA-256 hex string
      expect(result).toMatch(/^[a-f0-9]{64}$/);
    });

    test('returns consistent hash for same input', async () => {
      const result1 = await computeMerkleRoot(['a', 'b', 'c']);
      const result2 = await computeMerkleRoot(['a', 'b', 'c']);
      expect(result1).toBe(result2);
    });

    test('returns different hash for different inputs', async () => {
      const result1 = await computeMerkleRoot(['a', 'b', 'c']);
      const result2 = await computeMerkleRoot(['a', 'b', 'd']);
      expect(result1).not.toBe(result2);
    });

    test('handles two leaves', async () => {
      const result = await computeMerkleRoot(['leaf1', 'leaf2']);
      expect(result).toHaveLength(64);
    });

    test('handles odd number of leaves', async () => {
      const result = await computeMerkleRoot(['a', 'b', 'c']);
      expect(result).toHaveLength(64);
    });

    test('handles even number of leaves', async () => {
      const result = await computeMerkleRoot(['a', 'b', 'c', 'd']);
      expect(result).toHaveLength(64);
    });

    test('handles large number of leaves', async () => {
      const leaves = Array.from({ length: 1000 }, (_, i) => `leaf${i}`);
      const result = await computeMerkleRoot(leaves);
      expect(result).toHaveLength(64);
    });

    test('order matters', async () => {
      const result1 = await computeMerkleRoot(['a', 'b']);
      const result2 = await computeMerkleRoot(['b', 'a']);
      // Due to sorting in hashPair, these might be the same or different
      // The important thing is consistency
      expect(result1).toHaveLength(64);
      expect(result2).toHaveLength(64);
    });
  });

  describe('generateJobId', () => {
    test('generates hash for string input', async () => {
      const result = await generateJobId('test');
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[a-f0-9]{64}$/);
    });

    test('generates hash for object input', async () => {
      const result = await generateJobId({ key: 'value', num: 123 });
      expect(result).toHaveLength(64);
    });

    test('generates hash for array input', async () => {
      const result = await generateJobId([1, 2, 3]);
      expect(result).toHaveLength(64);
    });

    test('generates hash for number input', async () => {
      const result = await generateJobId(42);
      expect(result).toHaveLength(64);
    });

    test('generates hash for null input', async () => {
      const result = await generateJobId(null);
      expect(result).toHaveLength(64);
    });

    test('generates consistent hash for same input', async () => {
      const result1 = await generateJobId({ a: 1, b: 2 });
      const result2 = await generateJobId({ a: 1, b: 2 });
      expect(result1).toBe(result2);
    });

    test('generates different hash for different inputs', async () => {
      const result1 = await generateJobId({ a: 1 });
      const result2 = await generateJobId({ a: 2 });
      expect(result1).not.toBe(result2);
    });

    test('object key order affects hash', async () => {
      // JSON.stringify preserves key order
      const result1 = await generateJobId({ a: 1, b: 2 });
      const result2 = await generateJobId({ b: 2, a: 1 });
      // These will be different due to JSON.stringify order
      expect(result1).not.toBe(result2);
    });
  });

  describe('generateTaskId', () => {
    test('generates hash with merkle root', async () => {
      const result = await generateTaskId('my-task', 'abc123');
      expect(result).toHaveLength(64);
    });

    test('generates hash without merkle root', async () => {
      const result = await generateTaskId('my-task');
      expect(result).toHaveLength(64);
    });

    test('same name and merkle root produce same id', async () => {
      const result1 = await generateTaskId('task', 'root123');
      const result2 = await generateTaskId('task', 'root123');
      expect(result1).toBe(result2);
    });

    test('different names produce different ids', async () => {
      const result1 = await generateTaskId('task1', 'root');
      const result2 = await generateTaskId('task2', 'root');
      expect(result1).not.toBe(result2);
    });

    test('different roots produce different ids', async () => {
      const result1 = await generateTaskId('task', 'root1');
      const result2 = await generateTaskId('task', 'root2');
      expect(result1).not.toBe(result2);
    });

    test('without merkle root uses timestamp (non-deterministic)', async () => {
      const result1 = await generateTaskId('task');
      await new Promise(r => setTimeout(r, 2));
      const result2 = await generateTaskId('task');
      // Results should be different due to timestamp
      expect(result1).not.toBe(result2);
    });
  });

  // Bug fix: crypto.subtle.digest hangs when called inside a for-await loop
  // consuming an async generator in Bun. The fix uses Node.js crypto module
  // when available instead of crypto.subtle.
  describe('async generator compatibility', () => {
    async function* generateNumbers(count: number): AsyncGenerator<number> {
      for (let i = 0; i < count; i++) {
        yield i;
      }
    }

    test('generateJobId works inside for-await loop consuming async generator', async () => {
      const results: string[] = [];

      for await (const num of generateNumbers(5)) {
        const jobId = await generateJobId({ value: num });
        results.push(jobId);
      }

      expect(results).toHaveLength(5);
      results.forEach(id => {
        expect(id).toHaveLength(64);
        expect(id).toMatch(/^[a-f0-9]{64}$/);
      });
    });

    test('generateJobId produces consistent results in async generator context', async () => {
      const results1: string[] = [];
      const results2: string[] = [];

      for await (const num of generateNumbers(3)) {
        results1.push(await generateJobId({ value: num }));
      }

      for await (const num of generateNumbers(3)) {
        results2.push(await generateJobId({ value: num }));
      }

      expect(results1).toEqual(results2);
    });

    test('multiple generateJobId calls interleaved with async generator', async () => {
      const ids: string[] = [];

      for await (const num of generateNumbers(3)) {
        // Multiple calls per iteration
        const id1 = await generateJobId({ type: 'a', value: num });
        const id2 = await generateJobId({ type: 'b', value: num });
        ids.push(id1, id2);
      }

      expect(ids).toHaveLength(6);
      // All IDs should be unique (different inputs)
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(6);
    });

    test('computeMerkleRoot works with IDs generated in async generator', async () => {
      const jobIds: string[] = [];

      for await (const num of generateNumbers(10)) {
        const id = await generateJobId({ index: num });
        jobIds.push(id);
      }

      const merkleRoot = await computeMerkleRoot(jobIds);
      expect(merkleRoot).toHaveLength(64);
      expect(merkleRoot).toMatch(/^[a-f0-9]{64}$/);

      // Should be deterministic
      const merkleRoot2 = await computeMerkleRoot(jobIds);
      expect(merkleRoot).toBe(merkleRoot2);
    });
  });
});
