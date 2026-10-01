'use client'

import { useEffect, useMemo, useRef, useState, memo, useTransition, MutableRefObject, startTransition, useReducer } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { motion, useReducedMotion } from 'framer-motion'
import styles from './leaderboard-animations.module.css'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tabs2, Tabs2Content, Tabs2List, Tabs2Trigger } from '@/components/ui/tabs2'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useLeaderboard, useLeaderboardBreakdown } from '@/hooks/use-leaderboard'
import { getActionDisplayName } from '@/hooks/use-stats-data'
import { Trophy, Star, User, Share2, Rocket, Sparkles, Crown, Copy, Download, Clock3, ExternalLink, Info } from 'lucide-react'
import dynamic from 'next/dynamic'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
const LazyBadgesAccordion = dynamic(() => import('@/components/leaderboard/BadgesAccordion'), { ssr: false })

function QuestGuideSkeleton() {
  return (
    <div className="relative">
      {/* Subtle ambient gradients according to theme */}
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="hidden md:block absolute -top-24 -left-24 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="hidden md:block absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-indigo-400/10 blur-3xl" />
      </div>
      <div className="relative space-y-4">
        <div className={cn(styles.skeletonText, "h-6 w-48")} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className={cn(styles.skeletonCard, "h-24 border border-white/20 dark:border-white/10")} />
          <div className={cn(styles.skeletonCard, "h-24 border border-white/20 dark:border-white/10")} />
          <div className={cn(styles.skeletonCard, "h-24 border border-white/20 dark:border-white/10")} />
          <div className={cn(styles.skeletonCard, "h-24 border border-white/20 dark:border-white/10")} />
        </div>
      </div>
    </div>
  )
}

const HowItWorksComic = dynamic(() => import('@/components/leaderboard/HowItWorksComic'), {
  ssr: false,
  loading: () => <QuestGuideSkeleton />,
})
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import Link from 'next/link'
import { getChainConfig } from '@/config/contracts'
import { toast } from '@/components/ui/use-toast'
import { getCurrentSeason, getAllBadges } from '@/lib/achievements'
import { useActiveWallet } from '@/hooks/use-active-wallet'

interface LeaderboardUser {
  wallet_address: string
  total_points: number
  supply_count: number
  borrow_count: number
  repay_count: number
  redeem_count: number
  rank?: number
  username?: string
  // New additive fields (server-provided)
  period_points?: number | null
  period_rank?: number | null
  all_time_points?: number | null
  global_rank?: number | null
  // Derived, optional fields from API
  displayBadge?: {
    id: string
    name: string
    icon: string
    tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
    borderColor: string | null
    emoji: string | null
  } | null
  borderColor?: string | null
  nameEmoji?: string | null
  borderStyle?: 'still' | 'pulse' | 'orbit' | 'shine'
  badgeStyle?: 'still' | 'glow' | 'float' | 'spin'
  isPremium?: boolean
  nextBadge?: {
    id: string
    name: string
    description: string
    icon: string
    unlockBorderColor?: string
    unlockEmoji?: string
    tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
    xpThreshold?: number
  } | null
  afterNextBadgeHint?: {
    id?: string
    name?: string
    tier?: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
    icon?: string
  } | null
}

interface VerifiedTransaction {
  tx_hash: string
  action_type: 'supply' | 'borrow' | 'repay' | 'redeem'
  token_symbol: string
  amount: string
  usd_value: number
  points_awarded: number
  verified_at: string
  chain_id: number
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

// Reducer state interface
interface LeaderboardState {
  leaderboard: LeaderboardUser[]
  stats: LeaderboardStats | null
  userStats: LeaderboardUser | null
  userTransactions: VerifiedTransaction[]
  earnedBadges: Array<{
    id: string
    name: string
    unlockEmoji: string | null
    unlockBorderColor: string | null
    tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
    allowLeaderboardDisplay?: boolean
  }>
  selectedBadgeId: string | null
  selectedBorderColor: string | null
  selectedNameEmoji: string | null
  loading: boolean
  userLoading: boolean
  displayLoading: boolean
}

// Reducer actions
type LeaderboardAction =
  | { type: 'SET_LOADING'; payload: { loading: boolean; userLoading?: boolean; displayLoading?: boolean } }
  | { type: 'SET_DATA'; payload: { leaderboard?: LeaderboardUser[]; stats?: LeaderboardStats | null } }
  | { type: 'SET_USER_DATA'; payload: { user?: LeaderboardUser | null; transactions?: VerifiedTransaction[] } }
  | { type: 'SET_PROFILE'; payload: { earnedBadges?: Array<{ id: string; name: string; unlockEmoji: string | null; unlockBorderColor: string | null; tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'; allowLeaderboardDisplay?: boolean }>; selections?: { badgeId?: string | null; borderColor?: string | null; nameEmoji?: string | null } } }
  | { type: 'RESET_LOADING' }
  | { type: 'SET_ALL'; payload: Partial<LeaderboardState> }

// Reducer function
const leaderboardReducer = (state: LeaderboardState, action: LeaderboardAction): LeaderboardState => {
  switch (action.type) {
    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload.loading,
        userLoading: action.payload.userLoading ?? state.userLoading,
        displayLoading: action.payload.displayLoading ?? state.displayLoading,
      }
    case 'SET_DATA':
      return {
        ...state,
        ...(action.payload.leaderboard !== undefined && { leaderboard: action.payload.leaderboard }),
        ...(action.payload.stats !== undefined && { stats: action.payload.stats }),
      }
    case 'SET_USER_DATA':
      return {
        ...state,
        ...(action.payload.user !== undefined && { userStats: action.payload.user }),
        ...(action.payload.transactions !== undefined && { userTransactions: action.payload.transactions }),
      }
    case 'SET_PROFILE':
      return {
        ...state,
        ...(action.payload.earnedBadges !== undefined && { earnedBadges: action.payload.earnedBadges }),
        ...(action.payload.selections?.badgeId !== undefined && { selectedBadgeId: action.payload.selections.badgeId }),
        ...(action.payload.selections?.borderColor !== undefined && { selectedBorderColor: action.payload.selections.borderColor }),
        ...(action.payload.selections?.nameEmoji !== undefined && { selectedNameEmoji: action.payload.selections.nameEmoji }),
      }
    case 'RESET_LOADING':
      return {
        ...state,
        loading: false,
        userLoading: false,
        displayLoading: false,
      }
    case 'SET_ALL':
      return {
        ...state,
        ...action.payload,
      }
    default:
      return state
  }
}

const card = 'bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-3xl shadow-xl'

const rankingTiers = [
  { level: 'Peridot', minPoints: 1000000, emoji: '🏆' },
  { level: 'Diamond', minPoints: 750000, emoji: '💎' },
  { level: 'Ruby', minPoints: 500000, emoji: '♦️' },
  { level: 'Emerald', minPoints: 300000, emoji: '🟢' },
  { level: 'Sapphire', minPoints: 150000, emoji: '🔷' },
  { level: 'Topaz', minPoints: 100000, emoji: '🌟' },
  { level: 'Amethyst', minPoints: 50000, emoji: '🔮' },
  { level: 'Jade', minPoints: 10000, emoji: '🐉' },
  { level: 'Quartz', minPoints: 1000, emoji: '🪨' },
  { level: 'Beginner', minPoints: 0, emoji: '⛏️' },
].sort((a, b) => b.minPoints - a.minPoints)

const getExplorerTxUrl = (chainId: number, txHash: string): string | null => {
  const cfg = getChainConfig(chainId) as any
  const base: string | undefined = cfg?.explorer
  if (!base) return null
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base
  return `${trimmed}/tx/${txHash}`
}

const getChainName = (chainId: number): string => {
  const config = getChainConfig(chainId)
  return config?.chainNameReadable || `Chain ${chainId}`
}

const handleCopy = (text: string) => {
  try {
    navigator.clipboard.writeText(text)
    toast({ title: 'Copied', description: 'Transaction hash copied to clipboard.' })
  } catch {
    toast({ title: 'Copy failed', description: 'Could not copy to clipboard.', variant: 'destructive' as any })
  }
}

interface TxDetailBodyProps {
  tx: VerifiedTransaction
  formatUSD: Intl.NumberFormat
}

const TxDetailBody = memo(function TxDetailBody({ tx, formatUSD }: TxDetailBodyProps) {
  const url = getExplorerTxUrl(tx.chain_id, tx.tx_hash)
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-emerald-600 mb-1">{tx.action_type}</div>
          <div className="text-sm font-semibold">{tx.token_symbol} · {formatUSD.format(Number(tx.usd_value || 0))}</div>
          <div className="text-[11px] text-slate-500">{new Date(tx.verified_at).toLocaleString()}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">{getChainName(tx.chain_id)}</div>
          <div className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate max-w-[18ch]">{tx.tx_hash}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full px-3 hover:bg-emerald-500/10"
          onClick={() => handleCopy(tx.tx_hash)}
          aria-label="Copy transaction hash"
        >
          <Copy className="mr-1 h-4 w-4" /> Copy
        </Button>
        {url ? (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="rounded-full px-3 hover:bg-indigo-500/10"
            aria-label="View on explorer"
          >
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 h-4 w-4" /> Explorer
            </a>
          </Button>
        ) : <div />}
      </div>
    </>
  )
})

interface PointsBreakdownProps {
  wallet: string
}

const PointsBreakdown = memo(function PointsBreakdown({ wallet }: PointsBreakdownProps) {
  const [open, setOpen] = useState(false)
  const { data, isLoading: loading } = useLeaderboardBreakdown(open ? wallet : undefined)

  const skeleton = (
    <div className="space-y-2">
      <div className={cn(styles.skeletonText, "h-3 w-28")} />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={cn(styles.skeletonText, "h-6")} />
        ))}
      </div>
    </div>
  )

