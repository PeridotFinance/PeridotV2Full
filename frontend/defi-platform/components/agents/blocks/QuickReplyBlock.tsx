'use client'

import { useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import type { QuickReply } from '@/types/agents'

interface QuickReplyBlockProps {
  replies: QuickReply[]
}

/**
 * Row of follow-up chips. Clicking dispatches `peridot:agent-chat-send`,
 * which `AgentChatLayout` listens for and forwards to the chat input. The
 * block is decoupled from the chat hook so it can be rendered from any
 * historical message without prop-drilling.
 */
export function QuickReplyBlock({ replies }: QuickReplyBlockProps) {
  const handleClick = useCallback((prompt: string) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('peridot:agent-chat-send', {
        detail: { message: prompt },
      }),
    )
  }, [])

  if (!replies?.length) return null

  return (
    <div
      data-testid="quick-reply-block"
      className="flex flex-wrap gap-2 pt-1"
    >
      {replies.map((reply, i) => (
        <motion.button
          key={`${reply.label}-${i}`}
          type="button"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: i * 0.04 }}
          onClick={() => handleClick(reply.prompt)}
          className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-border/60 bg-muted/30 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-all"
        >
          <span>{reply.label}</span>
          <ArrowRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
        </motion.button>
      ))}
    </div>
  )
}
