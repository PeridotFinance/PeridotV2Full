"use client"

/**
 * The steps of a cross-chain supply or withdrawal, as they happen: which one is
 * running, what it waits for, what is done, and where the money is when
 * something stops.
 *
 * Renders the running flow of `CrossChainFlowProvider`, so it looks the same
 * after a reload as before it. One primary action at most: supply what
 * arrived, send on what was withdrawn, or close the card once there is nothing
 * left to do.
 */
import { useEffect, useState } from "react"
import { AlertCircle, ArrowRight, Check, CircleDot, CircleSlash, ExternalLink, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { tabForFlow, useCrossChainFlow } from "@/components/funding/CrossChainFlowProvider"
import { SODAX_SCAN_URL } from "@/lib/crosschain/sodax"
import { xcChainName, type ProgressStatus } from "@/lib/crosschain/present"
import type { XcChain } from "@/lib/crosschain/route"

const EVM_EXPLORERS: Record<string, string> = {
  "1": "https://etherscan.io",
  "56": "https://bscscan.com",
  "137": "https://polygonscan.com",
  "8453": "https://basescan.org",
  "42161": "https://arbiscan.io",
  "43114": "https://snowtrace.io",
}

function txUrl(chain: XcChain, hash: string): string | null {
  if (chain === "stellar") return `https://stellar.expert/explorer/public/tx/${hash}`
  const base = EVM_EXPLORERS[String(chain)]
  return base ? `${base}/tx/${hash}` : null
}

function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`
  const h = Math.floor(m / 60)
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)} days`
}

function StepIcon({ status, quiet }: { status: ProgressStatus; quiet?: boolean }) {
  const base = "flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
  switch (status) {
    case "done":
      return (
        <span className={cn(base, "bg-emerald-500/15 text-emerald-500")}>
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )
    case "active":
      return (
        <span className={cn(base, "bg-primary/10 text-primary")}>
          <Loader2 className="h-3 w-3 animate-spin" />
        </span>
      )
    case "attention":
      return (
        <span className={cn(base, "bg-amber-500/15 text-amber-500")}>
          <CircleDot className="h-3 w-3" />
        </span>
      )
    case "failed":
      return (
        <span className={cn(base, quiet ? "bg-muted text-muted-foreground" : "bg-destructive/15 text-destructive")}>
          <X className="h-3 w-3" strokeWidth={3} />
        </span>
      )
    default:
      return <span className={cn(base, "border border-border/60")} />
  }
}

