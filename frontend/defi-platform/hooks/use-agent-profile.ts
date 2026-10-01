'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePrivy } from '@privy-io/react-auth'
import type { AgentProfile } from '@/types/agents'

const PROFILE_KEY = ['agent-profile']

export function useAgentProfile() {
  const { getAccessToken, authenticated } = usePrivy()
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery<{ profile: AgentProfile }>({
    queryKey: PROFILE_KEY,
    queryFn: async () => {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const res = await fetch('/api/agents/profile', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to load profile')
      return res.json()
    },
    enabled: authenticated,
    staleTime: 60_000,
  })

  const updateProfile = useMutation({
    mutationFn: async (updates: Partial<AgentProfile>) => {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const res = await fetch('/api/agents/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error('Failed to update profile')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILE_KEY })
    },
  })

  return {
    profile: data?.profile ?? null,
    isLoading,
    error,
    updateProfile,
  }
}
