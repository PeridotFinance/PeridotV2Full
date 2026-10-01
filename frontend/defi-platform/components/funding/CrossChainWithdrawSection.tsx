"use client"

/**
 * The Withdraw tab of a Stellar market when the money can go to another
 * network (stage X4): "Receive on" above the form, and for another network a
 * form of its own that quotes the conversion and starts the withdrawal in
 * `CrossChainFlowProvider`. While a withdrawal for this market exists its steps
 * replace the form.
 *
 * Default is the Stellar wallet, and nothing ever picks another network for the
 * user: moving money off Stellar is a decision, not a convenience. A pick holds
 * for the session. Each network is offered with one token, the one most wallets
 * hold there (USDT on BNB Smart Chain, USDC elsewhere, USDG on Robinhood Chain),
 * sent to the connected wallet, whose address is on the option.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useConfig } from "wagmi"
import { useQueries } from "@tanstack/react-query"
import { formatUnits, parseUnits } from "viem"
import { ArrowRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Asset } from "@/types/markets"
import AmountInput from "@/components/markets/dev/ui/AmountInput"
import { SourcePicker, type PickerOption } from "@/components/funding/SourcePicker"
import { OtherFlowNote, TransferProgress } from "@/components/funding/TransferProgress"
import { useCrossChainFlow } from "@/components/funding/CrossChainFlowProvider"
import { xcApi, XcClientError, type XcQuote, type XcTokenInfo } from "@/lib/crosschain/client"
import { checkAmountUsd } from "@/lib/crosschain/preflight"
import { XC_DEFAULT_SLIPPAGE_BPS, XC_EVM_CHAIN_IDS, XC_MIN_USD, XC_STELLAR_MARKET_SYMBOL } from "@/lib/crosschain/route"
import { xcError, type XcError } from "@/lib/crosschain/errors"
import { formatTokenAmount, formatUsd, shortAddress, xcChainName } from "@/lib/crosschain/present"

/** Measured in Phase 0: 34 seconds from the Stellar signature to Base. */
const TYPICAL_TIME = "about 1 min"
const QUOTE_DEBOUNCE_MS = 400

/** The order networks are listed in: the cheap ones first, fixed so nothing moves. */
const DESTINATION_ORDER = [8453, 42161, 56, 43114, 137, 1, 4663]

const PICK_KEY = (marketId: string) => `peridot.xc.receiveOn.${marketId}`

function readPick(marketId: string): string | null {
  try {
    return window.sessionStorage.getItem(PICK_KEY(marketId))
  } catch {
    return null
  }
}

function storePick(marketId: string, key: string): void {
  try {
    window.sessionStorage.setItem(PICK_KEY(marketId), key)
  } catch {
    /* the pick holds for this render tree only */
  }
}

/** The token a withdrawal to `chain` arrives as. */
function destinationToken(chain: number, tokens: XcTokenInfo[]): XcTokenInfo | null {
  const order = chain === 56 ? ["USDT", "USDC"] : ["USDC", "USDT", "USDG"]
  for (const symbol of order) {
    const hit = tokens.find((t) => t.symbol === symbol)
    if (hit) return hit
  }
  return null
}

export interface Destination {
  key: string
  chain: number
  token: XcTokenInfo
}

