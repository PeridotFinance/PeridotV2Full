'use client'

/**
 * Take-Profit / Stop-Loss controls for the Stellar open panel.
 *
 * Two independent, expandable rows (TR-style): a checkbox toggles each one; when
 * checked the control area animates open with a trigger-price input, quick %-move
 * chips, and a live PnL/ROI preview. Directional logic respects side:
 *   Long  → TP above entry, SL below entry (and ideally above liquidation)
 *   Short → TP below entry, SL above entry (and ideally below liquidation)
 *
 * The "good direction" accent is the brand token (`primary`), not Tailwind
 * emerald — the edit popover this renders inside is already brand green, and two
 * greens a hue apart on one card read as a rendering fault.
 *
 * Fully controlled by the parent (state lifted so it resets on side change). The
 * component never executes anything — it only surfaces the chosen trigger prices
 * upward via `onChange`. Execution (client monitor / keeper) is a separate layer.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Target, ShieldAlert, AlertTriangle, Pencil, Info, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { formatTriggerPrice, tpSlAnchors, validateTpSlDraft } from '../../lib/marginMath'
import type { PositionSide } from '../../config/stellarMarginConfig'

export interface TpSlState {
  tpEnabled: boolean
  slEnabled: boolean
  /** Trigger price in USD as the user typed it (string keeps the field uncontrolled-friendly). */
  tpPrice: string
  slPrice: string
}

export const EMPTY_TPSL: TpSlState = { tpEnabled: false, slEnabled: false, tpPrice: '', slPrice: '' }

interface Props {
  side: PositionSide
  /**
   * Live mark price (XLM/USD) — the VALIDATION anchor. A trigger has to sit on the
   * right side of where the price is *now*, or it fires the moment it's armed.
   */
  entryPrice: number
  /**
   * Cost basis (XLM/USD) for an already-open position — the PnL anchor. Omitted at
   * open time, where the two are the same price.
   *
   * They are NOT the same for a position opened days ago, and conflating them was a
   * bug users reported as "it thinks I opened at $0.17": every label here said
   * "entry" while showing the live price, and the profit preview measured gains from
   * today instead of from what they actually paid. Keep the two anchors apart —
   * validate against `entryPrice` (live), price the outcome against `costBasis`.
   */
  costBasis?: number
  /** Position notional in USD (collateral + borrow); 0 until collateral entered. */
  positionUsd: number
  /** Collateral in USD — ROI denominator. */
  collateralUsd: number
  /** Estimated liquidation price, for the "SL past liq" guard. */
  liqPrice: number | null
  /**
   * Expected fill price from the live pool quote, when there is one.
   *
   * Two jobs, both of which the mark alone got wrong. It anchors validation (see
   * `tpSlAnchors` — a long take-profit just above spot can sit below what the
   * trader actually pays, and would book a loss on firing), and it is the cost
   * basis the payoff preview measures from, so "Max loss $12.40" is priced off
   * the entry the trader really gets rather than the one on the chart.
   */
  fillPrice?: number | null
  /**
   * Whether `entryPrice` is the real market feed.
   *
   * When it isn't, it's the oracle fallback — flat $1 on testnet, against a market
   * around $0.35. Everything in here is anchored on that number: the +25% default
   * fills in $1.25, the chips move off $1, and the wrong-side checks pass or fail
   * against a price nobody trades at. So a stale anchor doesn't just misprice the
   * preview, it hands the user a trigger that can never fire. Inputs stay closed
   * until the feed ticks — the edit popover has always refused to save in this
   * state, and the open panel now refuses to submit.
   */
  markIsLive?: boolean
  /**
   * True when this position's triggers are armed with the server keeper. When they
   * aren't, the ONLY thing watching them is the in-tab monitor, and the user has to
   * be told: a trader set a stop-loss, closed the tab, and was liquidated straight
   * through the level they had set. Silence here reads as a promise we don't keep.
   */
  alwaysOnActive?: boolean
  value: TpSlState
  onChange: (next: TpSlState) => void
  className?: string
}

