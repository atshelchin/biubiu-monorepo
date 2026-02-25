import type { FileStorage, FileRef } from '../types.js';

interface StoredFile {
  data: Uint8Array;
  meta: Omit<FileRef, 'handle'>;
}

/**
 * In-memory file storage for temporary files
 *
 * Useful for testing and short-lived executions.
 * For production, consider implementing a persistent storage adapter.
 */
export class MemoryStorage implements FileStorage {
  private files = new Map<string, StoredFile>();

  async store(
    data: Uint8Array,
    options?: { mimeType?: string; filename?: string }
  ): Promise<FileRef> {
    const handle = crypto.randomUUID();
    const meta: Omit<FileRef, 'handle'> = {
      mimeType: options?.mimeType ?? 'application/octet-stream',
      filename: options?.filename,
      size: data.byteLength,
      temporary: true,
    };

    this.files.set(handle, { data, meta });

    return { handle, ...meta };
  }

  async retrieve(handle: string): Promise<Uint8Array | null> {
    return this.files.get(handle)?.data ?? null;
  }

  async delete(handle: string): Promise<void> {
    this.files.delete(handle);
  }

  async getMetadata(handle: string): Promise<Omit<FileRef, 'handle'> | null> {
    return this.files.get(handle)?.meta ?? null;
  }

  /**
   * Clear all stored files
   */
  clear(): void {
    this.files.clear();
  }

  /**
   * Get the number of stored files
   */
  get size(): number {
    return this.files.size;
  }

  /**
   * Get total bytes stored
   */
  get totalBytes(): number {
    let total = 0;
    for (const file of this.files.values()) {
      total += file.data.byteLength;
    }
    return total;
  }
}
