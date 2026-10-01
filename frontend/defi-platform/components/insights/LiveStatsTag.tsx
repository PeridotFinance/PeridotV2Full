"use client"

import { useEffect, useMemo, useState } from "react"

interface LiveStatResponse {
  label: string
  value: string
  trend: "up" | "down" | "flat"
  timestamp: string
}

interface AssetState {
  data: LiveStatResponse | null
  inflight: Promise<void> | null
  listeners: Set<(value: LiveStatResponse | null) => void>
  timer: number | null
  lastFetchAt: number
}

const assetStore = new Map<string, AssetState>()
const pollEveryMs = 45_000
const ttlMs = 15_000

function getAssetState(asset: string): AssetState {
  const existing = assetStore.get(asset)
  if (existing) return existing

  const next: AssetState = {
    data: null,
    inflight: null,
    listeners: new Set(),
    timer: null,
    lastFetchAt: 0,
  }
  assetStore.set(asset, next)
  return next
}

function notify(asset: string) {
  const state = getAssetState(asset)
  for (const listener of state.listeners) {
    listener(state.data)
  }
}

async function fetchAsset(asset: string, force = false) {
  const state = getAssetState(asset)
  const now = Date.now()

  if (!force && state.data && now - state.lastFetchAt < ttlMs) return
  if (state.inflight) return state.inflight

  state.inflight = (async () => {
    try {
      const response = await fetch(`/api/insights/live-stats?asset=${encodeURIComponent(asset)}`, {
        cache: "no-store",
      })
      if (!response.ok) return
      const json = (await response.json()) as LiveStatResponse
      state.data = json
      state.lastFetchAt = Date.now()
      notify(asset)
    } catch {
      // Silent fallback for non-blocking UI tags.
    }
  })().finally(() => {
    state.inflight = null
  })

  return state.inflight
}

function startPolling(asset: string) {
  const state = getAssetState(asset)
  if (state.timer !== null) return

  void fetchAsset(asset, true)
  state.timer = window.setInterval(() => {
    void fetchAsset(asset, true)
  }, pollEveryMs)
}

function stopPollingIfUnused(asset: string) {
  const state = getAssetState(asset)
  if (state.listeners.size === 0 && state.timer !== null) {
    window.clearInterval(state.timer)
    state.timer = null
  }
}

function subscribe(asset: string, listener: (value: LiveStatResponse | null) => void) {
  const state = getAssetState(asset)
  state.listeners.add(listener)
  listener(state.data)

  startPolling(asset)
  void fetchAsset(asset)

  return () => {
    const next = getAssetState(asset)
    next.listeners.delete(listener)
    stopPollingIfUnused(asset)
  }
}

export function LiveStatsTag({ asset }: { asset: string }) {
  const normalizedAsset = useMemo(() => asset.toUpperCase(), [asset])
  const [data, setData] = useState<LiveStatResponse | null>(null)

  useEffect(() => {
    const unsubscribe = subscribe(normalizedAsset, (value) => setData(value))
    return unsubscribe
  }, [normalizedAsset])

  if (!data) {
    return <span className="insights-live-tag is-loading">Live ...</span>
  }

  return (
    <span className={`insights-live-tag trend-${data.trend}`} title={`Updated ${new Date(data.timestamp).toLocaleTimeString("en-US")}`}>
      {data.label}: {data.value}
    </span>
  )
}
