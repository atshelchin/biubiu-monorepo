/**
 * Browser-compatible createTaskHub factory
 *
 * In browser: uses OPFS → IndexedDB (no bun:sqlite or better-sqlite3)
 * In Bun/Node: delegates to the main entry via runtime dynamic import
 *              (new Function prevents bundler static analysis)
 */

import type { HubConfig, StorageAdapter } from '../types.js';
import { Hub } from './Hub.js';

/**
 * Create a TaskHub instance with auto-detected storage
 */
export async function createTaskHub(config: HubConfig = { storage: 'auto' }): Promise<Hub> {
  // Non-browser: delegate to main entry which has all adapters
  if ('Bun' in globalThis || (typeof process !== 'undefined' && process.versions?.node)) {
    // new Function hides import() from bundler static analysis — only evaluated in Bun/Node
    const dynamicImport = new Function('p', 'return import(p)') as (p: string) => Promise<any>;
    const taskhub = await dynamicImport('@shelchin/taskhub');
    return taskhub.createTaskHub(config);
  }

  const storage = await createStorageAdapter(config);
  const hub = new Hub(storage);
  await hub.initialize();
  return hub;
}

async function createStorageAdapter(config: HubConfig): Promise<StorageAdapter> {
  switch (config.storage) {
    case 'memory': {
      const { MemoryAdapter } = await import('../storage/MemoryAdapter.js');
      return new MemoryAdapter();
    }

    case 'opfs': {
      const { OPFSAdapter } = await import('../storage/OPFSAdapter.js');
      return new OPFSAdapter(config.opfs);
    }

    case 'indexeddb': {
      const { IndexedDBAdapter } = await import('../storage/IndexedDBAdapter.js');
      return new IndexedDBAdapter();
    }

    case 'bun-sqlite':
    case 'better-sqlite3':
      throw new Error(`Storage "${config.storage}" is not available in browser environments. Use "opfs", "indexeddb", or "auto".`);

    case 'auto':
    default:
      return autoDetectStorage(config.opfs);
  }
}

async function autoDetectStorage(opfsConfig?: HubConfig['opfs']): Promise<StorageAdapter> {
  // Try OPFS first
  if (typeof navigator !== 'undefined' && navigator?.storage?.getDirectory) {
    try {
      const { OPFSAdapter } = await import('../storage/OPFSAdapter.js');
      const adapter = new OPFSAdapter(opfsConfig);
      await adapter.initialize();
      console.log('[TaskHub] Storage: OPFS SQLite');
      return adapter;
    } catch {
      // OPFS not available, fall through to IndexedDB
    }
  }

  // Fall back to IndexedDB
  if (typeof indexedDB !== 'undefined') {
    const { IndexedDBAdapter } = await import('../storage/IndexedDBAdapter.js');
    console.log('[TaskHub] Storage: IndexedDB');
    return new IndexedDBAdapter();
  }

  throw new Error('No supported storage adapter available in this browser');
}
