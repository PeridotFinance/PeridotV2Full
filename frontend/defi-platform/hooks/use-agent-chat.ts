'use client'

import { useState, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePrivy } from '@privy-io/react-auth'
import { parseSSELine } from '@/lib/agents/message-parser'
import type { AgentMessage, ContentBlock } from '@/types/agents'

interface UseAgentChatOptions {
  conversationId: string | null
  chainId?: number
  /** Connected Stellar wallet address, so the agent can read Stellar positions. */
  stellarAddress?: string
}

export function useAgentChat({ conversationId, chainId, stellarAddress }: UseAgentChatOptions) {
  const { getAccessToken } = usePrivy()
  const queryClient = useQueryClient()
  const abortRef = useRef<AbortController | null>(null)

  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [streamingBlocks, setStreamingBlocks] = useState<ContentBlock[]>([])
  const [error, setError] = useState<string | null>(null)

  // Fetch existing messages
  const { data, isLoading } = useQuery<{ messages: AgentMessage[] }>({
    queryKey: ['agent-messages', conversationId],
    queryFn: async () => {
      const token = await getAccessToken().catch(() => null)
      const res = await fetch(`/api/agents/conversations/${conversationId}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`Failed to load messages (HTTP ${res.status})`)
      return res.json()
    },
    enabled: !!conversationId,
    staleTime: 10_000,
  })

  const messages = data?.messages ?? []

  // Send a message and stream the response.
  // `overrideConversationId` lets the caller pass a freshly-created id that the
  // hook's closure hasn't seen yet — avoids the setTimeout-hack after create.
  const sendMessage = useCallback(
    async (content: string, overrideConversationId?: string) => {
      const activeId = overrideConversationId ?? conversationId
      if (!activeId || !content.trim() || isStreaming) return

      setError(null)
      setIsStreaming(true)
      setStreamingText('')
      setStreamingBlocks([])

      // Optimistic update: add user message
      const optimisticMsg: AgentMessage = {
        id: `temp-${Date.now()}`,
        conversationId: activeId,
        role: 'user',
        content: content.trim(),
        createdAt: new Date().toISOString(),
      }

      queryClient.setQueryData<{ messages: AgentMessage[] }>(
        ['agent-messages', activeId],
        (old) => ({
          messages: [...(old?.messages ?? []), optimisticMsg],
        }),
      )

      try {
        const token = await getAccessToken().catch(() => null)

        const controller = new AbortController()
        abortRef.current = controller

        // When a Privy token exists, authenticate via Bearer.
        // Otherwise rely on cookie-based e2e auth (dev-only path) — `credentials`
        // is set to 'include' so cookies are sent automatically.
        const authHeader = token ? { Authorization: `Bearer ${token}` } : {}
        const response = await fetch('/api/agents/chat', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...authHeader,
          },
          body: JSON.stringify({
            conversationId: activeId,
            content: content.trim(),
            chainId,
            stellarAddress,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err.error || `Chat failed: ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response stream')

        const decoder = new TextDecoder()
        let buffer = ''
        const blocks: ContentBlock[] = []
        let fullText = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const eventData = line.slice(6).trim()
            const event = parseSSELine(eventData)
            if (!event) continue

            switch (event.type) {
              case 'text_delta':
                fullText += event.delta
                setStreamingText(fullText)
                break
              case 'block':
                blocks.push(event.block)
                setStreamingBlocks([...blocks])
                // Server emits a TextBlock to freeze the text it streamed
                // up to this point — drop the raw `streamingText` so the
                // same content doesn't render twice (once in StreamingMessage,
                // once as the just-arrived block). The TextBlock now carries
                // it forward into the optimistic-on-done snapshot.
                if (event.block.type === 'text') {
                  fullText = ''
                  setStreamingText('')
                }
                break
              case 'done': {
                // Optimistically append the just-streamed assistant message
                // into the messages cache, then clear streaming state. Doing
                // it in this order prevents both races the naive refetch had:
                //   - GAP: clearing streaming first then waiting on the
                //     invalidated refetch would blank the blocks for 200 ms.
                //   - DUPLICATE: leaving streaming up while the refetch lands
                //     would render the same blocks twice for a frame.
                // Using the real `messageId` from the server keeps the React
                // key stable when the later refetch replaces this optimistic
                // entry with the persisted row — no unmount/remount flicker.
                const now = new Date().toISOString()
                queryClient.setQueryData<{ messages: AgentMessage[] }>(
                  ['agent-messages', activeId],
                  (old) => {
                    const prev = old?.messages ?? []
                    // Strict-mode / double-fire guard: don't append the same
                    // assistant message twice.
                    if (event.messageId && prev.some((m) => m.id === event.messageId)) {
                      return { messages: prev }
                    }
                    return {
                      messages: [
                        ...prev,
                        {
                          id: event.messageId || `stream-${now}`,
                          conversationId: activeId,
                          role: 'assistant',
                          content: fullText,
                          blocks: [...blocks],
                          createdAt: now,
                        },
                      ],
                    }
                  },
                )
                setStreamingText('')
                setStreamingBlocks([])
                // Sidebar still benefits from refetch (title updates,
                // updated_at reordering) — that query is unrelated to the
                // in-message rendering race above.
                queryClient.invalidateQueries({
                  queryKey: ['agent-conversations'],
                })
                break
              }
              case 'error':
                setError(event.message)
                break
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // User cancelled
        } else {
          setError(err instanceof Error ? err.message : 'Failed to send message')
        }
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [conversationId, chainId, stellarAddress, isStreaming, getAccessToken, queryClient],
  )

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return {
    messages,
    isLoading,
    isStreaming,
    streamingText,
    streamingBlocks,
    error,
    sendMessage,
    stopStreaming,
  }
}
