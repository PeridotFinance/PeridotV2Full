/**
 * How a cross-chain supply reads on screen: network names and logos, and the
 * step list a user watches from the click to the supplied position.
 *
 * Pure, so the step model is unit-tested apart from the hook that drives it.
 * The list is rebuilt from two things only, the engine's step
 * (`useCrossChainTransfer`) and the supply step that follows arrival, so a
 * transfer resumed after a reload shows exactly the same list as one that was
 * never interrupted, minus the approval it can no longer know about.
 */
import type { XcChain } from "@/lib/crosschain/route"

export type XcFlowStep =
  | "idle"
  | "preparing"
  | "switching"
  | "approving"
  | "signing"
  | "confirming"
  | "converting"
  | "arriving"
  | "arrived"
  | "unsent"
  | "failed"

/** Ask a market panel to show one of its tabs; FastAssetPanel listens. */
export const XC_FOCUS_TAB_EVENT = "peridot:xc-focus-tab"

const CHAIN_NAMES: Record<string, string> = {
  stellar: "Stellar",
  "1": "Ethereum",
  "56": "BNB Smart Chain",
  "137": "Polygon",
  "4663": "Robinhood Chain",
  "8453": "Base",
  "42161": "Arbitrum",
  "43114": "Avalanche",
}

const CHAIN_LOGOS: Record<string, string> = {
  stellar: "/tokenimages/app/stellar.svg",
  "1": "/tokenimages/app/ethereum-eth-logo.svg",
  "56": "/tokenimages/app/bnb-logo.svg",
  "137": "/tokenimages/app/polygon-matic-logo.svg",
  "4663": "/tokenimages/robinhood/robinhood-chain.png",
  "8453": "/tokenimages/app/base-logo.svg",
  "42161": "/tokenimages/app/arbitrum-logo.svg",
  "43114": "/tokenimages/app/avax.png",
}

const NATIVE_SYMBOLS: Record<string, string> = {
  "1": "ETH",
  "56": "BNB",
  "137": "POL",
  "4663": "ETH",
  "8453": "ETH",
  "42161": "ETH",
  "43114": "AVAX",
}

const TOKEN_LOGOS: Record<string, string> = {
  USDC: "/tokenimages/app/usd-coin-usdc-logo.svg",
  USDT: "/tokenimages/app/tether-usdt-logo.svg",
  USDG: "/tokenimages/robinhood/usdg.png",
  XLM: "/tokenimages/app/stellar.svg",
  ETH: "/tokenimages/app/ethereum-eth-logo.svg",
  BNB: "/tokenimages/app/bnb-logo.svg",
  AVAX: "/tokenimages/app/avax.png",
  POL: "/tokenimages/app/polygon-matic-logo.svg",
}

export function xcTokenLogo(symbol: string): string | null {
  return TOKEN_LOGOS[symbol.toUpperCase()] ?? null
}

export function xcChainName(chain: XcChain): string {
  return CHAIN_NAMES[String(chain)] ?? `Chain ${chain}`
}

export function xcChainLogo(chain: XcChain): string | null {
  return CHAIN_LOGOS[String(chain)] ?? null
}

/** The coin that pays for gas on an EVM network. */
export function xcNativeSymbol(chain: XcChain): string {
  return NATIVE_SYMBOLS[String(chain)] ?? "gas"
}

/** A whole-token amount for display: up to six significant decimals, no trailing zeros. */
export function formatTokenAmount(n: number): string {
  if (!Number.isFinite(n)) return "0"
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : 6
  return n.toLocaleString("en-US", { maximumFractionDigits: digits })
}

/** "0x1234…abcd", for naming the wallet money goes to. */
export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}

export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0.00"
  if (n > 0 && n < 0.01) return "<$0.01"
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Steps ─────────────────────────────────────────────────────────────────

/**
 * The Stellar helpers narrate every signature as "confirm in your wallet". An
 * embedded wallet signs without asking, so there that line would send the user
 * looking for a popup that never comes.
 */
