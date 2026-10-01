"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAccount, usePublicClient } from "wagmi"
import type { PublicClient } from "viem"
import { useAppKitAccount } from "@reown/appkit/react"
import { probeEip5792Capabilities } from "@/lib/wallet/accountDetection"
import { detectSmartAccountProviderHints, getSmartAccountAddressHint } from "@/lib/wallet/providerHints"

export type SmartAccountClassification =
  | "checking"
  | "smart-account"
  | "legacy-eoa"
  | "disconnected"
  | "error"

export interface SmartAccountStatus {
  address?: `0x${string}`
  appKitAccountType?: string | null
  chainId?: number
  atomicCapability: 'supported' | 'ready' | 'unsupported' | null
  classification: SmartAccountClassification
  detectionError: Error | null
  dismissed: boolean
  hasWallet: boolean
  smartAccountAddress?: `0x${string}`
  isLegacy: boolean
  isLoading: boolean
  isSmartAccount: boolean
  markDismissed: () => void
  resetDismissal: () => void
  shouldAutoPrompt: boolean
}

const SMART_ACCOUNT_STORAGE_PREFIX = "smart-account-upgrade"
const SMART_ACCOUNT_CAPABILITY_PREFIX = "smart-account-capabilities"
const MIN_DETECTION_INTERVAL_MS = 10_000

const isNonEmptyBytecode = (bytecode: string | null | undefined) => {
  if (!bytecode) return false
  return bytecode !== "0x"
}

