/**
 * Revert decoding for the Robinhood margin contracts.
 *
 * A failure can originate several calls deep (executor -> risk engine ->
 * pToken -> router), and the revert data carries the nested contract's
 * selector, so decoding tries every bundled ABI (ROBINHOOD_ABIS_ALL). The
 * messages follow the guide's table in section 11; an error without a mapping
 * keeps its contract error name so a report still says what happened.
 *
 * The numeric ExecutorError/SwapError meanings were checked against the
 * deployed source for this handout only. Replace the tables with the ABI
 * folder whenever the deployment is upgraded.
 */
import { BaseError, decodeErrorResult, type Hex } from "viem"
import { ROBINHOOD_ABIS_ALL } from "@/app/abis/robinhood"

export type RobinhoodErrorKind =
  | "rejected"
  | "price-unavailable"
  | "cap"
  | "margin"
  | "opens-paused"
  | "quote"
  | "fee"
  | "liquidity"
  | "position"
  | "swap"
  | "lending"
  | "network"
  | "unknown"

export interface RobinhoodDecodedError {
  kind: RobinhoodErrorKind
  /** Contract error name when decoded, e.g. "ExecutorError" or "DebtCapExceeded". */
  errorName: string | null
  args: readonly unknown[]
  /** A sentence for the UI. */
  message: string
  /** The raw message, for logs and support. */
  detail: string
}

/**
 * Token-level errors the bundle does not carry. USDG reverts with the
 * Solady-style `InsufficientAllowance()` (seen live on a mint without
 * approval, selector 0x13be252b); the OpenZeppelin 5 forms are here for NVDA
 * and any future token.
 */
