'use client'

import {
  Info,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  MoreHorizontal,
  Undo2,
  Shield,
  Activity,
  HeartPulse,
  Banknote,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AlertSeverity } from '@/types/agents'
import { RowContextMenu, type ContextMenuGroup } from '@/components/agents/RowContextMenu'

interface AlertBlockProps {
  severity: AlertSeverity
  title: string
  body?: string
}

// Menu items are derived purely from severity so the LLM never has to ship
// UI structure in the block payload. Info/success alerts intentionally have
// no menu — they're contextual fillers, not decision points.
const MENU_BY_SEVERITY: Partial<Record<AlertSeverity, ContextMenuGroup[]>> = {
  danger: [
    {
      label: 'Act now',
      items: [
        {
          label: 'Pay back the most urgent loan',
          icon: Undo2,
          prompt: 'Help me pay back the loan closest to liquidation right now.',
        },
        {
          label: 'Add backing immediately',
          icon: Shield,
          prompt: 'I want to add more backing to push my loans away from liquidation.',
        },
      ],
    },
    {
      label: 'Inspect',
      items: [
        {
          label: 'Show all my loans',
          icon: Activity,
          prompt: 'Show me all my outstanding loans and how safe each one is.',
        },
        {
          label: 'Full position health',
          icon: HeartPulse,
          prompt: 'Walk me through my full position health: collateral, debt, and liquidation buffer.',
        },
      ],
    },
    {
      label: 'About',
      items: [
        {
          label: 'What does liquidation mean?',
          icon: Info,
          prompt: 'Explain what liquidation is, when it triggers, and what it costs me.',
        },
      ],
    },
  ],
  warn: [
    {
      label: 'Soften',
      items: [
        {
          label: 'Pay back a small amount',
          icon: Banknote,
          prompt: 'Help me pay back a small portion of my loan to give myself breathing room.',
        },
      ],
    },
    {
      label: 'Inspect',
      items: [
        {
          label: 'Show all my loans',
          icon: Activity,
          prompt: 'Show me all my outstanding loans with their risk levels.',
        },
        {
          label: 'Run a stress test',
          icon: HeartPulse,
          prompt: 'Run a stress test — what happens to my loans if my collateral drops 10%?',
        },
      ],
    },
    {
      label: 'About',
      items: [
        {
          label: 'What is the liquidation threshold?',
          icon: Info,
          prompt: 'Explain the liquidation threshold and how it differs from the borrow limit.',
        },
      ],
    },
  ],
}

const SEVERITY_STYLES: Record<
  AlertSeverity,
  { Icon: LucideIcon; container: string; icon: string; title: string }
> = {
  info: {
    Icon: Info,
    container: 'border-primary/30 bg-primary/5',
    icon: 'text-primary',
    title: 'text-foreground',
  },
  warn: {
    Icon: AlertTriangle,
    container: 'border-amber-500/30 bg-amber-500/5',
    icon: 'text-amber-600',
    title: 'text-amber-700 dark:text-amber-400',
  },
  danger: {
    Icon: AlertOctagon,
    container: 'border-destructive/30 bg-destructive/5',
    icon: 'text-destructive',
    title: 'text-destructive',
  },
  success: {
    Icon: CheckCircle2,
    container: 'border-green-500/30 bg-green-500/5',
    icon: 'text-green-600',
    title: 'text-green-700 dark:text-green-400',
  },
}

export function AlertBlock({ severity, title, body }: AlertBlockProps) {
  const style = SEVERITY_STYLES[severity]
  const Icon = style.Icon
  const menuGroups = MENU_BY_SEVERITY[severity]

  return (
    <div
      role="status"
      className={cn(
        'rounded-2xl border px-4 py-3 flex items-start gap-3',
        style.container,
      )}
    >
      <Icon className={cn('w-5 h-5 shrink-0 mt-0.5', style.icon)} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className={cn('text-sm font-semibold font-inter leading-snug', style.title)}>
          {title}
        </div>
        {body && (
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {body}
          </p>
        )}
      </div>
      {menuGroups && (
        <RowContextMenu title="What you can do" groups={menuGroups} side="bottom">
          <button
            type="button"
            aria-label="More actions"
            className={cn(
              'shrink-0 -mr-1 -mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
              'hover:bg-foreground/5 focus:bg-foreground/5 focus:outline-none data-[state=open]:bg-foreground/10',
              style.icon,
            )}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </RowContextMenu>
      )}
    </div>
  )
}
