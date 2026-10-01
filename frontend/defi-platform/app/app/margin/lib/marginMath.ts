/**
 * Pure margin math — extracted from the open hook + positions panel so the
 * critical numbers (borrow amount, oracle slippage floor, liquidation price) are
 * unit-testable without a chain or React. See spec §10 (open) and the open
 * panel's preview formula (liquidation).
 */
import { STELLAR_MARGIN_CONFIG as CFG } from "../config/stellarMarginConfig"
import { ceilMulDiv } from "@/lib/stellar-margin"
import type { PositionSide } from "../config/stellarMarginConfig"

const SCALE = CFG.constants.EXCHANGE_SCALE

/** An oracle price as the contract returns it: USD = num/den (e.g. Reflector 1e14 den). */
export interface PriceFrac {
  num: bigint
  den: bigint
}

export interface BorrowAndFloor {
  /** Margin (collateral) value in underlying base units (margin asset = USDT). */
  collateralUnderlying: bigint
  /**
   * Debt to borrow, in the DEBT asset's units. The multiplier is side-dependent
   * — see {@link computeBorrowAndFloor}: `leverage − 1` for a Long, the full
   * `leverage` for a Short.
   */
  borrowAmount: bigint
  /**
   * The contract's oracle floor for `amount_with_slippage`, denominated in the
   * POSITION asset. V3 measures the TOTAL position (margin + borrow = margin ×
   * leverage) — not just the borrow — because `swap_open_position_v3` moves the
   * margin along with the borrow.
   */
  oracleMinOut: bigint
}

/**
 * V3 open sizing + oracle floor — reverse-engineered against the live V3
 * controller by bisecting the accepted `amount_with_slippage` (see
 * scripts/margin-probe-v3-begin.mjs; thresholds matched to <5 base units on
 * Long 2×/3× and Short 2×):
 *
 *   borrow (Long)  = margin_value × (leverage − 1)  — NO collateral-factor discount
 *   borrow (Short) = margin_value × leverage
 *   oracle floor = margin_underlying × leverage, priced margin-asset → position-
 *                  asset via the oracle, × (1 − MAX_SLIPPAGE 5%)
 *
 * The sides genuinely differ, and getting it wrong is not cosmetic. A Long puts
 * its own margin INTO the swap, so margin + borrow = notional and the borrow is
 * one leverage step smaller. A Short keeps its margin as the position asset and
 * borrows the WHOLE notional in XLM to sell — so its borrow is margin × leverage.
 *
 * This function used to apply the Long formula to both. Measured against a live
 * 5× Short on 200 USDT: it computed 4665.37 XLM where the contract actually
 * borrowed 5833.24 (exactly 5/4 of it — one leverage step). Two things were
 * wrong downstream: the vault-liquidity pre-check cleared trades the vault could
 * not fund, and — worse — `expectedOut` for a Short is derived from this borrow,
 * so the min-out guarding the swap was a fifth too small and would have accepted
 * an execution far outside the user's tolerance. The panel's DISPLAY of the
 * borrow was corrected for this long ago; the math behind the trade was not.
 *
 * This differs from V2 in two ways: sizing ignores the lending CF, and the
 * floor covers the FULL notional (the V3 on-chain swap includes the margin for
 * a Long; for a Short the margin already IS the position asset and counts
 * toward the minimum). Passing a floor below the contract's own traps begin
 * with `slippage too high` (surfaced as UnreachableCodeReached in the stripped
 * release wasm).
 *
 * `exchangeRate` is scaled by EXCHANGE_SCALE; prices are the raw `{num, den}`
 * from `get_price_usd` (margin/collateral is always USDT).
 */
export function computeBorrowAndFloor(params: {
  collateralPtokens: bigint
  exchangeRate: bigint
  leverage: number
  /** Long borrows leverage − 1, Short borrows the full leverage. Defaults to
   *  Long so an omitted side keeps the historical behaviour rather than
   *  silently over-borrowing. */
  side?: PositionSide
  collateralPrice: PriceFrac
  debtPrice: PriceFrac
  positionPrice: PriceFrac
}): BorrowAndFloor {
  const { collateralPtokens, exchangeRate, leverage, side = "Long", collateralPrice, debtPrice, positionPrice } = params
  const lev = BigInt(Math.max(0, Math.floor(leverage)))
  const collateralUnderlying = (collateralPtokens * exchangeRate) / SCALE
  const collateralValueUsd = (collateralUnderlying * collateralPrice.num) / collateralPrice.den
  const borrowMultiplier = side === "Short" ? lev : lev > BigInt(0) ? lev - BigInt(1) : BigInt(0)
  const borrowValueUsd = collateralValueUsd * borrowMultiplier
  // Debt amount = USD value priced back into the debt asset.
  const borrowAmount = (borrowValueUsd * debtPrice.den) / debtPrice.num
  // Floor on the TOTAL position: margin × leverage, margin asset → position
  // asset, minus the protocol max slippage. Ceil so we never round below the
  // contract's own floor.
  const oracleMinOut = ceilMulDiv(
    collateralUnderlying * lev * collateralPrice.num * positionPrice.den,
    SCALE - CFG.constants.MAX_SLIPPAGE_SCALED,
    collateralPrice.den * positionPrice.num * SCALE,
  )
  return { collateralUnderlying, borrowAmount, oracleMinOut }
}

/**
 * The price the trade ACTUALLY gets, in USD per XLM.
 *
 * Every price the open panel shows comes from the price feed, and so does the
 * entry the journal records — but no trade ever executes at the feed. It
 * executes against the Aquarius pool, whose quote moves with the size being
 * pushed through it. Measured on testnet: +0.68% on an 80 USDT notional long,
 * +2.5% at 90, +5.2% at 350. At 5× leverage a 5% execution gap is 25% off the
 * trader's equity the instant the position opens — which is why positions
 * appeared to open underwater "for no reason", and why PnL measured against the
 * feed never matched what the account did.
 *
 * Both sides reduce to "what did one XLM cost / fetch":
 *
 *   Long  — spend margin + borrow (USDT), receive XLM → USDT in / XLM out
 *   Short — sell the borrowed XLM, receive USDT       → USDT out / XLM sold
 *
 * `positionAmount` is the position asset the swap produced. For a Short that is
 * the controller's custodied USDT, which INCLUDES the margin, so the margin is
 * netted out to isolate the proceeds. Returns null rather than a wrong number
 * when an input is missing or non-positive.
 */
export function executionEntryPrice(params: {
  side: PositionSide
  /** Margin in USDT base units. */
  collateralUnderlying: bigint
  /** Borrow in the debt asset's base units (Long: USDT, Short: XLM). */
  borrowAmount: bigint
  /** Position asset the swap produced, base units (Long: XLM, Short: USDT incl. margin). */
  positionAmount: bigint
  usdtDecimals: number
  xlmDecimals: number
}): number | null {
  const { side, collateralUnderlying, borrowAmount, positionAmount, usdtDecimals, xlmDecimals } = params
  const usdt = (raw: bigint) => Number(raw) / 10 ** usdtDecimals
  const xlm = (raw: bigint) => Number(raw) / 10 ** xlmDecimals

  if (side === "Long") {
    const spent = usdt(collateralUnderlying + borrowAmount)
    const received = xlm(positionAmount)
    if (!(spent > 0) || !(received > 0)) return null
    return spent / received
  }
  const sold = xlm(borrowAmount)
  // A Short's `positionAmount` MUST be the custodied total (margin + proceeds).
  // An amount at or below the margin can't be that, so it is an unknown shape —
  // and there is no way to tell a proceeds-only figure from a genuine one, since
  // both are plausible numbers. Guessing produced a confidently wrong fill price
  // (0.134 instead of 0.168 on live figures), so refuse instead: a hidden row
  // beats a fabricated price on the screen the trader commits from.
  if (positionAmount <= collateralUnderlying) return null
  const proceeds = usdt(positionAmount - collateralUnderlying)
  if (!(sold > 0) || !(proceeds > 0)) return null
  return proceeds / sold
}

/**
 * Which price to draw a position's entry (and the liquidation line anchored on
 * it) at, given both domains.
 *
 * `fills` are execution prices — what the opening swap got in the Aquarius pool,
 * and the only correct basis for PnL. `feedAnchors` are the market price recorded
 * at open (`feed_price_usd`). The chart's candles are the market, so an anchor
 * wins whenever one exists.
 *
 * The fallback is the point of the function: a position with no anchor (opened
 * before the column existed, whose entry already IS a feed
 * price) keeps its fill price and therefore keeps its line. Losing the correction
 * is acceptable; losing the line is not.
 */
export function resolveChartEntries(
  fills: Record<string, number>,
  feedAnchors: Record<string, number>,
): Record<string, number> {
  return { ...fills, ...feedAnchors }
}

