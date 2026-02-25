type EventMap = Record<string, (...args: any[]) => void>;

export class EventEmitter<T extends EventMap> {
  private listeners = new Map<keyof T, Set<T[keyof T]>>();

  on<K extends keyof T>(event: K, listener: T[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off<K extends keyof T>(event: K, listener: T[K]): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      for (const listener of eventListeners) {
        try {
          (listener as (...args: any[]) => void)(...args);
        } catch {
          // Ignore listener errors
        }
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
