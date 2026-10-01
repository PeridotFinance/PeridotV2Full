"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatUsd(value: number, opts?: { compact?: boolean }): string {
  if (!Number.isFinite(value)) return "—"
  const compact = opts?.compact ?? true
  if (compact && Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (compact && Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
}

export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "—"
  return value.toLocaleString("en-US")
}

export function formatMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })
}

// ─── Count-up number ──────────────────────────────────────────────────────────
//
// The playful part of the dataroom: every headline figure counts up once, when
// it first scrolls into view. `prefers-reduced-motion` skips straight to the
// final value — the number is the point, the animation is decoration.

export function AnimatedNumber({
  value,
  format = formatCount,
  className,
  durationMs = 900,
}: {
  value: number
  format?: (v: number) => string
  className?: string
  durationMs?: number
}) {
  const [display, setDisplay] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    // A changed target (network toggle) re-arms the count-up.
    started.current = false

    const run = () => {
      if (started.current) return
      started.current = true
      if (reduced) {
        setDisplay(value)
        return
      }
      const from = 0
      const start = performance.now()
      let frame = 0
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs)
        // easeOutExpo — fast start, soft landing on the real figure
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
        setDisplay(from + (value - from) * eased)
        if (t < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(frame)
    }

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && run()),
      { threshold: 0.4 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [value, durationMs])

  return (
    <span ref={ref} className={className}>
      {format(display)}
    </span>
  )
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—"
  return `${value.toFixed(digits)}%`
}

// ─── Period-over-period delta ─────────────────────────────────────────────────
//
// A number without a direction is the most common dataroom mistake — an
// investor reads level, but decides on trend. Direction is carried by the
// arrow glyph as well as the color, so it survives a colorblind reader and a
// black-and-white print of the page.

export function Delta({
  current,
  previous,
  label,
}: {
  current: number
  previous: number
  label?: string
}) {
  // No prior period to compare against: say so instead of printing a fake
  // +100% for every metric that simply started existing.
  if (!Number.isFinite(previous) || previous <= 0) {
    return (
      <span className="text-xs text-foreground/40">
        {current > 0 ? "first period" : "no data"}
        {label && ` · ${label}`}
      </span>
    )
  }

  const change = ((current - previous) / previous) * 100
  const flat = Math.abs(change) < 0.5
  const up = change > 0

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs tabular-nums",
        flat
          ? "text-foreground/50"
          : up
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-600 dark:text-red-400"
      )}
    >
      <span aria-hidden>{flat ? "→" : up ? "↑" : "↓"}</span>
      <span className="sr-only">{flat ? "flat" : up ? "up" : "down"}</span>
      {flat ? "flat" : `${Math.abs(change).toFixed(change >= 100 ? 0 : 1)}%`}
      {label && <span className="text-foreground/40">{label}</span>}
    </span>
  )
}

