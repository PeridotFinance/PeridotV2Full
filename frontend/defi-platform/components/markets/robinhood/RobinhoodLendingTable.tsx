"use client"

/**
 * The Expert view's market table for Robinhood Chain: USDG and NVDA lending.
 *
 * Same columns, rows and expand behaviour as FastMarketTable, but fed from
 * live on-chain reads (hooks/use-robinhood-lending.ts) instead of the APY and
 * metrics tables, which only the hub-chain workers fill. The rows reuse
 * FastAssetRow as-is; only the position badge comes from here.
 */

import React, { useCallback, useMemo, useState } from 'react'
import { Zap } from 'lucide-react'
import { Table, TableBody } from '@/components/ui/table'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import FastAssetRow from '@/components/markets/dev/FastAssetRow'
import { COL_SPAN, MarketTableHeader } from '@/components/markets/dev/FastMarketTable'
import type { Asset } from '@/types/markets'
import {
  ROBINHOOD_LENDING_MARKETS,
  robinhoodUsd18ToNumber,
  usd18,
  type RobinhoodLendingAccount,
  type RobinhoodLendingMarket,
  type RobinhoodLendingMarketState,
} from '@/lib/robinhood/lending'
import { useRobinhoodLendingAccount, useRobinhoodLendingMarkets } from '@/hooks/use-robinhood-lending'
import RobinhoodLendingPanel from './RobinhoodLendingPanel'
import { boostedHint, isBoostedShare } from './format'

function toAsset(market: RobinhoodLendingMarket, state: RobinhoodLendingMarketState | undefined): Asset {
  return {
    id: market.id,
    name: market.name,
    symbol: market.symbol,
    icon: market.icon,
    supplyApy: state?.supplyApy ?? 0,
    borrowApy: state?.borrowApy ?? 0,
    wallet: '',
    change24h: 0,
    price: state?.priceUsd ?? 0,
    marketCap: '',
    volume24h: '',
    liquidity: '',
    decimals: market.decimals,
    hasSmartContract: true,
    isBorrowable: true,
    canBeCollateral: true,
    category: market.symbol === 'NVDA' ? 'stock' : 'crypto',
  }
}

function fmtBadge(usd: number): string {
  if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}K`
  if (usd >= 0.01) return `$${usd.toFixed(2)}`
  return '<$0.01'
}

/** "↑ supplied ↓ borrowed", like the EVM badge, from the Robinhood account read. */
function PositionBadge({ state, account }: { state?: RobinhoodLendingMarketState; account?: RobinhoodLendingAccount }) {
  const pos = account?.positions.find((p) => p.market.id === state?.market.id)
  const price = state?.referencePriceUsd18
  if (!pos || !price) return null
  const suppliedUsd = pos.supplied ? robinhoodUsd18ToNumber(usd18(pos.supplied, price, pos.market.decimals)) : 0
  const borrowedUsd = pos.borrowed ? robinhoodUsd18ToNumber(usd18(pos.borrowed, price, pos.market.decimals)) : 0
  const hasSupply = (pos.supplied ?? 0n) > 0n
  const hasBorrow = (pos.borrowed ?? 0n) > 0n
  if (!hasSupply && !hasBorrow) return null
  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      {hasSupply && (
        <span className="text-[10px] font-mono tabular-nums font-medium text-emerald-400/80 dark:text-emerald-400/70">
          ↑ {fmtBadge(suppliedUsd)}
        </span>
      )}
      {hasBorrow && (
        <span className="text-[10px] font-mono tabular-nums font-medium text-amber-400/70 dark:text-amber-400/60">
          ↓ {fmtBadge(borrowedUsd)}
        </span>
      )}
      {pos.isCollateral && hasSupply && (
        <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground/60">Collateral</span>
      )}
    </div>
  )
}

/**
 * "Boosted" beside the supply APY. The vault's share of the yield is not in
 * that rate, so the row says where it comes from instead of showing a number.
 * The tooltip opens on tap too; the click stays out of the row's toggle.
 */
function BoostedNote({ state }: { state?: RobinhoodLendingMarketState }) {
  if (!state || !isBoostedShare(state.vaultShare)) return null
  return (
    <span onClick={(e) => e.stopPropagation()} className="inline-flex">
      <InfoTooltip title="Boosted" content={boostedHint(state.vaultShare, state.vaultPaused)}>
        <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-emerald-500/90 dark:text-emerald-400/80">
          <Zap className="h-2.5 w-2.5" aria-hidden />
          Boosted
        </span>
      </InfoTooltip>
    </span>
  )
}

export default function RobinhoodLendingTable({ searchQuery }: { searchQuery?: string }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const markets = useRobinhoodLendingMarkets()
  const account = useRobinhoodLendingAccount()

  const toggle = useCallback((id: string) => setExpanded((prev) => (prev === id ? null : id)), [])

  const rows = useMemo(() => {
    const q = searchQuery?.trim().toLowerCase()
    return ROBINHOOD_LENDING_MARKETS.filter(
      (m) => !q || m.name.toLowerCase().includes(q) || m.symbol.toLowerCase().includes(q),
    ).map((market) => {
      const state = markets.data?.markets.find((s) => s.market.id === market.id)
      return { market, state, asset: toAsset(market, state) }
    })
  }, [markets.data, searchQuery])

  const loading = markets.isLoading && !markets.data

  return (
    <Table>
      <MarketTableHeader />
      <TableBody>
        {rows.map(({ market, state, asset }) => {
          const isExpanded = expanded === market.id
          return (
            <React.Fragment key={market.id}>
              <FastAssetRow
                asset={asset}
                isExpanded={isExpanded}
                onToggle={() => toggle(market.id)}
                supplyApy={state?.supplyApy ?? null}
                borrowApy={state?.borrowApy ?? null}
                tvlUsd={state?.tvlUsd ?? 0}
                utilizationPct={state?.utilizationPct ?? 0}
                priceUsd={state?.priceUsd ?? 0}
                isMetricsLoading={loading}
                positionBadge={<PositionBadge state={state} account={account.data} />}
                supplyNote={<BoostedNote state={state} />}
              />
              <tr className="border-0 p-0">
                <td colSpan={COL_SPAN} className="p-0 border-0">
                  <RobinhoodLendingPanel
                    marketId={market.id}
                    isExpanded={isExpanded}
                    markets={markets.data}
                    account={account.data}
                    accountLoading={account.isLoading}
                  />
                </td>
              </tr>
            </React.Fragment>
          )
        })}

        {rows.length === 0 && (
          <tr>
            <td colSpan={COL_SPAN} className="py-16 text-center text-sm text-muted-foreground">
              {searchQuery ? `No assets match "${searchQuery}"` : 'No assets available on this network'}
            </td>
          </tr>
        )}

        {markets.error && !markets.data && (
          <tr>
            <td colSpan={COL_SPAN} className="py-6 text-center text-xs text-muted-foreground">
              Robinhood Chain did not answer. The table retries on its own.
            </td>
          </tr>
        )}
      </TableBody>
    </Table>
  )
}
