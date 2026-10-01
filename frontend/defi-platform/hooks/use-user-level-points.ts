'use client'

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useActiveWallet } from '@/hooks/use-active-wallet'

type LevelData = {
  points: number
  levelLabel: string
  levelIndex: number
  nextLevelLabel: string | null
  nextLevelAt: number | null
  progress01: number // 0..1 progress toward next level
}

// Keep levels centralized to match leaderboard components
const RANKING_TIERS = [
  { level: 'Celestial', minPoints: 100000 },
  { level: 'Divine', minPoints: 50000 },
  { level: 'Mythic', minPoints: 25000 },
  { level: 'Legendary', minPoints: 10000 },
  { level: 'Master', minPoints: 5000 },
  { level: 'Expert', minPoints: 1000 },
  { level: 'Advanced', minPoints: 500 },
  { level: 'Intermediate', minPoints: 100 },
  { level: 'Beginner', minPoints: 0 },
].sort((a, b) => b.minPoints - a.minPoints)

function computeLevel(totalPoints: number): LevelData {
  let idx = RANKING_TIERS.findIndex(t => totalPoints >= t.minPoints)
  if (idx === -1) idx = RANKING_TIERS.length - 1
  const cur = RANKING_TIERS[idx]
  const next = RANKING_TIERS[idx - 1]
  const nextAt = next ? next.minPoints : null
  let progress01 = 1
  if (nextAt !== null) {
    const span = Math.max(1, nextAt - cur.minPoints)
    progress01 = Math.max(0, Math.min(1, (totalPoints - cur.minPoints) / span))
  }
  return {
    points: totalPoints,
    levelLabel: cur.level,
    levelIndex: RANKING_TIERS.length - idx,
    nextLevelLabel: next ? next.level : null,
    nextLevelAt: nextAt,
    progress01,
  }
}

async function fetchUserPoints(address: string, signal?: AbortSignal): Promise<LevelData> {
  // Try lightweight endpoint first for better performance
  let res = await fetch(`/api/user/level-data?wallet=${address}`, {
    signal,
    next: { revalidate: 120 } // 2 minute cache
  })
  
  // If lightweight endpoint fails, fallback to aggregate
  if (!res.ok) {
    res = await fetch(`/api/leaderboard/aggregate?wallet=${address}`, {
      signal,
      next: { revalidate: 60 }
    })
  }
  
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error || 'Failed to load level data')
  const points: number = Number(json?.profile?.xp ?? json?.user?.total_points ?? 0) || 0
  return computeLevel(points)
}

export function useUserLevelPoints() {
  const { address, isConnected } = useActiveWallet()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['user-level-points', address],
    queryFn: ({ signal }) => fetchUserPoints(address!, signal),
    enabled: isConnected && !!address,
    staleTime: 30_000, // 30s - data is fresh for 30 seconds
    gcTime: 5 * 60_000, // 5min - cache for 5 minutes
    retry: 1,
    refetchOnWindowFocus: false, // Don't refetch on tab focus
  })

  const refetchRef = useRef(refetch)
  useEffect(() => { refetchRef.current = refetch }, [refetch])

  // Listen for refresh events
  useEffect(() => {
    const onRefresh = () => refetchRef.current()
    window.addEventListener('custom:refresh', onRefresh as any)
    window.addEventListener('peridot:tx-success' as any, onRefresh)
    return () => {
      window.removeEventListener('custom:refresh', onRefresh as any)
      window.removeEventListener('peridot:tx-success' as any, onRefresh)
    }
  }, []) // stable — refetch accessed via ref

  return { 
    data, 
    loading: isLoading, 
    error: error?.message || null, 
    refresh: refetch, 
    isConnected 
  }
}
