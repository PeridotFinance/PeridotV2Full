import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowRight, Shield, CheckCircle, AlertTriangle, Lock, Eye, FileText, Bug } from "lucide-react"
import Image from "next/image"

export default function Security() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="py-16 md:py-24 hero-gradient">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Security at CrossLend</h1>
            <p className="text-lg text-text/80 mb-8">
              Our comprehensive approach to securing your assets and the CrossLend protocol.
            </p>
            <Button asChild size="lg" className="bg-primary text-background hover:bg-primary/90">
              <Link href="#audits">
                <Shield className="mr-2 h-4 w-4" />
                View Security Audits
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Security Overview */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-8 text-center">Our Security Approach</h2>
            <p className="text-text/80 mb-8">
              At CrossLend, security is our highest priority. We employ a multi-layered approach to protect user assets
              and ensure the integrity of our protocol across all supported blockchains. Our security strategy includes:
            </p>

            <div className="grid gap-6 mb-8">
              <div className="flex items-start">
                <div className="mr-4 mt-1">
                  <CheckCircle className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Rigorous Code Audits</h3>
                  <p className="text-text/70">
                    All smart contracts undergo multiple independent security audits by leading firms in the industry
                    before deployment.
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="mr-4 mt-1">
                  <CheckCircle className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Formal Verification</h3>
                  <p className="text-text/70">
                    Critical components of our protocol are formally verified using mathematical proofs to ensure they
                    behave exactly as intended under all circumstances.
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="mr-4 mt-1">
                  <CheckCircle className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Economic Security Design</h3>
                  <p className="text-text/70">
                    Our protocol incorporates robust economic security mechanisms, including conservative collateral
                    factors and efficient liquidation processes to protect against market volatility.
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="mr-4 mt-1">
                  <CheckCircle className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Bug Bounty Program</h3>
                  <p className="text-text/70">
                    We maintain an active bug bounty program with substantial rewards to incentivize responsible
                    disclosure of potential vulnerabilities.
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="mr-4 mt-1">
                  <CheckCircle className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Cross-Chain Security</h3>
                  <p className="text-text/70">
                    Our cross-chain architecture includes specialized security measures to protect against
                    bridge-specific vulnerabilities and ensure consistent security across all supported blockchains.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Audits */}
      <section id="audits" className="py-16 bg-muted">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-8 text-center">Security Audits</h2>
            <p className="text-text/80 mb-8 text-center">
              Our smart contracts have been audited by leading security firms in the blockchain industry.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {[
                {
                  firm: "Trail of Bits",
                  date: "March 2025",
                  scope: "Core Protocol, Cross-Chain Messaging",
                  status: "Completed",
                  image: "trail-of-bits",
                },
                {
                  firm: "OpenZeppelin",
                  date: "February 2025",
                  scope: "Smart Contracts, Governance",
                  status: "Completed",
                  image: "openzeppelin",
                },
                {
                  firm: "ChainSecurity",
                  date: "January 2025",
                  scope: "Liquidation Mechanism, Oracle Integration",
                  status: "Completed",
                  image: "chainsecurity",
                },
                {
                  firm: "Certik",
                  date: "December 2024",
                  scope: "Full Protocol Review",
                  status: "Completed",
                  image: "certik",
                },
              ].map((audit) => (
                <Card key={audit.firm} className="bg-card border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-10 h-10 mr-3 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                          <Image
                            src={`/placeholder.svg?height=40&width=40&query=${audit.image}`}
                            alt={audit.firm}
                            width={40}
                            height={40}
                          />
                        </div>
                        <CardTitle>{audit.firm}</CardTitle>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary">{audit.status}</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-text/70 space-y-1">
                      <div>
                        <span className="font-medium">Date:</span> {audit.date}
                      </div>
                      <div>
                        <span className="font-medium">Scope:</span> {audit.scope}
                      </div>
                    </div>
                    <Button asChild variant="ghost" size="sm" className="mt-4 text-primary">
                      <Link href={`/security/audits/${audit.firm.toLowerCase().replace(/\s+/g, "-")}`}>
                        View Report
                        <ArrowRight className="ml-2 h-3 w-3" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="text-center">
              <Button asChild variant="outline">
                <Link href="/security/audits">
                  View All Audit Reports
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Security Features */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold mb-12 text-center">Key Security Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="bg-card border-border/50 card-hover">
              <CardHeader>
                <Lock className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Secure Cross-Chain Messaging</CardTitle>
                <CardDescription>
                  Our cross-chain architecture uses multiple independent validators and message verification to ensure
                  secure asset transfers between blockchains.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-card border-border/50 card-hover">
              <CardHeader>
                <AlertTriangle className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Risk Parameters</CardTitle>
                <CardDescription>
                  Conservative collateral factors and liquidation thresholds protect the protocol from market volatility
                  and black swan events.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-card border-border/50 card-hover">
              <CardHeader>
                <Eye className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Transparent Oracles</CardTitle>
                <CardDescription>
                  Our price oracles aggregate data from multiple sources with circuit breakers to prevent manipulation
                  and ensure accurate asset pricing.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-card border-border/50 card-hover">
              <CardHeader>
                <Shield className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Timelock Mechanisms</CardTitle>
                <CardDescription>
                  All protocol upgrades go through a timelock period, allowing users to review changes and exit if
                  necessary before implementation.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-card border-border/50 card-hover">
              <CardHeader>
                <FileText className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Comprehensive Testing</CardTitle>
                <CardDescription>
                  Extensive unit tests, integration tests, and simulation testing ensure protocol reliability under
                  various market conditions.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-card border-border/50 card-hover">
              <CardHeader>
                <Bug className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Bug Bounty Program</CardTitle>
                <CardDescription>
                  Our bug bounty program offers rewards up to $250,000 for critical vulnerabilities, encouraging
                  responsible disclosure.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Bug Bounty */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-6 text-center">Bug Bounty Program</h2>
            <p className="text-text/80 mb-8 text-center">
              Help us improve the security of CrossLend by finding and reporting vulnerabilities.
            </p>

            <Card className="bg-card border-border/50 mb-8">
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-xl font-semibold mb-4">Reward Tiers</h3>
                    <ul className="space-y-3">
                      <li className="flex items-center">
                        <div className="w-20 text-sm font-medium">Critical:</div>
                        <div className="text-primary font-bold">Up to $250,000</div>
                      </li>
                      <li className="flex items-center">
                        <div className="w-20 text-sm font-medium">High:</div>
                        <div className="text-primary font-bold">Up to $100,000</div>
                      </li>
                      <li className="flex items-center">
                        <div className="w-20 text-sm font-medium">Medium:</div>
                        <div className="text-primary font-bold">Up to $50,000</div>
                      </li>
                      <li className="flex items-center">
                        <div className="w-20 text-sm font-medium">Low:</div>
                        <div className="text-primary font-bold">Up to $10,000</div>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-4">Scope</h3>
                    <ul className="space-y-2 text-sm text-text/80">
                      <li className="flex items-start">
                        <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                        <span>Smart contract vulnerabilities</span>
                      </li>
                      <li className="flex items-start">
                        <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                        <span>Cross-chain messaging exploits</span>
                      </li>
                      <li className="flex items-start">
                        <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                        <span>Oracle manipulation attacks</span>
                      </li>
                      <li className="flex items-start">
                        <ArrowRight className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                        <span>Economic attacks on the protocol</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="text-center">
              <Button asChild size="lg" className="bg-primary text-background hover:bg-primary/90">
                <Link href="https://hackerone.com/crosslend" target="_blank" rel="noopener noreferrer">
                  Submit a Vulnerability
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Security FAQ */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-8 text-center">Security FAQ</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold mb-2">How does CrossLend secure cross-chain transactions?</h3>
                <p className="text-text/80">
                  CrossLend uses a combination of trusted relayers, multi-signature validation, and on-chain
                  verification to secure cross-chain messages. Each cross-chain transaction requires confirmation from
                  multiple independent validators before execution, and includes cryptographic proofs that can be
                  verified on-chain.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-2">
                  What happens if a blockchain CrossLend supports is attacked?
                </h3>
                <p className="text-text/80">
                  CrossLend implements chain-specific circuit breakers that automatically pause operations on a
                  particular chain if abnormal activity is detected. This isolation mechanism prevents contagion across
                  the protocol while allowing operations to continue normally on unaffected chains.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-2">How does CrossLend protect against oracle manipulation?</h3>
                <p className="text-text/80">
                  Our price oracle system aggregates data from multiple independent sources and implements time-weighted
                  average prices (TWAP) to resist manipulation. Additionally, we employ deviation thresholds that
                  trigger alerts and potentially pause affected markets if prices move beyond expected parameters.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-2">What security measures protect user funds?</h3>
                <p className="text-text/80">
                  CrossLend is non-custodial, meaning users always maintain control of their assets through smart
                  contracts. The protocol's conservative risk parameters, including collateral factors and liquidation
                  thresholds, are designed to protect the solvency of the system even during extreme market conditions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Security Team */}
      <section className="py-16 bg-gradient-to-br from-secondary to-accent/70">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-6">Contact Our Security Team</h2>
            <p className="text-lg mb-8">
              Have security concerns or questions? Our security team is available to assist you.
            </p>
            <Button asChild size="lg" className="bg-primary text-background hover:bg-primary/90">
              <Link href="mailto:security@crosslend.com">security@crosslend.com</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
