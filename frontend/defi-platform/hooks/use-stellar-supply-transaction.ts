"use client"

import { useState, useCallback } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { stellarDeposit } from "@/lib/stellar-soroban-lending"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { toast } from "sonner"
import { CHAIN_IDS } from "@/config/contracts"
import { postStellarVerify } from "@/lib/stellar-leaderboard-verify"

interface UseStellarSupplyTransactionProps {
  assetId: string
  amount: string
  onSuccess?: () => void
  onError?: (error: Error) => void
}

const getReadableErrorMessage = (e: unknown): string => {
  if (e instanceof Error && e.message && e.message !== "[object Object]") return e.message
  if (typeof e === "string") return e
  if (e && typeof e === "object") {
    const anyErr = e as Record<string, unknown>
    const direct = anyErr.message
    if (typeof direct === "string" && direct.trim() && direct !== "[object Object]") return direct
    if (direct && typeof direct === "object") {
      try {
        const nested = JSON.stringify(direct)
        if (nested && nested !== "{}") return nested
      } catch {}
    }
    try {
      const serialized = JSON.stringify(anyErr)
      if (serialized && serialized !== "{}") return serialized
    } catch {}
  }
  return "Transaction failed"
}

/**
 * What every Stellar supply does after it lands: tell the page (balances and
 * positions refresh on `peridot:tx-success`) and record it for the protocol
 * stats. Shared with the cross-chain supply, which deposits outside this hook.
 */
export function announceStellarSupply(args: {
  address: string
  assetId: string
  amount: string
  txHash: string
  getAccessToken: () => Promise<string | null>
}): void {
  const { address, assetId, amount, txHash } = args
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("peridot:tx-success", {
      detail: {
        type: "supply",
        assetId,
        tokenSymbol: assetId?.toUpperCase?.() || assetId,
        txHash,
        address,
        chainId: CHAIN_IDS.STELLAR_MAINNET,
        observed_at: new Date().toISOString(),
      }
    }))
  }
  // Fire-and-forget: persist into verified_transactions so the
  // protocol stats time-series picks up the action. Server resolves
  // USD value via the Reflector oracle if we don't pass one.
  // Pass the Privy token so the server links this G-address to the
  // user's Peridot account for cross-namespace data stitching.
  void (async () => {
    const privyAccessToken = await args.getAccessToken().catch(() => null)
    await postStellarVerify({
      walletAddress: address,
      txHash,
      actionType: "supply",
      assetId,
      amount,
      privyAccessToken,
    })
  })()
}

export function useStellarSupplyTransaction({
  assetId,
  amount,
  onSuccess,
  onError,
}: UseStellarSupplyTransactionProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<"idle" | "supplying" | "success" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>("")
  const [supplyHash, setSupplyHash] = useState<string | undefined>(undefined)
  // Stellar deposits always sign via Freighter — bypass useActiveWallet, which
  // gates the Stellar address behind selectedNetworkId === STELLAR_NETWORK_ID.
  // The deposit sheet for a Soroban asset is unambiguously Stellar regardless
  // of which EVM network the user has otherwise selected.
  const { address } = useStellarWallet()
  const { getAccessToken } = usePrivy()

  const executeSupply = useCallback(async () => {
    if (!address) {
      toast.error("Connect Freighter first")
      return
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount")
      return
    }
    setError(null)
    setStep("supplying")
    setStatusMessage("Getting your deposit ready")
    setIsLoading(true)
    try {
      // A first-time deposit is three signatures deep (enter market → approve →
      // deposit). Stream each beat out so the button can say which one we're on
      // instead of sitting on one frozen label for 30s+.
      const hash = await stellarDeposit(address, assetId, amount, setStatusMessage)
      setSupplyHash(hash)
      setStep("success")
      setStatusMessage("Supply successful!")
      toast.success(`Supply successful!`)
      announceStellarSupply({ address, assetId, amount, txHash: hash, getAccessToken })
      onSuccess?.()
      return hash
    } catch (e) {
      const err = new Error(getReadableErrorMessage(e))
      setError(err.message)
      setStep("error")
      setStatusMessage(err.message)
      toast.error(err.message)
      onError?.(err)
    } finally {
      setIsLoading(false)
    }
  }, [address, assetId, amount, onSuccess, onError, getAccessToken])

  const reset = useCallback(() => {
    setError(null)
    setStep("idle")
    setStatusMessage("")
    setSupplyHash(undefined)
  }, [])

  return {
    executeSupply,
    isLoading,
    error,
    step,
    statusMessage,
    supplyHash,
    // Soroban tokens have no separate ERC20-style approval step; the deposit
    // contract pulls funds via the user's signed tx authorization. Mirror the
    // EVM hook shape so SupplyPanel can render uniformly.
    needsApproval: false,
    canSupply: Boolean(address),
    reset,
  }
}
