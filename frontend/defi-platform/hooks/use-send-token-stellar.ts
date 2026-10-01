'use client'

import { useCallback, useState } from 'react'
import { stellarSendToken } from '@/lib/stellar-soroban-lending'
import {
  NATIVE_XLM,
  stellarSendClassicPayment,
  type StellarPayableAsset,
} from '@/lib/stellar-payment'
import { stellarSorobanMainnetContracts } from '@/config/contracts'
import {
  friendlyStellarError,
  STELLAR_ACCOUNT_RE,
  validateMemo,
  type MemoType,
} from '@/lib/send/validation'
import type { SendStatus } from './use-send-token-evm'

export interface SendStellarParams {
  /** Sender's Stellar account (`G…`) — the connected Freighter address. */
  senderAddress: string
  /** Asset symbol (`XLM` / `USDC` / `EURC`) — selects the classic asset. */
  symbol: string
  /** The asset's Stellar Asset Contract id (`C…`), used by the SAC fallback. */
  tokenContractId: string
  /** Asset decimals (7 for XLM/USDC/EURC). */
  decimals: number
  /** Human-readable amount, e.g. "12.5". */
  amount: string
  /** Destination Stellar account (`G…`). */
  recipient: string
  /** Optional memo — required by most exchange deposit addresses. */
  memo?: string | null
  /** How to encode the memo. Defaults to `MEMO_TEXT`. */
  memoType?: MemoType
}

/**
 * Resolves a send symbol to its classic (code + issuer) form, or null when we
 * don't know it — in which case the caller falls back to the SAC path.
 */
function payableAssetFor(symbol: string): StellarPayableAsset | null {
  const s = (symbol || '').trim().toUpperCase()
  if (s === 'XLM') return NATIVE_XLM
  const classic = (
    stellarSorobanMainnetContracts.classicAssets as Record<string, StellarPayableAsset>
  )[s]
  return classic ?? null
}

/**
 * Sends a Stellar asset (XLM / USDC / EURC) from the connected Freighter wallet to
 * an external Stellar account. Mirrors the shape of `useSendTokenEvm` so the send
 * UI can treat both paths uniformly. Stellar never switches chains, so the
 * `switching` / `confirming` statuses are unused.
 *
 * Sends go out as a **classic Horizon payment**, not a Soroban SAC `transfer`.
 * Two reasons, both about reaching exchanges: a classic `payment` operation is
 * what exchange deposit watchers index, and it can carry the memo that tells
 * them which customer to credit. The SAC path is kept only for an asset whose
 * classic code+issuer we don't have — it cannot carry a memo, so a memo'd send
 * fails loudly there rather than silently dropping the memo.
 */
export function useSendTokenStellar() {
  const [status, setStatus] = useState<SendStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
    setTxHash(null)
  }, [])

  const send = useCallback(
    async (params: SendStellarParams): Promise<string | undefined> => {
      const { senderAddress, symbol, tokenContractId, decimals, amount, recipient } = params
      const memo = (params.memo ?? '').trim()
      const memoType: MemoType = params.memoType ?? 'text'

      setError(null)
      setTxHash(null)

      if (!STELLAR_ACCOUNT_RE.test(recipient.trim())) {
        setError("That's not a valid Stellar address (G…).")
        setStatus('error')
        return
      }

      const memoCheck = validateMemo(memoType, memo)
      if (!memoCheck.valid) {
        setError(memoCheck.error)
        setStatus('error')
        return
      }

      const asset = payableAssetFor(symbol)
      if (!asset && memo) {
        setError(`A memo can't be attached when sending ${symbol}.`)
        setStatus('error')
        return
      }

      try {
        setStatus('sending')
        const hash = asset
          ? await stellarSendClassicPayment({
              from: senderAddress,
              to: recipient.trim(),
              asset,
              amount: amount.trim(),
              memo: memo || null,
              memoType,
            })
          : await stellarSendToken(
              senderAddress,
              tokenContractId,
              decimals,
              amount.trim(),
              recipient.trim(),
            )
        setTxHash(hash)
        setStatus('success')
        return hash
      } catch (e) {
        setError(friendlyStellarError(e instanceof Error ? e.message : String(e)))
        setStatus('error')
        return
      }
    },
    [],
  )

  return {
    send,
    reset,
    status,
    error,
    txHash,
    isPending: status === 'sending',
  }
}
