'use client'

/**
 * Open positions, closed positions and the full history, with a P&L strip.
 *
 * Everything below the strip comes from two sources: the live position reads
 * (health, equity, actions) and the chain's event history folded into
 * ledgers (lib/robinhood/activity.ts). P&L includes protocol fees, borrow
 * interest and swap costs; it excludes gas, which the wallet pays in ETH.
 * The strip says so, because a trader comparing it with their wallet will
 * otherwise find the difference and not know where it went.
 */
import { useCallback, useRef, useState } from 'react'
import { useRobinhoodFocus, type RobinhoodFocusTarget } from '@/hooks/use-robinhood-moment'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROBINHOOD_EXPLORER_URL } from '@/config/robinhood'
import type { HistoryKind, HistoryRow, PositionLedger } from '@/lib/robinhood/activity'
import type { RobinhoodAccountState, RobinhoodMarketState, RobinhoodPosition } from '@/lib/robinhood/reads'
import { formatUsdNumber } from '../lib/format'
import { PriceTrack, RobinhoodPositionsList } from './RobinhoodPositionsList'
import { GlidingUsd } from './GlidingUsd'
import { formatUnits } from 'viem'
import { TrendingUp } from 'lucide-react'
import { ROBINHOOD_DECIMALS } from '@/config/robinhood'
import { liquidationMove, scenarioAt } from '@/lib/robinhood/scenario'

type Tab = 'open' | 'closed' | 'history'

interface Summary {
  realizedUsd: number
  unrealizedUsd: number | null
  closedCount: number
  winRate: number | null
  feesUsd: number
}

interface Props {
  connected: boolean
  openPositions: RobinhoodPosition[]
  positionsLoading: boolean
  ledgers: Map<string, PositionLedger>
  history: HistoryRow[]
  summary: Summary
  historyLoading: boolean
  historyError: boolean
  liquidationPrices: Record<string, number | null>
  usdgExchangeRate: bigint | null
  account: RobinhoodAccountState | undefined
  market: RobinhoodMarketState | undefined
  className?: string
}

const explorerTx = (hash: string) => `${ROBINHOOD_EXPLORER_URL.replace(/\/$/, '')}/tx/${hash}`

const signed = (v: number) => `${v > 0 ? '+' : ''}${formatUsdNumber(v)}`
const tone = (v: number | null) =>
  v === null || Math.abs(v) < 0.00005 ? 'text-foreground' : v > 0 ? 'text-emerald-500' : 'text-red-500'

