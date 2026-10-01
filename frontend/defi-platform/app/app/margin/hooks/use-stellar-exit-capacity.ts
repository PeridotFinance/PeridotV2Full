'use client'

/**
 * Could this trade be closed again?
 *
 * The open panel has always checked whether an order can be OPENED — the
 * oracle-band pre-check in `use-stellar-margin-open`. Nothing checked whether it
 * could be got out of, and on this pool those are different questions. Measured
 * live on 20 Aug 2026 (scripts/margin-probe-exit-capacity.ts):
 *
 *   Long  5× · 250 USDT — opens, closes (quote 102.0 % of the floor)
 *   Long  5× · 500 USDT — OPENS, and cannot be closed (100.0 %, i.e. under it)
 *   Long  2× · 1000 USDT — opens, closes with 0.8 % to spare
 *
 * A trader who takes the second one meets the problem from inside the position,
 * as a close that refuses with "too large to close in one go right now" — a
 * message that is true, actionable for a Short (repay some debt) and nearly
 * dead-ended for a Long (wait for the pool). The size was the decision; the size
 * is where this belongs.
 *
 * The asymmetry that makes this possible: opening pushes the pool one way and
 * closing pushes it back the other, both at a cost, while the contract's floor
 * is priced off the oracle and does not care what the pool did in between. Big
 * enough, and the round trip costs more than the band allows.
 *
 * ── What it does ────────────────────────────────────────────────────────────
 * Projects the position this order would create — the same `computeBorrowAndFloor`
 * sizing the open flow uses, then the real pool quote for the opening swap — and
 * runs the close-side floor test the contract applies, per side:
 *
 *   Long   sell the whole XLM position back → `longCloseFloorVerdict`
 *   Short  buy the XLM debt back with part of the USDT → solve the input, then
 *          `shortCloseFloorVerdict` (the same solver the close flow signs from)
 *
 * When that fails, it bisects for the largest collateral that would clear at this
 * leverage, so the panel can offer a size instead of only a refusal.
 *
 * ── What it deliberately doesn't do ─────────────────────────────────────────
 * Block the trade. The pool moves, the floor binds only while the deployed
 * controller prices closes off the oracle (`controllerUsesPoolCloseFloor` — the
 * newer build derives the floor from the pool quote and this whole check falls
 * silent), and a trader who understands the trap may still want the position.
 * It warns, names the size that works, and offers one tap to take it.
 *
 * It also does not share the execution-quote hook's reads, though it repeats
 * three of them. Quoting the CLOSE is several round trips on its own and gets a
 * longer debounce for it; welding the two together would put that cost behind
 * every keystroke of the fill-price row, which updates far more often and is
 * needed far sooner.
 */
import { useEffect, useRef, useState } from 'react'
import {
  vaultGetExchangeRate,
  getPriceUsd,
  estimatePoolSwap,
  controllerUsesPoolCloseFloor,
} from '@/lib/stellar-margin'
import { STELLAR_MARGIN_CONFIG as CFG, SIDE_MAPPING, type PositionSide } from '../config/stellarMarginConfig'
import {
  computeBorrowAndFloor,
  longCloseFloorVerdict,
  shortCloseFloorVerdict,
  shortCloseDebtTarget,
  solveShortCloseInput,
  largestFeasibleSize,
} from '../lib/marginMath'

/** Longer than the fill-price quote's 450ms: this costs several round trips. */
const DEBOUNCE_MS = 900

export type ExitCapacity =
  /** Nothing to say — no size entered, disabled, or the check hasn't run. */
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok' }
  /**
   * The position this order creates could not be closed at the moment it opens.
   * `maxCollateral` is the largest collateral that would clear at this leverage,
   * in USDT, or null when no size does.
   */
  | { status: 'blocked'; shortfall: number; maxCollateral: number | null }

