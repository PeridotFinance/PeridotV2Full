/**
 * Step 6 of the Robinhood margin integration: everything after the open
 * (guide sections 7, 8 and 9).
 *
 *   quoteRobinhoodClose       fee ceiling, swap minima and a simulated payout
 *   runRobinhoodClose         requote -> ceiling check -> sign -> PositionClosed
 *   runRobinhoodAddCollateral free margin -> position
 *   runRobinhoodRepay         approve executor (bounded) -> repayWithUnderlying
 *   runRobinhoodDebtFreeExit  in-kind exit without prices, once debt is zero
 *   runRobinhoodWithdraw      vault -> wallet shares, optionally -> USDG
 *   runRobinhoodRedeem        wallet pUSDG -> USDG
 *   runRobinhoodSettleRewards fee rewards -> free margin
 *
 * The bundle has no quoteClose, so the close estimate is rebuilt from live
 * reads and then settled by simulating the exact call, whose return value is
 * the payout in margin shares. Minima follow the guide's table: an executed
 * swap leg gets a deliberate floor at the protocol's own slippage bound, an
 * unused leg gets zero. When a computed floor lands a rounding step under the
 * protocol floor (SwapError 5), the leg falls back to zero, which selects the
 * protocol floor: that is stricter than ours, never looser.
 */
import type { Address, Hex } from "viem"
import { ROBINHOOD_ABIS } from "@/app/abis/robinhood"
import { ROBINHOOD_MARGIN, ROBINHOOD_PAIRS, ROBINHOOD_TOKENS } from "@/config/robinhood"
import {
  addCollateral,
  approveUnderlyingForRepay,
  closePosition,
  exitDebtFreeToPTokens,
  findCollateralAddedEvent,
  findDebtFreeExitEvent,
  findDebtRepaidEvent,
  findPositionClosedEvent,
  findRedeemEvent,
  findVaultEvent,
  redeemPUsdg,
  repayWithUnderlying,
  settleRewards,
  simulateRobinhoodCall,
  withdrawMargin,
  type RobinhoodCloseParams,
  type RobinhoodCollateralAddedEvent,
  type RobinhoodDebtFreeExitEvent,
  type RobinhoodDebtRepaidEvent,
  type RobinhoodPositionClosedEvent,
  type RobinhoodRedeemEvent,
} from "./calls"
import { decodeRobinhoodError, type RobinhoodDecodedError } from "./errors"
import { approveWithReset, type RobinhoodFlowDeps } from "./flows"
import { feeCeiling, ROBINHOOD_DEFAULT_FEE_TOLERANCE_BPS } from "./open"
import {
  readRobinhoodAccountState,
  readRobinhoodPositions,
  simulateRobinhoodDebtCurrent,
  type RobinhoodPosition,
  type RobinhoodReader,
} from "./reads"
import { RobinhoodTxError, runRobinhoodCall, type RobinhoodTxUpdate } from "./tx"
import { BPS, ceilDiv, underlyingFromShares } from "./units"

const A = ROBINHOOD_ABIS
const M = ROBINHOOD_MARGIN
const T = ROBINHOOD_TOKENS

const flowError = (message: string, kind: RobinhoodDecodedError["kind"] = "unknown"): RobinhoodTxError =>
  new RobinhoodTxError({ kind, errorName: null, args: [], message, detail: message }, "pending")

type Entry = { status: "success"; result: unknown } | { status: "failure"; error: unknown }
const multicall = (client: RobinhoodReader, blockNumber: bigint, contracts: unknown[]): Promise<Entry[]> =>
  (client.multicall as unknown as (args: unknown) => Promise<Entry[]>)({ blockNumber, allowFailure: true, contracts })
const ok = (e: Entry | undefined) => (e && e.status === "success" ? e.result : null)
const big = (v: unknown): bigint | null => (typeof v === "bigint" ? v : typeof v === "number" ? BigInt(v) : null)
const field = (value: unknown, name: string, index: number): unknown =>
  Array.isArray(value) ? value[index] : value && typeof value === "object" ? (value as Record<string, unknown>)[name] : undefined

