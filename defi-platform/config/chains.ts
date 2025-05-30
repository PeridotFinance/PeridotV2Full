import { type Chain } from 'viem';

export const soneiumMinato = {
  id: 1946, // Replace with actual chain ID
  name: 'Soneium Minato',
  nativeCurrency: {
    decimals: 18,
    name: 'Soneium Ether', // Replace if different
    symbol: 'sETH', // Replace if different
  },
  rpcUrls: {
    public: { http: ['https://soneium-minato.drpc.org'] }, // Replace with actual RPC URL
    default: { http: ['https://soneium-minato.drpc.org'] }, // Replace with actual RPC URL
  },
  // blockExplorers: { // Optional: Add block explorer details
  //   default: { name: 'SoneiumScan', url: 'https://soneiumscan.example.com' },
  // },
  // testnet: true, // Set to true if it's a testnet
} as const satisfies Chain; 