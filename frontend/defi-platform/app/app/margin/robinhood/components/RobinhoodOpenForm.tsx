'use client'

/**
 * The trade ticket (guide 6B and 6C), built as three questions a first-time
 * trader can answer without knowing the vocabulary: which way NVDA goes, how
 * much to put in, how much boost. Under them the "what if" preview shows the
 * outcome of any price move before anything is signed.
 *
 * Underneath it is the same quote as before: the amount is converted to
 * pUSDG shares at the live exchange rate and a quote runs against it,
 * carrying every number the executor will enforce (notional, the opening fee
 * with the ceiling that goes on chain, the flash leg with its fee, the debt
 * against the cap, the minimum output). Those sit behind "Fees and limits".
 * The button only arms when the quote has `params`, i.e. no issue blocks.
 * Signing re-quotes once more; a fee above the accepted ceiling comes back as
 * a new quote for approval, never as a silently raised limit.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight, ChevronDown, Fuel, PiggyBank } from 'lucide-react'
import { Button } from '@/components/ui/button'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'
import { formatUnits } from 'viem'
import { ROBINHOOD_DECIMALS, ROBINHOOD_TOKENS } from '@/config/robinhood'
import type { RobinhoodMarketAvailability } from '@/hooks/use-robinhood-margin-market'
import { useRobinhoodMarginOpen, useRobinhoodOpenQuote } from '@/hooks/use-robinhood-margin-open'
import {
  maxMarginValueForCapsUsd18,
  ROBINHOOD_DEFAULT_FEE_TOLERANCE_BPS,
  type RobinhoodDirection,
  type RobinhoodOpenQuote,
  type RobinhoodOpenQuoteInput,
} from '@/lib/robinhood/open'
import type { RobinhoodAccountState, RobinhoodMarketState } from '@/lib/robinhood/reads'
import { robinhoodGasStatus } from '@/lib/robinhood/gas'
import { healthFromBps, leverageFromX100, underlyingFromShares } from '@/lib/robinhood/units'
import { lowerLeverage } from '@/lib/robinhood/moments'
import { liquidationMove, riskMood, RISK_MOOD_LABEL, type RiskMood, type ScenarioInput } from '@/lib/robinhood/scenario'
import { MARGIN_POINTS } from '@/lib/rewards/policy'
import { requestRobinhoodPanel, showRobinhoodMoment, useRobinhoodPanelRequest } from '@/hooks/use-robinhood-moment'
import {
  formatNvda18Display,
  formatSharesAsUsdg,
  formatUsd18Display,
  formatUsdg6Display,
  formatUsdNumber,
  maxMarginSharesForFee,
  parseUsdgInput,
  sharesForUsd18,
  sharesForUsdg6,
  usdg6ToInput,
} from '../lib/format'
import { RobinhoodFlowError, RobinhoodTxSteps } from './RobinhoodTxSteps'
import { RobinhoodErrorCard, Shake } from './moments/RobinhoodErrorCard'
import { CHIP, CHIP_ACTIVE, CHIP_IDLE, RobinhoodScenario } from './RobinhoodScenario'

const ConnectWalletButton = dynamic(
  () => import('@/components/wallet/connect-wallet-button').then((m) => m.ConnectWalletButton),
  { ssr: false },
)

/** What the ticket would open, for the chart to draw before anything is signed. */
export interface RobinhoodDraftOverlay {
  direction: RobinhoodDirection
  liquidationPrice: number | null
  targetPrice: number | null
}

interface Props {
  market: RobinhoodMarketState | undefined
  availability: RobinhoodMarketAvailability
  account: RobinhoodAccountState | undefined
  connected: boolean
  onDraftChange?: (draft: RobinhoodDraftOverlay | null) => void
  className?: string
}

const LEVERAGE_STOPS = [1.5, 2, 3, 4, 5]
const AMOUNT_CHIPS: Array<{ label: string; part: bigint }> = [
  { label: '25%', part: 25n },
  { label: '50%', part: 50n },
  { label: 'Max', part: 100n },
]