const simulateRate = (client: RobinhoodReader, pToken: Address): Promise<bigint | null> =>
  client
    .simulateContract({ address: pToken, abi: A.pToken as any, functionName: "exchangeRateCurrent" } as any)
    .then((r: any) => big(r?.result))
    .catch(() => null)

/** Floor at the protocol's slippage bound, rounded up so it never sits below the protocol's own. */
export const slippageFloor = (expectedOut: bigint, maxSlippageBps: number): bigint =>
  ceilDiv(expectedOut * (BPS - BigInt(maxSlippageBps)), BPS)

/** Part of `amount` a close of `closeBps` touches, rounded like the executor (debt up, shares down). */
export const debtSlice = (debt: bigint, closeBps: number): bigint => ceilDiv(debt * BigInt(closeBps), BPS)
export const shareSlice = (shares: bigint, closeBps: number): bigint => (shares * BigInt(closeBps)) / BPS

/** Closing fee exactly as guide 8: floor the closed notional, ceil the fee. */
export function closingFeeUsd18(grossUsd18: bigint, closeBps: number, closeFeeBps: number): bigint {
  const closed = (grossUsd18 * BigInt(closeBps)) / BPS
  return ceilDiv(closed * BigInt(closeFeeBps), BPS)
}

// ---------------------------------------------------------------------------
// Close quote
// ---------------------------------------------------------------------------

export type RobinhoodCloseIssueCode =
  | "not-active"
  | "amount"
  | "price-unavailable"
  | "fee-unavailable"
  | "read-failed"
  | "simulation"

export interface RobinhoodCloseQuote {
  positionId: bigint
  direction: "long" | "short"
  closeBps: number
  feeToleranceBps: number
  blockNumber: bigint
  quotedAt: number
  closeFeeBps: number | null
  maxSlippageBps: number | null
  grossUsd18: bigint | null
  /** Accrued debt from a simulated borrowBalanceCurrent, else the stored one. */
  debt: bigint | null
  debtSource: "current" | "stored" | null
  debtToRepay: bigint | null
  /** Position underlying (NVDA18 long, USDG6 short) the close redeems. */
  positionUnderlyingClosed: bigint | null
  closingFeeUsd18: bigint | null
  closingFeeShares: bigint | null
  maxClosingFeePToken: bigint | null
  minDebtUnderlying: bigint
  minMarginUnderlying: bigint
  /** "own" when our floors went on chain; "protocol" when a leg fell back to the protocol floor. */
  minimaSource: "own" | "protocol"
  /** Simulated `returnedMarginPTokens`, credited to free margin. An estimate, not a promise. */
  returnedMarginShares: bigint | null
  /** The same in USDG6 through the current pUSDG rate. */
  returnedMarginUsdg: bigint | null
  issues: Array<{ code: RobinhoodCloseIssueCode; message: string }>
  /** Decoded simulation failure, when that is the blocking issue. */
  simulationError: RobinhoodDecodedError | null
  params: RobinhoodCloseParams | null
}

export interface RobinhoodCloseQuoteInput {
  position: Pick<RobinhoodPosition, "id" | "account" | "direction" | "isActive" | "positionPToken" | "debtPToken">
  closeBps: number
  feeToleranceBps?: number
}

