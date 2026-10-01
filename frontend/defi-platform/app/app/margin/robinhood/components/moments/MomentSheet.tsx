'use client'

/**
 * The shell every result moment on the Robinhood page is shown in, plus the
 * three small pieces the moments share (burst, count-up, points chip).
 *
 * Phone first: below `sm` it is a bottom sheet in thumb reach that you swipe
 * down to dismiss, padded for the home indicator. From `sm` up the same
 * content is a centred card. It dismisses on the backdrop, on Escape, on the
 * X and, when asked to, on its own after `autoDismissMs`; the thin bar at the
 * bottom shows that time running out and stops for good the moment the user
 * touches the sheet (they are reading it now).
 *
 * It sits above the site header (z-[100]) and the support button, so the
 * backdrop dims the whole screen.
 *
 * Motion carries information only and stays short. With
 * prefers-reduced-motion the sheet fades, numbers land without counting and
 * nothing bursts.
 */
import { useEffect, useRef, useState } from 'react'
import { animate, motion, useDragControls, usePresence, useReducedMotion, type TargetAndTransition } from 'framer-motion'
import { Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WinTier } from '@/lib/robinhood/moments'
import { formatUsdNumber } from '../../lib/format'

export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return phone
}

/** navigator.vibrate where it exists (Android); iOS Safari has none and gets nothing. */
export function haptic(pattern: readonly number[]): void {
  try {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    navigator.vibrate?.([...pattern])
  } catch {
    /* unsupported */
  }
}

/** How long leaving takes: the wrapper's fade and the card's move. */
const LEAVE_MS = 220

export type MomentAccent = 'long' | 'short' | 'win' | 'loss' | 'flat'

const ACCENT_BAR: Record<MomentAccent, string> = {
  long: 'bg-emerald-400',
  short: 'bg-red-400',
  win: 'bg-emerald-400',
  loss: 'bg-foreground/40',
  flat: 'bg-foreground/40',
}

interface SheetProps {
  onDismiss: () => void
  accent: MomentAccent
  labelledBy: string
  autoDismissMs?: number
  children: React.ReactNode
  /** Rendered outside the card's clipping, anchored to its top centre. */
  burst?: React.ReactNode
}

