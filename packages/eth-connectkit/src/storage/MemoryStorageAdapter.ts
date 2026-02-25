import type { StorageAdapter } from '../types.js';

export class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, unknown>();

  get<T>(key: string): T | null {
    const value = this.store.get(key);
    return value !== undefined ? (value as T) : null;
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, value);
  }

  remove(key: string): void {
    this.store.delete(key);
  }
}
