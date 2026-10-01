'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePrivy } from '@privy-io/react-auth'
import type { AgentConversation } from '@/types/agents'

const CONVERSATIONS_KEY = ['agent-conversations']

/**
 * Low-level fetch helper.
 * - Adds a Bearer token when one is available.
 * - Always includes cookies so the dev-only e2e cookie auth path works.
 */
async function fetchAuth(
  url: string,
  token: string | null,
  options?: RequestInit,
): Promise<unknown> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error || `Request failed: ${res.status}`)
  }
  return res.json()
}

export function useAgentConversations(showArchived = false) {
  const { getAccessToken } = usePrivy()
  const queryClient = useQueryClient()

  const queryKey = showArchived ? [...CONVERSATIONS_KEY, 'archived'] : CONVERSATIONS_KEY

  const { data, isLoading, error } = useQuery<{ conversations: AgentConversation[] }>({
    queryKey,
    queryFn: async () => {
      const token = await getAccessToken().catch(() => null)
      const url = showArchived
        ? '/api/agents/conversations?archived=true'
        : '/api/agents/conversations'
      return (await fetchAuth(url, token)) as { conversations: AgentConversation[] }
    },
    staleTime: 30_000,
  })

  const createConversation = useMutation({
    mutationFn: async (title?: string) => {
      const token = await getAccessToken().catch(() => null)
      return fetchAuth('/api/agents/conversations', token, {
        method: 'POST',
        body: JSON.stringify({ title }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })

  const deleteConversation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getAccessToken().catch(() => null)
      return fetchAuth(`/api/agents/conversations/${id}`, token, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })

  const archiveConversation = useMutation({
    mutationFn: async ({ id, isArchived }: { id: string; isArchived: boolean }) => {
      const token = await getAccessToken().catch(() => null)
      return fetchAuth(`/api/agents/conversations/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ isArchived }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
      queryClient.invalidateQueries({ queryKey: [...CONVERSATIONS_KEY, 'archived'] })
    },
  })

  return {
    conversations: data?.conversations ?? [],
    isLoading,
    error,
    createConversation,
    deleteConversation,
    archiveConversation,
  }
}