export function TransferProgress({ className }: { className?: string }) {
  const ctx = useCrossChainFlow()
  const [now, setNow] = useState(() => Date.now())
  const working = ctx?.progress?.tone === "working"
  useEffect(() => {
    if (!working) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [working])

  if (!ctx?.flow || !ctx.progress) return null
  const { flow, progress, supply, withdraw, transfer, srcTxHash } = ctx
  const outbound = flow.kind === "withdraw"
  const dstName = xcChainName(flow.dstChain)

  const links: { label: string; href: string }[] = []
  const push = (label: string, href: string | null) => href && links.push({ label, href })
  if (outbound) {
    push("Withdrawal", withdraw.txHash ? txUrl("stellar", withdraw.txHash) : null)
    push("Send on Stellar", srcTxHash ? txUrl("stellar", srcTxHash) : null)
  } else {
    push(`${xcChainName(flow.srcChain)} transaction`, srcTxHash ? txUrl(flow.srcChain, srcTxHash) : null)
  }
  if (transfer?.src.txHash) push("Conversion on SODAX", SODAX_SCAN_URL)
  if (!outbound) push("Supply transaction", supply.txHash ? txUrl("stellar", supply.txHash) : null)

  const needsSupply = !outbound && (supply.phase === "waiting" || supply.phase === "failed")
  const needsSend = outbound && progress.tone === "attention"
  const sendFailed = needsSend && progress.steps.some((st) => st.key === "send" && st.status === "failed")
  const closable = progress.tone === "done" || progress.tone === "failed"

  return (
    <div
      className={cn(
        "rounded-xl border p-3 sm:p-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200",
        progress.tone === "done"
          ? "border-emerald-500/25 bg-emerald-500/[0.04]"
          : progress.tone === "failed" && !progress.quiet
            ? "border-destructive/25 bg-destructive/[0.04]"
            : progress.tone === "attention"
              ? "border-amber-500/25 bg-amber-500/[0.04]"
              : "border-border/60 bg-muted/20",
        className,
      )}
      data-testid="xc-transfer-progress"
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5">
          {progress.tone === "done" ? (
            <Check className="h-4 w-4 text-emerald-500" strokeWidth={3} />
          ) : progress.quiet ? (
            <CircleSlash className="h-4 w-4 text-muted-foreground" />
          ) : progress.tone === "failed" ? (
            <AlertCircle className="h-4 w-4 text-destructive" />
          ) : progress.tone === "attention" ? (
            <CircleDot className="h-4 w-4 text-amber-500" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold leading-snug">{progress.headline}</p>
            {working && (
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/70">
                {elapsed(now - flow.startedAt)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{progress.note}</p>
        </div>
      </div>

      <ol className="space-y-2.5 pl-0.5">
        {progress.steps.map((step, i) => (
          <li key={step.key} className="relative flex gap-2.5">
            {i < progress.steps.length - 1 && (
              <span
                className={cn(
                  "absolute left-[9.5px] top-5 h-[calc(100%-6px)] w-px",
                  step.status === "done" ? "bg-emerald-500/30" : "bg-border/60",
                )}
                aria-hidden
              />
            )}
            <StepIcon status={step.status} quiet={progress.quiet} />
            <div className="min-w-0 pb-0.5">
              <p
                className={cn(
                  "text-[13px] leading-5",
                  step.status === "pending" ? "text-muted-foreground/60" : "text-foreground",
                  step.status === "active" && "font-medium",
                )}
              >
                {step.label}
              </p>
              {step.detail && (
                <p
                  className={cn(
                    "text-xs",
                    step.status === "failed" && !progress.quiet ? "text-destructive" : step.status === "attention" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                  )}
                >
                  {step.detail}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {(links.length > 0 || transfer) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {links.map((l) => (
            <a key={l.label} className="inline-flex items-center gap-1 hover:text-foreground" href={l.href} target="_blank" rel="noreferrer">
              {l.label} <ExternalLink className="h-3 w-3" />
            </a>
          ))}
          {transfer && <span className="font-mono text-muted-foreground/60">#{transfer.id}</span>}
        </div>
      )}

      {needsSupply && transfer && (
        <div className="flex gap-2">
          <button
            onClick={ctx.supplyNow}
            disabled={ctx.busy}
            className="h-10 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
          >
            {supply.phase === "failed" ? "Try again" : "Supply now"}
          </button>
          <button
            onClick={() => void ctx.keepInWallet(transfer)}
            disabled={ctx.busy}
            className="h-10 rounded-xl border border-border/60 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            Keep in wallet
          </button>
        </div>
      )}
      {needsSend && (
        <div className="flex gap-2">
          <button
            onClick={ctx.sendNow}
            disabled={ctx.busy}
            data-testid="xc-send-now"
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
          >
            {sendFailed ? "Try again" : `Send to ${dstName}`}
            {!sendFailed && <ArrowRight className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => void ctx.keepOnStellar()}
            disabled={ctx.busy}
            className="h-10 rounded-xl border border-border/60 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            Keep on Stellar
          </button>
        </div>
      )}
      {closable && (
        <button
          onClick={ctx.clearFlow}
          className="h-10 w-full rounded-xl border border-border/60 text-sm font-medium transition-colors hover:bg-muted/40"
        >
          {progress.tone === "done" ? "Done" : "Close"}
        </button>
      )}
    </div>
  )
}

/**
 * Under a form whose button is off because another flow runs or waits: says so
 * and leads to it, rather than leaving a dead button unexplained.
 */
export function OtherFlowNote() {
  const ctx = useCrossChainFlow()
  if (!ctx?.flow) return null
  const { flow } = ctx
  const waiting = ctx.progress?.tone === "attention"
  const what = flow.kind === "withdraw" ? `withdrawal to ${xcChainName(flow.dstChain)}` : `transfer from ${xcChainName(flow.srcChain)}`
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <span>{waiting ? `Your ${what} waits for you. Finish it first.` : `Your ${what} is still running. It has to finish first.`}</span>
      <button
        type="button"
        onClick={() => ctx.focusMarket(flow.marketId, tabForFlow(flow.kind))}
        className="shrink-0 font-medium text-primary hover:underline"
      >
        Show
      </button>
    </div>
  )
}