/**
 * Quick price-move chips (% move of XLM in the favorable / adverse direction).
 * A "Custom" chip is appended after these, letting the user type any % move.
 *
 * The take-profit ladder is side-specific because a short's upside is capped: its
 * profit comes from the price FALLING, and the price can only fall to zero. One
 * shared ladder was used for both sides, so on a short the +100% chip wrote
 * $0.00000 into the field and +150% wrote a negative price — and since every check
 * in here is guarded on `> 0`, neither tripped a warning. The row showed the
 * encouraging "Set a target price below $0.3500" while the submit button was
 * blocked with "Enter a take-profit price", a number sitting visibly in the field.
 * A dead end with no stated cause.
 */
const TP_MOVES_LONG = [25, 50, 100, 150]
const TP_MOVES_SHORT = [10, 25, 50, 75]
/** Adverse moves; all well under 100% on both sides, so no cap needed here. */
const SL_MOVES = [5, 10, 20]

/**
 * Ceilings for a typed custom %, which is the same trap by another door: a 120%
 * adverse move on a long produced the same negative stop-loss the chips did.
 *
 * Downward is capped just short of 100% — at 100% the trigger IS zero, which is
 * not a price. Upward has no natural limit, but a four-digit % is a typo, not an
 * order, and clamping it keeps the field from silently writing an unreachable
 * trigger. The slippage field next door already works this way.
 */
const MAX_DOWN_PCT = 95
const MAX_UP_PCT = 1000

/**
 * Where a valid trigger stops being a plan and starts being a number.
 *
 * Nothing here is wrong with a take-profit at 11× the current price — it just
 * will not happen, and the row answered it with "Est. profit +$1986.74 · +1987%
 * on margin", which reads as a forecast rather than the arithmetic of a price
 * that never arrives. Blocking it would be wrong (it is the trader's order); the
 * fix is to stop the payoff line standing there unqualified.
 *
 * The thresholds sit clear of every chip the row offers — the longest rung is
 * +150% up and −75% down — so this only ever answers a deliberately typed
 * custom %, never a preset.
 */
const FAR_UP_PCT = 300
const FAR_DOWN_PCT = 80

/** Shared with the validator's messages and the order summary — see `formatTriggerPrice`. */
const fmtPrice = formatTriggerPrice

