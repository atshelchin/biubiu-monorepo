/**
 * Simple typed event emitter with support for multiple arguments
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventHandler<T extends any[] = any[]> = (...args: T) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class EventEmitter<TEvents extends Record<string, (...args: any[]) => void>> {
  private handlers = new Map<keyof TEvents, Set<EventHandler>>();

  on<K extends keyof TEvents>(event: K, handler: TEvents[K]): () => void {
    let handlers = this.handlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(event, handlers);
    }
    handlers.add(handler as EventHandler);

    // Return unsubscribe function
    return () => {
      handlers?.delete(handler as EventHandler);
    };
  }

  off<K extends keyof TEvents>(event: K, handler: TEvents[K]): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler);
    }
  }

  emit<K extends keyof TEvents>(event: K, ...args: Parameters<TEvents[K]>): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (err) {
          console.error(`Error in event handler for "${String(event)}":`, err);
        }
      }
    }
  }

  removeAllListeners(event?: keyof TEvents): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
}
