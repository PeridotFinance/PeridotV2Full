// Single source of truth for transaction-feedback copy.
//
// Three consumer surfaces speak about a running transaction:
//   • the action button (1–3 words, morphing) — `busyPhaseLabel`
//   • the global toast (title + body)          — `txToastCopy`
//   • terminal success / error states          — `txTerminalCopy`
//
// Before this module they each carried their own regex→text table
// (`lib/easy/txPhaseLabel`, `EasyModeTxStatus.toFriendly*`, `TxToast.friendlyStep`)
// which drifted apart. They now share the one ordered SHARED_PHASES table below.
//
// Voice: earning-led, jargon-free — every label is about the user's money and
// goal, never the machine. The technical `step`/`statusMessage` strings are the
// *input* we match on; the *output* never leaks "wallet / network / route /
// bridge / approve" into consumer copy (per the fintech-not-crypto rule).

export type TxAction = "supply" | "withdraw" | "borrow" | "repay"

export type TxBusyPhase = {
  /** Short label for the button face. */
  label: string
  /** Rough 0..1 progress for the determinate bar; null → indeterminate shimmer. */
  progress: number | null
}

type SharedPhase = {
  re: RegExp
  /** Button face — 1–3 words. */
  label: string
  /** Button face for embedded (Privy social-login) wallets, if it differs. */
  embeddedLabel?: string
  /** Toast title. */
  title: string
  /** Toast title for embedded wallets, if it differs. */
  titleEmbedded?: string
  /** Toast body. */
  body: string
  /** Toast body for embedded wallets, if it differs. */
  bodyEmbedded?: string
}

// Shared mid-flow phases, ordered chronologically (Biconomy MEE has the user
// sign once up front, then allowance → route → move → execute). First match
// wins, and the order also drives the progress bar — keep it in tx order.
const SHARED_PHASES: SharedPhase[] = [
  {
    re: /fee-shortfall|adjusting/,
    label: "Adjusting…",
    title: "Adjusting the amount",
    body: "Trimming a little to cover the network fee — one sec.",
  },
  // One-time approval + allowance checks read as "setup", not an action.
  {
    re: /allow|allowance/,
    label: "Getting set up…",
    title: "One-time setup",
    body: "Giving your account permission — just this once.",
  },
  {
    re: /approv/,
    label: "Getting set up…",
    title: "One-time setup",
    body: "Giving your account permission — just this once.",
  },
  // The single up-front signature. External wallets need a tap → instruct;
  // embedded (Privy social login) confirms silently/in-app → just reassure.
  {
    re: /await|wallet|confirm|sign/,
    label: "Confirm to continue",
    embeddedLabel: "Confirming…",
    title: "Confirm in your app",
    titleEmbedded: "Confirm to continue",
    body: "Approve the action in your wallet.",
    bodyEmbedded: "Approve the pop-up to continue.",
  },
  {
    re: /rout|quot|best route/,
    label: "Locking in your rate…",
    title: "Locking in your rate",
    body: "Finding the best path for your money.",
  },
  {
    re: /switch/,
    label: "Moving your money…",
    title: "Moving your money",
    body: "On its way — usually a few seconds.",
  },
  {
    re: /prepar|cross-chain/,
    label: "Moving your money…",
    title: "Getting things ready",
    body: "Lining everything up — just a few seconds.",
  },
  {
    re: /bridg/,
    label: "Moving your money…",
    title: "Moving your money",
    body: "On its way — usually 30–60 seconds.",
  },
  {
    re: /submit|broadcast|send/,
    label: "Almost there…",
    title: "Almost there",
    body: "Wrapping up.",
  },
]

// The terminal beat — the main on-chain step, where the money actually moves
// to its destination. This is where the actions diverge.
const TERMINAL: Record<TxAction, { label: string; title: string; body: string }> = {
  supply: { label: "Starting to earn…", title: "Starting to earn", body: "Your money is on its way to start earning." },
  withdraw: { label: "On its way to you…", title: "On its way to you", body: "Sending your money back." },
  borrow: { label: "Sending your money…", title: "Sending your money", body: "Your loan is on its way." },
  repay: { label: "Clearing your balance…", title: "Clearing your balance", body: "Paying down what you owe." },
}

type Resolved = { shared: SharedPhase | null; stageIdx: number; isTerminal: boolean; hasRaw: boolean }

