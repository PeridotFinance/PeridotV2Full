"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Check, Loader2 } from "lucide-react"
import { usePrivy, useWallets } from "@privy-io/react-auth"
import { useBridgeBalance } from "@/hooks/use-bridge-balance"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { getAssetById } from "@/data/market-data"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { resolveMeldEvmAddress, MELD_MIN_SETTLE_DELTA, type MeldAsset } from "@/lib/onramp/meld"
import { readBscStableBalance } from "@/lib/onramp/evm-balance"

/**
 * Post-funding landing page.
 *
 * Where a fiat top-up provider (Privy funding, the card on-ramp, or a Bridge
 * SEPA return) sends the user once they finish paying. The money is rarely in
 * the wallet the instant we land here — card on-ramps settle in seconds, SEPA
 * in hours — so we poll the user's balance and only declare success once it
 * actually ticks up. The original intent (which asset the user wanted to top
 * up for) rides in on the query string so we can drop them straight back into
 * the deposit flow, prefilled.
 *
 *   /app/funded?asset=eurc-stellar&amount=50&via=card
 *
 * On success we hand off to `/app/easy?deposit=<asset>&amount=<amount>`, which
 * the Stellar shell consumes to reopen the deposit sheet (see
 * `DepositResumeFromUrl` in `StellarSheets`).
 */

// Which Bridge balance bucket a target asset draws from. EURC markets settle
// in EURC; everything stable-USD lands as USDC. Default to EURC since that is
// the headline SEPA → EURC flow.
function currencyForAsset(assetId: string): "eurc" | "usdc" {
  const id = assetId.toLowerCase()
  if (id.includes("usdc") || id.includes("usdt") || id === "usd") return "usdc"
  return "eurc"
}

