import { BridgePageClient } from "@/components/bridge/BridgePageClient"
import type { Metadata } from "next"

// SEO Metadata
export const metadata: Metadata = {
  title: "Swap / Bridge | Peridot Finance",
  description: "Swap tokens and bridge across chains with the best rates. Trade USDC, USDT, ETH, BNB and more across Ethereum, Arbitrum, Base, Polygon, BSC and other supported networks.",
  openGraph: {
    title: "Swap / Bridge | Peridot Finance",
    description: "Swap tokens and bridge across chains seamlessly with Peridot — best rates, lowest fees.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Swap / Bridge | Peridot Finance",
    description: "Swap tokens and bridge across chains seamlessly with Peridot.",
  },
}

export default function BridgePage() {
  return (
    <main className="container mx-auto px-4 py-8 md:py-12">
      <div className="max-w-5xl mx-auto">
        <BridgePageClient />
      </div>
    </main>
  )
} 