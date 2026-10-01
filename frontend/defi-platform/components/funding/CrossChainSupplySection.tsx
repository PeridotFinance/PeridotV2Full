"use client"

/**
 * The Supply tab of a Stellar market when money can come from another network:
 * "Pay with" above the form, and for a foreign source a form of its own that
 * quotes the conversion, checks what could stop it, and starts the flow in
 * `CrossChainFlowProvider`. While a flow for this market exists its steps
 * replace the form, so the tab has one thing to look at and one action.
 *
 * Selection (CROSSCHAIN_STELLAR_PLAN.md, "Expert mode"): the Stellar wallet
 * when it holds this market's token, else the largest other source above the
 * transfer minimum. The default follows balances as they load until the user
 * types or picks; a pick holds for the session. Nothing moves under the cursor.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { formatUnits, parseUnits } from "viem"
import { ChevronRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Asset } from "@/types/markets"
import AmountInput from "@/components/markets/dev/ui/AmountInput"
import { SourcePicker, type PickerOption } from "@/components/funding/SourcePicker"
import { OtherFlowNote, TransferProgress } from "@/components/funding/TransferProgress"
import { sourceKey, useCrossChainFlow } from "@/components/funding/CrossChainFlowProvider"
import type { FundingSource } from "@/hooks/use-funding-sources"
import { xcApi, XcClientError, type XcQuote } from "@/lib/crosschain/client"
import { maxSpendable, preflight } from "@/lib/crosschain/preflight"
import { XC_DEFAULT_SLIPPAGE_BPS, XC_MIN_USD, XC_STELLAR_MARKET_SYMBOL } from "@/lib/crosschain/route"
import { xcError, type XcError } from "@/lib/crosschain/errors"
import { formatTokenAmount, formatUsd, xcChainName, xcNativeSymbol } from "@/lib/crosschain/present"
import { stellarClassicAssetForId, stellarEstablishTrustline, stellarHasTrustline } from "@/lib/stellar-trustline"

/** Measured end to end in Phase 0 and X2: 45 to 60 seconds from the signature to Stellar. */
const TYPICAL_TIME = "about 1 min"
const QUOTE_DEBOUNCE_MS = 400

const PICK_KEY = (marketId: string) => `peridot.xc.payWith.${marketId}`

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

export interface CrossChainSupplySectionProps {
  asset: Asset
  supplyApy: number
  priceUsd: number
  /** Spendable balance of the market's token in the Stellar wallet. */
  stellarBalance: number
  /** The ordinary Stellar supply form, shown while the Stellar wallet is the source. */
  stellarForm: ReactNode
  /** The ordinary form is mid-transaction: the source may not change under it. */
  stellarBusy: boolean
}

export function CrossChainSupplySection(props: CrossChainSupplySectionProps) {
  const ctx = useCrossChainFlow()
  const { asset, stellarBalance, stellarForm, stellarBusy } = props
  const marketSymbol = XC_STELLAR_MARKET_SYMBOL[asset.id]

  const foreign = useMemo(
    () => (ctx?.evmAddress ? ctx.sources.filter((s) => s.chain !== "stellar") : []),
    [ctx?.evmAddress, ctx?.sources],
  )

  const [picked, setPicked] = useState<string | null>(null)
  const [locked, setLocked] = useState<string | null>(null)
  useEffect(() => setPicked(readPick(asset.id)), [asset.id])

  // The banner can ask this market to preselect a source.
  const preselect = ctx?.preselect
  useEffect(() => {
    if (preselect && preselect.marketId === asset.id) {
      setPicked(preselect.key)
      storePick(asset.id, preselect.key)
    }
  }, [preselect, asset.id])

  const defaultKey = useMemo(() => {
    if (stellarBalance > 0) return "stellar"
    const best = foreign.find((s) => (s.usd ?? 0) >= XC_MIN_USD)
    return best ? sourceKey(best) : "stellar"
  }, [stellarBalance, foreign])

  const candidate = picked ?? locked ?? defaultKey
  const selectedKey = candidate === "stellar" || foreign.some((s) => sourceKey(s) === candidate) ? candidate : "stellar"
  const selected = foreign.find((s) => sourceKey(s) === selectedKey) ?? null

  const choose = (key: string) => {
    setPicked(key)
    storePick(asset.id, key)
  }
  const lockDefault = () => setLocked((l) => l ?? selectedKey)

  if (!ctx || !marketSymbol) return <>{stellarForm}</>

  // A flow for this market owns the tab until it is closed.
  if (ctx.flow?.kind === "supply" && ctx.flow.marketId === asset.id && ctx.progress) {
    return <TransferProgress />
  }

  // Nothing elsewhere: the tab is exactly what it was.
  if (foreign.length === 0) return <>{stellarForm}</>

  const options: PickerOption[] = [
    {
      key: "stellar",
      chain: "stellar",
      symbol: asset.symbol,
      amount: stellarBalance,
      usd: stellarBalance * props.priceUsd,
      title: "Stellar wallet",
    },
    ...foreign.map((s) => ({
      key: sourceKey(s),
      chain: s.chain,
      symbol: s.token.symbol,
      amount: s.amount,
      usd: s.usd,
      disabledReason: s.usd != null && s.usd < XC_MIN_USD ? `${formatTokenAmount(s.amount)} ${s.token.symbol}, below the ${formatUsd(XC_MIN_USD)} minimum` : undefined,
    })),
  ]

  const otherWorth = foreign.filter((s) => (s.usd ?? 0) >= XC_MIN_USD)
  const busyElsewhere = ctx.blocked

  return (
    <div className="space-y-4">
      <SourcePicker options={options} value={selectedKey} onChange={choose} disabled={stellarBusy} />

      {selected ? (
        <ForeignSupplyForm
          key={selectedKey}
          {...props}
          source={selected}
          marketSymbol={marketSymbol}
          busyElsewhere={busyElsewhere}
          onEdit={lockDefault}
        />
      ) : (
        <>
          {stellarBalance <= 0 && otherWorth.length > 0 && (
            <button
              type="button"
              onClick={() => choose(sourceKey(otherWorth[0]))}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/[0.04] px-3 py-2 text-left text-xs transition-colors hover:border-primary/40"
            >
              <span>
                You hold {formatTokenAmount(otherWorth[0].amount)} {otherWorth[0].token.symbol} on{" "}
                {xcChainName(otherWorth[0].chain)}. Supply it from there.
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
            </button>
          )}
          <div onInputCapture={lockDefault}>{stellarForm}</div>
        </>
      )}
    </div>
  )
}