/**
 * Step 0b (spec §10): given a live swap estimate, fold the user's slippage
 * tolerance with the oracle floor. The effective minimum is the stricter (higher)
 * of the two.
 */
export function resolveMinOut(params: {
  oracleMinOut: bigint
  expectedOut: bigint
  slippageBps: number
}): { userMinOut: bigint; amountWithSlippage: bigint } {
  const { oracleMinOut, expectedOut, slippageBps } = params
  const userMinOut = (expectedOut * BigInt(10_000 - slippageBps)) / BigInt(10_000)
  const amountWithSlippage = oracleMinOut > userMinOut ? oracleMinOut : userMinOut
  return { userMinOut, amountWithSlippage }
}

export interface MinOutShortfall {
  /** The live quote can't satisfy the effective minimum — the open is rejected. */
  blocked: boolean
  /**
   * The ORACLE floor is what the quote misses, not the user's tolerance.
   *
   * Provably equal to {@link blocked} for a pre-signature check, and that is the
   * whole point. `userMinOut = expectedOut × (1 − bps/10000) ≤ expectedOut` for
   * any tolerance ≥ 0, so the live quote can never fall under the user's own
   * minimum — it IS the number that minimum is derived from. Therefore
   * `expectedOut < max(oracleMinOut, userMinOut)` holds if and only if
   * `expectedOut < oracleMinOut`.
   *
   * Consequence: a pre-check rejection is ALWAYS the oracle band, never the
   * tolerance, so no tolerance — 1% or 40% — can change the outcome. The
   * tolerance only ever binds on-chain, on drift between the quote and the swap.
   * Kept as a separate field so that identity is asserted by a test rather than
   * assumed by the caller.
   */
  oracleBound: boolean
  /**
   * How far the pool's execution price sits from the oracle's, in percent, as a
   * price premium: what the pool charges above (Long) / pays below (Short) the
   * reference. Comparable directly against {@link maxGapPct}. Null when there's
   * nothing to compare (degenerate quote).
   */
  poolGapPct: number | null
  /** The protocol's hard ceiling on that gap (MAX_SLIPPAGE, 5%). */
  maxGapPct: number
}

/**
 * Diagnose a rejected open: is the user's slippage tolerance the binding
 * constraint, or the protocol's oracle floor?
 *
 * This distinction is the whole difference between an actionable error and a
 * dishonest one. The UI used to answer "the price moved, allow more movement"
 * for both cases and walk a 100→4000 bps ladder — but when the oracle floor
 * binds, every rung submits the *identical* `amount_with_slippage`, so the
 * ladder can only fail six times and blame the user's settings.
 *
 * Observed live (2026-07-30, testnet): the Aquarius XLM/USDT pool sat 5.9%
 * above the Reflector oracle after an 11.5k-XLM long consumed 3.7% of the pool's
 * XLM reserve. Every Long was blocked at every size — $2 at 2× showed the same
 * 5.92% gap as $400 at 2× (the trade's own price impact contributes under a
 * point) — which is exactly why "try a smaller size" didn't help either.
 *
 * Pure → unit-testable, no chain.
 */
export function describeMinOutShortfall(params: {
  oracleMinOut: bigint
  expectedOut: bigint
  slippageBps: number
}): MinOutShortfall {
  const { oracleMinOut, expectedOut } = params
  const { amountWithSlippage } = resolveMinOut(params)
  const maxGapPct = (Number(CFG.constants.MAX_SLIPPAGE_SCALED) / Number(SCALE)) * 100
  // Undo the protocol haircut to recover the oracle's own valuation of the
  // notional, then express the miss as a price premium over it.
  const keep = 1 - maxGapPct / 100
  const oracleNotional = keep > 0 ? Number(oracleMinOut) / keep : 0
  const poolGapPct =
    expectedOut > BigInt(0) && oracleNotional > 0 ? (oracleNotional / Number(expectedOut) - 1) * 100 : null
  return {
    blocked: expectedOut < amountWithSlippage,
    oracleBound: expectedOut < oracleMinOut,
    poolGapPct,
    maxGapPct,
  }
}

/**
 * XLM price at which a position is liquidated (V3 perps maintenance-margin
 * logic, NOT the lending collateral-factor formula). Liquidation triggers when
 * `position_value × (1 − maintenanceMargin)` no longer covers the debt:
 *
 *   Long  (position XLM, debt USD-stable):  liq = debt_value / (xlm_amount × (1−mm))
 *                                               = debtUsd·price / (collateralUsd·(1−mm))
 *   Short (position USD-stable, debt XLM):  liq = collateralUsd·(1−mm)·price / debtUsd
 *
 * `collateralUsd`/`debtUsd` are the CURRENT values at `price`. A Long liquidates
 * as price falls (liq < current); a Short as it rises (liq > current). This is a
 * display estimate — `get_health_factor` stays the on-chain source of truth.
 * Null when inputs are degenerate.
 */
export function liquidationPrice(params: {
  side: PositionSide
  collateralUsd: number
  debtUsd: number
  /** Maintenance margin as a fraction (V3 default 0.05 = CFG.constants.MAINTENANCE_MARGIN). */
  maintenanceMargin: number
  price: number
}): number | null {
  const { side, collateralUsd, debtUsd, maintenanceMargin, price } = params
  const keep = 1 - maintenanceMargin
  if (debtUsd <= 0 || collateralUsd <= 0 || keep <= 0 || keep > 1 || price <= 0) return null
  return side === "Long"
    ? (debtUsd * price) / (collateralUsd * keep)
    : (collateralUsd * keep * price) / debtUsd
}

/**
 * How far the price still has to move before this position liquidates, in
 * percent of the current price.
 *
 * The liquidation PRICE alone is not a risk signal a person can read: "$0.0912"
 * only means something next to the current price, and next to the leverage that
 * decides how quickly the gap closes. The health factor is the number that is
 * supposed to answer this, but 1.34 is a ratio out of the lending world — it has
 * no unit anyone trades in. A percentage does: "18% away" is immediately
 * comparable to how much XLM moves on an ordinary day.
 *
 * Direction is folded in, so the result is always a positive distance: a Long
 * liquidates on the way down, a Short on the way up. A position already past its
 * liquidation price reports 0 rather than a negative number — it is not "−4% away",
 * it is out of room, and the health badge is the thing screaming at that point.
 */
export function liquidationDistancePct(params: {
  side: PositionSide
  /** As returned by `liquidationPrice` — null passes straight through. */
  liqPrice: number | null
  /** Current mark, same domain the liquidation price was computed in. */
  price: number
}): number | null {
  const { side, liqPrice, price } = params
  if (liqPrice == null || !(liqPrice > 0) || !(price > 0)) return null
  const pct = side === "Long" ? ((price - liqPrice) / price) * 100 : ((liqPrice - price) / price) * 100
  if (!Number.isFinite(pct)) return null
  return Math.max(pct, 0)
}

/**
 * What a partial repayment does to a position, for the pre-signature preview.
 *
 * `repay_margin_position_v3(user, id, amount)` pulls `amount` of the DEBT asset
 * from the wallet and writes it against this position's debt. Collateral is
 * untouched, so every risk number moves for exactly one reason — the debt got
 * smaller:
 *
 *   debt      ↓ by the repaid amount
 *   equity    ↑ by its USD value (collateral − debt)
 *   health    ↑ ∝ 1/debt
 *   liq price further away
 *
 * Health is scaled off the position's CURRENT (on-chain) health factor rather
 * than recomputed from the maintenance-margin formula. Both the V3 perps rule
 * and the lending-CF rule are proportional to 1/debt, so the ratio is exact
 * under either — and, more importantly, a repay of 0 reproduces the number the
 * row is already showing. Recomputing it from scratch would have the preview
 * disagree with the badge right next to it whenever our formula and the
 * contract's drift apart.
 *
 * Repaying the debt in full leaves a position with collateral and no debt: no
 * liquidation price exists and health is unbounded, reported here as the panel's
 * `99` sentinel (rendered "∞") so preview and badge agree.
 *
 * `repayAmount` and `debtAmount` are in the DEBT asset's human units; the USD
 * legs are the position's current values. Returns null for degenerate input.
 */
