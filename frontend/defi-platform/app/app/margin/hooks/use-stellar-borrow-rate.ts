'use client'

/**
 * What does holding this trade cost?
 *
 * The order panel priced everything about entering a position — size, borrow,
 * fill, liquidation — and nothing about keeping it. The interest was real all
 * along: `computeBorrowInterest` deducts it from every position's live PnL, so a
 * trader met the cost only after paying it, in a number that had already been
 * reduced by it.
 *
 * The rate is the vault's, per borrowed asset: a Long borrows USDT, a Short
 * borrows XLM, and the two vaults carry their own rates. Read from chain rather
 * than configured, so a rate change on the contract shows up here without a
 * deploy — and so a deployment where borrowing is free (as the testnet vaults
 * are today) says so instead of being quietly padded with a plausible number.
 *
 * Cached per vault for the session-ish: only an admin transaction moves a static
 * rate, and a model-derived one moves with utilization — slowly enough that a
 * five-minute-old figure is still the right thing to show on an order form.
 */
import { useEffect, useState } from 'react'
import { vaultGetBorrowRateYearly } from '@/lib/stellar-margin'

const TTL_MS = 5 * 60 * 1000

const cache = new Map<string, { rate: number | null; at: number }>()
const inflight = new Map<string, Promise<number | null>>()

async function readRate(vaultId: string): Promise<number | null> {
  const hit = cache.get(vaultId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rate
  const running = inflight.get(vaultId)
  if (running) return running
  const p = vaultGetBorrowRateYearly(vaultId)
    .then((rate) => {
      // A failed read is NOT cached: the row hides itself on null, and caching
      // that would keep it hidden for five minutes after a single dropped
      // request.
      if (rate != null) cache.set(vaultId, { rate, at: Date.now() })
      return rate
    })
    .catch(() => null)
    .finally(() => { inflight.delete(vaultId) })
  inflight.set(vaultId, p)
  return p
}

/**
 * Yearly borrow rate for a vault as a fraction (0.06 = 6 % APR), or null while
 * unknown — including "we asked and couldn't establish it", which the caller
 * must render as silence rather than as zero.
 */
export function useStellarBorrowRate(vaultId: string | null | undefined): number | null {
  const [rate, setRate] = useState<number | null>(() => {
    const hit = vaultId ? cache.get(vaultId) : null
    return hit && Date.now() - hit.at < TTL_MS ? hit.rate : null
  })

  useEffect(() => {
    if (!vaultId) { setRate(null); return }
    let cancelled = false
    readRate(vaultId).then((r) => { if (!cancelled) setRate(r) })
    return () => { cancelled = true }
  }, [vaultId])

  return rate
}
