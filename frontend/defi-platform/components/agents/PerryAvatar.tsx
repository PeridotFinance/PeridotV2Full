'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export type PerryState = 'idle' | 'thinking' | 'happy' | 'alert'
export type PerrySize = 'sm' | 'md' | 'lg'

// URL-encoded paths so the browser doesn't have to re-encode every render.
const SVG_BY_STATE: Record<PerryState, string> = {
  idle: '/Owl%20Mascot%20-%20Mint%20Green.svg',
  thinking: '/Owl%20Mascot%20-%20Mint%20Green.svg',
  happy: '/Owl%20Mascot%20-%20Colored.svg',
  alert: '/Owl%20Mascot%20-%20Colored.svg',
}

const ALT_BY_STATE: Record<PerryState, string> = {
  idle: 'Perry',
  thinking: 'Perry is thinking',
  happy: 'Perry',
  alert: 'Perry has a heads-up',
}

const SIZE_WRAPPER: Record<PerrySize, string> = {
  sm: 'w-8 h-8 rounded-2xl',
  md: 'w-10 h-10 rounded-2xl',
  lg: 'w-20 h-20 rounded-3xl shadow-lg shadow-primary/5',
}

interface PerryAvatarProps {
  state?: PerryState
  size?: PerrySize
  className?: string
}

export function PerryAvatar({
  state = 'idle',
  size = 'sm',
  className,
}: PerryAvatarProps) {
  const wrapperClass = cn(
    'relative shrink-0 flex items-center justify-center overflow-hidden border bg-gradient-to-br',
    state === 'alert'
      ? 'from-destructive/15 to-destructive/5 border-destructive/20'
      : 'from-primary/20 via-primary/10 to-primary/5 border-primary/15',
    SIZE_WRAPPER[size],
    className,
  )

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SVG_BY_STATE[state]}
      alt={ALT_BY_STATE[state]}
      className="w-[78%] h-[78%] object-contain"
      draggable={false}
    />
  )

  if (state === 'thinking') {
    return (
      <motion.div
        className={wrapperClass}
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        {img}
      </motion.div>
    )
  }

  return <div className={wrapperClass}>{img}</div>
}
