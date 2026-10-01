'use client'

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from 'react'
import { Square, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatInputBarProps {
  onSend: (content: string) => void
  onStop?: () => void
  isStreaming: boolean
  disabled?: boolean
}

const MAX_LENGTH = 4000

export function ChatInputBar({ onSend, onStop, isStreaming, disabled }: ChatInputBarProps) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    if (!value.trim() || disabled) return
    onSend(value.trim())
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, disabled, onSend])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (!isStreaming) handleSend()
      }
    },
    [isStreaming, handleSend],
  )

  const handleInput = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [])

  // Listen for context-menu prefills (RowContextMenu dispatches this).
  // Replaces the current input rather than appending — the user explicitly
  // chose a contextual prompt; mid-typing accidents are recoverable via
  // browser-native undo (Cmd/Ctrl+Z) inside the textarea.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message?: string } | undefined
      const message = typeof detail?.message === 'string' ? detail.message : ''
      if (!message) return
      const trimmed = message.length > MAX_LENGTH ? message.slice(0, MAX_LENGTH) : message
      setValue(trimmed)
      // Defer focus + cursor placement so React commits the new value first.
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(trimmed.length, trimmed.length)
        handleInput()
      })
    }
    window.addEventListener('peridot:agent-chat-prefill', handler)
    return () => window.removeEventListener('peridot:agent-chat-prefill', handler)
  }, [handleInput])

  const charCount = value.length
  const showCounter = charCount > 500
  const canSend = Boolean(value.trim()) && !disabled

  return (
    <div className="px-4 pb-5 pt-2">
      <div className="max-w-3xl mx-auto">
        <div
          className={cn(
            'relative flex items-end gap-2 rounded-3xl bg-white/85 dark:bg-white/[0.06] backdrop-blur-xl border transition-all duration-200',
            focused
              ? 'border-emerald-500/30 shadow-[0_8px_30px_rgba(16,185,129,0.12)]'
              : 'border-black/[0.06] dark:border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.05)]',
          )}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              if (e.target.value.length <= MAX_LENGTH) {
                setValue(e.target.value)
                handleInput()
              }
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Ask Perry…"
            disabled={disabled}
            rows={1}
            data-testid="chat-input"
            className="w-full resize-none bg-transparent px-5 py-3.5 pr-14 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none disabled:opacity-50"
          />

          <div className="absolute right-2 bottom-2">
            {isStreaming ? (
              <button
                onClick={onStop}
                data-testid="chat-stop"
                className="h-9 w-9 rounded-full flex items-center justify-center bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors"
                aria-label="Stop generating"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!canSend}
                data-testid="chat-send"
                aria-label="Send message"
                className={cn(
                  'h-9 w-9 rounded-full flex items-center justify-center transition-all duration-150',
                  canSend
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-md shadow-emerald-500/25 active:scale-95'
                    : 'bg-slate-100 dark:bg-white/10 text-slate-300 dark:text-slate-600 cursor-not-allowed',
                )}
              >
                <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        {showCounter && (
          <div className="flex justify-end px-3 pt-1.5">
            <span
              className={cn(
                'text-[10px] tabular-nums',
                charCount > MAX_LENGTH * 0.9
                  ? 'text-rose-500'
                  : 'text-slate-400 dark:text-slate-500',
              )}
            >
              {charCount}/{MAX_LENGTH}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
