'use client'

/**
 * NVDA/USDG isolated margin on Robinhood Chain (4663).
 *
 * Top: the path to a first trade (log in, add margin, make the call, cash
 * in), read from the real state and gone once all four are done. Left: the
 * trade ticket (direction, stake, boost, and the "what if NVDA moves"
 * preview) and the margin account with its Add/Withdraw tabs. Right: the
 * NVDA chart, which also draws the ticket's draft (the "what if" price and
 * where the new trade would be liquidated), and the activity tabs. On phones
 * the columns dissolve so the order is chart, ticket, positions, account.
 *
 * Market state is read once for the page and handed down, so the form, the
 * header, the chart and the list agree on the same block. Availability is
 * per action (guide 4): paused opens never hide balances or positions.
 */
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Clock } from 'lucide-react'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { useRobinhoodMarginMarket } from '@/hooks/use-robinhood-margin-market'
import { useRobinhoodMarginAccount } from '@/hooks/use-robinhood-margin-account'
import { useRobinhoodMarginPositions } from '@/hooks/use-robinhood-margin-positions'
import { useRobinhoodTxDeps } from '@/hooks/use-robinhood-tx-deps'
import { RobinhoodAccountCard } from './components/RobinhoodAccountCard'
import { RobinhoodOpenForm, type RobinhoodDraftOverlay } from './components/RobinhoodOpenForm'
import { RobinhoodPriceChart, type ChartPositionOverlay } from './components/RobinhoodPriceChart'
import { RobinhoodJourney, type JourneyState } from './components/RobinhoodJourney'
import { RobinhoodActivityTabs } from './components/RobinhoodActivityTabs'
import { RobinhoodMomentHost } from './components/moments/RobinhoodMomentHost'
import { useRobinhoodMarginActivity } from '@/hooks/use-robinhood-margin-activity'
import { estimateLiquidationPrice } from '@/lib/robinhood/liquidation'
import { formatUsd18Display } from './lib/format'

// The NVDA price lives in the chart header, next to the oracle's Trading/Paused
// badge: a second copy up here read "Unavailable" beside a chart showing $229.

const STALE_PENDING_MS = 30_000