export function previewRepay(params: {
  side: PositionSide
  collateralUsd: number
  debtAmount: number
  debtUsd: number
  /** Current on-chain health factor (the value the row displays). */
  healthFactor: number
  /** Amount of the debt asset being repaid, human units. */
  repayAmount: number
  maintenanceMargin: number
  /** Current XLM/USD, the domain the liquidation price is quoted in. */
  price: number
}): {
  newDebtAmount: number
  newDebtUsd: number
  newHealthFactor: number
  newLiqPrice: number | null
  newEquityUsd: number
  /** True once the repayment clears the debt outright. */
  clearsDebt: boolean
} | null {
  const { side, collateralUsd, debtAmount, debtUsd, healthFactor, repayAmount, maintenanceMargin, price } = params
  if (!(debtAmount > 0) || !(debtUsd > 0) || !(repayAmount >= 0)) return null

  const repaid = Math.min(repayAmount, debtAmount)
  const newDebtAmount = Math.max(0, debtAmount - repaid)
  // Price the remaining debt off the position's own current debt price
  // (debtUsd/debtAmount) instead of re-deriving it — that keeps a Short's XLM
  // debt and a Long's USDT debt on one code path and on the same price the row
  // is already displaying.
  const newDebtUsd = (newDebtAmount / debtAmount) * debtUsd
  const clearsDebt = newDebtAmount <= 0

  return {
    newDebtAmount,
    newDebtUsd,
    newHealthFactor: clearsDebt ? 99 : Math.min(99, (healthFactor * debtUsd) / newDebtUsd),
    newLiqPrice: clearsDebt
      ? null
      : liquidationPrice({ side, collateralUsd, debtUsd: newDebtUsd, maintenanceMargin, price }),
    newEquityUsd: collateralUsd - newDebtUsd,
    clearsDebt,
  }
}

/**
 * Oracle floor for the V3 close swap (position collateral → debt asset),
 * mirroring the open-side floor in {@link computeBorrowAndFloor} but in the
 * opposite direction: `close_position_v3` requires `amount_with_slippage`
 * denominated in the DEBT asset and at least the oracle-derived minimum.
 * `positionUnderlying` is the full position-vault collateral in the position
 * asset's base units; prices are the raw `{num, den}` from `get_price_usd`.
 */
export function computeCloseFloor(params: {
  positionUnderlying: bigint
  positionPrice: PriceFrac
  debtPrice: PriceFrac
}): bigint {
  const { positionUnderlying, positionPrice, debtPrice } = params
  if (positionUnderlying <= BigInt(0)) return BigInt(0)
  return ceilMulDiv(
    positionUnderlying * positionPrice.num * debtPrice.den,
    SCALE - CFG.constants.MAX_SLIPPAGE_SCALED,
    positionPrice.den * debtPrice.num * SCALE,
  )
}

// ── Short close: buy the debt back, don't sell the whole margin ──────────────
//
// A Long and a Short close through DIFFERENT contract entrypoints, because the
// swaps are not mirror images of each other:
//
//   Long   swap_close_position_v3(user, id, min_out)
//          Sell ALL the XLM collateral for USDT. The size is implied — the
//          contract swaps whatever the withdraw produced — so the only argument
//          is the minimum acceptable output.
//
//   Short  swap_close_short_position_v3(user, id, swap_amount_in, min_debt_out)
//          Buy back exactly the XLM debt. The margin is USDT, and converting all
//          of it would sell the trader's own capital into XLM only to hand it
//          straight back. So the caller states how much USDT to spend, and the
//          rest stays USDT and returns to free margin.
//
// The frontend called the Long entrypoint for both. It is long-only by design and
// panics at the top for a Short — the empty inner-call trace we measured on
// positions 32 and 35, which read as "the pool trapped" and sent us hunting for a
// slippage cause that was never there.
//
// The two helpers below are the arithmetic that difference forces on us: how much
// XLM the swap must deliver, and how much USDT to put in to get it.

/** Interest buffer folded into a Short's `min_debt_out`, in bps.
 *
 *  The debt is read, then signed, then executed — and it accrues the whole way.
 *  A minimum set to exactly the debt read a moment ago is short by the interest
 *  of those few seconds, and the settlement that follows can't fully repay. 0.10%
 *  covers minutes of accrual at any rate this market has run. */
export const SHORT_CLOSE_DEBT_BUFFER_BPS = 10

/**
 * What the closing swap must deliver in the debt asset: the debt plus the
 * interest buffer, rounded up.
 *
 * Overshooting is free — everything past the debt is returned to free margin on
 * settlement — while undershooting costs a failed finish, so every rounding here
 * goes up.
 */
export function shortCloseDebtTarget(debt: bigint, bufferBps: number = SHORT_CLOSE_DEBT_BUFFER_BPS): bigint {
  if (debt <= BigInt(0)) return BigInt(0)
  const bps = BigInt(Math.max(0, Math.floor(bufferBps)))
  return debt + ceilMulDiv(debt, bps, BigInt(10_000))
}

/**
 * First estimate of the USDT input that buys `targetOut` of the debt asset,
 * interpolated from a single quote of the FULL collateral.
 *
 * Why one quote is enough to start: pool output is concave in input and passes
 * through the origin, so the straight line from (0, 0) to (collateral, quoted)
 * runs at or below the real curve. Reading that line backwards at `targetOut`
 * therefore names an input whose real output is at least the target — an
 * over-estimate, never an under-estimate, which is the safe direction (excess
 * collateral comes back; a short swap reverts).
 *
 * Concavity is a property of the pool, not a promise from us, so the caller still
 * verifies with a real quote before signing. This only saves the search from
 * starting blind.
 *
 * Returns null when the position genuinely cannot cover its debt — the full
 * collateral quotes below the target — which is the underwater case, not a
 * rounding problem.
 */
export function shortCloseSwapInput(params: {
  /** Collateral withdrawn for the close, base units of the position asset (USDT). */
  collateral: bigint
  /** What the pool quotes for swapping ALL of it, base units of the debt asset. */
  quoteAtCollateral: bigint
  /** Debt-asset amount the swap has to produce (see {@link shortCloseDebtTarget}). */
  targetOut: bigint
}): bigint | null {
  const { collateral, quoteAtCollateral, targetOut } = params
  if (collateral <= BigInt(0) || quoteAtCollateral <= BigInt(0) || targetOut <= BigInt(0)) return null
  if (quoteAtCollateral < targetOut) return null
  const input = ceilMulDiv(collateral, targetOut, quoteAtCollateral)
  // Ceil can land one stroop past the collateral when the target is the whole
  // quote; that is the "spend everything" case, not an overdraft.
  return input > collateral ? collateral : input
}

/**
 * Raise a swap input that quoted short of its target, by re-reading the same line
 * through the point the pool actually returned.
 *
 * Only reachable when the first estimate missed — the pool moved between quotes,
 * or its curve isn't as concave as assumed. `+1` guarantees forward progress so a
 * caller looping on this can't stall on a rounding fixpoint.
 *
 * Returns null when the required input exceeds the collateral: nothing left to
 * try, the position can't buy its debt back.
 */
export function bumpShortSwapInput(params: {
  input: bigint
  quotedOut: bigint
  targetOut: bigint
  collateral: bigint
}): bigint | null {
  const { input, quotedOut, targetOut, collateral } = params
  if (input <= BigInt(0) || quotedOut <= BigInt(0)) return null
  const next = ceilMulDiv(input, targetOut, quotedOut) + BigInt(1)
  if (next > collateral) return null
  return next
}

/**
 * The inverse of {@link shortCloseDebtTarget}: the largest debt whose close
 * target still fits inside a quote.
 *
 * Exists so "this close can't clear the floor" can be turned into "repay this
 * much first", which is the ONE lever a Short actually has. A Long in the same
 * spot can only wait for the pool; a Short can shrink the swap by shrinking the
 * debt, and the repay dialog is right there in the row.
 */
export function debtWithinQuote(
  quoted: bigint,
  bufferBps: number = SHORT_CLOSE_DEBT_BUFFER_BPS,
): bigint {
  if (quoted <= BigInt(0)) return BigInt(0)
  const bps = BigInt(Math.max(0, Math.floor(bufferBps)))
  return (quoted * BigInt(10_000)) / (BigInt(10_000) + bps)
}

export interface ShortCloseFloorVerdict {
  /** The swap the contract is about to run cannot clear its own floor. */
  blocked: boolean
  oracleMinOut: bigint
  /** How far the target sits under the floor, as a fraction of the floor. */
  shortfall: number
}

/**
 * Does a Short's closing swap clear the contract's minimum?
 *
 * The deployed `swap_close_short_position_v3` measures `amount_with_slippage`
 * against `oracle_min_out(collateral, debt, swap_amount_in)` — the ORACLE's view
 * of the input, minus MAX_SLIPPAGE — and a miss is a bare `panic!`, which reaches
 * the browser as `Error(WasmVm, InvalidAction)` with no reason attached.
 *
 * The Long path has always tested this before signing; the Short path never did,
 * because the Long test prices the WHOLE collateral and a Short only swaps the
 * part that buys its debt back. That asymmetry is real, but the answer was to
 * price the Short's own input, not to skip the test: every Short close whose
 * input broke the band signed anyway, trapped on chain, and left the trader with
 * a stranded pending and an unreadable error (positions 65 and 75 on testnet,
 * five attempts between 14 and 19 Aug).
 *
 * `oracleFloorActive` is what makes this survive the contract upgrade: once the
 * controller derives its close floor from the POOL quote (leveraged-fix,
 * 4a2733a), this floor no longer binds and testing it here would block closes the
 * contract would happily accept.
 */