/** How the boost reads: quiet for a comfortable distance to liquidation, warmer as it shrinks. */
const MOOD_STYLE: Record<RiskMood, { text: string; range: string }> = {
  calm: { text: 'text-muted-foreground', range: 'bg-emerald-500' },
  balanced: { text: 'text-muted-foreground', range: 'bg-emerald-500' },
  bold: { text: 'text-amber-600 dark:text-amber-400', range: 'bg-amber-500' },
  wild: { text: 'text-orange-600 dark:text-orange-400', range: 'bg-orange-500' },
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

const isUsdg = (asset: string) => asset.toLowerCase() === ROBINHOOD_TOKENS.USDG.toLowerCase()
const formatAsset = (asset: string, raw: bigint | null) => (isUsdg(asset) ? formatUsdg6Display(raw) : formatNvda18Display(raw))
const usd18 = (v: bigint | null | undefined) =>
  v === null || v === undefined ? null : Number(formatUnits(v, ROBINHOOD_DECIMALS.usd18))

function Line({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">
        <span className="font-medium">{value}</span>
        {hint && <span className="block text-[10px] text-muted-foreground/60">{hint}</span>}
      </span>
    </div>
  )
}

function QuoteDetails({ quote, rate }: { quote: RobinhoodOpenQuote; rate: bigint | null }) {
  const borrowed = quote.flashAmount !== null ? quote.flashAmount + (quote.flashFee ?? 0n) : null
  const feePct = quote.openFeeBps !== null ? `${(quote.openFeeBps / 100).toFixed(2)}% of size` : undefined
  return (
    <div className="space-y-1.5 rounded-xl border border-foreground/[0.06] bg-background p-3">
      <Line label="Your margin" value={formatUsdg6Display(quote.marginUnderlying)} />
      <Line
        label="Position size"
        value={formatUsd18Display(quote.requestedNotionalUsd18)}
        hint="requested, the fill can be lower"
      />
      <Line
        label="Borrowed"
        value={formatAsset(quote.flashAsset, borrowed)}
        hint={
          quote.estimatedDebtUsd18 === null
            ? undefined
            : isUsdg(quote.flashAsset)
              ? 'borrow fee included'
              : `about ${formatUsd18Display(quote.estimatedDebtUsd18)}, borrow fee included`
        }
      />
      <Line
        label="You receive at least"
        value={formatAsset(quote.minPositionAsset, quote.minPositionUnderlying)}
        hint={quote.input.direction === 'short' ? 'held as USDG, your margin included' : undefined}
      />
      <Line
        label="Opening fee"
        value={formatUsd18Display(quote.openingFeeUsd18)}
        hint={
          quote.maxOpeningFeePToken !== null && quote.maxOpeningFeePToken > 0n
            ? `at most ${formatSharesAsUsdg(quote.maxOpeningFeePToken, rate)}${feePct ? `, ${feePct}` : ''}`
            : feePct
        }
      />
    </div>
  )
}

function DirectionButton({
  d,
  active,
  disabled,
  onClick,
}: {
  d: RobinhoodDirection
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  const long = d === 'long'
  const Icon = long ? ArrowUpRight : ArrowDownRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed',
        active
          ? long
            ? 'bg-emerald-500 text-white shadow-sm dark:text-emerald-950'
            : 'bg-red-500 text-white shadow-sm dark:text-red-950'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={2.5} />
      NVDA goes {long ? 'up' : 'down'}
    </button>
  )
}

function SectionLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  const cls = 'text-xs font-semibold text-muted-foreground'
  return htmlFor ? (
    <label htmlFor={htmlFor} className={cls}>
      {children}
    </label>
  ) : (
    <span className={cls}>{children}</span>
  )
}

