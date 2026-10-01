"use client"

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useNetworkContext } from '@/context'
import { getStellarSorobanMarkets } from '@/data/market-data'
import { isStellarNetwork } from '@/config/contracts'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { Asset } from '@/types/markets'
import FastMarketTable from '@/components/markets/dev/FastMarketTable'
import { TableErrorBoundary } from '@/components/markets/dev/TableErrorBoundary'
import { NetworkSwitcher, ROBINHOOD_NETWORK_ID } from '@/components/ui/network-switcher'
import RobinhoodLendingTable from '@/components/markets/robinhood/RobinhoodLendingTable'
import { RobinhoodLendingStrip } from '@/components/markets/robinhood/RobinhoodLendingStrip'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StellarFirstTimeSheet } from '@/components/wallet/StellarOnboarding'
import { useStellarOnly } from '@/config/stellarOnly'
import { StellarOnlyBanner } from '@/components/app/StellarOnlyBanner'
import { CrossChainFlowProvider } from '@/components/funding/CrossChainFlowProvider'
import { CrossChainActivityBanner } from '@/components/funding/CrossChainActivityBanner'

const STELLAR_NETWORK_ID = 'stellar-soroban-mainnet'
/** The Expert view offers exactly these two networks, on every host. */
const EXPERT_NETWORK_IDS = [STELLAR_NETWORK_ID, ROBINHOOD_NETWORK_ID]

/**
 * Robinhood Chain is an Expert-view-only market list, so its selection lives
 * here and not in the global NetworkContext: the global selection also drives
 * Easy mode and which wallet useActiveWallet reports, and neither should move
 * because someone browsed the Robinhood markets.
 */
const EXPERT_MARKETS_STORAGE_KEY = 'peridot.expertMarketsNetwork'

function readStoredExpertNetwork(): string | null {
  try {
    return window.localStorage.getItem(EXPERT_MARKETS_STORAGE_KEY)
  } catch {
    return null
  }
}

function storeExpertNetwork(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(EXPERT_MARKETS_STORAGE_KEY, id)
    else window.localStorage.removeItem(EXPERT_MARKETS_STORAGE_KEY)
  } catch {
    // Storage blocked: the choice holds for this visit only.
  }
}

