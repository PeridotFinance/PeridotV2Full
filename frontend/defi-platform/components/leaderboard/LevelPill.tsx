'use client'

import Link from 'next/link'
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useTheme } from 'next-themes'
import { HeaderPill } from '@/components/ui/header-pill'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { useUserLevelPoints } from '@/hooks/use-user-level-points'
import { useChainTheme } from '@/components/providers/ChainThemeProvider'
import { defaultTheme } from '@/config/chain-themes'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { useEffect, useState, useRef } from 'react'
import { usePostHog } from 'posthog-js/react'

type Props = {
  className?: string
}

export function LevelPill({ className }: Props) {
  const posthog = usePostHog()
  // Fetch immediately - React Query handles caching and deduplication
  const { data, loading, isConnected } = useUserLevelPoints()
  const { theme, resolvedTheme } = useTheme()
  const { currentChainTheme } = useChainTheme()
  const prefersReducedMotion = useReducedMotion()
  const isDark = (resolvedTheme || theme) === 'dark'

  const peridotPrimary = isDark ? defaultTheme.darkColors.primary : defaultTheme.colors.primary
  const activeChainPrimary = isDark ? currentChainTheme.darkColors.primary : currentChainTheme.colors.primary

  const gradientStyle = {
    backgroundImage: `linear-gradient(to right, hsl(${peridotPrimary}), hsl(${activeChainPrimary}))`,
    WebkitBackgroundClip: 'text' as const,
    backgroundClip: 'text' as const,
    color: 'transparent',
  }

  const progressPct = Math.round((data?.progress01 || 0) * 100)
  const [lastLevelIndex, setLastLevelIndex] = useState<number | null>(null)
  const [pulse, setPulse] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  // Sparkle triggered by the silent daily-login claim — replaces the old
  // full-screen popup. The DailyLoginGateway dispatches the window event after
  // the API confirms the bonus was awarded.
  const [sparkle, setSparkle] = useState(false)

  useEffect(() => {
    if (prefersReducedMotion) return
    const onAwarded = () => {
      setSparkle(true)
      setTimeout(() => setSparkle(false), 2400)
    }
    window.addEventListener('peridot:daily-login-awarded', onAwarded as EventListener)
    return () => window.removeEventListener('peridot:daily-login-awarded', onAwarded as EventListener)
  }, [prefersReducedMotion])
  const closeTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)

  // Parallax hover
  const mvX = useMotionValue(0)
  const mvY = useMotionValue(0)
  const springX = useSpring(mvX, { stiffness: 120, damping: 18 })
  const springY = useSpring(mvY, { stiffness: 120, damping: 18 })

  useEffect(() => {
    if (typeof data?.levelIndex === 'number') {
      if (lastLevelIndex !== null && data.levelIndex > lastLevelIndex && !prefersReducedMotion) {
        setPulse(true)
        const t = setTimeout(() => setPulse(false), 900)
        return () => clearTimeout(t)
      }
      setLastLevelIndex(data.levelIndex)
    }
  }, [data?.levelIndex, lastLevelIndex, prefersReducedMotion])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

  // Shine animation keyframes via inline style
  const shineStyle = prefersReducedMotion ? {} : {
    background: 'linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.15) 20%, transparent 40%)',
    animation: 'pillShine 3.2s ease-in-out infinite',
    maskImage: 'radial-gradient(16px 16px at 8px 50%, black 55%, transparent 60%)',
  } as React.CSSProperties

  return (
    <Popover modal={false} open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <HeaderPill
            variant="level"
            className={className}
            onClick={() => {
              if (FEATURE_FLAGS.HEADER_LEVEL_PILL) {
                posthog?.capture('header_level_pill_click')
              }
            }}
            onMouseEnter={() => {
              if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current)
              }
              setIsOpen(true)
            }}
            onMouseMove={(e) => {
              if (prefersReducedMotion) return
              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
              const dx = (e.clientX - rect.left) / rect.width - 0.5
              const dy = (e.clientY - rect.top) / rect.height - 0.5
              mvX.set(dx * 4)
              mvY.set(dy * 4)
            }}
            onMouseLeave={() => {
              // Close popover after delay
              closeTimeoutRef.current = setTimeout(() => setIsOpen(false), 200)
              // Reset parallax position
              mvX.set(0)
              mvY.set(0)
            }}
          >
            <motion.div
              className="flex items-center gap-2"
              style={{ x: springX, y: springY }}
            >
              <span
                className="text-xs font-semibold"
                style={isConnected ? gradientStyle : undefined}
                onMouseEnter={() => {
                  if (FEATURE_FLAGS.HEADER_LEVEL_PILL) {
                    posthog?.capture('header_level_pill_hover')
                  }
                }}
              >
                {!isConnected ? 'Points✨' : (loading && !data ? 'Lvl —' : `Lvl ${data?.levelIndex ?? '—'}`)}
              </span>
              {isConnected && (
                <span className="text-xs text-muted-foreground">
                  {(loading && !data) ? '…' : `${(data?.points ?? 0).toLocaleString()} pts`}
                </span>
              )}
            </motion.div>
          </HeaderPill>
          
          {/* Additional visual effects for LevelPill */}
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none"
            initial={false}
            animate={prefersReducedMotion ? {} : { opacity: 1, scale: pulse ? 1.02 : 1 }}
            transition={{ type: 'spring', stiffness: 160, damping: 14 }}
          />
          
          {/* Daily-login sparkle — silent reward signal, replaces the old popup.
              A small Sparkles icon fades + scales in at the top-right corner
              and quietly leaves after a couple of seconds. */}
          <AnimatePresence>
            {sparkle && (
              <motion.span
                key="daily-sparkle"
                aria-label="Daily login bonus awarded"
                title="Daily login bonus"
                className="pointer-events-none absolute -top-1.5 -right-1.5 flex items-center justify-center"
                initial={{ opacity: 0, scale: 0.4, rotate: -20 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: 'spring', stiffness: 220, damping: 14 }}
              >
                <span
                  className="absolute inset-0 rounded-full blur-md"
                  style={{ background: `hsla(${peridotPrimary}, 0.55)` }}
                />
                <Sparkles className="relative h-3.5 w-3.5 text-emerald-400 drop-shadow-[0_0_4px_rgba(16,185,129,0.6)]" strokeWidth={2.4} />
              </motion.span>
            )}
          </AnimatePresence>

          {/* Gradient aura on hover */}
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: `linear-gradient(90deg, hsla(${peridotPrimary},0.35), hsla(${activeChainPrimary},0.35))`,
              opacity: 0,
            }}
            initial={false}
            animate={prefersReducedMotion ? { opacity: 0 } : { opacity: 0.0 }}
            whileHover={prefersReducedMotion ? { opacity: 0 } : { opacity: 0.18 }}
          />
          
          {/* Micro progress underline */}
          <span aria-hidden className="absolute left-3 right-3 bottom-0.5 h-[2px] rounded-full overflow-hidden">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${!isConnected ? 0 : (loading && !data ? 30 : progressPct)}%`,
                background: `linear-gradient(90deg, hsla(${peridotPrimary},0.95), hsla(${activeChainPrimary},0.95))`,
                boxShadow: prefersReducedMotion ? undefined : '0 0 8px rgba(16,185,129,0.45)',
                transition: 'width 300ms ease',
              }}
            />
            {!prefersReducedMotion && (
              <span className="absolute inset-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)', animation: 'progressSweep 2.8s linear infinite' }} />
            )}
          </span>
        </div>
      </PopoverTrigger>
      <PopoverContent 
        align="center" 
        className="p-0 text-xs rounded-xl overflow-hidden w-64"
        onMouseEnter={() => {
          if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current)
          }
        }}
        onMouseLeave={() => {
          closeTimeoutRef.current = setTimeout(() => setIsOpen(false), 200)
        }}
      >
          {!isConnected ? (
            <div className="px-4 py-3">Connect wallet to view your level</div>
          ) : (loading && !data) ? (
            <div className="px-4 py-3">Loading level…</div>
          ) : data ? (
            <div className="w-64 bg-white/70 dark:bg-black/40 backdrop-blur-xl border border-white/10">
              <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-base">🏆</span>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Your tier</div>
                    <div className="text-sm font-semibold">{data.levelLabel}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Points</div>
                  <div className="text-sm font-mono">{data.points.toLocaleString()}</div>
                </div>
              </div>
              <div className="px-4 pb-3">
                {data.nextLevelAt ? (
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Progress to {data.nextLevelLabel}</span>
                      <span>{Math.round((data.progress01 || 0) * 100)}%</span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-foreground/10 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.round((data.progress01 || 0) * 100)}%`, background: `linear-gradient(90deg, hsla(${peridotPrimary},0.95), hsla(${activeChainPrimary},0.95))` }} />
                    </div>
                    <div className="mt-1.5 text-[11px] text-muted-foreground">
                      {(data.nextLevelAt - data.points).toLocaleString()} pts to {data.nextLevelLabel}
                    </div>
                  </div>
                ) : (
                  <div className="text-[12px]">Max level reached 🎉</div>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <a href="/app/leaderboard" className="text-[12px] underline decoration-emerald-500/40 underline-offset-4">Open leaderboard</a>
                  <a href="/app/howto" className="text-[12px] text-muted-foreground">How to earn</a>
                </div>
              </div>
            </div>
          ) : null}
      </PopoverContent>
    </Popover>
  )
}

export default LevelPill


