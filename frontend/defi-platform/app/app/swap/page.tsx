import { SwapPageClient } from "@/components/swap/SwapPageClient"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Swap | Peridot Finance",
  description: "Swap tokens across chains with the best rates. Trade USDC, USDT, ETH, BNB and more across Ethereum, Arbitrum, Base, Polygon, BSC and other supported networks.",
  openGraph: {
    title: "Swap | Peridot Finance",
    description: "Swap tokens across chains seamlessly with Peridot — best rates, lowest fees.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Swap | Peridot Finance",
    description: "Swap tokens across chains seamlessly with Peridot.",
  },
}

export default function SwapPage() {
  return (
    <main className="container mx-auto px-4 py-8 md:py-12">
      <div className="max-w-5xl mx-auto">
        <SwapPageClient />
      </div>
    </main>
  )
}