// The Expert view lists Stellar and Robinhood Chain only, on every host. Stellar
// is the global NetworkContext selection (the Stellar market panels read their
// wallet from it); Robinhood Chain is Expert-local, see EXPERT_MARKETS_STORAGE_KEY.
export default function ExpertView() {
  const { selectedNetworkId, setSelectedNetworkId } = useNetworkContext()
  // Host-gated Stellar-only presentation (peridot.finance → Stellar; v1.* → full).
  const stellarOnly = useStellarOnly()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const robinhoodEnabled = FEATURE_FLAGS.ROBINHOOD_LENDING_UI
  const [expertNetwork, setExpertNetwork] = useState<string | null>(null)
  useEffect(() => {
    if (robinhoodEnabled && readStoredExpertNetwork() === ROBINHOOD_NETWORK_ID) setExpertNetwork(ROBINHOOD_NETWORK_ID)
  }, [robinhoodEnabled])

  const onRobinhood = robinhoodEnabled && expertNetwork === ROBINHOOD_NETWORK_ID
  const onStellar = !onRobinhood
  const displayedNetworkId = onRobinhood ? ROBINHOOD_NETWORK_ID : STELLAR_NETWORK_ID

  // Showing the Stellar markets means the Stellar wallet is the active one. On
  // the full host the global selection may still be an EVM chain from before,
  // so the Expert view moves it to Stellar (the Stellar-only host already is).
  useEffect(() => {
    if (onStellar && !isStellarNetwork(selectedNetworkId)) setSelectedNetworkId(STELLAR_NETWORK_ID)
  }, [onStellar, selectedNetworkId, setSelectedNetworkId])

  const handleSelectNetwork = useCallback(
    (id: string) => {
      if (id === ROBINHOOD_NETWORK_ID) {
        setExpertNetwork(ROBINHOOD_NETWORK_ID)
        storeExpertNetwork(ROBINHOOD_NETWORK_ID)
        return
      }
      setExpertNetwork(null)
      storeExpertNetwork(null)
      setSelectedNetworkId(STELLAR_NETWORK_ID)
    },
    [setSelectedNetworkId],
  )

  // Which Stellar market is open. Held here so a cross-chain supply resumed
  // after a reload can reopen the market it belongs to.
  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null)
  const crossChain = FEATURE_FLAGS.CROSS_CHAIN_EXPERT && onStellar

  const assets: Asset[] = useMemo(
    () => getStellarSorobanMarkets().filter((a) => a.category !== "stock"),
    [],
  )

  const view = (
    <div className="px-4 py-6 sm:px-6">
      <div className="max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto space-y-4">

        <div className="flex items-center gap-3">
          <h1 className="hidden sm:block sm:flex-1 sm:min-w-0 text-[15px] lg:text-lg font-semibold tracking-tight leading-none">
            {onRobinhood ? "Robinhood Chain Markets" : "Stellar Markets"}
          </h1>

          <div
            className={cn(
              "relative flex items-center transition-[width,border-color,box-shadow] duration-300 ease-out",
              "flex-1 sm:flex-none",
              searchFocused || searchQuery ? "sm:w-56" : "sm:w-36"
            )}
          >
            <Search
              className={cn(
                "absolute left-2.5 w-3.5 h-3.5 pointer-events-none transition-colors duration-200",
                searchFocused || searchQuery
                  ? "text-foreground/60"
                  : "text-muted-foreground/40"
              )}
            />
            <input
              ref={inputRef}
              data-testid="markets-search"
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search…"
              className={cn(
                "w-full pl-7 pr-6 py-1.5 rounded-lg text-[13px] font-medium",
                "bg-background/50 dark:bg-black/20",
                "border transition-[border-color,box-shadow] duration-200",
                "placeholder:text-muted-foreground/30 placeholder:font-normal",
                "focus:outline-none",
                searchFocused || searchQuery
                  ? "border-primary/40 shadow-sm"
                  : "border-border/40"
              )}
            />
            {searchQuery && (
              <button
                onMouseDown={e => { e.preventDefault(); setSearchQuery(''); inputRef.current?.focus() }}
                className="absolute right-2 text-muted-foreground/40 hover:text-muted-foreground/80 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Stellar and Robinhood Chain only. Without the Robinhood flag there
              is nothing to choose, so the picker stays hidden. */}
          {robinhoodEnabled && (
            <NetworkSwitcher
              selectedNetworkId={displayedNetworkId}
              setSelectedNetworkId={handleSelectNetwork}
              includeRobinhood
              onlyNetworkIds={EXPERT_NETWORK_IDS}
            />
          )}
        </div>

        {stellarOnly && !onRobinhood && <StellarOnlyBanner />}

        {crossChain && <CrossChainActivityBanner expandedMarketId={expandedAssetId} />}

        {/* The EVM cross-chain PortfolioStrip is gone with the EVM markets.
            Robinhood Chain has its own account strip. */}
        {onRobinhood && <RobinhoodLendingStrip />}

        <div className="border border-border/40 rounded-xl overflow-hidden bg-background" data-testid="market-table">
          <TableErrorBoundary>
            {onRobinhood ? (
              <RobinhoodLendingTable searchQuery={searchQuery} />
            ) : (
              <FastMarketTable
                assets={assets}
                searchQuery={searchQuery}
                expandedAssetId={expandedAssetId}
                onExpandedChange={setExpandedAssetId}
              />
            )}
          </TableErrorBoundary>
        </div>

      </div>

      <StellarFirstTimeSheet active={onStellar} />
    </div>
  )

  // The cross-chain supply (stage X3) lives around the Stellar markets only.
  if (!crossChain) return view
  return <CrossChainFlowProvider onFocusMarket={setExpandedAssetId}>{view}</CrossChainFlowProvider>
}
