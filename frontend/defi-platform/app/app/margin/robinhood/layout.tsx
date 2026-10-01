import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { FEATURE_FLAGS } from "@/config/featureFlags"

/**
 * /app/margin/robinhood: the NVDA/USDG margin product on Robinhood Chain.
 *
 * Its own route rather than a tab in /app/margin: that page is bound to the
 * Stellar wallet, the Stellar-only host gate, the challenge and limit orders,
 * while this product runs on an EVM wallet with vault shares and multi-step
 * opens. Sharing a page would make every Stellar component branch on it.
 * Gated by FEATURE_FLAGS.ROBINHOOD_MARGIN_UI and kept out of search.
 */
export const metadata: Metadata = {
  title: "NVDA margin | Peridot",
  robots: { index: false, follow: false },
}

export default function RobinhoodMarginLayout({ children }: { children: React.ReactNode }) {
  if (!FEATURE_FLAGS.ROBINHOOD_MARGIN_UI) notFound()
  return children
}
