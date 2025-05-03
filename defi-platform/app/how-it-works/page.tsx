import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Check } from "lucide-react"

export default function HowItWorks() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="py-16 md:py-24 hero-gradient">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              How <span className="gradient-text">Peridot</span> Works
            </h1>
            <p className="text-lg text-text/80 mb-8">
              Peridot creates efficient money markets for crypto assets with algorithmically determined interest rates
              based on supply and demand.
            </p>
            <Button asChild size="lg" className="bg-primary text-background hover:bg-primary/90">
              <Link href="/app">Launch App</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Introduction */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-6">Introduction to Peridot</h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-text/80 mb-4">
                Peridot introduces a decentralized protocol on multiple blockchains that creates money markets for
                crypto assets. Our goal is to establish algorithmically determined interest rates based on supply and
                demand, allowing users to seamlessly trade the time value of their crypto assets.
              </p>
              <p className="text-text/80 mb-4">Current limitations in existing systems include:</p>
              <ul className="space-y-2 mb-6">
                <li className="flex items-start">
                  <Check className="h-5 w-5 text-primary mr-2 mt-0.5 flex-shrink-0" />
                  <span>Limited borrowing mechanisms for crypto assets</span>
                </li>
                <li className="flex items-start">
                  <Check className="h-5 w-5 text-primary mr-2 mt-0.5 flex-shrink-0" />
                  <span>Negative yields due to storage costs and risks</span>
                </li>
                <li className="flex items-start">
                  <Check className="h-5 w-5 text-primary mr-2 mt-0.5 flex-shrink-0" />
                  <span>
                    Reliance on centralized exchanges (security risks, limited access, virtual positions without
                    on-chain usability)
                  </span>
                </li>
                <li className="flex items-start">
                  <Check className="h-5 w-5 text-primary mr-2 mt-0.5 flex-shrink-0" />
                  <span>High costs and low convenience with peer-to-peer solutions</span>
                </li>
              </ul>
              <p className="text-text/80">
                Peridot solves these problems through an automated, decentralized system with transparent interest
                calculation and immediate liquidity across multiple blockchains.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How the Protocol Works */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-6">How the Peridot Protocol Works</h2>
            <p className="text-text/80 mb-8">
              Peridot creates separate markets for various crypto assets across multiple blockchains, including
              Ethereum, Polygon, Avalanche, and more. These markets are transparent, publicly accessible, and provide
              complete transaction history and interest rates.
            </p>

            <div className="space-y-12">
              <div className="bg-card border border-border/50 rounded-lg p-6">
                <h3 className="text-xl font-bold mb-4 text-primary">Asset Supply (Supplying Assets)</h3>
                <p className="text-text/80 mb-4">Users provide assets to the protocol and receive cTokens in return.</p>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>
                      cTokens represent a growing share of the underlying asset as interest automatically accumulates
                    </span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>
                      Liquid: Assets can be withdrawn at any time without waiting for a specific loan to be repaid
                    </span>
                  </li>
                </ul>
                <p className="text-text/80 font-medium">Primary Use Cases:</p>
                <ul className="space-y-2">
                  <li className="flex items-start">
                    <Check className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>Long-term investors ("HODLers") can generate interest on their unused assets</span>
                  </li>
                  <li className="flex items-start">
                    <Check className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>dApps and exchanges can monetize their token holdings</span>
                  </li>
                </ul>
              </div>

              <div className="bg-card border border-border/50 rounded-lg p-6">
                <h3 className="text-xl font-bold mb-4 text-primary">Borrowing (Borrowing Assets)</h3>
                <p className="text-text/80 mb-4">
                  Loans are completed simply and without negotiations, with no terms or waiting periods required.
                </p>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>Borrowers deposit cTokens as collateral to borrow assets</span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>Each market has a variable interest rate depending on supply and demand</span>
                  </li>
                </ul>
                <p className="text-text/80 font-medium mb-2">Collateral:</p>
                <ul className="space-y-2 mb-4">
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>
                      Each asset is assigned a collateral factor between 0 and 1 (highly liquid assets have higher
                      factors)
                    </span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>
                      The total amount of collateral determines the maximum loan amount ("Borrowing Capacity")
                    </span>
                  </li>
                </ul>
                <p className="text-text/80 font-medium mb-2">Risk and Liquidation:</p>
                <ul className="space-y-2 mb-4">
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>
                      If the loan amount exceeds the allowed capacity, other users can repay loans and purchase
                      collateral at a discount ("liquidation discount")
                    </span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>This motivates arbitrageurs to minimize risks for the protocol</span>
                  </li>
                </ul>
                <p className="text-text/80 font-medium">Primary Use Cases:</p>
                <ul className="space-y-2">
                  <li className="flex items-start">
                    <Check className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>dApps can immediately borrow tokens for on-chain activities</span>
                  </li>
                  <li className="flex items-start">
                    <Check className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>Traders can take out loans to finance new investments</span>
                  </li>
                  <li className="flex items-start">
                    <Check className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>
                      Short trading: Traders borrow tokens, sell them on the market, and profit from falling prices
                    </span>
                  </li>
                </ul>
              </div>

              <div className="bg-card border border-border/50 rounded-lg p-6">
                <h3 className="text-xl font-bold mb-4 text-primary">Interest Model and Liquidity Incentives</h3>
                <p className="text-text/80 mb-4">
                  Peridot uses an automated model to set interest rates based on usage ("Utilization Rate"). Interest
                  rates rise with high demand and fall with low demand. This creates natural incentives for liquidity
                  without having to guarantee it.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Implementation and Architecture */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-6">Implementation and Architecture</h2>

            <div className="space-y-8">
              <div>
                <h3 className="text-xl font-bold mb-4">cToken Contracts (ERC-20 compatible)</h3>
                <p className="text-text/80 mb-4">Essential functions of the cToken contracts are:</p>
                <ul className="space-y-2 mb-4">
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>
                      <strong>mint</strong>: Deposit assets for cTokens
                    </span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>
                      <strong>redeem</strong>: Withdraw assets by returning cTokens
                    </span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>
                      <strong>borrow</strong>: Take out loans against cTokens as collateral
                    </span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>
                      <strong>repayBorrow</strong>: Repay a loan
                    </span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>
                      <strong>liquidate</strong>: Liquidate over-indebted positions
                    </span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-bold mb-4">Interest Mechanism</h3>
                <ul className="space-y-2 mb-4">
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>The interest rate updates dynamically per transaction (block-based)</span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>Total debt and reserves are increased through accumulated interest</span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-bold mb-4">Loans & Liquidation</h3>
                <ul className="space-y-2 mb-4">
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>Users can take out and repay loans at any time, with interest calculated continuously</span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>
                      If collateral is insufficient, a liquidation function allows exchanging collateral for loan
                      repayment
                    </span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-bold mb-4">Price Feeds & Comptroller</h3>
                <ul className="space-y-2 mb-4">
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>A price oracle provides prices for all supported assets from the ten largest exchanges</span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>
                      The Comptroller is a central control instance that ensures all actions are valid and adequately
                      secured
                    </span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-bold mb-4">Governance</h3>
                <p className="text-text/80 mb-4">
                  Peridot starts initially centrally controlled and transitions long-term to full community control:
                </p>
                <ul className="space-y-2 mb-4">
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>Addition of new markets</span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>Adjustment of interest models</span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>Management of price oracles</span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>Withdrawal of reserves</span>
                  </li>
                  <li className="flex items-start">
                    <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                    <span>Management of admin rights, later through a DAO</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Summary */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-6">Summary</h2>
            <ul className="space-y-4">
              <li className="flex items-start">
                <Check className="h-5 w-5 text-primary mr-3 mt-0.5 flex-shrink-0" />
                <span>Peridot creates effective money markets for crypto assets across multiple blockchains</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-primary mr-3 mt-0.5 flex-shrink-0" />
                <span>Interest rates respond dynamically to supply and demand</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-primary mr-3 mt-0.5 flex-shrink-0" />
                <span>Users generate interest by providing assets without having to trust central entities</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-primary mr-3 mt-0.5 flex-shrink-0" />
                <span>Loans can be taken out immediately, with assets serving as collateral</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-primary mr-3 mt-0.5 flex-shrink-0" />
                <span>
                  Peridot addresses critical deficiencies in existing blockchain-based financial markets and promotes
                  a stable, decentralized financial infrastructure
                </span>
              </li>
            </ul>

            <div className="mt-12 text-center">
              <Button asChild size="lg" className="bg-primary text-background hover:bg-primary/90">
                <Link href="/app">Launch App</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
