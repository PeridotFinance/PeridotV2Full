"use client"

import { useState } from "react"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ControlRow, StatTile, WidgetFrame, formatUsd } from "./viz"

/**
 * Margin liquidation preview. Same maintenance-margin logic as the app's
 * app/app/margin/lib/marginMath.ts `liquidationPrice` (V3 perps, NOT the
 * lending collateral-factor formula), evaluated at entry where
 *
 *   positionValue = margin × leverage        debtValue = margin × (leverage − 1)
 *
 *   Long:  liq = entry × (lev − 1) / (lev × (1 − mm))
 *   Short: liq = entry × (1 − mm) × lev / (lev − 1)
 *
 * with maintenance margin mm = 5% (STELLAR_MARGIN_CONFIG.MAINTENANCE_MARGIN).
 * Display estimate only; on-chain get_health_factor is the source of truth.
 */
const MAINTENANCE_MARGIN = 0.05
const MAX_LEVERAGE = 5

type Side = "Long" | "Short"

export function MarginLiquidationCalculator() {
  const [side, setSide] = useState<Side>("Long")
  const [margin, setMargin] = useState(100)
  const [leverage, setLeverage] = useState(3)
  const entry = 0.3 // illustrative XLM/USD entry price

  const keep = 1 - MAINTENANCE_MARGIN
  const positionValue = margin * leverage
  const debtValue = margin * (leverage - 1)
  const liq =
    side === "Long"
      ? (entry * (leverage - 1)) / (leverage * keep)
      : (entry * keep * leverage) / (leverage - 1)
  const movePct = ((liq - entry) / entry) * 100
  const hfAtEntry = (positionValue * keep) / Math.max(debtValue, 1e-9)

  return (
    <WidgetFrame
      title="Liquidation-price calculator"
      subtitle={`XLM/USDT at an illustrative ${formatUsd(entry, 2)} entry: see how leverage squeezes your room for error.`}
    >
      <Tabs value={side} onValueChange={(v) => setSide(v as Side)} className="mb-5">
        <TabsList>
          <TabsTrigger value="Long" className="text-xs md:text-sm">Long (price up = profit)</TabsTrigger>
          <TabsTrigger value="Short" className="text-xs md:text-sm">Short (price down = profit)</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-5">
          <ControlRow label="Your margin (USDT)" value={formatUsd(margin)}>
            <Slider value={[margin]} onValueChange={(v) => setMargin(v[0])} min={10} max={1000} step={10} />
          </ControlRow>
          <ControlRow label="Leverage" value={`${leverage}×`}>
            <Slider value={[leverage]} onValueChange={(v) => setLeverage(v[0])} min={2} max={MAX_LEVERAGE} step={1} />
          </ControlRow>
          <p className="text-xs text-muted-foreground">
            Position = margin × leverage; the protocol lends the rest ({formatUsd(debtValue)}). Interest on
            that debt accrues while the position is open and is folded into your PnL.
          </p>
        </div>

        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Position size" value={formatUsd(positionValue)} />
            <StatTile label="Borrowed" value={formatUsd(debtValue)} />
            <StatTile label="Health factor at entry" value={hfAtEntry.toFixed(2)} hint="must open ≥ 1.10" />
            <StatTile
              label="Liquidation price"
              value={formatUsd(liq, 4)}
              tone={Math.abs(movePct) < 25 ? "critical" : Math.abs(movePct) < 45 ? "warning" : undefined}
            />
            <StatTile
              label="Price move to liquidation"
              value={`${movePct > 0 ? "+" : ""}${movePct.toFixed(1)}%`}
              hint={side === "Long" ? "a fall this size liquidates" : "a rise this size liquidates"}
            />
            <StatTile label="Maintenance margin" value="5%" hint="+1% liquidation incentive" />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Estimate at entry, ignoring accrued interest and fees. The on-chain health factor decides, never
            the UI.
          </p>
        </div>
      </div>
    </WidgetFrame>
  )
}
