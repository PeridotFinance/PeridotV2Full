'use client'

import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatMessage, StreamingMessage } from './ChatMessage'
import { TypingIndicator } from './TypingIndicator'
import { AutoActionNotice } from './AutoActionNotice'
import { EmptyState } from './EmptyState'
import { MarkdownText } from './MarkdownText'
import type { AgentMessage, ContentBlock } from '@/types/agents'
import { PerryAvatar } from '@/components/agents/PerryAvatar'

/**
 * Perry's follow-up message after a transaction fails.
 * Not persisted — lives only in local state and vanishes on conversation
 * switch / reload. The source of truth is still the failed action row in
 * agent_executed_actions; Perry can reference it on a future chat turn.
 */
interface EphemeralAdvisoryMessage {
  id: string
  content: string
  createdAt: string
  /**
   * Optional follow-up prompt the user can click to re-pose the question
   * to Perry. Populated by failure advisories when the error is recoverable
   * (e.g. insufficient balance → "Try depositing a smaller amount"). Click
   * routes through `onSuggestionClick` like any normal user turn.
   */
  retryPrompt?: string
}

interface ChatMessageListProps {
  messages: AgentMessage[]
  isStreaming: boolean
  streamingText: string
  streamingBlocks: ContentBlock[]
  onSuggestionClick?: (text: string) => void
  onRegenerate?: () => void
}