export async function quoteRobinhoodClose(
  client: RobinhoodReader,
  input: RobinhoodCloseQuoteInput,
  user: Address,
): Promise<RobinhoodCloseQuote> {
  const { position, closeBps } = input
  const feeToleranceBps = input.feeToleranceBps ?? ROBINHOOD_DEFAULT_FEE_TOLERANCE_BPS
  const pair = ROBINHOOD_PAIRS[position.direction]
  const long = position.direction === "long"
  const blockNumber = await client.getBlockNumber()

  const q: RobinhoodCloseQuote = {
    positionId: position.id,
    direction: position.direction,
    closeBps,
    feeToleranceBps,
    blockNumber,
    quotedAt: Date.now(),
    closeFeeBps: null,
    maxSlippageBps: null,
    grossUsd18: null,
    debt: null,
    debtSource: null,
    debtToRepay: null,
    positionUnderlyingClosed: null,
    closingFeeUsd18: null,
    closingFeeShares: null,
    maxClosingFeePToken: null,
    minDebtUnderlying: 0n,
    minMarginUnderlying: 0n,
    minimaSource: "own",
    returnedMarginShares: null,
    returnedMarginUsdg: null,
    issues: [],
    simulationError: null,
    params: null,
  }
  const issue = (code: RobinhoodCloseIssueCode, message: string) => q.issues.push({ code, message })

  if (!position.isActive) {
    issue("not-active", "This position is no longer active.")
    return q
  }
  if (!Number.isInteger(closeBps) || closeBps < 1 || closeBps > 10_000) {
    issue("amount", "Choose how much of the position to close.")
    return q
  }

  const [pass1, debtCurrent, positionRate, marginRate] = await Promise.all([
    multicall(client, blockNumber, [
      { address: M.config, abi: A.config, functionName: "closeFeeBps" },
      { address: M.config, abi: A.config, functionName: "getPairRisk", args: [pair.marginPToken, pair.positionPToken, pair.debtPToken] },
      { address: M.riskEngine, abi: A.riskEngine, functionName: "getMetrics", args: [position.account] },
      { address: M.oracle, abi: A.oracle, functionName: "marketPriceable", args: [T.pUSDG] },
      { address: M.oracle, abi: A.oracle, functionName: "marketPriceable", args: [T.pNVDA] },
      { address: position.positionPToken, abi: A.pToken, functionName: "balanceOf", args: [position.account] },
      { address: position.debtPToken, abi: A.pToken, functionName: "borrowBalanceStored", args: [position.account] },
    ]),
    simulateRobinhoodDebtCurrent(client, position.debtPToken, position.account),
    simulateRate(client, position.positionPToken),
    simulateRate(client, T.pUSDG),
  ])

  const closeFee = big(ok(pass1[0]))
  q.closeFeeBps = closeFee === null ? null : Number(closeFee)
  const risk = ok(pass1[1])
  const slip = big(field(risk, "maxSlippageBps", 8) as any)
  q.maxSlippageBps = slip === null ? null : Number(slip)
  q.grossUsd18 = big(field(ok(pass1[2]), "grossAssetValueUsd", 0))
  const priceable = ok(pass1[3]) === true && ok(pass1[4]) === true
  const positionShares = big(ok(pass1[5]))
  const debtStored = big(ok(pass1[6]))
  q.debt = debtCurrent ?? debtStored
  q.debtSource = debtCurrent !== null ? "current" : debtStored !== null ? "stored" : null

  if (!priceable || q.grossUsd18 === null) {
    issue("price-unavailable", "Prices are unavailable, so the position cannot be closed through the market right now. Repay the debt and use the exit without prices instead.")
    return q
  }
  if (q.closeFeeBps === null) issue("fee-unavailable", "The closing fee could not be read.")
  if (q.maxSlippageBps === null) issue("read-failed", "The swap limits for this position could not be read.")
  if (q.debt === null || positionShares === null || positionRate === null) issue("read-failed", "The position balances could not be read.")
  if (q.issues.length) return q

  const debt = q.debt!
  q.debtToRepay = debtSlice(debt, closeBps)
  q.positionUnderlyingClosed = underlyingFromShares(shareSlice(positionShares!, closeBps), positionRate!)
  q.closingFeeUsd18 = closingFeeUsd18(q.grossUsd18, closeBps, q.closeFeeBps!)

  // Pass 2: fee in shares, oracle parity of the NVDA leg, flash fee of the short's repayment.
  const nvdaLeg = long && q.positionUnderlyingClosed > 0n
  const shortDebt = !long && q.debtToRepay > 0n
  const pass2 = await multicall(client, blockNumber, [
    { address: M.quoter, abi: A.quoter, functionName: "feePToken", args: [T.pUSDG, q.closingFeeUsd18] },
    nvdaLeg
      ? { address: M.quoter, abi: A.quoter, functionName: "expectedOut", args: [T.NVDA, T.USDG, q.positionUnderlyingClosed] }
      : { address: M.config, abi: A.config, functionName: "closeFeeBps" },
    shortDebt
      ? { address: M.flashVault, abi: A.flashVault, functionName: "flashFee", args: [T.NVDA, q.debtToRepay] }
      : { address: M.config, abi: A.config, functionName: "closeFeeBps" },
  ])
  q.closingFeeShares = q.closingFeeUsd18 === 0n ? 0n : big(ok(pass2[0]))
  if (q.closingFeeShares === null) {
    issue("fee-unavailable", "The closing fee could not be converted into margin shares.")
    return q
  }
  q.maxClosingFeePToken = feeCeiling(q.closingFeeShares, feeToleranceBps)

  // Guide 8, "Meaning of the close minima".
  if (long) {
    const parity = nvdaLeg ? big(ok(pass2[1])) : 0n
    if (parity === null) {
      issue("price-unavailable", "The swap price could not be read. Try again in a moment.")
      return q
    }
    const floor = parity > 0n ? slippageFloor(parity, q.maxSlippageBps!) : 0n
    if (debt > 0n) q.minDebtUnderlying = floor
    else q.minMarginUnderlying = floor
  } else if (shortDebt) {
    // The USDG -> NVDA leg has to bring at least the repayment plus the flash fee.
    const flashFee = big(ok(pass2[2]))
    if (flashFee === null) {
      issue("read-failed", "The repayment fee could not be read.")
      return q
    }
    q.minDebtUnderlying = q.debtToRepay + flashFee
    // The residual NVDA -> USDG leg has no amount we can know ahead; zero selects the protocol floor.
  }

  const build = (): RobinhoodCloseParams => ({
    positionId: position.id,
    closeBps,
    maxClosingFeePToken: q.maxClosingFeePToken!,
    minDebtUnderlying: q.minDebtUnderlying,
    minMarginUnderlying: q.minMarginUnderlying,
    positionToDebtSwapData: "0x" as Hex,
    debtToMarginSwapData: "0x" as Hex,
  })

  let params = build()
  let sim = await simulateRobinhoodCall(client, user, closePosition(params))
  if (!sim.ok) {
    const decoded = decodeRobinhoodError((sim as { ok: false; error: unknown }).error)
    if (decoded.errorName === "SwapError(5)" && (q.minDebtUnderlying > 0n || q.minMarginUnderlying > 0n)) {
      q.minDebtUnderlying = 0n
      q.minMarginUnderlying = 0n
      q.minimaSource = "protocol"
      params = build()
      sim = await simulateRobinhoodCall(client, user, closePosition(params))
    }
  }
  if (!sim.ok) {
    q.simulationError = decodeRobinhoodError((sim as { ok: false; error: unknown }).error)
    issue("simulation", q.simulationError.message)
    return q
  }

  q.returnedMarginShares = big((sim as { ok: true; result: unknown }).result)
  const rate = marginRate ?? null
  q.returnedMarginUsdg = q.returnedMarginShares !== null && rate !== null ? underlyingFromShares(q.returnedMarginShares, rate) : null
  q.params = params
  return q
}