export function useSmartAccountStatus(): SmartAccountStatus {
  const { address, chainId, isConnected } = useAccount()
  const publicClient = usePublicClient({ chainId })
  const { embeddedWalletInfo, address: appKitAddress } = useAppKitAccount()

  const [classification, setClassification] = useState<SmartAccountClassification>("disconnected")
  const [dismissed, setDismissed] = useState(false)
  const [detectionError, setDetectionError] = useState<Error | null>(null)
  const [smartAccountAddress, setSmartAccountAddress] = useState<`0x${string}` | undefined>(undefined)
  const [persistedCapability, setPersistedCapability] = useState<'supported' | 'ready' | 'unsupported' | null>(null)
  const lastDetectionRef = useRef<{ key: string | null; timestamp: number }>({ key: null, timestamp: 0 })

  const sessionKey = useMemo(() => {
    if (!address || !chainId) return null
    return `${SMART_ACCOUNT_STORAGE_PREFIX}:${address.toLowerCase()}:${chainId}`
  }, [address, chainId])

  const capabilityKey = useMemo(() => {
    if (!address || !chainId) return null
    return `${SMART_ACCOUNT_CAPABILITY_PREFIX}:${address.toLowerCase()}:${chainId}`
  }, [address, chainId])

  const appKitAccountType = embeddedWalletInfo?.accountType ?? null
  const appKitSmartAccount = appKitAccountType === "smartAccount"

  useEffect(() => {
    if (!sessionKey) {
      setDismissed(false)
      return
    }
    if (typeof window === "undefined") return
    try {
      const stored = window.sessionStorage.getItem(sessionKey)
      setDismissed(stored === "dismissed")
    } catch {
      setDismissed(false)
    }
  }, [sessionKey])

  useEffect(() => {
    if (!capabilityKey) {
      setPersistedCapability(null)
      return
    }
    if (typeof window === "undefined") {
      setPersistedCapability(null)
      return
    }
    try {
      const stored = window.sessionStorage.getItem(capabilityKey)
      if (stored === "supported" || stored === "ready" || stored === "unsupported") {
        setPersistedCapability(stored)
      } else {
        setPersistedCapability(null)
      }
    } catch {
      setPersistedCapability(null)
    }
  }, [capabilityKey])

  const persistCapability = useCallback((value: 'supported' | 'ready' | 'unsupported') => {
    if (!capabilityKey || typeof window === "undefined") return
    try {
      window.sessionStorage.setItem(capabilityKey, value)
      setPersistedCapability(value)
    } catch {}
  }, [capabilityKey])

  const logCapabilities = useCallback((result: any) => {
    if (!appKitSmartAccount) return
    try {
      console.debug?.('[smart-account] wallet_getCapabilities response', result)
    } catch {}
  }, [appKitSmartAccount])

  useEffect(() => {
    if (!isConnected || !address || !chainId) {
      setClassification("disconnected")
      setDetectionError(null)
      setSmartAccountAddress(undefined)
      lastDetectionRef.current = { key: null, timestamp: 0 }
      return
    }

    if (!publicClient) {
      setClassification("checking")
      setDetectionError(null)
      return
    }

    let cancelled = false

    const detectionKey = `${address.toLowerCase()}:${chainId}`
    const now = Date.now()
    const { key: lastKey, timestamp: lastTimestamp } = lastDetectionRef.current
    if (lastKey === detectionKey && now - lastTimestamp < MIN_DETECTION_INTERVAL_MS) {
      return
    }
    lastDetectionRef.current = { key: detectionKey, timestamp: now }

    setClassification("checking")
    setDetectionError(null)

    async function detect() {
      try {
        const ethereum = typeof window !== "undefined" ? (window as any)?.ethereum : null
        let candidateSmartAddress = getSmartAccountAddressHint(ethereum)

        if (appKitSmartAccount) {
          setClassification("smart-account")

          if (appKitAddress && address && appKitAddress.toLowerCase() !== address.toLowerCase()) {
            try {
              console.debug?.('[smart-account] AppKit address differs from wagmi address', {
                appKitAddress,
                wagmiAddress: address,
              })
            } catch {}
          }

          if (!candidateSmartAddress && address) {
            candidateSmartAddress = address as `0x${string}`
          }

          if (ethereum && typeof (ethereum as any)?.request === "function") {
            const cap = await probeEip5792Capabilities(ethereum, address, chainId, logCapabilities)
            if (cancelled) return
            if (cap) {
              persistCapability(cap)
              try {
                console.debug?.(`[smart-account] Derived atomic capability for AppKit session: ${cap}`)
              } catch {}
            }
          }

          const bytecode = await publicClient.getBytecode({ address })
          if (cancelled) return
          if (isNonEmptyBytecode(bytecode)) {
            candidateSmartAddress = address as `0x${string}`
          } else if (candidateSmartAddress && candidateSmartAddress.toLowerCase() !== address.toLowerCase()) {
            try {
              console.warn?.(
                `[smart-account] AppKit smart account detected but wagmi address ${address} has no bytecode; using provider hint ${candidateSmartAddress}`
              )
            } catch {}
          } else {
            try {
              console.warn?.(
                `[smart-account] AppKit smart account detected but wagmi address ${address} resolved to empty bytecode.`
              )
            } catch {}
          }

          if (!cancelled) {
            setSmartAccountAddress(candidateSmartAddress)
          }
          return
        }

        if (persistedCapability === "supported") {
          setClassification("smart-account")
          if (!candidateSmartAddress && address) {
            candidateSmartAddress = address as `0x${string}`
          }
          if (!cancelled) {
            setSmartAccountAddress(candidateSmartAddress)
          }
          return
        }

        const hintedSmart = detectSmartAccountProviderHints(ethereum)
        if (hintedSmart) {
          setClassification("smart-account")
          if (!candidateSmartAddress && address) {
            candidateSmartAddress = address as `0x${string}`
          }
          if (!cancelled) {
            setSmartAccountAddress(candidateSmartAddress)
          }
          return
        }

        if (persistedCapability === null && ethereum && typeof (ethereum as any)?.request === "function") {
          const cap = await probeEip5792Capabilities(ethereum, address, chainId)
          if (cancelled) return
          if (cap) {
            persistCapability(cap)
          }
          if (cap === "supported") {
            setClassification("smart-account")
            if (!candidateSmartAddress && address) {
              candidateSmartAddress = address as `0x${string}`
            }
            if (!cancelled) {
              setSmartAccountAddress(candidateSmartAddress)
            }
            return
          }
        }

        const bytecode = await publicClient.getBytecode({ address })
        if (cancelled) return
        const smart = isNonEmptyBytecode(bytecode)
        setClassification(smart ? "smart-account" : "legacy-eoa")
        if (smart) {
          candidateSmartAddress = address as `0x${string}`
        } else {
          candidateSmartAddress = undefined
        }
        if (!cancelled) {
          setSmartAccountAddress(candidateSmartAddress)
        }
      } catch (error) {
        if (cancelled) return
        setDetectionError(error as Error)
        setClassification("error")
      }
    }

    detect()

    return () => {
      cancelled = true
    }
  }, [address, appKitAddress, appKitSmartAccount, chainId, isConnected, logCapabilities, persistCapability, persistedCapability, publicClient])

  const markDismissed = useCallback(() => {
    if (!sessionKey || typeof window === "undefined") return
    try {
      window.sessionStorage.setItem(sessionKey, "dismissed")
      setDismissed(true)
    } catch {
      // ignored – storage might be unavailable
    }
  }, [sessionKey])

  const resetDismissal = useCallback(() => {
    if (!sessionKey || typeof window === "undefined") return
    try {
      window.sessionStorage.removeItem(sessionKey)
      setDismissed(false)
    } catch {
      // ignored – storage might be unavailable
    }
  }, [sessionKey])

  const hasWallet = Boolean(isConnected && address)
  const isLoading = classification === "checking"
  const isSmartAccount = classification === "smart-account"
  const isLegacy = classification === "legacy-eoa"
  const shouldAutoPrompt = hasWallet && isLegacy && !dismissed

  return {
    address,
    appKitAccountType,
    chainId,
    atomicCapability: persistedCapability,
    classification,
    detectionError,
    dismissed,
    hasWallet,
    smartAccountAddress,
    isLegacy,
    isLoading,
    isSmartAccount,
    markDismissed,
    resetDismissal,
    shouldAutoPrompt,
  }
}
