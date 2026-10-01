'use client'

import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { getPointsPolicy, getDailyLoginPoints } from '@/lib/rewards/policy'
import { ALLOWED_BORDER_COLORS, ALLOWED_NAME_EMOJIS, getAllBadges } from '@/lib/achievements'
import Link from 'next/link'
import { Rocket, Trophy, HandCoins, ShieldCheck, Gem, ArrowRight, Medal, Crown, Sparkles, Palette, Wallet, Eye, Calendar, BookOpen, Layout, ChevronDown } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import dynamic from 'next/dynamic'

const StripPill = dynamic(() => import('./HowItWorksGuideParts').then(m => m.StripPill), { ssr: false })
const Connector = dynamic(() => import('./HowItWorksGuideParts').then(m => m.Connector), { ssr: false })
const Pill = dynamic(() => import('./HowItWorksGuideParts').then(m => m.Pill), { ssr: false })
const MiniCard = dynamic(() => import('./HowItWorksGuideParts').then(m => m.MiniCard), { ssr: false })

type Props = {
  className?: string
  rankingTiers?: Array<{ level: string; minPoints: number; emoji?: string }>
  currentPoints?: number
}

const policy = getPointsPolicy()
const base = policy.basePoints
const topBonus = policy.usdBonusThresholds[0]
const dailyLoginPts = getDailyLoginPoints()