export function shortCloseFloorVerdict(params: {
  /** The USDT the swap leg will spend — the contract's `swap_amount_in`. */
  swapInput: bigint
  /** The debt-asset minimum passed as `amount_with_slippage`. */
  targetOut: bigint
  positionPrice: PriceFrac
  debtPrice: PriceFrac
  /** False once the contract's floor comes from the pool quote. Default true. */
  oracleFloorActive?: boolean
}): ShortCloseFloorVerdict {
  const { swapInput, targetOut, positionPrice, debtPrice, oracleFloorActive = true } = params
  const clear = { blocked: false, oracleMinOut: BigInt(0), shortfall: 0 }
  if (!oracleFloorActive) return clear
  if (swapInput <= BigInt(0) || targetOut <= BigInt(0)) return clear

  const oracleMinOut = computeCloseFloor({
    positionUnderlying: swapInput,
    positionPrice,
    debtPrice,
  })
  if (oracleMinOut <= BigInt(0) || targetOut >= oracleMinOut) {
    return { blocked: false, oracleMinOut, shortfall: 0 }
  }
  return {
    blocked: true,
    oracleMinOut,
    shortfall: Number(oracleMinOut - targetOut) / Number(oracleMinOut),
  }
}

/**
 * Does a LONG's closing swap clear the contract's minimum?
 *
 * The Short's counterpart above prices the slice that buys the debt back; a Long
 * sells its whole collateral, so the floor is measured on all of it. Same rule,
 * the other swap — `close_position_v3` compares the pool's quote against
 * `oracle_min_out(collateral)` and refuses below it.
 *
 * The close flow expresses this inline through {@link resolveMinOut}, which is
 * correct there because it needs the minimum it is about to send. Callers that
 * only want the VERDICT — above all a pre-trade check, which has no transaction
 * to size — would otherwise have to rebuild the comparison from parts and get to
 * disagree with the flow about it.
 */
export function longCloseFloorVerdict(params: {
  /** Position asset the close will feed into the pool (a Long: all of it). */
  positionUnderlying: bigint
  /** What the pool quotes for exactly that input. */
  quotedOut: bigint
  positionPrice: PriceFrac
  debtPrice: PriceFrac
  /** False once the contract's floor comes from the pool quote. Default true. */
  oracleFloorActive?: boolean
}): ShortCloseFloorVerdict {
  const { positionUnderlying, quotedOut, positionPrice, debtPrice, oracleFloorActive = true } = params
  const clear = { blocked: false, oracleMinOut: BigInt(0), shortfall: 0 }
  if (!oracleFloorActive) return clear
  if (positionUnderlying <= BigInt(0) || quotedOut <= BigInt(0)) return clear

  const oracleMinOut = computeCloseFloor({ positionUnderlying, positionPrice, debtPrice })
  if (oracleMinOut <= BigInt(0) || quotedOut >= oracleMinOut) {
    return { blocked: false, oracleMinOut, shortfall: 0 }
  }
  return {
    blocked: true,
    oracleMinOut,
    shortfall: Number(oracleMinOut - quotedOut) / Number(oracleMinOut),
  }
}

/**
 * The largest size that still passes a test the asked-for size fails.
 *
 * Feasibility here is monotone in size and that is not an assumption — it is the
 * shape of the two curves. The contract's floor grows linearly with the amount
 * swapped while the pool's output is concave in it, so once a size misses the
 * band every larger size misses it by more. One crossover, therefore a
 * bisection, therefore a handful of probes rather than a scan.
 *
 * `0` means even the smallest probe failed: the pool is out of line at every
 * size and there is no number to name. Each step costs RPC round trips, so this
 * is for the path that has already decided to refuse — never for the happy one.
 */
export async function largestFeasibleSize(params: {
  /** The size that failed — the upper bound of the search. */
  hi: bigint
  feasible: (size: bigint) => Promise<boolean>
  steps?: number
  /** Fraction of `hi` to probe first. Below it we give up rather than keep halving. */
  floorDivisor?: bigint
}): Promise<bigint> {
  const { hi, feasible, steps = 5, floorDivisor = BigInt(32) } = params
  if (hi <= BigInt(0)) return BigInt(0)

  let lo = hi / floorDivisor
  if (lo <= BigInt(0) || !(await feasible(lo))) return BigInt(0)

  let high = hi
  for (let i = 0; i < steps; i++) {
    const mid = (lo + high) / BigInt(2)
    if (mid <= lo || mid >= high) break
    if (await feasible(mid)) lo = mid
    else high = mid
  }
  return lo
}

export type ShortCloseSizing =
  | { status: 'ok'; input: bigint; quoted: bigint }
  /** The full collateral quotes below the debt — nothing to size. */
  | { status: 'underwater' }
  /** The pool kept moving under the search. Transient, worth retrying. */
  | { status: 'unstable' }

/**
 * Solve for the USDT input that buys a Short's debt back, verifying the
 * interpolation against real quotes before anyone signs.
 *
 * Same ladder the close flow walks (first guess from one quote, then bump
 * through the point the pool actually returned), lifted here so the PRE-FLIGHT
 * can run it too. Without that, the only way to learn a close was doomed was to
 * sign `begin` + `withdraw` first and find out at the swap.
 */
export async function solveShortCloseInput(params: {
  collateral: bigint
  quoteAtCollateral: bigint
  targetOut: bigint
  quote: (input: bigint) => Promise<bigint>
  maxAttempts?: number
  refineSteps?: number
}): Promise<ShortCloseSizing> {
  const { collateral, quoteAtCollateral, targetOut, quote, maxAttempts = 4, refineSteps = 5 } = params
  let input = shortCloseSwapInput({ collateral, quoteAtCollateral, targetOut })
  if (input == null) return { status: 'underwater' }

  // Largest input we have PROVEN insufficient. The refinement below needs a
  // floor to bisect against, and every rejected ladder rung supplies one.
  let tooSmall = BigInt(0)
  let found: { input: bigint; quoted: bigint } | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const quoted = await quote(input)
    if (quoted >= targetOut) { found = { input, quoted }; break }
    tooSmall = input
    const next = bumpShortSwapInput({ input, quotedOut: quoted, targetOut, collateral })
    if (next == null) return { status: 'underwater' }
    input = next
  }
  if (!found) return { status: 'unstable' }

  // ── Shrink it ───────────────────────────────────────────────────────────────
  // The first guess interpolates a straight line under a concave curve, so it
  // always names MORE input than the swap needs — harmless when the only cost is
  // that the surplus comes back as remainder, but it is not the only cost. The
  // contract's floor, `oracle_min_out(collateral, debt, swap_amount_in)`, is
  // proportional to the input we pass: an inflated input raises the bar the very
  // same swap then has to clear, and a close that was comfortably inside the band
  // fails against a number we chose ourselves.
  //
  // So shrink it. Not by bisection — that spends a quote per halving and the
  // bracket starts wide — but by re-reading the same interpolation from the point
  // the pool just answered at: `input × target / quoted` is the secant through a
  // point ON the curve rather than through the origin, so it lands within a
  // fraction of a percent in one pass and converges from there. Every candidate
  // is still verified against a real quote, so the invariant the caller relies on
  // — quoted ≥ targetOut — holds for whatever comes back. `tooSmall` bounds the
  // search from below; a candidate that undershoots ends it rather than
  // ping-ponging.
  for (let i = 0; i < refineSteps; i++) {
    const candidate = ceilMulDiv(found.input, targetOut, found.quoted)
    if (candidate >= found.input || candidate <= tooSmall) break
    const quoted = await quote(candidate)
    if (quoted < targetOut) { tooSmall = candidate; break }
    found = { input: candidate, quoted }
  }
  return { status: 'ok', input: found.input, quoted: found.quoted }
}

/**
 * The largest debt this position could still close today.
 *
 * The floor grows linearly with the swap input while the pool's output is
 * concave in it, so "clears the floor" is true for small inputs and false past
 * one crossover — a bisection finds it in a handful of quotes. What comes back
 * is the debt the trader would have to be at, so the caller can name the repay
 * that gets them there.
 *
 * `0` means no size clears right now: the whole pool is trading outside the
 * band, and repaying wouldn't help. Only walked on the failure path — it costs
 * one RPC round trip per step.
 */
