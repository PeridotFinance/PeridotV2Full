"use client"

// Shared Meld (Privy Funding Kit) onramp hook. Wraps Privy's experimental
// `useFiatOnramp()` and routes the purchase to the correct chain via
// `lib/onramp/meld.ts`. This is the single entry point every "card top-up"
// surface uses, replacing the old per-component Swapper SDK calls.
//
// `fund()` resolves with only `{ status }` — no amount, no tx hash, no webhook.
// So on `confirmed` we don't yet know how much landed. To answer "if / when /
// how much", we record a DB event and watch the destination balance on-chain:
//   1. snapshot the balance (baseline) and POST an `initiated` event,
//   2. poll until the balance grows, then POST the `settled` delta + refresh UI.
// Funding that lands after the tab closes is caught by the server reconcile
// sweep (see /api/onramp/meld/reconcile + use-meld-reconcile-on-load).

import { useCallback, useMemo, useState } from "react"
import { useWallets, useFiatOnramp, usePrivy } from "@privy-io/react-auth"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import {
  meldDestinationForAsset,
  resolveMeldEvmAddress,
  MELD_MIN_SETTLE_DELTA,
  type MeldDestination,
  type MeldFiat,
} from "@/lib/onramp/meld"
import { readBscStableBalance } from "@/lib/onramp/evm-balance"

export interface MeldFundArgs {
  /** Market/asset id being funded; controls destination chain + asset. */
  assetId?: string
  /** Prefill amount in fiat (string or number). */
  amount?: string | number
  /** Default fiat currency (EU audience → eur). */
  fiat?: MeldFiat
}

export interface MeldFundOutcome {
  /**
   * - `confirmed`   — Meld accepted the purchase (funds settle on-chain shortly)
   * - `submitted`   — user exited the widget before final confirm
   * - `unavailable` — no Meld route for this asset/address (caller → SEPA)
   * - `error`       — fund() threw
   */
  status: "confirmed" | "submitted" | "unavailable" | "error"
  destination?: MeldDestination
  error?: unknown
}

// Onramp is mainnet-only by nature; testnet preset uses Meld sandbox.
const MELD_ENV: "sandbox" | "production" =
  process.env.NEXT_PUBLIC_NETWORK_PRESET === "testnet" ? "sandbox" : "production"

const WATCH_TIMEOUT_MS = 8 * 60_000
const WATCH_INTERVAL_MS = 6_000

// At most one settlement watch per destination at a time. A duplicate
// `confirmed` for the same address (double-click, re-render, two surfaces)
// would otherwise spin up a second polling loop and settle the same delta
// twice. Module-scoped so it spans component instances. Genuinely-concurrent
// distinct purchases to one address are rare (Meld is modal) and fall through
// to the server reconcile.
const activeWatches = new Set<string>()

function newIdempotencyKey(address: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `meld-${crypto.randomUUID()}`
  }
  return `meld-${address}-${performance.now()}`
}

async function readWithRetry(
  chain: string,
  asset: MeldDestination["asset"],
  address: string,
  tries = 3,
): Promise<number | null> {
  for (let i = 0; i < tries; i++) {
    const v = await readBscStableBalance(chain, asset, address)
    if (v != null) return v
    await new Promise((r) => setTimeout(r, 1_500))
  }
  return null
}

