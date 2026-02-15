import type { EIP6963ProviderDetail, EIP6963AnnounceProviderEvent } from '../types.js';

export interface EIP6963Store {
  getProviders(): EIP6963ProviderDetail[];
  findProvider(rdns: string): EIP6963ProviderDetail | undefined;
  subscribe(callback: (providers: EIP6963ProviderDetail[]) => void): () => void;
  destroy(): void;
}

/**
 * Creates an EIP-6963 provider discovery store.
 * Automatically listens for wallet provider announcements.
 */
export function createEIP6963Store(): EIP6963Store {
  const providers = new Map<string, EIP6963ProviderDetail>();
  const listeners = new Set<(providers: EIP6963ProviderDetail[]) => void>();

  const handleAnnounce = (event: Event) => {
    const { detail } = event as EIP6963AnnounceProviderEvent;

    // Use UUID as key to handle multiple instances
    providers.set(detail.info.uuid, detail);

    // Notify listeners
    const snapshot = Array.from(providers.values());
    for (const listener of listeners) {
      try {
        listener(snapshot);
      } catch {
        // Ignore listener errors
      }
    }
  };

  // Start listening for announcements
  if (typeof window !== 'undefined') {
    window.addEventListener('eip6963:announceProvider', handleAnnounce);

    // Request providers from already-loaded wallets
    window.dispatchEvent(new Event('eip6963:requestProvider'));
  }

  return {
    getProviders(): EIP6963ProviderDetail[] {
      return Array.from(providers.values());
    },

    findProvider(rdns: string): EIP6963ProviderDetail | undefined {
      for (const detail of providers.values()) {
        if (detail.info.rdns === rdns) {
          return detail;
        }
      }
      return undefined;
    },

    subscribe(callback: (providers: EIP6963ProviderDetail[]) => void): () => void {
      listeners.add(callback);
      // Emit current state immediately
      callback(Array.from(providers.values()));
      return () => listeners.delete(callback);
    },

    destroy(): void {
      if (typeof window !== 'undefined') {
        window.removeEventListener('eip6963:announceProvider', handleAnnounce);
      }
      providers.clear();
      listeners.clear();
    },
  };
}
