import { createWalletClient, custom, defineChain } from 'viem'
import { arbitrum, base, bsc, mainnet, optimism, polygon, avalanche } from 'viem/chains'
import { monadTestnetContracts, monadMainnetContracts } from '@/config/contracts'

export type InjectedProvider = {
  request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  providers?: InjectedProvider[]
  isMetaMask?: boolean
  isCoinbaseWallet?: boolean
  isPhantom?: boolean
  isPhantomEthereum?: boolean
  [key: string]: unknown
}

export type ProviderMatch = 'accounts' | 'isMetaMask' | 'first'

export interface ProviderSelection {
  provider: InjectedProvider
  candidates: InjectedProvider[]
  matched: ProviderMatch
}

const getGlobalEthereum = (): InjectedProvider | undefined => {
  const anyGlobal = globalThis as any
  return anyGlobal?.ethereum || anyGlobal?.window?.ethereum
}

const getCandidateProviders = (base: InjectedProvider): InjectedProvider[] => {
  if (!base) return []
  const list = Array.isArray(base.providers) ? base.providers.filter(Boolean) : []
  return list.length ? list : [base]
}

export const selectInjectedProvider = async (userAddress?: string): Promise<ProviderSelection> => {
  const base = getGlobalEthereum()
  if (!base) {
    throw new Error('No wallet provider found for signing')
  }

  const candidates = getCandidateProviders(base)
  if (!candidates.length) {
    throw new Error('No wallet provider found for signing')
  }

  let provider = candidates[0]
  let matched: ProviderMatch = 'first'

  const lowerUser = (userAddress || '').toLowerCase()
  if (lowerUser) {
    for (const candidate of candidates) {
      try {
        const accounts = (await candidate.request?.({ method: 'eth_accounts' })) as string[] | undefined
        if (Array.isArray(accounts) && accounts.some((acct) => (acct || '').toLowerCase() === lowerUser)) {
          provider = candidate
          matched = 'accounts'
          break
        }
      } catch {
        // Ignore request errors; fall through to other strategies
      }
    }
  }

  if (matched !== 'accounts') {
    const byFlag = candidates.find((p) => p?.isMetaMask) || provider
    if (byFlag !== provider) {
      provider = byFlag
      matched = 'isMetaMask'
    }
  }

  return { provider, candidates, matched }
}

export const createWalletClientForProvider = (provider: InjectedProvider) => {
  return createWalletClient({ transport: custom(provider as any) })
}

export const describeProviders = (providers: InjectedProvider[]) => {
  return providers.map((p) => ({
    isMetaMask: !!p?.isMetaMask,
    isCoinbase: !!p?.isCoinbaseWallet,
    isPhantom: !!p?.isPhantom || !!p?.isPhantomEthereum,
  }))
}

// Define Monad chains for viem
const monadTestnet = defineChain({
  id: monadTestnetContracts.chainId,
  name: monadTestnetContracts.chainNameReadable,
  nativeCurrency: { name: 'Monad', symbol: 'MONAD', decimals: 18 },
  rpcUrls: {
    default: { http: [monadTestnetContracts.rpcUrl] },
    public: { http: [monadTestnetContracts.rpcUrl] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: monadTestnetContracts.explorer },
  },
  testnet: true,
})

const monadMainnet = defineChain({
  id: monadMainnetContracts.chainId,
  name: monadMainnetContracts.chainNameReadable,
  nativeCurrency: { name: 'Monad', symbol: 'MONAD', decimals: 18 },
  rpcUrls: {
    default: { http: [monadMainnetContracts.rpcUrl] },
    public: { http: [monadMainnetContracts.rpcUrl] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: monadMainnetContracts.explorer },
  },
  testnet: false,
})

export const CHAIN_BY_ID: Record<number, any> = {
  [bsc.id]: bsc,
  [arbitrum.id]: arbitrum,
  [mainnet.id]: mainnet,
  [optimism.id]: optimism,
  [base.id]: base,
  [polygon.id]: polygon,
  [avalanche.id]: avalanche,
  [monadTestnet.id]: monadTestnet,
  [monadMainnet.id]: monadMainnet,
}

// Helper function to detect if we're using a Privy provider
export const isPrivyProvider = (provider: InjectedProvider): boolean => {
  if (!provider) return false
  
  // Check for Privy-specific properties
  if (provider.isPrivy) return true
  
  // Check constructor name
  if (provider.constructor?.name?.includes('Privy')) return true
  
  // Check if the provider has Privy-specific methods or properties
  if (provider.request && typeof provider.request === 'function') {
    try {
      const requestStr = provider.request.toString()
      if (requestStr.includes('privy') || requestStr.includes('Privy')) return true
    } catch {}
  }
  
  // Check for Privy-specific properties that might be present
  if (provider._privy || provider.privy || provider.__privy) return true
  
  // Check if it's a Privy embedded wallet by looking for specific methods
  if (provider.sendTransaction && !provider.signTransaction) {
    // Privy embedded wallets typically have sendTransaction but not signTransaction
    return true
  }
  
  return false
}
