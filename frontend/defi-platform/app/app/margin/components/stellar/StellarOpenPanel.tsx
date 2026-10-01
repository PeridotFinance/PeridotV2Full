'use client'

/**
 * Stellar leveraged-open panel (Perps V3).
 *
 * Collateral is always posted in USDT; Long/Short selects the debt + swap
 * direction. Leverage is an integer 2..MAX_LEVERAGE (V3 global cap, currently 5 —
 * the contract takes u128 leverage). The 3-step V3 flow (begin → on-chain swap →
 * activate) runs behind one button with an inline stepper.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLogin } from '@privy-io/react-auth'
import { TrendingUp, TrendingDown, Zap, AlertTriangle, Loader2, Plus, Sparkles, Clock, ShieldCheck, Crosshair } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { STELLAR_MARGIN_CONFIG as CFG } from '../../config/stellarMarginConfig'
import { useStellarMarginOpen, type OpenStep, type OpenedInfo } from '../../hooks/use-stellar-margin-open'
import { useStellarKeeperArms } from '../../hooks/use-stellar-keeper-arms'
import { openErrorAction } from '../../lib/stellarMarginErrors'
import { formatTriggerPrice, validateTpSlDraft, validateLimitOrderDraft } from '../../lib/marginMath'
import type { PlaceLimitOrderInput } from '../../hooks/use-stellar-limit-orders'
import { useStellarExecutionQuote } from '../../hooks/use-stellar-execution-quote'
import { useStellarBorrowRate } from '../../hooks/use-stellar-borrow-rate'
import { useStellarExitCapacity } from '../../hooks/use-stellar-exit-capacity'
import { StellarTpSlControls, EMPTY_TPSL, type TpSlState } from './StellarTpSlControls'
import { TermTip } from './TermTip'
import { StellarOpenCelebration } from './StellarOpenCelebration'
import { StellarOpenProgress } from './StellarOpenProgress'
import type { StellarMarginAsset, PositionSide } from '../../types/stellarMargin'

interface Props {
  assets: StellarMarginAsset[]
  isConnected: boolean
  /**
   * A trade landed. Carries the new position when the caller has something to do
   * with it — today: arming the always-on keeper the user opted into here, which
   * can only happen once the position exists on-chain.
   */
  onOpened?: (info?: OpenedInfo & { alwaysOn?: boolean }) => void
  /**
   * An open failed after `begin_open`, leaving collateral locked in a PendingOpen.
   * The panel's error callout sends the user to the recovery banner — which is
   * rendered off the positions poll and so wouldn't appear for up to 15s. This
   * pulls the refresh forward so the banner is there when they look up.
   */
  onPendingStranded?: () => void
  onAddCollateral?: () => void
  /** The live fill quote for the size being typed, so the chart can draw it as
   *  a "Your fill" line. Null whenever there is nothing to quote. */
  onFillQuote?: (quote: { price: number; side: PositionSide } | null) => void
  /**
   * Real XLM/USD feed price (from the chart). TP/SL triggers are computed against
   * this so they share the chart + journal price domain — the testnet oracle's flat
   * $1 would otherwise float the lines off a ~$0.19 chart.
   */
  referencePrice?: number
  /**
   * Place a resting limit order instead of opening now. Resolves to null when
   * it was accepted, or the reason it wasn't. The order fires from the page
   * (hooks/use-stellar-limit-order-monitor); the panel's copy says so.
   */
  onPlaceLimitOrder?: (input: PlaceLimitOrderInput) => Promise<string | null>
  className?: string
}

type OrderType = 'market' | 'limit'
/** How long a limit order rests before it lapses on its own. */
const LIMIT_EXPIRY_OPTIONS: { label: string; ms: number }[] = [
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
]
/** One-tap limit offsets from the mark: below it for a Long, above for a Short. */
const LIMIT_OFFSET_PCTS = [1, 2, 5, 10] as const

const MAX_LEVERAGE = CFG.constants.MAX_LEVERAGE
// Every integer step 2..MAX (the V3 cap is small enough to label them all).
const LEVERAGE_MARKS = Array.from({ length: MAX_LEVERAGE - 1 }, (_, i) => i + 2)
const STEP_PROGRESS: Record<OpenStep, number> = {
  idle: 0, quoting: 0, beginning: 1, swapping: 2, activating: 3, success: 3, error: 0,
}
const STEP_COUNT = 3
/** Escalation ladder for the "raise slippage & retry" action on a slippage failure. */
const SLIPPAGE_RAISE_TIERS = [100, 200, 500, 1000, 2000, 4000]
/** Highest tier the one-shot silent auto-retry may reach on its own (see below). */
const SILENT_RETRY_CEILING_BPS = 500
/** Liquidation buffer below which the order summary flags the trade as risky. */
const LIQ_WARN_DISTANCE = 0.25

/** Fractions of the margin balance offered as one-tap sizes. 1 = "Max". */
const COLLATERAL_PRESETS = [0.25, 0.5, 0.75, 1] as const

/**
 * Execution gap above which the fill-price row turns into a warning.
 *
 * 1% is where the cost stops being noise: on a 5× position it is already 5% of
 * the trader's equity handed to the pool at the moment of entry.
 */
const FILL_GAP_WARN_PCT = 1

/** Truncate (never round up) to `dp` decimals — a displayed maximum must be
 *  spendable, and rounding up produces one the balance can't cover. */
function floorTo(value: number, dp: number): string {
  const f = 10 ** dp
  return (Math.floor(value * f) / f).toFixed(dp)
}

function StatRow({ label, value, warn }: { label: ReactNode; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-xs font-semibold tabular-nums', warn ? 'text-red-400' : 'text-foreground')}>{value}</span>
    </div>
  )
}