function HowItWorksComic({ className, rankingTiers, currentPoints = 0 }: Props) {

  const tiersAsc = useMemo(() => {
    if (!Array.isArray(rankingTiers)) return [] as Array<{ level: string; minPoints: number; emoji?: string }>
    return [...rankingTiers].reverse()
  }, [rankingTiers])

  const tierProgress = useMemo(() => {
    if (tiersAsc.length === 0) return 0
    let currentIndex = -1
    for (let i = 0; i < tiersAsc.length; i++) {
      if (currentPoints >= tiersAsc[i].minPoints) currentIndex = i
    }
    if (currentIndex <= 0) {
      const target = tiersAsc[0]?.minPoints || 1
      const baseProgress = Math.max(0, Math.min(1, currentPoints / Math.max(1, target)))
      return Math.round(baseProgress * 100)
    }
    if (currentIndex >= tiersAsc.length - 1) return 100
    const cur = tiersAsc[currentIndex]
    const nxt = tiersAsc[currentIndex + 1]
    const span = Math.max(1, nxt.minPoints - cur.minPoints)
    const partial = Math.max(0, Math.min(1, (currentPoints - cur.minPoints) / span))
    const ratio = (currentIndex + partial) / (tiersAsc.length - 1)
    return Math.round(ratio * 100)
  }, [tiersAsc, currentPoints])

  return (
    <TooltipProvider delayDuration={80}>
      <div className={cn('relative space-y-8', className)} style={{ contain: 'layout style paint', contentVisibility: 'auto' }}>
      {/* Section 1: Big Picture */}
      <section className="relative glass-card rounded-2xl p-6 md:p-8 overflow-hidden reveal-cascade" style={{ ['--i' as any]: 1 }}>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Your Peridot Quest</h2>
          <Rocket className="size-7 md:size-8 text-emerald-500" />
        </div>

        {/* playful floating blobs */}
        <div aria-hidden className="blob blob-1" />
        <div aria-hidden className="blob blob-2" />
        <div aria-hidden className="blob blob-3" />

        {/* Eligibility hint */}
        <p className="mt-3 text-xs md:text-sm text-slate-600 dark:text-slate-400">
          Points make you eligible for future drops: airdrops, NFTs, early features.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-3 md:gap-6 items-center">
          <div className="flex flex-col items-center text-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="size-16 md:size-20 rounded-2xl grid place-items-center glass-tab tilt-hover glow-ring cursor-pointer transition active:scale-95 relative pressable">
                  <span aria-hidden className="press-ring" />
                  <HandCoins className="size-8 md:size-10 text-emerald-500" />
                </div>
              </TooltipTrigger>
              <TooltipContent className="px-3 py-2 text-xs max-w-[220px]">Supply or borrow assets on supported chains. Actions are on-chain; you keep custody.</TooltipContent>
            </Tooltip>
            <p className="mt-2 text-xs md:text-sm text-slate-600 dark:text-slate-400">Click buttons like Supply or Borrow to play.</p>
            <p className="mt-1 text-sm md:text-base font-medium">Do Actions</p>
          </div>

          <div className="flex items-center justify-center">
            <ArrowRight className="hidden md:block size-7 text-slate-400 twinkle" />
            <ArrowRight className="md:hidden size-6 text-slate-400 twinkle" />
          </div>

          <div className="flex flex-col items-center text-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="size-16 md:size-20 rounded-2xl grid place-items-center glass-tab tilt-hover glow-ring cursor-pointer transition active:scale-95 relative pressable">
                  <span aria-hidden className="press-ring" />
                  <Gem className="size-8 md:size-10 text-emerald-500" />
                </div>
              </TooltipTrigger>
              <TooltipContent className="px-3 py-2 text-xs max-w-[220px]">Points add up with every action. Bigger moves can earn bonus points.</TooltipContent>
            </Tooltip>
            <p className="mt-2 text-xs md:text-sm text-slate-600 dark:text-slate-400">Each action gives you points automatically.</p>
            <p className="mt-1 text-sm md:text-base font-medium">Earn Points</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center">
          <ArrowRight className="size-7 text-slate-400 twinkle" />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 md:gap-6">
          <div className="flex flex-col items-center text-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="size-16 md:size-20 rounded-2xl grid place-items-center glass-tab tilt-hover glow-ring cursor-pointer transition active:scale-95 relative pressable">
                  <span aria-hidden className="press-ring" />
                  <Trophy className="size-8 md:size-10 text-emerald-500" />
                </div>
              </TooltipTrigger>
              <TooltipContent className="px-3 py-2 text-xs max-w-[220px]">Ranks show your overall progress this season. Higher ranks unlock status.</TooltipContent>
            </Tooltip>
            <p className="mt-2 text-xs md:text-sm text-slate-600 dark:text-slate-400">More points push you up ranks.</p>
            <p className="mt-1 text-sm md:text-base font-medium">Ranks</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="size-16 md:size-20 rounded-2xl grid place-items-center glass-tab tilt-hover glow-ring cursor-pointer transition active:scale-95 relative pressable">
                  <span aria-hidden className="press-ring" />
                  <Medal className="size-8 md:size-10 text-emerald-500" />
                </div>
              </TooltipTrigger>
              <TooltipContent className="px-3 py-2 text-xs max-w-[220px]">Badges are mini-achievements. Complete clear goals to collect them.</TooltipContent>
            </Tooltip>
            <p className="mt-2 text-xs md:text-sm text-slate-600 dark:text-slate-400">Finish mini-goals to collect badges.</p>
            <p className="mt-1 text-sm md:text-base font-medium">Badges</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="size-16 md:size-20 rounded-2xl grid place-items-center glass-tab tilt-hover glow-ring cursor-pointer transition active:scale-95 relative pressable">
                  <span aria-hidden className="press-ring" />
                  <Crown className="size-8 md:size-10 text-emerald-500" />
                </div>
              </TooltipTrigger>
              <TooltipContent className="px-3 py-2 text-xs max-w-[220px]">Perks can include visuals, special access, or future drop eligibility.</TooltipContent>
            </Tooltip>
            <p className="mt-2 text-xs md:text-sm text-slate-600 dark:text-slate-400">Unlock fun extras and perks.</p>
            <p className="mt-1 text-sm md:text-base font-medium">Perks</p>
          </div>
        </div>

        <p className="mt-6 text-center text-slate-600 dark:text-slate-400 text-sm md:text-base">
          Do things on Peridot. Earn Points. Get awesome rewards.
        </p>
      </section>

      {/* Section 3: How to Play (Quick Start) */}
      <section className="relative glass-card rounded-2xl p-6 md:p-8 reveal-cascade overflow-hidden" style={{ ['--i' as any]: 2 }}>
        <div className="flex items-center justify-between">
          <h3 className="text-xl md:text-2xl font-bold">How to Play</h3>
          <span className="text-xs text-slate-500">Swipe →</span>
        </div>
        {/* Edge fades */}
        <div aria-hidden className="pointer-events-none absolute inset-y-6 left-0 w-10 bg-gradient-to-r from-white/70 dark:from-black/40 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-y-6 right-0 w-10 bg-gradient-to-l from-white/70 dark:from-black/40 to-transparent" />
        <div className="mt-4 -mx-3 overflow-x-auto px-3 py-2 how-strip">
          <ul className="flex gap-2 md:gap-3 snap-x snap-mandatory">
            <StripPill icon={<Wallet className="size-6 text-emerald-500" />} title="Connect" text="Open your wallet to start." />
            <Connector />
            <StripPill icon={<HandCoins className="size-6 text-emerald-500" />} title="Do" text="Supply, borrow, repay, redeem." />
            <Connector />
            <StripPill icon={<Gem className="size-6 text-emerald-500" />} title="Points" text="Actions give you points." />
            <Connector />
            <StripPill icon={<Trophy className="size-6 text-emerald-500" />} title="Rewards" text="Rank up and unlock perks." />
          </ul>
        </div>
        <style jsx>{`
          .how-strip { scrollbar-width: thin; scrollbar-color: rgba(16,185,129,0.85) transparent; }
          .how-strip::-webkit-scrollbar { height: 4px; }
          .how-strip::-webkit-scrollbar-track { background: transparent; }
          .how-strip::-webkit-scrollbar-thumb {
            background: linear-gradient(90deg, rgba(16,185,129,0.95), rgba(99,102,241,0.95));
            border-radius: 999px;
            box-shadow: 0 0 10px rgba(16,185,129,0.7), 0 0 16px rgba(99,102,241,0.6);
          }
          .how-strip::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(90deg, rgba(16,185,129,1), rgba(99,102,241,1));
            box-shadow: 0 0 12px rgba(16,185,129,0.9), 0 0 20px rgba(99,102,241,0.8);
          }
        `}</style>
      </section>

      {/* Section 4: What counts? (Compact legend) */}
      <section className="relative glass-card rounded-2xl p-6 md:p-8 reveal-cascade" style={{ ['--i' as any]: 3 }}>
        <h3 className="text-xl md:text-2xl font-bold">What counts?</h3>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm md:text-base">
          <Pill label="Supply" value={`+${base.supply}`} />
          <Pill label="Borrow" value={`+${base.borrow}`} />
          <Pill label="Repay" value={`+${base.repay}`} />
          <Pill label="Withdraw" value={`+${base.redeem}`} />
          <Pill label="Daily login" value={`+${dailyLoginPts}`}/>
        </div>
        {policy.usdBonusThresholds && policy.usdBonusThresholds.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs md:text-sm text-slate-700 dark:text-slate-300">The longer you hold, the more points you earn—more than from moving funds.</p>
            <Collapsible>
              <CollapsibleTrigger asChild>
                <button type="button" className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30 px-3 py-2 text-left flex items-center justify-between group">
                  <span className="text-xs md:text-sm text-slate-700 dark:text-slate-300">Bigger transactions add bonus Points</span>
                  <ChevronDown className="size-4 text-slate-500 transition-transform group-data-[state=open]:rotate-180" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <ul className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {policy.usdBonusThresholds.map((tier) => (
                    <li key={tier.minUsd} className="rounded-full px-3 py-1 glass text-[11px] md:text-xs flex items-center justify-between">
                      <span>≥ ${tier.minUsd.toLocaleString()}</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400">+{tier.add}</span>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </section>

      {/* Section 5: Where rewards appear */}
      <section className="relative glass-card rounded-2xl p-6 md:p-8 reveal-cascade" style={{ ['--i' as any]: 4 }}>
        <h3 className="text-xl md:text-2xl font-bold">Where rewards appear</h3>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MiniCard icon={<Layout className="size-5 md:size-6 text-emerald-500" />} title="Profile card" text="Badges, borders, and emojis decorate your profile." />
          <MiniCard icon={<Eye className="size-5 md:size-6 text-emerald-500" />} title="Leaderboard row" text="Flex your look and rank on the board." />
        </div>
      </section>

      {/* Section 6: Seasons & fairness */}
      <section className="relative glass-card rounded-2xl p-6 md:p-8 reveal-cascade" style={{ ['--i' as any]: 5 }}>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center gap-3">
              <Calendar className="size-6 text-emerald-500" />
              <h3 className="text-lg md:text-xl font-semibold">Seasons</h3>
            </div>
            <p className="mt-2 text-sm md:text-base text-slate-600 dark:text-slate-400">
              Play in themed time windows. Rankings refresh each season. Some rewards can be seasonal.
            </p>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-6 text-emerald-500" />
              <h3 className="text-lg md:text-xl font-semibold">Fair play</h3>
            </div>
            <p className="mt-2 text-sm md:text-base text-slate-600 dark:text-slate-400">
              Real activity only. Spam and abuse don’t count. Some actions may require verification.
            </p>
          </div>
        </div>
      </section>

      {/* Section 7: Learn more */}
      <section className="relative glass-card rounded-2xl p-6 md:p-8 text-center reveal-cascade" style={{ ['--i' as any]: 6 }}>
        <div className="inline-flex items-center gap-2 text-sm md:text-base text-slate-700 dark:text-slate-300">
          <BookOpen className="size-5 text-emerald-500" />
          <span>Want details?</span>
          <Link href="/whitepaper" className="underline decoration-emerald-500/50 underline-offset-4">Read the Docs</Link>
        </div>
      </section>

      {/* Section 8: Ranking Tiers (vertical energy spine with progress fill, no emoji animation) */}
      {tiersAsc.length > 0 && (
        <section className="relative glass-card rounded-2xl p-6 md:p-8 overflow-hidden reveal-cascade" style={{ ['--i' as any]: 7 }}>
          <div className="flex items-center justify-between">
            <h3 className="text-xl md:text-2xl font-bold">Rank Path</h3>
            <span className="text-xs md:text-sm text-slate-500">Follow the energy ↑</span>
          </div>
          {/* Ambient blobs and noise */}
          <div aria-hidden className="blob blob-1" />
          <div aria-hidden className="blob blob-2" />
          <div aria-hidden className="blob blob-3" />
          <div aria-hidden className="noise" />

          <div className="relative mt-5">
            {/* Energy spine with tooltip */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div aria-hidden className="absolute left-7 md:left-9 top-0 bottom-0 w-[3px] md:w-[4px] rounded-full bg-gradient-to-b from-emerald-400/40 via-emerald-400/30 to-indigo-400/30 glow-spine" />
              </TooltipTrigger>
              <TooltipContent className="px-3 py-2 text-xs max-w-[240px]">This line fills as you earn points. Reach the next node to rank up.</TooltipContent>
            </Tooltip>
            <div aria-hidden className="absolute left-7 md:left-9 bottom-0 w-[3px] md:w-[4px] rounded-full bg-gradient-to-b from-emerald-400 via-emerald-400 to-indigo-400 glow-spine" style={{ height: `${tierProgress}%` }} />
            <ul className="relative z-10 space-y-5 md:space-y-6 pl-16 md:pl-20">
              {tiersAsc.map((tier, index) => (
                <li key={tier.level} className="group flex items-start gap-3 md:gap-4">
                  <div className="relative">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="spine-node tilt-hover glow-ring pressable h-10 w-10 md:h-12 md:w-12 rounded-full glass-tab grid place-items-center">
                          <span aria-hidden className="press-ring" />
                          <span aria-hidden className="text-lg md:text-xl">{tier.emoji || '🎖️'}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="px-3 py-2 text-xs max-w-[240px]">{tier.level}: needs ≥ {tier.minPoints.toLocaleString()} points.<br />See badge achievementes below </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm md:text-base font-semibold leading-tight">{tier.level}</div>
                    <div className="text-[11px] md:text-xs text-slate-600 dark:text-slate-400 font-mono">{tier.minPoints.toLocaleString()}+ pts</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <style jsx>{`
            .glow-spine { box-shadow: 0 0 12px rgba(16,185,129,0.35), 0 0 28px rgba(99,102,241,0.25); }
            .spine-node { position: relative; }
          `}</style>
        </section>
      )}
      </div>
    </TooltipProvider>
  )
}

export default memo(HowItWorksComic)

function Row({ label, value, subtle }: { label: string; value: string; subtle?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between rounded-lg px-3 py-2', subtle ? 'opacity-75' : 'glass')}>
      <span className="font-medium">{label}</span>
      <span className="font-mono text-emerald-600 dark:text-emerald-400">{value}</span>
    </div>
  )
}

function Step({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="glass rounded-lg p-3 md:p-4 flex items-center gap-3">
      <div className="inline-flex items-center justify-center h-8 w-8 rounded-lg glass" aria-hidden>
        {icon}
      </div>
      <span className="text-sm md:text-base font-medium">{label}</span>
    </div>
  )
}


// Subtle CSS-only cascade reveal for sections
// Each section sets --i (1..n) to stagger the entrance slightly
// Reduced to opacity/translate for low cognitive motion
<style jsx global>{`
  .reveal-cascade { opacity: 0; transform: translateY(-6px); animation: rcFade 360ms ease forwards; animation-delay: calc(var(--i, 1) * 70ms); }
  @keyframes rcFade { to { opacity: 1; transform: translateY(0); } }
`}</style>

function BadgeCard({ title, points }: { title: string; points: number }) {
  return (
    <div className="glass rounded-lg p-3 md:p-4 flex items-center justify-between">
      <div className="flex items-center gap-2 md:gap-3">
        <Medal className="size-5 md:size-6 text-emerald-500" />
        <span className="font-medium">{title}</span>
      </div>
      <span className="font-mono text-emerald-600 dark:text-emerald-400">+{points} 💎</span>
    </div>
  )
}

// default export moved to memoized version at bottom

function RewardCard({ icon, title, description, footer }: { icon: React.ReactNode; title: string; description: string; footer?: React.ReactNode }) {
  return (
    <div className="glass rounded-lg p-3 md:p-4">
      <div className="flex items-center gap-2 md:gap-3">
        <div className="inline-flex items-center justify-center h-8 w-8 rounded-lg glass" aria-hidden>
          {icon}
        </div>
        <span className="font-medium">{title}</span>
      </div>
      <p className="mt-2 text-xs md:text-sm text-slate-600 dark:text-slate-400">{description}</p>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  )
}