export async function maxClosableShortDebt(params: {
  collateral: bigint
  positionPrice: PriceFrac
  debtPrice: PriceFrac
  quote: (input: bigint) => Promise<bigint>
  steps?: number
}): Promise<bigint> {
  const { collateral, positionPrice, debtPrice, quote, steps = 7 } = params
  if (collateral <= BigInt(0)) return BigInt(0)

  // Deliberately STRICTER than the contract: clearing by 1 % rather than merely
  // clearing. A hint sized to the exact crossover is worthless — shrinking the
  // debt shrinks the swap input, which shrinks the oracle floor by the same
  // proportion, so the two move together and the margin never appears. Only a
  // band demanded up front survives re-solving the input, the stroop of rounding
  // that comes with it, and the pool moving between our advice and the repay.
  const clearsAt = async (input: bigint): Promise<{ quoted: bigint; floor: bigint } | null> => {
    if (input <= BigInt(0)) return null
    const quoted = await quote(input)
    const floor = computeCloseFloor({ positionUnderlying: input, positionPrice, debtPrice })
    return quoted * BigInt(100) >= floor * BigInt(101) ? { quoted, floor } : null
  }

  // A price impact this small is the pool's mid rate; if even that misses the
  // band, size is not the problem and there is nothing to bisect.
  let lo = collateral / BigInt(64)
  let best = await clearsAt(lo)
  if (best == null) return BigInt(0)

  let hi = collateral
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / BigInt(2)
    if (mid <= lo || mid >= hi) break
    const probe = await clearsAt(mid)
    if (probe == null) hi = mid
    else { lo = mid; best = probe }
  }

  // Size the answer off the FLOOR at that input, not off the quote.
  //
  // The quote is what the pool would hand over; the floor is what the contract
  // demands. A debt derived from the quote makes the close hinge on the solver
  // reproducing this exact input later — and it won't, quite, because it searches
  // for the minimum from above. Deriving it from the floor plus the same 1 % band
  // makes the hint hold for ANY input at or below `lo`, which is the whole family
  // the solver can return. Capped by the quote: we cannot ask the pool for more
  // than it pays at that size.
  const target = best.floor * BigInt(101) / BigInt(100)
  return debtWithinQuote(target < best.quoted ? target : best.quoted)
}

/**
 * Realized PnL (USD) for an XLM-denominated position, given entry/exit prices from
 * one coherent price domain. A Long gains as price rises, a Short as it falls.
 *
 * Net of borrow interest when `interestUsd` is supplied: closing repays the debt
 * *including* everything it accrued, so a price-only figure books a profit the
 * trader never received. Omitted → price-only (the pre-interest behaviour, kept
 * for callers with no debt basis to work from).
 *
 * Returns null when any input is missing. Pure → unit-tested, DB-free.
 */
export function computeRealizedPnl(params: {
  side: PositionSide | null
  entry: number | null
  exit: number | null
  xlmAmount: number | null
  /** Borrow interest paid over the position's life (USD). */
  interestUsd?: number | null
}): number | null {
  const { side, entry, exit, xlmAmount } = params
  if (entry == null || exit == null || xlmAmount == null || !side) return null
  const dir = side === "Long" ? 1 : -1
  const interest = params.interestUsd && params.interestUsd > 0 ? params.interestUsd : 0
  return (exit - entry) * xlmAmount * dir - interest
}

/**
 * The mirror of {@link executionEntryPrice} for the closing swap: what one XLM
 * actually fetched (Long) or cost to buy back (Short) when the position was
 * unwound.
 *
 * Without this the journal stamped the close at the FEED price
 * (`fetchXlmSpot()`), while the open row carried the pool fill — so realized PnL
 * was computed across two different price domains and a position opened and
 * closed in the same second booked a profit or loss it never made, equal to the
 * execution gap. Both rows now come from the pool.
 *
 *   Long  — sell the XLM collateral for USDT → USDT out / XLM in
 *   Short — spend the custodied USDT to buy the XLM debt back → USDT in / XLM out
 *
 * `positionUnderlying` is what the contract withdrew (the swap's input) and
 * `proceeds` what the pool quoted for it (its output), both in base units of
 * their own asset. Returns null rather than a wrong number on missing input.
 */
export function executionExitPrice(params: {
  side: PositionSide
  /** Swap input, base units of the position asset (Long: XLM, Short: USDT). */
  positionUnderlying: bigint
  /** Swap output, base units of the debt asset (Long: USDT, Short: XLM). */
  proceeds: bigint
  usdtDecimals: number
  xlmDecimals: number
}): number | null {
  const { side, positionUnderlying, proceeds, usdtDecimals, xlmDecimals } = params
  if (positionUnderlying <= BigInt(0) || proceeds <= BigInt(0)) return null
  const xlmRaw = side === "Long" ? positionUnderlying : proceeds
  const usdtRaw = side === "Long" ? proceeds : positionUnderlying
  const xlm = Number(xlmRaw) / 10 ** xlmDecimals
  const usdt = Number(usdtRaw) / 10 ** usdtDecimals
  if (!(xlm > 0) || !(usdt > 0)) return null
  return usdt / xlm
}

/** A year in milliseconds — the annualization base for the implied borrow rate. */
const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000

/**
 * Positions younger than this give a meaningless annualized rate: interest is
 * quantized on-chain, so dividing a few stroops by a few seconds of age explodes.
 * Below the floor we still report the exact accrued cost, just no % p.a.
 */
const MIN_AGE_FOR_APR_MS = 15 * 60 * 1000

/**
 * Borrow interest accrued on an open position, in USD.
 *
 * The on-chain debt (`get_margin_borrow_balance`) already carries accrued interest,
 * so the exact cost is simply how far it has drifted above what was originally
 * borrowed (recorded in the journal at open). No rate model needed.
 *
 * `aprPct` annualizes that drift over the position's age — the "funding rate" the
 * trader is actually paying. Null when we can't say honestly: no recorded borrow,
 * or the position is too young for the figure to mean anything.
 */
export function computeBorrowInterest(params: {
  /** Current on-chain debt, interest included (debt-asset units). */
  debtAmount: number | null
  /** Debt drawn at open, from the journal (debt-asset units). */
  borrowAtOpen: number | null | undefined
  /** USD price of the debt asset — XLM for a Short, ~1 for a USDT Long. */
  debtPriceUsd: number | null
  openedAtMs: number | null | undefined
  nowMs: number
}): { interestUsd: number; aprPct: number | null } | null {
  const { debtAmount, borrowAtOpen, debtPriceUsd, openedAtMs, nowMs } = params
  if (debtAmount == null || borrowAtOpen == null || debtPriceUsd == null) return null
  if (!(borrowAtOpen > 0) || !(debtPriceUsd > 0)) return null

  // Clamp at zero: debt can only grow from interest, so a negative drift means a
  // partial repayment or a stale journal row — not a rebate.
  const accrued = Math.max(0, debtAmount - borrowAtOpen)
  const interestUsd = accrued * debtPriceUsd

  const ageMs = openedAtMs != null ? nowMs - openedAtMs : 0
  const aprPct =
    ageMs >= MIN_AGE_FOR_APR_MS
      ? (accrued / borrowAtOpen) * (MS_PER_YEAR / ageMs) * 100
      : null

  return { interestUsd, aprPct }
}

/**
 * Live (unrealized) PnL for an open XLM-denominated position — same sign rules as
 * {@link computeRealizedPnl}, but priced against the current feed instead of an
 * exit. Returns null when any input is missing/degenerate. Pure → unit-testable.
 *
 *   pnlUsd — what the trader actually keeps: the price move on the XLM exposure
 *            MINUS the borrow interest accrued so far. Leveraged positions pay to
 *            hold their debt, so a price-only figure overstates the profit.
 *   grossPnlUsd — the price move alone, before interest.
 *   interestUsd — the borrow cost already subtracted, for an itemized display.
 *   roe    — return on the trader's own equity (margin), i.e. the ×leverage figure
 *            that makes a 2% move read as +10% at 5×. Derived side-agnostically
 *            from notional/leverage: equity = |xlmAmount·entry| / leverage.
 *   pricePct — the raw underlying price move (no leverage), for an honest subline.
 */
export function computeUnrealizedPnl(params: {
  side: PositionSide | null
  entry: number | null
  current: number | null
  xlmAmount: number | null
  leverage: number | null
  /** Borrow interest accrued so far (USD). Omitted/0 → price-only PnL. */
  interestUsd?: number | null
}): { pnlUsd: number; grossPnlUsd: number; interestUsd: number; roe: number; pricePct: number } | null {
  const { side, entry, current, xlmAmount, leverage } = params
  if (entry == null || current == null || xlmAmount == null || !side) return null
  if (!(entry > 0) || !(xlmAmount > 0)) return null
  const dir = side === "Long" ? 1 : -1
  const grossPnlUsd = (current - entry) * xlmAmount * dir
  const interestUsd = params.interestUsd && params.interestUsd > 0 ? params.interestUsd : 0
  const pnlUsd = grossPnlUsd - interestUsd
  const pricePct = ((current - entry) / entry) * 100 * dir
  const lev = leverage && leverage > 0 ? leverage : 1
  const entryEquity = (xlmAmount * entry) / lev
  const roe = entryEquity > 0 ? (pnlUsd / entryEquity) * 100 : 0
  return { pnlUsd, grossPnlUsd, interestUsd, roe, pricePct }
}

