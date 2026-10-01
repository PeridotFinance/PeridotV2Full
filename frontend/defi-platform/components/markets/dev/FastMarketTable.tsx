"use client"

import React, { useState, useCallback, useMemo } from 'react'
import { Asset } from '@/types/markets'
import FastAssetRow from './FastAssetRow'
import FastAssetPanel from './FastAssetPanel'
import { useTableData } from './hooks/useTableData'
import type { AssetRowData } from './hooks/useTableData'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { InfoTooltip } from '@/components/ui/info-tooltip'

// Column count: 6
// [Asset] [MobileAPY: sm:hidden] [SupplyAPY: hidden sm:] [BorrowAPY: hidden sm:] [TVL: hidden sm:] [Chevron]
export const COL_SPAN = 6

interface FastMarketTableProps {
  assets: Asset[]
  isDemoMode?: boolean
  searchQuery?: string
  /**
   * Controlled expansion, for a parent that opens a market by itself (the
   * cross-chain supply reopens the market a resumed transfer belongs to).
   * Uncontrolled when omitted.
   */
  expandedAssetId?: string | null
  onExpandedChange?: (assetId: string | null) => void
}

/**
 * The column header, shared with the Robinhood lending table so both tables
 * keep one column model (see COL_SPAN).
 */
export function MarketTableHeader() {
  // Sticky header: stays visible when the user scrolls the table on mobile.
  return (
    <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
      <TableRow className="border-b border-border/40 hover:bg-transparent">
        {/* Asset */}
        <TableHead className="pl-4 sm:pl-5 py-3 text-[10px] lg:text-[11px] uppercase tracking-widest text-muted-foreground/60 font-bold">
          Asset
        </TableHead>
        {/* Mobile APY (stacked Supply + Borrow) */}
        <TableHead className="sm:hidden text-right pr-3 py-3 text-[10px] lg:text-[11px] uppercase tracking-widest text-muted-foreground/60 font-bold">
          APY
        </TableHead>
        {/* Desktop: separate columns */}
        <TableHead className="hidden sm:table-cell text-center py-3">
          <InfoTooltip 
            title="Supply APY" 
            content="The yearly interest rate you earn for providing your assets. This is passive income on your holdings."
          >
            <span className="text-[10px] lg:text-[11px] uppercase tracking-widest text-muted-foreground/60 font-bold">Supply APY</span>
          </InfoTooltip>
        </TableHead>
        <TableHead className="hidden sm:table-cell text-center py-3">
          <InfoTooltip 
            title="Borrow APY" 
            content="The yearly interest rate you pay to borrow assets. This allows you to get liquidity without selling your holdings."
          >
            <span className="text-[10px] lg:text-[11px] uppercase tracking-widest text-muted-foreground/60 font-bold">Borrow APY</span>
          </InfoTooltip>
        </TableHead>
        <TableHead className="hidden sm:table-cell text-right py-3 pr-4">
          <InfoTooltip 
            title="TVL" 
            content="Total Value Locked: The total value of all assets supplied to this pool by all users."
          >
            <span className="text-[10px] lg:text-[11px] uppercase tracking-widest text-muted-foreground/60 font-bold">TVL</span>
          </InfoTooltip>
        </TableHead>
        {/* Chevron spacer */}
        <TableHead className="w-10 pr-3 sm:pr-4" />
      </TableRow>
    </TableHeader>
  )
}

export default function FastMarketTable({
  assets,
  searchQuery,
  expandedAssetId: controlledId,
  onExpandedChange,
}: FastMarketTableProps) {
  const [ownExpandedId, setOwnExpandedId] = useState<string | null>(null)
  const controlled = controlledId !== undefined
  const expandedAssetId = controlled ? controlledId : ownExpandedId
  const { assetTableData, metricsLoading } = useTableData(assets)

  const handleToggle = useCallback(
    (assetId: string) => {
      const next = expandedAssetId === assetId ? null : assetId
      if (!controlled) setOwnExpandedId(next)
      onExpandedChange?.(next)
    },
    [expandedAssetId, controlled, onExpandedChange],
  )

  const filteredAssets = useMemo(() => {
    if (!searchQuery?.trim()) return assets
    const q = searchQuery.toLowerCase()
    return assets.filter(
      a => a.name.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q)
    )
  }, [assets, searchQuery])

  return (
    <Table>
      <MarketTableHeader />

      <TableBody>
        {filteredAssets.map(asset => {
          const data: Partial<AssetRowData> = assetTableData[asset.id] ?? {}
          const isExpanded = expandedAssetId === asset.id

          return (
            <React.Fragment key={asset.id}>
              <FastAssetRow
                asset={asset}
                isExpanded={isExpanded}
                onToggle={() => handleToggle(asset.id)}
                supplyApy={data.supplyApy ?? asset.supplyApy}
                borrowApy={data.borrowApy ?? asset.borrowApy}
                totalSupplyApy={data.totalSupplyApy}
                tvlUsd={data.tvlUsd ?? 0}
                utilizationPct={data.utilizationPct ?? 0}
                priceUsd={data.priceUsd ?? asset.price}
                isMetricsLoading={metricsLoading}
              />
              {/* Panel row: always in DOM, height driven by CSS grid trick */}
              <tr className="border-0 p-0">
                <td colSpan={COL_SPAN} className="p-0 border-0">
                  <FastAssetPanel
                    asset={asset}
                    isExpanded={isExpanded}
                    supplyApy={data.supplyApy ?? asset.supplyApy}
                    borrowApy={data.borrowApy ?? asset.borrowApy}
                    totalSupplyApy={data.totalSupplyApy}
                    tvlUsd={data.tvlUsd ?? 0}
                    utilizationPct={data.utilizationPct ?? 0}
                    priceUsd={data.priceUsd ?? asset.price}
                    chainId={data.chainId ?? asset.availableOnChainId ?? 0}
                    blendPct={data.blendPct ?? null}
                    idlePct={data.idlePct ?? null}
                    blendUsd={data.blendUsd ?? null}
                    boostSourceApy={data.boostSourceApy ?? null}
                  />
                </td>
              </tr>
            </React.Fragment>
          )
        })}

        {filteredAssets.length === 0 && (
          <tr>
            <td colSpan={COL_SPAN} className="py-16 text-center text-sm text-muted-foreground">
              {searchQuery ? `No assets match "${searchQuery}"` : 'No assets available on this network'}
            </td>
          </tr>
        )}
      </TableBody>
    </Table>
  )
}
