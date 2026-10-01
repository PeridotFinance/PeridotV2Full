"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useWallets } from "@privy-io/react-auth"

import { SmartAccountUpgradeDialog } from "@/components/wallet/SmartAccountUpgradeDialog"
import { useSmartAccountStatus } from "@/hooks/use-smart-account-status"
import { toast } from "sonner"
import { createWalletClient, custom, http, type Chain } from "viem"
import { bsc } from "viem/chains"
import { getMEEVersion, MEEVersion, toMultichainNexusAccount, type MeeAuthorization } from "@biconomy/abstractjs"

import { CHAIN_BY_ID } from "@/lib/biconomy/wallet"
import { probeEip5792Capabilities } from "@/lib/wallet/accountDetection"
import { FEATURE_FLAGS } from "@/config/featureFlags"

type SmartAccountUpgradeContextValue = {
  openUpgradePrompt: () => void
  beginUpgrade: () => Promise<MeeAuthorization | MeeAuthorization[] | null>
  clearAuthorization: () => void
  status: ReturnType<typeof useSmartAccountStatus>
  isUpgrading: boolean
  upgradeError: string | null
  meeAuthorization: MeeAuthorization | MeeAuthorization[] | null
  upgradeStatus: string | null
  // Cross-chain resume helpers
  hasResumableCrossChain?: boolean
  retryCrossChain?: () => Promise<void> | void
  checkResumedStatus?: () => Promise<{ status: 'pending' | 'executed' | 'failed' | 'unknown' }>
  clearResumedCrossChain?: () => void
}

const SMART_ACCOUNT_AUTH_STORAGE_PREFIX = "smart-account-upgrade-auth"

const SUPPORTED_CHAIN_IDS = Object.keys(CHAIN_BY_ID).map((id) => Number(id))

const getAuthStorageKey = (address: `0x${string}`) =>
  `${SMART_ACCOUNT_AUTH_STORAGE_PREFIX}:${address.toLowerCase()}`

const resolveRpcUrl = (chain: Chain): string | undefined => {
  const envKey = `NEXT_PUBLIC_RPC_${chain.id}` as keyof NodeJS.ProcessEnv
  const envOverride = typeof process !== "undefined" ? process.env?.[envKey] : undefined
  return envOverride || chain.rpcUrls?.default?.http?.[0] || chain.rpcUrls?.public?.http?.[0]
}

const buildMeeChainConfigurations = (currentChainId?: number) => {
  const uniqueChains = new Map<number, Chain>()
  const prioritizedIds = currentChainId ? [currentChainId, bsc.id, ...SUPPORTED_CHAIN_IDS] : [bsc.id, ...SUPPORTED_CHAIN_IDS]
  for (const id of prioritizedIds) {
    const chain = CHAIN_BY_ID[id]
    if (chain) {
      uniqueChains.set(id, chain)
    }
  }

  return Array.from(uniqueChains.values())
    .map((chain) => {
      const rpcUrl = resolveRpcUrl(chain)
      if (!rpcUrl) return null
      return {
        chain,
        transport: http(rpcUrl),
        version: getMEEVersion(MEEVersion.V2_1_0),
      }
    })
    .filter((config): config is NonNullable<typeof config> => config !== null)
}

const SmartAccountUpgradeContext = createContext<SmartAccountUpgradeContextValue | null>(null)

