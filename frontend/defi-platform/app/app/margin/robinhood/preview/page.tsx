'use client'

/**
 * /app/margin/robinhood/preview: every result moment of the margin page with
 * made-up numbers, to try on a phone before a real trade shows them. Renders
 * the same views the live page does (components/moments); only the data and
 * its arrival times are simulated. No wallet, no chain, no writes. Unlinked,
 * and the layout keeps it out of search.
 */
import { useEffect, useState } from 'react'
import { AnimatePresence, MotionConfig } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { RobinhoodDecodedError, RobinhoodErrorKind } from '@/lib/robinhood/errors'
import { lowerLeverage } from '@/lib/robinhood/moments'
import type { PointsState } from '../components/moments/MomentSheet'
import { ClosedMoment, OpenedMoment } from '../components/moments/RobinhoodMomentViews'
import { RobinhoodErrorCard, Shake } from '../components/moments/RobinhoodErrorCard'
import type { RobinhoodAccountState, RobinhoodMarketState, RobinhoodPosition } from '@/lib/robinhood/reads'
import type { PositionLedger } from '@/lib/robinhood/activity'
import { estimateLiquidationPrice } from '@/lib/robinhood/liquidation'
import { RobinhoodPositionsList } from '../components/RobinhoodPositionsList'
import { RobinhoodAccountCard } from '../components/RobinhoodAccountCard'
import { RobinhoodJourney, type JourneyState } from '../components/RobinhoodJourney'

type Scenario =
  | { kind: 'opened'; direction: 'long' | 'short' }
  | { kind: 'closed'; label: string; pnl: number; pct: number; stake: number; points: number; note?: string }

const CLOSES: Array<Extract<Scenario, { kind: 'closed' }>> = [
  { kind: 'closed', label: 'Small win (+2%)', pnl: 0.021, pct: 2.1, stake: 1, points: 3 },
  { kind: 'closed', label: 'Nice win (+12%)', pnl: 0.1204, pct: 12.04, stake: 1, points: 18 },
  { kind: 'closed', label: 'Big win (+41%)', pnl: 0.4133, pct: 41.33, stake: 1, points: 42 },
  { kind: 'closed', label: 'Loss (-8%)', pnl: -0.0812, pct: -8.12, stake: 1, points: 12 },
  { kind: 'closed', label: 'Break-even', pnl: 0.00001, pct: 0, stake: 1, points: 7 },
  {
    kind: 'closed',
    label: 'Quick flip (no points)',
    pnl: 0.034,
    pct: 3.4,
    stake: 1,
    points: 0,
    note: 'held less than the minimum',
  },
]

const ERRORS: Array<{ label: string; kind: RobinhoodErrorKind; message: string }> = [
  { label: 'Price moved', kind: 'fee', message: 'The opening fee rose above the accepted limit. Review the new quote.' },
  { label: 'Above limit', kind: 'cap', message: 'This size exceeds the position limit. Reduce the size.' },
  {
    label: 'Too little margin',
    kind: 'margin',
    message: 'Not enough margin for this leverage. Lower the leverage or add margin.',
  },
  { label: 'No liquidity', kind: 'liquidity', message: 'The market does not have enough liquidity for this size right now.' },
  { label: 'Opens paused', kind: 'opens-paused', message: 'Opening new positions is paused right now.' },
  { label: 'Cancelled in wallet', kind: 'rejected', message: 'The request was rejected in the wallet.' },
]

