/**
 * EventEmitter Tests
 */

import { describe, test, expect, mock } from 'bun:test';
import { EventEmitter } from './EventEmitter.js';

interface TestEvents {
  message: string;
  count: number;
  data: { id: number; name: string };
}

describe('EventEmitter', () => {
  describe('on', () => {
    test('registers handler and returns unsubscribe function', () => {
      const emitter = new EventEmitter<TestEvents>();
      const handler = mock(() => {});

      const unsubscribe = emitter.on('message', handler);

      expect(typeof unsubscribe).toBe('function');

      emitter.emit('message', 'test');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('test');
    });

    test('allows multiple handlers for same event', () => {
      const emitter = new EventEmitter<TestEvents>();
      const handler1 = mock(() => {});
      const handler2 = mock(() => {});

      emitter.on('message', handler1);
      emitter.on('message', handler2);

      emitter.emit('message', 'test');

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    test('unsubscribe function removes only that handler', () => {
      const emitter = new EventEmitter<TestEvents>();
      const handler1 = mock(() => {});
      const handler2 = mock(() => {});

      const unsubscribe1 = emitter.on('message', handler1);
      emitter.on('message', handler2);

      unsubscribe1();

      emitter.emit('message', 'test');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    test('same handler can be registered multiple times', () => {
      const emitter = new EventEmitter<TestEvents>();
      const handler = mock(() => {});

      emitter.on('message', handler);
      emitter.on('message', handler);

      emitter.emit('message', 'test');

      // Set only stores unique values, so handler is called once
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('off', () => {
    test('removes specific handler', () => {
      const emitter = new EventEmitter<TestEvents>();
      const handler = mock(() => {});

      emitter.on('message', handler);
      emitter.off('message', handler);

      emitter.emit('message', 'test');

      expect(handler).not.toHaveBeenCalled();
    });

    test('does nothing if handler not registered', () => {
      const emitter = new EventEmitter<TestEvents>();
      const handler = mock(() => {});

      // Should not throw
      emitter.off('message', handler);
    });

    test('does nothing if event has no handlers', () => {
      const emitter = new EventEmitter<TestEvents>();
      const handler = mock(() => {});

      // Should not throw
      emitter.off('count', handler);
    });
  });

  describe('emit', () => {
    test('calls handlers with correct data', () => {
      const emitter = new EventEmitter<TestEvents>();
      const handler = mock(() => {});

      emitter.on('data', handler);
      emitter.emit('data', { id: 1, name: 'test' });

      expect(handler).toHaveBeenCalledWith({ id: 1, name: 'test' });
    });

    test('handles events with no handlers', () => {
      const emitter = new EventEmitter<TestEvents>();

      // Should not throw
      emitter.emit('message', 'test');
    });

    test('continues calling handlers if one throws', () => {
      const emitter = new EventEmitter<TestEvents>();
      const handler1 = mock(() => { throw new Error('test error'); });
      const handler2 = mock(() => {});

      emitter.on('message', handler1);
      emitter.on('message', handler2);

      // Should not throw
      emitter.emit('message', 'test');

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    test('handles different event types', () => {
      const emitter = new EventEmitter<TestEvents>();
      const messageHandler = mock(() => {});
      const countHandler = mock(() => {});

      emitter.on('message', messageHandler);
      emitter.on('count', countHandler);

      emitter.emit('message', 'hello');
      emitter.emit('count', 42);

      expect(messageHandler).toHaveBeenCalledWith('hello');
      expect(countHandler).toHaveBeenCalledWith(42);
    });
  });

  // Bug fix: EventEmitter must support multiple arguments
  // This was discovered when Task.ts emitted job:failed with (job, error) but
  // EventEmitter only passed single argument to handlers
  describe('multi-argument events', () => {
    interface MultiArgEvents {
      'job:failed': (job: { id: string }, error: Error) => void;
      'job:retry': (job: { id: string }, attempt: number) => void;
      'triple': (a: string, b: number, c: boolean) => void;
    }

    test('passes multiple arguments to handler', () => {
      const emitter = new EventEmitter<MultiArgEvents>();
      const handler = mock(() => {});

      emitter.on('job:failed', handler);

      const job = { id: 'test-job' };
      const error = new Error('Test error');
      emitter.emit('job:failed', job, error);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(job, error);
    });

    test('passes all arguments correctly with different types', () => {
      const emitter = new EventEmitter<MultiArgEvents>();
      let receivedJob: { id: string } | null = null;
      let receivedAttempt: number | null = null;

      emitter.on('job:retry', (job, attempt) => {
        receivedJob = job;
        receivedAttempt = attempt;
      });

      emitter.emit('job:retry', { id: 'job-123' }, 3);

      expect(receivedJob).toEqual({ id: 'job-123' });
      expect(receivedAttempt).toBe(3);
    });

    test('handles three arguments', () => {
      const emitter = new EventEmitter<MultiArgEvents>();
      const handler = mock(() => {});

      emitter.on('triple', handler);
      emitter.emit('triple', 'hello', 42, true);

      expect(handler).toHaveBeenCalledWith('hello', 42, true);
    });

    test('all handlers receive multiple arguments', () => {
      const emitter = new EventEmitter<MultiArgEvents>();
      const handler1 = mock(() => {});
      const handler2 = mock(() => {});

      emitter.on('job:failed', handler1);
      emitter.on('job:failed', handler2);

      const job = { id: 'test' };
      const error = new Error('fail');
      emitter.emit('job:failed', job, error);

      expect(handler1).toHaveBeenCalledWith(job, error);
      expect(handler2).toHaveBeenCalledWith(job, error);
    });

    test('handler error does not prevent other handlers from receiving all args', () => {
      const emitter = new EventEmitter<MultiArgEvents>();
      const errorHandler = mock(() => { throw new Error('handler error'); });
      const normalHandler = mock(() => {});

      emitter.on('job:failed', errorHandler);
      emitter.on('job:failed', normalHandler);

      const job = { id: 'test' };
      const error = new Error('job error');
      emitter.emit('job:failed', job, error);

      expect(normalHandler).toHaveBeenCalledWith(job, error);
    });
  });

  describe('removeAllListeners', () => {
    test('removes all listeners for specific event', () => {
      const emitter = new EventEmitter<TestEvents>();
      const messageHandler = mock(() => {});
      const countHandler = mock(() => {});

      emitter.on('message', messageHandler);
      emitter.on('count', countHandler);

      emitter.removeAllListeners('message');

      emitter.emit('message', 'test');
      emitter.emit('count', 42);

      expect(messageHandler).not.toHaveBeenCalled();
      expect(countHandler).toHaveBeenCalledTimes(1);
    });

    test('removes all listeners when no event specified', () => {
      const emitter = new EventEmitter<TestEvents>();
      const messageHandler = mock(() => {});
      const countHandler = mock(() => {});

      emitter.on('message', messageHandler);
      emitter.on('count', countHandler);

      emitter.removeAllListeners();

      emitter.emit('message', 'test');
      emitter.emit('count', 42);

      expect(messageHandler).not.toHaveBeenCalled();
      expect(countHandler).not.toHaveBeenCalled();
    });

    test('handles removing listeners for event with no handlers', () => {
      const emitter = new EventEmitter<TestEvents>();

      // Should not throw
      emitter.removeAllListeners('message');
    });
  });
});
