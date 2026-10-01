'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function StripPill({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <li className="snap-center shrink-0 min-w-[220px] md:min-w-[260px]">
      <button type="button" className="w-full liquid-pill glass-tab glow-ring pressable text-left px-4 py-3 rounded-full transition active:scale-95 hover:scale-[1.03] will-change-transform">
        <span aria-hidden className="press-ring" />
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full glass">{icon}</span>
          <div className="min-w-0">
            <div className="text-sm md:text-base font-semibold leading-tight">{title}</div>
            <div className="text-[11px] md:text-xs text-slate-600 dark:text-slate-400 leading-snug truncate">{text}</div>
          </div>
        </div>
      </button>
    </li>
  )
}

export function Connector() {
  return (
    <li className="snap-center shrink-0 w-6 md:w-8 grid place-items-center" aria-hidden>
      <div className="w-full h-[2px] rounded-full bg-gradient-to-r from-emerald-400/30 via-emerald-400/60 to-indigo-400/30 relative overflow-hidden">
        <span className="absolute inset-0 shimmer" />
      </div>
      <style jsx>{`
        .shimmer { background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent); animation: shimmer 2.6s ease-in-out infinite; transform: translateX(-100%); }
        @keyframes shimmer { 0% { transform: translateX(-100%);} 50% { transform: translateX(0%);} 100% { transform: translateX(100%);} }
      `}</style>
    </li>
  )
}

export function Pill({ label, value, subtle }: { label: string; value: string; subtle?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between rounded-full px-3 py-2 text-sm md:text-base', subtle ? 'opacity-80 glass' : 'glass-tab')}>
      <span className="font-medium">{label}</span>
      <span className="font-mono text-emerald-600 dark:text-emerald-400">{value}</span>
    </div>
  )
}

export function MiniCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="glass rounded-lg p-4 flex items-start gap-3">
      <div className="inline-flex items-center justify-center h-9 w-9 rounded-lg glass shrink-0" aria-hidden>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-medium leading-tight">{title}</div>
        <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400 mt-1 leading-snug break-words">{text}</p>
      </div>
    </div>
  )
}