function stellarNarration(message: string | undefined, silent: boolean, fallback: string): string {
  if (!message) return fallback
  if (silent && /confirm in your wallet/i.test(message)) return "Signing"
  return message
}

export type SupplyPhase = "idle" | "waiting" | "running" | "done" | "failed"

export interface SupplyStepState {
  phase: SupplyPhase
  /** Live narration from the Stellar deposit ("Approving market access"). */
  message?: string
  error?: string
  txHash?: string
  /** Whole tokens supplied, once done. */
  amount?: string
}

export type ProgressStatus = "pending" | "active" | "done" | "failed" | "attention"

export type ProgressKey = "approve" | "withdraw" | "send" | "convert" | "arrive" | "supply"

export interface ProgressStep {
  key: ProgressKey
  label: string
  status: ProgressStatus
  detail?: string
}

export type ProgressTone = "working" | "attention" | "done" | "failed"

export interface ProgressModel {
  steps: ProgressStep[]
  tone: ProgressTone
  headline: string
  /** One sentence under the headline: what happens now, or what to do. */
  note: string
  /** Ended because the user said no in the wallet: shown calm, not as an error. */
  quiet?: boolean
}

export interface ProgressInput {
  step: XcFlowStep
  /** The engine step the run failed in; null unless `step` is "failed". */
  failedAt: XcFlowStep | null
  errorMessage: string | null
  /** The user declined in the wallet, which is a choice rather than a failure. */
  cancelled?: boolean
  /** The run went through an approval (unknown, so hidden, after a resume). */
  approvalSeen: boolean
  stalled: boolean
  sodaxStatus: string | null
  srcChain: XcChain
  srcSymbol: string
  /** Whole source tokens sent, formatted. */
  srcAmount: string
  dstSymbol: string
  /** Whole destination tokens that arrived (measured, else reported), formatted; null while unknown. */
  arrived: string | null
  /** Whole destination tokens guaranteed at least. */
  minOut: string
  /** Stellar signs without a prompt (embedded wallet). */
  silentStellar: boolean
  supply: SupplyStepState
}

const ORDER: ProgressKey[] = ["approve", "send", "convert", "arrive", "supply"]

/** Which step an engine step belongs to. */
function keyOf(step: XcFlowStep): ProgressKey {
  switch (step) {
    case "approving":
      return "approve"
    case "converting":
      return "convert"
    case "arriving":
      return "arrive"
    case "arrived":
      return "supply"
    default:
      return "send"
  }
}

export function buildSupplyProgress(input: ProgressInput): ProgressModel {
  const chain = xcChainName(input.srcChain)
  const { srcSymbol, dstSymbol } = input
  const labels: Partial<Record<ProgressKey, string>> = {
    approve: `Allow ${srcSymbol} to be sent`,
    send: `Send ${input.srcAmount} ${srcSymbol} from ${chain}`,
    convert: `Convert to ${dstSymbol} on Stellar`,
    arrive: "Arrive in your Stellar wallet",
    supply: `Supply to the ${dstSymbol} market`,
  }

  const failedKey = input.step === "failed" ? keyOf(input.failedAt ?? "preparing") : null
  const activeKey: ProgressKey = input.step === "failed" ? failedKey! : input.step === "unsent" ? "send" : keyOf(input.step)
  const activeIndex = ORDER.indexOf(activeKey)

  const steps: ProgressStep[] = []
  for (const key of ORDER) {
    if (key === "approve" && !input.approvalSeen) continue
    const index = ORDER.indexOf(key)
    let status: ProgressStatus = index < activeIndex ? "done" : index === activeIndex ? "active" : "pending"
    let detail: string | undefined

    if (key === "supply" && input.step === "arrived") {
      const s = input.supply
      status = s.phase === "done" ? "done" : s.phase === "failed" ? "failed" : s.phase === "waiting" ? "attention" : "active"
      detail =
        s.phase === "done"
          ? `${s.amount ?? input.arrived ?? ""} ${dstSymbol} supplied`.trim()
          : s.phase === "failed"
            ? s.error
            : s.phase === "waiting"
              ? "Waiting for you"
              : stellarNarration(s.message, input.silentStellar, input.silentStellar ? "Supplying" : "Confirm in your Stellar wallet")
    } else if (status === "active") {
      detail = activeDetail(input, chain)
    } else if (status === "done") {
      detail = doneDetail(key, input)
    }

    if (failedKey === key) {
      status = "failed"
      // After the send the reason is the card's note; the step says only where it stopped.
      detail =
        key === "convert" || key === "arrive"
          ? "Did not go through"
          : input.cancelled
            ? "Cancelled in your wallet"
            : input.errorMessage ?? "This step failed."
    }
    if (input.step === "unsent" && key === "send") {
      status = "failed"
      detail = "Never sent. Nothing left your wallet."
    }
    steps.push({ key, label: labels[key], status, detail })
  }

  return { steps, ...summary(input, chain) }
}