export function MomentSheet({ onDismiss, accent, labelledBy, autoDismissMs, children, burst }: SheetProps) {
  const reduce = useReducedMotion()
  const phone = useIsPhone()
  const [held, setHeld] = useState(false)
  const [hover, setHover] = useState(false)

  // Leaving without a flash. Framer runs opacity on the browser's Web
  // Animations API, and when such an animation ends the element shows its
  // underlying opacity (1) for a frame before the end value is committed:
  // the card and backdrop blinked back at full strength just before removal
  // (measured on phone and desktop, transforms were unaffected). So leaving
  // fades the wrapper with a plain CSS transition, which simply stays at 0,
  // and framer only moves the card. The sheet holds its own removal
  // (usePresence) and releases it when the fade has ended, hidden first; a
  // timer releases it anyway should the transition event never come.
  const [isPresent, safeToRemove] = usePresence()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const released = useRef(false)
  const release = () => {
    if (released.current) return
    released.current = true
    if (wrapperRef.current) wrapperRef.current.style.visibility = 'hidden'
    safeToRemove?.()
  }
  useEffect(() => {
    if (isPresent) return
    const t = setTimeout(release, LEAVE_MS + 150)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent])
  // A swipe starts anywhere on the card except on a control. Letting a tap on
  // Done or X begin a drag session left that session holding the y value, so
  // the leaving slide never finished and the card stopped mid-screen.
  const dragControls = useDragControls()

  // The parent re-renders on every price tick; bind the key handler once.
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissRef.current()
    }
    window.addEventListener('keydown', onKey)
    // The page behind must not scroll under a thumb that is dragging the sheet.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [])

  const enter = reduce
    ? { opacity: 0 }
    : phone
      ? { y: '100%' }
      : { opacity: 0, scale: 0.92, y: 16 }
  const shown = { opacity: 1, scale: 1, y: 0 }
  // Leaving moves the card only (the wrapper does the fade, see above), as a
  // short tween rather than the entry spring, which spent its last frames
  // with part of the card still on screen.
  const leave = { duration: LEAVE_MS / 1000, ease: [0.4, 0, 1, 1] as const }
  const exitTo: TargetAndTransition = reduce
    ? { transition: { duration: 0 } }
    : phone
      ? { y: '40%', transition: leave }
      : { scale: 0.94, y: 12, transition: leave }

  return (
    <div
      ref={wrapperRef}
      className={cn(
        'fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:p-4',
        !isPresent && 'pointer-events-none opacity-0 transition-opacity ease-in',
      )}
      style={!isPresent ? { transitionDuration: `${LEAVE_MS}ms` } : undefined}
      onTransitionEnd={(e) => {
        if (!isPresent && e.target === e.currentTarget && e.propertyName === 'opacity') release()
      }}
      role="presentation"
    >
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onDismiss}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        initial={enter}
        animate={isPresent ? shown : exitTo}
        exit={exitTo}
        transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 420, damping: 36 }}
        drag={phone && !reduce ? 'y' : false}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragStart={() => setHeld(true)}
        onDragEnd={(_, info) => {
          if (info.offset.y > 90 || info.velocity.y > 600) onDismiss()
        }}
        onPointerDown={(e) => {
          setHeld(true)
          if (isPresent && !(e.target as HTMLElement).closest('button, a')) dragControls.start(e)
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={cn(
          'relative w-full border border-foreground/[0.08] bg-background shadow-2xl',
          'rounded-t-3xl px-5 pt-2.5 pb-[max(1.25rem,env(safe-area-inset-bottom))]',
          'sm:max-w-sm sm:rounded-3xl sm:px-6 sm:pt-6 sm:pb-6',
          phone && 'touch-none',
        )}
      >
        {burst && <div className="pointer-events-none absolute left-1/2 top-14 sm:top-16">{burst}</div>}
        {phone && <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-foreground/20" />}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close"
          className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full text-muted-foreground/60 transition-colors hover:bg-foreground/[0.08] hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
        {autoDismissMs && !held && (
          <div aria-hidden className="absolute inset-x-8 bottom-1.5 h-0.5 overflow-hidden rounded-full bg-foreground/[0.04] sm:bottom-2">
            <style>{'@keyframes rh-moment-drain{from{transform:scaleX(1)}to{transform:scaleX(0)}}'}</style>
            <div
              className={cn('h-full origin-left opacity-60', ACCENT_BAR[accent])}
              style={{
                animation: `rh-moment-drain ${autoDismissMs}ms linear forwards`,
                animationPlayState: hover ? 'paused' : 'running',
              }}
              onAnimationEnd={onDismiss}
            />
          </div>
        )}
      </motion.div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Burst
// ---------------------------------------------------------------------------

export type BurstLevel = 'open' | WinTier

// Deterministic "random" so server and client (and every replay) agree.
const rnd = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

function particles(count: number, spread: number, fall: number, wave: number) {
  return Array.from({ length: count }, (_, i) => {
    // Upper half, fanned: -170deg .. -10deg.
    const angle = ((-170 + rnd(i, 1 + wave) * 160) * Math.PI) / 180
    const dist = spread * (0.45 + rnd(i, 2 + wave) * 0.55)
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist
    return {
      dx,
      dy,
      fall: dy + fall * (0.6 + rnd(i, 3 + wave) * 0.6),
      rotate: (rnd(i, 4 + wave) - 0.5) * 720,
      size: 5 + Math.round(rnd(i, 5 + wave) * 4),
      round: rnd(i, 6 + wave) > 0.6,
      tone: Math.floor(rnd(i, 7 + wave) * 4),
      delay: wave * 0.35 + rnd(i, 8 + wave) * 0.12,
    }
  })
}

const LEVELS: Record<BurstLevel, { count: number; spread: number; fall: number; waves: number; duration: number }> = {
  open: { count: 14, spread: 110, fall: 40, waves: 1, duration: 0.9 },
  small: { count: 0, spread: 0, fall: 0, waves: 0, duration: 0 },
  medium: { count: 26, spread: 170, fall: 140, waves: 1, duration: 1.3 },
  big: { count: 30, spread: 230, fall: 260, waves: 2, duration: 1.7 },
}

const PALETTE = {
  long: ['bg-emerald-400', 'bg-emerald-300', 'bg-amber-300', 'bg-white'],
  short: ['bg-red-400', 'bg-rose-300', 'bg-amber-300', 'bg-white'],
  win: ['bg-emerald-400', 'bg-amber-300', 'bg-sky-300', 'bg-white'],
} as const

export function Burst({ level, palette }: { level: BurstLevel; palette: keyof typeof PALETTE }) {
  const reduce = useReducedMotion()
  if (reduce) return null
  const cfg = LEVELS[level]
  const colors = PALETTE[palette]

  // A small win gets a soft ring instead of confetti: acknowledged, not shouted.
  const ring = (
    <motion.span
      className={cn('absolute -left-10 -top-10 h-20 w-20 rounded-full border-2', palette === 'win' ? 'border-emerald-400/70' : palette === 'long' ? 'border-emerald-400/60' : 'border-red-400/60')}
      initial={{ scale: 0.4, opacity: 0.9 }}
      animate={{ scale: level === 'small' ? 2.2 : 1.8, opacity: 0 }}
      transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 }}
    />
  )

  const waves = Array.from({ length: cfg.waves }, (_, w) => particles(cfg.count, cfg.spread, cfg.fall, w))
  return (
    <div className="relative">
      {ring}
      {level === 'small' && (
        <motion.span
          className="absolute -left-12 -top-12 h-24 w-24 rounded-full bg-emerald-400/20 blur-xl"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1.4, opacity: [0, 1, 0] }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      )}
      {waves.flat().map((p, i) => (
        <motion.span
          key={i}
          className={cn('absolute', p.round ? 'rounded-full' : 'rounded-[2px]', colors[p.tone])}
          style={{ width: p.size, height: p.round ? p.size : p.size * 0.6, left: -p.size / 2, top: -p.size / 2 }}
          initial={{ x: 0, y: 0, opacity: 0, rotate: 0, scale: 0.4 }}
          animate={{
            x: [0, p.dx, p.dx * 1.15],
            y: [0, p.dy, p.fall],
            opacity: [0, 1, 1, 0],
            rotate: p.rotate,
            scale: [0.4, 1, 0.9],
          }}
          transition={{ duration: cfg.duration, delay: p.delay, ease: [0.2, 0.7, 0.4, 1], times: [0, 0.35, 1] }}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Count-up
// ---------------------------------------------------------------------------

/** Money that counts up from zero on arrival; lands instantly when `run` is false. */
export function CountUpUsd({ value, run, signed, duration = 0.9, className }: {
  value: number
  run: boolean
  signed?: boolean
  duration?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const fmt = (v: number) => `${signed && v > 0 ? '+' : ''}${formatUsdNumber(v)}`
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!run || reduce) {
      el.textContent = fmt(value)
      return
    }
    const c = animate(0, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => { el.textContent = fmt(v) } })
    return () => c.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, run, reduce])
  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {run && !reduce ? fmt(0) : fmt(value)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Points chip
// ---------------------------------------------------------------------------

export type PointsState =
  | { status: 'pending' }
  | { status: 'awarded'; points: number; note?: string }
  | { status: 'hidden' }

/**
 * The leaderboard's answer, never a guess: a quiet placeholder while the
 * server books it, the booked number when it lands, an explanation when a
 * close earned nothing (held under the minimum), and nothing on failure.
 */
export function PointsChip({ state, kind }: { state: PointsState; kind: 'open' | 'close' }) {
  if (state.status === 'hidden') return null
  if (state.status === 'pending') {
    return (
      <div className="flex h-8 items-center justify-center">
        <span className="h-6 w-28 animate-pulse rounded-full bg-foreground/[0.06]" aria-hidden />
      </div>
    )
  }
  if (state.points <= 0) {
    if (kind === 'open' || !state.note) return null
    return (
      <p className="text-center text-[11px] text-muted-foreground/70">
        {state.note === 'held less than the minimum' ? 'No points this time: hold at least an hour to earn them.' : 'No points for this one.'}
      </p>
    )
  }
  return (
    <div className="flex h-8 items-center justify-center">
      <motion.span
        initial={{ scale: 0.3, opacity: 0, y: 8 }}
        animate={{ scale: [0.3, 1.15, 1], opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-600 dark:text-amber-400"
      >
        <Sparkles className="h-3.5 w-3.5" />+{state.points} {state.points === 1 ? 'point' : 'points'}
        {kind === 'close' && <span className="font-medium text-amber-600 dark:text-amber-400">for holding</span>}
      </motion.span>
    </div>
  )
}
