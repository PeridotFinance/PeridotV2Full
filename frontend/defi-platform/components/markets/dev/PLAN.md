# /app/dev — Fast Market Table: Architecture Plan

## Problem Analysis

### CombinedAssetRow.tsx (944 lines)
Every single row (N assets) fires these hooks on mount, even before the user interacts:
- `usePTokenBalance` → on-chain read per row
- `useBoostedPosition` → on-chain read per row
- `useDatabaseApy` → DB fetch per row
- `useLivePrice` → conditional, but still subscribes
- `useStellarPrice` → conditional
- `useBoostedAPR` → conditional but still initializes
- `useBorrowBalance` → on-chain read per row
- `useMarketMembership` → on-chain read per row
- `useWalletBalance` → on-chain read per row (imported but used where?)

**Total: ~10 hooks × N rows = massive RPC burst on table mount**

### AssetDropdown.tsx (4470 lines)
All hooks initialize on `isOpen` (React mount/unmount cycle on every expand):
- 6+ transaction hooks all fire simultaneously on open
- `useBorrowingPower` → heavy calculation
- `useReadContracts` batched (good) but still mounts fresh every time
- `useHybridApy` → separate from row's `useDatabaseApy` (duplicate!)
- `usePeridotRewards` → fires even if user doesn't click Manage
- `useMarketMetrics` → fetched AGAIN here (also fetched in page.tsx!)

**Animation problem: `{isExpanded && <Dropdown />}` = full React mount/unmount**
= hook teardown + reinit every time + no animation continuity

---

## New Architecture: `/components/markets/dev/`

### Core Principle: "Pay for what you show"

```
FastMarketTable (data owner)
├── Fetches ALL market data once at table level
├── Passes hydrated props to rows (no per-row network calls)
└── FastAssetRow[] (pure display)
    └── FastAssetPanel (CSS-animated, never unmounts after first open)
        ├── MetricsStrip (always visible once rendered)
        ├── SupplyPanel (always rendered, tab-switched)
        ├── BorrowPanel (lazy: renders on first tab activation)
        └── ManagePanel (lazy: renders on first tab activation)
```

---

## File Structure

```
components/markets/dev/
├── PLAN.md                    ← this file
├── FastMarketTable.tsx        ← data layer, passes everything down
├── FastAssetRow.tsx           ← lean row (<100 lines), zero network hooks
├── FastAssetPanel.tsx         ← expanded panel, CSS slide, never unmounts
├── panels/
│   ├── SupplyPanel.tsx        ← supply form + tx hook
│   ├── BorrowPanel.tsx        ← borrow form + tx hook (lazy)
│   └── ManagePanel.tsx        ← repay/withdraw (lazy)
├── hooks/
│   └── useTableData.ts        ← aggregated table-level data hook
└── ui/
    ├── MetricsStrip.tsx       ← 4-cell metrics (TVL, APY, util, price)
    └── AmountInput.tsx        ← shared input with segmented % control

app/app/dev/
└── page.tsx                   ← mirrors /app/page.tsx, uses FastMarketTable
```

---

## Key Changes vs. Current

### 1. Hook Lifting (biggest win)
**Now:** Each row calls `useDatabaseApy`, `usePTokenBalance`, `useWalletBalance` independently.
**New:** `FastMarketTable` calls ONE aggregated endpoint for all APY/balance data.
Rows receive `apyData`, `balanceData` as plain props. Zero network calls in row.

```ts
// useTableData.ts — one hook to rule them all
export function useTableData(assets: Asset[]) {
  const apyMap = useAllApys(assets)            // one batched DB call
  const balanceMap = useAllBalances(assets)    // one multicall
  const priceMap = useAllPrices(assets)        // one oracle multicall
  return { apyMap, balanceMap, priceMap }
}
```

### 2. CSS-only Expand Animation (no mount/unmount)
**Now:** `{isExpanded && <AssetDropdown />}` — full React mount/unmount cycle.
**New:** Panel renders once, visibility toggled via CSS grid-template-rows trick.

