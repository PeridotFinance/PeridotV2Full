/**
 * Chain metadata for the dataroom.
 *
 * Kept local instead of derived from `config/contracts.ts` on purpose: the
 * dataroom shows *history*, so it has to name chains we no longer deploy to
 * (Somnia testnet, Base/Arbitrum Sepolia) as well as the live ones. The
 * network flag also decides which side of the Mainnet/Testnet toggle a row
 * lands on, independent of NEXT_PUBLIC_NETWORK_PRESET.
 */

export type DataroomNetwork = 'mainnet' | 'testnet'

export interface DataroomChainMeta {
  name: string
  short: string
  network: DataroomNetwork
  logo: string
  /** Chain brand color — used for the identity dot, never to encode magnitude. */
  color: string
}

const CHAIN_META: Record<number, DataroomChainMeta> = {
  1: { name: 'Ethereum', short: 'ETH', network: 'mainnet', logo: '/tokenimages/app/ethereum-eth-logo.svg', color: '#627eea' },
  56: { name: 'BNB Chain', short: 'BSC', network: 'mainnet', logo: '/tokenimages/app/bnb-logo.svg', color: '#f0b90b' },
  137: { name: 'Polygon', short: 'POL', network: 'mainnet', logo: '/tokenimages/app/polygon-matic-logo.svg', color: '#8247e5' },
  143: { name: 'Monad', short: 'MON', network: 'mainnet', logo: '/tokenimages/app/Monad-Logo.svg', color: '#836ef9' },
  8453: { name: 'Base', short: 'BASE', network: 'mainnet', logo: '/tokenimages/app/base-logo.svg', color: '#0052ff' },
  42161: { name: 'Arbitrum', short: 'ARB', network: 'mainnet', logo: '/tokenimages/app/arbitrum-logo.svg', color: '#12aaff' },
  43114: { name: 'Avalanche', short: 'AVAX', network: 'mainnet', logo: '/tokenimages/app/avax.png', color: '#e84142' },
  56457: { name: 'Stellar', short: 'XLM', network: 'mainnet', logo: '/tokenimages/app/stellar.svg', color: '#7d00ff' },
  1868: { name: 'Somnia', short: 'SOMI', network: 'mainnet', logo: '/tokenimages/app/somnia_logo_color.jpg', color: '#ff4fa3' },

  97: { name: 'BNB Chain Testnet', short: 'tBSC', network: 'testnet', logo: '/tokenimages/app/bnb-logo.svg', color: '#f0b90b' },
  10143: { name: 'Monad Testnet', short: 'tMON', network: 'testnet', logo: '/tokenimages/app/Monad-Logo.svg', color: '#836ef9' },
  50312: { name: 'Somnia Testnet', short: 'tSOMI', network: 'testnet', logo: '/tokenimages/app/somnia_logo_color.jpg', color: '#ff4fa3' },
  84532: { name: 'Base Sepolia', short: 'tBASE', network: 'testnet', logo: '/tokenimages/app/base-logo.svg', color: '#0052ff' },
  421614: { name: 'Arbitrum Sepolia', short: 'tARB', network: 'testnet', logo: '/tokenimages/app/arbitrum-logo.svg', color: '#12aaff' },
  11155111: { name: 'Ethereum Sepolia', short: 'tETH', network: 'testnet', logo: '/tokenimages/app/ethereum-eth-logo.svg', color: '#627eea' },
  1075: { name: 'IOTA EVM Testnet', short: 'tIOTA', network: 'testnet', logo: '/tokenimages/app/iota-iota-logo.svg', color: '#00e0ca' },
}

export function getChainMeta(chainId: number): DataroomChainMeta {
  return (
    CHAIN_META[chainId] ?? {
      name: `Chain ${chainId}`,
      short: String(chainId),
      // Unknown ids are almost always leftovers from a test deployment.
      network: 'testnet',
      logo: '/tokenimages/app/ethereum-eth-logo.svg',
      color: '#8a8a8a',
    }
  )
}
