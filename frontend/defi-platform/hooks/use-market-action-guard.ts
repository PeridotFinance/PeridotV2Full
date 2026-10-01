import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useSwitchChain } from 'wagmi'
import { CHAIN_IDS, isHubChain, hasOwnMarkets, isStellarNetwork } from '@/config/contracts'
import type { AccountType } from '@/types/wallet'
import { FEATURE_FLAGS } from '@/config/featureFlags'

type Params = {
  chainId?: number
  selectedNetworkId?: string | null
  accountType: AccountType
  eligibleForSponsored: boolean
  sponsoredReason?: string
}

type GuardResult = {
  isHubNetwork: boolean
  hasOwnMarkets: boolean
  isCrossChainNetwork: boolean
  allowBorrow: boolean
  allowWithdraw: boolean
  showBorrowBlockedToast: () => void
  showWithdrawBlockedToast: () => void
  sponsoredTooltip?: string
  crossChainSmartAccountNotice?: string
  hubSmartAccountNotice?: string
  testnetSpokeNotice?: string
}

export function useMarketActionGuard({
  chainId,
  selectedNetworkId,
  accountType,
  eligibleForSponsored,
  sponsoredReason,
}: Params): GuardResult {
  const { switchChainAsync } = useSwitchChain()

  const isStellar = useMemo(() => isStellarNetwork(selectedNetworkId), [selectedNetworkId])
  const isHubNetwork = useMemo(() => (typeof chainId === 'number' ? isHubChain(chainId) : false), [chainId])
  const hasOwnMarketsFlag = useMemo(() => (typeof chainId === 'number' ? hasOwnMarkets(chainId) : false), [chainId])
  const isCrossChainNetwork = useMemo(
    () => Boolean(chainId) && !hasOwnMarketsFlag && !isStellar,
    [chainId, hasOwnMarketsFlag, isStellar]
  )
  const isSmartAccount = accountType === 'SMART_ACCOUNT'

  // Allow borrow/withdraw for smart accounts OR when on chains with their own markets
  // Stellar is non-EVM; allow actions based on its own flow instead of last EVM chainId.
  // With cross-chain borrow enabled, EOAs can also borrow on spoke chains via Biconomy
  const allowBorrow = isStellar || isSmartAccount || hasOwnMarketsFlag || (FEATURE_FLAGS.CROSS_CHAIN_BORROW_BICONOMY && isCrossChainNetwork)
  const allowWithdraw = isStellar || isSmartAccount || hasOwnMarketsFlag

  const showBlockedToast = useCallback(
    (action: 'borrow' | 'withdraw') => {
      const title = action === 'borrow' ? 'Borrow on supported chain or upgrade' : 'Withdraw on supported chain or upgrade'
      const description = action === 'borrow' && FEATURE_FLAGS.CROSS_CHAIN_BORROW_BICONOMY
        ? 'Cross-chain borrow is now available! If you see this message, there may be a temporary issue. Try switching to a hub chain or use a Peridot smart account (Google login).'
        : 'This action is disabled on unsupported chains for standard wallets. Switch to a supported chain or continue with a Peridot smart account (Google login).'

      toast(title, {
        description,
        action: {
          label: 'Switch to Supported Chain',
          onClick: async () => {
            try {
              // Determine appropriate hub chain based on current network
              // For testnet, prefer BSC testnet as the primary hub
              // For mainnet, use BSC mainnet
              const isTestnetPreset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || '').startsWith('testnet')
              const targetHubChain = isTestnetPreset ? CHAIN_IDS.BSC_TESTNET : CHAIN_IDS.BSC_MAINNET
              await switchChainAsync({ chainId: targetHubChain })
            } catch (error) {
              console.error('Failed to switch to supported chain:', error)
            }
          },
        },
      })
    },
    [switchChainAsync, chainId]
  )

  const sponsoredTooltip = useMemo(() => {
    if (!isSmartAccount) {
      return 'Pay Fusion fees with a token you already hold on hub chains. Upgrade to a Peridot smart account to unlock fully sponsored (gasless) execution when available.'
    }
    if (eligibleForSponsored) {
      return 'Sponsored mode lets Biconomy cover gas fees for this borrow when available. Leave it on for gasless execution.'
    }
    return (
      sponsoredReason ||
      'Sponsored mode uses Biconomy credits to cover gas. Complete the required steps to become eligible, or use wallet-funded execution.'
    )
  }, [eligibleForSponsored, isSmartAccount, sponsoredReason])

  const crossChainSmartAccountNotice = useMemo(() => {
    if (!isCrossChainNetwork || !isSmartAccount) return undefined
    return 'Smart accounts can borrow cross-chain. Choose "Fusion · Gasless" for sponsored execution or switch to wallet gas if you prefer to pay fees from the borrowed asset.'
  }, [isCrossChainNetwork, isSmartAccount])

  const hubSmartAccountNotice = useMemo(() => {
    if (!isHubNetwork || !isSmartAccount) return undefined
    return 'Fusion (gasless) on hub chains is still stabilizing. For guaranteed execution you can use the standard wallet gas option.'
  }, [isHubNetwork, isSmartAccount])

  const testnetSpokeNotice = useMemo(() => {
    if (!chainId || isHubNetwork || hasOwnMarketsFlag) return undefined
    
    // Check if this is a testnet spoke chain
    const isTestnetSpoke = chainId === CHAIN_IDS.ARBITRUM_SEPOLIA ||
                          chainId === CHAIN_IDS.BASE_SEPOLIA ||
                          chainId === CHAIN_IDS.ETHEREUM_SEPOLIA
    
    if (isTestnetSpoke) {
      return 'Testnet spoke chains are view-only for safety. Supply and borrow actions are disabled. Use mainnet or testnet hub chains (BSC or Monad) for full functionality.'
    }
    
    return undefined
  }, [chainId, isHubNetwork, hasOwnMarketsFlag])

  return {
    isHubNetwork,
    hasOwnMarkets: hasOwnMarketsFlag,
    isCrossChainNetwork,
    allowBorrow,
    allowWithdraw,
    showBorrowBlockedToast: () => showBlockedToast('borrow'),
    showWithdrawBlockedToast: () => showBlockedToast('withdraw'),
    sponsoredTooltip,
    crossChainSmartAccountNotice,
    hubSmartAccountNotice,
    testnetSpokeNotice,
  }
}

export default useMarketActionGuard