```tsx
// FastAssetPanel.tsx
<div
  className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
  style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
>
  <div className="overflow-hidden">
    {hasEverOpened && <PanelContent />}  {/* render once, persist */}
  </div>
</div>
```

This gives: buttery CSS transition, no React teardown, hooks stay alive between open/close.
`hasEverOpened` flag ensures content only mounts on first expand (not on table init).

### 3. Transaction Hooks: Tab-Lazy Loading
**Now:** All 6 tx hooks (supply/borrow/redeem/repay/magma/stellar) init simultaneously.
**New:** Each panel imports and owns its own tx hook. Panels are lazy-rendered.

```tsx
// Only rendered when user first clicks "Borrow" tab:
{activeTabs.borrow && <BorrowPanel asset={asset} />}
// BorrowPanel internally uses useBorrowTransaction — only then does it init
```

### 4. FastAssetRow — Zero Network Calls
All data from props. Row is purely presentational:

```tsx
type FastAssetRowProps = {
  asset: Asset
  supplyApy: number        // from parent
  borrowApy: number        // from parent
  balance: string          // from parent
  balanceUsd: number       // from parent
  tvl: number             // from parent
  utilization: number      // from parent
  isExpanded: boolean
  onToggle: () => void
}
// Zero hooks inside the row itself
```

### 5. Perf: `React.memo` + stable callbacks
- `FastAssetRow` wrapped in `React.memo` with custom comparator
- `onToggle` callback stable via `useCallback` at table level
- No object literals in JSX (no `style={{ }}` inline where avoidable)

---

## CSS Animation Details

### Open/Close: `grid-template-rows`
Modern browser trick — animates height without `max-height` hack:
```css
.panel-wrapper {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 280ms cubic-bezier(0.4, 0, 0.2, 1);
}
.panel-wrapper.open {
  grid-template-rows: 1fr;
}
.panel-inner {
  overflow: hidden;
  /* content here */
}
```
In Tailwind via inline style + class combo (Tailwind 3 doesn't have grid-template-rows transitions out of box).

### Row highlight on expand
```css
/* Row lifts when expanded — already done in CombinedAssetRow, keep */
tr.expanded { background: rgba(255,255,255,0.03); border-bottom: none; }
```

### Tab switching: fade-in only (no slide)
```css
.tab-content { animation: tabIn 150ms ease-out; }
@keyframes tabIn { from { opacity: 0; } to { opacity: 1; } }
```

### Amount input focus ring
```css
input:focus-within { box-shadow: 0 0 0 2px var(--primary); }
/* CSS only, no JS state */
```

---

## Sequence: What to Build

1. `useTableData.ts` — unified data hook (APY + balance + price batched)
2. `FastAssetRow.tsx` — pure presentational row, props-only
3. `FastAssetPanel.tsx` — CSS-animated panel shell + lazy tab logic
4. `panels/SupplyPanel.tsx` — supply form, owns `useSupplyTransaction`
5. `panels/BorrowPanel.tsx` — borrow form (lazy)
6. `panels/ManagePanel.tsx` — repay/withdraw (lazy)
7. `ui/MetricsStrip.tsx` — 4-metric display
8. `ui/AmountInput.tsx` — shared input with segmented % chips
9. `FastMarketTable.tsx` — table shell, orchestrates rows
10. `app/app/dev/page.tsx` — route, mirrors /app/page.tsx

---

## Expected Gains

| Metric | Current | Target |
|--------|---------|--------|
| Hook calls on table mount | ~10 × N rows | ~4 total |
| React mounts on row expand | Full remount | 0 (CSS only) |
| tx hooks on panel open | 6 simultaneous | 1 per active tab |
| Bundle size of panel | ~4470 lines loaded | Split into 3 lazy chunks |
| Expand animation | CSS animate-in (fade+slide) | CSS grid-rows (smooth height) |
| Re-renders on sibling expand | All rows re-render | Only changed row (memo) |