// ---------------------------------------------------------------------------
// Close
// ---------------------------------------------------------------------------

export class RobinhoodCloseRequoteError extends RobinhoodTxError {
  readonly quote: RobinhoodCloseQuote
  constructor(message: string, quote: RobinhoodCloseQuote) {
    super({ kind: "fee", errorName: null, args: [], message, detail: message }, "pending")
    this.name = "RobinhoodCloseRequoteError"
    this.quote = quote
  }
}

export interface RobinhoodCloseResult {
  event: RobinhoodPositionClosedEvent
  quote: RobinhoodCloseQuote
  hash: Hex
}

/**
 * Same discipline as the open: quote again right before the signature, keep
 * the fee ceiling the user accepted, send the fresh minima unchanged, and
 * hand back the new quote rather than raise the limit silently.
 */
export async function runRobinhoodClose(
  deps: RobinhoodFlowDeps,
  user: Address,
  position: RobinhoodCloseQuoteInput["position"],
  accepted: RobinhoodCloseQuote,
  onUpdate?: (u: RobinhoodTxUpdate) => void,
): Promise<RobinhoodCloseResult> {
  if (accepted.maxClosingFeePToken === null) throw flowError("This quote cannot be used. Request a new one.", "quote")
  const fresh = await quoteRobinhoodClose(
    deps.client,
    { position, closeBps: accepted.closeBps, feeToleranceBps: accepted.feeToleranceBps },
    user,
  )
  if (!fresh.params) throw new RobinhoodCloseRequoteError(fresh.issues[0]?.message ?? "The quote is no longer valid.", fresh)
  if (fresh.closingFeeShares !== null && fresh.closingFeeShares > accepted.maxClosingFeePToken) {
    throw new RobinhoodCloseRequoteError("The closing fee changed. Review the new quote.", fresh)
  }
  const params = { ...fresh.params, maxClosingFeePToken: accepted.maxClosingFeePToken }
  const sent = await runRobinhoodCall(deps, user, closePosition(params), { onUpdate })
  const event = findPositionClosedEvent(sent.receipt, position.id)
  if (!event) throw flowError("The close confirmed without a PositionClosed event. Refresh the positions.", "unknown")
  return { event, quote: fresh, hash: sent.hash }
}

