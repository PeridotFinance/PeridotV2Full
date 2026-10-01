"use client"

import { useMemo, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AXIS_PROPS,
  CHART_TOOLTIP_STYLE,
  ChartLegend,
  ControlRow,
  SERIES,
  StatTile,
  WidgetFrame,
} from "./viz"

/**
 * Interactive jump-rate-model curve. Same shape as the on-chain model read by
 * hooks/use-interest-rate-curve.ts, expressed directly in annual percent so the
 * sliders are human-readable:
 *
 *   borrowAPR(u) = base + min(u, kink)·mult + max(0, u − kink)·jump
 *   supplyAPR(u) = borrowAPR(u) · u · (1 − reserveFactor)
 *
 * Presets mirror the two Stellar models: a stable-asset curve (USDC/EURC) and a
 * volatile-asset curve (XLM). Parameter values are illustrative defaults, not
 * live on-chain reads.
 */
const PRESETS = {
  stable: { label: "Stablecoins (USDC, EURC)", base: 0, mult: 5, jump: 109, kink: 80, reserve: 10 },
  volatile: { label: "Volatile (XLM)", base: 2, mult: 20, jump: 300, kink: 80, reserve: 20 },
} as const

type PresetKey = keyof typeof PRESETS

export function RateCurveExplorer() {
  const [preset, setPreset] = useState<PresetKey>("stable")
  const [params, setParams] = useState({ ...PRESETS.stable })
  const [utilization, setUtilization] = useState(65)

  const applyPreset = (key: PresetKey) => {
    setPreset(key)
    setParams({ ...PRESETS[key] })
  }

  const set = (key: "base" | "mult" | "jump" | "kink" | "reserve") => (values: number[]) =>
    setParams((prev) => ({ ...prev, [key]: values[0] }))

  const borrowAprAt = (uPct: number) => {
    const u = uPct / 100
    const kink = params.kink / 100
    return params.base + Math.min(u, kink) * params.mult + Math.max(0, u - kink) * params.jump
  }
  const supplyAprAt = (uPct: number) => borrowAprAt(uPct) * (uPct / 100) * (1 - params.reserve / 100)

  const points = useMemo(
    () =>
      Array.from({ length: 101 }, (_, i) => ({
        u: i,
        borrow: Number(borrowAprAt(i).toFixed(2)),
        supply: Number(supplyAprAt(i).toFixed(2)),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params],
  )

  const borrowNow = borrowAprAt(utilization)
  const supplyNow = supplyAprAt(utilization)

  return (
    <WidgetFrame
      title="Rate-curve explorer"
      subtitle="Drag utilization along the curve (and reshape the curve itself) to see how both rates respond."
    >
      <Tabs value={preset} onValueChange={(v) => applyPreset(v as PresetKey)} className="mb-5">
        <TabsList>
          {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
            <TabsTrigger key={key} value={key} className="text-xs md:text-sm">
              {PRESETS[key].label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-5">
          <ControlRow label="Utilization" value={`${utilization}%`}>
            <Slider value={[utilization]} onValueChange={(v) => setUtilization(v[0])} min={0} max={100} step={1} />
          </ControlRow>
          <ControlRow label="Base rate" value={`${params.base}%`}>
            <Slider value={[params.base]} onValueChange={set("base")} min={0} max={10} step={0.5} />
          </ControlRow>
          <ControlRow label="Slope to kink" value={`${params.mult}%`}>
            <Slider value={[params.mult]} onValueChange={set("mult")} min={1} max={50} step={1} />
          </ControlRow>
          <ControlRow label="Jump slope" value={`${params.jump}%`}>
            <Slider value={[params.jump]} onValueChange={set("jump")} min={50} max={500} step={5} />
          </ControlRow>
          <ControlRow label="Kink" value={`${params.kink}%`}>
            <Slider value={[params.kink]} onValueChange={set("kink")} min={50} max={95} step={1} />
          </ControlRow>
          <ControlRow label="Reserve factor" value={`${params.reserve}%`}>
            <Slider value={[params.reserve]} onValueChange={set("reserve")} min={0} max={50} step={1} />
          </ControlRow>
        </div>

        <div className="min-w-0">
          <div className="h-64 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 10, right: 44, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                <XAxis
                  dataKey="u"
                  type="number"
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  {...AXIS_PROPS}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <YAxis {...AXIS_PROPS} tickFormatter={(v: number) => `${v}%`} width={44} />
                <Tooltip
                  {...CHART_TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => [`${value.toFixed(2)}%`, name === "borrow" ? "Borrow APR" : "Supply APR"]}
                  labelFormatter={(v) => `Utilization ${v}%`}
                />
                <ReferenceLine
                  x={params.kink}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                  label={{ value: "kink", fontSize: 10, fill: "hsl(var(--muted-foreground))", position: "top" }}
                />
                <ReferenceLine x={utilization} stroke="hsl(var(--foreground))" strokeOpacity={0.35} />
                <Line
                  type="monotone"
                  dataKey="borrow"
                  stroke={SERIES.borrow}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  label={(props: any) =>
                    props.index === 100 ? (
                      <text x={props.x + 6} y={props.y + 3} fontSize={10} fill={SERIES.borrow}>
                        Borrow
                      </text>
                    ) : <g />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="supply"
                  stroke={SERIES.supply}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  label={(props: any) =>
                    props.index === 100 ? (
                      <text x={props.x + 6} y={props.y + 3} fontSize={10} fill={SERIES.supply}>
                        Supply
                      </text>
                    ) : <g />
                  }
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ChartLegend
            items={[
              { label: "Borrow APR", color: SERIES.borrow },
              { label: "Supply APR", color: SERIES.supply },
            ]}
          />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Utilization" value={`${utilization}%`} />
            <StatTile label="Borrow APR" value={`${borrowNow.toFixed(2)}%`} />
            <StatTile label="Supply APR" value={`${supplyNow.toFixed(2)}%`} />
          </div>
        </div>
      </div>
    </WidgetFrame>
  )
}