export function RobinhoodOpenForm({ market, availability, account, connected, onDraftChange, className }: Props) {
  const [direction, setDirection] = useState<RobinhoodDirection>('long')
  const [amountText, setAmountText] = useState('')
  const [leverage, setLeverage] = useState(2)
  const [showDetails, setShowDetails] = useState(false)
  const [engaged, setEngaged] = useState(false)
  const flow = useRobinhoodMarginOpen()
  const rootRef = useRef<HTMLDivElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  const risk = direction === 'long' ? market?.pairRisk.long : market?.pairRisk.short
  const maxLeverage = risk ? risk.maxLeverageX100 / 100 : 5
  const lev = Math.min(leverage, maxLeverage)
  const leverageX100 = Math.round(lev * 100)
  const rate = market?.markets.pUSDG.exchangeRate ?? null
  const usdgPrice = market?.prices.usdg.priceUsd18 ?? null
  const nvdaPrice = usd18(market?.prices.nvda.priceUsd18)
  const canOpen = direction === 'long' ? availability.canOpenLong : availability.canOpenShort

  const amount6 = parseUsdgInput(amountText)
  const marginShares = amount6 !== null && rate ? sharesForUsdg6(amount6, rate) : null
  const marginUsd = amount6 !== null ? Number(formatUnits(amount6, ROBINHOOD_DECIMALS.USDG)) : 0

  const input = useMemo<RobinhoodOpenQuoteInput | null>(
    () => (marginShares && marginShares > 0n ? { direction, marginShares, leverageX100 } : null),
    [direction, marginShares, leverageX100],
  )
  const debounced = useDebounced(input, 400)
  const {
    quote,
    isFetching,
    isPlaceholder,
    error: quoteError,
    refetch: refetchQuote,
  } = useRobinhoodOpenQuote(debounced, {
    enabled: !flow.isRunning && flow.status !== 'requote',
  })
  const quoteMatches = !!quote && !!input && !isPlaceholder && debounced === input

  // Sizing hints: the largest margin the free balance can carry with its fee,
  // and the largest the dollar caps allow at this leverage.
  const free = account?.vault.freeShares ?? null
  const maxByFree =
    free != null && market?.openFeeBps != null
      ? maxMarginSharesForFee(free, market.openFeeBps, leverageX100, ROBINHOOD_DEFAULT_FEE_TOLERANCE_BPS)
      : null
  const maxByCaps =
    risk && usdgPrice && rate ? sharesForUsd18(maxMarginValueForCapsUsd18(risk, leverageX100), usdgPrice, rate) : null
  const maxShares =
    maxByFree !== null && maxByCaps !== null ? (maxByFree < maxByCaps ? maxByFree : maxByCaps) : (maxByFree ?? maxByCaps)

  const setPart = (part: bigint) => {
    if (!maxShares || !rate) return
    setAmountText(usdg6ToInput(underlyingFromShares((maxShares * part) / 100n, rate)))
  }
  const setMax = () => setPart(100n)
  const emptyAccount = connected && free === 0n && (account?.vault.lockedShares ?? 0n) === 0n

  // Gas is not part of the quote: the engine has no opinion on whether the
  // wallet can pay for the five transactions an open costs.
  const gas = useMemo(() => robinhoodGasStatus(account?.gas), [account?.gas])

  const scenarioInput = useMemo<ScenarioInput>(
    () => ({
      direction,
      marginUsd: marginUsd > 0 ? marginUsd : 1,
      leverage: lev,
      maintenanceBps: risk?.maintenanceMarginBps ?? null,
      openFeeBps: market?.openFeeBps ?? null,
      closeFeeBps: market?.closeFeeBps ?? null,
    }),
    [direction, marginUsd, lev, risk?.maintenanceMarginBps, market?.openFeeBps, market?.closeFeeBps],
  )
  const liqMove = liquidationMove(direction, lev, risk?.maintenanceMarginBps ?? null)
  const mood = riskMood(liqMove)

  const [move, setMove] = useState(0)
  const onMove = useCallback((m: number) => setMove(m), [])
  useEffect(() => {
    if (!onDraftChange) return
    if (!engaged || nvdaPrice === null) {
      onDraftChange(null)
      return
    }
    onDraftChange({
      direction,
      liquidationPrice: liqMove !== null ? nvdaPrice * (1 + liqMove) : null,
      targetPrice: nvdaPrice * (1 + move),
    })
  }, [engaged, nvdaPrice, direction, liqMove, move, onDraftChange])
  useEffect(() => () => onDraftChange?.(null), [onDraftChange])

  // The progress path's "Start a trade" lands here.
  useRobinhoodPanelRequest(
    useCallback((panel) => {
      if (panel !== 'trade') return
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => amountRef.current?.focus({ preventScroll: true }), 350)
    }, []),
  )

  const blocking = quoteMatches ? quote!.issues : []
  const ready = connected && canOpen && quoteMatches && !!quote?.params && !flow.isRunning && !gas.blocks

  let buttonLabel = direction === 'long' ? 'Go long on NVDA' : 'Go short on NVDA'
  if (flow.isRunning) {
    const active = flow.steps.find((s) => s.phase !== 'confirmed' && s.phase !== 'failed')
    buttonLabel = active?.phase === 'signing' ? 'Confirm in your wallet' : 'Opening'
  } else if (!connected) buttonLabel = 'Log in to trade'
  else if (!canOpen && market) buttonLabel = 'Opening is paused'
  else if (gas.blocks) buttonLabel = 'No ETH for network fees'
  else if (!input) buttonLabel = 'Enter an amount'
  else if ((!quoteMatches || isFetching) && !quote?.params) buttonLabel = 'Getting quote'

  // A confirmed open is announced to the page's moment host (the sheet) and
  // the form is ready for the next trade at once.
  const opened = flow.status === 'success' ? flow.result : null
  useEffect(() => {
    if (!opened) return
    const e = opened.event
    showRobinhoodMoment({
      kind: 'opened',
      positionId: e.positionId.toString(),
      direction: e.side === 0 ? 'long' : 'short',
      leverage: leverageFromX100(e.leverageX100),
      sizeUsd: Number(formatUnits(e.grossAssetValueUsd18, ROBINHOOD_DECIMALS.usd18)),
      marginUsd: rate ? Number(formatUnits(underlyingFromShares(e.marginPTokenAmount, rate), ROBINHOOD_DECIMALS.USDG)) : null,
      health: healthFromBps(e.healthFactorBps),
      hash: opened.hash,
    })
    setAmountText('')
    flow.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened])

  const stops = [...LEVERAGE_STOPS.filter((q) => q < maxLeverage), maxLeverage].filter((v, i, a) => a.indexOf(v) === i)
  const moodStyle = MOOD_STYLE[mood]
  const sizeUsd = marginUsd * lev

  return (
    <div
      ref={rootRef}
      onPointerDownCapture={() => setEngaged(true)}
      onFocusCapture={() => setEngaged(true)}
      className={cn('scroll-mt-24 space-y-5 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.03] p-4', className)}
    >
      {/* 1. The call */}
      <div className="space-y-2">
        <SectionLabel>Direction</SectionLabel>
        <div
          className="grid grid-cols-2 gap-1 rounded-xl border border-foreground/[0.06] bg-background p-1"
          role="group"
          aria-label="Direction"
        >
          {(['long', 'short'] as const).map((d) => (
            <DirectionButton
              key={d}
              d={d}
              active={direction === d}
              disabled={flow.isRunning}
              onClick={() => {
                setDirection(d)
                flow.reset()
              }}
            />
          ))}
        </div>
      </div>

      {/* 2. The stake */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionLabel htmlFor="rh-margin">Amount</SectionLabel>
          {connected && free !== null && (
            <span className="text-[11px] text-muted-foreground">
              Available <span className="font-medium tabular-nums text-foreground">{formatSharesAsUsdg(free, rate)}</span>
            </span>
          )}
        </div>
        {emptyAccount ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-foreground/[0.12] bg-background p-3">
            <PiggyBank className="h-7 w-7 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            <div className="flex-1 text-xs">
              <div className="font-semibold">Your margin account is empty</div>
              <div className="text-muted-foreground">
                Add a little USDG first. It stays yours and you can take it back anytime.
              </div>
            </div>
            <Button
              size="sm"
              className="h-8 shrink-0 rounded-full bg-foreground px-3.5 text-background hover:bg-foreground/90"
              onClick={() => requestRobinhoodPanel('deposit')}
            >
              Add
            </Button>
          </div>
        ) : (
          <>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground/60">
                $
              </span>
              <input
                ref={amountRef}
                id="rh-margin"
                inputMode="decimal"
                placeholder="0.00"
                autoComplete="off"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                disabled={flow.isRunning}
                className="h-12 w-full rounded-xl border border-foreground/[0.1] bg-background pl-8 pr-16 text-lg font-semibold tabular-nums outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/40 disabled:opacity-50"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">USDG</span>
            </div>
            <div className="flex gap-1.5">
              {AMOUNT_CHIPS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setPart(c.part)}
                  disabled={!maxShares || flow.isRunning}
                  className={cn('flex-1', CHIP, CHIP_IDLE)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 3. The boost */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <SectionLabel>Boost</SectionLabel>
          <span className="flex items-baseline gap-2">
            <span className={cn('text-[11px] font-medium', moodStyle.text)}>{RISK_MOOD_LABEL[mood]}</span>
            <motion.span
              key={leverageX100}
              initial={{ scale: 1.25 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              className="text-base font-semibold tabular-nums"
            >
              {lev.toFixed(1)}x
            </motion.span>
          </span>
        </div>
        <SliderPrimitive.Root
          className="relative flex h-5 w-full touch-none select-none items-center"
          min={1.1}
          max={maxLeverage}
          step={0.1}
          value={[lev]}
          onValueChange={([v]) => setLeverage(Math.round(v * 10) / 10)}
          disabled={flow.isRunning}
          aria-label="Leverage"
        >
          <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-foreground/[0.08]">
            <SliderPrimitive.Range className={cn('absolute h-full', moodStyle.range)} />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb className="block h-[18px] w-[18px] rounded-full border-2 border-foreground/50 bg-background shadow-sm transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-110 disabled:opacity-50" />
        </SliderPrimitive.Root>
        <div className="flex gap-1.5">
          {stops.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setLeverage(q)}
              disabled={flow.isRunning}
              className={cn('flex-1', CHIP, leverageX100 === Math.round(q * 100) ? CHIP_ACTIVE : CHIP_IDLE)}
            >
              {q}x
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {direction === 'long' ? (
            <>Every 1% NVDA rises moves your stake about {lev.toFixed(1)}%.</>
          ) : (
            <>
              Every 1% NVDA falls moves your stake about {Math.max(0, lev - 1).toFixed(1)}%. A short counts your own USDG as part
              of the position.
            </>
          )}
        </p>
      </div>

      <RobinhoodScenario input={scenarioInput} example={marginUsd <= 0} nvdaPrice={nvdaPrice} onMove={onMove} />

      {connected && gas.message && (
        <p
          className={cn(
            'flex gap-1.5 text-xs',
            gas.blocks ? 'text-red-700 dark:text-red-300' : 'text-yellow-700 dark:text-yellow-300/90',
          )}
        >
          <Fuel className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {gas.message}
        </p>
      )}
      {quoteError && <RobinhoodFlowError message="The quote could not be loaded. Try again in a moment." />}
      {blocking.length > 0 && (
        <ul className="space-y-1">
          {blocking.map((issue) => (
            <li key={issue.code} className="text-xs text-yellow-700 dark:text-yellow-300/90">
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {flow.status === 'requote' && flow.requote ? (
        <div className="space-y-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3">
          <p className="text-xs text-yellow-800 dark:text-yellow-200">{flow.error?.message ?? 'The quote changed.'}</p>
          <QuoteDetails quote={flow.requote} rate={rate} />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" disabled={!flow.requote.params} onClick={() => flow.open(flow.requote!)}>
              Accept new quote
            </Button>
            <Button size="sm" variant="outline" onClick={flow.reset}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {marginUsd > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              You put in <span className="font-semibold text-foreground">{formatUsdNumber(marginUsd)}</span> and trade{' '}
              <span className="font-semibold text-foreground">{formatUsdNumber(sizeUsd)}</span> of NVDA
            </p>
          )}
          {!connected ? (
            <ConnectWalletButton
              label="Log in to trade"
              className={cn(
                'h-12 w-full rounded-xl text-base font-semibold transition-transform active:scale-[0.98]',
                direction === 'long'
                  ? 'bg-emerald-500 text-white hover:bg-emerald-600 dark:text-emerald-950 dark:hover:bg-emerald-400'
                  : 'bg-red-500 text-white hover:bg-red-600 dark:text-red-950 dark:hover:bg-red-400',
              )}
            />
          ) : (
            <Shake trigger={flow.status === 'error' && flow.error?.kind !== 'rejected' ? flow.error : null}>
              <Button
                className={cn(
                  'h-12 w-full rounded-xl text-base font-semibold transition-transform active:scale-[0.98]',
                  direction === 'long'
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600 dark:text-emerald-950 dark:hover:bg-emerald-400'
                    : 'bg-red-500 text-white hover:bg-red-600 dark:text-red-950 dark:hover:bg-red-400',
                )}
                disabled={!ready}
                onClick={() => quote && flow.open(quote)}
              >
                {buttonLabel}
              </Button>
            </Shake>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Earns {MARGIN_POINTS.open} point per trade</span>
            {quoteMatches && quote && (
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="inline-flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                aria-expanded={showDetails}
              >
                Fees and limits
                <ChevronDown className={cn('h-3 w-3 transition-transform', showDetails && 'rotate-180')} />
              </button>
            )}
          </div>
          <AnimatePresence initial={false}>
            {showDetails && quoteMatches && quote && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <QuoteDetails quote={quote} rate={rate} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <RobinhoodTxSteps steps={flow.steps} />
      <RobinhoodErrorCard
        error={flow.status === 'error' ? flow.error : null}
        onRetry={flow.reset}
        remedies={{
          requote: () => void refetchQuote(),
          max: setMax,
          leverage: () => setLeverage((l) => lowerLeverage(Math.min(l, maxLeverage))),
        }}
      />
    </div>
  )
}