// ---------------------------------------------------------------------------
// Add collateral
// ---------------------------------------------------------------------------

export async function runRobinhoodAddCollateral(
  deps: RobinhoodFlowDeps,
  user: Address,
  positionId: bigint,
  shares: bigint,
  onUpdate?: (u: RobinhoodTxUpdate) => void,
): Promise<RobinhoodCollateralAddedEvent> {
  if (shares <= 0n) throw flowError("Enter an amount greater than zero.", "margin")
  const account = await readRobinhoodAccountState(deps.client, user)
  if (account.vault.freeShares === null) throw flowError("The free margin balance could not be read.", "network")
  if (account.vault.freeShares < shares) throw flowError("Not enough free margin. Add margin to the account first.", "margin")
  const sent = await runRobinhoodCall(deps, user, addCollateral(positionId, shares), { onUpdate })
  const event = findCollateralAddedEvent(sent.receipt, positionId)
  if (!event) throw flowError("The transaction confirmed without a CollateralAdded event. Refresh the position.", "unknown")
  return event
}

// ---------------------------------------------------------------------------
// Repay
// ---------------------------------------------------------------------------

/** Room above the accrued debt for interest between the read and the block. */
export const ROBINHOOD_REPAY_ACCRUAL_BPS = 10

export interface RobinhoodRepayPlan {
  asset: Address
  symbol: "USDG" | "NVDA"
  debt: bigint | null
  /** What goes on chain as `maxUnderlyingAmount` and as the approval. */
  maxAmount: bigint
  /** True when the wallet covers the whole debt with the accrual room. */
  full: boolean
  blockers: string[]
}

/**
 * The executor pulls min(debt, max). A full repayment approves debt plus a
 * small accrual room, bounded by what the wallet holds; a wallet short of the
 * debt repays what it has. `amount` asks for a specific partial repayment.
 */