/**
 * Decide whether a live price has crossed a position's take-profit or stop-loss.
 * Drives the client-side TP/SL monitor. Pure → unit-tested, no chain/React.
 *
 *   Long  → TP fires at price ≥ tp, SL fires at price ≤ sl
 *   Short → TP fires at price ≤ tp, SL fires at price ≥ sl
 *
 * TP wins if (degenerately) both conditions hold. Returns null when nothing fires
 * or the price is non-positive.
 */
/**
 * Validate a take-profit / stop-loss draft against the live mark, and resolve it
 * into the trigger prices that get persisted.
 *
 * One implementation for both places a trader can set triggers — the open panel
 * and the edit popover — because they used to disagree in the way that matters.
 * The popover refused to save an enabled-but-invalid row (writing `null` there
 * would erase a stored stop-loss the user believes in); the open panel dropped it
 * silently and opened the position unprotected. Neither behaviour is a detail of
 * the surface it lives on, so the rule lives here.
 *
 * Three things make a draft unusable:
 *
 *   - No live mark. The fallback is the oracle, flat $1 on testnet, so a trigger
 *     computed against it is either unreachable or wrong-sided by construction.
 *   - A trigger on the wrong side of the anchor (see `tpSlAnchors`). It would fire
 *     on the first tick after arming, which is not a stop-loss, it is an instant
 *     close.
 *   - A trigger technically on the right side but sitting on top of the anchor.
 *     Ordinary tick noise carries the price through it within seconds, so what
 *     the trader gets is a round trip and two sets of fees, not protection.
 *
 * A stop-loss beyond the liquidation price is NOT refused here: it is a worse
 * trade, not an impossible one, and the inline preview flags it. Refusing it
 * would also make an already-open position's stored levels unsavable whenever
 * liquidation drifted past them.
 */
export interface TpSlTriggers {
  takeProfit: number | null
  stopLoss: number | null
}

export interface TpSlDraft {
  tpEnabled: boolean
  slEnabled: boolean
  /** As typed — an empty or unparseable field is "not set", never 0. */
  tpPrice: string | number
  slPrice: string | number
}

export type TpSlValidation =
  | { ok: true; error?: undefined; triggers: TpSlTriggers }
  | { ok: false; error: string; triggers?: undefined }

/**
 * Minimum distance between a trigger and its anchor, in percent.
 *
 * XLM moves this much on ordinary noise within seconds, so a trigger inside the
 * band is not protection — it is a scheduled round trip. 0.5% is deliberately
 * modest: it rules out the accidental (a stop-loss two ticks under spot, a
 * take-profit dragged onto the price by a chip) without touching any trade a
 * human would deliberately compose.
 */
export const MIN_TRIGGER_DISTANCE_PCT = 0.5

/**
 * How a trigger price is written wherever the trader can compare two of them.
 *
 * XLM trades around $0.16, where a fourth decimal is worth ~0.06% and a rejected
 * order can hinge on it. The input field wrote five decimals, the order summary
 * four and these error messages four, so one chosen stop-loss appeared as
 * `0.14409`, `$0.1441` and `$0.1441` in three places the eye moves between — and
 * the summary, the last word before committing, was the one that disagreed with
 * the field. Worse in the messages: "must be above $0.1802" quoted a rounded-DOWN
 * exclusive bound, so typing back the number the app had just named was refused.
 *
 * One formatter for all three. Above $1 the fifth decimal is noise, so it keeps
 * the four it always had.
 */
export function formatTriggerPrice(price: number): string {
  return price >= 1 ? price.toFixed(4) : price.toFixed(5)
}

export interface TpSlAnchors {
  /** Price a take-profit must clear, and the floor including the safety band. */
  tpAnchor: number
  tpFloor: number
  /** Same for a stop-loss. */
  slAnchor: number
  slFloor: number
  /** True when the fill price, not the mark, is what the trigger has to beat. */
  usesFill: boolean
}

/**
 * The prices a trigger is measured against.
 *
 * The mark is not the whole story, because the trader does not get the mark: the
 * pool fills the order at its own price, and at size the two are a percent or
 * more apart. Validated against the mark alone, a long take-profit set just above
 * spot can sit BELOW what the trader actually paid — it is labelled take-profit
 * and books a loss when it fires. So each row is anchored on whichever of the two
 * prices is the more demanding in that row's direction:
 *
 *   Long  — TP must clear max(mark, fill); SL must sit under min(mark, fill)
 *   Short — TP must undercut min(mark, fill); SL must sit over max(mark, fill)
 *
 * With no fill quote (the edit popover, or before a size is entered) both anchors
 * collapse back onto the mark and this is the old rule exactly.
 */
export function tpSlAnchors(params: {
  side: PositionSide
  mark: number
  /** Expected fill from the live pool quote, when one is available. */
  fillPrice?: number | null
  minDistancePct?: number
}): TpSlAnchors {
  const { side, mark } = params
  const minPct = params.minDistancePct ?? MIN_TRIGGER_DISTANCE_PCT
  const fill = params.fillPrice && params.fillPrice > 0 ? params.fillPrice : null
  const isLong = side === "Long"
  const tpAnchor = fill == null ? mark : isLong ? Math.max(mark, fill) : Math.min(mark, fill)
  const slAnchor = fill == null ? mark : isLong ? Math.min(mark, fill) : Math.max(mark, fill)
  const band = minPct / 100
  return {
    tpAnchor,
    tpFloor: isLong ? tpAnchor * (1 + band) : tpAnchor * (1 - band),
    slAnchor,
    slFloor: isLong ? slAnchor * (1 - band) : slAnchor * (1 + band),
    usesFill: fill != null && (fill !== mark),
  }
}

export function validateTpSlDraft(params: {
  side: PositionSide
  /** Live mark (XLM/USD) the triggers are measured against. */
  mark: number
  /** False when `mark` is the oracle fallback rather than the feed. */
  markIsLive?: boolean
  /** Expected fill price from the pool quote — see `tpSlAnchors`. */
  fillPrice?: number | null
  /** Override the safety band; defaults to MIN_TRIGGER_DISTANCE_PCT. */
  minDistancePct?: number
  draft: TpSlDraft
}): TpSlValidation {
  const { side, mark, markIsLive = true, draft } = params
  const none = { takeProfit: null, stopLoss: null }
  if (!draft.tpEnabled && !draft.slEnabled) return { ok: true, triggers: none }
  if (!markIsLive || !(mark > 0)) {
    return { ok: false, error: "Waiting for the live XLM price — your take-profit and stop-loss can’t be set against it yet." }
  }

  const isLong = side === "Long"
  const minPct = params.minDistancePct ?? MIN_TRIGGER_DISTANCE_PCT
  const { tpAnchor, tpFloor, slAnchor, slFloor, usesFill } = tpSlAnchors({
    side, mark, fillPrice: params.fillPrice, minDistancePct: minPct,
  })
  const tp = typeof draft.tpPrice === "number" ? draft.tpPrice : parseFloat(draft.tpPrice) || 0
  const sl = typeof draft.slPrice === "number" ? draft.slPrice : parseFloat(draft.slPrice) || 0
  const at = (p: number) => `$${formatTriggerPrice(p)}`
  // Naming the anchor as "the current price" when it is the fill would be a lie
  // the trader can catch: it doesn't match the price on the chart above it.
  const of = (anchor: number) =>
    usesFill && anchor !== mark ? `${at(anchor)} — the price your trade actually fills at` : `the current price of ${at(anchor)}`

  if (draft.tpEnabled) {
    if (!(tp > 0)) return { ok: false, error: "Enter a take-profit price, or switch take-profit off." }
    if (isLong ? tp <= tpAnchor : tp >= tpAnchor) {
      // Name the price that WORKS, not the one that doesn't. Quoting the bare
      // anchor sent the trader on a second lap: they typed a hair past it and
      // hit the minimum-distance rule with a different message and a different
      // number. The floor satisfies both rules at once.
      return {
        ok: false,
        error: `Take-profit must be ${isLong ? "above" : "below"} ${of(tpAnchor)} — set it to ${at(tpFloor)} or ${isLong ? "higher" : "lower"}.`,
      }
    }
    if (isLong ? tp < tpFloor : tp > tpFloor) {
      return { ok: false, error: `Take-profit is too close to the price — leave at least ${minPct}% (${at(tpFloor)}), or it closes again almost immediately.` }
    }
  }
  if (draft.slEnabled) {
    if (!(sl > 0)) return { ok: false, error: "Enter a stop-loss price, or switch stop-loss off." }
    if (isLong ? sl >= slAnchor : sl <= slAnchor) {
      return {
        ok: false,
        error: `Stop-loss must be ${isLong ? "below" : "above"} ${of(slAnchor)} — set it to ${at(slFloor)} or ${isLong ? "lower" : "higher"}.`,
      }
    }
    if (isLong ? sl > slFloor : sl < slFloor) {
      return { ok: false, error: `Stop-loss is too close to the price — leave at least ${minPct}% (${at(slFloor)}), or ordinary movement closes your position.` }
    }
  }
  return {
    ok: true,
    triggers: {
      takeProfit: draft.tpEnabled ? tp : null,
      stopLoss: draft.slEnabled ? sl : null,
    },
  }
}

