import React, { useEffect, useState } from 'react'
import { useWallets, usePrivy } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { formatEther } from 'viem'
import { useMultiChainBalance, getNativeTokenSymbol, type ChainBalance } from './multiChainBalanceUtils'
import { useNetworkContext } from '@/context'

export interface WalletInfo {
  address: string
  type: 'smart_wallet' | 'embedded' | 'external'
  balance?: string
  balanceFormatted?: string
  usdValue?: string
  isActive: boolean
  chainId?: number
  walletId?: string
}

export interface SmartWalletInfo {
  address: string
  balances: ChainBalance[]
  isActive: boolean
  walletId?: string
}

/**
 * Hook to get smart wallet information from user's linked accounts
 */
export const useSmartWallet = () => {
  const { user } = usePrivy()
  
  const smartWalletAccount = React.useMemo(() => {
    try {
      const accounts = (user as any)?.linkedAccounts || (user as any)?.linked_accounts || []
      return accounts.find((a: any) => (a?.type || '').toLowerCase() === 'smart_wallet') || null
    } catch { 
      return null 
    }
  }, [user])

  return smartWalletAccount
}

/**
 * Hook to get all wallet information including balances
 */
export const useWalletInfo = () => {
  const { wallets, ready } = useWallets()
  const { user } = usePrivy()
  const { address: activeAddress } = useAccount()
  const { smartWalletEnabled } = useNetworkContext()
  const smartWallet = useSmartWallet()
  
  const [walletInfos, setWalletInfos] = useState<WalletInfo[]>([])
  const [smartWalletInfo, setSmartWalletInfo] = useState<SmartWalletInfo | null>(null)

  // Fetch smart wallet balances from all enabled chains
  const { balances: smartWalletBalances, loading: smartWalletBalanceLoading } = useMultiChainBalance(
    smartWallet?.address || null
  )

  useEffect(() => {
    if (!ready || !wallets.length) {
      setWalletInfos([])
      setSmartWalletInfo(null)
      return
    }

    const buildWalletInfos = async () => {
      const infos: WalletInfo[] = []
      
      // Process connected wallets
      for (const wallet of wallets) {
        const isSmartWallet = smartWallet?.address === wallet.address
        const isActive = wallet.address === activeAddress
        
        infos.push({
          address: wallet.address,
          type: isSmartWallet ? 'smart_wallet' : (wallet.walletClientType === 'privy' ? 'embedded' : 'external'),
          isActive,
          chainId: typeof wallet.chainId === 'number' ? wallet.chainId : undefined,
          walletId: isSmartWallet ? smartWallet?.id : undefined
        })
      }

      // Add smart wallet info if it exists and is enabled
      if (smartWallet && smartWalletEnabled) {
        setSmartWalletInfo({
          address: smartWallet.address,
          balances: smartWalletBalances,
          isActive: true, // Smart wallet is always active when enabled
          walletId: smartWallet.id
        })
      }

      setWalletInfos(infos)
    }

    buildWalletInfos()
  }, [wallets, ready, activeAddress, smartWallet, smartWalletBalances])

  return {
    walletInfos,
    smartWalletInfo,
    smartWallet,
    ready,
    smartWalletBalanceLoading
  }
}

/**
 * Utility function to detect if an account is a smart wallet
 */
export const isSmartWallet = (account: any): boolean => {
  return (account?.type || '').toLowerCase() === 'smart_wallet'
}

/**
 * Utility function to get wallet type from wallet object
 */
export const getWalletType = (wallet: any, smartWalletAddress?: string): 'smart_wallet' | 'embedded' | 'external' => {
  if (smartWalletAddress && wallet.address === smartWalletAddress) {
    return 'smart_wallet'
  }
  return wallet.walletClientType === 'privy' ? 'embedded' : 'external'
}

/**
 * Utility function to format wallet address for display
 */
export const formatWalletAddress = (address: string): string => {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/**
 * Utility function to get wallet display name
 */
export const getWalletDisplayName = (wallet: WalletInfo): string => {
  switch (wallet.type) {
    case 'smart_wallet':
      return 'Smart Wallet'
    case 'embedded':
      return 'Embedded Wallet'
    case 'external':
      return 'External Wallet'
    default:
      return 'Unknown Wallet'
  }
}
