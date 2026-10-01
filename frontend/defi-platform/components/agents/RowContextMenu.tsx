'use client'

import { useCallback, type ReactNode } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { motion } from 'framer-motion'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ContextMenuItem {
  label: string
  /**
   * Pre-fills the chat input with this prompt when clicked. The user can
   * still edit before sending — that's the whole point of NOT sending
   * directly: contextual prompts often want a small tweak ("…and use my
   * Arbitrum wallet") before going out.
   *
   * Ignored when `href` is set (external-link items don't write to chat).
   */
  prompt?: string
  /**
   * If provided, the item becomes an external link (opens in a new tab).
   * Mutually exclusive with `prompt`; when both are set, `href` wins.
   */
  href?: string
  icon?: LucideIcon
}

export interface ContextMenuGroup {
  /** Optional group header — omit to merge silently with surrounding items. */
  label?: string
  items: ContextMenuItem[]
}

interface RowContextMenuProps {
  /** Optional caption shown at the top of the popover. */
  title?: string
  groups: ContextMenuGroup[]
  /** The trigger element (usually the row). Must be a single element. */
  children: ReactNode
  /** When true, popover anchors below the trigger instead of to the side. */
  side?: 'bottom' | 'right' | 'top' | 'left'
  className?: string
}

/**
 * Reusable click-to-open context menu for rows in agent blocks (pool table,
 * position card, transaction row, etc.). Click an item → the chat input is
 * pre-filled with `item.prompt` so the user can review / tweak / send.
 *
 * Decoupled from the chat hook via the `peridot:agent-chat-prefill` window
 * event — the input bar listens for it. Same pattern as the existing
 * `peridot:agent-chat-send` (used by QuickReplyBlock).
 */
export function RowContextMenu({
  title,
  groups,
  children,
  side = 'bottom',
  className,
}: RowContextMenuProps) {
  const handleSelect = useCallback((prompt: string) => {
    if (!prompt || typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('peridot:agent-chat-prefill', {
        detail: { message: prompt },
      }),
    )
  }, [])

  // No actions → render the row as-is, no clickable wrapper. Keeps caller
  // code simple ("just hand me whatever you have").
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  if (total === 0) return <>{children}</>

  return (
    <Popover.Root>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          side={side}
          sideOffset={6}
          collisionPadding={12}
          asChild
        >
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className={cn(
              'z-50 w-[260px] rounded-2xl border border-border/60 bg-popover/95 backdrop-blur-md shadow-xl shadow-black/20 overflow-hidden',
              className,
            )}
          >
            {title && (
              <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/70 border-b border-border/40 truncate">
                {title}
              </div>
            )}
            <div className="py-1">
              {groups.map((group, gi) => (
                <div key={gi}>
                  {group.label && (
                    <div
                      className={cn(
                        'px-3 pt-2 pb-1 text-[9px] font-mono uppercase tracking-[0.14em] text-muted-foreground/50',
                        gi === 0 && !title ? 'pt-2' : '',
                      )}
                    >
                      {group.label}
                    </div>
                  )}
                  {group.items.map((item, ii) => {
                    const Icon = item.icon
                    const sharedClass =
                      'group w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 focus:bg-muted/50 focus:outline-none transition-colors text-left'
                    const sharedInner = (
                      <>
                        {Icon && (
                          <Icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                        )}
                        <span className="flex-1 truncate text-foreground/90 group-hover:text-foreground">
                          {item.label}
                        </span>
                        <ChevronRight className="w-3 h-3 text-muted-foreground/30 group-hover:text-primary/60 shrink-0 transition-colors" />
                      </>
                    )

                    // External link: render as <a target="_blank">. Closes
                    // the popover via Popover.Close wrapping; navigation
                    // happens natively. We never prefill the input for
                    // links — the URL would just turn into junk text.
                    if (item.href) {
                      return (
                        <Popover.Close key={ii} asChild>
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noreferrer noopener"
                            className={sharedClass}
                          >
                            {sharedInner}
                          </a>
                        </Popover.Close>
                      )
                    }

                    return (
                      <Popover.Close key={ii} asChild>
                        <button
                          type="button"
                          onClick={() => handleSelect(item.prompt ?? '')}
                          className={sharedClass}
                        >
                          {sharedInner}
                        </button>
                      </Popover.Close>
                    )
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