function activeDetail(input: ProgressInput, chain: string): string {
  switch (input.step) {
    case "preparing":
      return "Preparing the route"
    case "switching":
      return `Switch your wallet to ${chain}`
    case "approving":
      return "Confirm the approval in your wallet (one time)"
    case "signing":
      return "Confirm in your wallet"
    case "confirming":
      return `Waiting for ${chain} to confirm`
    case "converting":
      if (input.stalled) return "Taking longer than usual. It finishes without this page."
      return input.sodaxStatus === "posting_execution" ? "Delivering to Stellar" : "Usually under a minute"
    case "arriving":
      return "Checking your Stellar wallet"
    default:
      return ""
  }
}

function doneDetail(key: ProgressKey, input: ProgressInput): string | undefined {
  if (key === "convert" && input.arrived == null) return `At least ${input.minOut} ${input.dstSymbol}`
  if (key === "arrive" && input.arrived != null) return `${input.arrived} ${input.dstSymbol}`
  return undefined
}

function summary(input: ProgressInput, chain: string): Pick<ProgressModel, "tone" | "headline" | "note" | "quiet"> {
  const { srcSymbol, dstSymbol } = input
  const arrived = input.arrived ?? input.minOut
  const sending = `${input.srcAmount} ${srcSymbol} from ${chain}`

  if (input.step === "unsent") {
    return {
      tone: "failed",
      headline: "Transfer not sent",
      note: "The wallet never sent it, so nothing left your wallet. You can start again.",
    }
  }
  if (input.step === "failed") {
    const beforeSend = ["preparing", "switching", "approving", "signing"].includes(input.failedAt ?? "preparing")
    if (beforeSend && input.cancelled) {
      return { tone: "failed", quiet: true, headline: "Cancelled", note: "Nothing left your wallet. You can start again." }
    }
    return {
      tone: "failed",
      headline: beforeSend ? "Nothing was sent" : "The transfer did not go through",
      note: input.errorMessage ?? (beforeSend ? "Nothing left your wallet." : "Check the details below."),
    }
  }
  if (input.step === "arrived") {
    const s = input.supply
    if (s.phase === "done") {
      return {
        tone: "done",
        headline: `Supplied ${s.amount ?? arrived} ${dstSymbol}`,
        note: "Your position is earning from now on.",
      }
    }
    if (s.phase === "failed") {
      return {
        tone: "attention",
        headline: `${arrived} ${dstSymbol} arrived, not supplied yet`,
        note: `It is safe in your Stellar wallet. ${s.error ?? ""}`.trim(),
      }
    }
    if (s.phase === "waiting" || s.phase === "idle") {
      return {
        tone: "attention",
        headline: `${arrived} ${dstSymbol} arrived in your Stellar wallet`,
        note: "Supply it to start earning, or keep it in the wallet.",
      }
    }
    return {
      tone: "working",
      headline: `Supplying ${arrived} ${dstSymbol}`,
      note: input.silentStellar ? "Last step, no confirmation needed." : "Last step: confirm the supply in your Stellar wallet.",
    }
  }

  const signed = ["confirming", "converting", "arriving"].includes(input.step)
  return {
    tone: "working",
    headline: `Supplying ${sending}`,
    note: signed
      ? "You can close this page. The money still reaches your Stellar wallet, and the supply continues when you come back."
      : "Nothing has left your wallet yet.",
  }
}

