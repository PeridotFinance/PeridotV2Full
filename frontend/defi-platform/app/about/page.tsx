import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { ArrowRight, Users, Globe, Shield, Lightbulb, Zap, Link as LinkIcon, GitBranch, Linkedin } from "lucide-react"

export const metadata: Metadata = {
  title: "About Peridot | Cross-Chain DeFi Protocol, Team & Mission",
  description: "Learn about Peridot Protocol: our mission, team, and the technology behind the cross-chain DeFi lending and borrowing platform built for the next generation of finance.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Peridot | Cross-Chain DeFi Protocol",
    description: "Meet the team and learn the mission behind Peridot's cross-chain DeFi lending and borrowing platform.",
    url: "/about",
  },
}

export default function About() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="py-16 md:py-24 hero-gradient">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">About Peridot Protocol</h1>
            <p className="text-xl text-text/80 mb-8">
              The first DeFi broker, your single account for a truly interoperable DeFi experience.
            </p>
            <p className="text-lg text-text/70 mb-8">
              Redefining decentralized lending and borrowing by breaking down the barriers between blockchains.
            </p>
          </div>
        </div>
      </section>

      {/* Introduction */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-8 text-center">Welcome to Peridot Protocol</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <p className="text-text/80 text-lg">
                  Whether you're a seasoned DeFi user or new to Web3, Peridot offers a seamless platform where you can manage your capital across chains with ease.
                </p>
                <div className="space-y-4">
                  <div className="flex items-start">
                    <div className="mr-4 mt-1">
                      <GitBranch className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-lg">🔁 True cross-chain lending & borrowing</p>
                      <p className="text-text/70">Seamlessly interact across multiple blockchains without complex bridging</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="mr-4 mt-1">
                      <Globe className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-lg">💧 Unified liquidity across ecosystems</p>
                      <p className="text-text/70">Access combined liquidity from multiple blockchain networks</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="mr-4 mt-1">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-lg">🌐 Onboarding for everyone</p>
                      <p className="text-text/70">Simple interface for users even without crypto knowledge</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 rounded-lg blur-3xl opacity-30"></div>
                <div className="relative bg-card border border-border/50 rounded-lg p-6 shadow-xl">
                  <h3 className="text-xl font-bold mb-4">Why We Exist</h3>
                  <p className="text-text/80 mb-4">
                    In today's DeFi landscape, liquidity is scattered and user experience is fragmented. Cross-chain activity often requires complex bridging steps, multiple wallets, and high risk.
                  </p>
                  <p className="text-text/80 font-medium">
                    We're here to change that.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What is Peridot */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-8 text-center">What is Peridot Protocol?</h2>
            <div className="space-y-8">
              <p className="text-lg text-text/80 text-center">
                Peridot Protocol is the first DeFi broker: one account through which you reach the on-chain money markets of every supported blockchain. A next-generation, cross-chain lending and borrowing platform designed to unify liquidity across multiple chains.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-card border border-border/50 rounded-lg p-6">
                  <div className="mb-4">
                    <Zap className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">Built on Interoperability</h3>
                  <p className="text-text/80 text-sm mb-3">
                    Powered by Wormhole, a leading cross-chain messaging protocol, architected around a Hub & Spoke model:
                  </p>
                  <ul className="text-sm text-text/70 space-y-2">
                    <li><strong>Hub Chain (e.g., Sei):</strong> Central layer for accounting, interest accrual, and liquidation logic</li>
                    <li><strong>Spoke Chains (e.g., Ethereum, Solana, Sui):</strong> User interaction from preferred blockchain</li>
                  </ul>
                </div>

                <div className="bg-card border border-border/50 rounded-lg p-6">
                  <div className="mb-4">
                    <Shield className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">Secure & Scalable at the Core</h3>
                  <p className="text-text/80 text-sm">
                    Peridot is built with the latest security practices and best practices in mind.
                    Our Mainnet contracts are audited by leading security firms and are open source and available for public review.
                  </p>
                </div>

                <div className="bg-card border border-border/50 rounded-lg p-6">
                  <div className="mb-4">
                    <LinkIcon className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">Wormhole-Powered Experience</h3>
                  <p className="text-text/80 text-sm mb-3">
                    Peridot uses Wormhole Token Transfers with Payloads to:
                  </p>
                  <ul className="text-sm text-text/70 space-y-1">
                    <li>• Send tokens from user's chain (Spoke)</li>
                    <li>• Send message to Hub contract</li>
                    <li>• Mint or burn tokens on Hub for lending/borrowing</li>
                  </ul>
                </div>
              </div>

              <div className="text-center">
                <p className="text-lg font-medium text-primary">
                  Peridot is designed for speed, simplicity, and scale, enabling users to access the best opportunities across chains, effortlessly.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-6 text-center">Our Story</h2>
            <div className="space-y-6 text-text/80">
              <p>
                Peridot was founded in 2025 by a team of tech veterans and blockchain engineers based in Berlin, Germany, who recognized a critical problem in the ecosystem: while blockchain technology was breaking down traditional financial barriers, new barriers were forming between different blockchain networks.
              </p>
              <p>
                The founding team had previously built and contributed to several successful DeFi protocols, but they saw that users were forced to fragment their capital across multiple chains, reducing capital efficiency and creating unnecessary complexity.
              </p>
              <p>
                With this insight, they set out to build Peridot, a protocol that would unify lending markets across blockchains and create a seamless experience for users, regardless of which networks they preferred to use.
              </p>
              <p>
                Built on top of proven DeFi infrastructure and powered by Wormhole, Peridot brings together speed, security, and simplicity into one protocol, making true cross-chain DeFi interaction possible without bridges or manual user intervention.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold mb-12 text-center">Meet Our Team</h2>
          <p className="text-center text-text/70 mb-12 max-w-2xl mx-auto">
            Based in Berlin, Germany, our diverse team brings together expertise from across the blockchain and DeFi ecosystem.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                name: "Josh",
                role: "Founder & Lead Developer",
                bio: "Smart contract developer since 2021. Specialized in DeFi and Cross-Chain. Won multiple Hackathons & has a college degree in Finance.",
                linkedin: "https://www.linkedin.com/in/joshua-cohen-022729286/",
                image: "data:image/svg+xml;base64," + btoa(`<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="300" fill="#1a1a2e"/><g fill="#16213e"><rect x="0" y="0" width="20" height="20"/><rect x="40" y="0" width="20" height="20"/><rect x="80" y="0" width="20" height="20"/><rect x="120" y="0" width="20" height="20"/><rect x="160" y="0" width="20" height="20"/><rect x="200" y="0" width="20" height="20"/><rect x="240" y="0" width="20" height="20"/><rect x="280" y="0" width="20" height="20"/></g><g fill="#0f3460"><rect x="20" y="20" width="20" height="20"/><rect x="60" y="20" width="20" height="20"/><rect x="100" y="20" width="20" height="20"/><rect x="140" y="20" width="20" height="20"/><rect x="180" y="20" width="20" height="20"/><rect x="220" y="20" width="20" height="20"/><rect x="260" y="20" width="20" height="20"/></g><g fill="#533483"><rect x="40" y="40" width="20" height="20"/><rect x="80" y="40" width="20" height="20"/><rect x="120" y="40" width="20" height="20"/><rect x="160" y="40" width="20" height="20"/><rect x="200" y="40" width="20" height="20"/><rect x="240" y="40" width="20" height="20"/></g><text x="150" y="180" text-anchor="middle" fill="#00d4aa" font-family="monospace" font-size="24">JOSH</text><text x="150" y="210" text-anchor="middle" fill="#00d4aa" font-family="monospace" font-size="12">01001010</text></svg>`),
              },
              {
                name: "Quinn",
                role: "Full stack Developer",
                bio: "Software engineering at Big 4 consultancy (PwC). Consulting and development work for multiple early-stage Web2 and Web3 startups. Developed cross-chain NFT renting platform JayPigs (full-stack development + smart contracts)",
                image: "data:image/svg+xml;base64," + btoa(`<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="300" fill="#2d1b69"/><g fill="#11175e"><rect x="10" y="10" width="15" height="15"/><rect x="35" y="10" width="15" height="15"/><rect x="60" y="10" width="15" height="15"/><rect x="85" y="10" width="15" height="15"/><rect x="110" y="10" width="15" height="15"/><rect x="135" y="10" width="15" height="15"/></g><g fill="#7209b7"><rect x="25" y="25" width="15" height="15"/><rect x="50" y="25" width="15" height="15"/><rect x="75" y="25" width="15" height="15"/><rect x="100" y="25" width="15" height="15"/><rect x="125" y="25" width="15" height="15"/></g><g fill="#f72585"><rect x="40" y="40" width="15" height="15"/><rect x="65" y="40" width="15" height="15"/><rect x="90" y="40" width="15" height="15"/><rect x="115" y="40" width="15" height="15"/></g><text x="150" y="180" text-anchor="middle" fill="#00f5ff" font-family="monospace" font-size="20">Quinn</text><text x="150" y="210" text-anchor="middle" fill="#00f5ff" font-family="monospace" font-size="12">11010010</text></svg>`),
              },
              {
                name: "Async",
                role: "CTO & Full stack Developer",
                bio: "Full-stack Developer with 10+ years of experience. Bachelor of Science in applied computer science. Built multiple crypto analysing tools and apps. 5+ years of experience as backend developer for large German companies like Deutsche Telekom and Deutsche Bahn.",
                linkedin: "https://www.linkedin.com/in/rene-m-095597352/",
                image: "data:image/svg+xml;base64," + btoa(`<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="300" fill="#0f0f23"/><g fill="#14213d"><rect x="0" y="0" width="25" height="25"/><rect x="50" y="0" width="25" height="25"/><rect x="100" y="0" width="25" height="25"/><rect x="150" y="0" width="25" height="25"/><rect x="200" y="0" width="25" height="25"/><rect x="250" y="0" width="25" height="25"/></g><g fill="#fca311"><rect x="25" y="25" width="25" height="25"/><rect x="75" y="25" width="25" height="25"/><rect x="125" y="25" width="25" height="25"/><rect x="175" y="25" width="25" height="25"/><rect x="225" y="25" width="25" height="25"/></g><g fill="#e5e5e5"><rect x="50" y="50" width="25" height="25"/><rect x="100" y="50" width="25" height="25"/><rect x="150" y="50" width="25" height="25"/><rect x="200" y="50" width="25" height="25"/></g><text x="150" y="180" text-anchor="middle" fill="#00ff41" font-family="monospace" font-size="24">ASYNC</text><text x="150" y="210" text-anchor="middle" fill="#00ff41" font-family="monospace" font-size="12">10101100</text></svg>`),
              },
              {
                name: "Dan",
                role: "Marketing & Community",
                bio: "8 years of Marketing experience in the FinTech and Ecommerce space. Focusing on Brand Development & innovating Marketing Strategies.",
                image: "data:image/svg+xml;base64," + btoa(`<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="300" fill="#1e3a8a"/><g fill="#1e40af"><rect x="15" y="15" width="18" height="18"/><rect x="45" y="15" width="18" height="18"/><rect x="75" y="15" width="18" height="18"/><rect x="105" y="15" width="18" height="18"/><rect x="135" y="15" width="18" height="18"/></g><g fill="#3b82f6"><rect x="30" y="30" width="18" height="18"/><rect x="60" y="30" width="18" height="18"/><rect x="90" y="30" width="18" height="18"/><rect x="120" y="30" width="18" height="18"/></g><g fill="#60a5fa"><rect x="45" y="45" width="18" height="18"/><rect x="75" y="45" width="18" height="18"/><rect x="105" y="45" width="18" height="18"/></g><text x="150" y="180" text-anchor="middle" fill="#fbbf24" font-family="monospace" font-size="24">DAN</text><text x="150" y="210" text-anchor="middle" fill="#fbbf24" font-family="monospace" font-size="12">01000100</text></svg>`),
              },
              {
                name: "Degen030",
                role: "Chief Operating Officer (COO)",
                bio: "2+ years of FinTech sales experience with proven track record. Winner of Avalanche Hackathon 2022 and founder/owner of Jobited since 2022. Expertise in operations and business development.",
                linkedin: "https://www.linkedin.com/in/luis-homann/?locale=en",
                image: "data:image/svg+xml;base64," + btoa(`<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="300" fill="#065f46"/><g fill="#047857"><rect x="12" y="12" width="22" height="22"/><rect x="46" y="12" width="22" height="22"/><rect x="80" y="12" width="22" height="22"/><rect x="114" y="12" width="22" height="22"/></g><g fill="#059669"><rect x="29" y="29" width="22" height="22"/><rect x="63" y="29" width="22" height="22"/><rect x="97" y="29" width="22" height="22"/></g><g fill="#10b981"><rect x="46" y="46" width="22" height="22"/><rect x="80" y="46" width="22" height="22"/></g><g fill="#34d399"><rect x="63" y="63" width="22" height="22"/></g><text x="150" y="170" text-anchor="middle" fill="#a78bfa" font-family="monospace" font-size="16">DEGEN030</text><text x="150" y="190" text-anchor="middle" fill="#a78bfa" font-family="monospace" font-size="12">COO</text><text x="150" y="210" text-anchor="middle" fill="#a78bfa" font-family="monospace" font-size="12">11100001</text></svg>`),
              },
            ].map((member) => (
              <div key={member.name} className="bg-card border border-border/50 rounded-lg overflow-hidden card-hover">
                <div className="aspect-square relative">
                  <Image
                    src={member.image}
                    alt={member.name}
                    width={300}
                    height={300}
                    className="object-cover w-full h-full"
                  />
                </div>
                <div className="p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-xl">{member.name}</h3>
                      <p className="text-primary text-sm font-medium">{member.role}</p>
                    </div>
                    {member.linkedin && (
                      <Link
                        href={member.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${member.name} on LinkedIn`}
                        className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full border border-border/50 text-text/60 transition-colors hover:text-[#0A66C2] hover:border-[#0A66C2]/50 hover:bg-[#0A66C2]/10"
                      >
                        <Linkedin className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                  <p className="text-text/70 text-sm leading-relaxed mt-3">{member.bio}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Technology Stack */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-8 text-center">Technical Architecture</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-card border border-border/50 rounded-lg p-6">
                <h3 className="text-xl font-bold mb-4">Overview</h3>
                <p className="text-text/80 mb-4">
                  Peridot Protocol is designed to unify cross-chain liquidity and simplify decentralized lending and borrowing. Our architecture streamlines access to DeFi for users and developers alike.
                </p>
                <ul className="space-y-2 text-sm text-text/70">
                  <li>• Architecture & Design</li>
                  <li>• Technical Specifications</li>
                  <li>• Easy Mode: Onramp & Offramp</li>
                  <li>• Developer Documentation</li>
                  <li>• Roadmap & Future Developments</li>
                </ul>
              </div>
              <div className="bg-card border border-border/50 rounded-lg p-6">
                <h3 className="text-xl font-bold mb-4">Core Components</h3>
                <div className="space-y-3">
                  <div className="flex items-start">
                    <div className="mr-3 mt-1">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                    </div>
                    <div>
                      <p className="font-medium">Hub & Spoke Architecture</p>
                      <p className="text-sm text-text/70">Centralized logic with distributed user interaction</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="mr-3 mt-1">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                    </div>
                    <div>
                      <p className="font-medium">Wormhole Integration</p>
                      <p className="text-sm text-text/70">Cross-chain messaging and token transfers</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="mr-3 mt-1">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                    </div>
                    <div>
                      <p className="font-medium">Compound V2 Base</p>
                      <p className="text-sm text-text/70">Proven lending infrastructure foundation</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Join Us */}
      <section className="py-16 bg-gradient-to-br from-secondary to-accent/70">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-6">Join Our Mission</h2>
            <p className="text-lg mb-8">
              Ready to explore the future of cross-chain DeFi? Start your journey with Peridot Protocol today and experience seamless lending and borrowing across blockchain ecosystems.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="bg-primary text-background hover:bg-primary/90">
                <Link href="/app">
                  Launch App
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/docs">
                  View Documentation
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
