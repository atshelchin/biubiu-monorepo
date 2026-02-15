import type { StorageAdapter } from '../types.js';

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private prefix: string = '') {}

  get<T>(key: string): T | null {
    if (typeof window === 'undefined') return null;

    try {
      const value = localStorage.getItem(this.prefix + key);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch {
      // Storage error (e.g., quota exceeded) - ignore
    }
  }

  remove(key: string): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(this.prefix + key);
    } catch {
      // Ignore errors
    }
  }
}
