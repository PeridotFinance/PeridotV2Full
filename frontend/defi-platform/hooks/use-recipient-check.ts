'use client'

import { useEffect, useState } from 'react'
import { usePublicClient } from 'wagmi'
import type { Address } from 'viem'
import { stellarSorobanMainnetContracts } from '@/config/contracts'
import { isValidRecipient, type SendKind } from '@/lib/send/validation'

export type RecipientCheckStatus = 'idle' | 'checking' | 'ok' | 'warning' | 'error'

export interface RecipientCheck {
  status: RecipientCheckStatus
  message: string | null
  /**
   * SEP-29: the destination account flags that every incoming payment must
   * carry a memo. Exchange and custodian deposit accounts set this because one
   * account serves all their customers.
   */
  memoRequired?: boolean
}

interface UseRecipientCheckArgs {
  /** Chain family of the selected token, or undefined when nothing is selected. */
  kind: SendKind | undefined
  recipient: string
  /** EVM token chain — used to resolve the right RPC for the contract-code check. */
  chainId?: number
  /** Stellar asset symbol — determines whether a trustline check is required. */
  stellarSymbol?: string
}

/** Classic (code + issuer) form of the issued Stellar assets, for trustline lookups. */
const CLASSIC_ASSETS: Record<string, { code: string; issuer: string }> = {
  USDC: stellarSorobanMainnetContracts.classicAssets.USDC,
  EURC: stellarSorobanMainnetContracts.classicAssets.EURC,
}

const IDLE: RecipientCheck = { status: 'idle', message: null }
const OK: RecipientCheck = { status: 'ok', message: null }

/**
 * SEP-29 flag, stored as a base64-encoded account data entry. Horizon returns
 * the raw base64, so compare against the encoding of `"1"` rather than decoding.
 */
function readsMemoRequired(data: unknown): boolean {
  const entry = (data as Record<string, string> | undefined)?.['config.memo_required']
  return typeof entry === 'string' && entry.trim() === 'MQ=='
}

/**
 * Debounced, async pre-flight check on a transfer recipient — surfaces problems
 * *before* the user signs anything.
 *
 * - EVM: warns (soft) when the address is a deployed contract, which is a common
 *   way to lose tokens.
 * - Stellar: errors (hard) when the account doesn't exist, or when an issued
 *   asset (USDC/EURC) is being sent to an account without the matching trustline.
 *
 * Network failures never block the user — the check degrades to `ok`.
 */
export function useRecipientCheck({
  kind,
  recipient,
  chainId,
  stellarSymbol,
}: UseRecipientCheckArgs): RecipientCheck {
  const publicClient = usePublicClient(chainId ? { chainId } : undefined)
  const [check, setCheck] = useState<RecipientCheck>(IDLE)

  useEffect(() => {
    if (!kind || !isValidRecipient(kind, recipient)) {
      setCheck(IDLE)
      return
    }

    const addr = recipient.trim()
    let cancelled = false
    setCheck({ status: 'checking', message: null })

    const timer = setTimeout(async () => {
      try {
        if (kind === 'evm') {
          if (!publicClient) {
            if (!cancelled) setCheck(OK)
            return
          }
          const code = await publicClient.getCode({ address: addr as Address })
          if (cancelled) return
          setCheck(
            code && code !== '0x'
              ? {
                  status: 'warning',
                  message:
                    'This address is a smart contract. Make sure it can receive this token.',
                }
              : OK,
          )
          return
        }

        // Stellar — verify the recipient account exists and (for issued assets)
        // holds a trustline that lets it accept the token.
        const res = await fetch(`https://horizon.stellar.org/accounts/${addr}`)
        if (cancelled) return
        if (res.status === 404) {
          setCheck({
            status: 'error',
            message:
              "This Stellar account doesn't exist yet. Ask the recipient to activate it first.",
          })
          return
        }
        if (!res.ok) {
          setCheck(OK)
          return
        }
        const data = await res.json()
        if (cancelled) return
        const memoRequired = readsMemoRequired(data?.data)

        const symbol = (stellarSymbol || '').toUpperCase()
        const classic = CLASSIC_ASSETS[symbol]
        if (!classic) {
          // Native XLM — any active account can receive it.
          setCheck({ ...OK, memoRequired })
          return
        }
        const hasTrustline =
          Array.isArray(data?.balances) &&
          data.balances.some(
            (b: { asset_code?: string; asset_issuer?: string }) =>
              b.asset_code === classic.code && b.asset_issuer === classic.issuer,
          )
        setCheck(
          hasTrustline
            ? { ...OK, memoRequired }
            : {
                status: 'error',
                memoRequired,
                message: `The recipient can't receive ${symbol} — they need to add a trustline for it first.`,
              },
        )
      } catch {
        // Network/RPC hiccup — never block the user on an inconclusive check.
        if (!cancelled) setCheck(OK)
      }
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [kind, recipient, chainId, stellarSymbol, publicClient])

  return check
}
