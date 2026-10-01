"use client"

import { useState } from "react"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { ControlRow, StatTile, WidgetFrame, formatUsd } from "./viz"

/**
 * Health-factor stress test. Mirrors the borrow-limit math used by the app
 * (hooks/use-borrowing-power.ts): only the collateral factor of the supplied
 * asset and the borrowed value matter.
 *
 *   borrowLimit  = collateralValue × collateralFactor
 *   healthFactor = borrowLimit / borrowedValue     (below 1.0 → liquidatable)
 *
 * Collateral factors are the live Stellar market parameters from
 * config/contracts.ts (XLM 70%, USDC 90%, EURC 90%).
 */
const ASSETS = {
  XLM: { cf: 0.7, volatile: true },
  USDC: { cf: 0.9, volatile: false },
  EURC: { cf: 0.9, volatile: false },
} as const

type AssetKey = keyof typeof ASSETS

export function HealthFactorSimulator() {
  const [asset, setAsset] = useState<AssetKey>("XLM")
  const [collateral, setCollateral] = useState(1000)
  const [borrowPctOfLimit, setBorrowPctOfLimit] = useState(50)
  const [priceChange, setPriceChange] = useState(0)

  const { cf, volatile } = ASSETS[asset]

  // The borrow is fixed in USD; the collateral value moves with the price slider.
  const borrowLimitAtEntry = collateral * cf
  const borrowed = (borrowPctOfLimit / 100) * borrowLimitAtEntry
  const collateralNow = collateral * (1 + (volatile ? priceChange : 0) / 100)
  const limitNow = collateralNow * cf
  const hf = borrowed > 0 ? limitNow / borrowed : Infinity

  // Price drop (from current entry value) that brings HF to exactly 1.0.
  const dropToLiquidation =
    borrowed > 0 && volatile ? Math.max(0, (1 - borrowed / (collateral * cf)) * 100) : null

  const tone = hf === Infinity || hf >= 1.5 ? "success" : hf >= 1.15 ? "warning" : "critical"
  const meterPct = hf === Infinity ? 100 : Math.max(0, Math.min(100, ((hf - 1) / 1) * 100))

  return (
    <WidgetFrame
      title="Health-factor simulator"
      subtitle="Pick collateral, take out a loan, then crash the price, and watch where liquidation kicks in."
    >
      <Tabs value={asset} onValueChange={(v) => { setAsset(v as AssetKey); setPriceChange(0) }} className="mb-5">
        <TabsList>
          {(Object.keys(ASSETS) as AssetKey[]).map((key) => (
            <TabsTrigger key={key} value={key} className="text-xs md:text-sm">
              {key}
              <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{ASSETS[key].cf * 100}% CF</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-5">
          <ControlRow label="Collateral supplied" value={formatUsd(collateral)}>
            <Slider value={[collateral]} onValueChange={(v) => setCollateral(v[0])} min={100} max={10000} step={100} />
          </ControlRow>
          <ControlRow label="Borrowed (of your limit)" value={`${borrowPctOfLimit}% · ${formatUsd(borrowed)}`}>
            <Slider value={[borrowPctOfLimit]} onValueChange={(v) => setBorrowPctOfLimit(v[0])} min={0} max={99} step={1} />
          </ControlRow>
          <ControlRow
            label={volatile ? `${asset} price change` : "Price change (stablecoin)"}
            value={volatile ? `${priceChange > 0 ? "+" : ""}${priceChange}%` : "≈ $1.00 (pegged)"}
          >
            <Slider
              value={[priceChange]}
              onValueChange={(v) => setPriceChange(v[0])}
              min={-80}
              max={80}
              step={1}
              disabled={!volatile}
            />
          </ControlRow>
          {!volatile ? (
            <p className="text-xs text-muted-foreground">
              Stablecoin collateral barely moves in USD terms, which is why it gets the higher collateral
              factor. Switch to XLM to stress-test a volatile position.
            </p>
          ) : null}
        </div>

        <div className="min-w-0">
          {/* Health meter: status color plus explicit label, never color alone */}
          <div className="rounded-xl border border-border/60 bg-background/60 px-4 py-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Health factor
              </span>
              <span
                className={cn(
                  "font-mono text-2xl font-semibold tabular-nums",
                  tone === "success" && "text-emerald-600 dark:text-emerald-400",
                  tone === "warning" && "text-amber-600 dark:text-amber-400",
                  tone === "critical" && "text-red-600 dark:text-red-400",
                )}
              >
                {hf === Infinity ? "∞" : hf.toFixed(2)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  tone === "success" && "bg-emerald-500",
                  tone === "warning" && "bg-amber-500",
                  tone === "critical" && "bg-red-500",
                )}
                style={{ width: `${meterPct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {hf === Infinity
                ? "Nothing borrowed, so there is no liquidation risk."
                : hf < 1
                  ? "Below 1.00: this position would be liquidated."
                  : tone === "success"
                    ? "Comfortable buffer."
                    : tone === "warning"
                      ? "Getting close. Consider repaying or adding collateral."
                      : "Danger zone: a small move liquidates this position."}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Collateral value" value={formatUsd(collateralNow)} hint={volatile && priceChange !== 0 ? `${priceChange > 0 ? "+" : ""}${priceChange}% price move` : undefined} />
            <StatTile label="Borrow limit" value={formatUsd(limitNow)} hint={`${cf * 100}% of collateral`} />
            <StatTile
              label="Drop to liquidation"
              value={dropToLiquidation === null ? "n/a" : borrowed === 0 ? "n/a" : `−${dropToLiquidation.toFixed(0)}%`}
              hint={volatile ? "price fall that sets HF to 1.0" : "stablecoins hold their price"}
            />
          </div>
        </div>
      </div>
    </WidgetFrame>
  )
}