// ─── Withdraw to another network ───────────────────────────────────────────

export type WithdrawPhase = "idle" | "running" | "done" | "failed"

/** The pool withdrawal that comes before the send. */
export interface WithdrawLegState {
  phase: WithdrawPhase
  /** Live narration from the Stellar withdrawal. */
  message?: string
  error?: string
  txHash?: string
  /** Whole tokens that left the market, once measured. */
  amount?: string
}

export interface WithdrawProgressInput {
  withdraw: WithdrawLegState
  /**
   * This flow began with a pool withdrawal. False for a transfer picked up
   * without the note this browser keeps, where the step is left out rather
   * than claimed.
   */
  withdrawKnown: boolean
  step: XcFlowStep
  failedAt: XcFlowStep | null
  errorMessage: string | null
  stalled: boolean
  sodaxStatus: string | null
  /** The market's token: what leaves the pool and is sent from Stellar. */
  marketSymbol: string
  /** Whole tokens asked for, formatted. */
  amount: string
  dstChain: XcChain
  dstSymbol: string
  /** Whole destination tokens that arrived, formatted; null while unknown. */
  arrived: string | null
  /** Whole destination tokens guaranteed at least; null before a quote exists. */
  minOut: string | null
  silentStellar: boolean
  /** The money is in the Stellar wallet and the send waits for a click. */
  sendWaiting: boolean
}

const WITHDRAW_ORDER: ProgressKey[] = ["withdraw", "send", "convert", "arrive"]

/** Engine steps before the source transaction exists: failing there sent nothing. */
const BEFORE_SEND: XcFlowStep[] = ["idle", "preparing", "switching", "approving", "signing"]

function withdrawKeyOf(step: XcFlowStep): ProgressKey {
  switch (step) {
    case "converting":
      return "convert"
    case "arriving":
    case "arrived":
      return "arrive"
    default:
      return "send"
  }
}

export function buildWithdrawProgress(input: WithdrawProgressInput): ProgressModel {
  const chain = xcChainName(input.dstChain)
  const { marketSymbol, dstSymbol } = input
  const w = input.withdraw
  const sent = w.amount ?? input.amount
  const labels: Record<string, string> = {
    withdraw: `Withdraw ${input.amount} ${marketSymbol} from the market`,
    send: `Send ${sent} ${marketSymbol} from Stellar`,
    convert: `Convert to ${dstSymbol} on ${chain}`,
    arrive: `Arrive in your wallet on ${chain}`,
  }

  const inWithdraw = input.withdrawKnown && (w.phase === "running" || w.phase === "failed" || w.phase === "idle")
  const waiting = !inWithdraw && (input.sendWaiting || input.step === "unsent")
  const engineFailed = !inWithdraw && input.step === "failed"
  const failedBeforeSend = engineFailed && BEFORE_SEND.includes(input.failedAt ?? "preparing")
  const failedKey = engineFailed ? withdrawKeyOf(input.failedAt ?? "preparing") : null

  const activeKey: ProgressKey = inWithdraw ? "withdraw" : waiting ? "send" : failedKey ?? withdrawKeyOf(input.step)
  const activeIndex = WITHDRAW_ORDER.indexOf(activeKey)
  const allDone = !inWithdraw && !waiting && !engineFailed && input.step === "arrived"

  const steps: ProgressStep[] = []
  for (const key of WITHDRAW_ORDER) {
    if (key === "withdraw" && !input.withdrawKnown) continue
    const index = WITHDRAW_ORDER.indexOf(key)
    let status: ProgressStatus =
      allDone || index < activeIndex ? "done" : index === activeIndex ? "active" : "pending"
    let detail: string | undefined

    if (status === "active") {
      detail = withdrawActiveDetail(key, input, chain)
    } else if (status === "done") {
      if (key === "withdraw" && w.amount) detail = `${w.amount} ${marketSymbol} in your Stellar wallet`
      if (key === "convert" && input.arrived == null && input.minOut) detail = `At least ${input.minOut} ${dstSymbol}`
      if (key === "arrive" && input.arrived != null) detail = `${input.arrived} ${dstSymbol}`
    }

    if (key === "withdraw" && inWithdraw && w.phase === "failed") {
      status = "failed"
      detail = w.error ?? "The withdrawal did not go through."
    }
    if (key === "send" && waiting) {
      status = "attention"
      detail = input.step === "unsent" ? "Never sent. Waiting for you." : "Waiting for you"
    }
    if (failedKey === key) {
      status = "failed"
      // After the send the reason is the card's note; the step says only where it stopped.
      detail = key === "send" ? input.errorMessage ?? "This step failed." : "Did not go through"
    }
    steps.push({ key, label: labels[key], status, detail })
  }

  return { steps, ...withdrawSummary(input, chain, { inWithdraw, waiting, engineFailed, failedBeforeSend, allDone }) }
}

