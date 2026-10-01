'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, TrendingUp, Wallet, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PerryAvatar } from '@/components/agents/PerryAvatar'
import { useApyData } from '@/hooks/use-apy-data'
import { useCrossChainBalances } from '@/hooks/use-cross-chain-balances'

// Small ease-out count-up — same curve PortfolioHero uses, kept local so the
// EmptyState has no cross-component dependency.
function useCountUp(target: number, duration = 900): number {
  const [displayed, setDisplayed] = useState(target)
  const prevRef = useRef(target)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = prevRef.current
    const to = target
    if (from === to) return
    const startTime = performance.now()
    function tick(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(from + (to - from) * eased)
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
      else prevRef.current = to
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration])

  return displayed
}

interface EmptyStateProps {
  onCardClick?: (text: string) => void
}

const STABLE_IDS = ['usdc', 'usdt']

function formatUsdCompact(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  if (v >= 1) return `$${v.toFixed(2)}`
  return `$${v.toFixed(4)}`
}

interface CardData {
  id: string
  label: string
  value: string
  prompt: string
  Icon: typeof TrendingUp
  isLoading: boolean
  highlight?: boolean
}

export function EmptyState({ onCardClick }: EmptyStateProps) {
  const { bestApyPerAsset, isLoading: apyLoading } = useApyData()
  const { totalSupplied, isLoading: balLoading } = useCrossChainBalances()
  const animatedSupplied = useCountUp(totalSupplied, 900)

  const cards = useMemo<CardData[]>(() => {
    const bestUsd = Math.max(
      bestApyPerAsset[STABLE_IDS[0]] ?? 0,
      bestApyPerAsset[STABLE_IDS[1]] ?? 0,
    )
    const hasPositions = totalSupplied > 0

    return [
      {
        id: 'best-rate',
        label: 'Best rate right now',
        value: apyLoading || bestUsd === 0 ? '—' : `USD earns ${bestUsd.toFixed(1)}%`,
        prompt: 'Show me where I can earn the most on my USD right now.',
        Icon: TrendingUp,
        isLoading: apyLoading,
        highlight: true,
      },
      {
        id: 'working',
        label: 'Your money working',
        value: balLoading
          ? '—'
          : hasPositions
            ? `${formatUsdCompact(animatedSupplied)} earning`
            : 'Nothing yet — let\'s start',
        prompt: hasPositions
          ? 'Give me a quick rundown of how my money is doing.'
          : 'Walk me through how I can put my money to work.',
        Icon: Wallet,
        isLoading: balLoading,
      },
      {
        id: 'safe',
        label: 'Park it safely',
        value: 'What if I just hold USD?',
        prompt: 'What happens if I just hold my USD without doing anything?',
        Icon: ShieldCheck,
        isLoading: false,
      },
    ]
  }, [bestApyPerAsset, apyLoading, totalSupplied, animatedSupplied, balLoading])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-10 px-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center gap-5 text-center"
      >
        {/* Peridot halo behind Perry — radial mint glow with a slow breath
            so the avatar feels lit by the same crystal field as the page
            background, without spinning up a second WebGL context. */}
        <div className="relative">
          <motion.div
            aria-hidden
            className="absolute inset-0 -m-16 rounded-full blur-2xl pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at center, rgba(98,193,94,0.22) 0%, rgba(98,193,94,0.08) 45%, transparent 75%)',
            }}
            animate={{ opacity: [0.7, 1, 0.7], scale: [0.96, 1.04, 0.96] }}
            transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <PerryAvatar state="happy" size="lg" className="relative" />
        </div>
        <div className="space-y-2 max-w-md">
          <h1 className="text-[2rem] md:text-[2.4rem] font-black tracking-tight leading-[1.05] text-slate-900 dark:text-white">
            Hi, I&apos;m Perry.
          </h1>
          <p className="text-base md:text-lg text-slate-500 dark:text-slate-400 font-medium">
            What should we do with your money today?
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md flex flex-col gap-3"
      >
        {cards.map((card, i) => (
          <motion.button
            key={card.id}
            type="button"
            onClick={() => onCardClick?.(card.prompt)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.4,
              delay: 0.18 + i * 0.06,
              ease: [0.22, 1, 0.36, 1],
            }}
            whileHover={{ y: -2 }}
            className={cn(
              'group flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all',
              'bg-white/85 dark:bg-white/[0.06] backdrop-blur-xl shadow-sm hover:shadow-md',
              'border',
              card.highlight
                ? 'border-emerald-500/30 hover:border-emerald-500/50'
                : 'border-black/[0.06] dark:border-white/10 hover:border-black/[0.12] dark:hover:border-white/20',
            )}
          >
            <div
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
                card.highlight
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-300',
              )}
            >
              <card.Icon className="w-4 h-4" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                {card.label}
              </div>
              <motion.div
                animate={
                  card.isLoading
                    ? { opacity: [0.4, 0.9, 0.4] }
                    : { opacity: 1 }
                }
                transition={
                  card.isLoading
                    ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                    : undefined
                }
                className={cn(
                  'text-[15px] font-bold tabular-nums leading-tight truncate',
                  card.isLoading
                    ? 'text-slate-300 dark:text-slate-600'
                    : card.highlight
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-900 dark:text-slate-100',
                )}
              >
                {card.value}
              </motion.div>
            </div>

            <ChevronRight className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all shrink-0" />
          </motion.button>
        ))}
      </motion.div>
    </div>
  )
}
