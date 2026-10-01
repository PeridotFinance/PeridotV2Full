"use client"

/**
 * The top of the Expert view, for money that is on its way or sitting elsewhere:
 *
 *   - the running flow, when its market is not the one open below (after a
 *     reload, or once the user opened another market),
 *   - other transfers still converting, or arrived and not supplied, each with
 *     the action that finishes it,
 *   - withdrawals whose money waits in the Stellar wallet, not sent on yet,
 *   - otherwise, balances on other networks worth supplying, once per session.
 *
 * Renders nothing when there is nothing to say.
 */
import { useEffect, useState, type ReactNode } from "react"
import { formatUnits } from "viem"
import { ArrowRight, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { sourceKey, tabForFlow, useCrossChainFlow } from "@/components/funding/CrossChainFlowProvider"
import { TokenOnChainLogo } from "@/components/funding/SourcePicker"
import { XC_MIN_USD } from "@/lib/crosschain/route"
import { isInFlight, type XcTransfer } from "@/lib/crosschain/view"
import { formatTokenAmount, formatUsd, xcChainName } from "@/lib/crosschain/present"
import type { WithdrawNote } from "@/lib/crosschain/client"

const HINT_DISMISSED_KEY = "peridot.xc.fundsElsewhereDismissed"

function amountOf(raw: string | null, decimals: number): string {
  return raw ? formatTokenAmount(Number(formatUnits(BigInt(raw), decimals))) : "0"
}

type RowTone = "working" | "attention" | "done" | "failed" | "quiet" | "offer"

const TONES: Record<RowTone, string> = {
  working: "border-primary/20 bg-primary/[0.03]",
  offer: "border-primary/20 bg-primary/[0.03]",
  quiet: "border-border/60 bg-muted/20",
  attention: "border-amber-500/25 bg-amber-500/[0.04]",
  done: "border-emerald-500/25 bg-emerald-500/[0.04]",
  failed: "border-destructive/25 bg-destructive/[0.04]",
}

/**
 * One banner row. On a phone the text gets the full width and wraps, and the
 * actions sit under it, lined up with the text; from `sm` up it is one line.
 */
function Row({
  tone,
  logo,
  title,
  line,
  spinning,
  children,
}: {
  tone: RowTone
  logo: ReactNode
  title: ReactNode
  line: ReactNode
  spinning?: boolean
  children: ReactNode
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5 sm:flex-nowrap sm:px-4", TONES[tone])}>
      <div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-auto">
        {logo}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug sm:truncate">{title}</p>
          <p className="text-xs leading-snug text-muted-foreground sm:truncate">
            {spinning && <Loader2 className="mr-1 inline h-3 w-3 animate-spin align-[-2px]" />}
            {line}
          </p>
        </div>
      </div>
      <div className="ml-[38px] flex shrink-0 items-center gap-1 sm:ml-0">{children}</div>
    </div>
  )
}

const primaryButton =
  "inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
// Pulled left on a phone so its text lines up with the row's text above it.
const linkButton = "-ml-2.5 sm:ml-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
const quietButton = "rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"

export function CrossChainActivityBanner({ expandedMarketId }: { expandedMarketId: string | null }) {
  const ctx = useCrossChainFlow()
  const [hintDismissed, setHintDismissed] = useState(true)
  useEffect(() => {
    try {
      setHintDismissed(window.sessionStorage.getItem(HINT_DISMISSED_KEY) === "1")
    } catch {
      setHintDismissed(false)
    }
  }, [])

  if (!ctx) return null
  const { flow, progress, openTransfers, waitingWithdrawals } = ctx

  const showFlow = Boolean(flow && progress && flow.marketId !== expandedMarketId)
  const worth = ctx.sources.filter((s) => s.chain !== "stellar" && (s.usd ?? 0) >= XC_MIN_USD)
  const showHint =
    !flow &&
    openTransfers.length === 0 &&
    waitingWithdrawals.length === 0 &&
    worth.length > 0 &&
    !hintDismissed &&
    Boolean(ctx.evmAddress)

  if (!showFlow && openTransfers.length === 0 && waitingWithdrawals.length === 0 && !showHint) return null

  const dismissHint = () => {
    setHintDismissed(true)
    try {
      window.sessionStorage.setItem(HINT_DISMISSED_KEY, "1")
    } catch {
      /* hidden for this visit */
    }
  }

  return (
    <div className="space-y-2" data-testid="xc-activity">
      {showFlow && flow && progress && (
        <Row
          tone={progress.tone}
          logo={
            <TokenOnChainLogo
              symbol={flow.kind === "withdraw" ? flow.dstSymbol : flow.srcSymbol}
              chain={flow.kind === "withdraw" ? flow.dstChain : flow.srcChain}
              size={26}
            />
          }
          title={progress.headline}
          line={currentLine(progress.steps) ?? progress.note}
          spinning={progress.tone === "working"}
        >
          <button onClick={() => ctx.focusMarket(flow.marketId, tabForFlow(flow.kind))} className={linkButton}>
            Show steps
          </button>
        </Row>
      )}

      {openTransfers.map((t) => (
        <OpenTransferRow key={t.id} t={t} />
      ))}

      {waitingWithdrawals.map((n) => (
        <WaitingWithdrawalRow key={n.key} n={n} />
      ))}

      {showHint && (
        <Row
          tone="offer"
          logo={<TokenOnChainLogo symbol={worth[0].token.symbol} chain={worth[0].chain} size={26} />}
          title={
            <>
              You hold {formatUsd(worth.reduce((sum, s) => sum + (s.usd ?? 0), 0))} on{" "}
              {Array.from(new Set(worth.map((s) => xcChainName(s.chain)))).slice(0, 3).join(", ")}
            </>
          }
          line="Supply it to a Stellar market in one step. It is converted on the way."
        >
          <button onClick={() => ctx.offerSource("usdc-stellar", sourceKey(worth[0]))} className={primaryButton}>
            Supply <ArrowRight className="h-3 w-3" />
          </button>
          <button aria-label="Hide" onClick={dismissHint} className="rounded-md p-1.5 text-muted-foreground/60 hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </Row>
      )}
    </div>
  )
}

function currentLine(steps: { label: string; status: string; detail?: string }[]): string | null {
  const s = steps.find((x) => x.status === "active" || x.status === "attention" || x.status === "failed")
  if (!s) return null
  return s.detail ? `${s.label}: ${s.detail}` : s.label
}

function OpenTransferRow({ t }: { t: XcTransfer }) {
  const ctx = useCrossChainFlow()!
  const moving = isInFlight(t)
  const out = t.direction === "out"
  const amount = `${amountOf(t.src.amount, t.src.decimals)} ${t.src.symbol}`
  const arrived = t.deliveredOut ? amountOf(t.deliveredOut, t.dst.decimals) : `at least ${amountOf(t.minOut, t.dst.decimals)}`

  const title = out
    ? `Sending ${amount} to ${xcChainName(t.dst.chain)}`
    : moving
      ? `Converting ${amount} from ${xcChainName(t.src.chain)}`
      : `${arrived} ${t.dst.symbol} arrived from ${xcChainName(t.src.chain)}`
  const line = out
    ? `On its way to your wallet on ${xcChainName(t.dst.chain)}. It continues without this page.`
    : moving
      ? "On its way to your Stellar wallet. It continues without this page."
      : "In your Stellar wallet, not supplied yet."

  return (
    <Row
      tone={moving ? "quiet" : "attention"}
      logo={<TokenOnChainLogo symbol={out ? t.dst.symbol : t.src.symbol} chain={out ? t.dst.chain : t.src.chain} size={26} />}
      title={title}
      line={line}
      spinning={moving}
    >
      {moving ? (
        <button onClick={() => ctx.pickUp(t)} disabled={ctx.busy} className={linkButton}>
          Follow
        </button>
      ) : (
        <>
          <button onClick={() => ctx.pickUp(t)} disabled={ctx.busy} className={primaryButton}>
            Supply
          </button>
          <button onClick={() => void ctx.keepInWallet(t)} disabled={ctx.busy} className={quietButton}>
            Keep in wallet
          </button>
        </>
      )}
    </Row>
  )
}

function WaitingWithdrawalRow({ n }: { n: WithdrawNote }) {
  const ctx = useCrossChainFlow()!
  return (
    <Row
      tone="attention"
      logo={<TokenOnChainLogo symbol={n.srcToken.symbol} chain="stellar" size={26} />}
      title={`${amountOf(n.raw, n.srcToken.decimals)} ${n.srcToken.symbol} waits in your Stellar wallet`}
      line={`Withdrawn for ${xcChainName(n.dstChain)}, not sent on yet.`}
    >
      <button onClick={() => ctx.pickUpWithdrawal(n)} disabled={ctx.busy} className={primaryButton}>
        Continue
      </button>
      <button onClick={() => void ctx.keepOnStellar(n)} disabled={ctx.busy} className={quietButton}>
        Keep on Stellar
      </button>
    </Row>
  )
}
