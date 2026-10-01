'use client'

import {
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import dynamic from 'next/dynamic'
import { useSignMessage } from 'wagmi'
import { useLeaderboard } from '@/hooks/use-leaderboard'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useSetUsername } from '@/hooks/use-set-username'
import { usePulseOnChange } from '@/hooks/use-pulse-on-change'
import { getCurrentSeason, getAllBadges } from '@/lib/achievements'
import { formatNumber } from '@/lib/number-formatting'
import { getChainConfig } from '@/config/contracts'
import { toast } from '@/components/ui/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Crown,
  RefreshCw,
  Share2,
  Trophy,
  Copy,
  ExternalLink,
  Sparkles,
  Download,
  Palette,
  Smile,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Lazy: the badges accordion has its own data + presentation; we just slot
// it into the redesigned Badges tab. Don't block the initial render on it.
const LazyBadgesAccordion = dynamic(
  () => import('@/components/leaderboard/BadgesAccordion'),
  { ssr: false },
)

// WebGL2 fragment-shader backdrop for the hero. Client-only — no
// server render, no LCP cost, no blocking of the initial paint.
// On low-end devices / non-WebGL2 browsers the component returns
// nothing and the page reads as plain bg-background.
const HeroShader = dynamic(
  () => import('@/components/leaderboard/HeroShader').then((m) => m.HeroShader),
  { ssr: false },
)

// ─── Design system note ──────────────────────────────────────────────────────
//
// Matches `/app/easy` and `/app/stats`: bg-background, hairline borders
// `border-foreground/[0.06]`, tracking-tight headings, mono / tabular-nums for
// numbers. No gradients, no glass, no neon. Information density is high
// here — restraint matters more than anywhere else.

// ─── Tier table ──────────────────────────────────────────────────────────────
//
// Same tier ladder as the legacy component — keeps the cross-user
// experience consistent (people compare "I'm Sapphire, you're Jade", etc).

const TIERS = [
  { level: 'Peridot', minPoints: 1_000_000, emoji: '🏆' },
  { level: 'Diamond', minPoints: 750_000, emoji: '💎' },
  { level: 'Ruby', minPoints: 500_000, emoji: '♦️' },
  { level: 'Emerald', minPoints: 300_000, emoji: '🟢' },
  { level: 'Sapphire', minPoints: 150_000, emoji: '🔷' },
  { level: 'Topaz', minPoints: 100_000, emoji: '🌟' },
  { level: 'Amethyst', minPoints: 50_000, emoji: '🔮' },
  { level: 'Jade', minPoints: 10_000, emoji: '🐉' },
  { level: 'Quartz', minPoints: 1_000, emoji: '🪨' },
  { level: 'Beginner', minPoints: 0, emoji: '⛏️' },
].sort((a, b) => b.minPoints - a.minPoints)

function tierFor(points: number) {
  const idx = TIERS.findIndex((t) => points >= t.minPoints)
  const current = idx >= 0 ? TIERS[idx] : TIERS[TIERS.length - 1]
  const next = idx > 0 ? TIERS[idx - 1] : null
  return { current, next, idx }
}

function tierProgress(points: number) {
  const { current, next } = tierFor(points)
  if (!next) return { percent: 100, toNext: 0, current, next }
  const range = next.minPoints - current.minPoints
  const into = points - current.minPoints
  const percent = Math.max(0, Math.min(100, Math.round((into / (range || 1)) * 100)))
  const toNext = Math.max(0, next.minPoints - points)
  return { percent, toNext, current, next }
}

// ─── Types (subset of what the API returns; intentionally narrow) ────────────

interface LeaderboardEntry {
  wallet_address: string
  username?: string
  total_points: number
  period_points?: number | null
  all_time_points?: number | null
  global_rank?: number | null
  rank?: number
  supply_count: number
  borrow_count: number
  repay_count: number
  redeem_count: number
  displayBadge?: { id: string; name: string; icon: string } | null
  nameEmoji?: string | null
  borderColor?: string | null
  isPremium?: boolean
}

interface LeaderboardStats {
  total_users: number
  total_points_awarded: number
  total_supplies: number
  total_borrows: number
  total_repays: number
  total_redeems: number
  total_verified_transactions: number
}

interface UserTx {
  tx_hash: string
  action_type: 'supply' | 'borrow' | 'repay' | 'redeem'
  token_symbol: string
  amount: string
  usd_value: number
  points_awarded: number
  verified_at: string
  chain_id: number
}

type Period = '1d' | '7d' | '30d' | 'all'
type Tab = 'leaderboard' | 'profile' | 'badges' | 'guide'

interface SeasonHistoryEntry {
  seasonId: string
  seasonName: string
  finalPoints: number
  finalRank: number | null
  supplyCount: number
  borrowCount: number
  repayCount: number
  redeemCount: number
  totalLoginDays: number
  badgeIds: string[]
  archivedAt: string
}

const PERIODS: { id: Period; label: string }[] = [
  { id: '1d', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: 'all', label: 'All time' },
]

const PAGE_SIZE = 50
const BASE_VISIBLE_TX = 8

// ─── Main component ─────────────────────────────────────────────────────────

export default function LeaderboardBW() {
  const { address, isConnected } = useActiveWallet()
  const { signMessageAsync } = useSignMessage()
  const [period, setPeriod] = useState<Period>('all')
  const [offset, setOffset] = useState(0)
  const [tab, setTab] = useState<Tab>('leaderboard')

  // ─── React 19 concurrent UX ──────────────────────────────────────────
  // `period` and `offset` drive a heavy data fetch + 50-row re-render.
  // We defer them so the pill / pagination buttons can flip state
  // *urgently* (instant visual feedback) while the table re-fetch and
  // re-render runs as a low-priority transition. Reduces perceived
  // input latency on slower devices by 200-400ms per the React docs.
  //   - `period` (UI) → `deferredPeriod` (data)
  //   - `offset` (UI) → `deferredOffset` (data)
  //   - `isFilterPending` is true exactly when UI is ahead of data.
  //
  // Tab switching is wrapped in `useTransition` so the content swap
  // (Leaderboard → Profile → Badges → Guide) doesn't block urgent
  // updates like pointer interactions on the previous tab.
  const deferredPeriod = useDeferredValue(period)
  const deferredOffset = useDeferredValue(offset)
  const isFilterPending =
    period !== deferredPeriod || offset !== deferredOffset
  const [isTabPending, startTabTransition] = useTransition()

  const wallet = typeof address === 'string' ? address : undefined

  const { data, isLoading, isFetching, refetch, error } = useLeaderboard({
    wallet,
    period: deferredPeriod,
    limit: PAGE_SIZE,
    offset: deferredOffset,
  })

  const season = useMemo(() => getCurrentSeason(), [])

  const entries = (data?.leaderboard ?? []) as LeaderboardEntry[]
  const stats = (data?.stats ?? null) as LeaderboardStats | null
  const userTransactions = (data?.transactions ?? []) as UserTx[]

  // `/api/user/me` splits its response across `user` (raw leaderboard
  // row) and `profile` (display selections, earned badges, next badge,
  // etc.). The legacy component merged these on the client; we do the
  // same here so consumers can read everything off a single `me`
  // object — `me.nextBadge`, `me.displayBadge`, `me.nameEmoji`, etc.
  // Without this merge, `me.nextBadge` is always undefined and the
  // Badges tab incorrectly shows "you've maxed out the catalog".
  const profile = (data as any)?.profile as
    | {
        earnedBadges?: Array<{
          id: string
          name: string
          icon: string
          unlockEmoji?: string | null
          unlockBorderColor?: string | null
          tier: string
          description?: string
          allowLeaderboardDisplay?: boolean
        }>
        selections?: {
          badgeId?: string | null
          borderColor?: string | null
          nameEmoji?: string | null
        }
        unlocked?: {
          emojis?: string[]
          borderColors?: string[]
        }
        nextBadge?: {
          id: string
          name: string
          description: string
          icon: string
          tier: string
          xpThreshold?: number
          unlockEmoji?: string
          unlockBorderColor?: string
          pointsReward?: number
        } | null
        afterNextBadgeHint?: {
          id?: string
          name?: string
          tier?: string
          icon?: string
        } | null
        display?: {
          displayBadge?: { id: string; name: string; icon: string } | null
          borderColor?: string | null
          nameEmoji?: string | null
        }
      }
    | undefined

  const me = useMemo(() => {
    const rawUser = data?.user as LeaderboardEntry | null | undefined
    if (!rawUser) return null
    return {
      ...rawUser,
      // Merge display selections so the user's own "Your standing"
      // row + badge tab read these fields off the same object.
      displayBadge: profile?.display?.displayBadge ?? rawUser.displayBadge ?? null,
      borderColor: profile?.display?.borderColor ?? (rawUser as any).borderColor ?? null,
      nameEmoji: profile?.display?.nameEmoji ?? rawUser.nameEmoji ?? null,
      // Badge progression — populated by the server based on the
      // user's current XP vs the badge catalog.
      nextBadge: profile?.nextBadge ?? null,
      afterNextBadgeHint: profile?.afterNextBadgeHint ?? null,
    } as LeaderboardEntry & {
      nextBadge?: NonNullable<typeof profile>['nextBadge']
      afterNextBadgeHint?: NonNullable<typeof profile>['afterNextBadgeHint']
    }
  }, [data?.user, profile])

  const earnedBadges = profile?.earnedBadges ?? []

  const myPoints =
    (me?.all_time_points ?? me?.total_points ?? 0) as number
  const tier = useMemo(() => tierProgress(myPoints), [myPoints])

  return (
    // `-mt-* pt-*` cancels the root layout's top padding so the page's
    // bg-background extends all the way under the (translucent) site header.
    // Without this, the dark `app-gradient-bg` shows through the
    // 96-128px padding strip and reads as a hard cut between header
    // and content. Internal padding restores the original content
    // position; `min-h-screen` keeps the page filling the viewport.
    <main className="min-h-screen bg-background text-foreground -mt-24 md:-mt-28 lg:-mt-32 pt-24 md:pt-28 lg:pt-32">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <Hero
        season={season}
        isConnected={!!isConnected}
        loading={isLoading && !!wallet}
        me={me}
        myPoints={myPoints}
        tier={tier}
        onRefresh={refetch}
        isFetching={isFetching}
        walletAddress={wallet}
        onUsernameUpdated={() => refetch()}
      />

      <div className="mx-6 border-t border-foreground/[0.06]" />

      {/* ── Tab navigation ───────────────────────────────────────────── */}
      <div
        className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-6 entry-fade-up"
        style={{ '--entry-delay': '180ms' } as React.CSSProperties}
      >
        <TabNav
          value={tab}
          onChange={(t) => startTabTransition(() => setTab(t))}
          isPending={isTabPending}
        />
      </div>

      <div className="mx-6 border-t border-foreground/[0.06]" />

      {!!error && (
        <div className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 mt-6">
          <div className="px-4 py-2 text-sm text-foreground bg-foreground/[0.03] border border-foreground/[0.06] rounded-md">
            Could not load leaderboard. {(error as Error).message}
          </div>
        </div>
      )}

      {tab === 'leaderboard' && (
        <LeaderboardTab
          period={period}
          onPeriodChange={(p) => {
            // Both writes are urgent — `useDeferredValue` handles the
            // deferral on the read side. Pagination reset must travel
            // with the period change so the deferred fetch sees a
            // consistent (period, offset) pair.
            setPeriod(p)
            setOffset(0)
          }}
          stats={stats}
          entries={entries}
          offset={offset}
          setOffset={setOffset}
          loading={isLoading}
          isFetching={isFetching}
          isFilterPending={isFilterPending}
          hasMore={data?.pagination?.hasMore ?? false}
          wallet={wallet}
          me={me}
        />
      )}

      {tab === 'profile' && (
        <ProfileTab
          isConnected={!!isConnected}
          loading={isLoading && !!wallet}
          me={me}
          tier={tier}
          userTransactions={userTransactions}
          walletAddress={wallet}
          selections={profile?.selections ?? null}
          earnedBadges={profile?.earnedBadges ?? []}
          unlockedEmojis={profile?.unlocked?.emojis ?? []}
          unlockedColors={profile?.unlocked?.borderColors ?? []}
          signMessageAsync={signMessageAsync}
          onSaved={refetch}
        />
      )}

      {tab === 'badges' && (
        <BadgesTab
          isConnected={!!isConnected}
          me={me}
          earnedBadges={earnedBadges}
        />
      )}

      {tab === 'guide' && (
        <GuideTab currentPoints={myPoints} isConnected={!!isConnected} />
      )}

      <div className="h-16" />
    </main>
  )
}

