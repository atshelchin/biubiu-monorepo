import type { Chain } from '../types.js';

export const mainnet: Chain = {
  id: 1,
  name: 'Ethereum',
  network: 'mainnet',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://eth.llamarpc.com'] },
    public: { http: ['https://eth.llamarpc.com'] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: 'https://etherscan.io' },
  },
};

export const sepolia: Chain = {
  id: 11155111,
  name: 'Sepolia',
  network: 'sepolia',
  nativeCurrency: {
    name: 'Sepolia Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.sepolia.org'] },
    public: { http: ['https://rpc.sepolia.org'] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: 'https://sepolia.etherscan.io' },
  },
};

export const base: Chain = {
  id: 8453,
  name: 'Base',
  network: 'base',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://mainnet.base.org'] },
    public: { http: ['https://mainnet.base.org'] },
  },
  blockExplorers: {
    default: { name: 'Basescan', url: 'https://basescan.org' },
  },
};

export const baseSepolia: Chain = {
  id: 84532,
  name: 'Base Sepolia',
  network: 'base-sepolia',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://sepolia.base.org'] },
    public: { http: ['https://sepolia.base.org'] },
  },
  blockExplorers: {
    default: { name: 'Basescan', url: 'https://sepolia.basescan.org' },
  },
};

export const polygon: Chain = {
  id: 137,
  name: 'Polygon',
  network: 'polygon',
  nativeCurrency: {
    name: 'MATIC',
    symbol: 'MATIC',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://polygon-rpc.com'] },
    public: { http: ['https://polygon-rpc.com'] },
  },
  blockExplorers: {
    default: { name: 'Polygonscan', url: 'https://polygonscan.com' },
  },
};

export const arbitrum: Chain = {
  id: 42161,
  name: 'Arbitrum One',
  network: 'arbitrum',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://arb1.arbitrum.io/rpc'] },
    public: { http: ['https://arb1.arbitrum.io/rpc'] },
  },
  blockExplorers: {
    default: { name: 'Arbiscan', url: 'https://arbiscan.io' },
  },
};

export const optimism: Chain = {
  id: 10,
  name: 'Optimism',
  network: 'optimism',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://mainnet.optimism.io'] },
    public: { http: ['https://mainnet.optimism.io'] },
  },
  blockExplorers: {
    default: { name: 'Optimism Explorer', url: 'https://optimistic.etherscan.io' },
  },
};

export const bsc: Chain = {
  id: 56,
  name: 'BNB Smart Chain',
  network: 'bsc',
  nativeCurrency: {
    name: 'BNB',
    symbol: 'BNB',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://bsc-dataseed.binance.org'] },
    public: { http: ['https://bsc-dataseed.binance.org'] },
  },
  blockExplorers: {
    default: { name: 'BscScan', url: 'https://bscscan.com' },
  },
};

// Less common chains for testing addChain functionality

export const fantom: Chain = {
  id: 250,
  name: 'Fantom Opera',
  network: 'fantom',
  nativeCurrency: {
    name: 'Fantom',
    symbol: 'FTM',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.ftm.tools'] },
    public: { http: ['https://rpc.ftm.tools'] },
  },
  blockExplorers: {
    default: { name: 'FTMScan', url: 'https://ftmscan.com' },
  },
};

export const gnosis: Chain = {
  id: 100,
  name: 'Gnosis',
  network: 'gnosis',
  nativeCurrency: {
    name: 'xDAI',
    symbol: 'xDAI',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.gnosischain.com'] },
    public: { http: ['https://rpc.gnosischain.com'] },
  },
  blockExplorers: {
    default: { name: 'Gnosisscan', url: 'https://gnosisscan.io' },
  },
};

export const celo: Chain = {
  id: 42220,
  name: 'Celo',
  network: 'celo',
  nativeCurrency: {
    name: 'CELO',
    symbol: 'CELO',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://forno.celo.org'] },
    public: { http: ['https://forno.celo.org'] },
  },
  blockExplorers: {
    default: { name: 'Celoscan', url: 'https://celoscan.io' },
  },
};

export const moonbeam: Chain = {
  id: 1284,
  name: 'Moonbeam',
  network: 'moonbeam',
  nativeCurrency: {
    name: 'GLMR',
    symbol: 'GLMR',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.api.moonbeam.network'] },
    public: { http: ['https://rpc.api.moonbeam.network'] },
  },
  blockExplorers: {
    default: { name: 'Moonscan', url: 'https://moonbeam.moonscan.io' },
  },
};

export const zkSync: Chain = {
  id: 324,
  name: 'zkSync Era',
  network: 'zksync',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://mainnet.era.zksync.io'] },
    public: { http: ['https://mainnet.era.zksync.io'] },
  },
  blockExplorers: {
    default: { name: 'zkSync Explorer', url: 'https://explorer.zksync.io' },
  },
};

export const linea: Chain = {
  id: 59144,
  name: 'Linea',
  network: 'linea',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.linea.build'] },
    public: { http: ['https://rpc.linea.build'] },
  },
  blockExplorers: {
    default: { name: 'Lineascan', url: 'https://lineascan.build' },
  },
};

// Very uncommon chains for testing addChain

export const astar: Chain = {
  id: 592,
  name: 'Astar',
  network: 'astar',
  nativeCurrency: {
    name: 'ASTR',
    symbol: 'ASTR',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://evm.astar.network'] },
    public: { http: ['https://evm.astar.network'] },
  },
  blockExplorers: {
    default: { name: 'Astar Subscan', url: 'https://astar.subscan.io' },
  },
};

export const kava: Chain = {
  id: 2222,
  name: 'Kava',
  network: 'kava',
  nativeCurrency: {
    name: 'KAVA',
    symbol: 'KAVA',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://evm.kava.io'] },
    public: { http: ['https://evm.kava.io'] },
  },
  blockExplorers: {
    default: { name: 'Kava Explorer', url: 'https://kavascan.com' },
  },
};

export const metis: Chain = {
  id: 1088,
  name: 'Metis Andromeda',
  network: 'metis',
  nativeCurrency: {
    name: 'Metis',
    symbol: 'METIS',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://andromeda.metis.io/?owner=1088'] },
    public: { http: ['https://andromeda.metis.io/?owner=1088'] },
  },
  blockExplorers: {
    default: { name: 'Metis Explorer', url: 'https://andromeda-explorer.metis.io' },
  },
};