function resolve(step?: string | null, statusMessage?: string | null): Resolved {
  const raw = (statusMessage || step || "").toLowerCase()
  const idx = raw ? SHARED_PHASES.findIndex((p) => p.re.test(raw)) : -1
  if (idx >= 0) return { shared: SHARED_PHASES[idx], stageIdx: idx, isTerminal: false, hasRaw: true }
  if (!raw) return { shared: null, stageIdx: 0, isTerminal: false, hasRaw: false }
  // Raw text present but no shared match → the main on-chain step.
  return { shared: null, stageIdx: SHARED_PHASES.length, isTerminal: true, hasRaw: true }
}

/**
 * Button-grade phase label (+ rough progress) for the in-flight action button.
 * Determinate progress only for the multi-stage cross-chain path; a single-chain
 * action is over too fast to chart, so it stays shimmering (null).
 */
export function busyPhaseLabel(
  step: string | null | undefined,
  statusMessage: string | null | undefined,
  opts: { action?: TxAction; isEmbedded?: boolean; isCrossChain?: boolean } = {}
): TxBusyPhase {
  const { action = "supply", isEmbedded = false, isCrossChain = false } = opts
  const { shared, stageIdx, hasRaw } = resolve(step, statusMessage)

  let label: string
  if (shared) {
    label = (isEmbedded && shared.embeddedLabel) || shared.label
  } else if (!hasRaw) {
    // Nothing reported yet — open with a neutral "setup" beat, not the terminal.
    label = "Getting set up…"
  } else {
    label = (TERMINAL[action] ?? TERMINAL.supply).label
  }

  let progress: number | null = null
  if (isCrossChain) {
    const total = SHARED_PHASES.length + 1 // shared stages + terminal
    progress = (stageIdx + 1) / (total + 1)
  }

  return { label, progress }
}

/**
 * Toast-grade copy (title + body) for the in-flight phase. Used by TxToast's
 * pending state when it surfaces (flows without a visible action button).
 */
export function txToastCopy(
  step: string | null | undefined,
  statusMessage: string | null | undefined,
  opts: { action?: TxAction; isEmbedded?: boolean } = {}
): { title: string; body: string } {
  const { action = "supply", isEmbedded = false } = opts
  const { shared, isTerminal, hasRaw } = resolve(step, statusMessage)
  if (shared) {
    return {
      title: (isEmbedded && shared.titleEmbedded) || shared.title,
      body: (isEmbedded && shared.bodyEmbedded) || shared.body,
    }
  }
  if (isTerminal) {
    const t = TERMINAL[action] ?? TERMINAL.supply
    return { title: t.title, body: t.body }
  }
  return { title: "Working on it", body: "One moment." }
}

// ─── Terminal states ────────────────────────────────────────────────────────

/** Detect "not enough funds" conditions from any raw error/message string. */
export function isInsufficientFunds(msg: string): boolean {
  const lower = msg.toLowerCase()
  return (
    lower.includes("insufficient balance") ||
    lower.includes("insufficient funding amount") ||
    lower.includes("insufficient_for_fee_budget")
  )
}

/** Detect "amount too low / below minimum" conditions. */
export function isAmountTooLow(msg: string): boolean {
  const lower = msg.toLowerCase()
  return (
    lower.includes("insufficient funding amount") ||
    lower.includes("minimum") ||
    lower.includes("too low")
  )
}

/** Extract the shortfall amount from a "reduce … by at least X" hint, if present. */
export function shortfallHint(msg: string | null | undefined): string | null {
  const m = msg?.match(/reduce.*?by at least\s+([\d.]+)/i)
  return m ? m[1] : null
}

export type TerminalCopy = {
  title: string
  body: string
  /** error sub-kind so callers can branch on the "Add funds" affordance */
  errorKind?: "insufficient" | "too-low" | "generic"
}

/**
 * Copy for a finished transaction. Success enrichment (amount/APY) is layered
 * on by the caller; this returns the base line.
 */
export function txTerminalCopy(
  kind: "success" | "error",
  rawText?: string | null
): TerminalCopy {
  if (kind === "success") {
    return { title: "Done", body: "Your balance will update shortly." }
  }
  const raw = rawText || ""
  if (isAmountTooLow(raw)) {
    return { title: "Amount too low", body: "Try a larger amount.", errorKind: "too-low" }
  }
  if (isInsufficientFunds(raw)) {
    return { title: "Not enough funds", body: "Top up via card and try again.", errorKind: "insufficient" }
  }
  return { title: "Something went wrong", body: "Please try again in a moment.", errorKind: "generic" }
}