/** Every network the connected EVM wallet can receive on, with its token. */
export function useWithdrawDestinations(enabled: boolean): Destination[] {
  const config = useConfig()
  const chains = useMemo(
    () =>
      config.chains
        .map((c) => c.id)
        .filter((id) => (XC_EVM_CHAIN_IDS as readonly number[]).includes(id))
        .sort((a, b) => DESTINATION_ORDER.indexOf(a) - DESTINATION_ORDER.indexOf(b)),
    [config.chains],
  )
  const results = useQueries({
    queries: chains.map((chain) => ({
      queryKey: ["xc-tokens", chain],
      queryFn: async () => (await xcApi.tokens(chain)).tokens,
      staleTime: 10 * 60_000,
      enabled,
    })),
  })
  return useMemo(() => {
    const out: Destination[] = []
    chains.forEach((chain, i) => {
      const token = destinationToken(chain, results[i]?.data ?? [])
      if (token) out.push({ key: `${chain}:${token.address.toLowerCase()}`, chain, token })
    })
    return out
    // `results` is a new array on every render; its data is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chains, ...results.map((r) => r.data)])
}

export interface CrossChainWithdrawSectionProps {
  asset: Asset
  /** Supplied in this market, whole tokens. */
  supplied: number
  hasPosition: boolean
  /** The ordinary Stellar withdraw form (or the "nothing supplied" note). */
  stellarForm: ReactNode
  /** The ordinary form is mid-transaction: the destination may not change under it. */
  stellarBusy: boolean
}

export function CrossChainWithdrawSection(props: CrossChainWithdrawSectionProps) {
  const ctx = useCrossChainFlow()
  const { asset, hasPosition, stellarForm, stellarBusy } = props
  const marketSymbol = XC_STELLAR_MARKET_SYMBOL[asset.id]
  const enabled = Boolean(ctx?.evmAddress && marketSymbol)
  const destinations = useWithdrawDestinations(enabled)

  const [picked, setPicked] = useState<string | null>(null)
  useEffect(() => setPicked(readPick(asset.id)), [asset.id])

  if (!ctx || !marketSymbol) return <>{stellarForm}</>

  // A withdrawal from this market owns the tab until it is closed.
  if (ctx.flow?.kind === "withdraw" && ctx.flow.marketId === asset.id && ctx.progress) {
    return <TransferProgress />
  }

  // Nothing to withdraw, or nowhere else to send it: the tab is what it was.
  if (!hasPosition || !ctx.evmAddress || destinations.length === 0) return <>{stellarForm}</>

  const selected = destinations.find((d) => d.key === picked) ?? null
  const stellarToken = ctx.stellarTokens.find((t) => t.symbol === marketSymbol) ?? null
  const choose = (key: string) => {
    setPicked(key === "stellar" ? null : key)
    storePick(asset.id, key)
  }

  const options: PickerOption[] = [
    {
      key: "stellar",
      chain: "stellar",
      symbol: asset.symbol,
      amount: 0,
      usd: null,
      title: "Stellar wallet",
      subtitle: "No conversion, arrives right away",
    },
    ...destinations.map((d) => ({
      key: d.key,
      chain: d.chain,
      symbol: d.token.symbol,
      amount: 0,
      usd: null,
      title: `${d.token.symbol} on ${xcChainName(d.chain)}`,
      subtitle: `To your wallet ${shortAddress(ctx.evmAddress!)}`,
    })),
  ]

  return (
    <div className="space-y-4">
      <SourcePicker
        label="Receive on"
        testId="xc-destination-picker"
        footer={`Other networks go to your connected wallet. Converted on the way, minimum ${formatUsd(XC_MIN_USD)}.`}
        options={options}
        value={selected?.key ?? "stellar"}
        onChange={choose}
        disabled={stellarBusy}
      />
      {selected && stellarToken ? (
        <ForeignWithdrawForm key={selected.key} {...props} destination={selected} stellarToken={stellarToken} marketSymbol={marketSymbol} />
      ) : (
        stellarForm
      )}
    </div>
  )
}

// ─── Another network ───────────────────────────────────────────────────────

function ForeignWithdrawForm({
  asset,
  supplied,
  destination,
  stellarToken,
  marketSymbol,
}: CrossChainWithdrawSectionProps & {
  destination: Destination
  stellarToken: XcTokenInfo
  marketSymbol: string
}) {
  const ctx = useCrossChainFlow()!
  const [amount, setAmount] = useState("")
  const [quote, setQuote] = useState<XcQuote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState<XcError | null>(null)
  const [starting, setStarting] = useState(false)

  const chainName = xcChainName(destination.chain)
  const dstSymbol = destination.token.symbol

  const raw = useMemo(() => {
    try {
      const v = parseUnits(amount || "0", stellarToken.decimals)
      return v > BigInt(0) ? v : null
    } catch {
      return null
    }
  }, [amount, stellarToken.decimals])

  // Quote while typing. The last quote stays on screen, dimmed, until the next one lands.
  useEffect(() => {
    setQuoteError(null)
    if (!raw) {
      setQuote(null)
      setQuoting(false)
      return
    }
    setQuoting(true)
    let alive = true
    const id = setTimeout(() => {
      xcApi
        .quote({
          src: "stellar",
          dst: destination.chain,
          srcToken: stellarToken.address,
          dstToken: destination.token.address,
          amount: raw.toString(),
          slippageBps: XC_DEFAULT_SLIPPAGE_BPS,
        })
        .then((q) => alive && setQuote(q))
        .catch((e) => {
          if (!alive) return
          setQuote(null)
          setQuoteError(e instanceof XcClientError ? e.error : xcError("unavailable"))
        })
        .finally(() => alive && setQuoting(false))
    }, QUOTE_DEBOUNCE_MS)
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [raw, destination.chain, destination.token.address, stellarToken.address])

  const amountNum = Number(amount) || 0
  // A withdrawal within 1% of the position takes all of it, so no dust stays behind.
  const full = supplied > 0 && amountNum >= supplied * 0.99
  const receive = quote ? Number(formatUnits(BigInt(quote.quotedOut), quote.dstDecimals)) : null
  const minOut = quote ? Number(formatUnits(BigInt(quote.minOut), quote.dstDecimals)) : null
  const srcUsd = stellarToken.usdPrice != null ? amountNum * stellarToken.usdPrice : null
  const dstUsd = receive != null && destination.token.usdPrice != null ? receive * destination.token.usdPrice : null
  const cost = srcUsd != null && dstUsd != null ? Math.max(0, srcUsd - dstUsd) : null

  const problems: XcError[] = []
  if (raw) {
    if (amountNum > supplied * 1.000001) problems.push(xcError("insufficient_funds", `You have ${formatTokenAmount(supplied)} ${asset.symbol} supplied.`))
    if (quote?.limit) problems.push(quote.limit)
    else {
      const limit = checkAmountUsd(quote?.usd ?? srcUsd)
      if (limit) problems.push(limit)
    }
  }
  const firstProblem = problems[0] ?? (quoteError && !quoting ? quoteError : null)

  const ready =
    Boolean(raw && quote && !quoting && ctx.stellarAddress && ctx.evmAddress) &&
    problems.length === 0 &&
    !ctx.blocked &&
    !starting

  const start = async () => {
    if (!ready) return
    setStarting(true)
    try {
      await ctx.startWithdraw({
        marketId: asset.id,
        amount,
        full,
        srcToken: stellarToken,
        dstChain: destination.chain,
        dstToken: destination.token,
      })
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="space-y-4">
      <AmountInput
        value={amount}
        onChange={setAmount}
        maxAmount={supplied}
        maxLabel="Supplied"
        symbol={asset.symbol}
        disabled={ctx.busy || starting}
      />

      {raw && (
        <div
          className={cn(
            "rounded-xl border border-border/50 bg-muted/20 p-3 sm:p-4 space-y-2 transition-opacity",
            quoting && "opacity-60",
          )}
          data-testid="xc-withdraw-quote"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">You receive on {chainName}</span>
            <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold font-mono tabular-nums">
              {quoting && !quote && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {receive != null ? `≈ ${formatTokenAmount(receive)} ${dstSymbol}` : quoting ? "Getting a quote" : "n/a"}
            </span>
          </div>
          {quote && minOut != null && (
            <p className="text-[11px] text-muted-foreground">
              At least {formatTokenAmount(minOut)} {dstSymbol} · {TYPICAL_TIME}
              {cost != null && ` · conversion ${cost < 0.01 ? "under $0.01" : formatUsd(cost)}`}
            </p>
          )}
          {quote && (
            <details className="group text-[11px] text-muted-foreground">
              <summary className="cursor-pointer select-none list-none hover:text-foreground">
                <span className="group-open:hidden">Route details</span>
                <span className="hidden group-open:inline">Hide route details</span>
              </summary>
              <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
                <dt>Route</dt>
                <dd className="text-right">
                  {marketSymbol} on Stellar → {dstSymbol} on {chainName}, via SODAX
                </dd>
                <dt>Minimum received</dt>
                <dd className="text-right font-mono">
                  {minOut != null ? formatTokenAmount(minOut) : "n/a"} {dstSymbol}
                </dd>
                <dt>Max. slippage</dt>
                <dd className="text-right font-mono">{(XC_DEFAULT_SLIPPAGE_BPS / 100).toFixed(1)}%</dd>
                <dt>You confirm</dt>
                <dd className="text-right">
                  {ctx.silentStellar
                    ? "nothing more, your Stellar wallet signs by itself"
                    : "two signatures in your Stellar wallet: the withdrawal, then the send"}
                </dd>
                <dt>Arrives at</dt>
                <dd className="text-right font-mono">{ctx.evmAddress ? shortAddress(ctx.evmAddress) : "n/a"}</dd>
                <dt>Network fee</dt>
                <dd className="text-right">none on {chainName}, the conversion covers delivery</dd>
              </dl>
            </details>
          )}
        </div>
      )}

      {firstProblem && <p className="px-1 text-xs text-destructive">{firstProblem.message}</p>}
      {ctx.blocked && <OtherFlowNote />}

      <button
        onClick={start}
        disabled={!ready}
        data-testid="xc-withdraw-start"
        className={cn(
          "relative w-full h-12 rounded-2xl font-semibold text-sm transition-all duration-200 active:scale-[0.97]",
          "glass border border-[var(--border-cyber-hover)] text-foreground hover:bg-white/[0.08]",
          "disabled:cursor-not-allowed disabled:opacity-40",
        )}
      >
        {starting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Starting
          </span>
        ) : (
          <span className="flex items-center justify-center gap-1.5">
            Withdraw to {chainName} <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </button>
    </div>
  )
}
