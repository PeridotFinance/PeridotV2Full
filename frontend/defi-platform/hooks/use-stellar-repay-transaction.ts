"use client"

import { useState, useCallback } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { stellarRepay } from "@/lib/stellar-soroban-lending"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { toast } from "sonner"
import { CHAIN_IDS } from "@/config/contracts"
import { postStellarVerify } from "@/lib/stellar-leaderboard-verify"

interface UseStellarRepayTransactionProps {
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

export function useStellarRepayTransaction({
  assetId,
  amount,
  onSuccess,
  onError,
}: UseStellarRepayTransactionProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<"idle" | "repaying" | "success" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>("")
  const [repayHash, setRepayHash] = useState<string | undefined>(undefined)
  const { address } = useStellarWallet()
  const { getAccessToken } = usePrivy()

  const executeRepay = useCallback(async () => {
    if (!address) {
      toast.error("Wallet not connected")
      return
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount")
      return
    }
    setError(null)
    setStep("repaying")
    setStatusMessage("Getting your repayment ready")
    setIsLoading(true)
    try {
      const hash = await stellarRepay(address, assetId, amount, setStatusMessage)
      setRepayHash(hash)
      setStep("success")
      setStatusMessage("Repay successful!")
      toast.success(`Repay successful!`)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("peridot:tx-success", {
          detail: {
            type: "repay",
            assetId,
            tokenSymbol: assetId?.toUpperCase?.() || assetId,
            txHash: hash,
            address,
            chainId: CHAIN_IDS.STELLAR_MAINNET,
            observed_at: new Date().toISOString(),
          }
        }))
      }
      void (async () => {
        const privyAccessToken = await getAccessToken().catch(() => null)
        await postStellarVerify({
          walletAddress: address,
          txHash: hash,
          actionType: "repay",
          assetId,
          amount,
          privyAccessToken,
        })
      })()
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
    setRepayHash(undefined)
  }, [])

  return {
    executeRepay,
    isLoading,
    error,
    step,
    statusMessage,
    repayHash,
    canRepay: Boolean(address),
    reset,
  }
}