export function evaluateTpSlTrigger(params: {
  side: PositionSide
  takeProfit: number | null | undefined
  stopLoss: number | null | undefined
  price: number
}): "tp" | "sl" | null {
  const { side, takeProfit, stopLoss, price } = params
  if (!(price > 0)) return null
  const isLong = side === "Long"
  if (takeProfit != null && takeProfit > 0 && (isLong ? price >= takeProfit : price <= takeProfit)) return "tp"
  if (stopLoss != null && stopLoss > 0 && (isLong ? price <= stopLoss : price >= stopLoss)) return "sl"
  return null
}

/**
 * How much of a close's finish-shortfall may be auto-repaid from the wallet, or
 * null when the gap is too big to be interest dust.
 *
 * `finish_close_position_v3` repays the debt out of what the closing swap put in
 * the controller. Interest accruing between the two transactions can leave that a
 * hair short, which is recoverable: repay the delta from the wallet and retry. A
 * LARGE gap is not dust — it is slippage or an underwater position — and must not
 * be pulled from the wallet silently, so it is refused here and left to the
 * banner's explicit "Repay" dialog, where the trader sees the amount first.
 *
 * `proceeds` is what the swap delivered: the guaranteed min-out on the path that
 * ran the swap, the pending's recorded `received_debt_asset` on the recovery path.
 * Some deployed contracts report that as a bare boolean, so a swap that delivered
 * in full decodes as 0 — treated as "unknown" rather than "delivered nothing",
 * since the latter would refuse every ordinary dust repay. The cap binds either
 * way, so an unknown shortfall can still never drain a wallet.
 *
 * Returns the amount to repay (already capped by the wallet balance), 0n when the
 * wallet is empty, or null when this isn't dust at all.
 */
export function dustRepayAmount(params: {
  freshDebt: bigint
  proceeds: bigint
  walletBalance: bigint
  /** Shortfall allowance as a fraction of the debt, in bps. */
  maxDustBps: number
}): bigint | null {
  const { freshDebt, proceeds, walletBalance, maxDustBps } = params
  if (freshDebt <= BigInt(0)) return null
  const cap = (freshDebt * BigInt(maxDustBps)) / BigInt(10_000)
  const shortfall = proceeds > BigInt(0)
    ? (freshDebt > proceeds ? freshDebt - proceeds : BigInt(0))
    : cap
  if (shortfall <= BigInt(0)) return null
  if (shortfall > cap) return null
  const repay = walletBalance < shortfall ? walletBalance : shortfall
  return repay > BigInt(0) ? repay : BigInt(0)
}

/**
 * Reconstruct the leverage a pending open was placed at, from its on-chain legs.
 *
 * Used for the journal row a banner-resumed trade writes — the resume path has no
 * memory of what the trader picked. Margin is always USDT; what the pending
 * BORROWED is not symmetric, and neither is how it relates to the notional:
 *
 *   Long  — borrows USDT, notional = margin + borrow  → lev = (m + b) / m
 *   Short — borrows the whole notional in XLM         → lev = b / m
 *
 * Adding the two raw amounts works only for a Long, where both legs are the same
 * asset with the same decimals. A Short adds XLM stroops to USDT units: at ~$0.19
 * per XLM a 5× short reconstructs as roughly 26×, and since the positions table
 * and History both prefer the RECORDED leverage over the derived one, that number
 * becomes the badge — on a platform capped at 5×. Price the legs instead.
 *
 * Returns undefined rather than a guess when an input is missing or degenerate;
 * the table then falls back to its own derived figure, which is at least in the
 * right order of magnitude.
 */
export function reconstructLeverage(params: {
  side: PositionSide
  marginRaw: bigint
  borrowRaw: bigint
  usdtDecimals: number
  xlmDecimals: number
  /** Oracle USD price of the margin asset. Only needed for a Short. */
  usdtPriceUsd?: number | null
  /** Oracle USD price of XLM. Only needed for a Short. */
  xlmPriceUsd?: number | null
}): number | undefined {
  const { side, marginRaw, borrowRaw, usdtDecimals, xlmDecimals } = params
  if (marginRaw <= BigInt(0) || borrowRaw <= BigInt(0)) return undefined
  const marginUnits = Number(marginRaw) / 10 ** usdtDecimals
  if (!(marginUnits > 0)) return undefined

  // A Long's borrow is USDT, same unit as the margin — no oracle needed.
  if (side === "Long") {
    const lev = (marginUnits + Number(borrowRaw) / 10 ** usdtDecimals) / marginUnits
    return Number.isFinite(lev) && lev > 0 ? lev : undefined
  }

  const { usdtPriceUsd, xlmPriceUsd } = params
  if (!usdtPriceUsd || !xlmPriceUsd || !(usdtPriceUsd > 0) || !(xlmPriceUsd > 0)) return undefined
  const marginUsd = marginUnits * usdtPriceUsd
  const borrowUsd = (Number(borrowRaw) / 10 ** xlmDecimals) * xlmPriceUsd
  if (!(marginUsd > 0)) return undefined
  const lev = borrowUsd / marginUsd
  return Number.isFinite(lev) && lev > 0 ? lev : undefined
}

/**
 * What a debt of zero means for a position the user just asked to close.
 *
 * Not the tautology it looks like. The close flow used to treat "this position
 * owes nothing" as "this position is finished": mark success, write a close row
 * into the trade journal, drop it from the UI. Two unrelated states produce that
 * zero.
 *
 *   Closed elsewhere — the TP/SL keeper got there first. Genuinely over, and the
 *     journal row matters: the contract keeps no history, so without it the
 *     trade leaves Positions having never appeared in History.
 *
 *   Debt-free but open — the trader repaid the whole debt from their wallet. The
 *     repay dialog offers exactly this and promises it explicitly: the position
 *     "can no longer be liquidated" and the collateral "stays in it until you
 *     close". Shortcutting here booked a close that never happened AND left the
 *     collateral sitting in the position, which is the opposite of what the
 *     button was pressed for.
 *
 * The position's own status tells them apart, so it is asked rather than
 * inferred from the number. An unreadable status (null) is treated as closed —
 * that matches the pre-existing behaviour, and the reads behind it throw on
 * transport failure now rather than quietly returning nothing.
 */
export type ZeroDebtVerdict = "already-closed" | "close-anyway"

export function zeroDebtVerdict(status: string | null | undefined): ZeroDebtVerdict {
  return status === "Open" ? "close-anyway" : "already-closed"
}

/**
 * The bottom line of the History tab.
 *
 * The tab listed every closed trade and never added them up, so the one question
 * a trader has about their own record — am I up? — was theirs to answer with a
 * calculator. Everything here comes from rows the journal already returns.
 *
 * Two rules worth stating, because both are visible in the numbers:
 *
 *   Rounded before judged. A realized PnL of -0.004 renders as "$0.00" in the
 *   table; counting it as a loss would print a losing trade the same table shows
 *   as flat. Cents are the resolution the tab displays, so cents are the
 *   resolution it counts in.
 *
 *   A missing PnL is skipped, not zeroed. Rows without an entry price carry no
 *   realized figure (see the panel's "no recorded entry" case), and folding them
 *   in as break-even would quietly drag the average toward zero and inflate the
 *   trade count. They are reported separately instead, so the summary can say
 *   what it left out.
 */
export interface ClosedTradeStat {
  realizedPnlUsd?: number | null
  openedAt?: string | number | null
  closedAt?: string | number | null
}