export function useStellarExitCapacity(params: {
  side: PositionSide
  /** Collateral in USDT (human units). Zero disables the check. */
  collateral: number
  leverage: number
  enabled?: boolean
}): ExitCapacity {
  const { side, collateral, leverage, enabled = true } = params
  const [state, setState] = useState<ExitCapacity>({ status: 'idle' })
  const runIdRef = useRef(0)

  useEffect(() => {
    if (!enabled || !(collateral > 0) || !(leverage > 0)) {
      setState({ status: 'idle' })
      return
    }
    const runId = ++runIdRef.current
    let cancelled = false
    const live = () => !cancelled && runId === runIdRef.current

    const timer = setTimeout(async () => {
      if (live()) setState({ status: 'checking' })
      try {
        // The floor this whole check is about may not be the contract's rule any
        // more. Cached, so asking costs nothing after the first time.
        if (await controllerUsesPoolCloseFloor()) {
          if (live()) setState({ status: 'ok' })
          return
        }

        const usdt = CFG.assets.MOCK_USDT
        const [rate, usdtPrice, xlmPrice] = await Promise.all([
          vaultGetExchangeRate(usdt.vault),
          getPriceUsd(usdt.token),
          getPriceUsd(CFG.assets.XLM.token),
        ])
        if (!usdtPrice || !xlmPrice) throw new Error('price unavailable')

        const collateralPrice = { num: usdtPrice.price, den: usdtPrice.scale }
        // At CLOSE the swap runs position asset → debt asset, so the floor's
        // "position" is what the position is HELD in: XLM for a Long, the
        // custodied USDT for a Short.
        const debtPrice = side === 'Long'
          ? { num: usdtPrice.price, den: usdtPrice.scale }
          : { num: xlmPrice.price, den: xlmPrice.scale }
        const positionPrice = side === 'Long'
          ? { num: xlmPrice.price, den: xlmPrice.scale }
          : { num: usdtPrice.price, den: usdtPrice.scale }
        const { swapInIdx, swapOutIdx } = SIDE_MAPPING[side]
        /** The closing direction: position asset back into the debt asset. */
        const quoteBack = (input: bigint) => estimatePoolSwap(swapOutIdx, swapInIdx, input)

        /**
         * Project one candidate size all the way to its own close.
         *
         * Returns the shortfall against the contract's floor, or null when the
         * size is unusable for a reason that isn't the close (an open the oracle
         * band already refuses, an underwater projection). Both are "don't offer
         * this size", which is what the bisection needs from it.
         */
        const probe = async (collateralUnderlying: bigint): Promise<{ ok: boolean; shortfall: number } | null> => {
          const collateralPtokens = (collateralUnderlying * CFG.constants.EXCHANGE_SCALE) / rate
          const sizing = computeBorrowAndFloor({
            collateralPtokens, exchangeRate: rate, leverage, side,
            collateralPrice, debtPrice, positionPrice,
          })
          if (sizing.borrowAmount <= BigInt(0)) return null

          const openIn = side === 'Long'
            ? sizing.collateralUnderlying + sizing.borrowAmount
            : sizing.borrowAmount
          const openOut = await estimatePoolSwap(swapInIdx, swapOutIdx, openIn)
          // The order can't be placed at this size at all — the open's own
          // oracle band refuses it. Not this warning's story to tell, but it is
          // still not a size to recommend.
          if (openOut < sizing.oracleMinOut) return null

          const position = side === 'Long' ? openOut : sizing.collateralUnderlying + openOut
          if (position <= BigInt(0)) return null

          if (side === 'Long') {
            const verdict = longCloseFloorVerdict({
              positionUnderlying: position,
              quotedOut: await quoteBack(position),
              positionPrice, debtPrice,
            })
            return { ok: !verdict.blocked, shortfall: verdict.shortfall }
          }

          const targetOut = shortCloseDebtTarget(sizing.borrowAmount)
          const solved = await solveShortCloseInput({
            collateral: position,
            quoteAtCollateral: await quoteBack(position),
            targetOut,
            quote: quoteBack,
            // Feasibility, not a signature: two refinement passes land within a
            // fraction of a percent of the input the close flow will solve for,
            // and each further pass is another round trip on a form the user is
            // still editing.
            refineSteps: 2,
          })
          if (solved.status !== 'ok') return null
          const verdict = shortCloseFloorVerdict({ swapInput: solved.input, targetOut, positionPrice, debtPrice })
          return { ok: !verdict.blocked, shortfall: verdict.shortfall }
        }

        const asked = BigInt(Math.round(collateral * 10 ** usdt.decimals))
        const verdict = await probe(asked)
        if (!live()) return
        // A size that fails for a non-close reason gets no warning from here:
        // the open path has its own, better-informed message for it.
        if (verdict == null || verdict.ok) { setState({ status: verdict == null ? 'idle' : 'ok' }); return }

        const max = await largestFeasibleSize({
          hi: asked,
          feasible: async (size) => (await probe(size).catch(() => null))?.ok === true,
        })
        if (!live()) return
        setState({
          status: 'blocked',
          shortfall: verdict.shortfall,
          maxCollateral: max > BigInt(0) ? Number(max) / 10 ** usdt.decimals : null,
        })
      } catch {
        // No opinion beats a wrong one: a dropped read must not put a warning on
        // an order that is fine, nor clear one that isn't.
        if (live()) setState({ status: 'idle' })
      }
    }, DEBOUNCE_MS)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [side, collateral, leverage, enabled])

  return state
}
