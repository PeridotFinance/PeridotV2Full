import type { ReactNode } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Info, AlertTriangle, Lightbulb } from "lucide-react"

/** Shared typographic building blocks for /docs content pages. Server-safe. */

export function Lead({ children }: { children: ReactNode }) {
  return <p className="text-lg text-muted-foreground leading-relaxed mb-8">{children}</p>
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-7 text-foreground/85 mb-4">{children}</p>
}

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-")
}

export function H2({ children, id }: { children: string; id?: string }) {
  const anchor = id ?? slugify(children)
  return (
    <h2 id={anchor} className="group scroll-mt-32 text-xl md:text-2xl font-semibold mt-12 mb-4">
      <a href={`#${anchor}`} className="no-underline">
        {children}
        <span className="ml-2 text-primary/50 opacity-0 group-hover:opacity-100 transition-opacity">#</span>
      </a>
    </h2>
  )
}

export function H3({ children, id }: { children: string; id?: string }) {
  return (
    <h3 id={id ?? slugify(children)} className="scroll-mt-32 text-base md:text-lg font-semibold mt-8 mb-3">
      {children}
    </h3>
  )
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="list-disc pl-5 space-y-2 mb-4 text-[15px] leading-7 text-foreground/85 marker:text-primary">{children}</ul>
}

export function OL({ children }: { children: ReactNode }) {
  return <ol className="list-decimal pl-5 space-y-2 mb-4 text-[15px] leading-7 text-foreground/85 marker:text-primary marker:font-medium">{children}</ol>
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[13px] px-1.5 py-0.5 rounded bg-muted text-foreground">{children}</code>
}

/**
 * Block formula, typeset in mono (deliberately no math-rendering dependency).
 * Pass one string per line.
 */
export function Formula({ lines, caption }: { lines: string[]; caption?: string }) {
  return (
    <figure className="my-6">
      <div className="rounded-xl border border-border/60 bg-muted/40 px-5 py-4 overflow-x-auto">
        <pre className="font-mono text-[13px] md:text-sm leading-7 text-foreground whitespace-pre">
          {lines.join("\n")}
        </pre>
      </div>
      {caption ? (
        <figcaption className="mt-2 text-xs text-muted-foreground">{caption}</figcaption>
      ) : null}
    </figure>
  )
}

const calloutStyles = {
  info: { icon: Info, cls: "border-primary/30 bg-primary/5", iconCls: "text-primary" },
  tip: { icon: Lightbulb, cls: "border-primary/30 bg-primary/5", iconCls: "text-primary" },
  warning: { icon: AlertTriangle, cls: "border-amber-500/40 bg-amber-500/10", iconCls: "text-amber-600 dark:text-amber-400" },
} as const

export function Callout({
  variant = "info",
  title,
  children,
}: {
  variant?: keyof typeof calloutStyles
  title?: string
  children: ReactNode
}) {
  const { icon: Icon, cls, iconCls } = calloutStyles[variant]
  return (
    <div className={cn("my-6 flex gap-3 rounded-xl border px-4 py-3.5", cls)}>
      <Icon className={cn("h-4 w-4 mt-1 shrink-0", iconCls)} aria-hidden />
      <div className="text-sm leading-6 text-foreground/85">
        {title ? <p className="font-semibold mb-1 text-foreground">{title}</p> : null}
        {children}
      </div>
    </div>
  )
}

export function DocTable({
  headers,
  rows,
  caption,
}: {
  headers: string[]
  rows: ReactNode[][]
  caption?: string
}) {
  return (
    <figure className="my-6">
      <div className="rounded-xl border border-border/60 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40">
              {headers.map((h) => (
                <th key={h} className="text-left font-medium text-muted-foreground px-4 py-2.5 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, i) => (
              <tr key={i} className="border-b border-border/40 last:border-0">
                {cells.map((cell, j) => (
                  <td key={j} className="px-4 py-2.5 align-top text-foreground/85">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption ? <figcaption className="mt-2 text-xs text-muted-foreground">{caption}</figcaption> : null}
    </figure>
  )
}

/** Numbered step-by-step flow, rendered as cards. */
export function StepList({ steps }: { steps: Array<{ title: string; body: ReactNode }> }) {
  return (
    <ol className="my-6 space-y-3">
      {steps.map((step, i) => (
        <li key={step.title} className="flex gap-4 rounded-xl border border-border/60 bg-card px-4 py-3.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold font-mono">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="font-medium text-sm mb-0.5">{step.title}</p>
            <div className="text-sm leading-6 text-muted-foreground">{step.body}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Internal cross-link card ("Read next" style). */
export function LinkCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-border/60 bg-card px-4 py-3.5 hover:border-primary/40 hover:bg-primary/5 transition-colors no-underline"
    >
      <p className="font-medium text-sm mb-0.5 text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground leading-6">{description}</p>
    </Link>
  )
}

export function LinkCardGrid({ children }: { children: ReactNode }) {
  return <div className="my-6 grid gap-3 sm:grid-cols-2">{children}</div>
}

const riskLevelStyles = {
  low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  high: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
} as const

/** A single risk, scored and scoped, for a scannable grid instead of stacked prose. */
export function RiskCard({
  title,
  level,
  who,
  children,
}: {
  title: string
  level: keyof typeof riskLevelStyles
  /** Who is exposed, e.g. "Everyone" or "Borrowers only". */
  who: string
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="font-semibold text-sm text-foreground">{title}</p>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
            riskLevelStyles[level]
          )}
        >
          {level}
        </span>
      </div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">Affects: {who}</p>
      <div className="text-sm leading-6 text-foreground/85">{children}</div>
    </div>
  )
}

export function RiskCardGrid({ children }: { children: ReactNode }) {
  return <div className="my-6 grid gap-3 sm:grid-cols-2">{children}</div>
}
