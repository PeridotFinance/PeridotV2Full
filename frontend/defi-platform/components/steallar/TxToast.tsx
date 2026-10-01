"use client"

import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertCircle, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { txTerminalCopy } from "@/lib/tx/txCopy"
import { openAddMoney } from "@/lib/onramp/add-money"

// ─── Event payload types ──────────────────────────────────────────────────────
// Shape matches the `peridot:tx-*` events emitted by `use-easy-*`, `use-stellar-*`,
// and `use-*-transaction` hooks. See hooks/* for producers.

interface TxUpdateDetail {
  step?: string
  statusMessage?: string
  txHash?: string
  isCrossChain?: boolean
  trackingUrl?: string
  crossChainStatus?: string
}

interface TxSuccessDetail {
  step?: string
  txHash?: string
}

// ─── Component ────────────────────────────────────────────────────────────────
//
// TERMINAL-ONLY. In-flight feedback lives on the action button (`ButtonProgress`
// + `useTxBusyPhase`), so this toast no longer renders a pending state — it only
// surfaces the terminal success / error beat for flows where the button/sheet
// has already gone away (e.g. a deposit sheet that closes on success). Copy
// comes from the shared `lib/tx/txCopy` source.

type Phase = "idle" | "pending" | "success" | "error"

interface TxToastProps {
  /** Optional override. Desktop default: fixed bottom-right. */
  className?: string
}

export function TxToast({ className }: TxToastProps) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [step, setStep] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const dismissTimer = useRef<number | null>(null)

  // Auto-dismiss when success lingers for 4 s.
  useEffect(() => {
    if (phase !== "success") return
    if (dismissTimer.current) window.clearTimeout(dismissTimer.current)
    dismissTimer.current = window.setTimeout(() => {
      setPhase("idle")
      setStep(null)
      setStatusMessage(null)
      setTxHash(null)
      setTrackingUrl(null)
      setShowDetails(false)
    }, 4000)
    return () => {
      if (dismissTimer.current) window.clearTimeout(dismissTimer.current)
    }
  }, [phase])

  // Subscribe to peridot:tx-* event bus.
  useEffect(() => {
    function onActive() {
      setPhase("pending")
      setStep("Awaiting wallet")
      setStatusMessage("Please confirm in your wallet.")
      setTxHash(null)
      setTrackingUrl(null)
      setShowDetails(false)
    }
    function onIdle() {
      // Only reset from non-terminal states. Success / error stick until auto-dismiss.
      setPhase((p) => (p === "pending" ? "idle" : p))
    }
    function onUpdate(ev: Event) {
      const detail = (ev as CustomEvent<TxUpdateDetail>).detail ?? {}
      const rawText = `${detail.step ?? ""} ${detail.statusMessage ?? ""}`
      const isErr = /error|failed|reverted/i.test(rawText)
      if (isErr) {
        setPhase("error")
      } else {
        setPhase((p) => (p === "idle" ? "pending" : p))
      }
      // A fresh step invalidates the previous statusMessage — otherwise stale
      // copy from an earlier step ("Please confirm in your wallet") would leak
      // into later phases and skew the friendly-copy heuristic.
      if (detail.step) {
        setStep(detail.step)
        setStatusMessage(detail.statusMessage ?? null)
      } else if (detail.statusMessage) {
        setStatusMessage(detail.statusMessage)
      }
      if (detail.txHash) setTxHash(detail.txHash)
      if (detail.trackingUrl) setTrackingUrl(detail.trackingUrl)
    }
    function onSuccess(ev: Event) {
      const detail = (ev as CustomEvent<TxSuccessDetail>).detail ?? {}
      // Token transfers ("send") show their own confirmation in the wallet sheet
      // and only fire this event to refresh balances — skip the generic toast.
      if ((detail as { type?: string }).type === "send" || (detail as { silent?: boolean }).silent) return
      setPhase("success")
      setStep("success")
      setStatusMessage(null)
      if (detail.txHash) setTxHash(detail.txHash)
    }

    window.addEventListener("peridot:tx-active", onActive)
    window.addEventListener("peridot:tx-idle", onIdle)
    window.addEventListener("peridot:tx-update", onUpdate as EventListener)
    window.addEventListener("peridot:tx-success", onSuccess as EventListener)
    return () => {
      window.removeEventListener("peridot:tx-active", onActive)
      window.removeEventListener("peridot:tx-idle", onIdle)
      window.removeEventListener("peridot:tx-update", onUpdate as EventListener)
      window.removeEventListener("peridot:tx-success", onSuccess as EventListener)
    }
  }, [])

  // Derived copy — terminal states only (pending lives on the button now).
  const rawText = `${step ?? ""} ${statusMessage ?? ""}`
  const copy = txTerminalCopy(phase === "error" ? "error" : "success", rawText)
  const errorIsInsufficient = phase === "error" && copy.errorKind === "insufficient"

  const icon =
    phase === "success" ? (
      // Subtle, elegant owl payoff — not the old glass dialog.
      <img src="/Owl Mascot - Mint Green.svg" alt="" aria-hidden className="w-6 h-6" />
    ) : (
      <AlertCircle className={cn("w-5 h-5", errorIsInsufficient ? "text-amber-500" : "text-rose-500")} />
    )

  const visible = phase === "success" || phase === "error"

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          data-testid="tx-toast"
          data-phase={phase}
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ type: "spring", damping: 30, stiffness: 360 }}
          className={cn(
            // Desktop: bottom-right card. Mobile: full-width bottom sheet.
            "fixed z-[90]",
            "inset-x-4 bottom-4 md:inset-x-auto md:bottom-6 md:right-6 md:w-[360px]",
            className
          )}
        >
          <div
            className={cn(
              "rounded-2xl border bg-background shadow-xl overflow-hidden",
              phase === "success"
                ? "border-emerald-200"
                : phase === "error"
                ? errorIsInsufficient
                  ? "border-amber-200"
                  : "border-rose-200"
                : "border-foreground/[0.06]"
            )}
          >
            <div className="flex items-start gap-3 px-4 py-3.5">
              <div className="shrink-0 mt-0.5">{icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{copy.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{copy.body}</p>

                {/* Action row */}
                {phase === "error" && errorIsInsufficient && (
                  <button
                    type="button"
                    data-testid="tx-toast-add-funds"
                    className="mt-2 h-8 px-3 rounded-full bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold transition-colors"
                    onClick={() => openAddMoney()}
                  >
                    Add money
                  </button>
                )}

                {(txHash || trackingUrl) && phase !== "error" && (
                  <button
                    type="button"
                    onClick={() => setShowDetails((s) => !s)}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground/80 hover:text-foreground/80 transition-colors"
                  >
                    <ChevronRight
                      size={11}
                      className={cn(
                        "transition-transform",
                        showDetails && "rotate-90"
                      )}
                    />
                    {showDetails ? "Hide details" : "Details"}
                  </button>
                )}

                <AnimatePresence>
                  {showDetails && (trackingUrl || txHash) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-2 text-[11px] text-muted-foreground/80 font-mono break-all">
                        {trackingUrl ? (
                          <a
                            href={trackingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-dotted hover:text-foreground/80"
                          >
                            Track status
                          </a>
                        ) : txHash ? (
                          <span>{txHash.slice(0, 10)}…{txHash.slice(-6)}</span>
                        ) : null}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
