"use client"

import { useState } from "react"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getPointsPolicy, getThrottleFactorFromPolicy, type ActionType } from "@/lib/rewards/policy"
import { ControlRow, StatTile, WidgetFrame, formatUsd } from "./viz"

/**
 * Points preview built on the exact production policy (lib/rewards/policy.ts):
 * base points per action + first matching USD bonus tier, the <$1 anti-spam
 * rule, then the daily throttle factor with ceil-rounding, identical to the
 * verification pipeline's calculateTransactionPoints + throttle application.
 */
const ACTIONS: Array<{ key: ActionType; label: string }> = [
  { key: "supply", label: "Deposit" },
  { key: "borrow", label: "Borrow" },
  { key: "repay", label: "Repay" },
  { key: "redeem", label: "Withdraw" },
]

const PRESET = "mainnet-bsc-only" // document live mainnet values

export function PointsCalculator() {
  const [action, setAction] = useState<ActionType>("supply")
  const [usd, setUsd] = useState(500)
  const [ordinal, setOrdinal] = useState(1)

  const policy = getPointsPolicy(PRESET)

  const base = policy.basePoints ? policy.basePoints[action] : 0
  const bonus = policy.usdBonusThresholds.find((t) => usd >= t.minUsd)?.add ?? 0
  const antiSpam = usd < 1
  const raw = antiSpam ? 1 : base + bonus
  const throttle = getThrottleFactorFromPolicy(ordinal, PRESET)
  const total = Math.ceil(raw * throttle)

  return (
    <WidgetFrame
      title="Points calculator"
      subtitle="Live mainnet policy: the same numbers the verification pipeline awards."
    >
      <Tabs value={action} onValueChange={(v) => setAction(v as ActionType)} className="mb-5">
        <TabsList>
          {ACTIONS.map((a) => (
            <TabsTrigger key={a.key} value={a.key} className="text-xs md:text-sm">
              {a.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-5">
          <ControlRow label="Transaction value" value={formatUsd(usd)}>
            <Slider value={[usd]} onValueChange={(v) => setUsd(v[0])} min={0} max={60000} step={50} />
          </ControlRow>
          <ControlRow label="Your nth transaction today" value={`#${ordinal}`}>
            <Slider value={[ordinal]} onValueChange={(v) => setOrdinal(v[0])} min={1} max={15} step={1} />
          </ControlRow>
        </div>

        <div className="min-w-0">
          <div className="rounded-xl border border-border/60 bg-background/60 px-4 py-4 font-mono text-sm tabular-nums">
            {antiSpam ? (
              <p className="text-muted-foreground">
                Value under $1 → flat <span className="text-foreground font-semibold">1 point</span> (anti-spam rule)
              </p>
            ) : (
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base ({action})</span>
                  <span>{base}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Size bonus (≥ {formatUsd(policy.usdBonusThresholds.find((t) => usd >= t.minUsd)?.minUsd ?? 0)})</span>
                  <span>{bonus > 0 ? `+${bonus}` : "none"}</span>
                </div>
                <div className="flex justify-between border-t border-border/40 pt-1.5">
                  <span className="text-muted-foreground">Daily throttle (tx #{ordinal})</span>
                  <span>× {throttle}</span>
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatTile label="Points awarded" value={String(total)} tone="success" />
            <StatTile
              label="Daily login"
              value={`+${policy.dailyLoginPoints}`}
              hint="once per day, on top of transactions"
            />
          </div>
        </div>
      </div>
    </WidgetFrame>
  )
}
