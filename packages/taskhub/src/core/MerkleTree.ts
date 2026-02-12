/**
 * Merkle Tree Implementation
 * Used to generate deterministic task IDs from job inputs
 */

/**
 * Hash a string using SHA-256
 * Works in both browser (crypto.subtle) and Node.js/Bun (crypto)
 */
async function sha256(data: string): Promise<string> {
  // Prefer Node.js/Bun crypto module when available
  // Note: crypto.subtle has issues in Bun when used inside async generators
  // @ts-ignore - Bun global exists in Bun runtime
  if (typeof process !== 'undefined' && process.versions?.node || typeof globalThis.Bun !== 'undefined') {
    const { createHash } = await import('crypto');
    return createHash('sha256').update(data).digest('hex');
  }

  // Browser environment - use crypto.subtle
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('No crypto implementation available');
}

/**
 * Hash two hashes together (for building tree)
 */
async function hashPair(left: string, right: string): Promise<string> {
  // Sort to ensure consistent ordering
  const combined = left < right ? left + right : right + left;
  return sha256(combined);
}

/**
 * Calculate Merkle Root from a list of leaf values
 *
 * @param leaves - Array of strings to hash
 * @returns Merkle root hash, or empty string if no leaves
 */
export async function computeMerkleRoot(leaves: string[]): Promise<string> {
  if (leaves.length === 0) return '';
  if (leaves.length === 1) return sha256(leaves[0]);

  // Hash all leaves first
  let hashes = await Promise.all(leaves.map(leaf => sha256(leaf)));

  // Build tree level by level
  while (hashes.length > 1) {
    const nextLevel: Promise<string>[] = [];

    for (let i = 0; i < hashes.length; i += 2) {
      if (i + 1 < hashes.length) {
        nextLevel.push(hashPair(hashes[i], hashes[i + 1]));
      } else {
        // Odd number of nodes: hash with itself
        nextLevel.push(hashPair(hashes[i], hashes[i]));
      }
    }

    hashes = await Promise.all(nextLevel);
  }

  return hashes[0];
}

/**
 * Generate a unique job ID from input data
 *
 * @param input - Any JSON-serializable value
 * @returns Hash string
 */
export async function generateJobId(input: unknown): Promise<string> {
  const serialized = JSON.stringify(input);
  return sha256(serialized);
}

/**
 * Generate a task ID from a name and optional merkle root
 */
export async function generateTaskId(name: string, merkleRoot?: string): Promise<string> {
  const data = merkleRoot ? `${name}:${merkleRoot}` : `${name}:${Date.now()}`;
  return sha256(data);
}
