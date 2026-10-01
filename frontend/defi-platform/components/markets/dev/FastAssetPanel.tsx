"use client"

/**
 * FastAssetPanel — CSS-animated expanded panel
 *
 * Design decisions:
 * - Height: CSS grid-template-rows (0fr→1fr). Never mount/unmount. Hooks stay alive.
 *   Reason: React mount/unmount = tx hook re-init = 300ms lag on every open.
 * - Content entrance: opacity 0→1 + translateY(-6px→0) CSS keyframe on first open.
 *   Reason: Height animation alone feels mechanical. Content entrance = organic.
 * - Glass surface: backdrop-blur-xl + bg-white/[0.03] using .glass class from globals.
 *   Reason: Consistent with app's existing glass language. Panel feels like a layer above.
 * - Tabs: one per action — Supply, Withdraw, Borrow, Repay — plus Charts, the
 *   read-only history view. Full-width on mobile (equal columns, thumb-friendly).
 *   Reason: Bottom-of-screen reach on 375px. All actions reachable with one thumb.
 * - Active tab: border-bottom indicator (CSS, no JS). Slides feel via CSS transition.
 *   Reason: Pure CSS, zero JS overhead. Tab switch is instant.
 * - Lazy panels: everything but Supply only mounts on first click.
 *   Reason: Each panel owns tx hooks. Mounting all = many simultaneous hook inits.
 *   Withdraw/Repay were already mutually exclusive inside the old Manage tab,
 *   so promoting them to tabs costs no extra hook init.
 */

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { cn } from '@/lib/utils'
import { Asset } from '@/types/markets'
import { useLivePrice } from '@/hooks/use-live-price'
import MetricsStrip from './ui/MetricsStrip'
import LiquidityAllocation from './ui/LiquidityAllocation'
import SupplyPanel from './panels/SupplyPanel'
import { XC_FOCUS_TAB_EVENT } from '@/lib/crosschain/present'

const BorrowPanel = lazy(() => import('./panels/BorrowPanel'))
// Withdraw, Repay and the collateral toggle share one module (ActionForm,
// the collateral view, the EVM/Stellar branching) — three lazy() calls on
// the same import means one chunk fetched once, not three.
const WithdrawPanel = lazy(() => import('./panels/ManagePanel').then(m => ({ default: m.WithdrawPanel })))
const RepayPanel = lazy(() => import('./panels/ManagePanel').then(m => ({ default: m.RepayPanel })))
// Charts pull in recharts — a heavy dependency the four action tabs don't
// need, so it must stay behind its own lazy boundary.
const ChartsPanel = lazy(() => import('./panels/ChartsPanel'))

type Tab = 'supply' | 'withdraw' | 'borrow' | 'repay' | 'charts'

/*
  Ordered as two pairs: the asset side (what you put in / take out) then
  the debt side (what you owe / pay back). Replaces Supply·Borrow·Manage —
  Withdraw and Repay are inverse primary actions, not settings, and users
  were hunting for them inside a tab labelled with a noun.
  Charts sits last: it's the only tab that doesn't transact, so it stays out
  of the action rhythm rather than splitting a pair.
*/
const TABS: { key: Tab; label: string; color: string }[] = [
  { key: 'supply', label: 'Supply', color: 'text-emerald-400' },
  { key: 'withdraw', label: 'Withdraw', color: 'text-emerald-300' },
  { key: 'borrow', label: 'Borrow', color: 'text-amber-400' },
  { key: 'repay', label: 'Repay', color: 'text-amber-300' },
  { key: 'charts', label: 'Charts', color: 'text-sky-400' },
]

interface FastAssetPanelProps {
  asset: Asset
  isExpanded: boolean
  supplyApy: number
  borrowApy: number
  totalSupplyApy?: number
  tvlUsd: number
  utilizationPct: number
  priceUsd: number
  /** Chain the row's metrics were read from — the Charts tab queries by it. */
  chainId?: number
  /** Boosted-market split (Peridot vs. Blend); null on unboosted markets. */
  blendPct?: number | null
  idlePct?: number | null
  blendUsd?: number | null
  /** Blend's own yield, shown against the Blend node in the allocation view. */
  boostSourceApy?: number | null
}