export function StellarTpSlControls({
  side, entryPrice, costBasis, fillPrice, positionUsd, collateralUsd, liqPrice, alwaysOnActive, markIsLive = true, value, onChange, className,
}: Props) {
  const isLong = side === 'Long'
  /** Every number below is anchored on the mark — none of them mean anything without it. */
  const priceReady = markIsLive && entryPrice > 0
  const quotedFill = fillPrice && fillPrice > 0 ? fillPrice : null
  /**
   * Cost basis for the payoff preview, in order of what the trader actually paid:
   * an open position's recorded entry, else the quoted fill for the order being
   * composed, else the mark. The mark used to be the fallback for both, so at open
   * the preview priced a stop-loss off the chart while the trade filled a percent
   * away — on a 5× position that is 5% of the trader's equity, quietly missing
   * from the "Max loss" they were shown before committing.
   */
  const basis = costBasis && costBasis > 0 ? costBasis : quotedFill ?? entryPrice
  const basisIsFill = !(costBasis && costBasis > 0) && quotedFill != null
  // Worth saying out loud only once the two prices actually differ enough to see.
  const repricing = basis !== entryPrice && Math.abs(basis - entryPrice) / entryPrice >= 0.0005
  /**
   * XLM units of exposure — drives the PnL preview.
   *
   * `positionUsd` converts at the price it changes hands at: the fill for an order
   * being composed, the mark for an open position (whose `positionUsd` is already
   * a current valuation, not the sum originally spent).
   */
  const conversionPrice = basisIsFill ? basis : entryPrice
  const xlmExposure = conversionPrice > 0 ? positionUsd / conversionPrice : 0

  /**
   * The price each row's trigger has to clear — the same pair the validator uses.
   *
   * Every number this component OFFERS is measured from here rather than from the
   * mark, because the mark is not what a trigger is judged against once the pool
   * quote is in. On a thin testnet pool the fill ran 14% above the chart, so the
   * default stop-loss (10% under the mark) landed above the price it had to sit
   * under: the trader switched the row on, touched nothing, and got a red field
   * and a blocked order for a number the panel itself had just written. Anchoring
   * on the same bound the check applies makes that arithmetically impossible —
   * every rung offered is at least a chip's worth clear of it.
   */
  const { tpAnchor, slAnchor } = tpSlAnchors({ side, mark: entryPrice, fillPrice: quotedFill })

  /**
   * Trigger price for a given favorable/adverse % move off that row's anchor.
   *
   * The factor floor is a backstop, not the rule — callers pass %s already clamped
   * by `MAX_DOWN_PCT`. It's here because everything downstream treats a trigger of
   * `<= 0` as "no price entered", so a single unclamped caller would resurrect the
   * dead end this whole file's ladders were fixed for.
   */
  const priceForMove = (pct: number, favorable: boolean): number => {
    const towardUp = favorable === isLong // long-favorable = up, short-favorable = down
    const signed = towardUp ? pct : -pct
    const anchor = favorable ? tpAnchor : slAnchor
    return anchor * Math.max(1 + signed / 100, 0.01)
  }

  /** Chips + custom ceiling for each row, by which way that row's trigger moves. */
  const tpMovesUp = isLong
  const tpMoves = isLong ? TP_MOVES_LONG : TP_MOVES_SHORT
  const tpMaxPct = tpMovesUp ? MAX_UP_PCT : MAX_DOWN_PCT
  const slMaxPct = isLong ? MAX_DOWN_PCT : MAX_UP_PCT
  /**
   * The sign a chip carries describes the PRICE it writes, not whether the move
   * is good news. Both rows used to be labelled from the long's point of view —
   * "+" on every take-profit, "−" on every stop-loss — so on a short the chip
   * marked "+25%" wrote a price a quarter BELOW the market, directly under a row
   * that says "Auto-close when price falls", and "−10%" wrote one 10% above it.
   * The only place in the panel where the label and the number contradicted each
   * other, and it sat on the stop-loss.
   */
  const tpMoveSign: '+' | '−' = tpMovesUp ? '+' : '−'
  const slMoveSign: '+' | '−' = isLong ? '−' : '+'

  const tpNum = parseFloat(value.tpPrice) || 0
  const slNum = parseFloat(value.slPrice) || 0

  /** Est. realized PnL ($) at a trigger price, measured from the cost basis. */
  const pnlAt = (trigger: number): number | null => {
    if (trigger <= 0 || basis <= 0 || xlmExposure <= 0) return null
    return (trigger - basis) * xlmExposure * (isLong ? 1 : -1)
  }
  const roiPct = (pnl: number | null): number | null =>
    pnl == null || collateralUsd <= 0 ? null : (pnl / collateralUsd) * 100

  const tpPnl = pnlAt(tpNum)
  const slPnl = pnlAt(slNum)

  // ── Validation ──────────────────────────────────────────────────────────────
  /**
   * Ask the same validator the submit button asks, one row at a time.
   *
   * These lines used to carry their own copy of the side check. Two copies of one
   * rule is the bug this whole file has been fixed for twice over: the moment the
   * shared rule learned about fill prices and a minimum distance, an inline
   * preview with its own copy would have gone on saying "Est. profit +$40" under a
   * trigger the button refuses — a green light on a blocked order.
   *
   * Only asked once a price is actually in the field; an empty row's message
   * belongs on the button, not as a warning under a field the user is still
   * filling in.
   */
  const problemFor = (row: 'tp' | 'sl'): string | null => {
    const draft = row === 'tp' ? { ...value, slEnabled: false } : { ...value, tpEnabled: false }
    const r = validateTpSlDraft({ side, mark: entryPrice, markIsLive, fillPrice: quotedFill, draft })
    return r.ok ? null : r.error
  }
  const tpProblem = value.tpEnabled && tpNum > 0 ? problemFor('tp') : null
  const slProblem = value.slEnabled && slNum > 0 ? problemFor('sl') : null
  /**
   * An armed row with nothing in it. Not a warning — the user may simply be
   * mid-keystroke — but not the ordinary state either: the order is blocked, and
   * the line under the field was saying so in the same brand green a valid
   * trigger gets, which is the one colour that reads as "nothing to fix here".
   * Rendered muted, with the field outlined, so the eye lands on it without the
   * row shouting at someone who is still typing.
   */
  const tpEmpty = priceReady && value.tpEnabled && !(tpNum > 0)
  const slEmpty = priceReady && value.slEnabled && !(slNum > 0)

  /** A trigger so far from the market that the payoff beside it is arithmetic, not a plan. */
  const isFarFromMarket = (trigger: number): boolean => {
    if (!(trigger > 0) || !(basis > 0)) return false
    const movePct = ((trigger - basis) / basis) * 100
    return movePct >= FAR_UP_PCT || movePct <= -FAR_DOWN_PCT
  }
  /**
   * Only the take-profit row asks this. A stop-loss far from the price is
   * already answered better by the liquidation warning below it — "liquidation
   * would trigger first" is the same distance stated as a consequence — and two
   * lines about one number is how a row stops being read at all.
   */
  const tpFar = !tpProblem && isFarFromMarket(tpNum)
  // Not part of the shared rule: a stop-loss past liquidation is a worse trade,
  // not an impossible one, so it warns here and never blocks the order.
  const slPastLiq = !slProblem && slNum > 0 && liqPrice != null && (isLong ? slNum <= liqPrice : slNum >= liqPrice)

  const set = (patch: Partial<TpSlState>) => onChange({ ...value, ...patch })

  // Sensible default trigger when a row is first enabled. Without a live mark there
  // is no such thing as a sensible default — leave the field empty rather than
  // seeding it off the oracle's flat $1.
  const enableTp = () => {
    const next = priceForMove(25, true)
    set({ tpEnabled: true, tpPrice: value.tpPrice || (priceReady ? fmtPrice(next) : '') })
  }
  const enableSl = () => {
    let next = priceForMove(10, false)
    // Keep the default on the safe side of liquidation.
    if (liqPrice != null) next = isLong ? Math.max(next, liqPrice * 1.02) : Math.min(next, liqPrice * 0.98)
    set({ slEnabled: true, slPrice: value.slPrice || (priceReady ? fmtPrice(next) : '') })
  }

  /**
   * Fill in the defaults the moment the feed arrives.
   *
   * A row toggled on before the first tick expands with an empty, disabled field.
   * Once the price lands the field goes live but stays empty — and an enabled row
   * with no price is exactly the state that used to open a position with no
   * stop-loss at all. Seed it the way `enableTp`/`enableSl` would have.
   *
   * Only on the false→true edge: keyed on `value` it would refill the instant the
   * user cleared the field to type their own number.
   */
  const wasReadyRef = useRef(priceReady)
  useEffect(() => {
    const justBecameReady = priceReady && !wasReadyRef.current
    wasReadyRef.current = priceReady
    if (!justBecameReady) return
    const patch: Partial<TpSlState> = {}
    if (value.tpEnabled && !value.tpPrice) patch.tpPrice = fmtPrice(priceForMove(25, true))
    if (value.slEnabled && !value.slPrice) {
      let next = priceForMove(10, false)
      if (liqPrice != null) next = isLong ? Math.max(next, liqPrice * 1.02) : Math.min(next, liqPrice * 0.98)
      patch.slPrice = fmtPrice(next)
    }
    if (Object.keys(patch).length) onChange({ ...value, ...patch })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceReady])

  const sign = (n: number) => (n >= 0 ? '+' : '−')
  const abs = (n: number) => Math.abs(n)

  return (
    <div className={cn('space-y-2', className)}>
      {/* Where the trade actually stands — what was (or will be) paid, against what
          the market says now. At open the left number is the pool's quote, which is
          the price every figure below is measured from; when it matches the mark
          this row stays away rather than saying one number twice. */}
      {repricing && (
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-[10px] tabular-nums">
          <span className="text-muted-foreground">{basisIsFill ? 'Fills at' : 'Your entry'} <span className="text-foreground font-semibold">${fmtPrice(basis)}</span></span>
          <span className="text-muted-foreground">Now <span className="text-foreground font-semibold">${fmtPrice(entryPrice)}</span></span>
        </div>
      )}

      {/* No mark, no triggers. Said once at the top rather than twice inside the
          rows, and only when the user has actually opened one. */}
      {!priceReady && (value.tpEnabled || value.slEnabled) && (
        <p aria-live="polite" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[10px] text-amber-700 dark:text-amber-300">
          <Loader2 aria-hidden="true" className="w-3 h-3 shrink-0 animate-spin" />
          Waiting for the live XLM price — triggers can&apos;t be set against it yet.
        </p>
      )}

      {/* Take-Profit */}
      <ControlRow
        accent="primary"
        icon={<Target className="w-3.5 h-3.5" />}
        title="Take-Profit"
        hint={isLong ? 'Auto-close when price rises' : 'Auto-close when price falls'}
        checked={value.tpEnabled}
        onToggle={(on) => (on ? enableTp() : set({ tpEnabled: false }))}
      >
        <PriceField
          /* Remount on a side flip. The custom-% chip keeps its own state, and the
             row stays mounted across Long↔Short, so a 95% typed on a short came
             back highlighted next to a long's +25% default price — a chip
             describing a number that is no longer in the field. Toggling the row
             off already resets it (the panel unmounts); this is the path that
             doesn't. */
          key={side}
          accent="primary"
          label="Take-profit"
          value={value.tpPrice}
          onChange={(v) => set({ tpPrice: v })}
          moves={tpMoves}
          moveSign={tpMoveSign}
          maxPct={tpMaxPct}
          onMove={(m) => set({ tpPrice: fmtPrice(priceForMove(m, true)) })}
          disabled={!priceReady}
          invalid={Boolean(tpProblem) || tpEmpty}
        />
        {/* Every branch of this line quotes the mark. Without a live one it would
            price the payoff off the oracle and name a price to beat that isn't the
            market's — the banner above says the honest thing instead. */}
        {priceReady && (
          <PreviewLine
            ok={!tpProblem}
            okText={
              tpPnl != null
                ? `Est. profit ${sign(tpPnl)}$${abs(tpPnl).toFixed(2)}${roiPct(tpPnl) != null ? ` · ${sign(roiPct(tpPnl)!)}${abs(roiPct(tpPnl)!).toFixed(0)}% on margin` : ''}`
                /* The bound the row is judged against, not the cost basis — with a
                   pool quote in hand the two differ, and naming the wrong one
                   invites a price the button then refuses. */
                : `Set a target price ${isLong ? 'above' : 'below'} $${fmtPrice(tpAnchor)}`
            }
            warnText={tpProblem ?? undefined}
            tone="primary"
            pending={tpEmpty}
          />
        )}
        {priceReady && tpFar && <FarNote />}
      </ControlRow>

      {/* Stop-Loss */}
      <ControlRow
        accent="red"
        icon={<ShieldAlert className="w-3.5 h-3.5" />}
        title="Stop-Loss"
        hint={isLong ? 'Auto-close when price falls' : 'Auto-close when price rises'}
        checked={value.slEnabled}
        onToggle={(on) => (on ? enableSl() : set({ slEnabled: false }))}
      >
        <PriceField
          key={side}
          accent="red"
          label="Stop-loss"
          value={value.slPrice}
          onChange={(v) => set({ slPrice: v })}
          moves={SL_MOVES}
          moveSign={slMoveSign}
          maxPct={slMaxPct}
          onMove={(m) => set({ slPrice: fmtPrice(priceForMove(m, false)) })}
          disabled={!priceReady}
          invalid={Boolean(slProblem) || slEmpty}
        />
        {!priceReady ? null : slProblem ? (
          <PreviewLine ok={false} warnText={slProblem} tone="red" />
        ) : slPastLiq ? (
          <PreviewLine
            ok={false}
            warnText={`Beyond liquidation ($${liqPrice != null ? fmtPrice(liqPrice) : '—'}) — liquidation would trigger first`}
            tone="amber"
          />
        ) : (
          <PreviewLine
            ok
            okText={
              slPnl != null
                ? `Max loss ${sign(slPnl)}$${abs(slPnl).toFixed(2)}${roiPct(slPnl) != null ? ` · ${sign(roiPct(slPnl)!)}${abs(roiPct(slPnl)!).toFixed(0)}% on margin` : ''}`
                : 'Set a price to cap your loss'
            }
            tone="red"
            pending={slEmpty}
          />
        )}
      </ControlRow>

      {/* Execution reality. Only shown once a trigger is actually armed — nagging
          about it before the user has set anything is noise. */}
      {(value.tpEnabled || value.slEnabled) && !alwaysOnActive && (
        <p className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[10px] leading-snug text-amber-700 dark:text-amber-300">
          <Info className="w-3 h-3 shrink-0 mt-px" />
          <span>These run while this page is open. Close the tab and they can&apos;t fire — liquidation still can.</span>
        </p>
      )}
    </div>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/**
 * One collapsible protection row.
 *
 * The control is a real checkbox to anything that isn't a pair of eyes: it looks
 * like one (a box with a tick) and behaves like one, but it was built from a
 * `<button>` wrapping a `<span>`, so a screen reader announced "Take-Profit
 * Auto-close when price rises, button" — no state, no hint that it toggles, and
 * no way to tell an armed stop-loss from an unarmed one. `role="checkbox"` +
 * `aria-checked` restores the state; `aria-expanded`/`aria-controls` tie it to the
 * panel it opens.
 */
function ControlRow({
  accent, icon, title, hint, checked, onToggle, children,
}: {
  accent: 'primary' | 'red'
  icon: React.ReactNode
  title: string
  hint: string
  checked: boolean
  onToggle: (on: boolean) => void
  children: React.ReactNode
}) {
  const panelId = useId()
  const labelId = useId()
  const accentText = accent === 'primary' ? 'text-primary' : 'text-red-700 dark:text-red-300'
  const accentBox = checked
    ? accent === 'primary'
      ? 'bg-primary/20 border-primary/60'
      : 'bg-red-500/20 border-red-400/60'
    : 'bg-white/5 border-white/15'
  return (
    <div className={cn('rounded-xl border transition-colors', checked ? 'border-white/10 bg-white/3' : 'border-white/5')}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-expanded={checked}
        aria-controls={checked ? panelId : undefined}
        onClick={() => onToggle(!checked)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid place-items-center w-4 h-4 rounded-[5px] border transition-all duration-200 shrink-0',
            accentBox,
          )}
        >
          <AnimatePresence>
            {checked && (
              <motion.svg
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                viewBox="0 0 14 14"
                className={cn('w-2.5 h-2.5', accentText)}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2.5 7.5 L6 11 L11.5 3.5" />
              </motion.svg>
            )}
          </AnimatePresence>
        </span>
        <span aria-hidden="true" className={cn('shrink-0', checked ? accentText : 'text-muted-foreground')}>{icon}</span>
        <span id={labelId} className="flex flex-col">
          <span className={cn('text-xs font-semibold', checked ? 'text-foreground' : 'text-foreground/80')}>{title}</span>
          <span className="text-[10px] text-muted-foreground">{hint}</span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {checked && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div id={panelId} className="px-3 pb-3 pt-0.5 space-y-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PriceField({
  accent, label, value, onChange, moves, moveSign, maxPct, onMove, disabled, invalid,
}: {
  accent: 'primary' | 'red'
  /** Names the field for a screen reader — "0.00000" in a placeholder is not a name. */
  label: string
  value: string
  onChange: (v: string) => void
  moves: number[]
  moveSign: '+' | '−'
  /** Largest % this row's custom field may apply — see MAX_DOWN_PCT / MAX_UP_PCT. */
  maxPct: number
  onMove: (pct: number) => void
  disabled?: boolean
  /** This row is blocking the order — outline the field the message is about. */
  invalid?: boolean
}) {
  const [customOpen, setCustomOpen] = useState(false)
  const [customPct, setCustomPct] = useState('')
  const ring = accent === 'primary' ? 'focus:border-primary/50' : 'focus:border-red-400/50'
  const chip = accent === 'primary'
    ? 'hover:bg-primary/15 hover:text-primary'
    : 'hover:bg-red-500/15 hover:text-red-700 dark:hover:text-red-300'
  const customActive = accent === 'primary'
    ? 'bg-primary/15 text-primary border-primary/40'
    : 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-400/40'

  /** Apply per keystroke, clamped — but leave the text alone so partial input
   *  ("1" on the way to "15") isn't rewritten under the cursor. */
  const applyCustom = (raw: string) => {
    setCustomPct(raw)
    const pct = parseFloat(raw)
    if (pct > 0) onMove(Math.min(pct, maxPct))
  }

  /**
   * Once the user is done typing, snap the text to the % that was actually used.
   * Leaving "120" on screen next to a trigger computed from 95 is the same lie the
   * slippage field used to tell, and here it's a lie about a stop-loss.
   */
  const commitCustom = () => {
    const pct = parseFloat(customPct)
    if (!(pct > 0)) { setCustomPct(''); setCustomOpen(false); return }
    const clamped = Math.min(pct, maxPct)
    setCustomPct(String(clamped))
    onMove(clamped)
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted-foreground">$</span>
        <Input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          aria-label={`${label} trigger price, XLM in US dollars`}
          aria-invalid={invalid || undefined}
          placeholder="0.00000"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          /* A focused number input eats the wheel and steps its own value, so
             scrolling the panel past a focused trigger field silently moved the
             stop-loss. Drop focus and let the page scroll instead. */
          onWheel={(e) => e.currentTarget.blur()}
          className={cn(
            'pl-6 pr-16 bg-white/5 text-sm font-mono focus:ring-0',
            invalid ? 'border-amber-500/60 focus:border-amber-500/60' : cn('border-white/10', ring),
          )}
        />
        <span aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted-foreground bg-white/8 px-1.5 py-0.5 rounded-md">
          XLM / USD
        </span>
      </div>
      {/* "+25%" alone tells a screen reader nothing about what it moves. */}
      <div role="group" aria-label={`${label} quick price moves`} className="flex items-center gap-1">
        {moves.map((m) => (
          <button
            key={m}
            type="button"
            disabled={disabled}
            /* Clear the custom % too: it used to survive, so reopening "Custom"
               after a preset showed a stale figure that no longer described the
               price in the field above it. */
            onClick={() => { setCustomOpen(false); setCustomPct(''); onMove(m) }}
            className={cn(
              'flex-1 min-w-0 text-[10px] font-medium px-1.5 py-1 rounded-md text-muted-foreground/60 transition-colors disabled:opacity-30',
              chip,
            )}
          >
            {moveSign}{m}%
          </button>
        ))}
        {customOpen ? (
          /* Wider than a preset chip, because it has to hold what it accepts: at
             `MAX_UP_PCT` the value is four digits between a "+" and a "%", and in
             a chip-sized box "1000" scrolled out of view and rendered as "000" —
             a figure that was neither typed nor applied. */
          <div className={cn('relative flex-[1.8] min-w-[4.25rem] rounded-md border', customActive)}>
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold pointer-events-none">{moveSign}</span>
            <input
              type="number"
              min="0"
              max={maxPct}
              step="any"
              inputMode="decimal"
              autoFocus
              aria-label={`${label}: custom price move in percent`}
              placeholder="0"
              value={customPct}
              disabled={disabled}
              onChange={(e) => applyCustom(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              onBlur={commitCustom}
              className="w-full bg-transparent text-center text-[10px] font-semibold px-3 py-1 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold pointer-events-none">%</span>
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setCustomOpen(true)}
            className={cn(
              'flex-1 min-w-0 flex items-center justify-center gap-1 text-[10px] font-medium px-1.5 py-1 rounded-md text-muted-foreground/60 transition-colors disabled:opacity-30',
              chip,
            )}
          >
            <Pencil className="w-2.5 h-2.5 shrink-0" />
            Custom
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Qualifier under a trigger the market realistically won't reach. Not a warning
 * — the order is valid and will be placed exactly as typed — so it stays quiet
 * in the muted tone, and only says the thing the payoff line above it can't:
 * that the figure depends on a move of this size actually happening.
 */
function FarNote() {
  return (
    <p className="text-[10px] leading-snug text-muted-foreground/70 pl-0.5">
      Far from today&apos;s price — this only pays out if XLM moves that far.
    </p>
  )
}

function PreviewLine({
  ok, okText, warnText, tone, pending,
}: {
  ok: boolean
  okText?: string
  warnText?: string
  tone: 'primary' | 'red' | 'amber'
  /** The row is armed but empty — a prompt, not a priced outcome. See `tpEmpty`. */
  pending?: boolean
}) {
  const okColor = pending ? 'text-muted-foreground' : tone === 'primary' ? 'text-primary' : 'text-red-400'
  return (
    /* Announce the refusals, not the running payoff: a live region that re-reads
       "Est. profit +$12.98" on every keystroke drowns out the one line that means
       the trigger won't be accepted. */
    <p
      aria-live={ok ? 'off' : 'polite'}
      className={cn('text-[10px] flex items-center gap-1 pl-0.5', ok ? okColor : 'text-amber-400')}
    >
      {!ok && <AlertTriangle aria-hidden="true" className="w-3 h-3 shrink-0" />}
      <span className="tabular-nums">{ok ? okText : warnText}</span>
    </p>
  )
}
