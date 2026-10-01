/**
 * Checks that run before anything is signed, so a transfer never starts that
 * cannot finish: amount limits, a source balance that leaves gas behind, and a
 * Stellar wallet that can actually receive what is coming.
 *
 * Pure. The hook feeds it balances it read; the intent route runs the amount
 * checks again with the value it computed itself, since the button's opinion is
 * not a limit.
 */
import {
  XC_MIN_USD,
  isStableSymbol,
  isStellar,
  xcMaxUsd,
  type XcChain,
  type XcDirection,
} from "@/lib/crosschain/route"
import { xcError, type XcError } from "@/lib/crosschain/errors"

/**
 * Native coin left in an EVM wallet when the source is that coin, so the send
 * itself and the next transaction can still pay for gas. Generous on mainnet
 * Ethereum, where one transaction costs dollars.
 */
const EVM_GAS_RESERVE: Record<number, number> = {
  1: 0.003,
  56: 0.002,
  137: 1,
  43114: 0.02,
  8453: 0.0003,
  42161: 0.0003,
  4663: 0.0003,
}

/**
 * The same reserve for a wallet that sends once and is done: the embedded
 * wallet in Easy mode, where the coin was bought to be moved on and the general
 * reserve would strand a visible share of a small purchase (0.0003 ETH is
 * 1.6 % of a 50 euro top-up).
 *
 * Only networks with a measurement are listed; the rest keep the general
 * reserve. Base, 2026-09-28: six SODAX deposits cost 0.0000009 to 0.0000055 ETH
 * each (105k to 459k gas at 0.006 to 0.012 gwei, data fee included), so this
 * leaves room for a fee about ten times the most expensive one seen.
 */
const EVM_SINGLE_SEND_RESERVE: Record<number, number> = {
  8453: 0.00005,
}

export interface SpendOptions {
  /** One transaction follows and nothing after it. */
  singleSend?: boolean
}

/**
 * XLM kept in a Stellar wallet: the account's base reserve, a reserve per
 * trustline and position entry, and fees. Three XLM covers the wallets Peridot
 * creates (see the trustline funder) with room for the fee.
 */
export const STELLAR_XLM_KEEP = 3

/**
 * The most of `balance` that may leave, in whole-token units. Native coins keep
 * their reserve; tokens can go in full.
 */
export function maxSpendable(
  chain: XcChain,
  symbol: string,
  balance: number,
  isNative: boolean,
  options: SpendOptions = {},
): number {
  if (isStellar(chain)) return symbol === "XLM" ? Math.max(0, balance - STELLAR_XLM_KEEP) : balance
  if (!isNative) return balance
  const general = EVM_GAS_RESERVE[chain] ?? 0
  const reserve = options.singleSend ? (EVM_SINGLE_SEND_RESERVE[chain] ?? general) : general
  return Math.max(0, balance - reserve)
}

/**
 * The dollar value of a leg, from whichever side is a stablecoin. Null when
 * neither is (ETH to XLM, say); the intent route then prices the input through
 * a quote into USDC on Stellar.
 */
export function stableSideUsd(leg: {
  srcSymbol: string
  srcAmount: number
  dstSymbol: string
  quotedOut: number | null
}): number | null {
  if (isStableSymbol(leg.srcSymbol)) return leg.srcAmount
  if (isStableSymbol(leg.dstSymbol) && leg.quotedOut != null) return leg.quotedOut
  return null
}

/** The limit a dollar value breaks, if any. Null value means "not known", not zero. */
export function checkAmountUsd(usd: number | null): XcError | null {
  if (usd == null || !Number.isFinite(usd)) return null
  if (usd < XC_MIN_USD) return xcError("amount_too_low")
  const cap = xcMaxUsd()
  if (usd > cap) return xcError("over_cap", `The limit per transfer is $${cap} for now.`)
  return null
}

export interface PreflightInput {
  direction: XcDirection
  src: XcChain
  srcSymbol: string
  dstSymbol: string
  srcIsNative: boolean
  /** Whole-token units. */
  amount: number
  /** Source balance, whole-token units; null when it could not be read. */
  srcBalance: number | null
  /** Dollar value of the leg, when known. */
  usd: number | null
  /** The receiving Stellar wallet holds a USDC trustline. Null when unknown. */
  stellarHasUsdcTrustline: boolean | null
  /** The source wallet sends once and is done, see `EVM_SINGLE_SEND_RESERVE`. */
  singleSend?: boolean
}

/**
 * Everything that would stop this transfer, most important first. Empty means
 * the button may be pressed. Unknowns (a balance that did not load) do not
 * block: the wallet or the server will refuse with a clearer reason than a
 * guess would give.
 */
export function preflight(input: PreflightInput): XcError[] {
  const problems: XcError[] = []
  if (!(input.amount > 0)) return problems

  const limit = checkAmountUsd(input.usd)
  if (limit) problems.push(limit)

  if (input.srcBalance != null) {
    const spendable = maxSpendable(input.src, input.srcSymbol, input.srcBalance, input.srcIsNative, {
      singleSend: input.singleSend,
    })
    if (input.amount > spendable) problems.push(xcError("insufficient_funds"))
  }

  if (input.direction === "in" && input.dstSymbol === "USDC" && input.stellarHasUsdcTrustline === false) {
    problems.push(xcError("no_trustline"))
  }
  return problems
}
