'use client'

import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react'
import { useAgentActivity } from '@/hooks/use-agent-activity'
import { getChainConfig } from '@/config/contracts'
import { cn } from '@/lib/utils'
import type { AgentActionLogEntry } from '@/lib/agents/action-log'

/**
 * "Perry's activity" panel — shows the last N agent-executed transactions so
 * the user can audit what Perry did on their behalf (especially auto-executed
 * actions). Collapsible by default, lives at the bottom of the chat sidebar.
 *
 * Fintech vocabulary only (no "tx hash", no chain names, no gas). Raw tx hash
 * is behind a block-explorer link icon, not shown inline.
 */
export function ActivityPanel() {
  const [expanded, setExpanded] = useState(false)
  const [onlyAuto, setOnlyAuto] = useState(false)
  const { entries, isLoading, error, refresh } = useAgentActivity({
    limit: 20,
    onlyAuto,
    pollIntervalMs: 30_000,
  })

  const autoCount = useMemo(
    () => entries.filter((e) => e.autoExecuted).length,
    [entries],
  )
  const successCount = useMemo(
    () => entries.filter((e) => e.status === 'success').length,
    [entries],
  )

  return (
    <div
      data-testid="activity-panel"
      className="rounded-xl border border-border/40 bg-background/40 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="w-4 h-4 text-primary" />
          <span>Perry's activity</span>
          {entries.length > 0 && (
            <span className="text-xs text-muted-foreground ml-1">
              {successCount} / {entries.length}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/40">
          {/* Controls */}
          <div className="px-4 py-2 flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyAuto}
                onChange={(e) => setOnlyAuto(e.target.checked)}
                className="accent-primary"
              />
              <span className="text-muted-foreground">
                Only Perry auto-actions {autoCount > 0 ? `(${autoCount})` : ''}
              </span>
            </label>
            <button
              type="button"
              onClick={() => refresh()}
              className="text-muted-foreground hover:text-foreground transition-colors"
              disabled={isLoading}
            >
              {isLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {/* Body */}
          {error && (
            <div className="px-4 py-3 text-xs text-destructive">{error}</div>
          )}
          {!error && entries.length === 0 && (
            <div className="px-4 py-6 text-xs text-center text-muted-foreground">
              {isLoading ? 'Loading your history…' : 'No activity yet.'}
            </div>
          )}
          {entries.length > 0 && (
            <ul className="divide-y divide-border/40 max-h-80 overflow-auto">
              {entries.map((entry) => (
                <ActivityRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ─── row ────────────────────────────────────────────────────────────

function ActivityRow({ entry }: { entry: AgentActionLogEntry }) {
  const verb = actionToVerb(entry.actionType)
  const amount = formatAmount(entry.amount, entry.amountUsd)
  const explorerUrl = entry.txHash
    ? buildExplorerUrl(entry.chainId, entry.txHash)
    : null

  return (
    <li className="px-4 py-3 text-sm flex items-center gap-3">
      <StatusIcon status={entry.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{verb}</span>
          <span className="text-muted-foreground">{amount}</span>
          {entry.autoExecuted && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              auto
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {entry.assetSymbol} · {formatRelativeTime(entry.createdAt)}
        </div>
        {entry.errorMessage && entry.status === 'failed' && (
          <div className="text-xs text-destructive mt-1 truncate">
            {entry.errorMessage}
          </div>
        )}
      </div>
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-primary transition-colors"
          aria-label="View transaction"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </li>
  )
}

function StatusIcon({ status }: { status: AgentActionLogEntry['status'] }) {
  if (status === 'success') {
    return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
  }
  if (status === 'failed') {
    return <XCircle className="w-4 h-4 text-destructive shrink-0" />
  }
  return <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
}

// ─── formatters ─────────────────────────────────────────────────────

const ACTION_VERBS: Record<string, string> = {
  supply: 'Deposited',
  deposit: 'Deposited',
  withdraw: 'Withdrew',
  borrow: 'Borrowed',
  repay: 'Paid back',
  pay_back: 'Paid back',
  swap: 'Converted',
  convert: 'Converted',
  rebalance: 'Adjusted strategy',
  adjust_strategy: 'Adjusted strategy',
  'cross-chain_supply': 'Deposited',
}

function actionToVerb(actionType: string): string {
  return ACTION_VERBS[actionType] ?? actionType
}

function formatAmount(amount: number, amountUsd: number | null): string {
  if (amountUsd != null && Number.isFinite(amountUsd) && amountUsd > 0) {
    const n = amountUsd
    return n >= 1
      ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : `$${n.toFixed(2)}`
  }
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
}

function formatRelativeTime(iso: string): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function buildExplorerUrl(chainId: number, hash: string): string | null {
  try {
    const cfg = getChainConfig(chainId)
    const base = (cfg as any)?.explorer
    if (typeof base === 'string' && base.length > 0) {
      return `${base.replace(/\/$/, '')}/tx/${hash}`
    }
  } catch {}
  return null
}

// Keep default export for flexibility in test scaffolding
export default ActivityPanel
