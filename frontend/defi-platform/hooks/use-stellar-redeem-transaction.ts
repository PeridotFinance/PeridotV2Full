"use client"

import { useState, useCallback } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { getStellarVaultConfig, stellarConvertUnderlyingToPtokenAmount, stellarWithdraw, stellarWithdrawAll } from "@/lib/stellar-soroban-lending"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { toast } from "sonner"
import { CHAIN_IDS } from "@/config/contracts"
import { postStellarVerify } from "@/lib/stellar-leaderboard-verify"

interface UseStellarRedeemTransactionProps {
  assetId: string
  amount: string
  /**
   * When true, redeem the user's ENTIRE pToken position (exact balance) instead of
   * converting `amount` underlying → pToken. This avoids the rounding "dust" that the
   * underlying-denominated path always leaves behind, so the market lands at pbal=0
   * (required to fully exit a market / drop it from the borrow liquidity loop).
   */
  fullWithdraw?: boolean
  onSuccess?: () => void
  onError?: (error: Error) => void
}

type TransactionStep = "idle" | "redeeming" | "success" | "error"

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
 * Tell the rest of the app a Stellar withdrawal landed: the success event the
 * balances listen for, and the verified row behind stats and points. Shared
 * with the cross-chain withdrawal, which withdraws the same way first.
 */
export function announceStellarRedeem(args: {
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
        type: "redeem",
        assetId,
        tokenSymbol: assetId?.toUpperCase?.() || assetId,
        txHash,
        address,
        chainId: CHAIN_IDS.STELLAR_MAINNET,
        observed_at: new Date().toISOString(),
      }
    }))
  }
  void (async () => {
    const privyAccessToken = await args.getAccessToken().catch(() => null)
    await postStellarVerify({
      walletAddress: address,
      txHash,
      actionType: "redeem",
      assetId,
      amount,
      privyAccessToken,
    })
  })()
}

export function useStellarRedeemTransaction({
  assetId,
  amount,
  fullWithdraw = false,
  onSuccess,
  onError,
}: UseStellarRedeemTransactionProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<TransactionStep>("idle")
  const [error, setError] = useState<string | null>(null)
  const [redeemHash, setRedeemHash] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>("")
  const { address } = useStellarWallet()
  const { getAccessToken } = usePrivy()
  const canRedeem = Boolean(getStellarVaultConfig(assetId))

  const executeRedeem = useCallback(async () => {
    if (!address) {
      toast.error("Wallet not connected")
      return
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount")
      return
    }
    setIsLoading(true)
    setError(null)
    setStep("redeeming")
    setStatusMessage("Getting your withdrawal ready")
    try {
      const hash = fullWithdraw
        ? await stellarWithdrawAll(address, assetId, setStatusMessage)
        : await stellarWithdraw(
            address,
            assetId,
            await stellarConvertUnderlyingToPtokenAmount(assetId, amount),
            setStatusMessage,
          )
      setRedeemHash(hash)
      setStep("success")
      setStatusMessage("Withdraw successful!")
      toast.success(`Withdraw successful!`)
      // Record the underlying amount the user asked for (not the pToken amount
      // the contract moves), so the time series reads like the EVM rows.
      announceStellarRedeem({ address, assetId, amount, txHash: hash, getAccessToken })
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
  }, [address, assetId, amount, fullWithdraw, onSuccess, onError, getAccessToken])

  return {
    executeRedeem,
    isLoading,
    canRedeem,
    step,
    statusMessage,
    error,
    redeemHash,
    reset: () => {
      setError(null)
      setStep("idle")
      setStatusMessage("")
      setRedeemHash(null)
    },
  }
}
