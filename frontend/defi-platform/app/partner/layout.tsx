import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Partner with Peridot | DeFi Protocol Integration & Collaboration",
  description: "Explore partnership opportunities with Peridot — for DeFi protocols, infrastructure providers, wallets, and projects looking to integrate cross-chain lending and borrowing.",
  alternates: { canonical: "/partner" },
  openGraph: {
    title: "Partner with Peridot | DeFi Integration",
    description: "Integrate with Peridot's cross-chain DeFi protocol. Partnership opportunities for protocols, wallets, and infrastructure providers.",
    url: "/partner",
  },
}

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
