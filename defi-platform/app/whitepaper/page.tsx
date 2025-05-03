import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowRight, Download, FileText } from "lucide-react"

export default function Whitepaper() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="py-16 md:py-24 hero-gradient">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Peridot Whitepaper</h1>
            <p className="text-lg text-text/80 mb-8">
              A technical overview of the Peridot protocol, its architecture, and economic model.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="bg-primary text-background hover:bg-primary/90">
                <Link href="#download">
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="#abstract">Read Online</Link>
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
                The protocol introduces cTokens as interest-bearing assets, implements algorithmic interest rate models
                based on utilization rates, and establishes a robust liquidation mechanism to manage risk. Peridot's
                unique contribution is its cross-chain architecture, which allows users to supply assets on one chain
                and borrow on another without manually bridging assets.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Table of Contents */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-6">Table of Contents</h2>
            <Card className="bg-card border-border/50">
              <CardContent className="p-6">
                <ol className="space-y-4 list-decimal list-inside">
                  <li className="text-lg">
                    <Link href="#introduction" className="hover:text-primary">
                      Introduction
                    </Link>
                    <ul className="pl-6 mt-2 space-y-2 list-disc list-inside text-base text-text/70">
                      <li>Background and Motivation</li>
                      <li>Limitations of Existing Systems</li>
                      <li>Peridot's Vision</li>
                    </ul>
                  </li>
                  <li className="text-lg">
                    <Link href="#protocol-overview" className="hover:text-primary">
                      Protocol Overview
                    </Link>
                    <ul className="pl-6 mt-2 space-y-2 list-disc list-inside text-base text-text/70">
                      <li>Key Components</li>
                      <li>cToken Standard</li>
                      <li>Cross-Chain Architecture</li>
                    </ul>
                  </li>
                  <li className="text-lg">
                    <Link href="#interest-rate-model" className="hover:text-primary">
                      Interest Rate Model
                    </Link>
                    <ul className="pl-6 mt-2 space-y-2 list-disc list-inside text-base text-text/70">
                      <li>Utilization-Based Rates</li>
                      <li>Jump Rate Model</li>
                      <li>Cross-Chain Rate Equilibrium</li>
                    </ul>
                  </li>
                  <li className="text-lg">
                    <Link href="#risk-management" className="hover:text-primary">
                      Risk Management
                    </Link>
                    <ul className="pl-6 mt-2 space-y-2 list-disc list-inside text-base text-text/70">
                      <li>Collateral Factors</li>
                      <li>Liquidation Mechanism</li>
                      <li>Price Oracle Design</li>
                    </ul>
                  </li>
                  <li className="text-lg">
                    <Link href="#cross-chain-implementation" className="hover:text-primary">
                      Cross-Chain Implementation
                    </Link>
                    <ul className="pl-6 mt-2 space-y-2 list-disc list-inside text-base text-text/70">
                      <li>Messaging Protocols</li>
                      <li>Liquidity Management</li>
                      <li>Security Considerations</li>
                    </ul>
                  </li>
                  <li className="text-lg">
                    <Link href="#governance" className="hover:text-primary">
                      Governance
                    </Link>
                    <ul className="pl-6 mt-2 space-y-2 list-disc list-inside text-base text-text/70">
                      <li>Token Economics</li>
                      <li>Proposal Process</li>
                      <li>Cross-Chain Governance</li>
                    </ul>
                  </li>
                  <li className="text-lg">
                    <Link href="#tokenomics" className="hover:text-primary">
                      Tokenomics
                    </Link>
                    <ul className="pl-6 mt-2 space-y-2 list-disc list-inside text-base text-text/70">
                      <li>Token Distribution</li>
                      <li>Utility and Value Accrual</li>
                      <li>Emissions Schedule</li>
                    </ul>
                  </li>
                  <li className="text-lg">
                    <Link href="#roadmap" className="hover:text-primary">
                      Roadmap
                    </Link>
                  </li>
                  <li className="text-lg">
                    <Link href="#conclusion" className="hover:text-primary">
                      Conclusion
                    </Link>
                  </li>
                  <li className="text-lg">
                    <Link href="#references" className="hover:text-primary">
                      References
                    </Link>
                  </li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Introduction Section Preview */}
      <section id="introduction" className="py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-6">1. Introduction</h2>
            <div className="prose prose-invert max-w-none">
              <h3 className="text-xl font-semibold mb-4">1.1 Background and Motivation</h3>
              <p className="text-text/80 mb-4">
                The emergence of decentralized finance (DeFi) has revolutionized traditional financial services by
                creating open, permissionless alternatives built on blockchain technology. Lending protocols, in
                particular, have become a cornerstone of the DeFi ecosystem, enabling users to earn yield on their
                assets and access liquidity without intermediaries.
              </p>
              <p className="text-text/80 mb-4">
                However, as the blockchain landscape has evolved, it has become increasingly fragmented across multiple
                networks, each with its own ecosystem of applications and assets. This fragmentation creates significant
                inefficiencies for users, who must navigate complex bridging processes to move assets between chains and
                manage separate positions across different protocols.
              </p>
              <p className="text-text/80 mb-4">
                Peridot was conceived to address this fundamental challenge by creating a unified lending protocol
                that operates seamlessly across multiple blockchain networks. By leveraging cross-chain messaging
                protocols and innovative liquidity management techniques, Peridot enables users to interact with a
                single protocol interface while accessing liquidity across the entire DeFi ecosystem.
              </p>

              <h3 className="text-xl font-semibold mb-4">1.2 Limitations of Existing Systems</h3>
              <p className="text-text/80 mb-4">
                Current DeFi lending platforms face several limitations that restrict their utility and efficiency:
              </p>
              <ul className="space-y-2 mb-4 text-text/80">
                <li>
                  <strong>Chain Isolation:</strong> Most lending protocols operate on a single blockchain, limiting
                  users to the assets and liquidity available on that specific network.
                </li>
                <li>
                  <strong>Capital Inefficiency:</strong> Users must fragment their capital across multiple chains and
                  protocols, reducing overall capital efficiency and yield potential.
                </li>
                <li>
                  <strong>Complex User Experience:</strong> Managing positions across different chains requires
                  technical knowledge of bridging mechanisms and multiple wallet connections.
                </li>
                <li>
                  <strong>Liquidity Fragmentation:</strong> Total liquidity is divided across numerous isolated
                  protocols, leading to higher slippage and less efficient markets.
                </li>
                <li>
                  <strong>Redundant Infrastructure:</strong> Each chain-specific protocol must independently implement
                  and maintain similar functionality, leading to duplicated efforts and inconsistent security standards.
                </li>
              </ul>

              <h3 className="text-xl font-semibold mb-4">1.3 Peridot's Vision</h3>
              <p className="text-text/80 mb-4">
                Peridot aims to create a unified, cross-chain lending ecosystem that addresses these limitations
                through several key innovations:
              </p>
              <ul className="space-y-2 text-text/80">
                <li>
                  <strong>Seamless Cross-Chain Experience:</strong> Users can supply assets on one chain and borrow on
                  another without manually bridging assets.
                </li>
                <li>
                  <strong>Unified Liquidity Pools:</strong> Liquidity is aggregated across chains, creating deeper
                  markets and more efficient interest rates.
                </li>
                <li>
                  <strong>Chain-Agnostic Interface:</strong> A single user interface allows interaction with all
                  supported chains through a consistent experience.
                </li>
                <li>
                  <strong>Optimized Capital Efficiency:</strong> Users can leverage their entire portfolio as
                  collateral, regardless of which chains their assets reside on.
                </li>
                <li>
                  <strong>Decentralized Governance:</strong> Protocol parameters and upgrades are controlled by a
                  cross-chain governance system that ensures all stakeholders have a voice.
                </li>
              </ul>
            </div>

            <div className="mt-8 text-center">
              <Button asChild variant="outline">
                <Link href="#protocol-overview">
                  Continue to Protocol Overview
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Download Section */}
      <section id="download" className="py-16 bg-muted">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-6">Download the Whitepaper</h2>
            <p className="text-text/80 mb-8">
              Get the complete technical whitepaper in PDF format for offline reading and reference.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-primary text-background hover:bg-primary/90">
                <FileText className="mr-2 h-4 w-4" />
                English (1.2 MB)
              </Button>
              <Button size="lg" variant="outline">
                <FileText className="mr-2 h-4 w-4" />
                German (1.3 MB)
              </Button>
              <Button size="lg" variant="outline">
                <FileText className="mr-2 h-4 w-4" />
                Spanish (1.2 MB)
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
