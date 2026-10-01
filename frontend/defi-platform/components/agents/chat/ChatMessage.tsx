'use client'

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { User, Copy, Check, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgentMessage, ContentBlock } from '@/types/agents'
import { PerryAvatar } from '@/components/agents/PerryAvatar'
import { TextBlock } from '@/components/agents/blocks/TextBlock'
import { MarkdownText } from './MarkdownText'
import { PoolTableBlock } from '@/components/agents/blocks/PoolTableBlock'
import { AllocationBlock } from '@/components/agents/blocks/AllocationBlock'
import { ChartBlock } from '@/components/agents/blocks/ChartBlock'
import { ActionButtonBlock } from '@/components/agents/blocks/ActionButtonBlock'
import { RebalanceBlock } from '@/components/agents/blocks/RebalanceBlock'
import { ThreeVisualization } from '@/components/agents/blocks/ThreeVisualization'
import { PortfolioOverviewBlock } from '@/components/agents/blocks/PortfolioOverviewBlock'
import { PositionCardBlock } from '@/components/agents/blocks/PositionCardBlock'
import { AlertBlock } from '@/components/agents/blocks/AlertBlock'
import { QuickReplyBlock } from '@/components/agents/blocks/QuickReplyBlock'
import { TransactionHistoryBlock } from '@/components/agents/blocks/TransactionHistoryBlock'
import { AssetEarningsBlock } from '@/components/agents/blocks/AssetEarningsBlock'

interface ChatMessageProps {
  message: AgentMessage
  isLast?: boolean
  onRegenerate?: () => void
}

/**
 * @param messageCreatedAt ISO timestamp of the parent message. Only passed
 *   through to action_button blocks; everything else doesn't need it.
 *   Lets ActionButtonBlock suppress the auto-execute countdown when the
 *   message is being rehydrated from conversation history (not freshly
 *   streamed). Without this, opening an older conversation would re-fire
 *   long-expired transactions.
 */
function renderBlock(
  block: ContentBlock,
  index: number,
  messageCreatedAt?: string,
) {
  switch (block.type) {
    case 'text':
      return <TextBlock key={index} content={block.content} />
    case 'pool_table':
      return <PoolTableBlock key={index} {...block} />
    case 'allocation':
      return <AllocationBlock key={index} {...block} />
    case 'chart':
      return <ChartBlock key={index} {...block} />
    case 'action_button':
      return (
        <ActionButtonBlock
          key={index}
          {...block}
          messageCreatedAt={messageCreatedAt}
        />
      )
    case 'rebalance':
      return <RebalanceBlock key={index} {...block} />
    case 'three_visualization':
      return <ThreeVisualization key={index} {...block} />
    case 'portfolio_overview':
      return <PortfolioOverviewBlock key={index} {...block} />
    case 'position_card':
      return <PositionCardBlock key={index} {...block} />
    case 'alert':
      return <AlertBlock key={index} {...block} />
    case 'quick_reply':
      return <QuickReplyBlock key={index} {...block} />
    case 'transaction_history':
      return <TransactionHistoryBlock key={index} {...block} />
    case 'asset_earnings':
      return <AssetEarningsBlock key={index} {...block} />
    default:
      return null
  }
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function MessageActions({
  content,
  isLast,
  onRegenerate,
}: {
  content: string
  isLast?: boolean
  onRegenerate?: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available
    }
  }, [content])

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      <button
        onClick={handleCopy}
        className="p-1 rounded-md hover:bg-muted/80 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        title="Copy message"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
      {isLast && onRegenerate && (
        <button
          onClick={onRegenerate}
          className="p-1 rounded-md hover:bg-muted/80 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          title="Regenerate response"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// Threshold below which a plain-text assistant answer renders without any
// container — sits next to Perry's avatar like a spoken note. Anything longer
// gets the soft notification card so long paragraphs stay scannable.
const SHORT_ANSWER_MAX = 100

export function ChatMessage({ message, isLast, onRegenerate }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const hasBlocks = Array.isArray(message.blocks) && message.blocks.length > 0
  const isShortText = !isUser && !hasBlocks && message.content.length <= SHORT_ANSWER_MAX

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      data-testid={isUser ? 'chat-message-user' : 'chat-message-assistant'}
      data-message-id={message.id}
      className={cn('flex gap-3 group', isUser ? 'justify-end' : 'justify-start')}
    >
      {!isUser && <PerryAvatar state="idle" size="sm" className="mt-0.5" />}

      <div className={cn('max-w-[75%] space-y-1.5', isUser && 'order-first')}>
        {isUser ? (
          <div className="bg-slate-900 dark:bg-emerald-600 text-white rounded-2xl px-4 py-2.5 shadow-sm">
            <p className="text-[14px] whitespace-pre-wrap leading-relaxed">{message.content}</p>
          </div>
        ) : hasBlocks ? (
          <div className="space-y-3">
            {message.blocks!.map((block, i) =>
              renderBlock(block, i, message.createdAt),
            )}
          </div>
        ) : isShortText ? (
          <div className="pt-1.5">
            <MarkdownText content={message.content} variant="whisper" />
          </div>
        ) : (
          <div className="bg-white/85 dark:bg-white/[0.06] backdrop-blur-xl border border-black/[0.06] dark:border-white/10 rounded-2xl px-4 py-3 shadow-sm">
            <MarkdownText content={message.content} variant="note" />
          </div>
        )}

        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            {formatTime(message.createdAt)}
          </span>
          {!isUser && (
            <MessageActions
              content={message.content}
              isLast={isLast}
              onRegenerate={onRegenerate}
            />
          )}
        </div>
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-2xl bg-slate-100 dark:bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-4 h-4 text-slate-500 dark:text-slate-300" />
        </div>
      )}
    </motion.div>
  )
}

/** Renders the streaming assistant message (not yet persisted) */
interface StreamingMessageProps {
  text: string
  blocks: ContentBlock[]
}

export function StreamingMessage({ text, blocks }: StreamingMessageProps) {
  // Streaming blocks are always "fresh" — stamp now so ActionButtonBlock
  // treats them as eligible for auto-execute.
  const streamedAt = new Date().toISOString()
  // During streaming we don't know the final length, so render the soft card
  // unconditionally — switching mid-stream from container-less to card would
  // jump the layout. Persisted re-render through ChatMessage applies the
  // hybrid threshold afterwards.
  return (
    <div data-testid="chat-streaming-message" className="flex gap-3 justify-start">
      <PerryAvatar state="thinking" size="sm" className="mt-0.5" />
      <div className="max-w-[75%] space-y-3">
        {blocks.map((block, i) => renderBlock(block, i, streamedAt))}
        {text && (
          <div className="bg-white/85 dark:bg-white/[0.06] backdrop-blur-xl border border-black/[0.06] dark:border-white/10 rounded-2xl px-4 py-3 shadow-sm">
            <MarkdownText content={text} variant="note" />
            <span
              className="inline-block w-1.5 h-3.5 bg-emerald-500/70 animate-pulse mt-1 align-middle rounded-sm"
              aria-hidden
            />
          </div>
        )}
      </div>
    </div>
  )
}