export function SmartAccountUpgradeProvider({ children }: { children: ReactNode }) {
  const status = useSmartAccountStatus()
  // Feature-flag gate: return a no-op provider and do NOT render the dialog when disabled
  if (!FEATURE_FLAGS.SMART_ACCOUNT_UPGRADES) {
    const value = {
      openUpgradePrompt: () => {},
      beginUpgrade: async () => null as MeeAuthorization | MeeAuthorization[] | null,
      clearAuthorization: () => {},
      status,
      isUpgrading: false,
      upgradeError: null as string | null,
      meeAuthorization: null as MeeAuthorization | MeeAuthorization[] | null,
      upgradeStatus: null as string | null,
    }
    return (
      <SmartAccountUpgradeContext.Provider value={value}>
        {children}
      </SmartAccountUpgradeContext.Provider>
    )
  }
  const [isOpen, setIsOpen] = useState(false)
  const [meeAuthorization, setMeeAuthorization] = useState<MeeAuthorization | MeeAuthorization[] | null>(null)
  const [isUpgrading, setIsUpgrading] = useState(false)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)
  const [upgradeStatus, setUpgradeStatus] = useState<string | null>(null)
  const lastDismissReasonRef = useRef<"manual" | "success" | null>(null)
  const { wallets, ready: walletsReady } = useWallets()

  const persistAuthorization = useCallback((address: `0x${string}`, authorization: MeeAuthorization | MeeAuthorization[]) => {
    if (typeof window === "undefined") return
    const payload = JSON.stringify({ authorization, savedAt: Date.now() })
    try {
      window.localStorage.setItem(getAuthStorageKey(address), payload)
    } catch {}
  }, [])

  useEffect(() => {
    if (!status.address) {
      setMeeAuthorization(null)
      return
    }
    if (typeof window === "undefined") return
    try {
      const stored = window.localStorage.getItem(getAuthStorageKey(status.address))
      if (!stored) {
        setMeeAuthorization(null)
        return
      }
      const parsed = JSON.parse(stored)
      const authorization = (parsed?.authorization ?? parsed) as MeeAuthorization | MeeAuthorization[] | null
      setMeeAuthorization(authorization)
    } catch {
      setMeeAuthorization(null)
    }
  }, [status.address])

  useEffect(() => {
    if (!status.shouldAutoPrompt || meeAuthorization) return
    if (lastDismissReasonRef.current === "manual") return
    setIsOpen(true)
  }, [status.shouldAutoPrompt, meeAuthorization])

  const openUpgradePrompt = useCallback(() => {
    setUpgradeError(null)
    setUpgradeStatus(null)
    setIsOpen(true)
  }, [])

  const clearAuthorization = useCallback(() => {
    try {
      if (status.address) {
        window?.localStorage?.removeItem(getAuthStorageKey(status.address))
      }
    } catch {}
    setMeeAuthorization(null)
    setUpgradeStatus("Authorization cleared")
    setTimeout(() => setUpgradeStatus(null), 1000)
  }, [status.address])

  const beginUpgrade = useCallback(async (): Promise<MeeAuthorization | MeeAuthorization[] | null> => {
    if (isUpgrading) return meeAuthorization
    if (!status.hasWallet && (!wallets || wallets.length === 0)) {
      const message = "Connect your wallet to upgrade"
      setUpgradeError(message)
      throw new Error(message)
    }
    const ethereum = typeof window !== "undefined" ? (window as any)?.ethereum : null

    setIsUpgrading(true)
    setUpgradeError(null)
    setUpgradeStatus("Connecting wallet…")

    try {
      // If already using a smart account (e.g., AppKit embedded wallet), skip 7702 flow
      if (status.isSmartAccount) {
        setUpgradeStatus("Smart account detected no upgrade needed")
        toast("Smart account active", {
          description: "Gasless borrows and delegated flows are already enabled.",
        })
        return null
      }

      // Resolve best signer: prefer embedded wallet provider (no 7702 required)
      let signerProvider: any = null
      let signerAddress: `0x${string}` | undefined = undefined
      try {
        if (Array.isArray(wallets)) {
          for (const w of wallets) {
            const t = (w as any)?.type?.toString()?.toLowerCase?.() || ''
            const ct = ((w as any)?.custodyType || (w as any)?.walletClientType || (w as any)?.clientType || '')?.toString()?.toLowerCase?.()
            const src = ((w as any)?.source || '')?.toString()?.toLowerCase?.()
            const isEmbedded = t.includes('embedded') || ct.includes('embedded') || src.includes('embedded') || (w as any)?.isEmbedded === true || (w as any)?.custodyType === 'custodial'
            if (isEmbedded && typeof (w as any)?.getEthereumProvider === 'function') {
              signerProvider = await (w as any).getEthereumProvider()
              signerAddress = (w as any)?.address as `0x${string}` | undefined
              break
            }
          }
        }
      } catch {}

      // If no embedded provider found, fall back to injected provider and status.address
      if (!signerProvider) {
        if (!ethereum || !status.address) {
          const message = "No wallet provider detected"
          setUpgradeError(message)
          throw new Error(message)
        }
        signerProvider = ethereum
        signerAddress = status.address as any

        // Only on the fallback path, respect capability hints
        let capability = status.atomicCapability
        if (capability == null && typeof (ethereum as any)?.request === 'function') {
          capability = await probeEip5792Capabilities(ethereum, status.address as any, status.chainId)
        }
        if (capability === 'supported') {
          setUpgradeStatus("Smart account detected no upgrade needed")
          toast("Smart account active", { description: "Gasless borrows are enabled by your wallet." })
          return null
        }
        if (capability === 'ready') {
          setUpgradeStatus("Your wallet will upgrade during your next transaction")
          toast("Upgrade handled by wallet", { description: "Proceed with your borrow; the wallet will enable atomic execution." })
          return null
        }
        const providerCaps = (ethereum as any)?.capabilities || (ethereum as any)?.features || null
        const capsText = providerCaps ? JSON.stringify(providerCaps).toLowerCase() : ''
        const supports7702 = capsText.includes('7702') || capsText.includes('authorization') || capsText.includes('session')
        if (!supports7702 && status.isLegacy) {
          const guidance = "Use Privy embedded wallet to enable smart account (no 7702 required). Open wallet manager and create an embedded wallet."
          setUpgradeStatus("Embedded smart wallet recommended")
          setUpgradeError(guidance)
          try {
            toast("Use embedded smart wallet", {
              description: "Create/select an embedded wallet in Privy, then retry upgrade.",
            })
          } catch {}
          return null
        }
      }

      setUpgradeStatus("Selecting signer…")
      const walletClient = createWalletClient({
        account: signerAddress!,
        chain: status.chainId && CHAIN_BY_ID[status.chainId] ? CHAIN_BY_ID[status.chainId] : bsc,
        transport: custom(signerProvider as any),
      })

      if (!status.chainId || !CHAIN_BY_ID[status.chainId]) {
        setUpgradeStatus("Optimizing chain support…")
      }

      const chainConfigurations = buildMeeChainConfigurations(status.chainId)
      if (!chainConfigurations.length) {
        throw new Error("Smart account upgrade cannot continue. RPC endpoints are missing for the required chains.")
      }

      setUpgradeStatus("Building multichain account…")
      const multichainAccount = await toMultichainNexusAccount({
        signer: walletClient as any,
        chainConfigurations,
      })

      setUpgradeStatus("Generating authorization…")
      const authorization = await multichainAccount.toDelegation({ multiChain: true })
      setMeeAuthorization(authorization)
      if (signerAddress) persistAuthorization(signerAddress, authorization)
      toast("Smart account ready", {
        description: "Gasless borrows and delegated flows are now enabled.",
      })
      setUpgradeStatus("Smart account ready")
      return authorization
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setUpgradeError(message || "Upgrade failed. Please review your wallet connection and try again.")
      throw error
    } finally {
      setIsUpgrading(false)
      setTimeout(() => setUpgradeStatus(null), 1200)
    }
  }, [
    isUpgrading,
    meeAuthorization,
    persistAuthorization,
    status.address,
    status.atomicCapability,
    status.chainId,
    status.hasWallet,
    status.isLegacy,
    status.isSmartAccount,
  ])

  const handleDismissIntent = useCallback(
    (reason: "manual" | "success") => {
      lastDismissReasonRef.current = reason
      if (status.hasWallet) {
        status.markDismissed()
      }
    },
    [status]
  )

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setIsOpen(nextOpen)
      if (!nextOpen) {
        const reason = lastDismissReasonRef.current
        if (!reason && status.hasWallet) {
          status.markDismissed()
        }
        lastDismissReasonRef.current = null
      }
    },
    [status]
  )

  const enhancedStatus = useMemo(() => {
    if (!meeAuthorization) return status
    return {
      ...status,
      classification: status.classification === "smart-account" ? status.classification : "smart-account",
      isSmartAccount: true,
      isLegacy: false,
      shouldAutoPrompt: false,
    }
  }, [status, meeAuthorization])

  const value = useMemo(
    () => ({
      openUpgradePrompt,
      beginUpgrade,
      clearAuthorization,
      status: enhancedStatus,
      isUpgrading,
      upgradeError,
      meeAuthorization,
      upgradeStatus,
    }),
    [openUpgradePrompt, beginUpgrade, clearAuthorization, enhancedStatus, isUpgrading, upgradeError, meeAuthorization, upgradeStatus]
  )

  return (
    <SmartAccountUpgradeContext.Provider value={value}>
      {children}
      <SmartAccountUpgradeDialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        status={enhancedStatus}
        onUpgrade={beginUpgrade}
        isUpgrading={isUpgrading}
        upgradeError={upgradeError}
        upgradeStatus={upgradeStatus}
        onDismissIntent={handleDismissIntent}
      />
    </SmartAccountUpgradeContext.Provider>
  )
}

export function useSmartAccountUpgrade() {
  const context = useContext(SmartAccountUpgradeContext)
  if (!context) {
    throw new Error("useSmartAccountUpgrade must be used within SmartAccountUpgradeProvider")
  }
  return context
}
