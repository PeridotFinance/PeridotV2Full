"use client"

import { useApyData } from "@/hooks/use-apy-data"
import { CHAIN_IDS } from "@/config/contracts"

/**
 * The numbers on the borrow landing page.
 *
 * Collateral factors are contract constants and safe to state flatly; the rates
 * move, so they are read live and simply omitted when the read fails. Nothing on
 * this page may quote a rate the app would not honour a click later — that is
 * the difference between a landing page and a bait.
 */

type Row = {
  symbol: string
  label: string
  /** Contract collateral factor — see `stellarSorobanMainnetContracts.markets`. */
  ltv: number
  assetId: string
}

const ROWS: Row[] = [
  { symbol: "USDC", label: "Dollars", ltv: 0.9, assetId: "usdc-stellar" },
  { symbol: "EURC", label: "Euros", ltv: 0.9, assetId: "eurc-stellar" },
  { symbol: "XLM", label: "Stellar Lumens", ltv: 0.7, assetId: "xlm-stellar" },
]

const euro = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 })

export function BorrowRatesPanel() {
  const { liveApyData, isLoading } = useApyData()
  const stellar = liveApyData?.[CHAIN_IDS.STELLAR_MAINNET]

  return (
    <div className="overflow-x-auto rounded-2xl border border-primary/15 bg-primary/[0.03]">
      <table className="w-full text-sm">
        <caption className="sr-only">
          What you can borrow against each asset, and what that asset earns meanwhile
        </caption>
        <thead>
          <tr className="border-b border-primary/15 text-left">
            <th scope="col" className="px-4 py-3 font-medium text-text/60">You put up</th>
            <th scope="col" className="px-4 py-3 font-medium text-text/60">You can borrow</th>
            <th scope="col" className="px-4 py-3 font-medium text-text/60">It still earns</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const apy = stellar?.[row.assetId]?.totalSupplyApy
            const showApy = !isLoading && typeof apy === "number" && Number.isFinite(apy) && apy > 0
            return (
              <tr key={row.symbol} className="border-b border-primary/10 last:border-0">
                <th scope="row" className="px-4 py-3 text-left font-medium">
                  1,000 {row.symbol}
                  <span className="ml-2 text-xs font-normal text-text/45">{row.label}</span>
                </th>
                <td className="px-4 py-3 font-mono tabular-nums">
                  up to {euro(1000 * row.ltv)}
                  <span className="text-text/45"> in value</span>
                </td>
                <td className="px-4 py-3 font-mono tabular-nums text-primary">
                  {showApy ? `${apy.toFixed(2)}% a year` : <span className="text-text/35">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="px-4 py-3 text-xs text-text/45">
        Borrowing limits are fixed by the contracts. Rates are read live and change with
        demand — the figure you see here is the figure the app is paying right now.
      </p>
    </div>
  )
}
