import { useEffect, useRef, useState } from "react"
import { busyPhaseLabel, type TxBusyPhase, type TxAction } from "@/lib/easy/txPhaseLabel"

// Gentle reassurance copy shown when a single phase lingers — slow Biconomy
// round-trips or congested bridges can sit silent past 8s. Rotating these keeps
// a heartbeat on the button so it never reads as frozen, without lying about
// where we are. Same spirit as the "Still working…" line in EasyModeTxStatus.
const REASSURANCE = [
  "Still working on it…",
  "Hang tight…",
  "Just a few more seconds…",
  "Almost there…",
]

const STALL_AFTER_MS = 8_000
const ROTATE_EVERY_MS = 4_000

type Opts = {
  /** Whether a transaction is in flight. When false the hook is dormant. */
  active: boolean
  /** Which action this is — picks the terminal "money moved" beat. Default: supply. */
  action?: TxAction
  step?: string | null
  statusMessage?: string | null
  isCrossChain?: boolean
  isEmbedded?: boolean
}

/**
 * Turns the live `step`/`statusMessage` stream from a supply hook into a calm,
 * morphing button label (+ progress), with a stall-aware reassurance fallback.
 * Shared by the mobile card and desktop deposit sheet so both speak the same
 * language during a transaction.
 */
export function useTxBusyPhase(opts: Opts): TxBusyPhase {
  const { active, action, step, statusMessage, isCrossChain, isEmbedded } = opts

  const base = busyPhaseLabel(step, statusMessage, { action, isCrossChain, isEmbedded })

  // Track when the underlying phase label last changed, to measure how long
  // we've been sitting on it. Updating a ref during render is the sanctioned
  // "previous value" pattern.
  const lastLabelRef = useRef<string>("")
  const changedAtRef = useRef<number>(0)
  if (base.label !== lastLabelRef.current) {
    lastLabelRef.current = base.label
    changedAtRef.current = Date.now()
  }

  // Re-render on a slow tick while active so the elapsed check below re-evaluates
  // and the reassurance copy can rotate even when the SDK is silent.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setTick((t) => t + 1), 1_500)
    return () => window.clearInterval(id)
  }, [active])

  if (!active) return base

  const elapsed = Date.now() - changedAtRef.current
  if (elapsed > STALL_AFTER_MS) {
    const rotation = Math.floor((elapsed - STALL_AFTER_MS) / ROTATE_EVERY_MS) % REASSURANCE.length
    return { label: REASSURANCE[rotation], progress: base.progress }
  }

  return base
}
