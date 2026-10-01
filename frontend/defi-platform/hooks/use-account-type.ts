import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import type { Address } from 'viem'
import { useSmartAccountUpgrade } from '@/components/providers/SmartAccountUpgradeProvider'
import { getAccountTypeExternal, getAccountTypeFromProviderContext, getSponsoredEligibility } from '@/lib/wallet/accountDetection'
import { isSmartAccountEnabled } from '@/lib/smartAccountPreference'
import type { AccountType } from '@/types/wallet'
import { useActiveWallet } from '@/hooks/use-active-wallet'

type State = {
  accountType: AccountType
  eligibleForSponsored: boolean
  reason?: string
  isLoading: boolean
}

export function useAccountType(): State {
  const { chainId } = useAccount()
  const { address, isConnected, isSmartAccountActive } = useActiveWallet()
  const { status } = useSmartAccountUpgrade()
  const [accountType, setAccountType] = useState<AccountType>('EOA')
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [upgradeReady, setUpgradeReady] = useState<boolean>(false)

  const providerType = useMemo(() => getAccountTypeFromProviderContext(status), [status])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!isConnected || !address) {
        setAccountType('EOA')
        setIsLoading(false)
        setUpgradeReady(false)
        return
      }

      setIsLoading(true)
      try {
        const capability = status.atomicCapability
        const hasSmartHint = Boolean(status.smartAccountAddress)

        let initial: AccountType = providerType
        if (isSmartAccountActive || providerType === 'SMART_ACCOUNT' || capability === 'supported' || hasSmartHint) {
          initial = 'SMART_ACCOUNT'
        }

        // User preference gate: only apply for non-Privy flows (legacy Biconomy upgrade prompt).
        // When isSmartAccountActive is true, Privy already manages the smart-wallet preference
        // via NetworkContext.smartWalletEnabled — the localStorage gate uses the EOA signer address
        // as its key, not the smart account address, so checking it here would wrongly downgrade.
        if (initial === 'SMART_ACCOUNT' && address && !isSmartAccountActive && !isSmartAccountEnabled(address as `0x${string}`)) {
          initial = 'EOA'
        }

        if (!cancelled) {
          setAccountType(initial)
          setUpgradeReady(capability === 'ready')
        }

        if (initial !== 'SMART_ACCOUNT') {
          const addr = address as Address
          const ext = await getAccountTypeExternal(addr, chainId)
          if (!cancelled) setAccountType(ext)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [address, chainId, isConnected, providerType, status.atomicCapability, status.smartAccountAddress])

  const eligibility = useMemo(() => getSponsoredEligibility(accountType, chainId), [accountType, chainId])
  const finalReason = useMemo(() => {
    if (upgradeReady && accountType !== 'SMART_ACCOUNT') return 'Smart account upgrade available'
    return eligibility.reason
  }, [upgradeReady, accountType, eligibility.reason])

  return {
    accountType,
    eligibleForSponsored: eligibility.eligible,
    reason: finalReason,
    isLoading,
  }
}

export default useAccountType