export interface ClosedTradeSummary {
  /** Trades that carried a realized PnL — the denominator of everything below. */
  counted: number
  /** Trades with no realized PnL, excluded from every figure here. */
  skipped: number
  totalPnlUsd: number
  wins: number
  losses: number
  /** wins / (wins + losses); null when nothing resolved either way. */
  winRate: number | null
  best: number | null
  worst: number | null
  /** Mean time held, over the trades that recorded an open time. */
  avgHoldMs: number | null
}

export function summarizeClosedTrades(rows: ClosedTradeStat[]): ClosedTradeSummary {
  let counted = 0, skipped = 0, total = 0, wins = 0, losses = 0
  let best: number | null = null
  let worst: number | null = null
  let holdSum = 0, holdCount = 0

  for (const r of rows) {
    const raw = r.realizedPnlUsd
    if (raw == null || !Number.isFinite(raw)) { skipped++; continue }
    const pnl = Math.round(raw * 100) / 100
    counted++
    total += pnl
    if (pnl > 0) wins++
    else if (pnl < 0) losses++
    if (best == null || pnl > best) best = pnl
    if (worst == null || pnl < worst) worst = pnl

    const opened = r.openedAt != null ? new Date(r.openedAt).getTime() : NaN
    const closed = r.closedAt != null ? new Date(r.closedAt).getTime() : NaN
    if (Number.isFinite(opened) && Number.isFinite(closed) && closed > opened) {
      holdSum += closed - opened
      holdCount++
    }
  }

  return {
    counted, skipped,
    totalPnlUsd: Math.round(total * 100) / 100,
    wins, losses,
    winRate: wins + losses > 0 ? wins / (wins + losses) : null,
    best, worst,
    avgHoldMs: holdCount > 0 ? holdSum / holdCount : null,
  }
}

/**
 * The same closed trades as a spreadsheet.
 *
 * The shape of the ask is the reason this is a pure function rather than three lines next to the button: what
 * matters is that the file says exactly what the table says, which is a thing a
 * test can hold to.
 *
 * ISO timestamps, not the table's "3h ago" — a relative label is unreadable a
 * week later and unsortable in any spreadsheet. Empty cells for missing values,
 * never a zero: a trade with no recorded entry has no PnL, and writing 0.00 into
 * that cell would put a number into a sum that has no business being there.
 */
export function closedTradesCsv(
  rows: Array<ClosedTradeStat & {
    positionId?: string
    side?: string | null
    leverageX100?: number | null
    xlmAmount?: number | null
    entryPriceUsd?: number | null
    exitPriceUsd?: number | null
    txHash?: string | null
  }>,
): string {
  const header = ['Closed at', 'Side', 'Leverage', 'Size (XLM)', 'Entry (USD)', 'Exit (USD)', 'Realized PnL (USD)', 'Position ID', 'Tx hash']
  const iso = (v: string | number | null | undefined) => {
    if (v == null) return ''
    const t = new Date(v).getTime()
    return Number.isFinite(t) ? new Date(t).toISOString() : ''
  }
  const num = (v: number | null | undefined, dp: number) => (v == null || !Number.isFinite(v) ? '' : v.toFixed(dp))
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

  const lines = [header.map(cell).join(',')]
  for (const r of rows) {
    lines.push([
      iso(r.closedAt),
      r.side ?? '',
      r.leverageX100 != null ? `${(r.leverageX100 / 100).toFixed(1)}x` : '',
      num(r.xlmAmount, 4),
      num(r.entryPriceUsd, 6),
      num(r.exitPriceUsd, 6),
      num(r.realizedPnlUsd, 2),
      r.positionId ?? '',
      r.txHash ?? '',
    ].map(cell).join(','))
  }
  return lines.join('\n')
}

/**
 * The open book in one line — what a trader needs while looking at something
 * else.
 *
 * On a phone the positions table is two screens below the order form, so once a
 * trade is placed it leaves the viewport and the trader is left with a chart and
 * no idea where they stand. This is what the sticky bar shows.
 *
 * It is deliberately the SAME arithmetic as the positions table, down to the
 * partial-repayment adjustment: a bar that disagreed with the table it links to
 * would be worse than no bar. It is not shared code with that table because the
 * table needs the per-row maps (entry, mark, funding, each row's own PnL) and
 * this needs one number — but both are `computeBorrowInterest` →
 * `computeUnrealizedPnl` over the same inputs, so they agree by construction.
 *
 * `anyPnl` matters as much as the total: no position has a PnL until its entry
 * price and pool mark are both known, and 0 is a claim ("you're flat") that
 * "we don't know yet" is not.
 */
export function summarizeOpenPositions(params: {
  positions: Array<{
    id: string
    side: PositionSide | null
    collateralAmount: number
    debtAmount: number
    debtSymbol: string
    leverage: number
    healthFactor: number
    healthUnknown?: boolean
  }>
  entryPrices?: Record<string, number>
  markPrices?: Record<string, number>
  debtBasis?: Record<string, { borrowAmount: number; openedAtMs: number }>
  repayAdjust?: Record<string, { realizedUsd: number; xlmRetired: number }>
  /** Live XLM price, for pricing a Short's XLM-denominated debt. */
  xlmPrice: number
  nowMs: number
}): { count: number; totalPnlUsd: number; anyPnl: boolean; worstHealth: number | null } {
  const { positions, entryPrices, markPrices, debtBasis, repayAdjust, xlmPrice, nowMs } = params
  let totalPnlUsd = 0
  let anyPnl = false
  let worstHealth: number | null = null

  for (const p of positions) {
    // An unreadable health is not a healthy one, but it is also not a number to
    // rank positions by — leave it out rather than let a transient oracle gap
    // paint the bar red.
    if (!p.healthUnknown && Number.isFinite(p.healthFactor)) {
      if (worstHealth == null || p.healthFactor < worstHealth) worstHealth = p.healthFactor
    }

    const entry = entryPrices?.[p.id] ?? null
    const mark = markPrices?.[p.id] ?? null
    const basis = debtBasis?.[p.id]
    const funding = computeBorrowInterest({
      debtAmount: p.debtAmount,
      borrowAtOpen: basis?.borrowAmount,
      debtPriceUsd: p.debtSymbol === "XLM" ? xlmPrice : 1,
      openedAtMs: basis?.openedAtMs,
      nowMs,
    })
    const live = computeUnrealizedPnl({
      side: p.side,
      entry,
      current: mark,
      xlmAmount: p.side === "Long" ? p.collateralAmount : p.debtAmount,
      leverage: p.leverage,
      interestUsd: funding?.interestUsd,
    })
    if (!live) continue

    const adj = repayAdjust?.[p.id]
    totalPnlUsd += live.pnlUsd + (adj?.realizedUsd ?? 0)
    anyPnl = true
  }

  return { count: positions.length, totalPnlUsd, anyPnl, worstHealth }
}

// ── Limit orders (entry at a chosen price) ─────────────────────────────────

/**
 * A limit order rests until the market comes to it, then opens the trade:
 *
 *   Long  — "buy the dip": fires when the mark falls TO or BELOW the limit.
 *   Short — "sell the rip": fires when the mark rises TO or ABOVE the limit.
 *
 * So a Long limit must sit below the current mark and a Short limit above it —
 * an order on the wrong side of the market would fire on the very next tick,
 * which is a market order the trader didn't ask for.
 */
export interface LimitOrderValidation {
  ok: boolean
  error?: string
  limitPrice?: number
}

/** Below this distance from the mark a limit is a market order in disguise. */
export const MIN_LIMIT_DISTANCE_PCT = 0.1

export function validateLimitOrderDraft(params: {
  side: PositionSide
  mark: number
  markIsLive?: boolean
  /** Raw text from the input. */
  limitPrice: string
}): LimitOrderValidation {
  const { side, mark, markIsLive = true } = params
  const price = parseFloat(params.limitPrice)
  if (!(price > 0)) return { ok: false, error: "Enter the price your order should fill at." }
  if (!markIsLive || !(mark > 0)) return { ok: false, error: "Waiting for a live price before a limit can be set." }
  const isLong = side === "Long"
  const minGap = mark * (MIN_LIMIT_DISTANCE_PCT / 100)
  if (isLong && price > mark - minGap) {
    return { ok: false, error: `A Long limit fills when XLM drops to it — set it below $${formatTriggerPrice(mark)}.` }
  }
  if (!isLong && price < mark + minGap) {
    return { ok: false, error: `A Short limit fills when XLM rises to it — set it above $${formatTriggerPrice(mark)}.` }
  }
  return { ok: true, limitPrice: price }
}

/** True when the mark has reached the order's limit (see validateLimitOrderDraft). */
export function evaluateLimitOrderTrigger(params: {
  side: PositionSide
  limitPrice: number
  price: number
}): boolean {
  const { side, limitPrice, price } = params
  if (!(price > 0) || !(limitPrice > 0)) return false
  return side === "Long" ? price <= limitPrice : price >= limitPrice
}
