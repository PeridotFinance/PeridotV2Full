"use client"

/**
 * The standings table.
 *
 * Ranked and unranked participants are two visually separate groups: someone
 * who has entered but never traded isn't "last", they simply have no score yet,
 * and showing them mixed into the ranking would misread as one.
 *
 * A row with open positions is marked live: its P&L includes paper gains that
 * are not banked yet, and saying so is the difference between a scoreboard and
 * a misleading one.
 */
import type { ChallengeStanding } from "@/types/challenge"
import { cn } from "@/lib/utils"

function pnlClass(v: number): string {
  if (v > 0) return "text-emerald-600 dark:text-emerald-400"
  if (v < 0) return "text-red-600 dark:text-red-400"
  return "text-muted-foreground"
}

function fmtUsd(v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "-" : ""
  return `${sign}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function fmtPct(v: number): string {
  const sign = v > 0 ? "+" : ""
  return `${sign}${v.toFixed(2)}%`
}

function medal(rank: number): string | null {
  return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null
}

/** Live marker for a row whose score is still moving with an open position. */
function LiveDot({ count }: { count: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400"
      title={`${count} position${count === 1 ? "" : "s"} still open — P&L includes what they're worth right now`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      Live
    </span>
  )
}

function Row({ s, highlight }: { s: ChallengeStanding; highlight?: boolean }) {
  const openTrades = s.openTrades ?? 0
  return (
    <tr
      data-testid="challenge-standing-row"
      className={cn(
        "border-b border-foreground/5 last:border-0 transition-colors",
        highlight ? "bg-primary/10" : "hover:bg-foreground/[0.04]",
      )}
    >
      <td className="py-3 px-3 w-14 font-bold tabular-nums text-muted-foreground">
        {s.ranked ? (medal(s.rank) ?? `#${s.rank}`) : "—"}
      </td>
      <td className="py-3 px-3 font-medium text-foreground/90">
        <span className="truncate">{s.handle}</span>
        {s.isSelf && (
          <span className="ml-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
            You
          </span>
        )}
        {openTrades > 0 && (
          <span className="ml-2 align-middle">
            <LiveDot count={openTrades} />
          </span>
        )}
      </td>
      <td className={cn("py-3 px-3 text-right font-bold tabular-nums", pnlClass(s.pnlPct))}>{fmtPct(s.pnlPct)}</td>
      <td className={cn("py-3 px-3 text-right tabular-nums hidden sm:table-cell", pnlClass(s.pnlUsd))}>
        {fmtUsd(s.pnlUsd)}
      </td>
      <td className="py-3 px-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
        ${s.volumeUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </td>
      <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">
        {s.trades}
        {openTrades > 0 && (
          <span className="ml-1 text-emerald-600 dark:text-emerald-400" title="still open">
            +{openTrades}
          </span>
        )}
      </td>
      <td className="py-3 px-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
        {s.winRatePct.toFixed(0)}%
      </td>
    </tr>
  )
}

interface Props {
  standings: ChallengeStanding[]
  minTrades: number
  isLoading?: boolean
  /** A real failure — shown instead of an empty table so nobody stares at nothing. */
  error?: string | null
  onRetry?: () => void
}

export function ChallengeLeaderboardTable({ standings, minTrades, isLoading, error, onRetry }: Props) {
  const ranked = standings.filter((s) => s.ranked)
  const unranked = standings.filter((s) => !s.ranked)

  if (error) {
    return (
      <div className="p-8 text-center text-sm">
        <p className="text-foreground/80 font-medium">The standings didn&apos;t load.</p>
        <p className="text-muted-foreground mt-1">Your trades are safe — this is just the scoreboard.</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 px-3 py-1.5 rounded-full text-xs font-bold bg-foreground/10 hover:bg-foreground/15 transition-colors"
          >
            Try again
          </button>
        )}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-2" data-testid="challenge-leaderboard-loading">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-foreground/5 animate-pulse" />
        ))}
      </div>
    )
  }

  if (standings.length === 0) {
    return (
      <div className="p-8 text-center text-sm">
        <p className="text-foreground/80 font-medium">Nobody has traded yet.</p>
        <p className="text-muted-foreground mt-1">
          {minTrades <= 1
            ? "Open a position and you're on the board — it starts scoring the moment it's live."
            : `Open ${minTrades} trades and you're on the board.`}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-foreground/10 text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2.5 px-3 font-semibold">Rank</th>
            <th className="py-2.5 px-3 font-semibold">Trader</th>
            <th className="py-2.5 px-3 font-semibold text-right">Return</th>
            <th className="py-2.5 px-3 font-semibold text-right hidden sm:table-cell">P&amp;L</th>
            <th className="py-2.5 px-3 font-semibold text-right hidden md:table-cell">Volume</th>
            <th className="py-2.5 px-3 font-semibold text-right">Trades</th>
            <th className="py-2.5 px-3 font-semibold text-right hidden md:table-cell">Win rate</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((s) => (
            <Row key={`${s.rank}-${s.handle}`} s={s} highlight={s.isSelf} />
          ))}
          {unranked.length > 0 && (
            <>
              <tr>
                <td colSpan={7} className="pt-5 pb-2 px-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Not yet ranked
                  </div>
                  <div className="text-xs text-muted-foreground/80 mt-0.5">
                    {minTrades <= 1
                      ? "Entered, but hasn't opened a position yet."
                      : `Needs ${minTrades} trades to qualify.`}
                  </div>
                </td>
              </tr>
              {unranked.map((s) => (
                <Row key={`u-${s.handle}`} s={s} highlight={s.isSelf} />
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default ChallengeLeaderboardTable