const TOKEN_ERRORS_ABI = [
  { type: "error", name: "InsufficientAllowance", inputs: [] },
  { type: "error", name: "InsufficientBalance", inputs: [] },
  {
    type: "error",
    name: "ERC20InsufficientAllowance",
    inputs: [
      { name: "spender", type: "address" },
      { name: "allowance", type: "uint256" },
      { name: "needed", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "ERC20InsufficientBalance",
    inputs: [
      { name: "sender", type: "address" },
      { name: "balance", type: "uint256" },
      { name: "needed", type: "uint256" },
    ],
  },
] as const

const DECODE_ABI = [...(ROBINHOOD_ABIS_ALL as readonly unknown[]), ...TOKEN_ERRORS_ABI]

const EXECUTOR_ERRORS: Record<number, { kind: RobinhoodErrorKind; message: string }> = {
  8: { kind: "opens-paused", message: "Opening new positions is paused right now." },
  11: { kind: "quote", message: "The quote asked for a zero minimum output. Request a new quote." },
  17: { kind: "fee", message: "The opening fee rose above the accepted limit. Review the new quote." },
  25: { kind: "fee", message: "The closing fee rose above the accepted limit. Review the new quote." },
  37: { kind: "swap", message: "The close swap would not cover the flash repayment." },
  46: { kind: "position", message: "This position belongs to a different wallet." },
  47: { kind: "position", message: "This position is no longer active." },
  54: { kind: "fee", message: "The exit fee limit is too low for this recovery." },
  55: { kind: "position", message: "Debt remains on this position. Repay it before the exit." },
}

const SWAP_ERRORS: Record<number, { kind: RobinhoodErrorKind; message: string }> = {
  5: { kind: "quote", message: "The minimum output is below the protocol floor. Request a new quote." },
  7: { kind: "swap", message: "The swap returned less than the minimum. Request a new quote." },
  8: { kind: "swap", message: "The swap price moved too far from the oracle. Request a new quote." },
}

const NAMED_ERRORS: Record<string, { kind: RobinhoodErrorKind; message: string }> = {
  PriceUnavailable: {
    kind: "price-unavailable",
    message: "Prices are unavailable right now. Opening and closing wait for fresh prices; repayment still works.",
  },
  DebtCapExceeded: { kind: "cap", message: "This size exceeds the debt limit per position. Reduce the size." },
  PositionCapExceeded: { kind: "cap", message: "This size exceeds the position limit. Reduce the size." },
  InitialMarginTooLow: { kind: "margin", message: "Not enough margin for this leverage. Lower the leverage or add margin." },
  LeverageExceeded: { kind: "margin", message: "The leverage is above the allowed maximum. Lower it and requote." },
  BorrowCashNotAvailable: { kind: "liquidity", message: "The market does not have enough liquidity for this size right now." },
  StrategyLiquidityShortfall: { kind: "liquidity", message: "The market does not have enough liquidity for this size right now." },
  RedeemTransferOutNotPossible: { kind: "liquidity", message: "The market cannot pay out this amount right now." },
  InsufficientOutput: { kind: "swap", message: "The swap returned less than the minimum. Request a new quote." },
  MintFreshnessCheck: { kind: "lending", message: "The market needs an update first. Try again in a moment." },
  RedeemFreshnessCheck: { kind: "lending", message: "The market needs an update first. Try again in a moment." },
  MintPeridottrollerRejection: { kind: "lending", message: "The lending market refused this deposit." },
  RedeemPeridottrollerRejection: { kind: "lending", message: "The lending market refused this withdrawal." },
  TransferNotEnough: { kind: "margin", message: "Not enough balance for this amount." },
  TransferTooMuch: { kind: "margin", message: "The amount is larger than the balance." },
  InsufficientAllowance: { kind: "margin", message: "The approval does not cover this amount. Approve again." },
  ERC20InsufficientAllowance: { kind: "margin", message: "The approval does not cover this amount. Approve again." },
  InsufficientBalance: { kind: "margin", message: "Not enough balance for this amount." },
  ERC20InsufficientBalance: { kind: "margin", message: "Not enough balance for this amount." },
}

/**
 * Compound's ComptrollerErrorReporter.Error, as the Peridottroller returns it
 * from enterMarkets / exitMarket and wraps it in the pToken's
 * `*PeridottrollerRejection(uint256)` reverts.
 */
const CONTROLLER_ERRORS: Record<number, string> = {
  3: "The account has no shortfall to act on.",
  4: "Not enough collateral for this amount.",
  8: "This market is not enabled as collateral.",
  9: "This market is not listed.",
  12: "Repay the debt in this market before turning its collateral off.",
  13: "The market's price is unavailable right now.",
  14: "The rest of your debt still needs this collateral. Repay first or keep it on.",
  16: "Too many markets are enabled as collateral.",
  17: "The amount is larger than the debt.",
}

export function describeRobinhoodLendingCode(code: bigint | number): string {
  const n = Number(code)
  return CONTROLLER_ERRORS[n] ?? `The market refused the transaction (code ${n}).`
}

/** `require` strings seen from the deployed contracts, mapped to UI copy. */
const REASON_PATTERNS: Array<[RegExp, RobinhoodErrorKind, string]> = [
  [/insufficient free balance/i, "margin", "Not enough free margin in the vault for this amount plus the fee."],
  [/insufficient (allowance|balance)|exceeds (allowance|balance)/i, "margin", "Not enough balance or approval for this amount."],
  [/borrow cap/i, "cap", "The market's borrow cap is reached. Try a smaller amount."],
  [/supply cap/i, "cap", "The market's supply cap is reached. Try a smaller amount."],
  [/paused/i, "opens-paused", "This action is paused right now."],
]

function walk(err: unknown, visit: (e: any) => boolean): boolean {
  let current: any = err
  for (let depth = 0; current && depth < 12; depth++) {
    if (visit(current)) return true
    current = current.cause
  }
  return false
}

/** The first revert payload found on the error chain, if any. */
export function extractRevertData(err: unknown): Hex | null {
  let found: Hex | null = null
  walk(err, (e) => {
    const data = e?.data
    const candidate = typeof data === "string" ? data : typeof data?.data === "string" ? data.data : null
    if (candidate && /^0x[0-9a-fA-F]{8}/.test(candidate)) {
      found = candidate as Hex
      return true
    }
    return false
  })
  return found
}

function isUserRejection(err: unknown): boolean {
  return walk(err, (e) => {
    if (e?.code === 4001 || e?.name === "UserRejectedRequestError") return true
    const msg = String(e?.shortMessage ?? e?.message ?? "")
    return /user (rejected|denied)|rejected the request|request rejected/i.test(msg)
  })
}

function rawMessage(err: unknown): string {
  if (err instanceof BaseError) return err.shortMessage || err.message
  if (err instanceof Error) return err.message
  return String(err)
}

function fromName(name: string, args: readonly unknown[], detail: string): RobinhoodDecodedError {
  if (name === "ExecutorError" || name === "SwapError") {
    const code = Number(args[0])
    const table = name === "ExecutorError" ? EXECUTOR_ERRORS : SWAP_ERRORS
    const hit = table[code]
    return {
      kind: hit?.kind ?? "unknown",
      errorName: `${name}(${code})`,
      args,
      message: hit?.message ?? `The contract refused the transaction (${name} ${code}).`,
      detail,
    }
  }
  if (name === "Error" && typeof args[0] === "string") {
    const reason = args[0]
    if (/price unavailable/i.test(reason)) return { ...fromName("PriceUnavailable", [], detail), errorName: "Error", args }
    const hit = REASON_PATTERNS.find(([pattern]) => pattern.test(reason))
    if (hit) return { kind: hit[1], errorName: "Error", args, message: hit[2], detail }
    return { kind: "unknown", errorName: "Error", args, message: reason, detail }
  }
  if (/PeridottrollerRejection$/.test(name)) {
    const code = Number(args[0])
    const kind: RobinhoodErrorKind = code === 4 ? "margin" : code === 13 ? "price-unavailable" : "lending"
    return { kind, errorName: `${name}(${code})`, args, message: describeRobinhoodLendingCode(code), detail }
  }
  if (name === "Panic") {
    return { kind: "unknown", errorName: "Panic", args, message: `The contract stopped with panic code ${String(args[0])}.`, detail }
  }
  const hit = NAMED_ERRORS[name]
  return {
    kind: hit?.kind ?? "unknown",
    errorName: name,
    args,
    message: hit?.message ?? `The contract refused the transaction (${name}).`,
    detail,
  }
}

export function decodeRobinhoodError(err: unknown): RobinhoodDecodedError {
  const detail = rawMessage(err)
  if (isUserRejection(err)) {
    return { kind: "rejected", errorName: null, args: [], message: "The request was declined in the wallet.", detail }
  }

  const data = extractRevertData(err)
  if (data) {
    try {
      const decoded = decodeErrorResult({ abi: DECODE_ABI as any, data })
      return fromName(decoded.errorName, (decoded.args ?? []) as readonly unknown[], detail)
    } catch {
      // Unknown selector: fall through to the message heuristics below.
    }
  }

  // viem already decoded it when the call was made with one of our ABIs.
  let named: { name: string; args: readonly unknown[] } | null = null
  walk(err, (e) => {
    if (e?.data?.errorName) {
      named = { name: e.data.errorName, args: e.data.args ?? [] }
      return true
    }
    return false
  })
  if (named) return fromName((named as any).name, (named as any).args, detail)

  if (/price unavailable/i.test(detail)) return fromName("PriceUnavailable", [], detail)
  if (/insufficient funds/i.test(detail)) {
    return { kind: "network", errorName: null, args: [], message: "Not enough ETH on Robinhood Chain to pay the network fee.", detail }
  }
  if (/fetch|network|timeout|timed out|HTTP request failed/i.test(detail)) {
    return { kind: "network", errorName: null, args: [], message: "Robinhood Chain did not answer. Try again in a moment.", detail }
  }
  return { kind: "unknown", errorName: null, args: [], message: detail || "The transaction failed.", detail }
}
