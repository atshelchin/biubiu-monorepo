import {
  createStore,
  InjectedConnector,
  RemoteInjectConnector,
  CoinbaseConnector,
  type ConnectKitState,
} from '@shelchin/eth-connectkit';
import { mainnet, base, sepolia, astar, kava, metis } from '@shelchin/eth-connectkit/chains';

// Supported chains (including uncommon ones to test addChain)
const chains = [mainnet, base, sepolia, astar, kava, metis];

// Create the connectkit store
export const connectKit = createStore({
  connectors: [
    new InjectedConnector({ chains, enableEIP6963: true }),
    new RemoteInjectConnector({
      serverUrl: 'https://remote-inject.awesometools.dev',
      chains,
    }),
    new CoinbaseConnector({ appName: 'ETH ConnectKit Demo', chains }),
  ],
  autoReconnect: true,
});

// Create a Svelte 5 rune-based reactive state
function createWalletState() {
  let state = $state<ConnectKitState>(connectKit.getState());

  // Subscribe to changes
  connectKit.subscribe((newState) => {
    state = newState;
  });

  return {
    get value() {
      return state;
    },
  };
}

export const walletState = createWalletState();

// Export chains for UI
export { chains };

// Helper to get chain name
export function getChainName(chainId: number | null): string {
  if (!chainId) return 'Unknown';
  const chain = chains.find((c) => c.id === chainId);
  return chain?.name ?? `Chain ${chainId}`;
}

// Helper to shorten address
export function shortenAddress(address: string | null): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