function FundedInner() {
  const router = useRouter()
  const params = useSearchParams()
  const { authenticated } = usePrivy()

  const assetId = params.get("asset") || "eurc-stellar"
  const amount = params.get("amount") || ""
  const via = params.get("via")
  const asset = getAssetById(assetId)
  const currency = currencyForAsset(assetId)

  // Card top-ups (Meld) land USDC/USDT on BSC, which `useBridgeBalance` (a
  // Stellar custodial read) can't see. For the card path we watch the on-chain
  // BSC balance directly and declare arrival on the first real delta.
  const isCard = via === "card"
  const { wallets } = useWallets()
  const { address: activeAddress } = useActiveWallet()
  const evmAddress = useMemo(
    () => resolveMeldEvmAddress(activeAddress as string | undefined, wallets as any),
    [activeAddress, wallets],
  )
  const evmAsset: MeldAsset = assetId.toLowerCase().includes("usdt") ? "usdt" : "usdc"

  const balance = useBridgeBalance(FEATURE_FLAGS.FIAT_ONRAMP_BRIDGE && authenticated)
  const available = currency === "usdc" ? balance.usdc.available : balance.eurc.available
  const pending = currency === "usdc" ? balance.usdc.pending : balance.eurc.pending

  // Snapshot the balance the first time we get a real read. "Arrived" = the
  // available balance grew beyond what was already there when we landed. This
  // is the honest signal: a bare `available > 0` would falsely fire for users
  // who already held a balance before this top-up.
  const baselineRef = useRef<number | null>(null)
  const [arrived, setArrived] = useState(false)
  const [waitedLong, setWaitedLong] = useState(false)

  useEffect(() => {
    if (balance.isLoading) return
    if (baselineRef.current === null) {
      baselineRef.current = available
      return
    }
    if (available > baselineRef.current) setArrived(true)
  }, [available, balance.isLoading])

  // Card/BSC arrival: snapshot the on-chain balance, then poll for a delta.
  const evmBaselineRef = useRef<number | null>(null)
  useEffect(() => {
    if (!isCard || !evmAddress || arrived) return
    let stopped = false
    const tick = async () => {
      const cur = await readBscStableBalance("eip155:56", evmAsset, evmAddress)
      if (cur == null || stopped) return
      if (evmBaselineRef.current === null) {
        evmBaselineRef.current = cur
        return
      }
      if (cur - evmBaselineRef.current >= MELD_MIN_SETTLE_DELTA) setArrived(true)
    }
    void tick()
    const id = setInterval(() => void tick(), 6_000)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [isCard, evmAddress, evmAsset, arrived])

  // Poll faster than the hook's idle 30s cadence while the user is staring at
  // this screen waiting for money to land.
  const refresh = balance.refresh
  useEffect(() => {
    if (arrived) return
    const id = setInterval(() => refresh(), 6_000)
    return () => clearInterval(id)
  }, [arrived, refresh])

  // After ~75s soften the copy: SEPA can take a while, and we don't want the
  // user stuck staring at a spinner. The "Continue" button is always live.
  useEffect(() => {
    const id = setTimeout(() => setWaitedLong(true), 75_000)
    return () => clearTimeout(id)
  }, [])

  // Hand back into the in-place Easy view directly. `/app/easy` redirects to
  // `/app?view=easy` and would drop the query, so we target `/app` ourselves
  // and keep `deposit`/`amount` intact for the resume consumers
  // (DepositResumeFromUrl on desktop, EasyCardDev on mobile).
  const continueHref = useMemo(() => {
    const q = new URLSearchParams({ view: "easy", deposit: assetId })
    if (amount) q.set("amount", amount)
    return `/app?${q.toString()}`
  }, [assetId, amount])

  // Auto-hand off shortly after we detect arrival, so the success state gets a
  // beat to register before the deposit sheet takes over.
  useEffect(() => {
    if (!arrived) return
    const id = setTimeout(() => router.push(continueHref), 1_400)
    return () => clearTimeout(id)
  }, [arrived, continueHref, router])

  const assetLabel = asset?.name ?? asset?.symbol ?? "your account"
  const fundingDisabled = !FEATURE_FLAGS.FIAT_ONRAMP_BRIDGE

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-[2rem] border border-foreground/[0.09] bg-background shadow-2xl p-8 flex flex-col items-center text-center gap-6">
        {/* Status icon */}
        <div
          className={
            "h-16 w-16 rounded-full flex items-center justify-center " +
            (arrived ? "bg-emerald-500" : "bg-emerald-500/10")
          }
        >
          {arrived ? (
            <Check className="h-8 w-8 text-white" />
          ) : (
            <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
          )}
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black tracking-tight">
            {arrived ? "Your money's in." : "Almost there…"}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {fundingDisabled
              ? `Continue to deposit into ${assetLabel}.`
              : arrived
                ? `Taking you to deposit into ${assetLabel}.`
                : pending > 0
                  ? `We've received your transfer and it's on its way to your wallet. This page updates on its own.`
                  : waitedLong
                    ? `Your transfer can take a little while to arrive. You can wait here or continue — your balance will update automatically.`
                    : `We're confirming your transfer. This page updates on its own.`}
          </p>
        </div>

        {/* Live amount readout while waiting */}
        {!fundingDisabled && !arrived && (available > 0 || pending > 0) && (
          <div className="w-full rounded-xl bg-muted/40 border border-border/40 px-4 py-3 text-left">
            {pending > 0 && (
              <p className="text-xs text-muted-foreground">
                On its way:{" "}
                <span className="font-semibold text-foreground">
                  {pending.toLocaleString(undefined, {
                    style: "currency",
                    currency: currency === "usdc" ? "USD" : "EUR",
                  })}
                </span>
              </p>
            )}
            {available > 0 && (
              <p className="text-xs text-muted-foreground">
                Available now:{" "}
                <span className="font-semibold text-foreground">
                  {available.toLocaleString(undefined, {
                    style: "currency",
                    currency: currency === "usdc" ? "USD" : "EUR",
                  })}
                </span>
              </p>
            )}
          </div>
        )}

        <button
          onClick={() => router.push(continueHref)}
          className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-base shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all active:scale-[0.98] cursor-pointer"
        >
          {arrived ? "Continue" : "Continue to deposit"}
        </button>

        {!fundingDisabled && (
          <p className="text-[11px] text-muted-foreground/50">
            {balance.isFetching ? "Checking your balance…" : "We'll update your balance automatically."}
          </p>
        )}
      </div>
    </div>
  )
}

export default function FundedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex items-center justify-center">
          <Loader2 className="h-5 w-5 text-muted-foreground/40 animate-spin" />
        </div>
      }
    >
      <FundedInner />
    </Suspense>
  )
}
