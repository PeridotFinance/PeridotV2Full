import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { resolveHubReadChainId, CHAIN_IDS } from '@/config/contracts'
import { useMobile } from './use-mobile'

interface Point { date: string; supply: number; borrow: number; label?: string }

export function useApyTimeseries(assetId: string, chainId?: number | null, windowParam: string = '30d') {
  const isMobile = useMobile()
  const { chainId: walletChainId } = useAccount()
  const [data, setData] = useState<Point[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // Skip API calls on mobile to save resources and prevent crashes
    if (isMobile) {
      setData([])
      setIsLoading(false)
      return
    }
    
    const mainnetPreset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || '').startsWith('mainnet')
    const base = chainId ?? walletChainId ?? null
    const cid = resolveHubReadChainId(base) ?? (mainnetPreset ? CHAIN_IDS.BSC_MAINNET : base)
    if (!assetId || !cid) return
    let cancelled = false
    const run = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const res = await fetch(`/api/apy?assetId=${assetId}&chainId=${cid}&window=${windowParam}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!json.success) throw new Error('Failed to fetch timeseries')
        if (cancelled) return
        const series = (json.series || []) as Array<{ timestamp: string; supplyApy: number; borrowApy: number }>
        // APY values are already percentages. Downsample on the hook to reduce render strain.
        const mapped = series.map(p => ({
          date: p.timestamp,
          supply: p.supplyApy,
          borrow: p.borrowApy,
          label: new Date(p.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }))
        const MAX_POINTS = 365
        const reduced = mapped.length > MAX_POINTS 
          ? mapped.filter((_, i) => i % Math.ceil(mapped.length / MAX_POINTS) === 0)
          : mapped
        setData(reduced)
      } catch (e: any) {
        if (!cancelled) setError(e)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [assetId, chainId, walletChainId, windowParam, isMobile])

  return { data, isLoading, error }
}