// ─── Stat tile ────────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  sub,
  delta,
  accent,
  loading,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  delta?: React.ReactNode
  accent?: boolean
  loading?: boolean
}) {
  return (
    <div
      className={cn(
        "group relative rounded-2xl border border-foreground/[0.07] bg-background p-5",
        "transition-colors duration-300 hover:border-foreground/20"
      )}
    >
      {accent && (
        <span
          aria-hidden
          className="absolute left-5 top-0 h-px w-10 bg-[var(--dataroom-accent)] opacity-70"
        />
      )}
      <div className="text-[11px] uppercase tracking-widest text-foreground/45">{label}</div>
      <div className="mt-3 font-mono text-2xl md:text-3xl tracking-tight tabular-nums">
        {loading ? <span className="inline-block h-7 w-24 animate-pulse rounded bg-foreground/10" /> : value}
      </div>
      {(sub || delta) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground/50">
          {delta}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </div>
  )
}

// ─── Segmented control ────────────────────────────────────────────────────────

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T
  options: { id: T; label: string; hint?: string }[]
  // Call sites pass the union explicitly (`<Segmented<Range> …>`): with the
  // project's strict mode off, the option literals widen `T` to `string` and a
  // typed `setState` handler stops being assignable here.
  onChange: (v: T) => void
  size?: "sm" | "md"
}) {
  return (
    <div className="inline-flex rounded-full border border-foreground/[0.08] bg-background p-1">
      {options.map((opt) => {
        const active = opt.id === value
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            title={opt.hint}
            aria-pressed={active}
            className={cn(
              "rounded-full transition-[color,background-color] duration-200",
              size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm",
              active
                ? "bg-foreground text-background"
                : "text-foreground/55 hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Ranked bar list ──────────────────────────────────────────────────────────
//
// Magnitude ranking → one hue, no categorical colors. Every row is directly
// labeled, so the bar carries no information the text doesn't also carry.

export function BarList({
  rows,
  format = formatUsd,
  empty = "No data",
}: {
  rows: { label: string; value: number; hint?: string }[]
  format?: (v: number) => string
  empty?: string
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0)
  if (!rows.length) return <div className="text-sm text-foreground/40">{empty}</div>
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.label} className="group">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-foreground/80">{row.label}</span>
            <span className="font-mono text-xs tabular-nums text-foreground/60">
              {format(row.value)}
              {row.hint && <span className="ml-2 text-foreground/35">{row.hint}</span>}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
            <div
              className="h-full rounded-full bg-[var(--dataroom-accent)] transition-[width] duration-700 ease-out group-hover:opacity-80"
              style={{ width: max > 0 ? `${Math.max(2, (row.value / max) * 100)}%` : "0%" }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Funnel ───────────────────────────────────────────────────────────────────
//
// Magnitude down a fixed sequence of stages → one hue, bar width relative to
// the top stage. The number between two stages is the point of the whole
// section: an investor reads the drop-off, not the absolute counts.

export function FunnelStages({
  stages,
}: {
  stages: { label: string; value: number; hint?: string }[]
}) {
  const rows = stages.filter((s) => Number.isFinite(s.value))
  const top = rows[0]?.value ?? 0
  if (rows.length < 2 || top <= 0) {
    return <div className="text-sm text-foreground/40">Not enough data for a funnel yet</div>
  }

  return (
    <div>
      {rows.map((stage, i) => {
        const prev = i > 0 ? rows[i - 1].value : null
        // A stage larger than the one above it means the two are not really in
        // sequence (e.g. subscribers who never visited on a tracked page).
        // Show the ratio anyway but never draw a bar wider than the top.
        const conversion = prev && prev > 0 ? (stage.value / prev) * 100 : null
        const width = top > 0 ? Math.min(100, (stage.value / top) * 100) : 0

        return (
          <div key={stage.label}>
            {conversion !== null && (
              <div className="flex items-center gap-3 py-2 pl-1">
                <span className="text-foreground/25" aria-hidden>
                  ↓
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-mono text-[11px] tabular-nums",
                    conversion >= 100
                      ? "border-foreground/10 text-foreground/45"
                      : "border-foreground/15 text-foreground/70"
                  )}
                >
                  {conversion >= 10 ? conversion.toFixed(0) : conversion.toFixed(1)}%
                </span>
                <span className="text-[11px] text-foreground/40">
                  {conversion >= 100 ? "no drop-off measured" : "continue to the next step"}
                </span>
              </div>
            )}

            <div className="group rounded-xl border border-foreground/[0.07] px-4 py-3 transition-colors hover:border-foreground/20">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm text-foreground/85">{stage.label}</span>
                <span className="font-mono text-sm tabular-nums">{formatCount(stage.value)}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
                <div
                  className="h-full rounded-full bg-[var(--dataroom-accent)] transition-[width] duration-700 ease-out"
                  style={{ width: `${Math.max(1.5, width)}%` }}
                />
              </div>
              {stage.hint && (
                <div className="mt-1.5 text-[11px] text-foreground/40">{stage.hint}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

export function SectionHeader({
  title,
  description,
  right,
}: {
  title: string
  description?: string
  right?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-xs text-foreground/50">{description}</p>}
      </div>
      {right}
    </div>
  )
}