function FastAssetPanelInner({
  asset,
  isExpanded,
  supplyApy,
  borrowApy,
  totalSupplyApy,
  tvlUsd,
  utilizationPct,
  priceUsd,
  chainId,
  blendPct = null,
  idlePct = null,
  blendUsd = null,
  boostSourceApy = null,
}: FastAssetPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('supply')
  const [hasEverOpened, setHasEverOpened] = useState(false)
  const [renderedTabs, setRenderedTabs] = useState<Set<Tab>>(new Set())
  const panelRef = useRef<HTMLDivElement>(null)

  // Live oracle price — only fetches when panel is expanded.
  // Falls back to priceUsd from metrics endpoint when not yet loaded.
  const { price: livePrice } = useLivePrice({
    assetId: asset.id,
    enabled: isExpanded && !!asset.availableOnChainId,
  })

  useEffect(() => {
    if (isExpanded && !hasEverOpened) {
      setHasEverOpened(true)
      // Merge, not replace: a tab asked for by a resumed transfer may already be in.
      setRenderedTabs(prev => new Set<Tab>([...Array.from(prev), 'supply']))
    }
  }, [isExpanded, hasEverOpened])

  // A cross-chain flow resumed after a reload opens its market on the tab it
  // was started from (a withdrawal on Withdraw), so the steps are where the
  // user left them.
  useEffect(() => {
    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent<{ marketId: string; tab: Tab }>).detail
      if (detail?.marketId !== asset.id) return
      setActiveTab(detail.tab)
      setRenderedTabs(prev => (prev.has(detail.tab) ? prev : new Set<Tab>([...Array.from(prev), detail.tab])))
    }
    window.addEventListener(XC_FOCUS_TAB_EVENT, onFocus)
    return () => window.removeEventListener(XC_FOCUS_TAB_EVENT, onFocus)
  }, [asset.id])

  // Scroll panel into view on mobile when expanded.
  // 80ms delay lets the grid-template-rows animation start first.
  useEffect(() => {
    if (!isExpanded) return
    const t = setTimeout(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 80)
    return () => clearTimeout(t)
  }, [isExpanded])

  function handleTabChange(tab: Tab) {
    setActiveTab(tab)
    if (!renderedTabs.has(tab)) {
      setRenderedTabs(prev => new Set([...prev, tab]))
    }
  }

  return (
    // Keyframes are in globals.css (devPanelContentIn, .dev-panel-content, .dev-tab-indicator)
    // Inline <style> removed — browser parses once at load, not per-component-mount.
    <div
      ref={panelRef}
      className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
    >
        <div className="overflow-hidden min-h-0">
          {hasEverOpened && (
            <div className="dev-panel-content">
              {/*
                Flat surface for Trade Republic style.
                Border-top: subtle separator from the row above.
              */}
              <div className="bg-muted/5 dark:bg-black/10 border-t border-border/40">

                {/* ── METRICS STRIP ──────────────────────── */}
                <MetricsStrip
                  asset={asset}
                  supplyApy={totalSupplyApy ?? supplyApy}
                  borrowApy={borrowApy}
                  tvlUsd={tvlUsd}
                  utilizationPct={utilizationPct}
                  priceUsd={livePrice ?? priceUsd}
                  isLivePrice={livePrice != null}
                  blendPct={blendPct}
                  idlePct={idlePct}
                  blendUsd={blendUsd}
                />

                {/*
                  ── LIQUIDITY ALLOCATION ────────────────────────
                  Only boosted markets route capital off the Peridot vault, so
                  only they owe the user this breakdown. Everywhere else the
                  metrics strip already tells the whole story.
                */}
                {typeof blendPct === 'number' && blendPct > 0 && (
                  <LiquidityAllocation
                    tvlUsd={tvlUsd}
                    utilizationPct={utilizationPct}
                    blendPct={blendPct}
                    idlePct={idlePct ?? Math.max(0, 100 - utilizationPct - blendPct)}
                    blendUsd={blendUsd}
                    blendApy={boostSourceApy}
                    borrowApy={borrowApy}
                  />
                )}

                {/*
                  COLLATERAL lives at the bottom of the Supply tab now (see
                  SupplyPanel.SuppliedCollateralSection). Above the tab bar it
                  greeted every visitor with a switch that does nothing until
                  something is supplied; it only becomes a decision once the
                  market is funded, so it follows the supply action instead.
                */}

                {/*
                  TAB BAR
                  Mobile: full-width (4 equal flex columns) so all tabs reachable
                  with one thumb — critical for mobile-first UX.
                  Padding/type step down below sm: at 375px each column is ~93px,
                  and "Withdraw" at text-sm + px-5 does not fit.
                  Desktop: left-aligned, natural width.
                  Active: border-bottom-2 primary indicator.
                  No JS sliding — CSS transition on the border and color is enough.
                */}
                <div className="relative flex border-b border-border/40">
                  {TABS.map(({ key, label, color }) => (
                    <button
                      key={key}
                      onClick={() => handleTabChange(key)}
                      className={cn(
                        // Mobile: flex-1 = equal columns. Desktop: auto width.
                        "flex-1 sm:flex-none",
                        // whitespace-nowrap: a wrapped label would double the row
                        // height and detach the underline indicator.
                        "relative px-1.5 py-3 text-xs whitespace-nowrap sm:px-5 sm:text-sm font-semibold",
                        "transition-all duration-200",
                        // Touch target: min 44px height via py-3
                        "min-h-[44px]",
                        // Active state
                        activeTab === key
                          ? cn("text-foreground after:absolute after:bottom-0 after:left-1.5 after:right-1.5 sm:after:left-3 sm:after:right-3 after:h-[2px] after:rounded-full after:bg-primary", color)
                          : "text-muted-foreground hover:text-foreground/80"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* ── TAB CONTENT ────────────────────────── */}
                {/*
                  Lazy render + never unmount:
                  - Panel mounts on first tab click (not on table init)
                  - Once mounted, visibility toggled via display (block/hidden)
                  - Hooks stay alive between tab switches (no re-init)
                */}
                <div className="px-4 py-4 sm:px-5 sm:py-5">
                  <div className={activeTab === 'supply' ? 'block' : 'hidden'}>
                    {renderedTabs.has('supply') && (
                      <SupplyPanel
                        asset={asset}
                        supplyApy={totalSupplyApy ?? supplyApy}
                        priceUsd={livePrice ?? priceUsd}
                      />
                    )}
                  </div>

                  <div className={activeTab === 'withdraw' ? 'block' : 'hidden'}>
                    {renderedTabs.has('withdraw') && (
                      <Suspense fallback={<PanelSkeleton />}>
                        <WithdrawPanel asset={asset} />
                      </Suspense>
                    )}
                  </div>

                  <div className={activeTab === 'borrow' ? 'block' : 'hidden'}>
                    {renderedTabs.has('borrow') && (
                      <Suspense fallback={<PanelSkeleton />}>
                        <BorrowPanel
                          asset={asset}
                          borrowApy={borrowApy}
                          priceUsd={livePrice ?? priceUsd}
                        />
                      </Suspense>
                    )}
                  </div>

                  <div className={activeTab === 'repay' ? 'block' : 'hidden'}>
                    {renderedTabs.has('repay') && (
                      <Suspense fallback={<PanelSkeleton />}>
                        <RepayPanel asset={asset} />
                      </Suspense>
                    )}
                  </div>

                  <div className={activeTab === 'charts' ? 'block' : 'hidden'}>
                    {renderedTabs.has('charts') && (
                      <Suspense fallback={<PanelSkeleton />}>
                        <ChartsPanel
                          asset={asset}
                          chainId={chainId ?? asset.availableOnChainId ?? 0}
                          blendPct={blendPct}
                        />
                      </Suspense>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
    </div>
  )
}

const FastAssetPanel = React.memo(FastAssetPanelInner)
export default FastAssetPanel

function PanelSkeleton() {
  return (
    <div className="space-y-3 py-2">
      <div className="h-12 rounded-xl bg-white/[0.05] animate-pulse" />
      <div className="h-8 rounded-lg bg-white/[0.04] animate-pulse" />
      <div className="h-11 rounded-xl bg-white/[0.05] animate-pulse" />
    </div>
  )
}