function when(sec: number): string {
  return new Date(sec * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function duration(from: number, to: number): string {
  const s = Math.max(0, to - from)
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`
  if (s < 86_400) return `${(s / 3600).toFixed(1)} h`
  return `${(s / 86_400).toFixed(1)} d`
}

const KIND_LABEL: Record<HistoryKind, string> = {
  open: 'Opened',
  'add-margin': 'Added margin',
  repay: 'Repaid debt',
  close: 'Closed',
  'partial-close': 'Partly closed',
  liquidation: 'Liquidated',
  'exit-in-kind': 'Exited in kind',
  deposit: 'Deposit',
  withdraw: 'Withdrawal',
  rewards: 'Rewards collected',
}

const OUTCOME_LABEL: Record<PositionLedger['outcome'], string> = {
  open: 'Open',
  closed: 'Closed',
  liquidated: 'Liquidated',
  exited: 'Exited in kind',
}

/**
 * What a trade looks like once it is open, for a visitor who is not logged
 * in: a 2x long on $1 that NVDA has moved 5% in favour of, drawn with the
 * live price and the same scenario math as the ticket. Marked as an example
 * in its header, so nobody reads it as a position they hold.
 */
function ExamplePosition({ market }: { market: RobinhoodMarketState | undefined }) {
  const raw = market?.prices.nvda.priceUsd18
  const now = raw != null ? Number(formatUnits(raw, ROBINHOOD_DECIMALS.usd18)) : null
  const maintenance = market?.pairRisk.long?.maintenanceMarginBps ?? null
  const input = {
    direction: 'long' as const,
    marginUsd: 1,
    leverage: 2,
    maintenanceBps: maintenance,
    openFeeBps: market?.openFeeBps ?? null,
    closeFeeBps: market?.closeFeeBps ?? null,
  }
  const point = scenarioAt(input, 0.05)
  const entry = now !== null ? now / 1.05 : null
  const liqMove = liquidationMove('long', 2, maintenance)
  const liq = entry !== null && liqMove !== null ? entry * (1 + liqMove) : null

  return (
    <div className="space-y-4 rounded-2xl border border-dashed border-foreground/[0.12] bg-foreground/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
          <TrendingUp className="h-3.5 w-3.5" /> Long NVDA
        </span>
        <span className="rounded-full border border-foreground/[0.08] px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          2.00x
        </span>
        <span className="ml-auto rounded-full bg-foreground/[0.08] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Example
        </span>
      </div>
      <div>
        <div className="text-[11px] text-muted-foreground">If you had put in $1 and NVDA rose 5%</div>
        <div className="flex items-baseline gap-2">
          <GlidingUsd
            value={point.pnlUsd}
            className="text-3xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400"
          />
          <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            +{point.pnlPct.toFixed(1)}%
          </span>
        </div>
      </div>
      <PriceTrack direction="long" entry={entry} now={now} liq={liq} />
      <p className="text-xs text-muted-foreground">
        Log in and make your call. Your own trades appear here with live profit, the distance to liquidation and a one-tap close.
      </p>
    </div>
  )
}

function SummaryStrip({ summary }: { summary: Summary }) {
  const cells: Array<{ label: string; value: string; cls?: string }> = [
    {
      label: 'Unrealized P&L',
      value: summary.unrealizedUsd === null ? 'n/a' : signed(summary.unrealizedUsd),
      cls: tone(summary.unrealizedUsd),
    },
    {
      label: 'Realized P&L',
      value: signed(summary.realizedUsd),
      cls: tone(summary.realizedUsd),
    },
    {
      label: 'Win rate',
      value: summary.winRate === null ? 'n/a' : `${Math.round(summary.winRate * 100)}%`,
    },
    { label: 'Fees paid', value: formatUsdNumber(summary.feesUsd) },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-2">
          <div className={cn('text-sm font-bold tabular-nums', c.cls)}>{c.value}</div>
          <div className="text-[10px] text-muted-foreground/60">{c.label}</div>
        </div>
      ))}
    </div>
  )
}

function ClosedList({ ledgers }: { ledgers: PositionLedger[] }) {
  if (ledgers.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-foreground/[0.08] p-6 text-center text-sm text-muted-foreground">
        No closed positions yet.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-foreground/[0.08]">
      <table className="w-full min-w-[640px] text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
          <tr className="border-b border-foreground/[0.08]">
            <th className="px-3 py-2 text-left font-medium">Position</th>
            <th className="px-3 py-2 text-left font-medium">Opened</th>
            <th className="px-3 py-2 text-right font-medium">Entry</th>
            <th className="px-3 py-2 text-right font-medium">Exit</th>
            <th className="px-3 py-2 text-right font-medium">Margin in</th>
            <th className="px-3 py-2 text-right font-medium">Returned</th>
            <th className="px-3 py-2 text-right font-medium">P&L</th>
          </tr>
        </thead>
        <tbody>
          {ledgers.map((l) => (
            <tr key={l.id} className="border-b border-foreground/[0.05] last:border-0">
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn('font-semibold', l.direction === 'long' ? 'text-emerald-500' : 'text-red-500')}>
                    {l.direction === 'long' ? 'Long' : 'Short'}
                  </span>
                  <span className="text-muted-foreground">
                    #{l.id} · {l.leverage.toFixed(1)}x
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground/60">
                  {OUTCOME_LABEL[l.outcome]}
                  {l.closedAt ? ` after ${duration(l.openedAt, l.closedAt)}` : ''}
                </div>
              </td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{when(l.openedAt)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {l.entryPrice !== null ? formatUsdNumber(l.entryPrice) : 'n/a'}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{l.exitPrice !== null ? formatUsdNumber(l.exitPrice) : 'n/a'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatUsdNumber(l.inUsd)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatUsdNumber(l.outUsd)}</td>
              <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', tone(l.pnlUsd))}>
                {l.pnlUsd !== null ? signed(l.pnlUsd) : 'n/a'}
                {l.pnlPct !== null && (
                  <div className="text-[10px] font-normal">
                    {l.pnlPct >= 0 ? '+' : ''}
                    {l.pnlPct.toFixed(2)}%
                  </div>
                )}
                {l.incomplete && <div className="text-[10px] font-normal text-muted-foreground/60">partly unvalued</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HistoryList({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-foreground/[0.08] p-6 text-center text-sm text-muted-foreground">
        Nothing yet. Deposits, trades and withdrawals appear here once they are on chain.
      </p>
    )
  }
  return (
    <ul className="divide-y divide-foreground/[0.05] rounded-xl border border-foreground/[0.08]">
      {rows.map((r) => {
        const outflow = r.kind === 'withdraw'
        return (
          <li key={r.key} className="flex items-center gap-3 px-3 py-2 text-xs">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">{KIND_LABEL[r.kind]}</span>
                {r.positionId && (
                  <span className={cn(r.direction === 'short' ? 'text-red-500' : 'text-emerald-500')}>
                    {r.direction === 'short' ? 'Short' : 'Long'} #{r.positionId}
                  </span>
                )}
                {r.detail && <span className="text-muted-foreground">{r.detail}</span>}
              </div>
              <div className="text-[10px] text-muted-foreground/60 tabular-nums">
                {when(r.time)}
                {r.nvdaPrice !== null && r.positionId ? ` · NVDA ${formatUsdNumber(r.nvdaPrice)}` : ''}
              </div>
            </div>
            <div className="text-right tabular-nums">
              {r.amountUsd !== null ? (outflow ? `-${formatUsdNumber(r.amountUsd)}` : formatUsdNumber(r.amountUsd)) : 'n/a'}
            </div>
            <a
              href={explorerTx(r.txHash)}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground/60 hover:text-foreground"
              aria-label="View on explorer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </li>
        )
      })}
    </ul>
  )
}

export function RobinhoodActivityTabs(props: Props) {
  const { connected, openPositions, ledgers, history, summary, historyLoading, historyError } = props
  const [tab, setTab] = useState<Tab>('open')
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const sectionRef = useRef<HTMLElement>(null)

  // "View position" / "See history" from a result sheet: switch the tab, bring
  // it into view and, for a new position, light its card up once it exists
  // (the list catches up with the chain a moment after the sheet appears).
  const onFocus = useCallback((t: RobinhoodFocusTarget) => {
    setTab(t.tab)
    let tries = 0
    const find = () => {
      const card = t.positionId ? document.getElementById(`rh-position-${t.positionId}`) : null
      if (card || !t.positionId || tries >= 12) {
        ;(card ?? sectionRef.current)?.scrollIntoView({
          behavior: 'smooth',
          block: card ? 'center' : 'start',
        })
        if (card && t.positionId) {
          setHighlightId(t.positionId)
          setTimeout(() => setHighlightId(null), 2_400)
        }
        return
      }
      tries += 1
      setTimeout(find, 300)
    }
    setTimeout(find, 50)
  }, [])
  useRobinhoodFocus(onFocus)
  const closed = [...ledgers.values()].filter((l) => l.outcome !== 'open').sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))

  const tabs: Array<{ key: Tab; label: string }> = [
    {
      key: 'open',
      label: `Open${openPositions.length ? ` (${openPositions.length})` : ''}`,
    },
    {
      key: 'closed',
      label: `Closed${closed.length ? ` (${closed.length})` : ''}`,
    },
    { key: 'history', label: 'History' },
  ]

  return (
    <section ref={sectionRef} className={cn('scroll-mt-4 space-y-3', props.className)}>
      {connected && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-0.5 rounded-full border border-foreground/[0.08] bg-foreground/[0.03] p-0.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                  tab === t.key ? 'bg-foreground text-background' : 'text-muted-foreground/70 hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {historyError && (
            <span className="text-[11px] text-yellow-600 dark:text-yellow-300">History unavailable right now</span>
          )}
        </div>
      )}

      {!connected ? (
        <ExamplePosition market={props.market} />
      ) : (
        <>
          <SummaryStrip summary={summary} />
          {tab === 'open' && (
            <RobinhoodPositionsList
              hideHeader
              positions={openPositions}
              closedCount={closed.length}
              connected={connected}
              isLoading={props.positionsLoading}
              usdgExchangeRate={props.usdgExchangeRate}
              account={props.account}
              market={props.market}
              ledgers={ledgers}
              liquidationPrices={props.liquidationPrices}
              highlightId={highlightId}
            />
          )}
          {tab === 'closed' &&
            (historyLoading ? (
              <div className="h-28 animate-pulse rounded-xl bg-foreground/[0.04]" />
            ) : (
              <ClosedList ledgers={closed} />
            ))}
          {tab === 'history' &&
            (historyLoading ? (
              <div className="h-28 animate-pulse rounded-xl bg-foreground/[0.04]" />
            ) : (
              <HistoryList rows={history} />
            ))}
          <p className="text-[10px] text-muted-foreground/60">
            P&L includes trading fees, borrow interest and swap costs, and excludes network fees paid in ETH. Entry and exit
            prices are the NVDA market price when the transaction landed, not the exact fill.
          </p>
        </>
      )}
    </section>
  )
}