function withdrawActiveDetail(key: ProgressKey, input: WithdrawProgressInput, chain: string): string {
  if (key === "withdraw") {
    return stellarNarration(
      input.withdraw.message,
      input.silentStellar,
      input.silentStellar ? "Withdrawing" : "Confirm in your Stellar wallet",
    )
  }
  switch (input.step) {
    case "signing":
      return input.silentStellar ? "Sending" : "Confirm in your Stellar wallet"
    case "confirming":
      return "Waiting for Stellar to confirm"
    case "converting":
      if (input.stalled) return "Taking longer than usual. It finishes without this page."
      return input.sodaxStatus === "posting_execution" ? `Delivering to ${chain}` : "Usually under a minute"
    case "arriving":
      return `Checking your wallet on ${chain}`
    default:
      return "Preparing the route"
  }
}

function withdrawSummary(
  input: WithdrawProgressInput,
  chain: string,
  s: { inWithdraw: boolean; waiting: boolean; engineFailed: boolean; failedBeforeSend: boolean; allDone: boolean },
): Pick<ProgressModel, "tone" | "headline" | "note"> {
  const { marketSymbol, dstSymbol } = input
  const w = input.withdraw
  const held = `${w.amount ?? input.amount} ${marketSymbol}`

  if (s.inWithdraw && w.phase === "failed") {
    return {
      tone: "failed",
      headline: "Nothing was withdrawn",
      note: `${w.error ?? "The withdrawal did not go through."} Your ${marketSymbol} is still supplied.`,
    }
  }
  if (s.inWithdraw) {
    return {
      tone: "working",
      headline: `Withdrawing ${input.amount} ${marketSymbol} to ${chain}`,
      note: "Keep this page open until the money is on its way.",
    }
  }
  if (s.waiting || s.failedBeforeSend) {
    return {
      tone: "attention",
      headline: `${held} is in your Stellar wallet`,
      note: s.failedBeforeSend
        ? `${input.errorMessage ?? "The send did not go through."} Send it again, or keep it on Stellar.`
        : `Not sent to ${chain} yet. Send it on, or keep it on Stellar.`,
    }
  }
  if (s.engineFailed) {
    return {
      tone: "failed",
      headline: "The transfer did not go through",
      note: input.errorMessage ?? "Check the details below.",
    }
  }
  if (s.allDone) {
    return {
      tone: "done",
      headline: `${input.arrived ?? `At least ${input.minOut ?? ""}`.trim()} ${dstSymbol} arrived on ${chain}`,
      note: "The withdrawal is complete.",
    }
  }
  const signed = ["confirming", "converting", "arriving"].includes(input.step)
  return {
    tone: "working",
    headline: `Withdrawing ${input.amount} ${marketSymbol} to ${chain}`,
    note: signed
      ? `You can close this page. The money reaches your wallet on ${chain} either way.`
      : `The ${marketSymbol} is out of the market. Keep this page open until it is sent.`,
  }
}
