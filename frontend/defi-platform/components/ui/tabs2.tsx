'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

type Tabs2Context = {
  value: string
  setValue: (v: string) => void
  size: 'sm' | 'md' | 'lg'
}

const Tabs2Ctx = React.createContext<Tabs2Context | null>(null)

type RootProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Tabs2({ value, defaultValue, onValueChange, children, size = 'md', className }: RootProps) {
  const [internal, setInternal] = React.useState<string>(defaultValue ?? '')
  const current = value ?? internal

  const ctx = React.useMemo<Tabs2Context>(() => ({
    value: current,
    size,
    setValue: (v) => { if (value === undefined) setInternal(v); onValueChange?.(v) },
  }), [current, size, value, onValueChange])

  return (
    <Tabs2Ctx.Provider value={ctx}>
      <div className={className}>{children}</div>
    </Tabs2Ctx.Provider>
  )
}

export const Tabs2List = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const ctx = React.useContext(Tabs2Ctx)!
    const radius = ctx.size === 'sm' ? 'rounded-xl' : 'rounded-2xl'
    const childArray = React.Children.toArray(children) as any[]
    const values = childArray.map((c) => c?.props?.value).filter(Boolean)
    const count = Math.max(1, values.length)
    const activeValue = ctx.value || values[0]
    const selectedIndex = Math.max(0, values.indexOf(activeValue))
    return (
        <div
        ref={ref}
        className={cn('grid w-full glass-radio-group', radius, className)}
        style={{ gridTemplateColumns: `repeat(${count}, minmax(0,1fr))` }}
        {...props}
      >
        {children}
        <div aria-hidden className="glass-glider" style={{ width: `calc(100% / ${count})`, transform: `translateX(${selectedIndex * 100}%)` }} />
        <style jsx>{`
          .glass-radio-group { --bg: rgba(255,255,255,0.06); --text:#e5e5e5; --hover:#c0c1c2; --active:#ffffff; position: relative; background: var(--bg); backdrop-filter: blur(12px); box-shadow: inset 1px 1px 4px rgba(255,255,255,0.2), inset -1px -1px 6px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.15); overflow: hidden; }
          :global(html:not(.dark)) .glass-radio-group { background: rgba(255,255,255,0.5); box-shadow: inset 0 0 0 1px rgba(0,0,0,0.06); --text:#0f172a; --hover:#334155; --active:#111827; }
          .glass-glider { position:absolute; top:0; bottom:0; left:0; border-radius: inherit; z-index:1; transition: transform 350ms cubic-bezier(0.37,1.95,0.66,0.56), background 300ms ease, box-shadow 300ms ease; background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(16,185,129,0.08)); box-shadow: 0 0 14px rgba(16,185,129,0.20), 0 0 8px rgba(255,255,255,0.18) inset; }
          :global(html:not(.dark)) .glass-glider { box-shadow: 0 0 10px rgba(16,185,129,0.18), 0 0 0 1px rgba(0,0,0,0.06) inset; }
        `}</style>
      </div>
    )
  }
)

export const Tabs2Trigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }>(
  ({ className, value, children, ...props }, ref) => {
    const ctx = React.useContext(Tabs2Ctx)!
    const selected = ctx.value === value
    const sizePad = ctx.size === 'sm' ? 'py-1.5 px-3 min-w-[64px]' : ctx.size === 'lg' ? 'py-3 px-6 min-w-[96px]' : 'py-2.5 px-5 min-w-[80px]'
    return (
      <button
        ref={ref}
        role="tab"
        aria-selected={selected}
        className={cn('tabs2-btn', sizePad, className)}
        onClick={() => ctx.setValue(value)}
        type="button"
        {...props}
      >
        {children}
        <style jsx>{`
          .tabs2-btn { flex:1 1 0%; min-width:0; display:inline-flex; align-items:center; justify-content:center; font-size:14px; cursor:pointer; font-weight:600; letter-spacing:0.3px; color: var(--text); position: relative; z-index: 2; transition: color .2s ease; user-select:none; background: transparent; }
          .tabs2-btn:hover { color: var(--hover); }
          .tabs2-btn[aria-selected='true'] { color: var(--active); }
        `}</style>
      </button>
    )
  }
)

export const Tabs2Content = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { value: string }>(
  ({ className, value, children, ...props }, ref) => {
    const ctx = React.useContext(Tabs2Ctx)!
    if (ctx.value !== value) return null
    return (
      <div ref={ref} className={cn('mt-2', className)} {...props}>{children}</div>
    )
  }
)

export default Tabs2

