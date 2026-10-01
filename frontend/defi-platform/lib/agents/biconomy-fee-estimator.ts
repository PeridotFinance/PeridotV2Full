/**
 * Server-side helper that asks Biconomy for a Fusion quote and extracts the
 * MEE fee in the trigger token's human units. Used by the cross-chain supply
 * tool so Perry can show the user a transparent net-amount BEFORE they
 * confirm.
 *
 * Why here instead of inline in the tool: keeps the parsing quirks of the
 * Biconomy quote response (multiple shapes across SDK versions) isolated and
 * unit-testable. The adapter at `lib/biconomyAdapter.ts` already handles the
 * /app side; this is the agent-specific counterpart that talks to the same
 * `/api/biconomy/quote` route server-to-server.
 */

import type { Address } from 'viem'
import type { ComposeFlow } from '@/biconomy/constants'

export interface FeeEstimateInput {
  ownerAddress: Address
  composeFlows: ComposeFlow[]
  feeToken: { address: Address; chainId: number }
  fundingTokens: Array<{ tokenAddress: Address; chainId: number; amount: string }>
  mode: 'eoa' | 'smart-account' | 'eoa-7702'
}

export interface FeeEstimate {
  /** Fee amount in the trigger token's human units, e.g. "0.08" for 0.08 USDT. */
  feeAmount: string
  /** Raw response for debugging — never surfaced to users. */
  rawFee?: unknown
}

/**
 * Extracts a string fee from the various Biconomy quote response shapes.
 * Different SDK revisions have returned `fee`, `result.fee`, `quote.fee`, or
 * `paymentInfo.*` — we check them in order.
 */
function extractFeeAmount(quote: unknown): string | null {
  if (!quote || typeof quote !== 'object') return null
  const q = quote as any
  const candidate =
    q?.fee?.amount ??
    q?.result?.fee?.amount ??
    q?.quote?.fee?.amount ??
    q?.quote?.paymentInfo?.feeAmount ??
    q?.result?.quote?.paymentInfo?.feeAmount ??
    null
  if (candidate == null) return null
  if (typeof candidate === 'string') return candidate
  if (typeof candidate === 'number') return String(candidate)
  return null
}

/**
 * Fetch a Biconomy fusion quote via the Next server API and return the fee.
 * Returns null on any error (tool caller handles undefined gracefully).
 */
export async function estimateCrossChainFee(
  input: FeeEstimateInput,
): Promise<FeeEstimate | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    'http://localhost:3000'

  try {
    const res = await fetch(`${baseUrl}/api/biconomy/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerAddress: input.ownerAddress,
        mode: input.mode,
        composeFlows: input.composeFlows,
        feeToken: input.feeToken,
        fundingTokens: input.fundingTokens,
      }),
      // Server→server; no auth needed, quote API is open
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn('[biconomy-fee-estimator] quote returned non-ok', {
        status: res.status,
        body: body.slice(0, 500),
      })
      return null
    }
    const quote = await res.json()
    const feeAmount = extractFeeAmount(quote)
    if (!feeAmount) {
      // Surface the actual response shape so we can extend extractFeeAmount
      // next time Biconomy ships a new SDK / quote shape.
      console.warn(
        '[biconomy-fee-estimator] no fee field in response — top-level keys:',
        quote && typeof quote === 'object' ? Object.keys(quote as any) : typeof quote,
      )
      return null
    }
    return { feeAmount, rawFee: quote }
  } catch (err) {
    console.warn('[biconomy-fee-estimator] fetch threw:', (err as Error)?.message)
    return null
  }
}