function Notice({ tone, children }: { tone: 'warn' | 'error'; children: React.ReactNode }) {
  return (
    <div
      className={
        tone === 'error'
          ? 'flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-300'
          : 'flex items-start gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-800 dark:text-yellow-200'
      }
    >
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

export default function RobinhoodMarginPage() {
  const { address } = useAccount()
  const connected = !!address
  const { market, availability, isLoading: marketLoading } = useRobinhoodMarginMarket()
  const { account } = useRobinhoodMarginAccount()
  const {
    openPositions,
    positions: allPositions,
    isLoading: positionsLoading,
  } = useRobinhoodMarginPositions({
    includeClosed: true,
  })
  const activity = useRobinhoodMarginActivity(allPositions, market)
  const { pending, reconcile } = useRobinhoodTxDeps()
  // A hash is remembered from the moment it is sent, so a running flow always
  // has one. The banner is for the ones nobody is watching any more (a
  // timeout, a reload mid-flow), which is what their age says.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(t)
  }, [])
  const stale = pending.filter((e) => now - e.at > STALE_PENDING_MS)

  const risk = market?.pairRisk.long ?? market?.pairRisk.short ?? null
  const [draft, setDraft] = useState<RobinhoodDraftOverlay | null>(null)

  const journey: JourneyState = {
    connected,
    funded: account ? account.vault.freeShares > 0n || account.vault.lockedShares > 0n : null,
    opened: openPositions.length > 0 || activity.ledgers.size > 0,
    closed: [...activity.ledgers.values()].some((l) => l.outcome === 'closed' || l.outcome === 'exited'),
  }
  const nvdaPrice = market?.prices.nvda.priceUsd18 ?? null

  const liquidationPrices = useMemo(() => {
    const out: Record<string, number | null> = {}
    for (const p of openPositions) {
      const pairRisk = p.direction === 'long' ? market?.pairRisk.long : market?.pairRisk.short
      out[p.id.toString()] = estimateLiquidationPrice(p, nvdaPrice, pairRisk?.maintenanceMarginBps ?? null)
    }
    return out
  }, [openPositions, nvdaPrice, market])

  const overlays = useMemo<ChartPositionOverlay[]>(
    () =>
      openPositions.map((p) => {
        const id = p.id.toString()
        const ledger = activity.ledgers.get(id)
        return {
          id,
          direction: p.direction,
          entryPrice: ledger?.entryPrice ?? null,
          liquidationPrice: liquidationPrices[id] ?? null,
          leverage: ledger?.leverage ?? p.leverage,
        }
      }),
    [openPositions, activity.ledgers, liquidationPrices],
  )

  return (
    <div className="min-h-screen w-full">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Early access
              {risk && (
                <span
                  title={`Each position can be up to ${formatUsd18Display(risk.maxPositionValueUsd18)} in size with up to ${formatUsd18Display(risk.maxDebtValueUsd18)} borrowed.`}
                >
                  {' '}
                  · Trades up to {formatUsd18Display(risk.maxPositionValueUsd18)}
                </span>
              )}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Call NVDA <span className="text-emerald-600 dark:text-emerald-400">up</span> or{' '}
              <span className="text-red-600 dark:text-red-400">down</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Put in a few dollars of USDG, pick a boost, and your stake moves several times as far as NVDA does.
            </p>
          </div>
        </header>

        {availability.unreachable && !marketLoading && (
          <Notice tone="error">The network cannot be reached right now. Balances and quotes will return when it is back.</Notice>
        )}
        {!availability.unreachable && market?.opensPaused === true && (
          <Notice tone="warn">Opening new positions is paused. Your balances and positions stay available.</Notice>
        )}
        {!availability.unreachable && market && !availability.pricesAvailable && (
          <Notice tone="warn">
            Prices are unavailable right now, so opening is off and position health cannot be shown. This does not mean positions
            are safe.
          </Notice>
        )}
        {stale.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-2 text-xs">
            <Clock className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
            <span className="flex-1">
              {stale.length === 1 ? 'A transaction is' : `${stale.length} transactions are`} still waiting for confirmation. New
              actions stay blocked until it settles.
            </span>
            <Button size="sm" variant="outline" className="h-7" onClick={() => void reconcile()}>
              Check again
            </Button>
          </div>
        )}

        <RobinhoodJourney state={journey} />

        {/* On phones the two columns dissolve (display: contents) so the ticket
            can sit right under the chart and the account card last. */}
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[380px_1fr] lg:items-start">
          <div className="contents lg:block lg:space-y-5">
            <RobinhoodOpenForm
              className="order-2 lg:order-none"
              market={market}
              availability={availability}
              account={account}
              connected={connected}
              onDraftChange={setDraft}
            />
            <RobinhoodAccountCard className="order-4 lg:order-none" account={account} market={market} connected={connected} />
          </div>
          <div className="contents min-w-0 lg:block lg:space-y-5">
            <RobinhoodPriceChart
              overlays={overlays}
              draft={draft}
              history={activity.history}
              pricesAvailable={market ? availability.pricesAvailable : null}
              className="order-1 min-h-[340px] lg:order-none lg:min-h-[380px]"
            />
            <RobinhoodActivityTabs
              className="order-3 lg:order-none"
              connected={connected}
              openPositions={openPositions}
              positionsLoading={positionsLoading}
              ledgers={activity.ledgers}
              history={activity.history}
              summary={activity.summary}
              historyLoading={activity.isLoading}
              historyError={activity.isError}
              liquidationPrices={liquidationPrices}
              usdgExchangeRate={market?.markets.pUSDG.exchangeRate ?? null}
              account={account}
              market={market}
            />
          </div>
        </div>

        <RobinhoodMomentHost ledgers={activity.ledgers} liquidationPrices={liquidationPrices} />

        {market && (
          <p className="text-[10px] text-muted-foreground/50 tabular-nums">
            Read at block {market.blockNumber.toString()}
            {market.failures.length > 0 ? `, ${market.failures.length} values unavailable` : ''}
          </p>
        )}
      </div>
    </div>
  )
}
