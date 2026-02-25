/**
 * Node/CLI createTaskHub factory
 * Includes all storage adapters (bun-sqlite, better-sqlite3, opfs, indexeddb, memory)
 */

import type { HubConfig, StorageAdapter } from '../types.js';
import { Hub } from './Hub.js';

/**
 * Create a TaskHub instance with auto-detected storage
 */
export async function createTaskHub(config: HubConfig = { storage: 'auto' }): Promise<Hub> {
  const storage = await createStorageAdapter(config);
  const hub = new Hub(storage);
  await hub.initialize();
  return hub;
}

async function createStorageAdapter(config: HubConfig): Promise<StorageAdapter> {
  const dbPath = config.dbPath ?? 'taskhub.db';

  switch (config.storage) {
    case 'memory': {
      const { MemoryAdapter } = await import('../storage/MemoryAdapter.js');
      return new MemoryAdapter();
    }

    case 'bun-sqlite': {
      const { BunSQLiteAdapter } = await import('../storage/BunSQLiteAdapter.js');
      return new BunSQLiteAdapter(dbPath);
    }

    case 'better-sqlite3': {
      const { NodeSQLiteAdapter } = await import('../storage/NodeSQLiteAdapter.js');
      return new NodeSQLiteAdapter(dbPath);
    }

    case 'opfs': {
      const { OPFSAdapter } = await import('../storage/OPFSAdapter.js');
      return new OPFSAdapter(config.opfs);
    }

    case 'indexeddb': {
      const { IndexedDBAdapter } = await import('../storage/IndexedDBAdapter.js');
      return new IndexedDBAdapter();
    }

    case 'auto':
    default:
      return autoDetectStorage(dbPath, config.opfs);
  }
}

async function autoDetectStorage(dbPath: string, opfsConfig?: HubConfig['opfs']): Promise<StorageAdapter> {
  // Check if running in Bun
  if (typeof Bun !== 'undefined') {
    const { BunSQLiteAdapter } = await import('../storage/BunSQLiteAdapter.js');
    console.log('[TaskHub] Storage: BunSQLite (%s)', dbPath);
    return new BunSQLiteAdapter(dbPath);
  }

  // Check if running in Node.js
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { NodeSQLiteAdapter } = await import('../storage/NodeSQLiteAdapter.js');
    console.log('[TaskHub] Storage: NodeSQLite (%s)', dbPath);
    return new NodeSQLiteAdapter(dbPath);
  }

  // Browser environment
  if (typeof window !== 'undefined') {
    // Try OPFS first (must verify initialization — construction alone won't fail)
    if (navigator?.storage?.getDirectory) {
      try {
        const { OPFSAdapter } = await import('../storage/OPFSAdapter.js');
        const adapter = new OPFSAdapter(opfsConfig);
        await adapter.initialize();
        console.log('[TaskHub] Storage: OPFS SQLite');
        return adapter;
      } catch {
        // OPFS not available (sqlite3.js not loaded, etc.), fall through to IndexedDB
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

  throw new Error('Unable to detect environment for storage adapter');
}
