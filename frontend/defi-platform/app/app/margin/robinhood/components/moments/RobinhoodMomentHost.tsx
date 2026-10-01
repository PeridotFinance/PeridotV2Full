'use client'

/**
 * Shows the moment a flow announced (hooks/use-robinhood-moment) and fills in
 * what only arrives after the transaction: the entry price and the P&L from
 * the event ledger, the liquidation estimate from the page, the points from
 * the leaderboard's answer. Each of those shows a placeholder while it is on
 * its way and gives up quietly rather than inventing a number.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, MotionConfig } from 'framer-motion'
import type { PositionLedger } from '@/lib/robinhood/activity'
import { onRobinhoodPoints } from '@/lib/robinhood/points-client'
import { focusRobinhoodPosition, useRobinhoodMomentQueue, type RobinhoodMoment } from '@/hooks/use-robinhood-moment'
import type { PointsState } from './MomentSheet'
import { ClosedMoment, OpenedMoment } from './RobinhoodMomentViews'

/** How long to wait for the ledger to carry the close before showing it without a P&L. */
const PNL_GIVE_UP_MS = 20_000
/** How long to wait for the leaderboard before leaving the points out. */
const POINTS_GIVE_UP_MS = 15_000

function usePoints(hash: string): PointsState {
  const [state, setState] = useState<PointsState>({ status: 'pending' })
  useEffect(() => {
    setState({ status: 'pending' })
    const t = setTimeout(() => setState((s) => (s.status === 'pending' ? { status: 'hidden' } : s)), POINTS_GIVE_UP_MS)
    const off = onRobinhoodPoints(hash, (r) => {
      clearTimeout(t)
      setState(r.ok ? { status: 'awarded', points: r.points, note: r.note } : { status: 'hidden' })
    })
    return () => {
      clearTimeout(t)
      off()
    }
  }, [hash])
  return state
}

function useGiveUp(ms: number, key: string): boolean {
  const [over, setOver] = useState(false)
  useEffect(() => {
    setOver(false)
    const t = setTimeout(() => setOver(true), ms)
    return () => clearTimeout(t)
  }, [ms, key])
  return over
}

interface Props {
  ledgers: Map<string, PositionLedger>
  liquidationPrices: Record<string, number | null>
}

function Live({ m, ledgers, liquidationPrices, onDismiss }: Props & { m: RobinhoodMoment; onDismiss: () => void }) {
  const points = usePoints(m.hash)
  const gaveUp = useGiveUp(PNL_GIVE_UP_MS, m.hash)
  const ledger = ledgers.get(m.positionId)

  if (m.kind === 'opened') {
    return (
      <OpenedMoment
        positionId={m.positionId}
        direction={m.direction}
        leverage={m.leverage}
        sizeUsd={m.sizeUsd}
        marginUsd={m.marginUsd}
        entryPrice={ledger?.entryPrice ?? null}
        liquidationPrice={liquidationPrices[m.positionId] ?? null}
        health={m.health}
        points={points}
        onDismiss={onDismiss}
        onView={() => {
          onDismiss()
          focusRobinhoodPosition({ tab: 'open', positionId: m.positionId })
        }}
      />
    )
  }

  const settled = ledger && ledger.outcome !== 'open' && ledger.pnlUsd !== null
  return (
    <ClosedMoment
      positionId={m.positionId}
      direction={m.direction}
      returnedUsd={m.returnedUsd}
      pnl={settled ? { usd: ledger.pnlUsd!, pct: ledger.pnlPct, stakeUsd: ledger.inUsd } : null}
      pnlUnavailable={!settled && gaveUp}
      points={points}
      onDismiss={onDismiss}
      onHistory={() => {
        onDismiss()
        focusRobinhoodPosition({ tab: 'closed' })
      }}
    />
  )
}

export function RobinhoodMomentHost(props: Props) {
  const [moment, clear] = useRobinhoodMomentQueue()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(
    <MotionConfig reducedMotion="user">
      <AnimatePresence>{moment && <Live key={moment.hash} m={moment} onDismiss={clear} {...props} />}</AnimatePresence>
    </MotionConfig>,
    document.body,
  )
}