export function planRobinhoodRepay(
  direction: "long" | "short",
  debt: bigint | null,
  walletBalance: bigint | null,
  amount?: bigint,
): RobinhoodRepayPlan {
  const long = direction === "long"
  const asset = long ? T.USDG : T.NVDA
  const symbol = long ? "USDG" : "NVDA"
  const blockers: string[] = []
  if (debt === null) blockers.push("The current debt could not be read.")
  else if (debt === 0n) blockers.push("This position has no debt.")
  if (walletBalance === null) blockers.push(`The ${symbol} balance could not be read.`)
  else if (walletBalance === 0n) blockers.push(`There is no ${symbol} in the wallet to repay with.`)
  if (amount !== undefined && amount <= 0n) blockers.push("Enter an amount greater than zero.")
  if (blockers.length) return { asset, symbol, debt, maxAmount: 0n, full: false, blockers }

  const withRoom = debt! + ceilDiv(debt! * BigInt(ROBINHOOD_REPAY_ACCRUAL_BPS), BPS) + 1n
  const wanted = amount === undefined ? withRoom : amount < withRoom ? amount : withRoom
  const maxAmount = wanted < walletBalance! ? wanted : walletBalance!
  return { asset, symbol, debt, maxAmount, full: maxAmount > debt!, blockers }
}

export interface RobinhoodRepayResult {
  event: RobinhoodDebtRepaidEvent
  plan: RobinhoodRepayPlan
}

export async function runRobinhoodRepay(
  deps: RobinhoodFlowDeps,
  user: Address,
  position: Pick<RobinhoodPosition, "id" | "account" | "direction" | "debtPToken">,
  amount: bigint | undefined,
  onUpdate?: (u: RobinhoodTxUpdate) => void,
): Promise<RobinhoodRepayResult> {
  const client = deps.client
  const [account, current] = await Promise.all([
    readRobinhoodAccountState(client, user),
    simulateRobinhoodDebtCurrent(client, position.debtPToken, position.account),
  ])
  const long = position.direction === "long"
  const plan = planRobinhoodRepay(position.direction, current, long ? account.wallet.usdg : account.wallet.nvda, amount)
  if (plan.blockers.length) throw flowError(plan.blockers[0], "margin")

  const allowance = long ? account.allowances.usdgForRepay : account.allowances.nvdaForRepay
  if ((allowance ?? 0n) < plan.maxAmount) {
    await approveWithReset(deps, user, allowance, (a) => approveUnderlyingForRepay(plan.asset, a), plan.maxAmount, onUpdate)
    const after = await readRobinhoodAccountState(client, user)
    const seen = long ? after.allowances.usdgForRepay : after.allowances.nvdaForRepay
    if ((seen ?? 0n) < plan.maxAmount) throw flowError("The approval is not visible yet. Try again in a moment.", "network")
  }

  const sent = await runRobinhoodCall(deps, user, repayWithUnderlying(position.id, plan.maxAmount), { onUpdate })
  const event = findDebtRepaidEvent(sent.receipt, position.id)
  if (!event) throw flowError("The repayment confirmed without a DebtRepaid event. Refresh the position.", "unknown")
  return { event, plan }
}

// ---------------------------------------------------------------------------
// Recovery: debt-free exit without prices (guide 9)
// ---------------------------------------------------------------------------

export async function runRobinhoodDebtFreeExit(
  deps: RobinhoodFlowDeps,
  user: Address,
  position: Pick<RobinhoodPosition, "id" | "account" | "debtPToken">,
  onUpdate?: (u: RobinhoodTxUpdate) => void,
): Promise<RobinhoodDebtFreeExitEvent> {
  const client = deps.client
  const [debt, feeEntries] = await Promise.all([
    simulateRobinhoodDebtCurrent(client, position.debtPToken, position.account),
    multicall(client, await client.getBlockNumber(), [{ address: M.config, abi: A.config, functionName: "closeFeeBps" }]),
  ])
  if (debt === null) throw flowError("The current debt could not be read.", "network")
  if (debt > 0n) throw flowError("Debt remains on this position. Repay it in full first.", "position")
  const fee = big(ok(feeEntries[0]))
  if (fee === null) throw flowError("The closing fee could not be read.", "fee")

  // The ceiling is the configured percentage itself: the user accepts today's fee, not a higher one.
  const sent = await runRobinhoodCall(deps, user, exitDebtFreeToPTokens(position.id, Number(fee)), { onUpdate })
  const event = findDebtFreeExitEvent(sent.receipt, position.id)
  if (!event) throw flowError("The exit confirmed without a DebtFreePTokenExit event. Refresh the position.", "unknown")
  return event
}