export function useMeldOnramp() {
  const { wallets } = useWallets()
  const { fund } = useFiatOnramp()
  const { getAccessToken } = usePrivy()
  const { address: activeAddress } = useActiveWallet()
  const queryClient = useQueryClient()
  const [running, setRunning] = useState(false)

  // Fund the wallet the deposit will actually spend from — the active EVM
  // wallet when present, else the embedded Privy EVM wallet. See
  // resolveMeldEvmAddress for why this alignment matters.
  const evmAddress = useMemo(
    () =>
      resolveMeldEvmAddress(
        activeAddress as string | undefined,
        wallets as Array<{ address?: string; walletClientType?: string }>,
      ),
    [activeAddress, wallets],
  )

  const postEvent = useCallback(
    async (body: Record<string, unknown>): Promise<Response | null> => {
      const token = await getAccessToken().catch(() => null)
      if (!token) return null
      return fetch("/api/onramp/meld/event", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }).catch(() => null)
    },
    [getAccessToken],
  )

  /**
   * Record the confirmed purchase and watch the destination balance for the
   * delta. Fire-and-forget — intentionally not tied to component lifecycle so
   * it keeps running after the funding dialog closes. The server reconcile is
   * the backstop if the user navigates away entirely.
   */
  const beginSettlementWatch = useCallback(
    async (destination: MeldDestination, fiatHint?: string) => {
      // One watch per destination — skip if another loop is already running.
      const watchKey = `${destination.chain}:${destination.asset}:${destination.address.toLowerCase()}`
      if (activeWatches.has(watchKey)) {
        console.warn(`[meld] settlement watch already active for ${watchKey} — skipping duplicate`)
        return
      }
      activeWatches.add(watchKey)
      const release = () => activeWatches.delete(watchKey)

      const baseline = await readWithRetry(destination.chain, destination.asset, destination.address)
      // No reliable baseline → skip on-chain recording (can't compute a delta
      // safely); the `confirmed` toast already gave the user feedback.
      if (baseline == null) {
        release()
        return
      }

      const idempotencyKey = newIdempotencyKey(destination.address)
      await postEvent({
        phase: "initiated",
        idempotencyKey,
        chain: destination.chain,
        asset: destination.asset,
        address: destination.address,
        fiatHint,
        baselineAmount: baseline,
      })

      const started = Date.now()
      const poll = async () => {
        if (Date.now() - started > WATCH_TIMEOUT_MS) {
          release() // give up → reconcile catches it
          return
        }
        const current = await readBscStableBalance(
          destination.chain,
          destination.asset,
          destination.address,
        )
        if (current != null) {
          const delta = current - baseline
          // Floor out dust / rounding — only a real increase counts.
          if (delta >= MELD_MIN_SETTLE_DELTA) {
            await postEvent({ phase: "settled", idempotencyKey, amount: delta })
            queryClient.invalidateQueries({ queryKey: ["multi-chain-token-balances"] })
            toast.success(`$${delta.toFixed(2)} added to your wallet.`)
            release()
            return
          }
        }
        setTimeout(poll, WATCH_INTERVAL_MS)
      }
      setTimeout(poll, WATCH_INTERVAL_MS)
    },
    [postEvent, queryClient],
  )

  /** Resolve (without launching) the destination for a given asset. */
  const destinationFor = useCallback(
    (assetId?: string): MeldDestination | null =>
      meldDestinationForAsset(assetId, evmAddress),
    [evmAddress],
  )

  /** Launch the Meld card widget. Returns the outcome; never throws. */
  const fundWithMeld = useCallback(
    async ({ assetId, amount, fiat = "eur" }: MeldFundArgs = {}): Promise<MeldFundOutcome> => {
      const destination = meldDestinationForAsset(assetId, evmAddress)
      if (!destination) return { status: "unavailable" }

      setRunning(true)
      try {
        const result = await fund({
          source: { assets: ["eur", "usd"], defaultAsset: fiat },
          destination: {
            asset: destination.asset,
            chain: destination.chain,
            address: destination.address,
          },
          environment: MELD_ENV,
          ...(amount != null ? { defaultAmount: String(amount) } : {}),
        })
        const status = result?.status === "confirmed" ? "confirmed" : "submitted"
        if (status === "confirmed") {
          // Record + watch for the on-chain settlement (don't await).
          void beginSettlementWatch(destination, fiat)
        }
        return { status, destination }
      } catch (error) {
        return { status: "error", destination, error }
      } finally {
        setRunning(false)
      }
    },
    [evmAddress, fund, beginSettlementWatch],
  )

  return {
    fundWithMeld,
    destinationFor,
    evmAddress,
    running,
    /** True when a Meld card route exists for the default (hub) destination. */
    available: !!evmAddress,
  }
}
