/**
 * P5 — chronological message ordering + bubble removal.
 *
 * Guards two behaviours the user asked for:
 *   1. Ephemeral failure advisories are interleaved by createdAt with
 *      persisted messages, not appended at the end.
 *   2. The legacy "Done — funds are on their way" success bubble is GONE.
 *      (Fintech regression — inline status on the ActionButtonBlock covers it.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import React from 'react'

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () =>
        React.forwardRef(({ children, ...props }: any, ref: any) =>
          React.createElement('div', { ...props, ref }, children),
        ),
    },
  ),
  AnimatePresence: ({ children }: any) => children,
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: any) => React.createElement('div', null, children),
}))

// ChatMessage is mounted inside the list — stub out to a minimal renderer so
// we don't pull its entire block-rendering dependency tree.
vi.mock('@/components/agents/chat/ChatMessage', () => ({
  ChatMessage: ({ message }: any) =>
    React.createElement('div', {
      'data-testid': `msg-${message.id}`,
      'data-role': message.role,
    }, message.content),
  StreamingMessage: () => null,
}))

vi.mock('@/components/agents/chat/TypingIndicator', () => ({
  TypingIndicator: () => null,
}))

vi.mock('@/components/agents/chat/AutoActionNotice', () => ({
  AutoActionNotice: () => null,
}))

import { ChatMessageList } from '@/components/agents/chat/ChatMessageList'

const baseMsg = (id: string, createdAt: string, role: 'user' | 'assistant' = 'user') => ({
  id,
  conversationId: 'c-1',
  role,
  content: `msg-${id}`,
  createdAt,
})

describe('ChatMessageList — chronological ordering', () => {
  beforeEach(() => {
    // Scroll stub — jsdom doesn't implement it
    Element.prototype.scrollTo = vi.fn() as any
    Element.prototype.scrollIntoView = vi.fn() as any
  })

  it('interleaves failure advisories by createdAt, not after all messages', () => {
    const t0 = '2026-04-22T12:00:00.000Z'
    const t1 = '2026-04-22T12:01:00.000Z'
    const t3 = '2026-04-22T12:03:00.000Z'

    const messages = [
      baseMsg('1', t0, 'user'),
      baseMsg('2', t1, 'assistant'),
      baseMsg('3', t3, 'user'),  // came AFTER the advisory at t2
    ]

    // Freeze time to t2 so the advisory's `new Date().toISOString()` lands
    // between t1 and t3.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-22T12:02:00.000Z'))

    render(
      <ChatMessageList
        messages={messages}
        isStreaming={false}
        streamingText=""
        streamingBlocks={[]}
      />,
    )

    act(() => {
      window.dispatchEvent(
        new CustomEvent('peridot:agent-action-failed', {
          detail: { message: 'Something didn\'t go through.' },
        }),
      )
    })

    vi.useRealTimers()

    const advisory = screen.getByTestId('agent-advisory-message')
    const msg3 = screen.getByTestId('msg-3')
    // The advisory was emitted at t2, so it must render BEFORE the t3 message.
    const allElements = Array.from(document.querySelectorAll('[data-testid]'))
    const advisoryIdx = allElements.indexOf(advisory)
    const msg3Idx = allElements.indexOf(msg3)
    expect(advisoryIdx).toBeLessThan(msg3Idx)
  })

  it('renders a success closure bubble when peridot:agent-action-succeeded carries a message', () => {
    // P5 initially removed this bubble because of ordering bugs; those are
    // fixed via chronological sort (see first test). The success bubble is
    // back to give the chat a clear terminator after Perry's "Handling it
    // now." pre-action text.
    const t0 = new Date().toISOString()
    render(
      <ChatMessageList
        messages={[baseMsg('1', t0)]}
        isStreaming={false}
        streamingText=""
        streamingBlocks={[]}
      />,
    )

    act(() => {
      window.dispatchEvent(
        new CustomEvent('peridot:agent-action-succeeded', {
          detail: { message: 'Done — deposited $3.99.', txHash: '0xabc' },
        }),
      )
    })

    const bubbles = screen.queryAllByTestId('agent-advisory-message')
    expect(bubbles).toHaveLength(1)
    expect(bubbles[0].textContent).toContain('Done — deposited $3.99.')
  })

  it('skips success events without a message field (internal signalling path)', () => {
    const t0 = new Date().toISOString()
    render(
      <ChatMessageList
        messages={[baseMsg('1', t0)]}
        isStreaming={false}
        streamingText=""
        streamingBlocks={[]}
      />,
    )

    act(() => {
      window.dispatchEvent(
        new CustomEvent('peridot:agent-action-succeeded', {
          detail: { txHash: '0xabc' }, // no `message`
        }),
      )
    })

    expect(screen.queryAllByTestId('agent-advisory-message')).toHaveLength(0)
  })

  it('renders a retry chip when the failure event carries a retryPrompt', () => {
    const t0 = new Date().toISOString()
    const onSuggestionClick = vi.fn()
    render(
      <ChatMessageList
        messages={[baseMsg('1', t0)]}
        isStreaming={false}
        streamingText=""
        streamingBlocks={[]}
        onSuggestionClick={onSuggestionClick}
      />,
    )

    act(() => {
      window.dispatchEvent(
        new CustomEvent('peridot:agent-action-failed', {
          detail: {
            message: "Didn't go through.",
            retryPrompt: 'Try a smaller deposit of USDC',
          },
        }),
      )
    })

    const chip = screen.getByTestId('agent-advisory-retry')
    expect(chip.textContent).toContain('Try a smaller deposit of USDC')

    fireEvent.click(chip)
    expect(onSuggestionClick).toHaveBeenCalledWith('Try a smaller deposit of USDC')
  })

  it('does NOT render a chip when retryPrompt is absent', () => {
    const t0 = new Date().toISOString()
    render(
      <ChatMessageList
        messages={[baseMsg('1', t0)]}
        isStreaming={false}
        streamingText=""
        streamingBlocks={[]}
        onSuggestionClick={() => {}}
      />,
    )

    act(() => {
      window.dispatchEvent(
        new CustomEvent('peridot:agent-action-failed', {
          detail: { message: "Didn't go through." },
        }),
      )
    })

    expect(screen.queryByTestId('agent-advisory-retry')).toBeNull()
  })

  it('dedupes duplicate success messages dispatched back-to-back', () => {
    const t0 = new Date().toISOString()
    render(
      <ChatMessageList
        messages={[baseMsg('1', t0)]}
        isStreaming={false}
        streamingText=""
        streamingBlocks={[]}
      />,
    )

    // Simulate the same closure firing twice (e.g. once from the hook and
    // once from the PATCH handler) — we should still only get one bubble.
    act(() => {
      for (let i = 0; i < 2; i++) {
        window.dispatchEvent(
          new CustomEvent('peridot:agent-action-succeeded', {
            detail: { message: 'Done — deposited $3.99.', txHash: '0xabc' },
          }),
        )
      }
    })

    expect(screen.queryAllByTestId('agent-advisory-message')).toHaveLength(1)
  })
})