export function ChatMessageList({
  messages,
  isStreaming,
  streamingText,
  streamingBlocks,
  onSuggestionClick,
  onRegenerate,
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Ephemeral "Perry speaks up" messages emitted when a transaction fails
  // mid-dispatch (useAgentExecution dispatches peridot:agent-action-failed).
  // Reset whenever the active conversation changes — tied to messages[0]?.id
  // via useEffect below.
  const [advisoryMessages, setAdvisoryMessages] = useState<EphemeralAdvisoryMessage[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        message?: string
        retryPrompt?: string
      } | undefined
      if (!detail?.message) return
      setAdvisoryMessages((prev) => {
        // Dedup by content within a short window — some flows fire both
        // `peridot:agent-action-succeeded` and a PATCH-triggered follow-up,
        // and we don't want duplicate "Done" bubbles stacking.
        const recent = prev.slice(-3)
        if (recent.some((m) => m.content === detail.message)) return prev
        return [
          ...prev,
          {
            id: `adv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            content: detail.message as string,
            createdAt: new Date().toISOString(),
            retryPrompt:
              typeof detail.retryPrompt === 'string' && detail.retryPrompt.trim()
                ? detail.retryPrompt.trim()
                : undefined,
          },
        ]
      })
    }
    // Both failure AND success emit a closure bubble now. Success was
    // originally stripped in P5 because of ordering bugs — an old completion
    // event would arrive after newer user turns and append at the end. The
    // chronological-sort render in this component (see `renderItems` below)
    // fixes that root cause, so we can safely bring the success bubble back.
    //
    // Without a success bubble, Perry's pre-action "Handling it now." text
    // stays alone in the chat after the tx succeeds — reading as an
    // unresolved promise. The closure bubble gives the conversation a real
    // terminator.
    window.addEventListener('peridot:agent-action-failed', handler)
    window.addEventListener('peridot:agent-action-succeeded', handler)
    return () => {
      window.removeEventListener('peridot:agent-action-failed', handler)
      window.removeEventListener('peridot:agent-action-succeeded', handler)
    }
  }, [])

  // Drop advisory messages when the conversation switches (messages[0] changes).
  const firstMessageId = messages[0]?.id
  useEffect(() => {
    setAdvisoryMessages([])
  }, [firstMessageId])

  // Auto-scroll to bottom — but only scroll the inner chat container, never
  // the whole document. `scrollIntoView()` without `block: 'nearest'` will walk
  // up to the window and scroll the entire page, which is what you see on
  // long pages ("page jumps to the bottom").
  useEffect(() => {
    const el = bottomRef.current
    if (!el) return
    // Find the nearest scrollable ancestor inside the chat area.
    let parent: HTMLElement | null = el.parentElement
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent)
      if (/(auto|scroll|overlay)/.test(style.overflowY)) {
        parent.scrollTo({ top: parent.scrollHeight, behavior: 'smooth' })
        return
      }
      parent = parent.parentElement
    }
    // Fallback that still scopes to the nearest scroll container
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages.length, streamingText, streamingBlocks.length])

  const isEmpty = messages.length === 0 && !isStreaming

  // Find last assistant message index for regenerate button
  const lastAssistantIdx = messages.reduceRight(
    (found, msg, i) => (found === -1 && msg.role === 'assistant' ? i : found),
    -1,
  )

  // ── Chronologically-ordered render list ────────────────────────────
  // P5: merge persisted messages + ephemeral advisories and sort by
  // createdAt. Fixes the "success bubble appears at the end" bug where
  // an advisory emitted before a later user turn was still appended last.
  // Uses stable keys so React reconciles correctly across re-renders.
  const renderItems: Array<
    | { kind: 'msg'; createdAt: number; msg: AgentMessage; idx: number }
    | { kind: 'advisory'; createdAt: number; advisory: EphemeralAdvisoryMessage }
  > = [
    ...messages.map((msg, idx) => ({
      kind: 'msg' as const,
      createdAt: Date.parse(msg.createdAt) || 0,
      msg,
      idx,
    })),
    ...advisoryMessages.map((advisory) => ({
      kind: 'advisory' as const,
      createdAt: Date.parse(advisory.createdAt) || 0,
      advisory,
    })),
  ].sort((a, b) => a.createdAt - b.createdAt)

  return (
    <ScrollArea className="flex-1" data-testid="chat-message-list">
      <div
        data-testid="chat-message-list-inner"
        data-streaming={isStreaming ? 'true' : 'false'}
        className="px-4 py-6 space-y-6 max-w-3xl mx-auto min-h-full"
      >
        {isEmpty ? (
          <EmptyState onCardClick={onSuggestionClick} />
        ) : (
          <>
            {renderItems.map((item) =>
              item.kind === 'msg' ? (
                <ChatMessage
                  key={item.msg.id}
                  message={item.msg}
                  isLast={item.idx === lastAssistantIdx}
                  onRegenerate={onRegenerate}
                />
              ) : (
                <AdvisoryMessage
                  key={item.advisory.id}
                  content={item.advisory.content}
                  retryPrompt={item.advisory.retryPrompt}
                  onRetryClick={onSuggestionClick}
                />
              ),
            )}
            {isStreaming && (streamingText || streamingBlocks.length > 0) && (
              <StreamingMessage text={streamingText} blocks={streamingBlocks} />
            )}
            {isStreaming && !streamingText && streamingBlocks.length === 0 && (
              <TypingIndicator />
            )}
            {/* Inline flash when Perry auto-executes — sidebar Activity panel
                is the long-term history, this is the "just happened" toast. */}
            <AutoActionNotice />
          </>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}

/**
 * Render a Perry-styled message bubble mimicking ChatMessage's assistant look.
 * Used only for the client-side advisory messages; real assistant messages go
 * through ChatMessage which knows about blocks, actions, etc.
 *
 * When `retryPrompt` is set, renders a "Try again" chip underneath that routes
 * through `onRetryClick` — typically wired to the chat input's send handler so
 * the prompt is posed back to Perry as a normal user turn.
 */
function AdvisoryMessage({
  content,
  retryPrompt,
  onRetryClick,
}: {
  content: string
  retryPrompt?: string
  onRetryClick?: (text: string) => void
}) {
  const isShort = content.length <= 100
  return (
    <div
      data-testid="agent-advisory-message"
      className="flex gap-3 justify-start"
    >
      <PerryAvatar state="alert" size="sm" className="mt-0.5" />
      <div className="max-w-[75%] space-y-1.5">
        {isShort ? (
          <div className="pt-1.5">
            <MarkdownText content={content} variant="whisper" />
          </div>
        ) : (
          <div className="bg-white/85 dark:bg-white/[0.06] backdrop-blur-xl border border-black/[0.06] dark:border-white/10 rounded-2xl px-4 py-3 shadow-sm">
            <MarkdownText content={content} variant="note" />
          </div>
        )}
        {retryPrompt && onRetryClick && (
          <button
            type="button"
            data-testid="agent-advisory-retry"
            onClick={() => onRetryClick(retryPrompt)}
            className="text-xs px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          >
            {retryPrompt}
          </button>
        )}
      </div>
    </div>
  )
}