// ─── A foreign source ──────────────────────────────────────────────────────

function ForeignSupplyForm({
  asset,
  supplyApy,
  priceUsd,
  source,
  marketSymbol,
  busyElsewhere,
  onEdit,
}: CrossChainSupplySectionProps & {
  source: FundingSource
  marketSymbol: string
  busyElsewhere: boolean
  onEdit: () => void
}) {
  const ctx = useCrossChainFlow()!
  const [amount, setAmount] = useState("")
  const [quote, setQuote] = useState<XcQuote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState<XcError | null>(null)
  const [trustline, setTrustline] = useState<boolean | null>(null)
  const [fixingTrustline, setFixingTrustline] = useState(false)
  const [starting, setStarting] = useState(false)

  const chainName = xcChainName(source.chain)
  const dstToken = ctx.stellarTokens.find((t) => t.symbol === marketSymbol) ?? null
  const spendable = maxSpendable(source.chain, source.token.symbol, source.amount, source.isNative)

  const raw = useMemo(() => {
    try {
      const v = parseUnits(amount || "0", source.token.decimals)
      return v > BigInt(0) ? v : null
    } catch {
      return null
    }
  }, [amount, source.token.decimals])

  // Quote while typing. The last quote stays on screen, dimmed, until the next one lands.
  useEffect(() => {
    setQuoteError(null)
    if (!raw || !dstToken) {
      setQuote(null)
      setQuoting(false)
      return
    }
    setQuoting(true)
    let alive = true
    const id = setTimeout(() => {
      xcApi
        .quote({
          src: source.chain,
          dst: "stellar",
          srcToken: source.token.address,
          dstToken: dstToken.address,
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
  }, [raw, dstToken, source.chain, source.token.address])

  // USDC deliveries need a trustline on the receiving Stellar wallet.
  const classic = stellarClassicAssetForId(asset.id)
  const stellarAddress = ctx.stellarAddress
  useEffect(() => {
    if (!stellarAddress || !classic) return setTrustline(null)
    let alive = true
    stellarHasTrustline(stellarAddress, classic.code, classic.issuer)
      .then((ok) => alive && setTrustline(ok))
      .catch(() => alive && setTrustline(null))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stellarAddress, asset.id])

  const amountNum = Number(amount) || 0
  const quotedOut = quote && dstToken ? Number(formatUnits(BigInt(quote.quotedOut), quote.dstDecimals)) : null
  const minOut = quote && dstToken ? Number(formatUnits(BigInt(quote.minOut), quote.dstDecimals)) : null
  const srcUsd = source.token.usdPrice != null ? amountNum * source.token.usdPrice : null
  const dstUsd = quotedOut != null && dstToken?.usdPrice != null ? quotedOut * dstToken.usdPrice : null
  const cost = srcUsd != null && dstUsd != null ? Math.max(0, srcUsd - dstUsd) : null

  const hasGas = source.isNative || ctx.sources.some((s) => s.chain === source.chain && s.isNative)
  const problems: XcError[] = raw
    ? [
        ...(quote?.limit ? [quote.limit] : []),
        ...preflight({
          direction: "in",
          src: source.chain,
          srcSymbol: source.token.symbol,
          dstSymbol: marketSymbol,
          srcIsNative: source.isNative,
          amount: amountNum,
          srcBalance: source.amount,
          usd: quote?.usd ?? srcUsd,
          stellarHasUsdcTrustline: trustline,
        }).filter((p) => !(quote?.limit && p.code === quote.limit.code)),
        ...(hasGas
          ? []
          : [
              xcError(
                "insufficient_funds",
                `You need a little ${xcNativeSymbol(source.chain)} on ${chainName} to pay the network fee.`,
              ),
            ]),
      ]
    : []
  const firstProblem = problems[0] ?? (quoteError && !quoting ? quoteError : null)

  const ready =
    Boolean(raw && dstToken && quote && !quoting && ctx.stellarAddress && ctx.evmAddress) &&
    problems.length === 0 &&
    !ctx.blocked &&
    !starting

  const annualEarn = (quotedOut ?? 0) * (supplyApy / 100) * priceUsd

  const start = async () => {
    if (!ready || !raw || !dstToken) return
    setStarting(true)
    try {
      await ctx.startSupply({ marketId: asset.id, source, amount: raw, dstToken, slippageBps: XC_DEFAULT_SLIPPAGE_BPS })
    } finally {
      setStarting(false)
    }
  }

  const enableTrustline = async () => {
    if (!stellarAddress || !classic) return
    setFixingTrustline(true)
    try {
      await stellarEstablishTrustline(stellarAddress, classic)
      setTrustline(true)
    } catch {
      setTrustline(false)
    } finally {
      setFixingTrustline(false)
    }
  }

  return (
    <div className="space-y-4">
      <div onInputCapture={onEdit}>
        <AmountInput
          value={amount}
          onChange={(v) => {
            onEdit()
            setAmount(v)
          }}
          maxAmount={spendable}
          balanceAmount={source.amount}
          maxLabel="Wallet"
          symbol={source.token.symbol}
          disabled={ctx.busy || starting}
        />
      </div>

      {raw && (
        <div
          className={cn(
            "rounded-xl border border-border/50 bg-muted/20 p-3 sm:p-4 space-y-2 transition-opacity",
            quoting && "opacity-60",
          )}
          data-testid="xc-quote"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">You supply</span>
            <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold font-mono tabular-nums">
              {quoting && !quote && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {quotedOut != null ? `≈ ${formatTokenAmount(quotedOut)} ${marketSymbol}` : quoting ? "Getting a quote" : "n/a"}
            </span>
          </div>
          {quote && minOut != null && (
            <p className="text-[11px] text-muted-foreground">
              At least {formatTokenAmount(minOut)} {marketSymbol} · {TYPICAL_TIME}
              {cost != null && ` · conversion ${cost < 0.01 ? "under $0.01" : formatUsd(cost)}`} · plus the {chainName} network fee
            </p>
          )}
          {quote && annualEarn > 0 && (
            <p className="text-[11px] text-emerald-500">
              Earns about {formatUsd(annualEarn)} a year at {supplyApy.toFixed(2)}% APY
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
                  {source.token.symbol} on {chainName} → {marketSymbol} on Stellar, via SODAX
                </dd>
                <dt>Minimum received</dt>
                <dd className="text-right font-mono">
                  {minOut != null ? formatTokenAmount(minOut) : "n/a"} {marketSymbol}
                </dd>
                <dt>Max. slippage</dt>
                <dd className="text-right font-mono">{(XC_DEFAULT_SLIPPAGE_BPS / 100).toFixed(1)}%</dd>
                <dt>You confirm</dt>
                <dd className="text-right">
                  {source.isNative ? "" : "an approval (first time only), "}the send on {chainName}
                  {ctx.silentStellar ? "" : ", then the supply on Stellar"}
                </dd>
                <dt>Then</dt>
                <dd className="text-right">arrives in your Stellar wallet and is supplied to the {marketSymbol} market</dd>
              </dl>
            </details>
          )}
        </div>
      )}

      {firstProblem && (
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="text-xs text-destructive">{firstProblem.message}</p>
          {firstProblem.code === "no_trustline" && classic && (
            <button
              type="button"
              onClick={enableTrustline}
              disabled={fixingTrustline}
              className="shrink-0 rounded-lg border border-border/60 px-2.5 py-1 text-xs font-medium hover:bg-muted/40 disabled:opacity-50"
            >
              {fixingTrustline ? "Enabling…" : `Enable ${classic.code}`}
            </button>
          )}
        </div>
      )}
      {busyElsewhere && <OtherFlowNote />}

      <button
        onClick={start}
        disabled={!ready}
        data-testid="xc-supply-start"
        className={cn(
          "relative w-full h-12 rounded-2xl font-semibold text-sm transition-all duration-200 active:scale-[0.97]",
          "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_16px_var(--glow-primary)]",
          "disabled:cursor-not-allowed disabled:opacity-40",
        )}
      >
        {starting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Starting
          </span>
        ) : (
          `Supply from ${chainName}`
        )}
      </button>
    </div>
  )
}
