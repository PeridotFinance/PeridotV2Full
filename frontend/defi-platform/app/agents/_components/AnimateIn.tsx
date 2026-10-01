'use client'

import { useEffect, useRef, type ReactNode } from 'react'

interface AnimateInProps {
  children: ReactNode
  className?: string
  delay?: number
  type?: 'up' | 'up30' | 'left' | 'scale'
}

/**
 * Wraps children in an IntersectionObserver-driven scroll-fade.
 * Piggybacks on the existing globals.css pattern:
 *   .fade-in-up / .fade-in-up.visible  (etc.)
 */
export function AnimateIn({
  children,
  className = '',
  delay = 0,
  type = 'up',
}: AnimateInProps) {
  const ref = useRef<HTMLDivElement>(null)

  const typeClass = {
    up:    'fade-in-up',
    up30:  'fade-in-up-30',
    left:  'fade-in-left',
    scale: 'fade-in-scale',
  }[type]

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('visible')
          observer.disconnect()
        }
      },
      { threshold: 0.12 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`${typeClass} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}