function useArrival<T>(value: T, delayMs: number, key: unknown): T | null {
  const [v, setV] = useState<T | null>(delayMs === 0 ? value : null)
  useEffect(() => {
    if (delayMs === 0) {
      setV(value)
      return
    }
    setV(null)
    const t = setTimeout(() => setV(value), delayMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delayMs])
  return v
}

function OpenedDemo({ direction, slow, onDismiss }: { direction: 'long' | 'short'; slow: boolean; onDismiss: () => void }) {
  const entry = useArrival(181.42, slow ? 1_800 : 0, direction)
  const liq = useArrival(direction === 'long' ? 97.3 : 262.8, slow ? 2_200 : 0, direction)
  const pts = useArrival<PointsState>({ status: 'awarded', points: 1 }, slow ? 2_600 : 300, direction)
  return (
    <OpenedMoment
      positionId="17"
      direction={direction}
      leverage={2.5}
      sizeUsd={1.8742}
      marginUsd={0.75}
      entryPrice={entry}
      liquidationPrice={liq}
      health={1.84}
      points={pts ?? { status: 'pending' }}
      onView={onDismiss}
      onDismiss={onDismiss}
    />
  )
}

function ClosedDemo({ s, slow, onDismiss }: { s: Extract<Scenario, { kind: 'closed' }>; slow: boolean; onDismiss: () => void }) {
  const pnl = useArrival({ usd: s.pnl, pct: s.pct, stakeUsd: s.stake }, slow ? 1_600 : 0, s.label)
  const pts = useArrival<PointsState>({ status: 'awarded', points: s.points, note: s.note }, slow ? 2_800 : 500, s.label)
  return (
    <ClosedMoment
      positionId="17"
      direction="long"
      returnedUsd={s.stake + s.pnl}
      pnl={pnl}
      points={pts ?? { status: 'pending' }}
      onHistory={onDismiss}
      onDismiss={onDismiss}
    />
  )
}

function ErrorDemo() {
  const [error, setError] = useState<RobinhoodDecodedError | null>(null)
  const [leverage, setLeverage] = useState(3)
  const [note, setNote] = useState<string | null>(null)
  return (
    <div className="space-y-3 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.04] p-4">
      <div className="flex flex-wrap gap-1.5">
        {ERRORS.map((e) => (
          <button
            key={e.label}
            type="button"
            onClick={() => {
              setNote(null)
              setError({ kind: e.kind, errorName: null, args: [], message: e.message, detail: 'preview' })
            }}
            className="min-h-[36px] rounded-full border border-foreground/[0.08] px-3 text-xs text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
          >
            {e.label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Leverage in the form</span>
        <span className="font-bold tabular-nums text-foreground">{leverage.toFixed(1)}x</span>
      </div>
      <Shake trigger={error && error.kind !== 'rejected' ? error : null}>
        <Button
          className="h-12 w-full bg-emerald-600 text-base font-semibold hover:bg-emerald-500"
          onClick={() => setError(null)}
        >
          Open long
        </Button>
      </Shake>
      <RobinhoodErrorCard
        error={error}
        onRetry={() => setError(null)}
        remedies={{
          requote: () => setNote('A fresh quote was requested.'),
          max: () => setNote('The size was set to the largest the limits allow.'),
          leverage: () => setLeverage((l) => lowerLeverage(l)),
        }}
      />
      {note && <p className="text-center text-[11px] text-muted-foreground">{note}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// A made-up open position and margin account, so the logged-in views can be
// looked at before a real trade exists. 1 USDG = 1e8 pUSDG shares here.

const E18 = 10n ** 18n
const usd = (v: number) => BigInt(Math.round(v * 1e6)) * 10n ** 12n
const SAMPLE_PRICE = 225.66
const SAMPLE_RATE = 10n ** 16n

const SAMPLE_MARKET = {
  openFeeBps: 10,
  closeFeeBps: 10,
  prices: { nvda: { priceUsd18: usd(SAMPLE_PRICE), priceable: true }, usdg: { priceUsd18: E18, priceable: true } },
  pairRisk: {
    long: { maintenanceMarginBps: 929, maxLeverageX100: 500 },
    short: { maintenanceMarginBps: 929, maxLeverageX100: 500 },
  },
  markets: { pUSDG: { exchangeRate: SAMPLE_RATE }, pNVDA: { exchangeRate: E18 } },
  marginAccepted: true,
} as unknown as RobinhoodMarketState

const SAMPLE_ACCOUNT = {
  wallet: { usdg: 1_250_000n, nvda: 0n, pUSDG: 0n, pNVDA: 0n },
  gas: { balanceWei: 3n * 10n ** 15n, gasPriceWei: 10_000_000n },
  vault: { freeShares: 42_000_000n, lockedShares: 60_000_000n, pendingRewardShares: 1_200_000n },
  failures: [],
} as unknown as RobinhoodAccountState

function samplePosition(direction: 'long' | 'short', health: number): RobinhoodPosition {
  const gross = 1.87
  const debt = (gross / (1 + (health - 1))) * 0.93
  return {
    id: 17n,
    direction,
    side: direction === 'long' ? 0 : 1,
    status: 1,
    statusLabel: 'Active',
    isActive: true,
    lockedMarginShares: 60_000_000n,
    requestedLeverageX100: 300,
    debtStored: direction === 'long' ? BigInt(Math.round(debt * 1e6)) : usd(debt / SAMPLE_PRICE),
    positionUnderlying: direction === 'long' ? usd(gross / SAMPLE_PRICE) : null,
    metrics: {
      grossAssetValueUsd18: usd(gross),
      debtValueUsd18: usd(debt),
      equityUsd18: usd(gross - debt),
      healthFactorBps: BigInt(Math.round(health * 10_000)),
    },
    health,
    leverage: gross / (gross - debt),
    liquidatable: false,
    riskUnavailable: false,
  } as unknown as RobinhoodPosition
}

function sampleLedger(direction: 'long' | 'short', pnlUsd: number): PositionLedger {
  return {
    id: '17',
    direction,
    openedAt: Math.floor(Date.now() / 1000) - 6 * 3600,
    openTx: `0x${'1'.repeat(64)}`,
    // Winning means the price moved the position's way since the entry.
    entryPrice: (direction === 'long') === pnlUsd > 0 ? 214.02 : 236.1,
    exitPrice: null,
    closedAt: null,
    outcome: 'open',
    leverage: 3,
    grossAtOpenUsd: 1.8,
    inUsd: 0.6,
    outUsd: 0,
    feesUsd: 0.0018,
    equityUsd: 0.6 + pnlUsd,
    pnlUsd,
    pnlPct: (pnlUsd / 0.6) * 100,
    partialCloses: 0,
    incomplete: false,
  }
}

function PositionDemo() {
  const [direction, setDirection] = useState<'long' | 'short'>('long')
  const [danger, setDanger] = useState(false)
  const p = samplePosition(direction, danger ? 1.14 : 1.52)
  const ledger = sampleLedger(direction, danger ? -0.1432 : 0.0712)
  const liq = estimateLiquidationPrice(p, usd(SAMPLE_PRICE), 929)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-10" onClick={() => setDirection((d) => (d === 'long' ? 'short' : 'long'))}>
          Show a {direction === 'long' ? 'short' : 'long'}
        </Button>
        <Button variant="outline" className="h-10" onClick={() => setDanger((v) => !v)}>
          {danger ? 'Winning' : 'Near liquidation'}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Display only: the card&apos;s buttons are switched off here.</p>
      <div inert>
        <RobinhoodPositionsList
          hideHeader
          positions={[p]}
          closedCount={0}
          connected
          isLoading={false}
          usdgExchangeRate={SAMPLE_RATE}
          account={SAMPLE_ACCOUNT}
          market={SAMPLE_MARKET}
          ledgers={new Map([['17', ledger]])}
          liquidationPrices={{ '17': liq }}
        />
      </div>
    </div>
  )
}

const JOURNEY_STAGES: Array<{ label: string; state: JourneyState }> = [
  { label: 'New', state: { connected: false, funded: null, opened: false, closed: false } },
  { label: 'Logged in', state: { connected: true, funded: false, opened: false, closed: false } },
  { label: 'Funded', state: { connected: true, funded: true, opened: false, closed: false } },
  { label: 'Trading', state: { connected: true, funded: true, opened: true, closed: false } },
]

function JourneyDemo() {
  const [i, setI] = useState(1)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {JOURNEY_STAGES.map((s, k) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setI(k)}
            className={cn(
              'min-h-[36px] rounded-full border px-3 text-xs',
              k === i ? 'border-foreground/[0.25] bg-foreground/[0.08] text-foreground' : 'border-foreground/[0.08] text-muted-foreground',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <RobinhoodJourney state={JOURNEY_STAGES[i].state} />
    </div>
  )
}

export default function RobinhoodMomentsPreview() {
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [slow, setSlow] = useState(true)
  const close = () => setScenario(null)

  return (
    <div className="min-h-screen w-full">
      <div className="mx-auto max-w-md space-y-6 px-4 py-6 pb-24">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Margin moments</h1>
          <p className="text-sm text-muted-foreground">
            Preview of what the NVDA margin page shows after an open, a close or a failed step, plus the logged-in views (progress
            path, an open position, the margin account). Numbers are made up; nothing touches a wallet.
          </p>
        </header>

        <label className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.04] px-4 text-sm">
          <span>
            Realistic timing
            <span className="block text-[11px] text-muted-foreground">P&L and points arrive a moment after the sheet</span>
          </span>
          <input
            type="checkbox"
            checked={slow}
            onChange={(e) => setSlow(e.target.checked)}
            className="h-5 w-5 accent-emerald-500"
          />
        </label>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1. Position opened</h2>
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="h-12 bg-emerald-600 hover:bg-emerald-500"
              onClick={() => setScenario({ kind: 'opened', direction: 'long' })}
            >
              Long opened
            </Button>
            <Button
              className="h-12 bg-red-600 hover:bg-red-500"
              onClick={() => setScenario({ kind: 'opened', direction: 'short' })}
            >
              Short opened
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2. Something went wrong</h2>
          <ErrorDemo />
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">3 to 5. Position closed</h2>
          <div className="grid grid-cols-2 gap-2">
            {CLOSES.map((c) => (
              <Button
                key={c.label}
                variant="outline"
                className={cn('h-12', c.pnl > 0.0001 ? 'text-emerald-600 dark:text-emerald-400' : c.pnl < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}
                onClick={() => setScenario(c)}
              >
                {c.label}
              </Button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">6. The path to a first trade</h2>
          <JourneyDemo />
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">7. An open position</h2>
          <PositionDemo />
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">8. The margin account</h2>
          <p className="text-[11px] text-muted-foreground">Display only: the card&apos;s buttons are switched off here.</p>
          <div inert>
            <RobinhoodAccountCard account={SAMPLE_ACCOUNT} market={SAMPLE_MARKET} connected />
          </div>
        </section>
      </div>

      <MotionConfig reducedMotion="user">
        <AnimatePresence>
          {scenario?.kind === 'opened' && (
            <OpenedDemo key={`o-${scenario.direction}`} direction={scenario.direction} slow={slow} onDismiss={close} />
          )}
          {scenario?.kind === 'closed' && <ClosedDemo key={`c-${scenario.label}`} s={scenario} slow={slow} onDismiss={close} />}
        </AnimatePresence>
      </MotionConfig>
    </div>
  )
}
