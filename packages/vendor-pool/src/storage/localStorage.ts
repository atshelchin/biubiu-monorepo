import type { StorageAdapter } from '../types.js';

/**
 * LocalStorage adapter for browser environments.
 * Data persists across page reloads.
 * All values are JSON serialized.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private prefix: string;

  constructor(prefix = 'vendor-pool:') {
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const raw = localStorage.getItem(this.getKey(key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(this.getKey(key), JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.removeItem(this.getKey(key));
  }

  async keys(prefix?: string): Promise<string[]> {
    if (typeof localStorage === 'undefined') {
      return [];
    }
    const result: string[] = [];
    const fullPrefix = prefix ? `${this.prefix}${prefix}` : this.prefix;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(fullPrefix)) {
        // Remove the adapter prefix to return the logical key
        result.push(key.slice(this.prefix.length));
      }
    }
    return result;
  }

  async clear(prefix?: string): Promise<void> {
    if (typeof localStorage === 'undefined') {
      return;
    }
    const keysToRemove: string[] = [];
    const fullPrefix = prefix ? `${this.prefix}${prefix}` : this.prefix;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(fullPrefix)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  }
}
