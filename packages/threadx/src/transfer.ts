/**
 * Transferable marking utility
 */

/** Symbol to identify transfer descriptors */
export const TRANSFER = Symbol('threadx.transfer');

/** Descriptor for transferable values */
export interface TransferDescriptor<T = unknown> {
  [TRANSFER]: true;
  value: T;
  transferables: Transferable[];
}

/**
 * Mark a value as Transferable for zero-copy transfer to Worker
 *
 * @example
 * // Single transferable
 * const buffer = new ArrayBuffer(1024)
 * await worker.process(t(buffer))
 * // buffer.byteLength === 0 (transferred)
 *
 * @example
 * // Object with specified transferables
 * const data = { image: buffer, meta: info }
 * await worker.process(t(data, [buffer]))
 */
export function t<T extends Transferable>(value: T): TransferDescriptor<T>;
export function t<T>(value: T, transferables: Transferable[]): TransferDescriptor<T>;
export function t<T>(value: T, transferables?: Transferable[]): TransferDescriptor<T> {
  return {
    [TRANSFER]: true,
    value,
    transferables: transferables ?? [value as unknown as Transferable],
  };
}

/**
 * Check if a value is a transfer descriptor
 */
export function isTransferDescriptor(value: unknown): value is TransferDescriptor {
  return typeof value === 'object' && value !== null && TRANSFER in value;
}

/**
 * Process arguments to extract transferables
 */
export function prepareArgs(args: unknown[]): { args: unknown[]; transfer: Transferable[] } {
  const transfer: Transferable[] = [];
  const processedArgs = args.map((arg) => {
    if (isTransferDescriptor(arg)) {
      transfer.push(...arg.transferables);
      return arg.value;
    }
    return arg;
  });
  return { args: processedArgs, transfer };
}
