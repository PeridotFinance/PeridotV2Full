'use client'

import { useMemo } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Archive,
  ArchiveRestore,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { AgentConversation, AgentProfile } from '@/types/agents'
import { ActivityPanel } from './ActivityPanel'

interface ChatSidebarProps {
  conversations: AgentConversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onArchive?: (id: string, isArchived: boolean) => void
  isCollapsed: boolean
  onToggleCollapse: () => void
  profile?: AgentProfile | null
  showArchived?: boolean
  onToggleArchived?: () => void
}

function relativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diffSec < 60) return 'now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 7) return `${diffDay}d`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  isCollapsed,
  onToggleCollapse,
  profile,
  onArchive,
  showArchived,
  onToggleArchived,
}: ChatSidebarProps) {
  // Flat list, sorted most-recent-first. Date buckets ("Today / Yesterday")
  // were the loudest ChatGPT/Claude tell — relative-time suffix on each row
  // gives the same scannability without the template look.
  const sortedConversations = useMemo(
    () =>
      [...conversations].sort((a, b) => {
        const at = new Date(a.updatedAt || a.createdAt).getTime()
        const bt = new Date(b.updatedAt || b.createdAt).getTime()
        return bt - at
      }),
    [conversations],
  )

  return (
    <motion.aside
      animate={{ width: isCollapsed ? 56 : 280 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="h-full border-r border-black/[0.06] dark:border-white/10 bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl flex flex-col overflow-hidden shrink-0"
    >
      {/* Header — Peridot mark replaces generic Bot icon */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-black/[0.06] dark:border-white/10">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <Image
              src="/Peridot-Icon-Only-Mint-Green.svg"
              alt="Peridot"
              width={22}
              height={22}
              className="shrink-0"
            />
            <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
              Perry
            </span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <PanelLeft className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* New chat — slate-900 pill, matches Easy CTAs */}
      <div className="px-3 py-3">
        <button
          onClick={onCreate}
          data-testid="chat-new"
          className={cn(
            'h-10 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold hover:bg-slate-700 dark:hover:bg-slate-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2',
            isCollapsed ? 'w-10 p-0' : 'w-full px-4',
          )}
        >
          <Plus className="w-4 h-4 shrink-0" strokeWidth={2.5} />
          {!isCollapsed && <span>New chat</span>}
        </button>
      </div>

      {/* Flat conversation list with relative-time suffix */}
      <ScrollArea className="flex-1">
        <div className="px-2 py-1">
          <div className="space-y-0.5">
            <AnimatePresence mode="popLayout">
              {sortedConversations.map((conv) => (
                <motion.div
                  key={conv.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15 }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(conv.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelect(conv.id)
                      }
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all group/item cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30',
                      activeId === conv.id
                        ? 'bg-emerald-50/80 dark:bg-emerald-500/10 border border-emerald-500/20 dark:border-emerald-500/25'
                        : 'hover:bg-slate-100/60 dark:hover:bg-white/5 border border-transparent',
                      isCollapsed && 'justify-center px-0',
                    )}
                  >
                    {isCollapsed && (
                      <MessageSquare
                        className={cn(
                          'w-4 h-4 shrink-0',
                          activeId === conv.id
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-400 dark:text-slate-500',
                        )}
                      />
                    )}
                    {!isCollapsed && (
                      <>
                        <div className="flex-1 min-w-0">
                          <div
                            className={cn(
                              'text-sm truncate',
                              activeId === conv.id
                                ? 'text-slate-900 dark:text-slate-100 font-semibold'
                                : 'text-slate-700 dark:text-slate-300',
                            )}
                            title={conv.title}
                          >
                            {conv.title}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">
                            {relativeTime(conv.updatedAt || conv.createdAt)}
                          </div>
                        </div>
                        <div
                          data-testid="chat-actions"
                          className="flex items-center gap-1 shrink-0 ml-1 opacity-0 group-hover/item:opacity-100 focus-within:opacity-100 transition-opacity"
                        >
                          {onArchive && (
                            <button
                              data-testid="chat-archive-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                onArchive(conv.id, !conv.isArchived)
                              }}
                              className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                              title={conv.isArchived ? 'Unarchive' : 'Archive'}
                              aria-label={conv.isArchived ? 'Unarchive chat' : 'Archive chat'}
                            >
                              {conv.isArchived ? (
                                <ArchiveRestore className="w-3.5 h-3.5" />
                              ) : (
                                <Archive className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                          <button
                            data-testid="chat-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (
                                typeof window === 'undefined' ||
                                window.confirm(
                                  `Delete "${conv.title}"? This cannot be undone.`,
                                )
                              ) {
                                onDelete(conv.id)
                              }
                            }}
                            className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:bg-rose-100 dark:hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                            title="Delete chat"
                            aria-label="Delete chat"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {sortedConversations.length === 0 && !isCollapsed && (
            <div className="px-3 py-8 text-center">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {showArchived
                  ? 'No archived conversations'
                  : 'No conversations yet'}
              </p>
            </div>
          )}

          {!isCollapsed && onToggleArchived && (
            <div className="px-3 py-3 mt-2">
              <button
                onClick={onToggleArchived}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-white/5 transition-colors"
              >
                <Archive className="w-3.5 h-3.5" />
                {showArchived ? 'Show active chats' : 'Show archived'}
              </button>
            </div>
          )}
        </div>
      </ScrollArea>

      {!isCollapsed && (
        <div className="px-3 pt-2">
          <ActivityPanel />
        </div>
      )}

      {!isCollapsed && profile?.onboardingComplete && (
        <div className="px-3 py-3 border-t border-black/[0.06] dark:border-white/10">
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-slate-50/80 dark:bg-white/[0.04]">
            {profile.riskLevel === 'low' ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            ) : profile.riskLevel === 'high' ? (
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            ) : (
              <Shield className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 capitalize">
                {profile.riskLevel} risk
              </span>
              {profile.capitalUsd != null && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1.5 tabular-nums">
                  ${profile.capitalUsd >= 1000
                    ? `${(profile.capitalUsd / 1000).toFixed(profile.capitalUsd >= 10000 ? 0 : 1)}k`
                    : profile.capitalUsd.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.aside>
  )
}