  const content = (() => {
    if (loading || !data) return skeleton
    const b = data.breakdown || {}
    const ach = Number(b.achievements_xp || 0)
    const dl = Number(b.daily_login_points || 0)
    const tx = b.tx_points || { supply: 0, borrow: 0, repay: 0, redeem: 0 }
    const act = Number(b.activity_points || 0)
    const total = Number(b.all_time_points || 0)
    return (
      <div className="min-w-[220px] max-w-[300px]">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>All-time total</span>
          <span className="tabular-nums font-semibold text-slate-800 dark:text-slate-100">{total.toLocaleString()} pts</span>
        </div>
        <div className="mt-2 rounded-xl border border-white/20 bg-white/70 dark:bg-black/30 p-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="inline-flex items-center gap-1 text-indigo-600"><Sparkles className="h-3 w-3" /> Achievements</span>
            <span className="tabular-nums font-semibold">{ach.toLocaleString()} pts</span>
          </div>
        </div>
        <div className="mt-2 rounded-xl border border-white/20 bg-white/70 dark:bg-black/30 p-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="inline-flex items-center gap-1 text-emerald-600"><Trophy className="h-3 w-3" /> Activity</span>
            <span className="tabular-nums font-semibold">{act.toLocaleString()} pts</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <div className="flex items-center justify-between rounded-lg bg-white/60 dark:bg-white/10 border border-white/20 px-2 py-1">
              <span>Daily logins</span>
              <span className="tabular-nums">{dl.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/60 dark:bg-white/10 border border-white/20 px-2 py-1">
              <span>Supply</span>
              <span className="tabular-nums">{Number(tx.supply || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/60 dark:bg-white/10 border border-white/20 px-2 py-1">
              <span>Borrow</span>
              <span className="tabular-nums">{Number(tx.borrow || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/60 dark:bg-white/10 border border-white/20 px-2 py-1">
              <span>Repay</span>
              <span className="tabular-nums">{Number(tx.repay || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/60 dark:bg-white/10 border border-white/20 px-2 py-1">
              <span>Withdraw</span>
              <span className="tabular-nums">{Number(tx.redeem || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/60 dark:bg-white/10 border border-white/20 px-2 py-1">
              <span>Margin</span>
              <span className="tabular-nums">{Number(b.margin_points || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    )
  })()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="rounded-full px-2 h-6 ml-1">Details</Button>
      </PopoverTrigger>
      <PopoverContent className="rounded-2xl border-white/20 bg-white/80 dark:bg-black/30 backdrop-blur-xl shadow-lg">
        {content}
      </PopoverContent>
    </Popover>
  )
})

interface SharePreview2Props {
  userPoints: number
  rank: number | string
  tierLabel: string
  ensOrAddr: string
  medals: Array<{ emoji: string; name: string }>
  externalRef?: MutableRefObject<HTMLCanvasElement | null>
}

const SharePreview2 = memo(function SharePreview2({ userPoints, rank, tierLabel, ensOrAddr, medals, externalRef }: SharePreview2Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const lastReportedCanvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = 900
    const h = 470
    canvas.width = w
    canvas.height = h
    // Reset drawing state to avoid cumulative artifacts between renders
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.shadowBlur = 0
    ctx.shadowColor = 'rgba(0,0,0,0)'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.clearRect(0, 0, w, h)
    canvas.style.borderRadius = '22px'

    // Background gradient + grid
    const bg = ctx.createLinearGradient(0, 0, w, h)
    bg.addColorStop(0, '#0f172a')
    bg.addColorStop(1, '#111827')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    // Glow blobs
    ctx.fillStyle = 'rgba(16,185,129,0.25)'
    ctx.beginPath(); ctx.arc(w*0.18, h*0.3, 220, 0, Math.PI*2); ctx.fill()
    ctx.fillStyle = 'rgba(99,102,241,0.20)'
    ctx.beginPath(); ctx.arc(w*0.86, h*0.75, 240, 0, Math.PI*2); ctx.fill()

    // Glass card
    const cardX = 24, cardY = 24, cardW = w - 48, cardH = h - 48
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 2
    ctx.roundRect(cardX, cardY, cardW, cardH, 22 as any)
    ctx.fill(); ctx.stroke()

    // Inner inset shadow to make the card feel embedded
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(cardX, cardY, cardW, cardH, 22 as any)
    ctx.clip()
    // Top inner shadow
    let g = ctx.createLinearGradient(0, cardY, 0, cardY + 18)
    g.addColorStop(0, 'rgba(0,0,0,0.35)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(cardX + 2, cardY + 2, cardW - 4, 18)
    // Bottom inner shadow
    g = ctx.createLinearGradient(0, cardY + cardH, 0, cardY + cardH - 22)
    g.addColorStop(0, 'rgba(0,0,0,0.42)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(cardX + 2, cardY + cardH - 24, cardW - 4, 24)
    // Left inner shadow
    g = ctx.createLinearGradient(cardX, 0, cardX + 18, 0)
    g.addColorStop(0, 'rgba(0,0,0,0.28)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(cardX + 2, cardY + 2, 18, cardH - 4)
    // Right inner shadow
    g = ctx.createLinearGradient(cardX + cardW, 0, cardX + cardW - 18, 0)
    g.addColorStop(0, 'rgba(0,0,0,0.28)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(cardX + cardW - 20, cardY + 2, 20, cardH - 4)
    // Subtle inner highlights for depth
    g = ctx.createLinearGradient(0, cardY + 24, 0, cardY + 36)
    g.addColorStop(0, 'rgba(255,255,255,0.14)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(cardX + 10, cardY + 24, cardW - 20, 12)
    g = ctx.createLinearGradient(cardX + 24, 0, cardX + 38, 0)
    g.addColorStop(0, 'rgba(255,255,255,0.08)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(cardX + 24, cardY + 24, 14, cardH - 48)
    ctx.restore()

    // Title
    ctx.fillStyle = '#e2e8f0'
    ctx.font = '700 40px Inter, system-ui, -apple-system, Segoe UI, Roboto'
    ctx.fillText('Peridot Leaderboard', cardX + 28, cardY + 64)

    // Rank badge
    ctx.shadowBlur = 0
    ctx.shadowColor = 'rgba(0,0,0,0)'
    ctx.fillStyle = 'rgba(16,185,129,0.9)'
    ctx.beginPath(); ctx.roundRect(cardX + 28, cardY + 92, 150, 40, 999 as any); ctx.fill()
    ctx.fillStyle = '#0b1220'
    ctx.font = '800 22px Inter, system-ui, -apple-system, Segoe UI, Roboto'
    ctx.fillText(`#${rank}`, cardX + 44, cardY + 120)

    // ENS/Address
    ctx.fillStyle = '#94a3b8'
    ctx.font = '500 18px Inter, system-ui, -apple-system, Segoe UI, Roboto'
    ctx.fillText(ensOrAddr, cardX + 210, cardY + 118)

    // Points
    ctx.textAlign = 'right'
    ctx.fillStyle = '#93c5fd'
    ctx.font = '600 20px Inter, system-ui, -apple-system, Segoe UI, Roboto'
    ctx.fillText('Total Points', cardX + cardW - 28, cardY + 88)
    ctx.fillStyle = '#e2e8f0'
    ctx.font = '900 72px Inter, system-ui, -apple-system, Segoe UI, Roboto'
    ctx.fillText(userPoints.toLocaleString(), cardX + cardW - 28, cardY + 155)

    // Tier label
    ctx.textAlign = 'left'
    ctx.fillStyle = '#a7f3d0'
    ctx.font = '700 22px Inter, system-ui, -apple-system, Segoe UI, Roboto'
    ctx.fillText(`Tier: ${tierLabel}`, cardX + 28, cardY + 180)

    // Medals stack (prominent with labels)
    const medalsToDraw = Array.isArray(medals) ? medals.slice(0, 24) : []
    if (medalsToDraw.length > 0) {
      const startX = cardX + 28
      const startY = cardY + 212
      const badgeSize = 66
      const gap = 12
      const perRow = 8
      for (let i = 0; i < medalsToDraw.length; i++) {
        const col = i % perRow
        const row = Math.floor(i / perRow)
        const x = startX + col * (badgeSize + gap)
        const y = startY + row * (badgeSize + gap)
        // back plate
        ctx.fillStyle = 'rgba(255,255,255,0.24)'
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = 1.5
        ;(ctx as any).roundRect(x, y, badgeSize, badgeSize, 10)
        ctx.fill(); ctx.stroke()
        // emoji centered
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = '400 30px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji'
        ctx.fillText(medalsToDraw[i].emoji, x + badgeSize / 2, y + badgeSize / 2 - 6)
        // label
        const label = medalsToDraw[i].name.length > 14 ? medalsToDraw[i].name.slice(0, 14) + '…' : medalsToDraw[i].name
        ctx.font = '600 12px Inter, system-ui, -apple-system, Segoe UI, Roboto'
        ctx.fillStyle = '#e5e7eb'
        ctx.shadowColor = 'rgba(0,0,0,0.35)'
        ctx.shadowBlur = 2
        ctx.fillText(label, x + badgeSize / 2, y + badgeSize - 10)
        ctx.shadowBlur = 0
      }
      // Reset alignment so footer text stays anchored
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }

    // Footer hint
    ctx.fillStyle = '#64748b'
    ctx.font = '500 16px Inter, system-ui, -apple-system, Segoe UI, Roboto'
    ctx.fillText('peridot.finance DeFi that just feels natural', cardX + 28, cardY + cardH - 24)
    ctx.restore()
  }, [userPoints, rank, tierLabel, ensOrAddr, medals])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (lastReportedCanvasRef.current === canvas) return
    lastReportedCanvasRef.current = canvas
    if (externalRef) externalRef.current = canvas
  }, [externalRef])

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 dark:bg-black/20 p-3">
      <canvas ref={canvasRef as any} className="w-full h-auto" />
    </div>
  )
})

const SeasonCountdown = memo(function SeasonCountdown() {
  const [text, setText] = useState<string>('')
  const [label, setLabel] = useState<string>('')

  useEffect(() => {
    const season = getCurrentSeason()
    if (!season) {
      setText('')
      setLabel('No active season')
      return
    }
    const endMs = new Date(season.endAt).getTime()
    setLabel(`${season.name} ends in`)

    const update = () => {
      const now = Date.now()
      const diff = Math.max(0, endMs - now)
      if (diff <= 0) {
        setText('')
        setLabel(`${season.name} has ended`)
        return
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      const hh = String(hours).padStart(2, '0')
      const mm = String(minutes).padStart(2, '0')
      const ss = String(seconds).padStart(2, '0')
      setText(`${days}d ${hh}h ${mm}m ${ss}s`)
    }

    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  return <>{label}{text ? ` ${text}` : ''}</>
})

export default function WalletIntegratedLeaderboard2() {
  const { chainId } = useAccount()
  const { address, isConnected } = useActiveWallet()
  const { status } = useAccount() as any
  const { signMessageAsync } = useSignMessage()
  const prefersReducedMotion = useReducedMotion()
  // Tabs control so we can programmatically open Quest Guide
  const [tabsValue, setTabsValue] = useState<'leaderboard' | 'how-it-works' | 'guide' | 'badges' | 'profile'>('leaderboard')
  const [shouldShowGuideBadges, setShouldShowGuideBadges] = useState(false)
  const disableDecorFx = prefersReducedMotion || tabsValue === 'profile'

  // First-time / disconnected welcome dialog
  const [showGuideIntro, setShowGuideIntro] = useState(false)
  const INTRO_SEEN_KEY = 'peridot_lb_seen_intro_v1'
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hasSeen = window.localStorage.getItem(INTRO_SEEN_KEY) === '1'
    // Show only once per browser (regardless of connection state)
    if (!hasSeen) setShowGuideIntro(true)
  }, [])

  function handleOpenQuestGuide() {
    try { window.localStorage.setItem(INTRO_SEEN_KEY, '1') } catch {}
    setTabsValue('guide')
    setShowGuideIntro(false)
  }
  useEffect(() => {
    if (tabsValue !== 'guide' || shouldShowGuideBadges) return
    // Remove artificial delays - load badges immediately
    setShouldShowGuideBadges(true)
  }, [tabsValue, shouldShowGuideBadges])

  // Main leaderboard state using reducer for atomic updates
  const [state, dispatch] = useReducer(leaderboardReducer, {
    leaderboard: [],
    stats: null,
    userStats: null,
    userTransactions: [],
    earnedBadges: [],
    selectedBadgeId: null,
    selectedBorderColor: null,
    selectedNameEmoji: null,
    loading: false,
    userLoading: false,
    displayLoading: false,
  })

  // Destructure state for easier access (keeps existing code mostly unchanged)
  const { leaderboard, userStats, stats, loading, userLoading, displayLoading, userTransactions, earnedBadges, selectedBadgeId, selectedBorderColor, selectedNameEmoji } = state

  // UI-only state (not part of data loading, keep as useState)
  const [usernameInput, setUsernameInput] = useState('')
  const [isSavingUsername, setIsSavingUsername] = useState(false)
  const [isUsernameDialogOpen, setIsUsernameDialogOpen] = useState(false)
  const [period, setPeriod] = useState<'1d' | '7d' | '30d' | 'all'>('all')
  // Recent transactions visible window (expandable)
  const BASE_VISIBLE_TX = 8
  const [visibleTransactions, setVisibleTransactions] = useState<number>(BASE_VISIBLE_TX)
  const [isSwitchingPeriod, startPeriodTransition] = useTransition()

  // Customize display state (UI-only)
  const [isSavingDisplay, setIsSavingDisplay] = useState(false)
  // Pagination for large unlocked sets
  const [visibleBadgeCount, setVisibleBadgeCount] = useState(9)

  // Season countdown moved to SeasonCountdown child to avoid full tree re-renders
  const [visibleEmojiCount, setVisibleEmojiCount] = useState(12)
  const [visibleColorCount, setVisibleColorCount] = useState(10)

  // Season history: wallet_address (lowercase) → array of past season snapshots (camelCase from API)
  const [seasonHistoryMap, setSeasonHistoryMap] = useState<Record<string, Array<{
    seasonId: string
    seasonName: string
    finalPoints: number
    finalRank: number | null
    supplyCount: number
    borrowCount: number
    repayCount: number
    redeemCount: number
    totalLoginDays: number
  }>>>({})

  // Batch-fetch season history for visible leaderboard users (background, after list loads)
  useEffect(() => {
    if (state.leaderboard.length === 0) return
    const wallets = state.leaderboard.slice(0, 50).map(u => u.wallet_address).join(',')
    fetch(`/api/leaderboard/season-history?wallets=${encodeURIComponent(wallets)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.history) setSeasonHistoryMap(data.history) })
      .catch(() => {})
  }, [state.leaderboard])

  // Own season history for the connected user (profile tab)
  const [ownSeasonHistory, setOwnSeasonHistory] = useState<Array<{
    seasonId: string
    seasonName: string
    finalPoints: number
    finalRank: number | null
    supplyCount: number
    borrowCount: number
    repayCount: number
    redeemCount: number
    totalLoginDays: number
  }>>([])
  const [ownSeasonHistoryLoading, setOwnSeasonHistoryLoading] = useState(false)

  useEffect(() => {
    if (!address) { setOwnSeasonHistory([]); return }
    setOwnSeasonHistoryLoading(true)
    fetch(`/api/leaderboard/season-history?wallet=${address}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (Array.isArray(data?.history)) setOwnSeasonHistory(data.history) })
      .catch(() => {})
      .finally(() => setOwnSeasonHistoryLoading(false))
  }, [address])
  const earnedBadgeIdsSet = useMemo(() => new Set(earnedBadges.map(b => b.id)), [earnedBadges])
  const unlockedColors = useMemo(() => Array.from(new Set(earnedBadges.map(b => b.unlockBorderColor).filter(Boolean) as string[])), [earnedBadges])
  const unlockedEmojis = useMemo(() => Array.from(new Set(earnedBadges.map(b => b.unlockEmoji).filter(Boolean) as string[])), [earnedBadges])
  const lastEarnedBadge = useMemo(() => {
    return earnedBadges && earnedBadges.length > 0 ? earnedBadges[earnedBadges.length - 1] : null
  }, [earnedBadges])
  const lastEarnedBadgeMeta = useMemo(() => {
    if (!lastEarnedBadge) return null
    try {
      const all = getAllBadges()
      return all.find((b: any) => b.id === lastEarnedBadge.id) || null
    } catch {
      return null
    }
  }, [lastEarnedBadge])

  // Share dialog state
  const [shareSelectedBadgeIds, setShareSelectedBadgeIds] = useState<string[]>([])
  const shareCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isPostingX, setIsPostingX] = useState(false)

  // Replace manual fetch logic with useLeaderboard hook
  const { data: leaderboardData, isLoading: leaderboardLoading, refetch: refetchLeaderboard } = useLeaderboard({ 
    wallet: address || undefined, 
    period 
  })

  // Sync React Query data to local reducer state for backward compatibility with existing UI
  useEffect(() => {
    if (leaderboardData) {
      startTransition(() => {
        // Update leaderboard and stats
        dispatch({
          type: 'SET_DATA',
          payload: {
            leaderboard: leaderboardData.leaderboard || [],
            stats: leaderboardData.stats || null,
          },
        })
        
        // Update user data if wallet provided
        if (address && leaderboardData.user) {
          const mergedUser: any = {
            ...leaderboardData.user,
            ...(leaderboardData.profile?.display && {
              displayBadge: leaderboardData.profile.display.displayBadge,
              borderColor: leaderboardData.profile.display.borderColor,
              nameEmoji: leaderboardData.profile.display.nameEmoji,
            }),
            ...(leaderboardData.profile?.nextBadge && { nextBadge: leaderboardData.profile.nextBadge }),
            ...(leaderboardData.profile?.afterNextBadgeHint && { afterNextBadgeHint: leaderboardData.profile.afterNextBadgeHint }),
          }
          
          dispatch({
            type: 'SET_USER_DATA',
            payload: {
              user: mergedUser,
              transactions: leaderboardData.transactions || [],
            },
          })
          
          if (leaderboardData.profile) {
            dispatch({
              type: 'SET_PROFILE',
              payload: {
                earnedBadges: leaderboardData.profile.earnedBadges || [],
                selections: {
                  badgeId: leaderboardData.profile.selections?.badgeId || null,
                  borderColor: leaderboardData.profile.selections?.borderColor || null,
                  nameEmoji: leaderboardData.profile.selections?.nameEmoji || null,
                },
              },
            })
          }
        }
      })
    }
  }, [leaderboardData, address])

  // Sync loading states
  useEffect(() => {
    if (leaderboardLoading) {
      dispatch({
        type: 'SET_LOADING',
        payload: {
          loading: true,
          userLoading: !!(address && address.match(/^0x[a-fA-F0-9]{40}$/)),
          displayLoading: !!(address && address.match(/^0x[a-fA-F0-9]{40}$/)),
        },
      })
    } else {
      dispatch({ type: 'RESET_LOADING' })
    }
  }, [leaderboardLoading, address])

  // Global listener to refresh after rewards/verification/daily-login events
  useEffect(() => {
    function onRewardsUpdated() {
      refetchLeaderboard()
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('peridot:rewards-updated', onRewardsUpdated as any)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('peridot:rewards-updated', onRewardsUpdated as any)
      }
    }
  }, [refetchLeaderboard])

  // Smooth period switching
  const handlePeriodChange = (p: '1d' | '7d' | '30d' | 'all') => {
    if (p === period) return
    startPeriodTransition(() => {
      setPeriod(p)
    })
  }

  const top20 = useMemo(() => leaderboard.slice(0, 20), [leaderboard])
  const userInTop = useMemo(() => {
    if (!address) return false
    return top20.some(u => u.wallet_address?.toLowerCase() === address.toLowerCase())
  }, [address, top20])
  const displayedList = useMemo(() => {
    return top20
  }, [top20])

  const tierInfo = useMemo(() => {
    const points = (userStats && typeof (userStats as any).all_time_points === 'number')
      ? (userStats as any).all_time_points
      : (userStats?.total_points || 0)
    const idx = rankingTiers.findIndex(t => points >= t.minPoints)
    const currentTier = idx >= 0 ? rankingTiers[idx] : rankingTiers[rankingTiers.length - 1]
    const nextTier = idx > 0 ? rankingTiers[idx - 1] : null
    const range = nextTier ? (nextTier.minPoints - currentTier.minPoints) : 0
    const progressRaw = nextTier ? (points - currentTier.minPoints) / (range || 1) : 1
    const progressPercent = Math.max(0, Math.min(100, Math.round(progressRaw * 100)))
    const pointsToNext = nextTier ? Math.max(nextTier.minPoints - points, 0) : 0
    return { points, currentTier, nextTier, progressPercent, pointsToNext }
  }, [userStats])

  const formatUSD = useMemo(() => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }), [])

  const profileAgg = useMemo(() => {
    const byType: Record<string, { usd: number; count: number }> = { supply: { usd: 0, count: 0 }, borrow: { usd: 0, count: 0 }, repay: { usd: 0, count: 0 }, redeem: { usd: 0, count: 0 } }
    const byToken: Record<string, { usd: number; count: number }> = {}
    const byChain: Record<number, { usd: number; count: number }> = {}
    for (const tx of userTransactions) {
      const t = tx.action_type
      const usd = Number(tx.usd_value || 0)
      if (byType[t]) { byType[t].usd += usd; byType[t].count += 1 }
      if (!byToken[tx.token_symbol]) byToken[tx.token_symbol] = { usd: 0, count: 0 }
      byToken[tx.token_symbol].usd += usd; byToken[tx.token_symbol].count += 1
      if (!byChain[tx.chain_id]) byChain[tx.chain_id] = { usd: 0, count: 0 }
      byChain[tx.chain_id].usd += usd; byChain[tx.chain_id].count += 1
    }
    const topTokens = Object.entries(byToken).sort((a, b) => b[1].usd - a[1].usd).slice(0, 5)
    const chains = Object.entries(byChain).map(([id, v]) => ({ id: Number(id), ...v })).sort((a, b) => b.usd - a.usd)
    return { byType, topTokens, chains }
  }, [userTransactions])

  const displayedTransactions = useMemo(() => {
    // Keep rendering cheap by slicing at the source
    return userTransactions.slice(0, visibleTransactions)
  }, [userTransactions, visibleTransactions])

  const txRowMotion = useMemo(() => {
    return prefersReducedMotion
      ? {
          initial: { opacity: 1, y: 0 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0 }
        }
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.16 }
        }
  }, [prefersReducedMotion])

  function colorLabel(c: string): string {
    const lower = (c || '').toLowerCase()
    if (lower.includes('gradient')) return 'Gradient green/light-green'
    switch (lower) {
      case '#f472b6': return 'Pink'
      case '#60a5fa': return 'Blue'
      case '#10b981': return 'Emerald'
      case '#f59e0b': return 'Amber'
      case '#a78bfa': return 'Violet'
      case '#9ca3af': return 'Gray'
      case '#5e7945': return 'Season Green'
      case '#8ba376': return 'Sage Green'
      case '#b3c2a6': return 'Celadon Green'
      case '#797d62': return 'Olive Drab'
      case '#ced6c7': return 'Geyser'
      default: return c
    }
  }

  const validateUsername = (name: string) => /^[a-zA-Z0-9_-]{3,32}$/.test(name)

  const handleUsernameDialogChange = (open: boolean) => {
    setIsUsernameDialogOpen(open)
    if (open) {
      setUsernameInput(userStats?.username || '')
    } else {
      setUsernameInput('')
    }
  }

  const setUsername = async () => {
    if (!address) return
    const desired = usernameInput.trim()
    if (!validateUsername(desired)) {
      toast({ title: 'Invalid username', description: 'Use 3-32 chars: letters, numbers, _ or -' })
      return
    }
    if ((userStats?.username || '').toLowerCase() === desired.toLowerCase()) {
      toast({ title: 'No changes needed', description: 'This is already your current name.' })
      return
    }
    
    // Debug logging
    console.log('Setting username:', {
      current: userStats?.username,
      desired: desired,
      currentLower: (userStats?.username || '').toLowerCase(),
      desiredLower: desired.toLowerCase(),
      areEqual: (userStats?.username || '').toLowerCase() === desired.toLowerCase()
    })
    setIsSavingUsername(true)
    try {
      const timestamp = Date.now()
      const wallet = address.toLowerCase()
      const message = `Peridot: set username ${desired} for ${wallet} at ${timestamp}`
      const signature = await signMessageAsync({ account: address as `0x${string}`, message })
      const res = await fetch('/api/user/profile/set-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, username: desired, signature, timestamp })
      })
      const data = await res.json()
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to set username')
      }
      // Optimistically update username for immediate feedback
      dispatch({
        type: 'SET_USER_DATA',
        payload: {
          user: state.userStats ? { ...state.userStats, username: desired } : null,
        },
      })
      handleUsernameDialogChange(false)
      // Refresh aggregate so Top Players reflects the new name
      await refetchLeaderboard()
      toast({ title: 'Username updated', description: `Welcome, ${desired}!` })
    } catch (e: any) {
      toast({ title: 'Could not set name', description: e?.message || 'Please try again.' })
    } finally {
      setIsSavingUsername(false)
    }
  }

  const saveProfileDisplay = async () => {
    if (!address) return
    setIsSavingDisplay(true)
    try {
      const timestamp = Date.now()
      const wallet = address.toLowerCase()
      const payload = `${selectedBadgeId || ''}|${selectedBorderColor || ''}|${selectedNameEmoji || ''}`
      const message = `Peridot: set profile display ${payload} for ${wallet} at ${timestamp}`
      const signature = await signMessageAsync({ account: address as `0x${string}`, message })
      const res = await fetch('/api/user/profile/display', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, signature, timestamp, selected_badge_id: selectedBadgeId, selected_border_color: selectedBorderColor, selected_name_emoji: selectedNameEmoji })
      })
      const data = await res.json()
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to save')
      await refetchLeaderboard()
      toast({ title: 'Profile updated', description: 'Your display has been saved.' })
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message || 'Please try again.' })
    } finally {
      setIsSavingDisplay(false)
    }
  }

  const buildReferralUrl = async (): Promise<string> => {
    const origin = (typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://live.peridot.finance'))
    if (userStats?.username) {
      return `${origin}/app?ref=${userStats.username}`
    }
    try {
      if (!address) return `${origin}/app`
      const res = await fetch('/api/referral/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address })
      })
      const data = await res.json()
      if (res.ok && data?.success && data?.referralCode) {
        return `${origin}/app?ref=${data.referralCode}`
      }
    } catch (_) {}
    return `${origin}/app`
  }

  const postOnXWithImage = async () => {
    try {
      setIsPostingX(true)
      const points = userStats?.total_points || 0
      const idx = rankingTiers.findIndex(t => points >= t.minPoints)
      const currentTier = idx >= 0 ? rankingTiers[idx] : rankingTiers[rankingTiers.length - 1]
      const ensOrAddr = userStats?.username || `${address?.slice(0,6)}...${address?.slice(-4)}`
      const referralUrl = await buildReferralUrl()
      const medals = earnedBadges
        .filter(b => shareSelectedBadgeIds.includes(b.id))
        .map(b => ({ emoji: b.unlockEmoji || '🎖️', name: b.name }))

      const res = await fetch('/api/share/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          usernameOrAddr: ensOrAddr,
          points,
          rank: userStats?.rank ?? '?',
          tierLabel: currentTier.level,
          medals,
          referralUrl,
        })
      })
      const data = await res.json()
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to create share link')
      const shareUrl: string = data.referralShareUrl || data.shareUrl
      const origin2 = (typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://peridot.finance'))
      const ogImageUrl = `${origin2}/app/share/${data.token}/opengraph-image`
      try { await fetch(shareUrl, { cache: 'no-store' }) } catch {}
      try { await fetch(ogImageUrl, { cache: 'no-store' }) } catch {}
      await new Promise(r => setTimeout(r, 1200))
      const baseText = `I'm #${userStats?.rank ?? '?'} on Peridot with ${points.toLocaleString()} pts (${currentTier.level})!`
      const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(baseText)}&url=${encodeURIComponent(shareUrl)}`
      const opened = window.open(tweetUrl, '_blank')
      if (!opened) {
        toast({ title: 'Pop-up blocked', description: 'Please allow pop-ups or tap the button again.' })
      }
    } catch (e: any) {
      toast({ title: 'Share failed', description: e?.message || 'Please try again.' })
    } finally { setIsPostingX(false) }
  }

  const shareRank = async () => {
    const score = userStats?.total_points ?? 0
    const rank = userStats?.rank ?? '?'
    const msg = `I'm #${rank} on Peridot with ${score.toLocaleString()} pts!`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Peridot Leaderboard', text: msg, url: typeof window !== 'undefined' ? window.location.href : '' })
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${msg} ${typeof window !== 'undefined' ? window.location.href : ''}`)
        toast({ title: 'Copied', description: 'Share text copied to clipboard.' })
      }
    } catch (_) {}
  }

  return (<>
    <TooltipProvider delayDuration={300}>
      <div className="relative space-y-6 p-0 sm:p-6 text-slate-900 dark:text-slate-100">
        {/* Playful header card */
        }
        <motion.div
          initial={prefersReducedMotion ? undefined : { opacity: 0 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1 }}
        >
          <div className={cn(card, 'overflow-hidden p-6 md:p-8 relative')}
            style={{
              backgroundImage:
                'radial-gradient(60rem 40rem at 10% 10%, rgba(94,121,69,0.14), transparent),\nradial-gradient(50rem 40rem at 90% 100%, rgba(99,102,241,0.10), transparent)'
            }}
          >
            {/* Season countdown chip - upper-left */}
            <div className="absolute top-3 left-3 md:top-4 md:left-4 z-20">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 dark:border-white/10 bg-white/60 dark:bg-black/40 backdrop-blur-md px-3 py-1 text-[11px] text-slate-700 dark:text-slate-200 shadow-sm">
                <Clock3 className="h-3 w-3 text-[#5e7945]" />
                <span className="tabular-nums inline-block text-center whitespace-nowrap min-w-[14rem]"><SeasonCountdown /></span>
              </span>
            </div>
            {/* Floating accents */}
            {!prefersReducedMotion && (
              <>
                <div aria-hidden className={cn(styles.floatingBlob, styles.floatingBlobIndigo)} />
                <div aria-hidden className={cn(styles.floatingBlob, styles.floatingBlobPink)} />
              </>
            )}

            <div className="relative z-10 flex flex-col md:flex-row items-center md:items-end justify-between gap-6 pt-8">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="h-20 w-20 rounded-full bg-gradient-to-br from-white to-slate-100 dark:from-slate-900 dark:to-black flex items-center justify-center shadow-inner">
                    <div className="h-16 w-16 rounded-full bg-white/80 dark:bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/30 dark:border-white/10">
                      <Trophy className="h-7 w-7 text-emerald-600" />
                    </div>
                  </div>
                  {!prefersReducedMotion && (
                    <motion.div aria-hidden className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-emerald-400/40 blur-md" />
                  )}
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Peridot Leaderboard</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Play, earn points, and climb the ranks.</p>
                </div>
              </div>

              <div className="flex flex-col items-center md:items-end">
                  <div className="text-3xl md:text-4xl font-black tracking-tight tabular-nums font-mono">
                  {(userLoading || status === 'connecting' || status === 'reconnecting') ? <span className="animate-pulse">...</span> : ((
                    (() => {
                      const at = (userStats as any)?.all_time_points
                      if (typeof at === 'number' && !Number.isNaN(at)) return at
                      return userStats?.total_points || 0
                    })()
                  ).toLocaleString())}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">Your Points</div>
                {isConnected && (
                  <div className="mt-1">
                    <Dialog open={isUsernameDialogOpen} onOpenChange={handleUsernameDialogChange}>
                      <DialogTrigger asChild>
                        {userStats?.username ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 hover:opacity-90 transition"
                            aria-label="Edit display name"
                            title="Edit display name"
                          >
                            {(() => {
                              const emoji = (userStats as any).nameEmoji || null
                              return (
                                <Badge variant="outline" className="text-xs border-white/20 bg-white/40 dark:bg-white/10 inline-flex items-center gap-1">
                                  {emoji ? <span>{emoji}</span> : null}
                                  <span>{userStats.username}</span>
                                </Badge>
                              )
                            })()}
                          </button>
                        ) : (
                          <Button variant="outline" size="sm" className="h-7 px-3">Set your name</Button>
                        )}
                      </DialogTrigger>
                      <DialogContent className="max-w-md bg-white/80 dark:bg-black/40 backdrop-blur-xl border-white/10">
                        <DialogHeader>
                          <DialogTitle className="text-slate-900 dark:text-white">
                            {userStats?.username ? 'Update your display name' : 'Choose your display name'}
                          </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs mb-1 text-slate-600 dark:text-slate-400">Username</label>
                            <Input value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="cool_kid_123" className="bg-white/60 dark:bg-black/30 border-white/20" />
                            <p className="mt-1 text-[11px] text-slate-500">3–32 chars; letters, numbers, _ or -</p>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              onClick={setUsername}
                              disabled={(() => {
                                const isSaving = isSavingUsername
                                const isValid = validateUsername(usernameInput)
                                const isSame = ((userStats?.username || '').toLowerCase() === usernameInput.trim().toLowerCase())
                                const disabled = isSaving || !isValid || isSame
                                
                                return disabled
                              })()}
                              className="bg-emerald-500 hover:bg-emerald-500/90 text-white"
                            >
                              {isSavingUsername ? 'Saving…' : userStats?.username ? 'Save changes' : 'Save'}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
                {isConnected && (
                  <div className="mt-2 inline-flex items-center gap-2">
                    <Badge className="bg-emerald-500/90 text-white border-emerald-400/40">#{(userStats as any)?.global_rank ?? userStats?.rank ?? '—'}</Badge>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" className="bg-indigo-500 hover:bg-indigo-500/90 text-white">
                          <Share2 className="mr-2 h-4 w-4" /> Share
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl bg-white/80 dark:bg-black/40 backdrop-blur-xl border-white/10">
                        <DialogHeader>
                          <DialogTitle className="text-slate-900 dark:text-white">Share your leaderboard status</DialogTitle>
                        </DialogHeader>
                        {(() => {
                          const points = userStats?.total_points || 0
                          const idx = rankingTiers.findIndex(t => points >= t.minPoints)
                          const currentTier = idx >= 0 ? rankingTiers[idx] : rankingTiers[rankingTiers.length - 1]
                          const ensOrAddr = userStats?.username || `${address?.slice(0,6)}...${address?.slice(-4)}`
                          return (
                            <div className="space-y-4">
                              <div className="rounded-lg p-4 border border-white/10 bg-gradient-to-br from-slate-50/40 to-slate-200/20 dark:from-slate-900/40 dark:to-slate-800/20">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm text-slate-600 dark:text-slate-400">Rank</p>
                                    <p className="text-2xl font-bold text-slate-900 dark:text-white">#{userStats?.rank ?? '?'}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm text-slate-600 dark:text-slate-400">Total Points</p>
                                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{points.toLocaleString()}</p>
                                  </div>
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-600">
                                    <span className="mr-1">{currentTier.emoji}</span>{currentTier.level}
                                  </Badge>
                                </div>
                              </div>
                              {/* Share medal selector */}
                              {earnedBadges.length > 0 && (
                                <div className="flex flex-col gap-2">
                                  <div className="text-xs text-slate-600 dark:text-slate-400">Select badges to display</div>
                                  <div className="flex flex-wrap gap-2">
                                    {earnedBadges.map(b => (
                                      <button
                                        key={b.id}
                                        type="button"
                                        onClick={() => setShareSelectedBadgeIds((prev) => prev.includes(b.id) ? prev.filter(id => id !== b.id) : [...prev, b.id])}
                                        className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs', shareSelectedBadgeIds.includes(b.id) ? 'border-emerald-400/60 bg-emerald-400/10' : 'border-white/10 bg-white/40 dark:bg-black/20')}
                                      >
                                        <span className="text-base">{b.unlockEmoji || '🎖️'}</span>
                                        <span className="hidden sm:inline max-w-[8rem] truncate">{b.name}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <SharePreview2
                                userPoints={points}
                                rank={userStats?.rank ?? 0}
                                tierLabel={currentTier.level}
                                ensOrAddr={ensOrAddr}
                                medals={earnedBadges.filter(b => shareSelectedBadgeIds.includes(b.id)).map(b => ({ emoji: b.unlockEmoji || '🎖️', name: b.name }))}
                                externalRef={shareCanvasRef}
                              />
                              <div className="flex flex-wrap gap-2">
                                <Button onClick={shareRank} className="bg-emerald-500 hover:bg-emerald-500/90 text-white">
                                  <Share2 className="mr-2 h-4 w-4" /> Quick Share
                                </Button>
                                <Button variant="outline" onClick={async () => { const msg = `I'm #${userStats?.rank ?? '?'} on Peridot with ${points.toLocaleString()} pts (${currentTier.level}). Join me!`; await navigator.clipboard?.writeText(msg); toast({ title: 'Copied', description: 'Share message copied to clipboard.' }) }}>
                                  <Copy className="mr-2 h-4 w-4" /> Copy Message
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    try {
                                      const c = shareCanvasRef.current
                                      if (!c) return
                                      const link = document.createElement('a')
                                      link.download = 'peridot-leaderboard.png'
                                      link.href = c.toDataURL('image/png')
                                      link.click()
                                    } catch (e) {
                                      toast({ title: 'Download failed', description: 'Please try again.' })
                                    }
                                  }}
                                >
                                  <Download className="mr-2 h-4 w-4" /> Download PNG
                                </Button>
                                <div className="relative">
                                  <Button variant="secondary" onClick={postOnXWithImage} disabled={isPostingX} className="min-w-[100px]">
                                    {isPostingX ? 'Loading' : 'Post on X'}
                                  </Button>
                                  {isPostingX && (
                                    <div className="fixed inset-0 z-[100] flex items-center justify-center">
                                      <div className="pointer-events-none">
                                        <div className="cube-container" aria-hidden>
                                          <div className="cube">
                                            <div className="cube-face front"></div>
                                            <div className="cube-face back"></div>
                                            <div className="cube-face right"></div>
                                            <div className="cube-face left"></div>
                                            <div className="cube-face top"></div>
                                            <div className="cube-face bottom"></div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })()}
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </div>
            </div>

            {/* Tier badge + progress to next tier */}
            {isConnected && userStats && (
              <div className="relative z-10 mt-5 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                <div className="flex items-center gap-2">
                  <div className="peridot-cyber-wrap">
                    <button type="button" className="peridot-cyber-btn">
                      {((userStats as any)?.displayBadge) ? (
                        <div className="inline-flex items-center gap-1 rounded-full bg-white/60 dark:bg-white/10 border border-white/20 px-2 py-1 text-xs md:text-sm">
                          <span>{(userStats as any).displayBadge.icon}</span>
                          <span className="hidden sm:inline">{(userStats as any).displayBadge.name}</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 rounded-full bg-slate-200/60 dark:bg-slate-800/60 border border-white/10 px-2 py-1 text-xs md:text-sm">
                          <span>🎖️</span>
                          <span className="hidden sm:inline">No badge yet</span>
                        </div>
                      )}
                    </button>
                    <div className="peridot-cyber-tooltip">
                      <div className="peridot-corner-tl"></div>
                      <div className="peridot-corner-tr"></div>
                      <div className="peridot-corner-bl"></div>
                      <div className="peridot-corner-br"></div>
                      <strong>Unlock customizations</strong><br />
                      Style your leaderboard look.<br />
                      Unique share banners to flex.<br />
                      Eligible for future rewards.
                    </div>
                  </div>
                </div>
                <div className="w-full">
                  {tierInfo.nextTier ? (
                    <div>
                      <Progress value={tierInfo.progressPercent} className="h-3 bg-emerald-500/10" indicatorClassName="bg-emerald-500" />
                      <div className="mt-1 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/5 dark:bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-800 dark:text-slate-200">
                          <span className="text-emerald-600 font-bold">{tierInfo.points.toLocaleString()}</span>
                          / {tierInfo.nextTier.minPoints.toLocaleString()} pts
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 px-2.5 py-1 text-xs font-semibold">
                          {tierInfo.pointsToNext.toLocaleString()} to {tierInfo.nextTier.level}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-600 dark:text-slate-400">Max tier achieved</div>
                  )}
                </div>
                <div className="md:text-right" />
              </div>
            )}
          </div>
        </motion.div>
        
        {/* Tabs: Leaderboard | Guide | Badges | Profile */}
        <Tabs2 value={tabsValue} onValueChange={(v) => setTabsValue(v as any)} className="w-full">
          <Tabs2List className="p-1">
            <Tabs2Trigger value="leaderboard">Leaderboard</Tabs2Trigger>
            <Tabs2Trigger value="guide">Guide</Tabs2Trigger>
            <Tabs2Trigger value="badges">Badges</Tabs2Trigger>
            <Tabs2Trigger value="profile">Profile</Tabs2Trigger>
          </Tabs2List>

          <Tabs2Content value="leaderboard">
            {/* Stats strip moved inside tab */}
            {/* Mobile: show only Users + Verified Tx */}
            <div className="grid grid-cols-2 gap-3 sm:hidden mb-3">
              {(loading || !stats)
                ? Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className={cn(card, styles.skeletonCard, 'p-5 h-24')} />
                  ))
                : [
                    { icon: User, label: 'Users', value: stats.total_users.toLocaleString(), color: 'text-emerald-600' },
                    { icon: Rocket, label: 'Verified Tx', value: stats.total_verified_transactions.toLocaleString(), color: 'text-pink-600' },
                  ].map((s, i) => (
                    <div key={s.label} className={prefersReducedMotion ? '' : styles.statsCard}>
                      <div className={cn(card, 'p-5 h-24 flex items-center justify-between')}>
                        <div>
                          <p className="text-xl font-extrabold leading-none text-slate-600 dark:text-slate-400">{s.value}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">{s.label}</p>
                        </div>
                        <div className={cn('p-2 rounded-full bg-white/60 dark:bg-white/10 border border-white/30 dark:border-white/10', s.color)}>
                          <s.icon className="h-5 w-5" />
                        </div>
                      </div>
                    </div>
                  ))}
            </div>

            {/* Desktop/tablet: show full stats */}
            <div className="hidden sm:grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              {(!stats)
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className={cn(card, styles.skeletonCard, 'p-5 h-1')} />
                  ))
                : [
                    { icon: User, label: 'Users', value: stats.total_users.toLocaleString(), color: 'text-emerald-600' },
                    { icon: Star, label: 'Points', value: stats.total_points_awarded.toLocaleString(), color: 'text-indigo-600' },
                    { icon: Rocket, label: 'Verified Tx', value: stats.total_verified_transactions.toLocaleString(), color: 'text-pink-600' },
                    { icon: Crown, label: 'Actions', value: (stats.total_supplies + stats.total_borrows).toLocaleString(), color: 'text-amber-600' },
                  ].map((s, i) => (
                    <div key={s.label} className={prefersReducedMotion ? '' : styles.statsCard}>
                      <div className={cn(card, 'p-5 h-24 flex items-center justify-between')}>
                        <div>
                          <p className="text-xl font-extrabold leading-none text-slate-600 dark:text-slate-300 tabular-nums font-mono">{s.value}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-400">{s.label}</p>
                        </div>
                        <div className={cn('p-2 rounded-full bg-white/60 dark:bg-white/10 border border-white/30 dark:border-white/10', s.color)}>
                          <s.icon className="h-5 w-5" />
                        </div>
                      </div>
                    </div>
                  ))}
            </div>

            {/* Top list */}
            <div className={cn(card, 'overflow-hidden')}>
              <div className="px-4 sm:px-6 py-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl md:text-2xl font-extrabold tracking-tight">Top Players</h3>
                  <div className="text-xs text-slate-600 dark:text-slate-400">Live</div>
                </div>
                <div className="mt-3 relative inline-flex rounded-full bg-slate-200/60 dark:bg-slate-800/60 p-1 border border-white/10">
                  <div className="relative grid grid-cols-4">
                    {/* Animated highlighter */}
                    <motion.span
                      layout
                      className="absolute inset-y-1 rounded-full bg-white shadow-sm dark:bg-white/10"
                      animate={{ left: period === '1d' ? '0%' : period === '7d' ? '25%' : period === '30d' ? '50%' : '75%' }}
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      style={{ width: '25%' }}
                    />
                    {([
                      { key: '1d', label: '1D' },
                      { key: '7d', label: '7D' },
                      { key: '30d', label: '30D' },
                      { key: 'all', label: 'ALL' },
                    ] as const).map(({ key, label }) => (
                      <button
                        key={key}
                        className={cn(
                          'relative z-10 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors',
                          period === key ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'
                        )}
                        onClick={() => handlePeriodChange(key)}
                        type="button"
                        style={{ width: '25%' }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="px-1 sm:px-1 pt-2 pb-2">
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    ALL includes achievement points • 30D, 7D & 1D show activity points only
                  </p>
                </div>
              </div>
              <div className="px-0 sm:px-4 pb-3">
                {loading ? (
                  <ul className="space-y-2">
                    {Array.from({ length: 20 }).map((_, i) => (
                      <li key={i} className={styles.skeletonItem}>
                        <div className={cn('relative flex items-center justify-between rounded-2xl border border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/30 backdrop-blur-md px-3 py-3 sm:px-4 sm:py-3.5 h-14', styles.skeleton)}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={cn(styles.skeletonAvatar, "h-8 w-8")} />
                            <div className={cn(styles.skeletonText, "h-4 w-40")} />
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={cn(styles.skeletonText, "h-5 w-16")} />
                            <div className={cn(styles.skeletonText, "h-5 w-24")} />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="space-y-2">
                    {displayedList.map((u, idx) => (
                      <li
                        key={(u as any).account_key ?? u.wallet_address}
                        className={prefersReducedMotion ? '' : styles.leaderboardItem}
                      >
                        <div
                          className={cn(
                            'group relative flex items-center justify-between rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30 px-3 py-3 sm:px-4 sm:py-3.5 transition-colors h-14',
                            address?.toLowerCase() === u.wallet_address.toLowerCase()
                              ? 'shadow-[0_0_0_6px_rgba(16,185,129,0.10)]'
                              : 'hover:bg-white/80 dark:hover:bg-black/50'
                          )}
                          style={(() => {
                            const bc = (u as any).borderColor as string | undefined
                            if (!bc) return undefined
                            const isGrad = typeof bc === 'string' && bc.toLowerCase().includes('gradient')
                            if (isGrad) return undefined
                            // Render a crisp outer ring for selected border color
                            return { boxShadow: `0 0 0 2px ${bc}` }
                          })()}
                        >
                          {address?.toLowerCase() === u.wallet_address.toLowerCase() && !prefersReducedMotion && (
                            <div
                              aria-hidden
                              className="pointer-events-none absolute -inset-1 rounded-2xl animate-[leaderboard-pulse_2.2s_ease-in-out_infinite]"
                              style={{ background: 'radial-gradient(30rem 12rem at 20% 50%, rgba(16,185,129,0.15), transparent)' }}
                            />
                          )}
                          {!prefersReducedMotion && u.borderColor && (
                            (() => {
                              const style = (u as any).borderStyle || 'still'
                              const bc = (u as any).borderColor as string
                              const isGrad = typeof bc === 'string' && bc.toLowerCase().includes('gradient')
                              if (style === 'pulse') {
                                return (
                                  <div
                                    aria-hidden
                                    className="pointer-events-none absolute -inset-1 rounded-2xl animate-[leaderboard-pulse_2.2s_ease-in-out_infinite]"
                                    style={isGrad ? { backgroundImage: bc } : { background: `radial-gradient(30rem 12rem at 20% 50%, ${bc}26, transparent)` }}
                                  />
                                )
                              }
                              if (style === 'orbit') {
                                return (
                                  <div
                                    aria-hidden
                                    className="pointer-events-none absolute -inset-1 rounded-2xl animate-[leaderboard-orbit_4s_linear_infinite]"
                                    style={isGrad ? { backgroundImage: bc } : { boxShadow: `0 0 0 2px ${bc}33 inset` }}
                                  />
                                )
                              }
                              if (style === 'shine') {
                                return (
                                  <div aria-hidden className="pointer-events-none absolute -inset-1 rounded-2xl overflow-hidden">
                                    <div
                                      className="absolute inset-y-0 -left-1/3 w-1/3 animate-[leaderboard-shine_2.6s_linear_infinite]"
                                      style={{ background: isGrad ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)' : `linear-gradient(90deg, transparent, ${bc}33, transparent)` }}
                                    />
                                  </div>
                                )
                              }
                              return null
                            })()
                          )}
                          {prefersReducedMotion && u.borderColor && (
                            (() => {
                              const bc = (u as any).borderColor as string
                              const isGrad = typeof bc === 'string' && bc.toLowerCase().includes('gradient')
                              if (isGrad) {
                                // For gradient, leave the glow; the crisp outer ring is already applied via boxShadow style above
                                return <div aria-hidden className="pointer-events-none absolute -inset-1 rounded-2xl" style={{ backgroundImage: bc }} />
                              }
                              // No inner inset; outer ring already applied. Show a faint inner glow for depth.
                              return <div aria-hidden className="pointer-events-none absolute -inset-1 rounded-2xl" style={{ background: `radial-gradient(30rem 12rem at 20% 50%, ${bc}14, transparent)` }} />
                            })()
                          )}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={cn('flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold',
                              idx === 0 ? 'bg-yellow-300 text-yellow-900' : idx === 1 ? 'bg-slate-300 text-slate-900' : idx === 2 ? 'bg-orange-300 text-orange-900' : 'bg-slate-200/80 dark:bg-slate-800/70 text-slate-800 dark:text-slate-200'
                            )}>#{(() => {
                              const r: any = (u as any).rank
                              if (typeof r === 'number') return r
                              const isSelf = address && u.wallet_address?.toLowerCase() === address.toLowerCase()
                              if (isSelf) {
                                const pr: any = (userStats as any)?.period_rank
                                if (typeof pr === 'number') return pr
                              }
                              return (idx + 1)
                            })()}</div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                {(() => {
                                  // Only show explicitly selected/unlocked name emoji; do not fall back to badge icon
                                  const emojiToShow = (u as any).nameEmoji || null
                                  const name = u.username || `${u.wallet_address.slice(0, 6)}...${u.wallet_address.slice(-4)}`
                                  return (
                                    <div className="truncate font-mono text-xs sm:text-sm cursor-default inline-flex items-center gap-1">
                                      {emojiToShow ? (
                                        <span className="text-base leading-none">{emojiToShow}</span>
                                      ) : null}
                                      <span>{name}</span>
                                    </div>
                                  )
                                })()}
                              </TooltipTrigger>
                              <TooltipContent className={cn(card, 'px-3 py-2 text-xs max-w-[240px]')}>
                                <div className="space-y-1">
                                  <div className="font-mono break-all">{u.wallet_address}</div>
                                  <div className="flex items-center justify-between gap-4 text-[11px] text-slate-500">
                                    <span>All-time</span>
                                    <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-200">{(Number((u as any).all_time_points ?? (u as any).total_points ?? 0)).toLocaleString()} pts</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4 text-[11px] text-slate-500">
                                    <span>Global rank</span>
                                    <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-200">{(u as any).global_rank ?? '—'}</span>
                                  </div>
                                  {(() => {
                                    const history = seasonHistoryMap[u.wallet_address.toLowerCase()]
                                    if (!history?.length) return null
                                    return (
                                      <>
                                        <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
                                        <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Past seasons</div>
                                        {history.filter(s => s && s.seasonId).map(s => (
                                          <div key={s.seasonId} className="flex items-center justify-between gap-4 text-[11px] text-slate-500">
                                            <span>{s.seasonName || s.seasonId}</span>
                                            <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                                              {Number(s.finalPoints ?? 0).toLocaleString()} pts{s.finalRank ? ` · #${s.finalRank}` : ''}
                                            </span>
                                          </div>
                                        ))}
                                      </>
                                    )
                                  })()}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <div className="flex items-center gap-2">
                            {(u as any).isPremium && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-400/10 border border-emerald-400/30 px-2 py-0.5 text-[10px] text-emerald-400 font-semibold cursor-default">
                                    <Star className="w-2.5 h-2.5" />
                                    Premium
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs px-2 py-1">
                                  Premium member boosted MERKL rewards
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <Badge variant="outline" className="text-[10px] sm:text-xs border-emerald-400/40 text-emerald-600 bg-emerald-400/10">
                              {(() => {
                                const isSelf = address?.toLowerCase() === u.wallet_address.toLowerCase()
                                const allPts = isSelf
                                  ? (typeof (userStats as any)?.all_time_points === 'number' ? (userStats as any).all_time_points : (userStats?.total_points || 0))
                                  : (typeof (u as any)?.all_time_points === 'number' ? (u as any).all_time_points : u.total_points)
                                const t = rankingTiers.find(t => allPts >= t.minPoints) || rankingTiers[rankingTiers.length - 1]
                                return t.level
                              })()}
                            </Badge>
                            {(u as any).displayBadge && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  {(() => {
                                    const style = (u as any).badgeStyle || 'still'
                                    const base = 'hidden md:inline-flex items-center gap-1 rounded-full bg-white/60 dark:bg-white/10 border border-white/20 px-2 py-0.5 text-[10px]'
                                    if (prefersReducedMotion || style === 'still') {
                                      return (
                                        <div className={base}>
                                          <span>{(u as any).displayBadge.icon}</span>
                                          <span className="hidden sm:inline">{(u as any).displayBadge.name}</span>
                                        </div>
                                      )
                                    }
                                    if (style === 'glow') {
                                      return (
                                        <div className={cn(base, 'animate-[leaderboard-glow_2.2s_ease-in-out_infinite]')}>
                                          <span>{(u as any).displayBadge.icon}</span>
                                          <span className="hidden sm:inline">{(u as any).displayBadge.name}</span>
                                        </div>
                                      )
                                    }
                                    if (style === 'float') {
                                      return (
                                        <div className={cn(base, 'animate-[leaderboard-float_2.4s_ease-in-out_infinite]')}>
                                          <span>{(u as any).displayBadge.icon}</span>
                                          <span className="hidden sm:inline">{(u as any).displayBadge.name}</span>
                                        </div>
                                      )
                                    }
                                    if (style === 'spin') {
                                      return (
                                        <div className={base}>
                                          <span className="inline-block animate-[spin_4s_linear_infinite]">
                                            {(u as any).displayBadge.icon}
                                          </span>
                                          <span className="hidden sm:inline">{(u as any).displayBadge.name}</span>
                                        </div>
                                      )
                                    }
                                  })()}
                                </TooltipTrigger>
                                <TooltipContent className={cn(card, 'px-3 py-2 text-xs')}>{(u as any).displayBadge.name}</TooltipContent>
                              </Tooltip>
                            )}
                            <div className="text-right min-w-[6rem] sm:min-w-[8rem] flex items-center justify-end">
                              <span className="text-sm sm:text-base font-extrabold text-emerald-600 tabular-nums font-mono">{(() => {
                                const pp = (u as any).period_points
                                if (typeof pp === 'number' && !Number.isNaN(pp)) return pp.toLocaleString()
                                return u.total_points.toLocaleString()
                              })()}</span>
                              <span className="ml-1 text-[10px] text-slate-500">pts</span>
                              <PointsBreakdown wallet={u.wallet_address} />
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Kid-friendly CTA card */}
            <div className={prefersReducedMotion ? '' : styles.ctaCard}>
              <div className={cn(card, 'mt-4 p-5 md:p-6 flex flex-col md:flex-row items-center justify-between gap-4')}
                   style={{ backgroundImage: 'radial-gradient(40rem 30rem at 20% 0%, rgba(236,72,153,0.1), transparent)' }}>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-white/70 dark:bg-white/10 border border-white/20 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-pink-600" />
                  </div>
                  <div>
                    <p className="text-lg md:text-xl font-extrabold leading-tight">Daily streaks and referrals boost your rank!</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">Come back every day and invite friends to climb faster.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button asChild variant="outline" className="border-indigo-400/40 text-indigo-600">
                    <Link href="/app/invite">Invite</Link>
                  </Button>
                </div>
              </div>
            </div>
          </Tabs2Content>

          <Tabs2Content value="guide">
            <div className={'md:p-6 bg-transparent'}>
              <HowItWorksComic rankingTiers={rankingTiers} currentPoints={userStats?.total_points || 0} />
            </div>
            <div className={cn(card, 'mt-4 p-4 md:p-6 relative overflow-hidden')}
              style={{ backgroundImage: 'radial-gradient(40rem 30rem at 10% -10%, rgba(16,185,129,0.08), transparent), radial-gradient(40rem 30rem at 100% 120%, rgba(99,102,241,0.08), transparent)'}}>
              {!prefersReducedMotion && (
                <>
                  <motion.div aria-hidden className="absolute -top-16 -left-12 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl" animate={{ opacity: [0.35, 0.15, 0.35] }} transition={{ repeat: Infinity, duration: 3.2 }} />
                  <motion.div aria-hidden className="absolute -bottom-16 -right-12 h-56 w-56 rounded-full bg-indigo-400/20 blur-3xl" animate={{ opacity: [0.25, 0.1, 0.25] }} transition={{ repeat: Infinity, duration: 3.8 }} />
                </>
              )}
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg md:text-xl font-extrabold tracking-tight flex items-center gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/70 dark:bg-white/10 border border-white/20">🎖️</span>
                    Badges
                  </h3>
                  <div className="text-xs text-slate-500">Discover and collect</div>
                </div>
                {shouldShowGuideBadges ? (
                  <LazyBadgesAccordion earnedBadgeIds={earnedBadgeIdsSet} />
                ) : (
                  <div className={cn(styles.skeletonCard, "h-32 border border-white/15 dark:border-white/10")} aria-hidden />
                )}
              </div>
            </div>
          </Tabs2Content>

          <Tabs2Content value="badges">
            {!isConnected || !userStats ? (
              <div className={cn(card, 'p-8 text-center')}>
                <p className="text-slate-600 dark:text-slate-400">Connect your wallet and make your first action to see your badges.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Info card about badge unlocks */}
                <div className={cn(card, 'p-5 relative overflow-hidden border-emerald-400/20')}
                  style={{ backgroundImage: 'radial-gradient(40rem 30rem at 50% 0%, rgba(16,185,129,0.12), transparent)'}}>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Unlock Special Features</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        Earn badges to unlock <span className="font-semibold text-emerald-600 dark:text-emerald-400">special borders</span> for your profile in the leaderboard, 
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400"> custom badges</span> to display next to your name, 
                        <span className="font-semibold text-pink-600 dark:text-pink-400"> unique emojis</span> for personalization, and more! 
                        Customize your display in the <span className="font-semibold">Profile</span> tab.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Next and Last earned badge */}
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Your next badge */}
                  <div className={cn(card, 'p-6 relative overflow-hidden')}
                    style={{ backgroundImage: 'radial-gradient(40rem 30rem at 0% 0%, rgba(16,185,129,0.08), transparent), radial-gradient(40rem 30rem at 100% 120%, rgba(99,102,241,0.08), transparent)'}}>
                    {!disableDecorFx && (
                      <>
                        <motion.div aria-hidden className="absolute -top-16 -left-12 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl" animate={{ opacity: [0.35, 0.15, 0.35] }} transition={{ repeat: Infinity, duration: 3.2 }} />
                        <motion.div aria-hidden className="absolute -bottom-16 -right-12 h-56 w-56 rounded-full bg-indigo-400/20 blur-3xl" animate={{ opacity: [0.25, 0.1, 0.25] }} transition={{ repeat: Infinity, duration: 3.8 }} />
                      </>
                    )}
                    <div className="relative z-10">
                      <h3 className="text-lg md:text-xl font-extrabold tracking-tight flex items-center gap-2">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/70 dark:bg-white/10 border border-white/20">
                          <span className="text-xl">{userStats?.nextBadge?.icon || '🎖️'}</span>
                        </span>
                        Your next badge
                      </h3>
                      <div className="mt-3">
                        {isConnected && userStats?.nextBadge ? (
                          <div className="flex items-start gap-4">
                            <div className="relative">
                              <div className="h-14 w-14 rounded-2xl bg-white/60 dark:bg-black/50 border border-white/20 backdrop-blur-md flex items-center justify-center">
                                <span className="text-2xl">{userStats.nextBadge.icon}</span>
                              </div>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-lg font-bold leading-tight truncate">{userStats.nextBadge.name}</p>
                                <Badge variant="outline" className="text-[10px] border-white/30">{userStats.nextBadge.tier}</Badge>
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-3">{userStats.nextBadge.description}</p>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                                {userStats.nextBadge.xpThreshold ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-1 border border-emerald-400/30">
                                    Requires {userStats.nextBadge.xpThreshold.toLocaleString()} XP
                                  </span>
                                ) : null}
                                {typeof (userStats as any).nextBadge?.pointsReward === 'number' ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-600 px-2 py-1 border border-amber-400/30">
                                    +{(userStats as any).nextBadge.pointsReward} pts
                                  </span>
                                ) : null}
                                {userStats.nextBadge.unlockEmoji ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 text-indigo-600 px-2 py-1 border border-indigo-400/30">
                                    Unlocks emoji {userStats.nextBadge.unlockEmoji}
                                  </span>
                                ) : null}
                                {userStats.nextBadge.unlockBorderColor ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/10 text-pink-600 px-2 py-1 border border-pink-400/30">
                                    Unlocks border
                                    <span className="ml-1 inline-block h-3 w-3 rounded-full" style={{ backgroundColor: userStats.nextBadge.unlockBorderColor }} />
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-slate-600 dark:text-slate-400">Connect your wallet to preview your next achievement.</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Last earned badge */}
                  <div className={cn(card, 'p-6 relative overflow-hidden')}
                    style={{ backgroundImage: 'radial-gradient(40rem 30rem at 0% 0%, rgba(245,158,11,0.10), transparent), radial-gradient(40rem 30rem at 100% 120%, rgba(245,158,11,0.08), transparent)'}}>
                    {!disableDecorFx && (
                      <>
                        <motion.div aria-hidden className="absolute -top-16 -left-12 h-48 w-48 rounded-full bg-amber-300/30 blur-3xl" animate={{ opacity: [0.35, 0.15, 0.35] }} transition={{ repeat: Infinity, duration: 3.2 }} />
                        <motion.div aria-hidden className="absolute -bottom-16 -right-12 h-56 w-56 rounded-full bg-yellow-300/25 blur-3xl" animate={{ opacity: [0.25, 0.1, 0.25] }} transition={{ repeat: Infinity, duration: 3.8 }} />
                      </>
                    )}
                    <div className="relative z-10">
                      <h3 className="text-lg md:text-xl font-extrabold tracking-tight flex items-center gap-2">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/70 dark:bg-white/10 border border-white/20">
                          <span className="text-xl">{lastEarnedBadge?.unlockEmoji || '✨'}</span>
                        </span>
                        Last earned badge
                      </h3>
                      <div className="mt-3">
                        {isConnected && lastEarnedBadge ? (
                          <div className="flex items-start gap-4">
                            <div className="relative">
                              <div className="h-14 w-14 rounded-2xl bg-white/60 dark:bg-black/50 border border-white/20 backdrop-blur-md flex items-center justify-center">
                                <span className="text-2xl">{lastEarnedBadge.unlockEmoji || '🎖️'}</span>
                              </div>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-lg font-bold leading-tight truncate">{lastEarnedBadge.name}</p>
                                <Badge variant="outline" className="text-[10px] border-white/30">{lastEarnedBadge.tier}</Badge>
                                <Badge variant="outline" className="text-[10px] border-amber-400/40 text-amber-600 bg-amber-400/10">Unlocked</Badge>
                              </div>
                              {lastEarnedBadgeMeta?.description ? (
                                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-3">{lastEarnedBadgeMeta.description}</p>
                              ) : null}
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                                {lastEarnedBadge.unlockEmoji ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 text-indigo-600 px-2 py-1 border border-indigo-400/30">
                                    Emoji {lastEarnedBadge.unlockEmoji}
                                  </span>
                                ) : null}
                                {lastEarnedBadge.unlockBorderColor ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-600 px-2 py-1 border border-amber-400/30">
                                    Border
                                    <span className="ml-1 inline-block h-3 w-3 rounded-full" style={{ backgroundColor: lastEarnedBadge.unlockBorderColor || undefined }} />
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-slate-600 dark:text-slate-400">Earn your first badge to see it here.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* All Badges - Full Accordion */}
                <div className={cn(card, 'p-6 relative overflow-hidden')}
                  style={{ backgroundImage: 'radial-gradient(40rem 30rem at 0% 0%, rgba(16,185,129,0.08), transparent), radial-gradient(40rem 30rem at 100% 120%, rgba(99,102,241,0.08), transparent)'}}>
                  {!disableDecorFx && (
                    <>
                      <motion.div aria-hidden className="absolute -top-16 -left-12 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl" animate={{ opacity: [0.35, 0.15, 0.35] }} transition={{ repeat: Infinity, duration: 3.2 }} />
                      <motion.div aria-hidden className="absolute -bottom-16 -right-12 h-56 w-56 rounded-full bg-indigo-400/20 blur-3xl" animate={{ opacity: [0.25, 0.1, 0.25] }} transition={{ repeat: Infinity, duration: 3.8 }} />
                    </>
                  )}
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg md:text-xl font-extrabold tracking-tight flex items-center gap-2">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/70 dark:bg-white/10 border border-white/20">🎖️</span>
                        All Badges
                      </h3>
                      <div className="text-xs text-slate-500">{earnedBadges.length} unlocked</div>
                    </div>
                    <LazyBadgesAccordion earnedBadgeIds={earnedBadgeIdsSet} />
                  </div>
                </div>
              </div>
            )}
          </Tabs2Content>

          <Tabs2Content value="profile">
            {!isConnected || !userStats ? (
              <div className={cn(card, 'p-8 text-center')}>
                <p className="text-slate-600 dark:text-slate-400">Connect your wallet and make your first action to see your profile.</p>
              </div>
            ) : (
              <div className="space-y-4">


                {/* Action type summary */}
                <div className={cn(card, 'p-6')}>
                  <h3 className="text-lg font-semibold text-emerald-600 mb-4">Action Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    {[
                      { label: 'Supplies', v: profileAgg.byType.supply },
                      { label: 'Borrows', v: profileAgg.byType.borrow },
                      { label: 'Repays', v: profileAgg.byType.repay },
                      { label: 'Withdraws', v: profileAgg.byType.redeem },
                    ].map((item) => (
                      <div key={item.label}>
                        <p className="text-xl font-bold">{formatUSD.format(item.v.usd)}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">{item.v.count} {item.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Season History */}
                {(ownSeasonHistoryLoading || ownSeasonHistory.length > 0) && (
                  <div className={cn(card, 'p-6')}>
                    <h3 className="text-lg font-semibold text-emerald-600 mb-4 flex items-center gap-2">
                      <Clock3 className="w-4 h-4" />
                      Season History
                    </h3>
                    {ownSeasonHistoryLoading ? (
                      <div className="space-y-2">
                        {[1, 2].map(i => (
                          <div key={i} className={cn(styles.skeletonCard, 'h-16 rounded-xl')} />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {ownSeasonHistory.map(s => (
                          <div key={s.seasonId} className="rounded-2xl bg-white/60 dark:bg-black/30 border border-white/10 px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold text-sm">{s.seasonName || s.seasonId}</span>
                              <div className="flex items-center gap-2">
                                {s.finalRank && (
                                  <span className="text-[11px] text-slate-500">#{s.finalRank}</span>
                                )}
                                <span className="tabular-nums text-sm font-bold text-emerald-600">
                                  {Number(s.finalPoints ?? 0).toLocaleString()} pts
                                </span>
                              </div>
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-center">
                              {[
                                { label: 'Supplies', v: s.supplyCount },
                                { label: 'Borrows', v: s.borrowCount },
                                { label: 'Repays', v: s.repayCount },
                                { label: 'Withdraws', v: s.redeemCount },
                              ].map(item => (
                                <div key={item.label} className="rounded-xl bg-white/40 dark:bg-white/5 px-2 py-1.5">
                                  <p className="text-sm font-bold">{item.v}</p>
                                  <p className="text-[10px] text-slate-500">{item.label}</p>
                                </div>
                              ))}
                            </div>
                            {s.totalLoginDays > 0 && (
                              <div className="mt-2 text-[11px] text-slate-500 text-right">
                                {s.totalLoginDays} login day{s.totalLoginDays !== 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Customize Display */}
                <div className={cn(card, 'p-6 relative overflow-hidden glass-strong glass-card soft-shadow bg-liquid')}
                  style={{ backgroundImage: 'radial-gradient(60rem 40rem at 90% -10%, rgba(16,185,129,0.08), transparent)'}}>
                  {!disableDecorFx && (
                    <>
                      <motion.div aria-hidden className="absolute -top-12 -left-12 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl" animate={{ opacity: [0.35, 0.15, 0.35] }} transition={{ repeat: Infinity, duration: 3.2 }} />
                      <motion.div aria-hidden className="absolute -bottom-16 -right-12 h-56 w-56 rounded-full bg-indigo-400/20 blur-3xl" animate={{ opacity: [0.25, 0.1, 0.25] }} transition={{ repeat: Infinity, duration: 3.8 }} />
                    </>
                  )}
                  <div aria-hidden className="noise"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-emerald-600">Customize</h3>
                      <div className="text-xs text-slate-500">Make it yours</div>
                    </div>
                    <div className="grid md:grid-cols-3 gap-4">
                      {/* Preview */}
                      <div className="md:col-span-1">
                        <div className="relative glass-card glow-ring tilt-hover rounded-2xl p-4 overflow-hidden">
                          {!disableDecorFx && (
                            <motion.div aria-hidden className="absolute -inset-2" animate={{ opacity: [0.5, 0.3, 0.5] }} transition={{ duration: 2.4, repeat: Infinity }} style={{ background: 'radial-gradient(18rem 10rem at 30% 20%, rgba(255,255,255,0.10), transparent)'}} />
                          )}
                          <motion.div className="relative z-10" key={`${selectedBadgeId ?? 'none'}-${selectedBorderColor ?? 'none'}-${selectedNameEmoji ?? 'none'}`} initial={disableDecorFx ? undefined : { scale: 0.98, opacity: 0 }} animate={disableDecorFx ? undefined : { scale: 1, opacity: 1 }} transition={{ duration: 0.25 }}>
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <div className="h-16 w-16 rounded-full bg-white/80 dark:bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner">
                                  <span className="text-2xl">{selectedNameEmoji || (userStats as any)?.nameEmoji || '🙂'}</span>
                                </div>
                                {selectedBorderColor && (() => {
                                  const c = selectedBorderColor as string
                                  const isGrad = c.toLowerCase().includes('gradient')
                                  if (isGrad) {
                                    return (
                                      <div className="pointer-events-none absolute inset-0 rounded-full" style={{ backgroundImage: c as any, WebkitMask: 'radial-gradient(circle, transparent 60%, black 60.5%)', mask: 'radial-gradient(circle, transparent 60%, black 60.5%)' }} />
                                    )
                                  }
                                  return <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: `0 0 0 3px ${c}` }} />
                                })()}
                              </div>
                              <div>
                                <div className="font-extrabold text-lg truncate max-w-[12rem]">{userStats?.username || `${address?.slice(0,6)}...${address?.slice(-4)}`}</div>
                                <div className="text-xs text-slate-500 flex items-center gap-1">
                                  <span>Badge:</span>
                                  <span className="inline-flex items-center gap-1 rounded-full bg-white/60 dark:bg-white/10 border border-white/20 px-2 py-0.5">
                                    <span>{earnedBadges.find(b => b.id === selectedBadgeId)?.name || userStats?.displayBadge?.name || 'None'}</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        </div>
                      </div>

                      {/* Badge grid */}
                      <div className="md:col-span-1">
                        <div className="text-xs text-slate-500 mb-2">Earned Badges</div>
                        <div className="grid grid-cols-3 gap-2">
                          {displayLoading ? (
                            Array.from({ length: 6 }).map((_, i) => <div key={i} className={cn(styles.skeletonBadge, "h-16")} />)
                          ) : earnedBadges.length === 0 ? (
                            <div className="col-span-3 text-xs text-slate-500">Earn achievements to unlock badges</div>
                          ) : (
                            earnedBadges.filter(b => b.allowLeaderboardDisplay !== false).slice(0, visibleBadgeCount).map(b => (
                              <button key={b.id} type="button" onClick={() => dispatch({ type: 'SET_PROFILE', payload: { selections: { badgeId: selectedBadgeId === b.id ? null : b.id } } })}
                                className={cn('relative rounded-xl border px-3 py-2 text-left transition tilt-hover', selectedBadgeId === b.id ? 'border-emerald-400/60 bg-emerald-400/10' : 'border-white/10 bg-white/40 dark:bg-black/20')}> 
                                <div className="text-lg">{b.unlockEmoji || '🎖️'}</div>
                                <div className="text-[11px] mt-1 truncate">{b.name}</div>
                              </button>
                            ))
                          )}
                        </div>
                        {earnedBadges.length > visibleBadgeCount && (
                          <div className="mt-2 flex justify-center">
                            <Button variant="outline" size="sm" onClick={() => setVisibleBadgeCount(c => c + 12)}>Show more</Button>
                          </div>
                        )}
                      </div>

                      {/* Color & Emoji pickers */}
                      <div className="md:col-span-1">
                        <div className="text-xs text-slate-500 mb-2">Style</div>
                        <div className="space-y-3">
                          <div>
                            <div className="text-[11px] text-slate-500 mb-1">Border color</div>
                            <div className="flex flex-wrap gap-2">
                              {unlockedColors.slice(0, visibleColorCount).map(color => {
                                const isGrad = typeof color === 'string' && color.toLowerCase().includes('gradient')
                                return (
                                  <Tooltip key={color}>
                                    <TooltipTrigger asChild>
                                      <button type="button" onClick={() => dispatch({ type: 'SET_PROFILE', payload: { selections: { borderColor: selectedBorderColor === color ? null : color } } })}
                                        className={cn('h-8 w-8 rounded-full border overflow-hidden tilt-hover', selectedBorderColor === color ? 'ring-2 ring-offset-2 ring-emerald-400' : '')}
                                        style={isGrad ? { backgroundImage: color as any, borderColor: 'transparent' } : { backgroundColor: `${color}33`, borderColor: color as any }}
                                        aria-label={`Border ${color}`} />
                                    </TooltipTrigger>
                                    <TooltipContent className={cn(card, 'px-3 py-2 text-xs')}>{colorLabel(String(color))}</TooltipContent>
                                  </Tooltip>
                                )
                              })}
                              {unlockedColors.length === 0 && (
                                <div className="text-[11px] text-slate-500">Unlock border colors via achievements</div>
                              )}
                            </div>
                            {unlockedColors.length > visibleColorCount && (
                              <div className="mt-2">
                                <Button variant="outline" size="sm" onClick={() => setVisibleColorCount(c => c + 12)}>Show more</Button>
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="text-[11px] text-slate-500 mb-1">Name emoji</div>
                            <div className="flex flex-wrap gap-2">
                              {unlockedEmojis.slice(0, visibleEmojiCount).map(emoji => (
                                <button key={emoji} type="button" onClick={() => dispatch({ type: 'SET_PROFILE', payload: { selections: { nameEmoji: selectedNameEmoji === emoji ? null : emoji } } })}
                                  className={cn('h-8 w-8 rounded-full border border-white/20 bg-white/50 dark:bg-white/10 flex items-center justify-center tilt-hover', selectedNameEmoji === emoji ? 'ring-2 ring-offset-2 ring-indigo-400' : '')}
                                  aria-label={`Emoji ${emoji}`}>
                                  <span className="text-base">{emoji}</span>
                                </button>
                              ))}
                              {unlockedEmojis.length === 0 && (
                                <div className="text-[11px] text-slate-500">Unlock emojis via achievements</div>
                              )}
                            </div>
                            {unlockedEmojis.length > visibleEmojiCount && (
                              <div className="mt-2">
                                <Button variant="outline" size="sm" onClick={() => setVisibleEmojiCount(c => c + 16)}>Show more</Button>
                              </div>
                            )}
                          </div>

                          <div className="pt-1 flex justify-end">
                            <Button onClick={saveProfileDisplay} disabled={isSavingDisplay} className="liquid-pill rounded-full !bg-emerald-500/15 hover:!bg-emerald-500/25 text-emerald-800 dark:text-emerald-100 border border-emerald-600/30 px-5 py-2">
                              {isSavingDisplay ? 'Saving…' : '✨ Save display'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Top tokens by USD */}
                <div className={cn(card, 'p-6')}>
                  <h3 className="text-lg font-semibold text-emerald-600 mb-4">Top Tokens</h3>
                  {profileAgg.topTokens.length === 0 ? (
                    <p className="text-slate-600 dark:text-slate-400">No token activity yet.</p>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-3">
                      {profileAgg.topTokens.map(([sym, v]) => (
                        <div key={sym} className="flex items-center justify-between rounded-xl bg-white/60 dark:bg-black/30 border border-white/10 px-3 py-2">
                          <div className="font-mono text-sm">{sym}</div>
                          <div className="text-right">
                            <div className="text-sm font-bold">{formatUSD.format(v.usd)}</div>
                            <div className="text-[11px] text-slate-500">{v.count} tx</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Chains breakdown */}
                <div className={cn(card, 'p-6')}>
                  <h3 className="text-lg font-semibold text-emerald-600 mb-4">Chains</h3>
                  {profileAgg.chains.length === 0 ? (
                    <p className="text-slate-600 dark:text-slate-400">No chain activity yet.</p>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-3">
                      {profileAgg.chains.map((c) => (
                        <div key={c.id} className="flex items-center justify-between rounded-xl bg-white/60 dark:bg-black/30 border border-white/10 px-3 py-2">
                          <div className="text-sm">{getChainName(c.id)}</div>
                          <div className="text-right">
                            <div className="text-sm font-bold">{formatUSD.format(c.usd)}</div>
                            <div className="text-[11px] text-slate-500">{c.count} tx</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>



                {/* Recent transactions */}
                <div className={cn(card, 'p-6')}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-emerald-600">Recent Transactions</h3>
                    {userTransactions.length > BASE_VISIBLE_TX && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVisibleTransactions(v => (v > BASE_VISIBLE_TX ? BASE_VISIBLE_TX : Math.min(userTransactions.length, v + 10)))}
                        aria-expanded={visibleTransactions > BASE_VISIBLE_TX}
                        className="rounded-full border-white/20 bg-white/40 backdrop-blur-md dark:bg-white/10 hover:bg-white/60 dark:hover:bg-white/20 transition will-change-transform"
                      >
                        {visibleTransactions > BASE_VISIBLE_TX ? 'Collapse' : 'Show more'}
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {displayedTransactions.length > 0 ? (
                      displayedTransactions.map((tx, index) => (
                        <HoverCard key={tx.tx_hash} openDelay={80} closeDelay={80}>
                          <HoverCardTrigger asChild>
                            <motion.div
                              initial={txRowMotion.initial}
                              animate={txRowMotion.animate}
                              transition={{ ...(txRowMotion.transition as any), delay: prefersReducedMotion ? 0 : index * 0.02 }}
                              className="flex items-center justify-between p-3 rounded-xl bg-white/70 dark:bg-white/5 backdrop-blur-md border border-slate-200/70 dark:border-white/10 hover:border-emerald-400/40 hover:bg-white/80 dark:hover:bg-white/10 transition will-change-transform shadow-sm ring-1 ring-black/5 dark:ring-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
                              whileHover={prefersReducedMotion ? undefined : { y: -2, scale: 1.01 }}
                              whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
                              tabIndex={0}
                              role="button"
                              aria-haspopup="dialog"
                            >
                              <div>
                                <Badge className="mb-1" variant="outline" style={{ borderColor: '#10b981', color: '#10b981' }}>{getActionDisplayName(tx.action_type)}</Badge>
                                <p className="font-mono text-xs text-slate-500 dark:text-slate-400 truncate max-w-[56vw] sm:max-w-[40ch]">{tx.tx_hash}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-right">
                                  <p className="font-bold text-emerald-600">+{tx.points_awarded} pts</p>
                                  <p className="text-[11px] text-slate-500">{formatUSD.format(Number(tx.usd_value || 0))}</p>
                                </div>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="ghost" size="icon" className="rounded-full" aria-label="Show details">
                                      <Info className="h-4 w-4" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-80 rounded-2xl border-white/20 bg-white/80 dark:bg-black/30 backdrop-blur-xl shadow-lg">
                                    <TxDetailBody tx={tx} formatUSD={formatUSD} />
                                  </PopoverContent>
                                </Popover>
                              </div>
                            </motion.div>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-80 rounded-2xl border-white/20 bg-white/70 dark:bg-black/30 backdrop-blur-xl shadow-lg">
                            <TxDetailBody tx={tx} formatUSD={formatUSD} />
                          </HoverCardContent>
                        </HoverCard>
                      ))
                    ) : (
                      <p className="text-center text-slate-500 dark:text-slate-400 py-4">No transactions recorded yet.</p>
                    )}
                  </div>
                  {userTransactions.length > visibleTransactions && (
                    <Button
                      variant="outline"
                      onClick={() => setVisibleTransactions(v => Math.min(userTransactions.length, v + 10))}
                      className="mt-4 w-full rounded-full border-white/20 bg-white/40 backdrop-blur-md dark:bg-white/10 hover:bg-white/60 dark:hover:bg-white/20 transition"
                      aria-label="Show more transactions"
                    >
                      Show more
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Tabs2Content>
        </Tabs2>

        {/* Welcome / Onboarding dialog for first-time or disconnected users */}
        <Dialog open={showGuideIntro} onOpenChange={(v) => { setShowGuideIntro(v); if (!v) { try { window.localStorage.setItem(INTRO_SEEN_KEY, '1') } catch {} } }}>
          <DialogContent className="max-w-lg bg-white/80 dark:bg-black/40 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-extrabold tracking-tight">Welcome to the Leaderboard!</DialogTitle>
            </DialogHeader>
            <div className="text-slate-600 dark:text-slate-300 text-sm md:text-base">
              Learn why & how to earn points and climb the ranks.
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={handleOpenQuestGuide}
                className="w-full h-12 inline-flex items-center justify-center rounded-2xl bg-emerald-500 text-white font-semibold shadow-[0_8px_30px_rgba(16,185,129,0.35)] hover:bg-emerald-600 transition-colors"
              >
                Open Quest Guide
              </button>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </TooltipProvider>
    <style jsx>{`
      .cube-container {
        perspective: 1000px;
        display: inline-flex;
      }
      .cube {
        width: 96px;
        height: 96px;
        position: relative;
        transform-style: preserve-3d;
        animation: spinCube 12s infinite linear;
      }
      @media (max-width: 640px) {
        .cube { width: 80px; height: 80px; }
      }
      .cube-face {
        position: absolute;
        width: 100%;
        height: 100%;
        background-color: #5e7945;
        background-image: radial-gradient(circle at 70% 20%, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0) 50%);
        border: 1px solid rgba(255, 255, 255, 0.2);
        opacity: 0.9;
      }
      .front  { transform: rotateY(0deg) translateZ(48px); }
      .back   { transform: rotateY(180deg) translateZ(48px); }
      .right  { transform: rotateY(90deg) translateZ(48px); }
      .left   { transform: rotateY(-90deg) translateZ(48px); }
      .top    { transform: rotateX(90deg) translateZ(48px); }
      .bottom { transform: rotateX(-90deg) translateZ(48px); }
      @media (max-width: 640px) {
        .front  { transform: rotateY(0deg) translateZ(40px); }
        .back   { transform: rotateY(180deg) translateZ(40px); }
        .right  { transform: rotateY(90deg) translateZ(40px); }
        .left   { transform: rotateY(-90deg) translateZ(40px); }
        .top    { transform: rotateX(90deg) translateZ(40px); }
        .bottom { transform: rotateX(-90deg) translateZ(40px); }
      }
      @keyframes spinCube {
        from { transform: rotateX(0deg) rotateY(0deg); }
        to { transform: rotateX(360deg) rotateY(360deg); }
      }
      .peridot-cyber-wrap { position: relative; }
      .peridot-cyber-btn {
        position: relative;
        background: transparent;
        color: inherit;
        border: none;
        padding: 0;
        font: inherit;
        letter-spacing: 0;
        cursor: pointer;
        text-shadow: none;
      }
      .peridot-cyber-btn:hover { text-shadow: none; }
      .peridot-cyber-btn::before,
      .peridot-cyber-btn::after {
        content: "";
        position: absolute;
        width: 0;
        height: 1px;
        background: currentColor;
        box-shadow: 0 0 5px currentColor;
        transition: width 0.25s ease;
      }
      .peridot-cyber-btn::before { top: 0; left: 0; }
      .peridot-cyber-btn::after { bottom: 0; right: 0; }
      .peridot-cyber-btn:hover::before,
      .peridot-cyber-btn:hover::after { width: 100%; }

      .peridot-cyber-tooltip {
        position: absolute;
        width: 240px;
        padding: 14px;
        background: rgba(255,255,255,0.95);
        border: 1px solid rgba(219, 223, 228, 0.93);
        color: inherit;
        font-size: 12px;
        line-height: 1.45;
        visibility: hidden;
        opacity: 0;
        transition: transform 0.25s ease, opacity 0.25s ease, visibility 0.25s ease;
        box-shadow: 0 10px 30px rgba(2, 6, 23, 0.25);
        text-shadow: none;
        z-index: 60;
        clip-path: polygon(0% 20%, 10% 0%, 90% 0%, 100% 20%, 100% 80%, 90% 100%, 10% 100%, 0% 80%);
        background-image:
          linear-gradient(rgba(0, 231, 255, 0.08) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 231, 255, 0.08) 1px, transparent 1px);
        background-size: 20px 20px;
        bottom: calc(100% + 12px);
        left: 80%;
        transform: translateX(-50%) translateY(0);
        pointer-events: none;
        text-align: left;
      }
      .peridot-cyber-btn:hover + .peridot-cyber-tooltip {
        visibility: visible;
        opacity: 1;
        transform: translateX(-50%) translateY(-6px);
      }
      @keyframes peridot-scan {
        0% { transform: translateY(-100%); opacity: 0; }
        20%, 80% { opacity: 0.7; }
        100% { transform: translateY(100%); opacity: 0; }
      }
      .peridot-cyber-tooltip::before {
        content: "";
        position: absolute;
        top: 0; left: 0; width: 100%; height: 2px;
        background: linear-gradient(90deg, transparent, rgba(148,163,184,0.8), transparent);
        box-shadow: none;
        animation: peridot-scan 2s infinite;
      }
      .peridot-corner-tl,
      .peridot-corner-tr,
      .peridot-corner-bl,
      .peridot-corner-br {
        position: absolute;
        width: 10px; height: 10px;
        border: 1px solid rgba(148, 163, 184, 0.6);
        box-shadow: none;
      }
      :global(html.dark) .peridot-cyber-tooltip {
        background: rgba(0, 0, 0, 0.40);
        border-color: rgba(255, 255, 255, 0.12);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      }
      :global(html.dark) .peridot-cyber-btn { color: inherit; }
      :global(html.dark) .peridot-corner-tl,
      :global(html.dark) .peridot-corner-tr,
      :global(html.dark) .peridot-corner-bl,
      :global(html.dark) .peridot-corner-br { border-color: rgba(255,255,255,0.2); }

      /* Prevent viewport cut-off: nudge right and allow overflow on container */
      :global(.overflow-hidden) .peridot-cyber-tooltip { overflow: visible; }
      .peridot-cyber-wrap { overflow: visible; }
      .peridot-cyber-tooltip { right: auto; }
      .peridot-corner-tl { top: 5px; left: 5px; border-right: none; border-bottom: none; }
      .peridot-corner-tr { top: 5px; right: 5px; border-left: none; border-bottom: none; }
      .peridot-corner-bl { bottom: 5px; left: 5px; border-right: none; border-top: none; }
      .peridot-corner-br { bottom: 5px; right: 5px; border-left: none; border-top: none; }

      @media (prefers-reduced-motion: reduce) {
        .peridot-cyber-btn::before,
        .peridot-cyber-btn::after,
        .peridot-cyber-tooltip,
        .peridot-cyber-tooltip::before { transition: none; animation: none; }
      }

      /* Mobile adjustments: center and constrain so it doesn't clip */
      @media (max-width: 640px) {
        .peridot-cyber-tooltip {
          width: min(88vw, 240px);
          left: 50%;
          transform: translateX(-50%) translateY(0);
        }
      }
    `}</style>
  </>)
}
