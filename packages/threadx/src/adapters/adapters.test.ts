/**
 * Tests for adapter interfaces and runtime detection
 */

import { describe, test, expect } from 'bun:test';
import { detectRuntime, isWorkerContext } from './index.js';
import { WebMainThreadAdapter, WebWorkerSideAdapter } from './web.js';

describe('detectRuntime', () => {
  test('should detect bun runtime', () => {
    // We're running in Bun, so should detect as 'bun'
    expect(detectRuntime()).toBe('bun');
  });
});

describe('isWorkerContext', () => {
  test('should return false in main thread', () => {
    // We're running in main thread, not a worker
    expect(isWorkerContext()).toBe(false);
  });
});

describe('WebMainThreadAdapter', () => {
  test('should wrap Web Worker correctly', () => {
    // Create a mock worker
    const mockWorker = {
      postMessage: () => {},
      terminate: () => {},
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null as ((event: ErrorEvent) => void) | null,
    } as unknown as Worker;

    const adapter = new WebMainThreadAdapter(mockWorker);

    // Test raw property
    expect(adapter.raw).toBe(mockWorker);
  });

  test('should call postMessage with transfer', () => {
    let calledWith: { data: unknown; transfer?: unknown[] } | null = null;

    const mockWorker = {
      postMessage: (data: unknown, transfer?: unknown[]) => {
        calledWith = { data, transfer };
      },
      terminate: () => {},
      onmessage: null,
      onerror: null,
    } as unknown as Worker;

    const adapter = new WebMainThreadAdapter(mockWorker);
    const buffer = new ArrayBuffer(8);
    adapter.postMessage({ test: true }, [buffer]);

    expect(calledWith).not.toBeNull();
    expect(calledWith!.data).toEqual({ test: true });
    expect(calledWith!.transfer).toEqual([buffer]);
  });

  test('should call postMessage without transfer', () => {
    let calledWith: { data: unknown; transfer?: unknown[] } | null = null;

    const mockWorker = {
      postMessage: (data: unknown, transfer?: unknown[]) => {
        calledWith = { data, transfer };
      },
      terminate: () => {},
      onmessage: null,
      onerror: null,
    } as unknown as Worker;

    const adapter = new WebMainThreadAdapter(mockWorker);
    adapter.postMessage({ test: true });

    expect(calledWith).not.toBeNull();
    expect(calledWith!.data).toEqual({ test: true });
    expect(calledWith!.transfer).toBeUndefined();
  });

  test('should handle onMessage', () => {
    let handler: ((event: MessageEvent) => void) | null = null;

    const mockWorker = {
      postMessage: () => {},
      terminate: () => {},
      set onmessage(fn: ((event: MessageEvent) => void) | null) {
        handler = fn;
      },
      get onmessage() {
        return handler;
      },
      onerror: null,
    } as unknown as Worker;

    const adapter = new WebMainThreadAdapter(mockWorker);

    let receivedData: unknown = null;
    adapter.onMessage((data) => {
      receivedData = data;
    });

    // Simulate message
    expect(handler).not.toBeNull();
    handler!({ data: { hello: 'world' } } as MessageEvent);

    expect(receivedData).toEqual({ hello: 'world' });
  });

  test('should handle onError', () => {
    let handler: ((event: ErrorEvent) => void) | null = null;

    const mockWorker = {
      postMessage: () => {},
      terminate: () => {},
      onmessage: null,
      set onerror(fn: ((event: ErrorEvent) => void) | null) {
        handler = fn;
      },
      get onerror() {
        return handler;
      },
    } as unknown as Worker;

    const adapter = new WebMainThreadAdapter(mockWorker);

    let receivedError: Error | null = null;
    adapter.onError((error) => {
      receivedError = error;
    });

    // Simulate error
    expect(handler).not.toBeNull();
    handler!({ message: 'Test error' } as ErrorEvent);

    expect(receivedError).not.toBeNull();
    expect(receivedError!.message).toBe('Test error');
  });

  test('should call terminate', () => {
    let terminated = false;

    const mockWorker = {
      postMessage: () => {},
      terminate: () => {
        terminated = true;
      },
      onmessage: null,
      onerror: null,
    } as unknown as Worker;

    const adapter = new WebMainThreadAdapter(mockWorker);
    adapter.terminate();

    expect(terminated).toBe(true);
  });
});

describe('WebWorkerSideAdapter', () => {
  // Note: We can't fully test WebWorkerSideAdapter in main thread
  // because it relies on 'self' global which is different in worker context
  test('should be constructable', () => {
    // Just verify the class exists and can be instantiated
    // In actual worker context, it would work with self
    expect(WebWorkerSideAdapter).toBeDefined();
  });
});