// ─── Hero ────────────────────────────────────────────────────────────────────

interface HeroProps {
  season: ReturnType<typeof getCurrentSeason>
  isConnected: boolean
  loading: boolean
  me: LeaderboardEntry | null
  myPoints: number
  tier: ReturnType<typeof tierProgress>
  onRefresh: () => void
  isFetching: boolean
  walletAddress: string | undefined
  onUsernameUpdated: () => void
}

function Hero({
  season,
  isConnected,
  loading,
  me,
  myPoints,
  tier,
  onRefresh,
  isFetching,
  walletAddress,
  onUsernameUpdated,
}: HeroProps) {
  // Briefly pulses the points + rank line whenever the value
  // transitions to a new non-null value (refresh / tx verification /
  // background poll). The CountUp inside still ticks the digits; the
  // pulse adds a "this matters" scale signal on top.
  const pointsPulsing = usePulseOnChange(myPoints)
  return (
    <header className="relative w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 pt-14 md:pt-20 pb-12 md:pb-16">
      {/* WebGL fragment-shader backdrop. Sits behind everything via
          inset-0; the shader has edge fades baked into the GLSL so it
          dissolves before meeting the right-side card or the section
          divider underneath. `pointer-events-none` so it never steals
          clicks; `aria-hidden` so it's invisible to screen readers. */}
      <HeroShader />

      <div className="relative z-10 flex items-start justify-between gap-6 flex-wrap">
        {/* Left: title + season chip + refresh */}
        <div className="flex-1 min-w-[260px] entry-fade-up">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-foreground/[0.06] bg-background">
              <Trophy className="w-4 h-4" />
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tighter">
              Leaderboard
            </h1>
          </div>
          {season && (
            <div className="mb-4">
              <SeasonChip name={season.name} endAt={season.endAt} />
            </div>
          )}
          <p className="text-sm md:text-base text-foreground/60 max-w-xl leading-relaxed">
            Earn points by supplying, borrowing, repaying and withdrawing. Climb
            the ranks to unlock badges and tier rewards.
          </p>
          <div className="mt-5">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isFetching}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs',
                'border border-foreground/[0.06] hover:border-foreground/20 transition-colors',
                'text-foreground/60 hover:text-foreground bg-background/60 backdrop-blur-sm',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <RefreshCw className={cn('w-3 h-3', isFetching && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>

        {/* Right: your standing (compact card) */}
        <div
          className="w-full md:w-auto md:min-w-[320px] flex-shrink-0 entry-fade-scale"
          style={{ '--entry-delay': '80ms' } as React.CSSProperties}
        >
          {!isConnected ? (
            <div className="rounded-2xl border border-foreground/[0.06] bg-background p-6 text-center">
              <p className="text-sm text-foreground/60">
                Connect a wallet to see your rank and earn points.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-foreground/[0.06] bg-background p-5">
              <p className="text-[11px] uppercase tracking-widest text-foreground/40">
                Your points
              </p>
              <div
                className={cn(
                  'mt-2 flex items-baseline gap-3 origin-left',
                  pointsPulsing && 'kpi-pulse',
                )}
              >
                <span className="text-3xl md:text-[34px] font-semibold tracking-tight font-mono tabular-nums">
                  {loading ? (
                    <span className="text-foreground/30">— —</span>
                  ) : (
                    <CountUp value={myPoints} />
                  )}
                </span>
                <span className="text-xs text-foreground/40 font-mono tabular-nums">
                  #{me?.global_rank ?? me?.rank ?? '—'}
                </span>
              </div>

              {/* Username + share row */}
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <UsernameButton
                  current={me?.username}
                  nameEmoji={me?.nameEmoji ?? null}
                  walletAddress={walletAddress}
                  onUpdated={onUsernameUpdated}
                />
                <ShareButton
                  rank={me?.global_rank ?? me?.rank ?? null}
                  points={myPoints}
                  tierLabel={tier.current.level}
                  walletAddress={walletAddress}
                  username={me?.username}
                />
              </div>

              {/* Tier + progress */}
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs text-foreground/60">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden>{tier.current.emoji}</span>
                    <span className="font-medium text-foreground">
                      {tier.current.level}
                    </span>
                  </span>
                  {tier.next ? (
                    <span className="font-mono tabular-nums">
                      {tier.toNext.toLocaleString()} pts to {tier.next.level}
                    </span>
                  ) : (
                    <span className="font-mono">Max tier</span>
                  )}
                </div>
                <div className="mt-2 h-1.5 bg-foreground/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-foreground transition-[width] duration-500"
                    style={{ width: `${tier.percent}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function TabNav({
  value,
  onChange,
  isPending = false,
}: {
  value: Tab
  onChange: (v: Tab) => void
  /** True during a `useTransition`-wrapped tab switch. We dim the
   *  non-active pills very subtly so the click feels acknowledged
   *  even before the new tab content commits. */
  isPending?: boolean
}) {
  const opts: { id: Tab; label: string }[] = [
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'profile', label: 'Profile' },
    { id: 'badges', label: 'Badges' },
    { id: 'guide', label: 'How it works' },
  ]
  return (
    <div className="inline-flex border border-foreground/[0.06] rounded-full p-1 bg-background">
      {opts.map((opt) => {
        const active = opt.id === value
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            // Tab-pending dims the pill row very subtly — Trade
            // Republic style: enough to read as "we got your input"
            // without the user noticing a "loading" state.
            className={cn(
              'px-4 py-1.5 text-sm rounded-full transition-[color,background-color,opacity] duration-200',
              active
                ? 'bg-foreground text-background'
                : 'text-foreground/60 hover:text-foreground',
              !active && isPending && 'opacity-50',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Leaderboard tab ─────────────────────────────────────────────────────────

interface LeaderboardTabProps {
  period: Period
  onPeriodChange: (p: Period) => void
  stats: LeaderboardStats | null
  entries: LeaderboardEntry[]
  offset: number
  setOffset: (o: number) => void
  loading: boolean
  isFetching: boolean
  /** True when the UI period/offset is ahead of the deferred data. */
  isFilterPending: boolean
  hasMore: boolean
  wallet: string | undefined
  me: LeaderboardEntry | null
}

function LeaderboardTab({
  period,
  onPeriodChange,
  stats,
  entries,
  offset,
  setOffset,
  loading,
  isFetching,
  isFilterPending,
  hasMore,
  wallet,
  me,
}: LeaderboardTabProps) {
  return (
    <>
      {/* KPI strip */}
      <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-foreground/[0.06] rounded-xl overflow-hidden border border-foreground/[0.06]">
          <KpiCell
            label="Active users"
            value={stats?.total_users != null ? formatNumber(Number(stats.total_users)) : null}
            sub="All seasons, all networks"
            loading={loading}
            index={0}
          />
          <KpiCell
            label="Points awarded"
            value={stats?.total_points_awarded != null ? formatNumber(Number(stats.total_points_awarded)) : null}
            sub="All time, all chains"
            loading={loading}
            index={1}
          />
          <KpiCell
            label="Verified txs"
            value={stats?.total_verified_transactions != null ? formatNumber(Number(stats.total_verified_transactions)) : null}
            sub="Supply / borrow / repay / withdraw"
            loading={loading}
            index={2}
          />
          <KpiCell
            label="Your rank"
            value={me?.rank ? `#${me.rank.toLocaleString()}` : null}
            sub={
              me?.total_points
                ? `${me.total_points.toLocaleString()} pts`
                : !wallet
                  ? 'Connect to see your rank'
                  : 'No activity yet'
            }
            loading={loading && !!wallet}
            index={3}
          />
        </div>
      </section>

      <div className="mx-6 border-t border-foreground/[0.06]" />

      {/* Your row */}
      {me && (
        <>
          <section
            className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-6 entry-fade-up"
            style={{ '--entry-delay': '360ms' } as React.CSSProperties}
          >
            <p className="text-[11px] uppercase tracking-widest text-foreground/40 mb-3">
              Your standing
            </p>
            <LeaderboardRow entry={me} period={period} self />
          </section>
          <div className="mx-6 border-t border-foreground/[0.06]" />
        </>
      )}

      {/* Top entries */}
      <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-10">
        <div
          className="flex items-end justify-between gap-4 mb-5 flex-wrap entry-fade-up"
          style={{ '--entry-delay': '420ms' } as React.CSSProperties}
        >
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {period === 'all' ? 'Top all-time' : `Top — ${periodLabel(period)}`}
            </h2>
            <p className="text-xs text-foreground/50 mt-1">
              {offset > 0
                ? `Showing rank ${offset + 1} to ${offset + entries.length}`
                : `Top ${PAGE_SIZE}`}
              {' · '}
              <span className="text-foreground/40">
                {period === 'all'
                  ? 'All includes achievement points'
                  : 'Activity points only'}
              </span>
            </p>
          </div>
          <PeriodTabs
            value={period}
            onChange={onPeriodChange}
            isPending={isFilterPending}
          />
        </div>

        <TableHeader />
        {/* The filtered list is the deferred-data slot. When the user
            clicks a period pill or paginates, the surrounding controls
            stay urgent; this block fades to ~60% opacity until the new
            data lands. Reads as "we received it, working on it" without
            the harshness of a spinner overlay. */}
        <div
          className={cn(
            'transition-opacity duration-200',
            isFilterPending && 'opacity-60',
          )}
          aria-busy={isFilterPending || undefined}
        >
          {loading && entries.length === 0 ? (
            <TableSkeleton />
          ) : entries.length === 0 ? (
            <div className="text-sm text-foreground/40 py-8 text-center border-t border-foreground/[0.06]">
              No entries for this filter yet.
            </div>
          ) : (
            <div className="divide-y divide-foreground/[0.06] border-y border-foreground/[0.06]">
              {entries.map((u, i) => (
                <LeaderboardRow
                  key={u.wallet_address}
                  entry={u}
                  period={period}
                  self={!!wallet && wallet.toLowerCase() === u.wallet_address.toLowerCase()}
                  index={i}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="mt-6 flex items-center justify-between text-sm text-foreground/60">
          <button
            type="button"
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0 || isFetching}
            className={cn(
              'px-3 py-1.5 rounded-full border transition-colors',
              'border-foreground/[0.06] hover:border-foreground/20',
              'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-foreground/[0.06]',
            )}
          >
            ← Previous
          </button>
          <span className="text-xs text-foreground/40 font-mono">
            Page {Math.floor(offset / PAGE_SIZE) + 1}
          </span>
          <button
            type="button"
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={!hasMore || isFetching}
            className={cn(
              'px-3 py-1.5 rounded-full border transition-colors',
              'border-foreground/[0.06] hover:border-foreground/20',
              'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-foreground/[0.06]',
            )}
          >
            Next →
          </button>
        </div>
      </section>
    </>
  )
}

// ─── Profile tab ─────────────────────────────────────────────────────────────

interface ProfileEarnedBadge {
  id: string
  name: string
  icon: string
  unlockEmoji?: string | null
  unlockBorderColor?: string | null
  tier: string
  allowLeaderboardDisplay?: boolean
}

interface ProfileTabProps {
  isConnected: boolean
  loading: boolean
  me: LeaderboardEntry | null
  tier: ReturnType<typeof tierProgress>
  userTransactions: UserTx[]
  walletAddress: string | undefined
  selections: { badgeId?: string | null; borderColor?: string | null; nameEmoji?: string | null } | null
  earnedBadges: ProfileEarnedBadge[]
  unlockedEmojis: string[]
  unlockedColors: string[]
  signMessageAsync: ReturnType<typeof useSignMessage>['signMessageAsync']
  onSaved: () => Promise<unknown> | void
}

function ProfileTab({
  isConnected,
  loading,
  me,
  tier,
  userTransactions,
  walletAddress,
  selections,
  earnedBadges,
  unlockedEmojis,
  unlockedColors,
  signMessageAsync,
  onSaved,
}: ProfileTabProps) {
  const [visibleTx, setVisibleTx] = useState(BASE_VISIBLE_TX)
  const [seasonHistory, setSeasonHistory] = useState<SeasonHistoryEntry[]>([])
  const [seasonHistoryLoading, setSeasonHistoryLoading] = useState(false)

  // Fetch season history for the connected wallet. Cached per-wallet on
  // the server; we re-fetch when the wallet changes (Privy switch / connect).
  useEffect(() => {
    if (!walletAddress) {
      setSeasonHistory([])
      return
    }
    let cancelled = false
    setSeasonHistoryLoading(true)
    fetch(`/api/leaderboard/season-history?wallet=${walletAddress}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.history)) {
          setSeasonHistory(data.history as SeasonHistoryEntry[])
        }
      })
      .catch(() => {
        /* fall through with empty list */
      })
      .finally(() => {
        if (!cancelled) setSeasonHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [walletAddress])
  const formatUSD = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }),
    [],
  )

  const profileAgg = useMemo(() => {
    const byType: Record<
      'supply' | 'borrow' | 'repay' | 'redeem',
      { usd: number; count: number }
    > = {
      supply: { usd: 0, count: 0 },
      borrow: { usd: 0, count: 0 },
      repay: { usd: 0, count: 0 },
      redeem: { usd: 0, count: 0 },
    }
    const byToken: Record<string, { usd: number; count: number }> = {}
    const byChain: Record<number, { usd: number; count: number }> = {}
    for (const tx of userTransactions) {
      const t = tx.action_type
      const usd = Number(tx.usd_value || 0)
      if (byType[t]) {
        byType[t].usd += usd
        byType[t].count += 1
      }
      if (!byToken[tx.token_symbol]) byToken[tx.token_symbol] = { usd: 0, count: 0 }
      byToken[tx.token_symbol].usd += usd
      byToken[tx.token_symbol].count += 1
      if (!byChain[tx.chain_id]) byChain[tx.chain_id] = { usd: 0, count: 0 }
      byChain[tx.chain_id].usd += usd
      byChain[tx.chain_id].count += 1
    }
    const topTokens = Object.entries(byToken)
      .sort((a, b) => b[1].usd - a[1].usd)
      .slice(0, 6)
    const chains = Object.entries(byChain)
      .map(([id, v]) => ({ id: Number(id), ...v }))
      .sort((a, b) => b.usd - a.usd)
    return { byType, topTokens, chains }
  }, [userTransactions])

  const visibleTransactions = useMemo(
    () => userTransactions.slice(0, visibleTx),
    [userTransactions, visibleTx],
  )

  if (!isConnected || !me) {
    return (
      <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-16">
        <div className="text-center border border-foreground/[0.06] rounded-2xl p-10">
          <p className="text-sm text-foreground/60">
            Connect your wallet and make your first action to see your profile.
          </p>
        </div>
      </section>
    )
  }

  return (
    <>
      {/* Display customization — pick the badge / border / emoji that
          show on your public leaderboard row. */}
      <DisplayCustomization
        username={me.username ?? null}
        walletAddress={walletAddress}
        loading={loading}
        selections={selections}
        earnedBadges={earnedBadges}
        unlockedEmojis={unlockedEmojis}
        unlockedColors={unlockedColors}
        signMessageAsync={signMessageAsync}
        onSaved={onSaved}
      />

      <div className="mx-6 border-t border-foreground/[0.06]" />

      {/* Action Summary */}
      <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-10">
        <h2 className="text-lg font-semibold tracking-tight">Action summary</h2>
        <p className="text-xs text-foreground/50 mt-1 mb-6">
          USD volume and count per action type, across all chains.
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-foreground/[0.06] rounded-xl overflow-hidden border border-foreground/[0.06]">
          {[
            { label: 'Supplies', v: profileAgg.byType.supply },
            { label: 'Borrows', v: profileAgg.byType.borrow },
            { label: 'Repays', v: profileAgg.byType.repay },
            { label: 'Withdraws', v: profileAgg.byType.redeem },
          ].map((item, i) => (
            <KpiCell
              key={item.label}
              label={item.label}
              value={formatUSD.format(item.v.usd)}
              sub={`${item.v.count} ${item.v.count === 1 ? 'tx' : 'txs'}`}
              loading={loading}
              index={i}
            />
          ))}
        </div>
      </section>

      <div className="mx-6 border-t border-foreground/[0.06]" />

      {/* Top tokens + Chains */}
      <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-2 gap-10 scroll-reveal-section">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Top tokens</h3>
          <p className="text-xs text-foreground/50 mt-1 mb-5">
            Ranked by total USD volume.
          </p>
          {profileAgg.topTokens.length === 0 ? (
            <p className="text-sm text-foreground/40">No token activity yet.</p>
          ) : (
            <div className="divide-y divide-foreground/[0.06] border-y border-foreground/[0.06]">
              {profileAgg.topTokens.map(([sym, v]) => (
                <div
                  key={sym}
                  className="flex items-center justify-between py-3"
                >
                  <span className="font-mono text-sm font-medium">{sym}</span>
                  <span className="text-right">
                    <span className="block font-mono tabular-nums text-sm">
                      {formatUSD.format(v.usd)}
                    </span>
                    <span className="block text-[11px] text-foreground/40">
                      {v.count} tx
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-lg font-semibold tracking-tight">Chains</h3>
          <p className="text-xs text-foreground/50 mt-1 mb-5">
            Per-chain breakdown of activity.
          </p>
          {profileAgg.chains.length === 0 ? (
            <p className="text-sm text-foreground/40">No chain activity yet.</p>
          ) : (
            <div className="divide-y divide-foreground/[0.06] border-y border-foreground/[0.06]">
              {profileAgg.chains.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between py-3"
                >
                  <span className="text-sm font-medium">
                    {chainName(c.id)}
                  </span>
                  <span className="text-right">
                    <span className="block font-mono tabular-nums text-sm">
                      {formatUSD.format(c.usd)}
                    </span>
                    <span className="block text-[11px] text-foreground/40">
                      {c.count} tx
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="mx-6 border-t border-foreground/[0.06]" />

      {/* Recent transactions */}
      <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-10 scroll-reveal-section">
        <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">
              Recent transactions
            </h3>
            <p className="text-xs text-foreground/50 mt-1">
              Latest verified activity across all chains.
            </p>
          </div>
          {userTransactions.length > BASE_VISIBLE_TX && (
            <button
              type="button"
              onClick={() =>
                setVisibleTx((v) =>
                  v > BASE_VISIBLE_TX
                    ? BASE_VISIBLE_TX
                    : Math.min(userTransactions.length, v + 10),
                )
              }
              className="text-xs px-3 py-1.5 rounded-full border border-foreground/[0.06] hover:border-foreground/20 transition-colors"
            >
              {visibleTx > BASE_VISIBLE_TX ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        {userTransactions.length === 0 ? (
          <p className="text-sm text-foreground/40 border border-dashed border-foreground/[0.08] rounded-lg py-8 text-center">
            No verified transactions yet.
          </p>
        ) : (
          <div className="border border-foreground/[0.06] rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 px-5 py-3 text-[11px] uppercase tracking-widest text-foreground/40 border-b border-foreground/[0.06] bg-foreground/[0.015]">
              <div className="col-span-4">Action · Asset</div>
              <div className="col-span-3 text-right">USD</div>
              <div className="col-span-2 text-right">+pts</div>
              <div className="col-span-3 text-right">When · Chain</div>
            </div>
            {visibleTransactions.map((tx) => (
              <TxRow key={tx.tx_hash} tx={tx} formatUSD={formatUSD} />
            ))}
          </div>
        )}
      </section>

      {/* Season history — only shown for users who have at least one
          archived season. Loading state hides the section to avoid a
          flash of "no history" before the network resolves. */}
      {(seasonHistoryLoading || seasonHistory.length > 0) && (
        <>
          <div className="mx-6 border-t border-foreground/[0.06]" />
          <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-10 scroll-reveal-section">
            <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">
                  Season history
                </h3>
                <p className="text-xs text-foreground/50 mt-1">
                  Past seasons with their final standing and activity counts.
                </p>
              </div>
              {!seasonHistoryLoading && (
                <span className="text-[11px] uppercase tracking-widest text-foreground/40">
                  {seasonHistory.length} season
                  {seasonHistory.length === 1 ? '' : 's'}
                </span>
              )}
            </div>

            {seasonHistoryLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className="skeleton-shimmer skeleton-shimmer-slow h-20 border border-foreground/[0.06] rounded-xl"
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {seasonHistory.map((s) => (
                  <SeasonHistoryCard key={s.seasonId} entry={s} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  )
}

// ─── Display customization ──────────────────────────────────────────────────
// Lets the user pick which earned badge, unlocked border color and name
// emoji surface on their public leaderboard row. Previously lived in the
// legacy color leaderboard, then was moved to a standalone account page; it
// is re-surfaced here in the Profile tab so users can edit it in context.
// Saves via the existing wallet-signed `POST /api/user/profile/display`.

function DisplayCustomization({
  username,
  walletAddress,
  loading,
  selections,
  earnedBadges,
  unlockedEmojis,
  unlockedColors,
  signMessageAsync,
  onSaved,
}: {
  username: string | null
  walletAddress: string | undefined
  loading: boolean
  selections: { badgeId?: string | null; borderColor?: string | null; nameEmoji?: string | null } | null
  earnedBadges: ProfileEarnedBadge[]
  unlockedEmojis: string[]
  unlockedColors: string[]
  signMessageAsync: ReturnType<typeof useSignMessage>['signMessageAsync']
  onSaved: () => Promise<unknown> | void
}) {
  // Badges flagged `allowLeaderboardDisplay: false` are earned but not
  // meant to be featured — keep them out of the picker.
  const displayBadges = useMemo(
    () => earnedBadges.filter((b) => b.allowLeaderboardDisplay !== false),
    [earnedBadges],
  )

  const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null)
  const [selectedBorderColor, setSelectedBorderColor] = useState<string | null>(null)
  const [selectedNameEmoji, setSelectedNameEmoji] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const hydrated = useRef(false)

  // Hydrate the pickers from the server's saved selections exactly once, so
  // a background leaderboard refetch can't clobber a mid-edit choice.
  useEffect(() => {
    if (hydrated.current || !selections) return
    setSelectedBadgeId(selections.badgeId ?? null)
    setSelectedBorderColor(selections.borderColor ?? null)
    setSelectedNameEmoji(selections.nameEmoji ?? null)
    hydrated.current = true
  }, [selections])

  const dirty =
    (selections?.badgeId ?? null) !== selectedBadgeId ||
    (selections?.borderColor ?? null) !== selectedBorderColor ||
    (selections?.nameEmoji ?? null) !== selectedNameEmoji

  const hasOptions =
    displayBadges.length > 0 || unlockedColors.length > 0 || unlockedEmojis.length > 0

  const selectedBadge = displayBadges.find((b) => b.id === selectedBadgeId) ?? null

  async function save() {
    if (!walletAddress) return
    setSaving(true)
    try {
      const timestamp = Date.now()
      const wallet = walletAddress.toLowerCase()
      const payload = `${selectedBadgeId || ''}|${selectedBorderColor || ''}|${selectedNameEmoji || ''}`
      const message = `Peridot: set profile display ${payload} for ${wallet} at ${timestamp}`
      const signature = await signMessageAsync({
        account: walletAddress as `0x${string}`,
        message,
      })
      const res = await fetch('/api/user/profile/display', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          signature,
          timestamp,
          selected_badge_id: selectedBadgeId,
          selected_border_color: selectedBorderColor,
          selected_name_emoji: selectedNameEmoji,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to save')
      }
      // Re-baseline against the freshly persisted values so `dirty` resets.
      await onSaved()
      toast({ title: 'Display saved', description: 'Your leaderboard row is updated.' })
    } catch (e: any) {
      toast({
        title: 'Could not save display',
        description: e?.message || 'Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  const displayName =
    username ||
    (walletAddress
      ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
      : 'You')
  const isGradient =
    typeof selectedBorderColor === 'string' &&
    selectedBorderColor.toLowerCase().includes('gradient')

  return (
    <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-10">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-foreground/50" />
        <h2 className="text-lg font-semibold tracking-tight">Display</h2>
      </div>
      <p className="text-xs text-foreground/50 mt-1 mb-6">
        Pick the badge, border color and name emoji that show on your public
        leaderboard row.
      </p>

      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="skeleton-shimmer h-16 rounded-xl border border-foreground/[0.06]"
            />
          ))}
        </div>
      ) : !hasOptions ? (
        <p className="text-sm text-foreground/40 border border-dashed border-foreground/[0.08] rounded-lg py-8 text-center">
          Earn badges by completing achievements to unlock display options.
        </p>
      ) : (
        <div className="space-y-8">
          {/* Preview */}
          <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.015] p-4">
            <p className="text-[11px] uppercase tracking-widest text-foreground/40 mb-3">
              Preview
            </p>
            <div className="relative flex items-center justify-between gap-3 rounded-lg border border-foreground/[0.06] bg-background px-4 py-3">
              {selectedBorderColor && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-lg"
                  style={
                    isGradient
                      ? { backgroundImage: selectedBorderColor, opacity: 0.25 }
                      : { boxShadow: `0 0 0 2px ${selectedBorderColor}` }
                  }
                />
              )}
              <div className="relative z-10 flex items-center gap-2 min-w-0">
                <span className="font-mono text-[12px] text-foreground/40">#—</span>
                {selectedNameEmoji && (
                  <span className="text-base leading-none" aria-hidden>
                    {selectedNameEmoji}
                  </span>
                )}
                <span className="text-sm font-medium truncate">
                  {displayName}
                </span>
              </div>
              {selectedBadge ? (
                <span
                  className="relative z-10 inline-flex items-center gap-1 rounded-full border border-foreground/[0.1] px-2 py-0.5 text-[11px] shrink-0"
                  title={selectedBadge.name}
                >
                  <span aria-hidden>{selectedBadge.icon}</span>
                  <span className="truncate max-w-[5rem] sm:max-w-[8rem]">
                    {selectedBadge.name}
                  </span>
                </span>
              ) : (
                <span className="relative z-10 text-[11px] text-foreground/30 shrink-0">
                  No badge
                </span>
              )}
            </div>
          </div>

          {/* Display badge */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-foreground/40" />
              <h3 className="text-sm font-semibold tracking-tight">
                Display badge
              </h3>
            </div>
            {displayBadges.length === 0 ? (
              <p className="text-xs text-foreground/40">No badges earned yet.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                <DisplayTile
                  selected={selectedBadgeId === null}
                  onClick={() => setSelectedBadgeId(null)}
                  icon="—"
                  label="None"
                />
                {displayBadges.map((b) => (
                  <DisplayTile
                    key={b.id}
                    selected={selectedBadgeId === b.id}
                    onClick={() =>
                      setSelectedBadgeId((cur) => (cur === b.id ? null : b.id))
                    }
                    icon={b.icon}
                    label={b.name}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Border color */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Palette className="w-3.5 h-3.5 text-foreground/40" />
              <h3 className="text-sm font-semibold tracking-tight">
                Border color
              </h3>
            </div>
            {unlockedColors.length === 0 ? (
              <p className="text-xs text-foreground/40">
                No border colors unlocked yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <NonePill
                  selected={selectedBorderColor === null}
                  onClick={() => setSelectedBorderColor(null)}
                />
                {unlockedColors.map((c) => {
                  const grad = c.toLowerCase().includes('gradient')
                  const isSel = selectedBorderColor === c
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Border ${c}`}
                      onClick={() =>
                        setSelectedBorderColor((cur) => (cur === c ? null : c))
                      }
                      className={cn(
                        'h-9 w-9 rounded-full border overflow-hidden transition-all',
                        isSel
                          ? 'ring-2 ring-foreground ring-offset-2 ring-offset-white'
                          : 'border-foreground/10 hover:border-foreground/30',
                      )}
                      style={
                        grad
                          ? { backgroundImage: c, borderColor: 'transparent' }
                          : { backgroundColor: `${c}33`, borderColor: c }
                      }
                    />
                  )
                })}
              </div>
            )}
          </div>

          {/* Name emoji */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Smile className="w-3.5 h-3.5 text-foreground/40" />
              <h3 className="text-sm font-semibold tracking-tight">
                Name emoji
              </h3>
            </div>
            {unlockedEmojis.length === 0 ? (
              <p className="text-xs text-foreground/40">No emojis unlocked yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <NonePill
                  selected={selectedNameEmoji === null}
                  onClick={() => setSelectedNameEmoji(null)}
                />
                {unlockedEmojis.map((e) => {
                  const isSel = selectedNameEmoji === e
                  return (
                    <button
                      key={e}
                      type="button"
                      aria-label={`Emoji ${e}`}
                      onClick={() =>
                        setSelectedNameEmoji((cur) => (cur === e ? null : e))
                      }
                      className={cn(
                        'h-9 w-9 rounded-full border flex items-center justify-center transition-all',
                        isSel
                          ? 'ring-2 ring-foreground ring-offset-2 ring-offset-white border-transparent'
                          : 'border-foreground/10 hover:border-foreground/30',
                      )}
                    >
                      <span className="text-base">{e}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Save */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving || !walletAddress}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm transition-colors',
                'bg-foreground text-background hover:bg-foreground/90',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'Saving…' : dirty ? 'Save display' : 'No changes'}
            </button>
            <span className="text-[11px] text-foreground/40">
              Saving requires a wallet signature.
            </span>
          </div>
        </div>
      )}
    </section>
  )
}

function DisplayTile({
  selected,
  onClick,
  icon,
  label,
}: {
  selected: boolean
  onClick: () => void
  icon: string
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border p-3 text-left transition-colors',
        selected
          ? 'border-foreground bg-foreground/[0.04]'
          : 'border-foreground/[0.06] hover:border-foreground/20 hover:bg-foreground/[0.015]',
      )}
    >
      <span className="text-lg leading-none" aria-hidden>
        {icon}
      </span>
      <span className="block text-[11px] mt-1 truncate text-foreground/60">
        {label}
      </span>
    </button>
  )
}

function NonePill({
  selected,
  onClick,
}: {
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-9 px-3 rounded-full border text-[11px] transition-colors',
        selected
          ? 'border-foreground bg-foreground/[0.04] text-foreground'
          : 'border-foreground/10 text-foreground/50 hover:border-foreground/30',
      )}
    >
      None
    </button>
  )
}

function SeasonHistoryCard({ entry }: { entry: SeasonHistoryEntry }) {
  const total =
    entry.supplyCount + entry.borrowCount + entry.repayCount + entry.redeemCount
  return (
    <div className="border border-foreground/[0.06] rounded-xl px-5 py-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">{entry.seasonName}</p>
          <p className="text-[11px] text-foreground/40 mt-0.5">
            {new Date(entry.archivedAt).toLocaleDateString([], {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
            {entry.totalLoginDays > 0 &&
              ` · ${entry.totalLoginDays} login day${entry.totalLoginDays === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono tabular-nums text-sm font-semibold">
            {entry.finalPoints.toLocaleString()} pts
          </p>
          {entry.finalRank && (
            <p className="text-[11px] text-foreground/40 mt-0.5">
              Finished #{entry.finalRank.toLocaleString()}
            </p>
          )}
        </div>
      </div>
      {total > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-px bg-foreground/[0.06] rounded-lg overflow-hidden border border-foreground/[0.06]">
          {[
            { label: 'Supplies', v: entry.supplyCount },
            { label: 'Borrows', v: entry.borrowCount },
            { label: 'Repays', v: entry.repayCount },
            { label: 'Withdraws', v: entry.redeemCount },
          ].map((item) => (
            <div key={item.label} className="bg-background px-3 py-2 text-center">
              <p className="text-sm font-mono tabular-nums font-medium">
                {item.v}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-foreground/40">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TxRow({ tx, formatUSD }: { tx: UserTx; formatUSD: Intl.NumberFormat }) {
  const url = explorerTxUrl(tx.chain_id, tx.tx_hash)
  const when = useMemo(() => {
    const d = new Date(tx.verified_at)
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }, [tx.verified_at])
  return (
    <div className="grid grid-cols-12 px-5 py-3 items-center text-sm border-b border-foreground/[0.06] last:border-b-0 hover:bg-foreground/[0.015]">
      <div className="col-span-4 flex items-center gap-2 min-w-0">
        <span className="capitalize text-foreground/80 truncate">
          {tx.action_type === 'redeem' ? 'withdraw' : tx.action_type}
        </span>
        <span className="font-mono text-foreground/80">{tx.token_symbol}</span>
      </div>
      <div className="col-span-3 text-right font-mono tabular-nums">
        {formatUSD.format(Number(tx.usd_value || 0))}
      </div>
      <div className="col-span-2 text-right font-mono tabular-nums text-foreground/70">
        +{Number(tx.points_awarded || 0).toLocaleString()}
      </div>
      <div className="col-span-3 text-right">
        <span className="text-xs text-foreground/50">{when}</span>
        <span className="block text-[11px] text-foreground/40">
          {chainName(tx.chain_id)}
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="ml-1 inline-flex items-center hover:text-foreground"
              aria-label="View on explorer"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : null}
        </span>
      </div>
    </div>
  )
}

// ─── Badges tab ──────────────────────────────────────────────────────────────

interface BadgesTabProps {
  isConnected: boolean
  me: (LeaderboardEntry & {
    nextBadge?: {
      id: string
      name: string
      description: string
      icon: string
      tier: string
      xpThreshold?: number
      unlockEmoji?: string
      unlockBorderColor?: string
      pointsReward?: number
    } | null
  }) | null
  earnedBadges: Array<{
    id: string
    name: string
    icon: string
    unlockEmoji?: string
    tier: string
    description?: string
  }>
}

function BadgesTab({ isConnected, me, earnedBadges }: BadgesTabProps) {
  const earnedBadgeIds = useMemo(
    () => new Set(earnedBadges.map((b) => b.id)),
    [earnedBadges],
  )
  const lastEarnedBadge = earnedBadges[earnedBadges.length - 1] ?? null
  const lastEarnedBadgeMeta = useMemo(() => {
    if (!lastEarnedBadge) return null
    try {
      return getAllBadges().find((b: any) => b.id === lastEarnedBadge.id) || null
    } catch {
      return null
    }
  }, [lastEarnedBadge])

  if (!isConnected || !me) {
    return (
      <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-16">
        <div className="text-center border border-foreground/[0.06] rounded-2xl p-10">
          <p className="text-sm text-foreground/60">
            Connect your wallet and make your first action to see your badges.
          </p>
        </div>
      </section>
    )
  }

  return (
    <>
      {/* Next badge + Last earned */}
      <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-2 gap-6 scroll-reveal-section">
        <BadgePreviewCard
          title="Your next badge"
          icon={me.nextBadge?.icon || '🎖️'}
          name={me.nextBadge?.name}
          description={me.nextBadge?.description}
          tier={me.nextBadge?.tier}
          chips={[
            me.nextBadge?.xpThreshold
              ? `${me.nextBadge.xpThreshold.toLocaleString()} XP required`
              : null,
            typeof me.nextBadge?.pointsReward === 'number' &&
            me.nextBadge.pointsReward > 0
              ? `+${me.nextBadge.pointsReward.toLocaleString()} pts on unlock`
              : null,
            me.nextBadge?.unlockEmoji
              ? `Unlocks emoji ${me.nextBadge.unlockEmoji}`
              : null,
            me.nextBadge?.unlockBorderColor ? 'Unlocks profile border' : null,
          ].filter(Boolean) as string[]}
          empty="No upcoming badge — you've earned everything available right now."
        />
        <BadgePreviewCard
          title="Last earned"
          icon={lastEarnedBadge?.unlockEmoji || lastEarnedBadge?.icon || '✨'}
          name={lastEarnedBadge?.name}
          description={lastEarnedBadgeMeta?.description}
          tier={lastEarnedBadge?.tier}
          chips={[lastEarnedBadge ? 'Unlocked' : null].filter(Boolean) as string[]}
          empty="Earn your first badge to see it here."
        />
      </section>

      <div className="mx-6 border-t border-foreground/[0.06]" />

      {/* Info strip */}
      <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-6 scroll-reveal-section">
        <div className="rounded-xl border border-foreground/[0.06] p-4 flex items-start gap-3">
          <Sparkles className="w-4 h-4 mt-0.5 text-foreground/60" />
          <div className="text-xs text-foreground/60 leading-relaxed">
            Badges unlock profile borders, custom emojis, and bonus points.
            Most are tied to milestones across supplies, borrows and consistent
            activity.
          </div>
        </div>
      </section>

      <div className="mx-6 border-t border-foreground/[0.06]" />

      {/* Full catalogue */}
      <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-10 scroll-reveal-section">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">All badges</h3>
            <p className="text-xs text-foreground/50 mt-1">
              Discover the full catalogue. Locked badges show their criteria.
            </p>
          </div>
          <span className="text-[11px] uppercase tracking-widest text-foreground/40">
            {earnedBadgeIds.size} unlocked
          </span>
        </div>
        <div className="rounded-xl border border-foreground/[0.06] p-4 bg-background">
          <LazyBadgesAccordion earnedBadgeIds={earnedBadgeIds} />
        </div>
      </section>
    </>
  )
}

function BadgePreviewCard({
  title,
  icon,
  name,
  description,
  tier,
  chips,
  empty,
}: {
  title: string
  icon: string
  name?: string
  description?: string
  tier?: string
  chips: string[]
  empty: string
}) {
  if (!name) {
    return (
      <div className="rounded-2xl border border-foreground/[0.06] p-6">
        <p className="text-[11px] uppercase tracking-widest text-foreground/40">
          {title}
        </p>
        <p className="mt-3 text-sm text-foreground/50">{empty}</p>
      </div>
    )
  }
  return (
    <div className="rounded-2xl border border-foreground/[0.06] p-6">
      <p className="text-[11px] uppercase tracking-widest text-foreground/40">
        {title}
      </p>
      <div className="mt-4 flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl border border-foreground/[0.06] flex items-center justify-center text-2xl flex-shrink-0">
          <span aria-hidden>{icon}</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold tracking-tight truncate">{name}</p>
            {tier && (
              <span className="text-[10px] uppercase tracking-widest text-foreground/50 border border-foreground/[0.06] rounded-full px-2 py-0.5">
                {tier}
              </span>
            )}
          </div>
          {description && (
            <p className="text-xs text-foreground/50 mt-1 line-clamp-3">
              {description}
            </p>
          )}
          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span
                  key={c}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-foreground/[0.06] text-foreground/60"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Username edit dialog (B/W) ──────────────────────────────────────────────

function UsernameButton({
  current,
  nameEmoji,
  walletAddress,
  onUpdated,
}: {
  current?: string
  nameEmoji: string | null
  walletAddress: string | undefined
  onUpdated: () => void
}) {
  const [open, setOpen] = useState(false)
  // The EVM/Stellar split (message signing vs. session credential) lives in the
  // hook — this dialog no longer knows which wallet family it is renaming.
  const { save: saveUsername, saving } = useSetUsername()

  // The aggregate feed (`me`) is EVM-only, so for a Stellar wallet `current`
  // never arrives — read the name straight off the profile route instead.
  const isStellarWallet = !!walletAddress && /^G[A-Z2-7]{55}$/.test(walletAddress.toUpperCase())
  const [fetchedName, setFetchedName] = useState<string | null>(null)
  useEffect(() => {
    if (!isStellarWallet || current) return
    let cancelled = false
    fetch(`/api/user/profile?wallet=${walletAddress}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setFetchedName(d?.data?.username ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [walletAddress, isStellarWallet, current])

  const shownName = current ?? fetchedName ?? undefined
  const [value, setValue] = useState(shownName ?? '')

  useEffect(() => {
    if (open) setValue(shownName ?? '')
  }, [open, shownName])

  const isValid = /^[a-zA-Z0-9_-]{3,32}$/.test(value)
  const isSame = (shownName ?? '').toLowerCase() === value.trim().toLowerCase()

  async function save() {
    if (!walletAddress) return
    const res = await saveUsername(walletAddress, value)
    if (!res.ok) {
      toast({
        title: 'Could not set name',
        description: res.error || 'Please try again.',
      })
      return
    }
    toast({ title: 'Username updated', description: `Welcome, ${value}!` })
    setFetchedName(value)
    setOpen(false)
    onUpdated()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1',
            'border border-foreground/[0.06] hover:border-foreground/20 transition-colors',
            'text-foreground/70 hover:text-foreground',
          )}
        >
          {nameEmoji && <span aria-hidden>{nameEmoji}</span>}
          {shownName ? (
            <span className="font-mono">{shownName}</span>
          ) : (
            <span className="text-foreground/50">Set your name</span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md bg-background border border-foreground/[0.06] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight">
            {shownName ? 'Update your display name' : 'Choose your display name'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-foreground/60 mb-1">Username</label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="cool_kid_123"
              className="bg-background border-foreground/10 focus-visible:border-foreground focus-visible:ring-0"
            />
            <p className="mt-1 text-[11px] text-foreground/40">
              3–32 chars; letters, numbers, _ or -.
            </p>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving || !isValid || isSame}
              onClick={save}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm transition-colors',
                'bg-foreground text-background hover:bg-foreground/90',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {saving ? 'Saving…' : shownName ? 'Save changes' : 'Save'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Share dialog (B/W, copy-only — no canvas for now) ────────────────────────

function ShareButton({
  rank,
  points,
  tierLabel,
  walletAddress,
  username,
}: {
  rank: number | null
  points: number
  tierLabel: string
  walletAddress: string | undefined
  username?: string
}) {
  const [open, setOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const message = useMemo(() => {
    const rankStr = rank ? `#${rank.toLocaleString()}` : ''
    return `I'm ${rankStr} on Peridot with ${points.toLocaleString()} pts (${tierLabel}). Join me on https://peridot.finance/app`
  }, [rank, points, tierLabel])

  // Re-render the canvas whenever the dialog opens or its inputs change.
  // We use a 2x DPR-aware backing buffer so the downloaded PNG looks crisp
  // both on retina screens and at the 1200x630 OG-card size most socials
  // use to render link previews.
  //
  // The draw is deferred to the next animation frame so Radix has
  // committed the portal + run its mount transition. Drawing too early
  // is harmless for the buffer (it's not size-dependent), but on some
  // browsers a zero-size CSS layout at draw time leaves the canvas with
  // an empty visual that doesn't update until the next paint — which
  // reads as "the share dialog is empty". The rAF guarantees one paint
  // cycle has passed before we touch the buffer.
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      drawShareTile(canvas, {
        rank,
        points,
        tierLabel,
        walletAddress,
        username,
      })
    })
    return () => cancelAnimationFrame(id)
  }, [open, rank, points, tierLabel, walletAddress, username])

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message)
      toast({ title: 'Copied', description: 'Share message copied to clipboard.' })
    } catch {
      toast({ title: 'Copy failed', description: 'Try selecting the text manually.' })
    }
  }

  function postOnX() {
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(message)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function downloadPng() {
    try {
      const c = canvasRef.current
      if (!c) return
      const link = document.createElement('a')
      link.download = `peridot-leaderboard-${rank ?? 'rank'}.png`
      link.href = c.toDataURL('image/png')
      link.click()
    } catch {
      toast({ title: 'Download failed', description: 'Please try again.' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          // Solid black pill — the primary call to action inside the
          // hero card. Was nearly invisible as a ghost outline; this
          // reads at a glance and pairs visually with the "Post on X"
          // CTA inside the dialog.
          className={cn(
            'inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5',
            'bg-foreground text-background hover:bg-foreground/90 active:bg-foreground/80',
            'transition-[background-color,transform] duration-150',
            'active:scale-[0.97]',
          )}
        >
          <Share2 className="w-3 h-3" />
          Share
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md bg-background border border-foreground/[0.06] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight">
            Share your rank
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Canvas preview — same image the user will download. We render
              at 2x for retina; CSS scales it down to fit the dialog. */}
          <div className="rounded-xl border border-foreground/[0.06] overflow-hidden bg-background">
            <canvas
              ref={canvasRef}
              className="block w-full h-auto"
              aria-label="Shareable rank card preview"
            />
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyMessage}
              className="inline-flex items-center gap-1.5 text-sm rounded-full px-3 py-1.5 border border-foreground/[0.06] hover:border-foreground/20 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy text
            </button>
            <button
              type="button"
              onClick={downloadPng}
              className="inline-flex items-center gap-1.5 text-sm rounded-full px-3 py-1.5 border border-foreground/[0.06] hover:border-foreground/20 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download PNG
            </button>
            <button
              type="button"
              onClick={postOnX}
              className="inline-flex items-center gap-1.5 text-sm rounded-full px-3 py-1.5 bg-foreground text-background hover:bg-foreground/90 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              Post on X
            </button>
          </div>
          <p className="text-[11px] text-foreground/40">
            Tip: download the PNG and attach it when posting for a richer
            preview.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Share tile canvas renderer ──────────────────────────────────────────────
//
// Pure-black-on-white tile, 1200x630 (X/Open Graph 1.91:1 ratio). All
// drawing is layout-driven from primitive sizes so the same file scales
// crisply both in the dialog (CSS-shrunk) and as a 1200x630 PNG export.

interface ShareTileParams {
  rank: number | null
  points: number
  tierLabel: string
  walletAddress: string | undefined
  username?: string
}

function drawShareTile(canvas: HTMLCanvasElement, p: ShareTileParams) {
  const W = 1200
  const H = 630
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)

  // Backing buffer at DPR resolution; CSS size at the intrinsic 1200x630
  // ratio so getBoundingClientRect-driven layouts can pick the actual size
  // they need without distorting our internal coordinates.
  canvas.width = W * dpr
  canvas.height = H * dpr
  canvas.style.aspectRatio = `${W} / ${H}`
  canvas.style.width = '100%'

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)

  // Background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // Outer hairline border
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, W - 2, H - 2)

  // Header brand strip
  ctx.fillStyle = '#000000'
  ctx.font = '600 22px Inter, system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText('PERIDOT', 64, 80)
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.font = '500 14px ui-monospace, SF Mono, Menlo, monospace'
  ctx.fillText('LEADERBOARD', 165, 81)

  // Rank — main number
  const rankStr = p.rank ? `#${p.rank.toLocaleString()}` : '—'
  ctx.fillStyle = '#000000'
  ctx.font = '600 180px ui-monospace, SF Mono, Menlo, monospace'
  ctx.textBaseline = 'top'
  ctx.fillText(rankStr, 64, 160)

  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.font = '500 16px Inter, system-ui, sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText('GLOBAL RANK', 64, 370)

  // Right column — points + tier
  const rightX = 720
  ctx.fillStyle = '#000000'
  ctx.font = '600 80px ui-monospace, SF Mono, Menlo, monospace'
  ctx.textBaseline = 'top'
  ctx.fillText(p.points.toLocaleString(), rightX, 180)

  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.font = '500 16px Inter, system-ui, sans-serif'
  ctx.fillText('POINTS', rightX, 280)

  // Tier pill
  const pillX = rightX
  const pillY = 320
  const pillH = 44
  const pillLabel = p.tierLabel
  ctx.font = '600 18px Inter, system-ui, sans-serif'
  const pillTextW = ctx.measureText(pillLabel).width
  const pillW = pillTextW + 36
  ctx.fillStyle = '#000000'
  roundedRect(ctx, pillX, pillY, pillW, pillH, pillH / 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.fillText(pillLabel, pillX + 18, pillY + pillH / 2 + 1)

  // Divider hairline
  ctx.strokeStyle = 'rgba(0,0,0,0.08)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(64, 500)
  ctx.lineTo(W - 64, 500)
  ctx.stroke()

  // Footer — wallet / username left, CTA right
  const footerY = 540
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.font = '500 14px Inter, system-ui, sans-serif'
  ctx.fillText('PLAYER', 64, footerY)
  ctx.fillStyle = '#000000'
  ctx.font = '500 22px ui-monospace, SF Mono, Menlo, monospace'
  const playerLine =
    p.username || (p.walletAddress ? shortAddress(p.walletAddress) : 'Anonymous')
  ctx.fillText(playerLine, 64, footerY + 22)

  // Right CTA
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.font = '500 14px Inter, system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('JOIN AT', W - 64, footerY)
  ctx.fillStyle = '#000000'
  ctx.font = '500 22px Inter, system-ui, sans-serif'
  ctx.fillText('peridot.finance/app', W - 64, footerY + 22)
  ctx.textAlign = 'left'
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function shortAddress(addr: string): string {
  if (!addr) return ''
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// ─── Season chip — live countdown ────────────────────────────────────────────

const SeasonChip = memo(function SeasonChip({
  name,
  endAt,
}: {
  name: string
  endAt: string
}) {
  const [text, setText] = useState(() => formatRemaining(endAt))
  useEffect(() => {
    const id = setInterval(() => setText(formatRemaining(endAt)), 1000)
    return () => clearInterval(id)
  }, [endAt])
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-foreground/[0.06] text-[11px] text-foreground/60 font-mono tabular-nums"
      title={`Season ${name} ends ${new Date(endAt).toLocaleString()}`}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-foreground" />
      {name} · {text}
    </span>
  )
})

function formatRemaining(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'ended'
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m left`
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} left`
}

// ─── Leaderboard list — shared row + header ─────────────────────────────────

function PeriodTabs({
  value,
  onChange,
  isPending = false,
}: {
  value: Period
  onChange: (v: Period) => void
  /** Subtle dim on the non-active pills while the deferred fetch is
   *  catching up — same Trade-Republic muted "we got it" pattern. */
  isPending?: boolean
}) {
  return (
    <div className="inline-flex border border-foreground/[0.06] rounded-full p-1 bg-background">
      {PERIODS.map((opt) => {
        const active = opt.id === value
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              'px-3 py-1 text-xs rounded-full transition-[color,background-color,opacity] duration-200',
              active ? 'bg-foreground text-background' : 'text-foreground/60 hover:text-foreground',
              !active && isPending && 'opacity-50',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function periodLabel(p: Period): string {
  switch (p) {
    case '1d':
      return 'last 24h'
    case '7d':
      return 'last 7 days'
    case '30d':
      return 'last 30 days'
    default:
      return 'all time'
  }
}

interface KpiCellProps {
  label: string
  value: string | null
  sub: string
  loading?: boolean
  /** Stagger index — drives `--entry-delay` for the mount-only fade-up. */
  index?: number
}

function KpiCell({ label, value, sub, loading, index = 0 }: KpiCellProps) {
  // Stagger schedule for KPI strips: 220ms head start (lands after the
  // hero + tab nav settle) + 70ms per cell. Caps at 4 cells in practice;
  // no need for a hard ceiling on `index`.
  const delay = `${220 + index * 70}ms`
  // Briefly pulses when the displayed value transitions to a new
  // non-null value (refresh, filter change, fresh tx verification).
  // First null → value transition is skipped so we don't collide with
  // the mount-time `entry-fade-up` cascade.
  const pulsing = usePulseOnChange(value)
  return (
    <div
      className={cn(
        'bg-background px-5 py-5 md:px-6 md:py-6 entry-fade-up',
        pulsing && 'kpi-pulse',
      )}
      style={{ '--entry-delay': delay } as React.CSSProperties}
    >
      <p className="text-[11px] uppercase tracking-widest text-foreground/40">{label}</p>
      <p className="mt-3 text-2xl md:text-[28px] font-semibold tracking-tight font-mono tabular-nums">
        {loading ? (
          <span className="text-foreground/30">— —</span>
        ) : (
          value ?? <span className="text-foreground/30">—</span>
        )}
      </p>
      <p className="mt-1 text-xs text-foreground/50">{sub}</p>
    </div>
  )
}

function TableHeader() {
  return (
    <div className="grid grid-cols-12 px-5 py-3 text-[11px] uppercase tracking-widest text-foreground/40 border-b border-foreground/[0.06] bg-foreground/[0.015] rounded-t-xl">
      <div className="col-span-1">
        <span className="sm:hidden">#</span>
        <span className="hidden sm:inline">Rank</span>
      </div>
      <div className="col-span-5">User</div>
      <div className="col-span-2">Tier</div>
      <div className="col-span-4 sm:col-span-2 text-right">Points</div>
      <div className="hidden sm:block sm:col-span-2 text-right">Activity</div>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="border-y border-foreground/[0.06] divide-y divide-foreground/[0.06]">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="grid grid-cols-12 px-5 py-4 items-center">
          <div className="col-span-1">
            <div className="skeleton-shimmer h-4 w-6 rounded" />
          </div>
          <div className="col-span-5">
            <div className="skeleton-shimmer h-4 w-32 rounded" />
          </div>
          <div className="col-span-2">
            <div className="skeleton-shimmer h-4 w-20 rounded" />
          </div>
          <div className="col-span-4 sm:col-span-2 flex justify-end">
            <div className="skeleton-shimmer h-4 w-16 rounded" />
          </div>
          <div className="hidden sm:flex sm:col-span-2 justify-end">
            <div className="skeleton-shimmer h-4 w-20 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

interface LeaderboardRowProps {
  entry: LeaderboardEntry
  period: Period
  self?: boolean
  /**
   * Optional row index in the rendered list. Drives the mount-only
   * stagger via `--entry-delay`. Pinned "Your standing" row leaves it
   * undefined → no stagger, just the section-level fade-up.
   */
  index?: number
}

// Cap the row stagger so a 50-row list still settles in well under
// a second. Past `STAGGER_CAP_ROWS` rows fall in together.
const STAGGER_CAP_ROWS = 24
const ROW_STAGGER_HEAD_MS = 480
const ROW_STAGGER_STEP_MS = 22

function LeaderboardRow({ entry, period, self, index }: LeaderboardRowProps) {
  const rank = entry.rank ?? entry.global_rank ?? null

  const displayPoints =
    period === 'all'
      ? entry.all_time_points ?? entry.total_points
      : entry.period_points ?? entry.total_points

  const allTimePoints = entry.all_time_points ?? entry.total_points
  const tier = tierFor(Number(allTimePoints || 0)).current

  const activityCount =
    (entry.supply_count || 0) +
    (entry.borrow_count || 0) +
    (entry.repay_count || 0) +
    (entry.redeem_count || 0)

  // Only apply the stagger when an index was provided. The pinned
  // "Your standing" row reuses the same component without an index,
  // so it inherits its section's single fade-up — no double animation.
  const staggered = typeof index === 'number'
  const delayMs = staggered
    ? ROW_STAGGER_HEAD_MS +
      Math.min(index, STAGGER_CAP_ROWS) * ROW_STAGGER_STEP_MS
    : 0

  // Unlocked profile border. Gradients are stored as a CSS `*-gradient(...)`
  // string and painted as a faint wash; solid colours render as an inset ring
  // so they frame the row without bleeding into neighbours.
  const borderColor = entry.borderColor || null
  const borderIsGradient =
    typeof borderColor === 'string' && borderColor.toLowerCase().includes('gradient')

  return (
    <div
      className={cn(
        'relative isolate grid grid-cols-12 px-5 py-4 items-center transition-colors',
        self
          ? 'bg-foreground/[0.025] border-l-2 border-l-black'
          : 'hover:bg-foreground/[0.015]',
        staggered && 'entry-fade-up',
      )}
      style={
        staggered
          ? ({ '--entry-delay': `${delayMs}ms` } as React.CSSProperties)
          : undefined
      }
    >
      {/* Unlocked border colour — sits behind the row content via -z-10. */}
      {borderColor && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={
            borderIsGradient
              ? { backgroundImage: borderColor, opacity: 0.18 }
              : { boxShadow: `inset 0 0 0 2px ${borderColor}` }
          }
        />
      )}

      {/* Rank */}
      <div className="col-span-1 flex items-center">
        <RankBadge rank={rank} />
      </div>

      {/* User */}
      <div className="col-span-5 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {entry.isPremium && (
            <span
              className="inline-flex items-center justify-center w-4 h-4 rounded-sm border border-foreground/20 text-[9px] font-semibold tracking-tight"
              title="Premium"
            >
              P
            </span>
          )}
          <span className="font-medium truncate">
            {entry.username || formatAddress(entry.wallet_address)}
          </span>
          {entry.nameEmoji && (
            <span className="text-sm" aria-hidden>
              {entry.nameEmoji}
            </span>
          )}
          {entry.displayBadge && (
            <span
              className="hidden md:inline-flex items-center gap-1 text-[11px] text-foreground/60 border border-foreground/[0.06] rounded-full px-1.5 py-0.5"
              title={entry.displayBadge.name}
            >
              <span aria-hidden>{entry.displayBadge.icon}</span>
            </span>
          )}
          {self && (
            <span className="text-[10px] uppercase tracking-widest text-foreground/40">
              You
            </span>
          )}
        </div>
        {entry.username && (
          <div className="text-[11px] text-foreground/40 font-mono mt-0.5 truncate">
            {formatAddress(entry.wallet_address)}
          </div>
        )}
      </div>

      {/* Tier */}
      <div className="col-span-2">
        <span className="inline-flex items-center gap-1 text-[11px] text-foreground/70">
          <span aria-hidden>{tier.emoji}</span>
          <span className="hidden md:inline">{tier.level}</span>
        </span>
      </div>

      {/* Points */}
      <div className="col-span-4 sm:col-span-2 text-right font-mono tabular-nums">
        <div className="text-sm font-semibold">
          {Number(displayPoints || 0).toLocaleString()}
        </div>
        {period !== 'all' && entry.all_time_points != null && (
          <div className="text-[11px] text-foreground/40">
            {entry.all_time_points.toLocaleString()} all time
          </div>
        )}
      </div>

      {/* Activity — hidden on mobile to avoid header overlap; Points cell
          expands to fill the freed columns so it stays edge-aligned. */}
      <div className="hidden sm:block sm:col-span-2 text-right">
        <span
          className="text-xs text-foreground/60 font-mono tabular-nums"
          title={`Supply ${entry.supply_count} · Borrow ${entry.borrow_count} · Repay ${entry.repay_count} · Withdraw ${entry.redeem_count}`}
        >
          {activityCount === 0 ? '0' : `${activityCount} txs`}
        </span>
      </div>
    </div>
  )
}

function RankBadge({ rank }: { rank: number | null }) {
  if (rank == null) {
    return <span className="font-mono tabular-nums text-sm text-foreground/40">—</span>
  }
  if (rank === 1) {
    return (
      <span className="inline-flex items-center gap-1 font-mono tabular-nums text-sm font-semibold">
        <Crown className="w-3.5 h-3.5" />
        {rank}
      </span>
    )
  }
  if (rank <= 3) {
    return (
      <span className="font-mono tabular-nums text-sm font-semibold">{rank}</span>
    )
  }
  return (
    <span className="font-mono tabular-nums text-sm text-foreground/60">{rank}</span>
  )
}

// ─── Guide tab ───────────────────────────────────────────────────────────────

function GuideTab({
  currentPoints,
  isConnected,
}: {
  currentPoints: number
  isConnected: boolean
}) {
  // Show tiers from highest to lowest so the user sees what they're aiming
  // for at the top. Mark the current tier with a left rail; mark unlocked
  // tiers with a check, locked ones with a soft "to go" hint.
  const { current: currentTier } = tierFor(currentPoints)

  const actions = [
    {
      label: 'Supply',
      desc: 'Earn points for every supply you make.',
    },
    {
      label: 'Borrow',
      desc: 'Borrowing earns points proportional to USD value.',
    },
    {
      label: 'Repay',
      desc: 'Repaying borrows builds your activity streak.',
    },
    {
      label: 'Withdraw',
      desc: 'Withdrawals (redeems) still count toward verified activity.',
    },
  ]

  return (
    <>
      {/* How points work */}
      <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-10 scroll-reveal-section">
        <h2 className="text-lg font-semibold tracking-tight">How points work</h2>
        <p className="text-xs text-foreground/50 mt-1 mb-6 max-w-2xl">
          Every verified on-chain action earns points. The exact amount depends
          on USD value, chain multipliers and your activity streak. Achievement
          unlocks give one-time bonus points on top.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-foreground/[0.06] rounded-xl overflow-hidden border border-foreground/[0.06]">
          {actions.map((a) => (
            <div key={a.label} className="bg-background px-5 py-5">
              <p className="text-[11px] uppercase tracking-widest text-foreground/40">
                {a.label}
              </p>
              <p className="mt-3 text-sm text-foreground/70 leading-relaxed">
                {a.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-6 border-t border-foreground/[0.06]" />

      {/* Tier ladder */}
      <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-10 scroll-reveal-section">
        <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Tier ladder</h2>
            <p className="text-xs text-foreground/50 mt-1">
              Ten tiers from Beginner to Peridot. Climb by earning points.
            </p>
          </div>
          {isConnected && (
            <span className="inline-flex items-center gap-1.5 text-xs text-foreground/60 border border-foreground/[0.06] rounded-full px-2.5 py-1">
              <span aria-hidden>{currentTier.emoji}</span>
              You're {currentTier.level}
            </span>
          )}
        </div>

        <div className="border border-foreground/[0.06] rounded-xl overflow-hidden">
          {TIERS.map((t, idx) => {
            const isCurrent = isConnected && t.level === currentTier.level
            const isUnlocked = currentPoints >= t.minPoints
            const nextThreshold =
              idx > 0 ? TIERS[idx - 1].minPoints : null
            return (
              <div
                key={t.level}
                className={cn(
                  'grid grid-cols-12 px-5 py-4 items-center border-b border-foreground/[0.06] last:border-b-0 transition-colors',
                  isCurrent
                    ? 'bg-foreground/[0.025] border-l-2 border-l-black'
                    : 'hover:bg-foreground/[0.015]',
                )}
              >
                <div className="col-span-1 text-2xl" aria-hidden>
                  {t.emoji}
                </div>
                <div className="col-span-4">
                  <p className="text-sm font-medium">{t.level}</p>
                  {isCurrent && (
                    <p className="text-[11px] text-foreground/50 mt-0.5">
                      Current tier
                    </p>
                  )}
                </div>
                <div className="col-span-4 text-right font-mono tabular-nums text-sm">
                  {t.minPoints === 0
                    ? <span className="text-foreground/40">Starting tier</span>
                    : `${t.minPoints.toLocaleString()} pts`}
                </div>
                <div className="col-span-3 text-right">
                  {isConnected ? (
                    isUnlocked ? (
                      <span className="text-[11px] uppercase tracking-widest text-foreground/40">
                        Unlocked
                      </span>
                    ) : nextThreshold && currentPoints < t.minPoints ? (
                      <span className="text-[11px] text-foreground/50 font-mono">
                        {(t.minPoints - currentPoints).toLocaleString()} to go
                      </span>
                    ) : null
                  ) : (
                    <span className="text-[11px] text-foreground/40">
                      —
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <div className="mx-6 border-t border-foreground/[0.06]" />

      {/* Badges + customisation pointer */}
      <section className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-10 scroll-reveal-section">
        <div className="rounded-2xl border border-foreground/[0.06] p-6 flex items-start gap-4">
          <Sparkles className="w-5 h-5 mt-0.5 text-foreground/60 flex-shrink-0" />
          <div>
            <h3 className="text-base font-semibold tracking-tight">
              Unlock badges, emojis, borders
            </h3>
            <p className="text-xs text-foreground/60 mt-1 max-w-xl leading-relaxed">
              Beyond tier progression, milestone badges unlock customisations:
              profile borders, name emojis, bonus points. See the{' '}
              <span className="font-medium">Badges</span> tab for the
              catalogue, and head to{' '}
              <a
                href="/app/easy/account/display"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Account → Display
              </a>{' '}
              to pick which ones show on your profile.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}

// ─── Number counter (rAF + ref-mutation, zero re-renders) ──────────────────
//
// Animates an integer value from 0 → target on mount (and from prev →
// target on subsequent updates). Critically, the textContent is mutated
// via `ref.current.textContent` so React isn't asked to re-render once
// per frame. The parent Hero re-renders exactly twice: once on mount,
// once when the underlying data lands.
//
// Easing: cubic-out via `1 - (1-t)^3` — same curve as our CSS
// `cubic-bezier(0.22, 1, 0.36, 1)` for the entry-fade-up classes, so
// the count-up "finishes" in lockstep with the hero card's settle.
//
// Reduced motion: snaps directly to target, no rAF loop.
// SSR: the initial render returns the final formatted text so search
// engines / first paint show the real value.
//
// Note: we don't use Web Animations API + `@property --count` here
// because we need locale-aware `toLocaleString()` formatting on the
// displayed text. `@property` can animate numeric values, but the
// rendered output (via CSS `counter()`) is plain digits without the
// thousands separators we want.

interface CountUpProps {
  value: number
  /** Total animation duration in ms. */
  duration?: number
  /** Custom formatter; defaults to `toLocaleString()` (en-US style). */
  format?: (v: number) => string
}

const CountUp = memo(function CountUp({
  value,
  duration = 800,
  format = defaultCountFormat,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  // Tracks the displayed value across renders so subsequent updates
  // animate from where we left off, not from zero again.
  const prevValueRef = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const from = prevValueRef.current
    const to = value

    if (reduced || from === to || !Number.isFinite(to)) {
      el.textContent = format(to)
      prevValueRef.current = to
      return
    }

    const startTime = performance.now()
    let rafId = 0

    const tick = (now: number) => {
      const elapsed = now - startTime
      const t = Math.min(elapsed / duration, 1)
      // Ease-out cubic, identical curve to our entry-fade-up CSS.
      const eased = 1 - Math.pow(1 - t, 3)
      const current = Math.round(from + (to - from) * eased)
      el.textContent = format(current)
      if (t < 1) {
        rafId = requestAnimationFrame(tick)
      } else {
        prevValueRef.current = to
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [value, duration, format])

  // Initial render returns the final value — both for SSR/first-paint
  // correctness and so the column width is already laid out for the
  // tabular-nums column when the animation starts.
  return <span ref={ref}>{format(value)}</span>
})

function defaultCountFormat(v: number): string {
  return v.toLocaleString()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAddress(addr: string): string {
  if (!addr) return ''
  if (addr.length <= 10) return addr
  // Preserve case for non-EVM (Stellar G…) — EVM 0x prefix is case-insensitive.
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function chainName(chainId: number): string {
  const config = getChainConfig(chainId)
  return (config as any)?.chainNameReadable || `Chain ${chainId}`
}

function explorerTxUrl(chainId: number, txHash: string): string | null {
  const cfg = getChainConfig(chainId) as any
  const base: string | undefined = cfg?.explorer
  if (!base) return null
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base
  return `${trimmed}/tx/${txHash}`
}
