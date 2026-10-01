"use client"

import React, { useEffect, useState } from "react"
import { useAccount } from "wagmi"
import { useSupplyTransaction } from "@/hooks/use-supply-transaction"
import { createWalletClient, custom, http } from "viem"
import { bsc } from "viem/chains"
import { createMeeClient, toMultichainNexusAccount, getMEEVersion, MEEVersion } from "@biconomy/abstractjs"
import { CHAIN_BY_ID } from "@/lib/biconomy/wallet"

export function CrossChainResumeBanner() {
  const { address } = useAccount()
  const [assetId, setAssetId] = useState<string | null>(null)

  // Infer last asset from URL segment when available
  useEffect(() => {
    try {
      const path = typeof window !== 'undefined' ? window.location.pathname : ''
      // naive: match /markets/[assetId]
      const m = path.match(/\/markets\/([^\/?#]+)/)
      if (m && m[1]) setAssetId(m[1])
      else setAssetId('weth') // fallback to a common asset id
    } catch {
      setAssetId('weth')
    }
  }, [])

  const hook = useSupplyTransaction({ assetId: assetId || 'weth', amount: "" })
  const [visible, setVisible] = useState(false)

  // Auto-detect last superTx using server data as a fallback, then show banner
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!address) return
      try {
        // If hook already has a saved hash, show immediately
        if (hook.hasResumableCrossChain) {
          if (!cancelled) setVisible(true)
          return
        }
        // Try AbstractJS: query last supertransaction for this owner (best-effort)
        try {
          const ethereum = (typeof window !== 'undefined') ? (window as any)?.ethereum : null
          if (ethereum) {
            const currentChainId = (await (ethereum.request?.({ method: 'eth_chainId' }) as Promise<string>)) || '0x38'
            const parsedId = (() => { try { return Number(currentChainId) } catch { return 56 } })()
            const primary = CHAIN_BY_ID[parsedId] || bsc
            const configs = [primary, bsc].reduce((acc, chain) => {
              const rpc = chain?.rpcUrls?.default?.http?.[0] || chain?.rpcUrls?.public?.http?.[0]
              if (rpc && !acc.some((c) => c.chain.id === chain.id)) acc.push({ chain, transport: http(rpc), version: getMEEVersion(MEEVersion.V2_1_0) })
              return acc
            }, [] as Array<{ chain: any; transport: any; version: any }>)
            if (configs.length) {
              const walletClient = createWalletClient({ account: address as any, chain: primary, transport: custom(ethereum) })
              const orchestrator = await toMultichainNexusAccount({ signer: walletClient as any, chainConfigurations: configs })
              const mee = await createMeeClient({ account: orchestrator as any })
              const listResp = (await (mee as any).getSupertransactions?.({ owner: address, limit: 1 }))
                || (await (mee as any).listSupertransactions?.({ owner: address, limit: 1 }))
                || []
              const first = Array.isArray(listResp) ? listResp[0] : (Array.isArray(listResp?.data) ? listResp.data[0] : null)
              const hash: string | undefined = first?.hash || first?.supertransactionHash || first?.id
              if (hash && /^0x[0-9a-fA-F]{64}$/.test(hash)) {
                try {
                  const key = `peridot:cc:lastSupply:${address.toLowerCase()}:${assetId || 'weth'}`
                  localStorage.setItem(key, JSON.stringify({ superTxHash: hash, savedAt: Date.now() }))
                } catch {}
                if (!cancelled) setVisible(true)
                return
              }
            }
          }
        } catch {
          // ignore AbstractJS failures and fallback to DB
        }
        // Otherwise ask server for latest tx we recorded
        const res = await fetch(`/api/biconomy/last?address=${address}`)
        const data = await res.json().catch(() => null)
        const hash: string | undefined = data?.data?.hash
        if (hash && /^0x[0-9a-fA-F]{64}$/.test(hash)) {
          // Stash it so hook can pick it up and we can render controls
          try {
            const key = `peridot:cc:lastSupply:${address.toLowerCase()}:${assetId || 'weth'}`
            localStorage.setItem(key, JSON.stringify({ superTxHash: hash, savedAt: Date.now() }))
          } catch {}
          if (!cancelled) setVisible(true)
        }
      } catch {
        // ignore
      }
    }
    run()
    return () => { cancelled = true }
  }, [address, assetId, hook.hasResumableCrossChain])

  if (!address || !visible) return null

  const onRetry = async () => {
    try { await hook.retryCrossChain?.() } catch {}
  }
  const onRefresh = async () => {
    try { await hook.checkResumedStatus?.() } catch {}
  }
  const onClear = () => {
    try { hook.clearResumedCrossChain?.() } catch {}
  }

  return (
    <div className="fixed top-20 inset-x-0 z-[60] flex justify-center px-3">
      <div className="w-full max-w-3xl rounded-md border bg-background/80 backdrop-blur-sm px-4 py-3 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <div className="font-medium">Cross-chain supply pending</div>
            <div className="opacity-80 text-xs mt-0.5">Resume or refresh your pending Biconomy supply.</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 rounded-md border hover:bg-muted text-xs" onClick={onRefresh}>Refresh</button>
            <button className="px-3 py-1.5 rounded-md border hover:bg-muted text-xs" onClick={onRetry}>Retry</button>
            <button className="px-3 py-1.5 rounded-md border hover:bg-muted text-xs" onClick={onClear}>Dismiss</button>
          </div>
        </div>
      </div>
    </div>
  )
}


