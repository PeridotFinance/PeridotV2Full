import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { ArrowRight, Download, ExternalLink, Trophy } from "lucide-react"

export const metadata: Metadata = {
  title: "Peridot Whitepaper | Cross-Chain DeFi Protocol Documentation",
  description: "Read the Peridot Protocol whitepaper — covering protocol architecture, tokenomics, cross-chain mechanics, roadmap, and our hackathon-winning track record.",
  alternates: { canonical: "/whitepaper" },
  openGraph: {
    title: "Peridot Whitepaper | DeFi Protocol Documentation",
    description: "Technical and conceptual foundation of Peridot's cross-chain lending and borrowing protocol.",
    url: "/whitepaper",
  },
}

const hackathonBadges = [
  { src: "/hackathonwins/Group 9554.webp", alt: "Wormhole Hackathon Award", title: "Wormhole", subtitle: "Sidetrack" },
  { src: "/hackathonwins/Group 9557.webp", alt: "Stellar Kickstarter Award", title: "Stellar", subtitle: "Kickstarter" },
  { src: "/hackathonwins/Group 9559.webp", alt: "Moveathon Award", title: "Moveathon", subtitle: "Winner" },
  { src: "/hackathonwins/Group 9560.webp", alt: "The Graph side Award", title: "The Graph", subtitle: "Sidetrack" },
]

const textAwards = [
  { title: "XDC Hackathon", subtitle: "2nd Place" },
  { title: "XDC Sidetrack Foundation", subtitle: "1st Place" },
  { title: "Soneium DeFi", subtitle: "1st Place" },
]

export default function Whitepaper() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero */}
      <section className="py-16 md:py-24 hero-gradient">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Peridot Whitepaper</h1>
            <p className="text-lg text-text/80 mb-8">
              A technical overview of the Peridot protocol, its architecture, and economic model.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="bg-primary text-background hover:bg-primary/90">
                <a href="/peridot-whitepaper.pdf" download>
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="#abstract">Read Abstract</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Abstract */}
      <section id="abstract" className="py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-6">Abstract</h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-text/80 mb-4">
                Peridot introduces a novel cross-chain lending protocol that enables seamless lending and borrowing
                across multiple blockchain networks. By leveraging advanced cross-chain messaging and liquidity
                management techniques, Peridot creates unified money markets that transcend the limitations of
                individual blockchains.
              </p>
              <p className="text-text/80 mb-4">
                This whitepaper presents the technical architecture, economic model, and governance structure of the
                Peridot protocol. We outline the challenges of existing DeFi lending platforms, particularly their
                chain-specific limitations, and demonstrate how Peridot's innovative approach solves these problems
                while maintaining security, efficiency, and decentralization.
              </p>
              <p className="text-text/80">
                The protocol introduces pTokens as interest-bearing assets, implements algorithmic interest rate models
                based on utilization rates, and establishes a robust liquidation mechanism to manage risk. Peridot's
                unique contribution is its cross-chain architecture, which allows users to supply assets on one chain
                and borrow on another without manually bridging assets.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Protocol Overview */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-6">Protocol Overview</h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-text/80 mb-4">
                Peridot operates on a hub-and-spoke model. Hub chains (BSC, Monad) host the primary lending pools,
                while spoke chains (Arbitrum, Base, Ethereum, Polygon, Avalanche) provide cross-chain access via
                Axelar messaging on testnet and Biconomy for gasless execution on mainnet.
              </p>
              <p className="text-text/80 mb-4">
                Users interact with a single interface regardless of which chain their assets reside on. Interest
                rates are determined algorithmically based on each market's utilization rate: high demand raises
                rates to attract supply; low demand lowers them to encourage borrowing.
              </p>
              <p className="text-text/80">
                pTokens are the interest-bearing receipt tokens issued upon supply. They accrue value continuously
                and are redeemable for the underlying asset plus earned interest at any time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Tokenomics */}
      <section id="tokenomics" className="py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-4">Tokenomics</h2>
            <p className="text-text/70 mb-4">
              Total supply: <span className="text-text/90 font-medium">1,000,000,000 $P</span>. 40% public sale, 10% liquidity provision, 50% permanently locked for staking. No VC allocation, no team token sell pressure.
            </p>
            <p className="text-text/70 mb-8">
              100% of protocol revenue (interest spreads, liquidations, bridge & swap fees) is distributed to $P stakers, paid in stablecoins, not inflationary emissions. $P launches on Solana with cross-chain interoperability across BNB, Monad, Somnia, and Stellar.
            </p>
            <a
              href="https://peridot-finance.gitbook.io/peridot-protocol/usdp-tokenomics"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-border/50 bg-card hover:border-primary/50 transition-colors text-sm font-medium"
            >
              <ExternalLink className="h-4 w-4 text-primary" />
              Read full Tokenomics on GitBook
            </a>
          </div>
        </div>
      </section>

      {/* Roadmap */}
      <section id="roadmap" className="py-16 bg-muted">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-4">Roadmap</h2>
            <p className="text-text/70 mb-4">
              Near-term milestones include LP Farm Boosted Markets, Season 2, Somnia Mainnet, Leveraged Margin Trading, Easy Mode for Web2 users, and a Stargate listing with cross-chain token bridge, all targeting Q1/Q2 2026.
            </p>
            <p className="text-text/70 mb-8">
              Mid- to long-term: Solana, Stellar, and Avalanche mainnet launches (targeting $10M TVL), an open Agent API for external builders, Dual Investment products, a personalized AI agent, and a Fintech Money Market API for institutional integrations.
            </p>
            <a
              href="https://roadmap.peridot.finance/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-border/50 bg-card hover:border-primary/50 transition-colors text-sm font-medium"
            >
              <ExternalLink className="h-4 w-4 text-primary" />
              View roadmap.peridot.finance
            </a>
          </div>
        </div>
      </section>

      {/* References — Hackathon wins + Partners */}
      <section id="references" className="py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-2">Recognition & Partners</h2>
            <p className="text-text/70 mb-10">
              Peridot has been recognized across multiple global hackathons and is backed by leading ecosystem partners.
            </p>

            {/* Hackathon wins */}
            <h3 className="text-lg font-semibold mb-5 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Hackathon Wins
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {hackathonBadges.map((badge, i) => (
                <div key={i} className="flex flex-col items-center p-4 rounded-xl border border-border/40 bg-card">
                  <Image
                    src={badge.src}
                    alt={badge.alt}
                    width={120}
                    height={120}
                    className="w-full h-auto max-h-[120px] object-contain mb-3"
                  />
                  <span className="font-semibold text-sm text-center">{badge.title}</span>
                  <span className="text-xs text-text/60 text-center">{badge.subtitle}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 mb-12">
              {textAwards.map((award, i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-border/30 bg-card/50">
                  <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 text-primary flex-shrink-0">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-semibold">{award.title}</span>
                    <span className="text-text/60 text-sm ml-2">{award.subtitle}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Partners */}
            <h3 className="text-lg font-semibold mb-5">Ecosystem Partners</h3>
            <p className="text-text/70 text-sm mb-4">
              Working with leading protocols and infrastructure providers across chains.
            </p>
            <Link
              href="/partner"
              className="inline-flex items-center gap-2 text-primary hover:underline text-sm font-medium"
            >
              View all partners
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Bottom CTAs */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row gap-4">
            <Button asChild className="bg-primary text-background hover:bg-primary/90">
              <Link href="/app">
                Launch App
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/about">About the Team</Link>
            </Button>
            <Button asChild variant="outline">
              <a href="/peridot-whitepaper.pdf" download>
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
