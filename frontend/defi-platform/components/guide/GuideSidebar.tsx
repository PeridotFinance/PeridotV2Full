"use client"

import {
  Compass,
  Sparkles,
  LineChart,
  Wallet,
  Activity,
  Layers,
  Search,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { HELP_CATEGORIES, type HelpCategoryId } from "@/data/help-catalog"

const ICONS: Record<string, LucideIcon> = {
  Compass,
  Sparkles,
  LineChart,
  Wallet,
  Activity,
  Layers,
}

interface GuideSidebarProps {
  active: HelpCategoryId
  /** Categories that actually have at least one captured entry. */
  visible: HelpCategoryId[]
  counts: Record<HelpCategoryId, number>
  onNavigate: (id: HelpCategoryId) => void
  onSearch: () => void
}

export function GuideSidebar({ active, visible, counts, onNavigate, onSearch }: GuideSidebarProps) {
  return (
    <aside className="lg:sticky lg:top-28 lg:h-[calc(100vh-8rem)]">
      <button
        onClick={onSearch}
        className="mb-5 flex w-full items-center gap-2.5 rounded-xl border border-border bg-card/60 px-3.5 py-2.5 text-sm text-muted-foreground backdrop-blur transition-colors hover:border-foreground/20 hover:text-text"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
      </button>

      <nav className="space-y-1">
        {HELP_CATEGORIES.filter((c) => visible.includes(c.id)).map((cat) => {
          const Icon = ICONS[cat.icon] ?? Compass
          const isActive = active === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => onNavigate(cat.id)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                isActive ? "bg-cyber-accent-primary/10 text-text" : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-text",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                  isActive
                    ? "border-cyber-accent-primary/40 bg-cyber-accent-primary/15 text-cyber-accent-primary"
                    : "border-border bg-card/60 text-muted-foreground group-hover:text-text",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex-1 text-sm font-medium">{cat.label}</span>
              <span className="text-xs tabular-nums text-muted-foreground/60">{counts[cat.id] ?? 0}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