export function StellarOpenPanel({ assets, isConnected, onOpened, onPendingStranded, onAddCollateral, onFillQuote, referencePrice, onPlaceLimitOrder, className }: Props) {
  const [side, setSide] = useState<PositionSide>('Long')
  const [collateralInput, setCollateralInput] = useState('')
  const [leverage, setLeverage] = useState(2)
  const [slippageBps, setSlippageBps] = useState(100)
  const [customSlippage, setCustomSlippage] = useState('')
  const [tpSl, setTpSl] = useState<TpSlState>(EMPTY_TPSL)
  /**
   * Market opens now; Limit rests until XLM reaches a price the trader names,
   * then opens through the same flow — from this page, while it is open. The
   * limit price is the ENTRY the rest of the form (TP/SL, liquidation, size)
   * is computed against, which is why `tpSlRef` below switches to it.
   */
  const [orderType, setOrderType] = useState<OrderType>('market')
  const [limitPriceInput, setLimitPriceInput] = useState('')
  const [limitExpiryMs, setLimitExpiryMs] = useState(LIMIT_EXPIRY_OPTIONS[1].ms)
  const [placingLimit, setPlacingLimit] = useState(false)
  const [limitError, setLimitError] = useState<string | null>(null)
  const isLimit = orderType === 'limit' && Boolean(onPlaceLimitOrder)
  /**
   * "Keep watching after I close the tab", chosen before the trade exists.
   *
   * The keeper arms a POSITION — it pre-signs closes against a concrete id — so
   * nothing can be armed from here. What this holds is the intent; the page arms
   * it once the position appears. Declared above the open hook because that
   * hook's callback reads it.
   */
  const [alwaysOnOptIn, setAlwaysOnOptIn] = useState(false)

  const usdt = assets.find((a) => a.key === 'MOCK_USDT')
  const xlm = assets.find((a) => a.key === 'XLM')

  // Logged-out escape hatches: Privy login or an external Stellar wallet.
  const { login } = useLogin()
  const { connect } = useStellarWallet()

  /*
   * The collateral field is never auto-filled.
   *
   * It used to be seeded with `Math.min(1, availableMargin)` — nominally to stop the
   * panel changing height once a value was typed. The cost was an order the user
   * never composed sitting armed under a live CTA ("Long XLM · $3"), at a size (1
   * USDT) that bore no relation to their balance — and it re-armed after every open,
   * right as the previous trade landed. An empty field plus `blockReason` says what
   * to do instead, and it behaves identically on first load and after a trade.
   */

  // One-shot celebration snapshot, captured on the open→success transition (the
  // panel's live values get reset by the refetch right after, so we freeze them).
  const [celebration, setCelebration] = useState<{ side: PositionSide; leverage: number; positionUsd: number } | null>(null)

  const { openPosition, step, stepLabel, error, unavailable, slippage, oracleFloor, pendingPositionId, isLoading, reset } = useStellarMarginOpen((info) => {
    setCollateralInput('')
    setTpSl(EMPTY_TPSL)
    // Carry the opt-in with the position it belongs to. Read at call time (the
    // hook keeps this arrow in a ref and refreshes it every render), so it is the
    // switch as it stood when the trade was placed.
    onOpened?.(info ? { ...info, alwaysOn: alwaysOnOptIn } : undefined)
    setAlwaysOnOptIn(false)
  })

  // Available margin collateral (USDT in MarginController custody).
  const availableMargin = usdt?.marginUnderlying ?? 0
  const collateralUsd = parseFloat(collateralInput) || 0

  // Convert the USDT amount → collateral pTokens, clamped to the on-chain margin balance.
  const collateralPtokens = useMemo(() => {
    if (!usdt || collateralUsd <= 0) return BigInt(0)
    const SCALE = CFG.constants.EXCHANGE_SCALE
    const underlyingRaw = BigInt(Math.floor(collateralUsd * 10 ** usdt.decimals))
    const ptokens = (underlyingRaw * SCALE) / usdt.exchangeRate
    return ptokens > usdt.marginPtokensRaw ? usdt.marginPtokensRaw : ptokens
  }, [usdt, collateralUsd])

  // V3 sizing. Notional (exposure) is margin × leverage on both sides, with no
  // collateral-factor discount. What gets BORROWED is not symmetric, which the
  // panel used to miss:
  //
  //   Long  — borrow margin × (leverage − 1) in USDT and swap margin + borrow
  //           into XLM. Custodied = the notional.
  //   Short — borrow the WHOLE notional in XLM and sell it, so the controller
  //           custodies margin + proceeds = margin × (leverage + 1) in USDT.
  //
  // Quoting a short's borrow as margin × (leverage − 1) understated it by a full
  // leverage step: a 2× short on 10 USDT was advertised as borrowing 58.17 XLM and
  // opened owing 116.17 XLM, with an estimated liquidation of $0.3266 against an
  // actual $0.2446. Both numbers came from that one wrong term. Checked against
  // live testnet positions on both sides.
  const positionSize = collateralUsd * leverage
  const borrowed = side === 'Long' ? collateralUsd * (leverage - 1) : positionSize
  /** USD the controller holds for the position — the "Size" the positions table shows. */
  const custodiedUsd = side === 'Long' ? positionSize : collateralUsd + positionSize
  const exposurePrice = xlm?.priceUsd ?? 1
  // TP/SL reference: prefer the real chart feed so triggers match the chart/journal.
  // This is the DISPLAY domain — every price the user reads (TP/SL, chart lines,
  // the order summary) belongs here. `exposurePrice` is the oracle domain and stays
  // confined to contract-facing math: on testnet it pins XLM at a flat $1, so showing
  // it raw puts a $0.70 "liquidation price" next to a $0.19 chart.
  const liveMark = referencePrice && referencePrice > 0 ? referencePrice : exposurePrice
  /**
   * Whether that reference is the real feed rather than the oracle fallback.
   *
   * Sizing and the liquidation estimate survive the fallback (they're proportional,
   * and the display domain scales them). A TRIGGER doesn't: it's an absolute price
   * compared against the market, so one computed off the oracle's flat $1 is either
   * unreachable (a $1.25 take-profit on a $0.35 asset) or wrong-sided and dropped.
   * The edit popover has always refused to save without a live mark; TP/SL at open
   * now blocks on the same condition.
   */
  const markIsLive = Boolean(referencePrice && referencePrice > 0)

  /** Is the limit on the right side of the market, and how far off it is. */
  const limitValidation = useMemo(
    () => validateLimitOrderDraft({ side, mark: liveMark, markIsLive, limitPrice: limitPriceInput }),
    [side, liveMark, markIsLive, limitPriceInput],
  )
  const limitBlockReason = isLimit ? (limitValidation.ok ? null : limitValidation.error ?? null) : null
  const limitPrice = isLimit && limitValidation.ok ? (limitValidation.limitPrice as number) : null
  const limitOffsetPct = limitPrice != null && liveMark > 0 ? ((limitPrice - liveMark) / liveMark) * 100 : null
  /**
   * The entry everything downstream is priced against. Market: the live mark.
   * Limit: the limit itself — a stop-loss on a limit order belongs relative to
   * where the trade will OPEN, not to where the market happens to be today.
   */
  const tpSlRef = limitPrice ?? liveMark

  // Live pool quote at this exact size — the price the trade will really fill at.
  const { quote: execQuote } = useStellarExecutionQuote({
    side,
    collateral: collateralUsd,
    leverage,
    feedPrice: tpSlRef,
    enabled: isConnected && collateralUsd > 0 && !isLimit,
  })
  // Mirror the quote up to the chart. Keyed on the price, not the object, so a
  // re-render with the same number doesn't re-fire the parent's setState.
  const execQuotePrice = execQuote?.entryPrice ?? null
  const onFillQuoteRef = useRef(onFillQuote)
  onFillQuoteRef.current = onFillQuote
  useEffect(() => {
    onFillQuoteRef.current?.(execQuotePrice != null && execQuotePrice > 0 ? { price: execQuotePrice, side } : null)
  }, [execQuotePrice, side])
  useEffect(() => () => onFillQuoteRef.current?.(null), [])

  /**
   * What holding this position costs — the one number the summary never had.
   *
   * The rate belongs to the vault the position BORROWS from, which is not the
   * same vault on both sides: a Long borrows USDT, a Short borrows the XLM it
   * sells. `borrowed` is already a USD figure on both sides (see the sizing
   * comment above), so the daily cost is the same arithmetic either way.
   */
  const borrowVault = side === 'Long' ? CFG.assets.MOCK_USDT.vault : CFG.assets.XLM.vault
  const borrowRateYearly = useStellarBorrowRate(isConnected ? borrowVault : null)
  const borrowCostPerDay = borrowRateYearly != null ? (borrowed * borrowRateYearly) / 365 : null

  /**
   * Could this order be closed again once it exists?
   *
   * The size that opens and the size that closes are not the same number on this
   * pool — see the hook. Advisory: it warns and names a size that works, it does
   * not gate `canSubmit`. Gating would refuse trades the pool will accept two
   * minutes later, and the check itself goes quiet on the newer controller.
   */
  const exitCapacity = useStellarExitCapacity({
    side,
    collateral: collateralUsd,
    leverage,
    enabled: isConnected && collateralUsd > 0 && !isLoading && !isLimit,
  })

  // Liquidation preview — V3 perps maintenance-margin logic (5%), mirroring
  // marginMath.liquidationPrice: position value × (1 − MM) must keep covering
  // the debt. A 5× long has less room than a 2× long.
  const liqPrice = useMemo(() => {
    const keep = 1 - CFG.constants.MAINTENANCE_MARGIN
    if (positionSize <= 0 || borrowed <= 0 || exposurePrice <= 0) return null
    return side === 'Long'
      ? (borrowed * exposurePrice) / (positionSize * keep)
      // Short: the USDT the controller holds must keep covering the XLM debt, so
      // the numerator is the custodied amount — not the notional.
      : (custodiedUsd * keep * exposurePrice) / borrowed
  }, [side, positionSize, custodiedUsd, borrowed, exposurePrice])

  /** `liqPrice` in the display domain — it scales linearly with the price anchor. */
  const liqPriceDisplay = useMemo(
    () => (liqPrice != null && exposurePrice > 0 ? liqPrice * (tpSlRef / exposurePrice) : liqPrice),
    [liqPrice, tpSlRef, exposurePrice],
  )

  // How much room the price has before this position liquidates. The row used to go
  // red whenever a liquidation price merely EXISTED — i.e. on every order, including
  // a conservative 2× — which trains the eye to ignore it. Now it warns only when the
  // buffer is genuinely thin.
  const liqDistancePct = useMemo(() => {
    if (liqPriceDisplay == null || !(tpSlRef > 0)) return null
    return Math.abs(liqPriceDisplay - tpSlRef) / tpSlRef
  }, [liqPriceDisplay, tpSlRef])
  // At the V3 5% maintenance margin the buffer is ~47% at 2×, 30% at 3×, 21% at 4×
  // and 16% at 5×. A 25% line therefore warns at 4× and 5× — exactly the band the
  // leverage badge above already colours red, so the two agree.
  const liqIsTight = liqDistancePct != null && liqDistancePct < LIQ_WARN_DISTANCE

  /**
   * The order in the units a person thinks in.
   *
   * Everything above this is correct and none of it answers "how much money is
   * this?". A liquidation price of $0.2841 and a health factor of 1.04 are facts
   * about the position; what the trader is actually deciding is how much a normal
   * day's move costs them. So: one dollar figure per 1% of XLM, its share of the
   * money they put up (which IS the leverage, and says so), and the move that ends
   * the trade.
   *
   * Deliberately no estimate of what a liquidation pays back. The V3 close is a
   * seize-and-settle whose residue depends on the liquidation fee, the swap and
   * accrued interest at that moment — a number we cannot honestly quote here, and
   * quoting one low would be as misleading as quoting one high.
   */
  const perOnePctMoveUsd = positionSize > 0 ? positionSize / 100 : null

  // Fire the celebration once when the flow lands on success, freezing the
  // current side/leverage/size before the post-open refetch resets the panel.
  const prevStepRef = useRef<OpenStep>('idle')
  // Freezing it here was too late: the panel clears the collateral field as part of
  // landing on success, so by the time this effect ran `positionSize` was already 0
  // and every celebration announced the trade as "$0.00". Remember the last sized
  // order instead, and fall back to it.
  const lastSizedRef = useRef(0)
  if (positionSize > 0) lastSizedRef.current = positionSize
  useEffect(() => {
    if (step === 'success' && prevStepRef.current !== 'success') {
      setCelebration({ side, leverage, positionUsd: positionSize > 0 ? positionSize : lastSizedRef.current })
    }
    prevStepRef.current = step
  }, [step, side, leverage, positionSize])

  // Auto-dismiss the celebration after a beat (tap also dismisses).
  useEffect(() => {
    if (!celebration) return
    const t = setTimeout(() => setCelebration(null), 3000)
    return () => clearTimeout(t)
  }, [celebration])

  // `assets` starts empty and fills on the first on-chain read, so `availableMargin`
  // is 0 for the first beat of every page load — which flashed "No USDT in margin.
  // Add collateral to start trading." at users who have collateral, right where they
  // are deciding whether the app knows about their money. Gate on the USDT row
  // actually having hydrated; until then the panel simply says nothing.
  const marginHydrated = !!usdt
  const noMargin = isConnected && marginHydrated && availableMargin <= 0
  // Only a balance the user actually HAS can be exceeded. Without the connection
  // guard a logged-out visitor got a red "Exceeds margin balance (0.0000 USDT)"
  // under a prefilled field — an error about an account they don't have yet,
  // directly above the panel's own "connect first" message.
  const exceedsMargin = isConnected && collateralUsd > availableMargin + 1e-9

  /**
   * Why the take-profit / stop-loss the user switched on can't be submitted — or
   * null when there's nothing to complain about (including "nothing switched on").
   *
   * This exists because the alternative was silence. `resolveTpSl` below keeps only
   * triggers that validate and passes `null` for the rest, so an enabled row that
   * was empty, or that the live price had drifted past while the user was still
   * looking at the form, opened a leveraged position with no stop-loss at all —
   * no error, no toast, nothing to notice. The edit popover treats exactly this
   * case as a hard error for exactly this reason; the open path now agrees.
   *
   * A stop-loss beyond the liquidation price stays a warning, not a block: it is a
   * worse trade, not an impossible one, and the inline preview already flags it.
   */
  /**
   * The price the order is expected to fill at, which is what a trigger really has
   * to beat. The mark is what the chart shows; the pool is what the trader gets,
   * and at size they are a percent or more apart. A take-profit above the mark but
   * below the fill is a take-profit that books a loss.
   */
  const fillPrice = execQuote?.entryPrice ?? null

  const tpSlValidation = useMemo(
    () => validateTpSlDraft({ side, mark: tpSlRef, markIsLive, fillPrice, draft: tpSl }),
    [side, tpSlRef, markIsLive, fillPrice, tpSl],
  )
  const tpSlBlockReason = tpSlValidation.ok ? null : tpSlValidation.error

  /**
   * The short form of that reason, for the line above the button.
   *
   * The rows print their own problem inline, under the field it belongs to, so
   * repeating the full sentence 200px lower said the same thing twice — the same
   * words, in the same colour, about the same field. But dropping the line
   * entirely is worse: it is what `aria-describedby` points the button at, and a
   * disabled button otherwise announces "dimmed" and nothing else. So the line
   * stays and points, and the sentence lives once, where the fix is.
   *
   * A row the user has left EMPTY prints nothing inline (an empty field is not a
   * mistake yet, it's an unfinished thought), so its reason still has to be said
   * in full here.
   */
  const tpSlShortReason = useMemo(() => {
    if (!tpSlBlockReason) return null
    const tpTyped = tpSl.tpEnabled && (parseFloat(tpSl.tpPrice) || 0) > 0
    const slTyped = tpSl.slEnabled && (parseFloat(tpSl.slPrice) || 0) > 0
    // Which row is the validator objecting to? Ask it one row at a time rather
    // than matching on the message text.
    const failing = (row: 'tp' | 'sl') => {
      const draft = row === 'tp' ? { ...tpSl, slEnabled: false } : { ...tpSl, tpEnabled: false }
      return !validateTpSlDraft({ side, mark: tpSlRef, markIsLive, fillPrice, draft }).ok
    }
    if (failing('tp') && tpTyped) return 'Adjust your take-profit to continue.'
    if (failing('sl') && slTyped) return 'Adjust your stop-loss to continue.'
    return tpSlBlockReason
  }, [tpSlBlockReason, tpSl, side, tpSlRef, markIsLive, fillPrice])

  /**
   * Whether the always-on keeper is worth offering here.
   *
   * Read from the same shared cache the positions row and the edit popover use,
   * so the three can't disagree about whether cover is even available. The offer
   * only appears once the user has actually asked for protection — pitching it
   * to someone who set no triggers is noise about a thing they haven't chosen
   * yet.
   */
  const keeperArms = useStellarKeeperArms(isConnected)
  const wantsTpSl = tpSl.tpEnabled || tpSl.slEnabled
  // Not for a limit order: the keeper arms a position id, and this one doesn't
  // exist yet. The fill writes the TP/SL to the journal like any open, so the
  // in-tab monitor covers it from the moment it lands.
  const offerAlwaysOn =
    isConnected && wantsTpSl && !isLimit && keeperArms.enabled && Boolean(keeperArms.keeperPublicKey)

  const canSubmit =
    isConnected && collateralUsd > 0 && borrowed > 0 && !exceedsMargin && !noMargin &&
    !isLoading && !placingLimit && step !== 'error' && !tpSlBlockReason && !limitBlockReason

  // Plain-language reason the trade can't start yet, so a disabled button is never
  // a dead end with no explanation. Ordered by what the user should fix first; the
  // cases with their own dedicated UI (no margin → amber prompt, over-balance → red
  // hint) return null here to avoid saying the same thing twice.
  const blockReason = useMemo(() => {
    if (!isConnected || isLoading || step === 'error' || step === 'success') return null
    if (noMargin) return null
    if (exceedsMargin) return null
    if (collateralUsd <= 0) return 'Enter how much USDT collateral to trade with.'
    if (limitBlockReason) return limitBlockReason
    // Last, so it can't hide the reason there is no order to protect yet.
    if (tpSlBlockReason) return tpSlShortReason
    return null
  }, [isConnected, isLoading, step, noMargin, exceedsMargin, collateralUsd, limitBlockReason, tpSlBlockReason, tpSlShortReason])

  /**
   * Resolve the user's TP/SL into the trigger prices the order carries.
   *
   * This used to be the only check, and it dropped whatever didn't validate —
   * so an enabled stop-loss that the price had drifted past opened a leveraged
   * position with nothing watching it, silently. `tpSlBlockReason` is the gate
   * now; what happens here is a re-validation at the tap, because a feed tick can
   * land between the last render and this call and a trigger the market has just
   * invalidated must not be sent.
   */
  const resolveTpSl = () => {
    const r = validateTpSlDraft({ side, mark: tpSlRef, markIsLive, fillPrice, draft: tpSl })
    return r.ok ? r.triggers : { takeProfit: null, stopLoss: null }
  }

  // The actual open call — shared by the user's tap and the auto/manual retries.
  const fireOpen = () => {
    if (!canSubmit) return
    openPosition({ side, collateralPtokens, leverage, slippageBps, ...resolveTpSl() })
  }
  /**
   * Rest the order instead of opening. Nothing on chain moves here — the
   * collateral stays in margin, spendable, until the fire converts it. That is
   * also why the monitor re-checks the balance at fire time.
   */
  const placeLimitOrder = async () => {
    if (!canSubmit || !onPlaceLimitOrder || limitPrice == null) return
    const trig = resolveTpSl()
    setPlacingLimit(true)
    setLimitError(null)
    const err = await onPlaceLimitOrder({
      side,
      collateralUsdt: collateralUsd,
      leverage,
      limitPriceUsd: limitPrice,
      slippageBps,
      takeProfitUsd: trig.takeProfit,
      stopLossUsd: trig.stopLoss,
      expiresInMs: limitExpiryMs,
    })
    setPlacingLimit(false)
    if (err) { setLimitError(err); return }
    setCollateralInput('')
    setTpSl(EMPTY_TPSL)
    setLimitPriceInput('')
    toast.success(`${side} order placed — it fills when XLM reaches $${formatTriggerPrice(limitPrice)} while this tab is open and in front.`)
  }
  const handleSubmit = () => {
    if (isLimit) { void placeLimitOrder(); return }
    autoRetriedRef.current = false // a fresh user attempt earns a new free auto-retry
    fireOpen()
  }

  // ── Slippage failure recovery ───────────────────────────────────────────────
  // The pool couldn't fill at the requested price. Offer the one fix that works
  // (a higher tolerance) as a single tap: bump the tolerance, clear the error,
  // and re-fire the open once the hook is back to idle with the new value.
  //
  // Two guards keep the ladder off cases it can't fix:
  //
  //   `oracleFloor` — the pool price is outside the protocol's oracle band. The
  //     submitted minimum is max(oracleFloor, userMinOut), so every rung sends the
  //     identical number; the ladder could only fail six more times while telling
  //     the user their settings were the problem. Gets its own callout below.
  //   `pendingPositionId` — the failure came AFTER begin_open, so the collateral is
  //     already locked in a PendingOpen. A "retry" here starts a brand-new
  //     begin_open and strands that pending (locked collateral, recovery banner) —
  //     once per tap. The recovery banner is the correct path; say so.
  const isOracleBandFailure = step === 'error' && !!error && !unavailable && !!oracleFloor
  const hasStrandedPending = !!pendingPositionId
  const isSlippageFailure =
    step === 'error' && !!error && !unavailable && slippage && !isOracleBandFailure && !hasStrandedPending
  const nextSlippageBps = SLIPPAGE_RAISE_TIERS.find((b) => b > slippageBps) ?? null
  const retryRef = useRef(false)
  // One free silent retry per user-initiated open: on the first slippage rejection
  // we bump a tier and re-fire without ever flashing the callout — pool drift is
  // usually transient, so most opens recover invisibly. The callout only appears if
  // that retry also fails (or there's no higher tier left).
  const autoRetriedRef = useRef(false)

  const raiseSlippageAndRetry = () => {
    if (nextSlippageBps == null) return
    setSlippageBps(nextSlippageBps)
    setCustomSlippage('')
    retryRef.current = true
    reset()
  }

  // Auto-retry once at the next tier before the error is ever surfaced — but only
  // within the tiers a trader would accept without being asked. Above
  // SILENT_RETRY_CEILING_BPS the retry stops being a recovery from transient drift
  // and becomes a materially worse fill, so that step gets shown and clicked.
  useEffect(() => {
    if (!isSlippageFailure || autoRetriedRef.current || nextSlippageBps == null) return
    if (nextSlippageBps > SILENT_RETRY_CEILING_BPS) return
    autoRetriedRef.current = true
    raiseSlippageAndRetry()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSlippageFailure, nextSlippageBps])

  useEffect(() => {
    if (!retryRef.current || step !== 'idle') return
    // Disarm on an idle render the retry can't use — do NOT keep waiting for one
    // it can. `canSubmit` is false throughout the error state by construction, so
    // an armed retry that survives the reset would sit there until some unrelated
    // edit made the order valid again and then place a trade the user never asked
    // for. The commonest case is exactly the stranded pending: the collateral is
    // locked, so the order no longer fits the balance.
    retryRef.current = false
    if (!canSubmit) return
    fireOpen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, canSubmit, slippageBps])

  // Suppress the callout for the render window in which we're about to fire the
  // silent auto-retry, so it never flashes before recovering on its own.
  const willAutoRetry =
    isSlippageFailure && !autoRetriedRef.current && nextSlippageBps != null && nextSlippageBps <= SILENT_RETRY_CEILING_BPS
  const showSlippageError = isSlippageFailure && !willAutoRetry

  // ── What the main button does after a failure ───────────────────────────────
  // See `openErrorAction`: a retryable failure is ONE tap (clear the error and
  // re-fire the same order), and a failure a retry would make worse — above all a
  // stranded PendingOpen — offers no retry at all, only Dismiss, with the callout
  // below pointing at the recovery banner.
  const errorAction = openErrorAction({ hasStrandedPending, isOracleBandFailure, unavailable })
  const canRetryError = step === 'error' && errorAction === 'retry'
  const showStrandedPending = step === 'error' && !!error && !unavailable && hasStrandedPending

  // Pull the pending banner in as soon as we know there is something to recover,
  // instead of leaving the callout pointing at an empty spot until the next
  // positions poll. Keyed by pending id so a refetch fires once per stranded
  // trade, not on every render of the same error.
  const strandedRefetchedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!showStrandedPending || !pendingPositionId) return
    if (strandedRefetchedRef.current === pendingPositionId) return
    strandedRefetchedRef.current = pendingPositionId
    onPendingStranded?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStrandedPending, pendingPositionId])

  // Single-tap retry: same order, same settings. Reuses the slippage ladder's
  // machinery — arm `retryRef`, reset the hook, and the effect above fires the
  // open the moment the hook is idle again.
  const retryOpen = () => {
    autoRetriedRef.current = false // a fresh user attempt earns a new free auto-retry
    retryRef.current = true
    reset()
  }

  const buttonLabel = () => {
    if (placingLimit) return <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Placing order…</>
    if (isLoading) return <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />{stepLabel}</>
    if (step === 'success') return 'Position Opened!'
    // "Try Again" on a button that only dismisses is a promise it doesn't keep —
    // it was the whole reason the old two-tap flow read as broken.
    if (step === 'error') return canRetryError ? 'Try Again' : 'Dismiss'
    // Don't quote an order the button won't place. "Long XLM · $1998" next to a red
    // "Exceeds margin balance" reads as a priced, ready trade that just needs another
    // click. Name the blocker instead, and otherwise drop the figure rather than
    // advertising a size that isn't on offer.
    if (exceedsMargin) return 'Not enough margin'
    const showSize = canSubmit && collateralUsd > 0
    if (isLimit) {
      return <><Crosshair className="w-4 h-4 mr-1.5" />Place {side} order{showSize && limitPrice != null && ` · $${positionSize.toFixed(0)} at $${formatTriggerPrice(limitPrice)}`}</>
    }
    return <><Zap className="w-4 h-4 mr-1.5" />{side === 'Long' ? 'Long' : 'Short'} XLM{showSize && ` · $${positionSize.toFixed(0)}`}</>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      data-testid="margin-open-panel"
      className={cn('relative overflow-hidden rounded-2xl flex flex-col backdrop-blur-xl border border-white/10 shadow-lg bg-white/5', className)}
    >
      {/* In-flight progress. A spinner in the button and a 3px stepper were too
          quiet for a flow that signs three transactions over several seconds —
          people tapped away mid-open and left a stranded pending behind. */}
      <AnimatePresence>
        {isLoading && <StellarOpenProgress step={step} side={side} />}
      </AnimatePresence>

      {/* Open-success celebration — the emotional beat */}
      <AnimatePresence>
        {celebration && (
          <StellarOpenCelebration
            side={celebration.side}
            leverage={celebration.leverage}
            positionUsd={celebration.positionUsd}
            onDismiss={() => setCelebration(null)}
          />
        )}
      </AnimatePresence>

      {/* Long/Short toggle */}
      <div className="relative flex rounded-t-2xl overflow-hidden">
        {(['Long', 'Short'] as const).map((d) => {
          const isActive = side === d
          const isLong = d === 'Long'
          return (
            <button
              key={d}
              data-testid={`margin-side-${d.toLowerCase()}`}
              /* Locked mid-flow. The open is three signed steps, and the inputs
                 stayed live throughout: flipping to Short while a Long was
                 executing changed what the celebration announced (it snapshots
                 the panel's CURRENT side on success) and what the silent
                 slippage auto-retry re-submitted — a retry of a trade the user
                 no longer had on screen. */
              disabled={isLoading}
              onClick={() => { setSide(d); setTpSl(EMPTY_TPSL); setLimitError(null); autoRetriedRef.current = false; if (step === 'error') reset() }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-bold transition-all duration-200',
                isLoading && 'cursor-not-allowed',
                isActive && isLong && 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-b-2 border-emerald-400',
                isActive && !isLong && 'bg-red-500/20 text-red-700 dark:text-red-300 border-b-2 border-red-400',
                !isActive && 'text-muted-foreground hover:text-foreground hover:bg-white/5 border-b border-white/5',
              )}
            >
              {isLong ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {d}
            </button>
          )
        })}
      </div>

      <div className="relative flex flex-col gap-4 p-4 flex-1">
        {/* Market / Limit. Only offered when the page can take a resting order. */}
        {onPlaceLimitOrder ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground min-w-0">
              {side === 'Long'
                ? <>Deposit <strong className="text-foreground/80">USDT</strong> → long <strong className="text-foreground/80">XLM</strong></>
                : <>Deposit <strong className="text-foreground/80">USDT</strong> → short <strong className="text-foreground/80">XLM</strong></>}
            </div>
            <div data-testid="margin-order-type" role="tablist" className="flex shrink-0 rounded-lg bg-white/5 border border-white/10 p-0.5">
              {(['market', 'limit'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={orderType === t}
                  data-testid={`margin-order-type-${t}`}
                  disabled={isLoading || placingLimit}
                  onClick={() => { setOrderType(t); setLimitError(null); if (step === 'error') reset() }}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors',
                    orderType === t ? 'bg-white/10 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    (isLoading || placingLimit) && 'cursor-not-allowed',
                  )}
                >
                  {t === 'market' ? 'Market' : 'Limit'}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            {side === 'Long'
              ? <>Deposit <strong className="text-foreground/80">USDT</strong> → long exposure to <strong className="text-foreground/80">XLM</strong></>
              : <>Deposit <strong className="text-foreground/80">USDT</strong> → short exposure on <strong className="text-foreground/80">XLM</strong></>}
          </div>
        )}

        {/* Limit price — the entry the order waits for. */}
        <AnimatePresence initial={false}>
          {isLimit && (
            <motion.div
              key="limit-price"
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              data-testid="margin-limit-block"
              className="space-y-1.5 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">
                  <TermTip tip={side === 'Long'
                    ? 'The order opens your Long when XLM falls to this price. Set it below the current market.'
                    : 'The order opens your Short when XLM rises to this price. Set it above the current market.'}>
                    Limit Price
                  </TermTip>{' '}
                  <span className="text-foreground/60 font-medium">(USD)</span>
                </label>
                <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
                  Now: {liveMark > 0 && markIsLive ? `$${formatTriggerPrice(liveMark)}` : '—'}
                </span>
              </div>
              <div className="relative">
                <Input
                  type="number" min="0" step="any" placeholder={liveMark > 0 ? formatTriggerPrice(liveMark) : '0.0000'}
                  data-testid="margin-limit-price-input"
                  disabled={isLoading || placingLimit}
                  value={limitPriceInput}
                  onChange={(e) => { setLimitPriceInput(e.target.value); setLimitError(null) }}
                  className={cn('pr-12 bg-white/5 border-white/10 text-sm font-mono focus:border-primary/50 focus:ring-0',
                    limitPriceInput !== '' && limitBlockReason && 'border-amber-500/50')}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted-foreground bg-white/8 px-1.5 py-0.5 rounded-md">$</span>
              </div>
              {/* Offsets from the mark, on the side the order can fill from. */}
              {liveMark > 0 && markIsLive && (
                <div className="flex items-center gap-1.5 pt-0.5" data-testid="margin-limit-presets">
                  {LIMIT_OFFSET_PCTS.map((pct) => {
                    const target = side === 'Long' ? liveMark * (1 - pct / 100) : liveMark * (1 + pct / 100)
                    const active = limitPrice != null && Math.abs(limitPrice - target) / target < 1e-3
                    return (
                      <button
                        key={pct}
                        type="button"
                        disabled={isLoading || placingLimit}
                        onClick={() => { setLimitPriceInput(formatTriggerPrice(target)); setLimitError(null) }}
                        className={cn(
                          'flex-1 rounded-md border py-1 text-[10px] font-semibold transition-colors',
                          active ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground',
                          (isLoading || placingLimit) && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        {side === 'Long' ? '−' : '+'}{pct}%
                      </button>
                    )
                  })}
                </div>
              )}
              {limitPriceInput !== '' && limitBlockReason && (
                <p className="text-[10px] text-amber-700 dark:text-amber-400 pl-1">{limitBlockReason}</p>
              )}
              {limitOffsetPct != null && (
                <p className="text-[10px] text-muted-foreground pl-1 tabular-nums">
                  {Math.abs(limitOffsetPct).toFixed(2)}% {limitOffsetPct < 0 ? 'below' : 'above'} the market right now.
                </p>
              )}
              <div className="flex items-center justify-between pt-1">
                <TermTip tip="If XLM hasn’t reached your price by then, the order lapses and nothing is opened." className="text-xs text-muted-foreground">Good for</TermTip>
                <div className="flex items-center gap-1">
                  {LIMIT_EXPIRY_OPTIONS.map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      disabled={isLoading || placingLimit}
                      onClick={() => setLimitExpiryMs(o.ms)}
                      className={cn('text-[10px] font-medium px-2 py-0.5 rounded-md',
                        limitExpiryMs === o.ms ? 'bg-primary/20 text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground')}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collateral input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground"><TermTip tip="The amount you put up from your margin account to back this trade — your maximum loss.">Collateral</TermTip> <span className="text-foreground/60 font-medium">(USDT)</span></label>
            <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
              Margin: {floorTo(availableMargin, 4)} USDT
            </span>
          </div>
          <div className="relative">
            <Input
              type="number" min="0" step="any" placeholder="0.00"
              data-testid="margin-collateral-input"
              disabled={isLoading}
              value={collateralInput}
              onChange={(e) => { setCollateralInput(e.target.value); if (step === 'error') reset() }}
              className={cn('pr-16 bg-white/5 border-white/10 text-sm font-mono focus:border-primary/50 focus:ring-0', exceedsMargin && 'border-red-500/50')}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted-foreground bg-white/8 px-1.5 py-0.5 rounded-md">USDT</span>
          </div>
          {/* Fractions of the balance, because "how much of what I have" is the
              question people actually answer — typing a number is the workaround
              they used instead. Every one of these floors rather than rounds:
              `toFixed` rounds half up, so Max on a balance of 10.00005 filled in
              10.0001 — above what the user has — and tripped the panel's own
              "Exceeds margin balance" error on the number the panel had just
              written. That fired on roughly every second use, and the quarters
              would land in the same trap for the same reason. */}
          {availableMargin > 0 && (
            <div className="flex items-center gap-1.5 pt-0.5" data-testid="margin-collateral-presets">
              {COLLATERAL_PRESETS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  disabled={isLoading}
                  onClick={() => setCollateralInput(floorTo(availableMargin * pct, 4))}
                  className={cn(
                    'flex-1 rounded-md border border-white/10 bg-white/5 py-1 text-[10px] font-semibold text-muted-foreground',
                    'hover:bg-white/10 hover:text-foreground transition-colors',
                    isLoading && 'cursor-not-allowed opacity-50',
                  )}
                >
                  {pct === 1 ? 'Max' : `${Math.round(pct * 100)}%`}
                </button>
              ))}
            </div>
          )}
          {exceedsMargin && <p className="text-[10px] text-red-400 pl-1">Exceeds margin balance ({floorTo(availableMargin, 4)} USDT)</p>}
        </div>

        {/* Leverage slider — integer 2..MAX_LEVERAGE (V3 global cap) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <TermTip tip="Multiplies your position size — and your gains and losses. Higher leverage moves the liquidation price closer." className="text-xs text-muted-foreground">Leverage</TermTip>
            <span className={cn('text-sm font-bold tabular-nums px-2 py-0.5 rounded-md',
              leverage <= 2 ? 'text-emerald-400 bg-emerald-500/10' : leverage <= 3 ? 'text-yellow-400 bg-yellow-500/10' : 'text-red-400 bg-red-500/10')}>
              {leverage}×
            </span>
          </div>
          <Slider min={2} max={MAX_LEVERAGE} step={1} value={[leverage]} onValueChange={([v]) => setLeverage(v)} disabled={isLoading} className="w-full" />
          <div className="flex justify-between px-0.5">
            {LEVERAGE_MARKS.map((m) => (
              <button key={m} data-testid={`margin-leverage-${m}`} disabled={isLoading} onClick={() => setLeverage(m)} className={cn('text-[10px] font-medium', leverage >= m ? 'text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground', isLoading && 'cursor-not-allowed')}>{m}×</button>
            ))}
          </div>
        </div>

        {/* Slippage — ringed while a slippage failure is on screen, so the callout's
            "raise it" advice points at something the eye can find. */}
        <div className={cn('flex items-center justify-between transition-all duration-300',
          isSlippageFailure && '-mx-2 px-2 py-1.5 rounded-lg ring-2 ring-amber-500/40 bg-amber-500/5')}>
          <TermTip tip="How much worse than the shown price your trade may fill before it's rejected." className="text-xs text-muted-foreground">Max Slippage</TermTip>
          <div className="flex items-center gap-1">
            {/* The 40% chip that used to sit here (TEMP(keeper-tp-e2e), to let the
                oracle floor bind through Aquarius drift) is gone: one click away from
                0.5% is not where a 40%-worse fill belongs. The capability is intact —
                the custom field below still accepts anything up to 50%, which is what
                a short blocked by the pool floor needs, deliberately typed. */}
            {[50, 100, 200].map((bps) => (
              <button key={bps} disabled={isLoading} onClick={() => { setSlippageBps(bps); setCustomSlippage('') }}
                className={cn('text-[10px] font-medium px-2 py-0.5 rounded-md', slippageBps === bps && customSlippage === '' ? 'bg-primary/20 text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground', isLoading && 'cursor-not-allowed')}>
                {bps / 100}%
              </button>
            ))}
            {/* Custom slippage — type any % up to 50%; converts to bps (1% = 100 bps) */}
            <div className={cn('flex items-center gap-0.5 rounded-md pl-1.5 pr-1 py-0.5 border',
              customSlippage !== '' ? 'border-primary/40 bg-primary/10' : 'border-border/40')}>
              <input
                type="number"
                inputMode="decimal"
                placeholder="Custom"
                min={0.01}
                max={50}
                step={0.1}
                disabled={isLoading}
                value={customSlippage}
                onChange={(e) => {
                  const raw = e.target.value
                  setCustomSlippage(raw)
                  if (raw === '') return
                  const pct = Math.min(50, Math.max(0.01, parseFloat(raw) || 0))
                  setSlippageBps(Math.round(pct * 100))
                }}
                // The value above is clamped to 0.01–50 but the field kept whatever
                // was typed, so "99" stayed on screen while the order went out at
                // 50%. Snap the text to what will actually be used, once the user is
                // done typing (clamping per keystroke would fight partial input).
                onBlur={() => {
                  if (customSlippage === '') return
                  const pct = Math.min(50, Math.max(0.01, parseFloat(customSlippage) || 0))
                  setCustomSlippage(String(pct))
                  setSlippageBps(Math.round(pct * 100))
                }}
                className="w-12 bg-transparent text-[10px] font-medium text-right text-primary placeholder:text-muted-foreground/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-[10px] text-muted-foreground/50">%</span>
            </div>
          </div>
        </div>

        {/* Take-Profit / Stop-Loss — expandable, optional */}
        <StellarTpSlControls
          side={side}
          entryPrice={tpSlRef}
          markIsLive={markIsLive}
          fillPrice={fillPrice}
          positionUsd={positionSize}
          collateralUsd={collateralUsd}
          liqPrice={liqPriceDisplay}
          /* Suppresses the controls' "these only run while this page is open"
             notice — replaced below by the offer, which says the same thing and
             does something about it. */
          alwaysOnActive={offerAlwaysOn && alwaysOnOptIn}
          value={tpSl}
          onChange={setTpSl}
        />

        {/* Always-on, offered where the protection is chosen rather than only in
            the edit popover of a position that already exists. Nothing is armed
            here — the keeper signs against a position id, which doesn't exist
            until the trade lands — so this is an intent the page acts on
            afterwards, and the copy has to promise exactly that and no more. */}
        <AnimatePresence>
          {offerAlwaysOn && (
            <motion.label
              data-testid="margin-open-alwayson"
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2.5 px-2.5 py-2 rounded-xl bg-white/[0.03] border border-white/5 overflow-hidden cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold">Keep watching if I close the tab</span>
                  <input
                    type="checkbox"
                    /* Without this the label's whole explanatory paragraph becomes
                       the control's name — a screen reader reads two sentences
                       about tabs and stop-losses before saying "checkbox". */
                    aria-label="Keep watching if I close the tab"
                    checked={alwaysOnOptIn}
                    disabled={isLoading}
                    onChange={(e) => setAlwaysOnOptIn(e.target.checked)}
                    className="w-4 h-4 shrink-0 accent-[hsl(var(--primary))] cursor-pointer"
                  />
                </span>
                <span className="block text-[10px] leading-snug text-muted-foreground mt-0.5">
                  {alwaysOnOptIn
                    ? 'You’ll sign once more right after the trade opens — that signature is what lets us close it while you’re away.'
                    : 'Without this, your take-profit and stop-loss only run while this page is open.'}
                </span>
              </span>
            </motion.label>
          )}
        </AnimatePresence>

        {/* Order summary */}
        <AnimatePresence>
          {/* `tpSlRef > 0` keeps the summary hidden until a price is actually known,
              rather than briefly quoting "XLM Price $0.0000" on first paint. */}
          {collateralUsd > 0 && tpSlRef > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              data-testid="margin-order-summary"
              className="rounded-xl bg-white/3 border border-white/5 px-3 py-2 overflow-hidden">
              <StatRow label={<TermTip tip="Collateral × leverage — your total exposure to XLM.">Position Size</TermTip>} value={`$${positionSize.toFixed(2)}`} />
              {/* `borrowed` is a USD figure. A long borrows USDT, so it is already the
                  right number in the right unit. A short borrows XLM, so price it —
                  in the display domain, so it matches the chart and the rows around it. */}
              <StatRow
                label={<TermTip tip={side === 'Short'
                  ? 'A short borrows its whole position in XLM and sells it — this is the XLM you buy back when you close.'
                  : 'Borrowed automatically to build the position — paid back when you close.'}>{`Borrow (${side === 'Short' ? 'XLM' : 'USDT'})`}</TermTip>}
                value={side === 'Short' ? (tpSlRef > 0 ? (borrowed / tpSlRef).toFixed(2) : '—') : borrowed.toFixed(2)}
              />
              {/* Holding cost. Interest accrues on the borrow from the moment
                  the position opens and is netted out of its live PnL, so a
                  trader who never saw a rate still paid one. Shown only when the
                  chain actually answered — a hidden row is honest, a fabricated
                  "0%" is not. A genuine zero, on the other hand, is worth saying
                  out loud: it is the current state of these vaults, and it is
                  the sort of thing that changes without the UI being touched. */}
              {borrowRateYearly != null && (
                <StatRow
                  label={
                    <TermTip tip="Interest on the borrowed amount, charged for as long as the position is open. It accrues continuously and comes off your profit when you close — the live PnL below already has it deducted.">
                      Borrow Rate
                    </TermTip>
                  }
                  value={
                    borrowRateYearly <= 0
                      ? '0% p.a. · free right now'
                      : `${(borrowRateYearly * 100).toFixed(2)}% p.a.` +
                        (borrowCostPerDay != null ? ` · ≈ $${borrowCostPerDay.toFixed(borrowCostPerDay < 0.1 ? 4 : 2)}/day` : '')
                  }
                />
              )}
              {isLimit && limitPrice != null ? (
                <>
                  <StatRow label={<TermTip tip="The order opens at this price — every number in this summary assumes that entry.">Limit Price</TermTip>} value={`$${formatTriggerPrice(limitPrice)}`} />
                  <StatRow label="XLM Price now" value={`$${liveMark.toFixed(4)}`} />
                </>
              ) : (
                <StatRow label="XLM Price" value={`$${tpSlRef.toFixed(4)}`} />
              )}
              {/* What the trade actually fills at. The row above is the price
                  FEED; this is the pool, quoted at this exact size. They diverge
                  with size — and at 5× a 5% divergence is 25% of the trader's
                  equity — so the number they are really getting has to be on
                  screen before they commit, not discoverable afterwards from a
                  PnL that starts negative. */}
              {execQuote && (
                <StatRow
                  label={
                    <TermTip tip="The price this trade is expected to fill at, quoted from the live pool at your size. It differs from the market price above because larger orders move the pool.">
                      Est. Fill Price
                    </TermTip>
                  }
                  value={
                    `$${execQuote.entryPrice.toFixed(4)}` +
                    (execQuote.gapPct != null && Math.abs(execQuote.gapPct) >= 0.05
                      ? `  (${execQuote.gapPct > 0 ? '−' : '+'}${Math.abs(execQuote.gapPct).toFixed(2)}%)`
                      : '')
                  }
                  warn={execQuote.gapPct != null && execQuote.gapPct >= FILL_GAP_WARN_PCT}
                />
              )}
              <StatRow
                label={
                  <TermTip tip="If XLM reaches this price, the position is closed automatically to cover its debt.">
                    {side === 'Long' ? 'Est. Liq. ↓' : 'Est. Liq. ↑'}
                  </TermTip>
                }
                value={
                  liqPriceDisplay
                    ? `$${liqPriceDisplay.toFixed(4)}${liqDistancePct != null ? `  (${(liqDistancePct * 100).toFixed(0)}% away)` : ''}`
                    : '—'
                }
                warn={liqIsTight}
              />
              {/* The protection, in the summary that is supposed to be the last
                  word before committing. It listed size, borrow, price and
                  liquidation — everything except the two numbers the trader had
                  just chosen, so the one place to check the whole order left out
                  the part that decides when it ends. Only shown once a trigger
                  actually validates; an invalid row is the block reason's job. */}
              {tpSlValidation.ok && tpSlValidation.triggers.takeProfit != null && (
                <StatRow
                  label={<TermTip tip="We close the position automatically when XLM reaches this price, locking in the gain.">Take-Profit</TermTip>}
                  value={`$${formatTriggerPrice(tpSlValidation.triggers.takeProfit)}`}
                />
              )}
              {tpSlValidation.ok && tpSlValidation.triggers.stopLoss != null && (
                <StatRow
                  label={<TermTip tip="We close the position automatically when XLM reaches this price, capping the loss.">Stop-Loss</TermTip>}
                  value={`$${formatTriggerPrice(tpSlValidation.triggers.stopLoss)}`}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* What the order costs in money, under the summary that describes it in
            ratios. Same gate as the summary itself (`tpSlRef > 0`), so the two
            appear and disappear together. */}
        <AnimatePresence>
          {collateralUsd > 0 && tpSlRef > 0 && perOnePctMoveUsd != null && (
            <motion.p
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              data-testid="margin-risk-sentence"
              className="text-[11px] leading-relaxed text-muted-foreground overflow-hidden px-1"
            >
              Every 1% XLM move is{' '}
              <strong className="text-foreground/90 font-semibold tabular-nums">
                ±${perOnePctMoveUsd.toFixed(perOnePctMoveUsd < 1 ? 3 : 2)}
              </strong>{' '}
              — {leverage}% of your collateral.
              {liqDistancePct != null && (
                <>
                  {' '}A{' '}
                  <strong className={cn('font-semibold tabular-nums', liqIsTight ? 'text-red-400' : 'text-foreground/90')}>
                    {(liqDistancePct * 100).toFixed(0)}% {side === 'Long' ? 'drop' : 'rise'}
                  </strong>{' '}
                  liquidates it.
                </>
              )}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Exit-capacity warning — the trade opens, but couldn't be closed again
            at this size right now. Deliberately below the summary and above the
            button: it is a fact about the order that has just been described,
            and the last thing read before committing. */}
        <AnimatePresence>
          {exitCapacity.status === 'blocked' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              data-testid="margin-exit-warning"
              className="rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2.5 overflow-hidden"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-amber-900 dark:text-amber-200">Hard to close at this size</p>
                  <p className="text-[11px] leading-snug text-amber-800/90 dark:text-amber-300/90 mt-0.5">
                    {exitCapacity.maxCollateral != null ? (
                      <>
                        You could open this, but closing it would need about{' '}
                        {(exitCapacity.shortfall * 100).toFixed(1)}% more than the pool pays at that size — so
                        you’d be holding it until the market moves back.{' '}
                        {side === 'Short'
                          ? 'You could also repay part of the debt first to get out.'
                          : 'There is no way to shrink a long position, so the wait is the only exit.'}
                      </>
                    ) : (
                      <>
                        Closing is out of reach at every size right now — the pool is trading outside the
                        band the contract accepts. This usually clears on its own within minutes.
                      </>
                    )}
                  </p>
                  {exitCapacity.maxCollateral != null && (
                    <button
                      type="button"
                      onClick={() => setCollateralInput(floorTo(exitCapacity.maxCollateral as number, 2))}
                      className="mt-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer
                        bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30
                        text-amber-900 dark:text-amber-200 transition-colors"
                    >
                      Use {floorTo(exitCapacity.maxCollateral, 2)} USDT instead
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* No-margin prompt */}
        <AnimatePresence>
          {noMargin && (
            <motion.button
              onClick={onAddCollateral}
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs text-left overflow-hidden hover:bg-amber-500/15"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>No USDT in margin. <strong>Add collateral</strong> to start trading.</span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Status: calm "not live yet" gate vs. a real error */}
        <AnimatePresence>
          {step === 'error' && error && unavailable && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs overflow-hidden">
              <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Live trading is being finalized. Please check back shortly.</span>
            </motion.div>
          )}
          {/* Pool price outside the protocol's oracle band. Looks like a slippage
              rejection and is NOT one: the tolerance can't close this gap and neither
              can a smaller size (the gap is a standing spread, not price impact — a $2
              trade measured the same 5.9% as a $400 one). So: no retry button, no
              tolerance chip, and the one thing that does help — the pool rebalancing,
              which the user's own open position moved in the first place. */}
          {/* The open failed AFTER begin_open: the collateral is locked in a
              PendingOpen that only the recovery banner can finish or release.
              Ranked above the oracle-band callout (both can be true when the swap
              leg is what got rejected) because the locked collateral is the part
              the user has to act on. */}
          {showStrandedPending && (
            <motion.div
              key="stranded-pending-error"
              data-testid="margin-stranded-pending-error"
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-3">
                <div className="flex items-start gap-2.5">
                  <span className="grid place-items-center w-7 h-7 rounded-full bg-amber-500/25 text-amber-700 dark:text-amber-300 shrink-0">
                    <Clock className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-amber-900 dark:text-amber-200">This trade is half-placed</p>
                    <p className="text-xs leading-snug text-amber-900/80 dark:text-amber-200/80 mt-0.5">
                      Your collateral is still held by the unfinished trade. Use <strong>Finish</strong> or{' '}
                      <strong>Cancel &amp; recover</strong> in the banner at the top of this page — starting a new
                      trade here would leave this one stranded.
                    </p>
                    <p className="text-[11px] text-amber-900/60 dark:text-amber-200/60 mt-1">{error}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          {isOracleBandFailure && !showStrandedPending && (
            <motion.div
              key="oracle-band-error"
              data-testid="margin-oracle-band-error"
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-3">
                <div className="flex items-start gap-2.5">
                  <span className="grid place-items-center w-7 h-7 rounded-full bg-amber-500/25 text-amber-700 dark:text-amber-300 shrink-0">
                    <Clock className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Market is out of line right now</p>
                    <p className="text-xs leading-snug text-amber-900/80 dark:text-amber-200/80 mt-0.5">
                      XLM is trading too far from its reference price for us to open this safely, so nothing
                      was placed and nothing was spent. This isn&apos;t your settings or your size — it clears as
                      the market comes back in line.
                    </p>
                    {oracleFloor?.gapPct != null && (
                      <p className="text-[11px] text-amber-900/60 dark:text-amber-200/60 mt-1 tabular-nums">
                        Currently {oracleFloor.gapPct.toFixed(1)}% out of line · we can trade up to {oracleFloor.maxGapPct}%.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Button
                    variant="ghost"
                    onClick={reset}
                    className="h-8 px-3 text-xs font-semibold text-amber-900/70 dark:text-amber-200/70 hover:bg-amber-500/15"
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
          {/* Slippage / pool-liquidity rejection — the most common live failure, and
              the only one the user can fix themselves. Gets a full callout with the
              fix one tap away instead of a thin red line that's easy to miss. */}
          {showSlippageError && (
            <motion.div
              key="slippage-error"
              data-testid="margin-slippage-error"
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <motion.div
                animate={{ x: [0, -7, 7, -4, 4, 0] }}
                transition={{ duration: 0.45, ease: 'easeInOut' }}
                className="rounded-xl border-2 border-amber-500/50 bg-amber-500/15 px-3.5 py-3 shadow-[0_0_0_4px_rgba(245,158,11,0.10)]"
              >
                <div className="flex items-start gap-2.5">
                  <span className="grid place-items-center w-7 h-7 rounded-full bg-amber-500/25 text-amber-700 dark:text-amber-300 shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Couldn&apos;t lock in your price</p>
                    <p className="text-xs leading-snug text-amber-900/80 dark:text-amber-200/80 mt-0.5">
                      XLM&apos;s price shifted while your trade was going through, so it was cancelled before anything changed — your funds are safe.
                      {nextSlippageBps != null
                        ? ' Allow a little more price movement and try again:'
                        : ' Try a smaller size, or come back when the market settles.'}
                    </p>
                    <p className="text-[11px] text-amber-900/60 dark:text-amber-200/60 mt-1 tabular-nums">
                      Currently allowing {slippageBps / 100}% movement.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  {nextSlippageBps != null && (
                    <Button
                      onClick={raiseSlippageAndRetry}
                      className="flex-1 h-9 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white"
                    >
                      Allow {nextSlippageBps / 100}% &amp; try again
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={reset}
                    className="h-8 px-3 text-xs font-semibold text-amber-900/70 dark:text-amber-200/70 hover:bg-amber-500/15"
                  >
                    Dismiss
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Fallback red line — everything the two callouts above didn't claim.
              Keyed off what actually RENDERED, not off `slippage`: a post-begin
              slippage failure sets that flag but is deliberately excluded from the
              callout (its collateral is locked in a pending), and matching on the
              flag left that case showing no message at all. */}
          {step === 'error' && error && !unavailable && !showSlippageError && !willAutoRetry && !isOracleBandFailure && !showStrandedPending && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-800 dark:text-red-300 text-xs overflow-hidden">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stepper progress (during the 3-step V3 flow) */}
        {isLoading && (
          <div className="flex items-center gap-1">
            {Array.from({ length: STEP_COUNT }, (_, i) => i + 1).map((n) => (
              <div key={n} className={cn('h-1 flex-1 rounded-full transition-colors', STEP_PROGRESS[step] >= n ? 'bg-primary' : 'bg-white/10')} />
            ))}
          </div>
        )}

        {/* Submit */}
        <div className="mt-auto pt-1">
          {/* What's-missing hint — keeps a greyed-out trade button from ever being
              an unexplained dead end. */}
          {/* Amber when the thing standing in the way is the protection the user
              asked for: "you haven't entered a size yet" is a nudge, "your
              stop-loss won't be applied" is a warning, and they must not look
              the same. */}
          {blockReason && (
            <p
              data-testid="margin-open-block-reason"
              id="margin-open-block-reason"
              /* A disabled button announces "dimmed" and nothing else, so the one
                 sentence saying what to fix has to reach the screen reader on its
                 own — and again when it changes. */
              aria-live="polite"
              className={cn(
                'text-center text-[11px] pb-2',
                tpSlBlockReason ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
              )}
            >
              {blockReason}
            </p>
          )}
          {isLimit && limitError && (
            <p role="alert" className="text-center text-[11px] pb-2 text-red-500 dark:text-red-400">{limitError}</p>
          )}
          {!isConnected ? (
            /* A dead-end grey line used to sit here: the page offered a logged-out
               visitor no way forward at all, and the risk-free entry point (practice
               mode) was a small unlabelled switch in the far corner. Both are now
               one tap away, right where the trade button would be. */
            <div className="space-y-2">
              <Button
                data-testid="margin-login-cta"
                onClick={() => login()}
                className="w-full font-bold text-sm h-11 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Log in to trade
              </Button>
              <div className="flex items-center justify-center text-[11px]">
                <button
                  onClick={() => { void connect() }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Use a Stellar wallet
                </button>
              </div>
            </div>
          ) : (
            <Button
              data-testid="margin-open-submit"
              onClick={step === 'error' ? (canRetryError ? retryOpen : reset) : handleSubmit}
              disabled={step !== 'error' && !canSubmit}
              aria-describedby={blockReason ? 'margin-open-block-reason' : undefined}
              className={cn('w-full font-bold text-sm h-11 transition-all duration-200',
                step === 'success' ? 'bg-emerald-400 text-white'
                  : step === 'error' ? 'bg-white/10 hover:bg-white/15 text-foreground border border-white/15'
                  : side === 'Long' ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white',
                (step !== 'error' && !canSubmit) && 'opacity-40 cursor-not-allowed')}
            >
              {buttonLabel()}
            </Button>
          )}
          {/* Testnet oracle honesty: the chart follows the market feed, the
              contract fills at its own oracle price, and on testnet the two can
              drift apart. One quiet line under the trade button, so the first
              fill that lands a little off the chart isn't read as a bug. Gated
              on the config so it disappears with a mainnet deployment. */}
          {isConnected && isLimit && (
            <p data-testid="margin-limit-note" className="pt-2 text-center text-[10px] leading-snug text-muted-foreground/70">
              Fills from this page — keep this tab open and in front; browsers slow a hidden tab down. Your collateral stays in margin until it fills, and TP/SL apply from the fill.
            </p>
          )}
          {isConnected && CFG.network.name === 'testnet' && (
            <p
              data-testid="margin-open-price-note"
              className="pt-2 text-center text-[10px] leading-snug text-muted-foreground/60"
            >
              Your entry price can differ slightly from the chart — testnet prices update on their own schedule.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  )
}