// ---------------------------------------------------------------------------
// Withdraw, redeem, rewards
// ---------------------------------------------------------------------------

const redeemCheck = (r: unknown) => (typeof r === "bigint" && r !== 0n ? `The market refused the conversion (code ${r}).` : null)

export interface RobinhoodWithdrawResult {
  withdrawnShares: bigint
  redeem: RobinhoodRedeemEvent | null
  /** Set when the shares reached the wallet but the conversion to USDG did not happen. */
  redeemError: RobinhoodDecodedError | null
}

/**
 * Free margin to the wallet, then (optionally) pUSDG to USDG. The two are
 * separate transactions: when the conversion fails for liquidity, the shares
 * are already safe in the wallet and the result says so instead of throwing
 * away the confirmed first step.
 */
export async function runRobinhoodWithdraw(
  deps: RobinhoodFlowDeps,
  user: Address,
  shares: bigint,
  options: { redeem: boolean },
  onUpdate?: (u: RobinhoodTxUpdate) => void,
): Promise<RobinhoodWithdrawResult> {
  if (shares <= 0n) throw flowError("Enter an amount greater than zero.", "margin")
  const account = await readRobinhoodAccountState(deps.client, user)
  if (account.vault.freeShares === null) throw flowError("The free margin balance could not be read.", "network")
  if (account.vault.freeShares < shares) throw flowError("That is more than the free margin.", "margin")

  const sent = await runRobinhoodCall(deps, user, withdrawMargin(shares), { onUpdate })
  const withdrawn = findVaultEvent(sent.receipt, "Withdrawn", user)
  if (!withdrawn) throw flowError("The withdrawal confirmed without a Withdrawn event. Check the wallet balance.", "unknown")
  if (!options.redeem) return { withdrawnShares: withdrawn.amount, redeem: null, redeemError: null }

  try {
    const redeem = await runRobinhoodRedeem(deps, user, withdrawn.amount, onUpdate)
    return { withdrawnShares: withdrawn.amount, redeem, redeemError: null }
  } catch (err) {
    const decoded = err instanceof RobinhoodTxError ? err.decoded : decodeRobinhoodError(err)
    return { withdrawnShares: withdrawn.amount, redeem: null, redeemError: decoded }
  }
}

export async function runRobinhoodRedeem(
  deps: RobinhoodFlowDeps,
  user: Address,
  shares: bigint,
  onUpdate?: (u: RobinhoodTxUpdate) => void,
): Promise<RobinhoodRedeemEvent> {
  if (shares <= 0n) throw flowError("Enter an amount greater than zero.", "margin")
  const sent = await runRobinhoodCall(deps, user, redeemPUsdg(shares), { onUpdate, checkSimulation: redeemCheck })
  const event = findRedeemEvent(sent.receipt, user)
  if (!event) throw flowError("The conversion confirmed without a Redeem event. The shares are still in the wallet.", "lending")
  return event
}

export async function runRobinhoodSettleRewards(
  deps: RobinhoodFlowDeps,
  user: Address,
  onUpdate?: (u: RobinhoodTxUpdate) => void,
): Promise<{ amount: bigint }> {
  const sent = await runRobinhoodCall(deps, user, settleRewards(), { onUpdate })
  // Settling zero emits nothing; that is not a failure.
  return findVaultEvent(sent.receipt, "RewardsSettled", user) ?? { amount: 0n }
}

/** Re-read one position after an action, for flows that want the fresh state inline. */
export async function readRobinhoodPosition(client: RobinhoodReader, user: Address, id: bigint): Promise<RobinhoodPosition | null> {
  const res = await readRobinhoodPositions(client, user, { ids: [id] })
  return res.positions[0] ?? null
}
