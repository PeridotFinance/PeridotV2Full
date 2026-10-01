"use client"

import { useState, useCallback } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { stellarBorrow } from "@/lib/stellar-soroban-lending"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { toast } from "sonner"
import { CHAIN_IDS } from "@/config/contracts"
import { postStellarVerify } from "@/lib/stellar-leaderboard-verify"

interface UseStellarBorrowTransactionProps {
  assetId: string
  amount: string
  onSuccess?: () => void
  onError?: (error: Error) => void
}

const getReadableErrorMessage = (e: unknown): string => {
  const mapLowLevelBorrowError = (msg: string): string => {
    const lower = msg.toLowerCase()
    if (
      lower.includes("error(wasmvm, invalidaction)") ||
      lower.includes("unreachablecodereached") ||
      lower.includes("hypothetical_liquidity_with_hint")
    ) {
      return "Borrow failed due to borrow-power constraints. Reduce amount or add more collateral, then try again."
    }
    if (lower.includes("is_borrow_paused")) {
      return "Borrowing is currently paused for this market."
    }
    return msg
  }

  if (e instanceof Error && e.message && e.message !== "[object Object]") return mapLowLevelBorrowError(e.message)
  if (typeof e === "string") return mapLowLevelBorrowError(e)
  if (e && typeof e === "object") {
    const anyErr = e as Record<string, unknown>
    const direct = anyErr.message
    if (typeof direct === "string" && direct.trim() && direct !== "[object Object]") return mapLowLevelBorrowError(direct)
    if (direct && typeof direct === "object") {
      try {
        const nested = JSON.stringify(direct)
        if (nested && nested !== "{}") return mapLowLevelBorrowError(nested)
      } catch {}
    }
    try {
      const serialized = JSON.stringify(anyErr)
      if (serialized && serialized !== "{}") return mapLowLevelBorrowError(serialized)
    } catch {}
  }
  return "Transaction failed"
}

export function useStellarBorrowTransaction({
  assetId,
  amount,
  onSuccess,
  onError,
}: UseStellarBorrowTransactionProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<"idle" | "borrowing" | "success" | "error">("idle")
  const [borrowHash, setBorrowHash] = useState<string | undefined>(undefined)
  const { address } = useStellarWallet()
  const { getAccessToken } = usePrivy()

  const executeBorrow = useCallback(async () => {
    if (!address) {
      toast.error("Wallet not connected")
      return
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount")
      return
    }
    setError(null)
    setStep("borrowing")
    setProgress("")
    setIsLoading(true)
    try {
      // Stream each stage out so the button can say which one we're on — a
      // borrow can include an enter-market signature before the borrow itself.
      const hash = await stellarBorrow(address, assetId, amount, setProgress)
      setBorrowHash(hash)
      setStep("success")
      toast.success(`Borrow successful!`)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("peridot:tx-success", {
          detail: {
            type: "borrow",
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
          actionType: "borrow",
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
      toast.error(err.message)
      onError?.(err)
    } finally {
      setIsLoading(false)
    }
  }, [address, assetId, amount, onSuccess, onError, getAccessToken])

  const reset = useCallback(() => {
    setError(null)
    setStep("idle")
    setProgress("")
    setBorrowHash(undefined)
  }, [])

  // While borrowing, the live stage from the lending lib wins; the static
  // string is only the opening beat before the first stage lands.
  const statusMessage = step === "borrowing"
    ? progress || "Getting your loan ready"
    : step === "success"
      ? "Borrow successful!"
      : step === "error"
        ? "Borrow failed"
        : ""

  return {
    executeBorrow,
    isLoading,
    error,
    step,
    borrowHash,
    statusMessage,
    canBorrow: Boolean(address),
    reset,
  }
}
