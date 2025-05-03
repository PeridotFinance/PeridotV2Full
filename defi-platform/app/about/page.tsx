import Link from "next/link"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { ArrowRight, Users, Globe, Shield, Lightbulb } from "lucide-react"

export default function About() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="py-16 md:py-24 hero-gradient">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">About Peridot</h1>
            <p className="text-lg text-text/80 mb-8">
              Building the future of decentralized finance through cross-chain lending and borrowing.
            </p>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6">Our Mission</h2>
              <p className="text-text/80 mb-6">
                Peridot's mission is to create an open, accessible, and efficient financial system that transcends
                blockchain boundaries. We believe in a world where anyone, anywhere can access capital markets and earn
                yield on their assets without intermediaries or artificial barriers.
              </p>
              <p className="text-text/80">
                By building cross-chain lending infrastructure, we're connecting liquidity across the fragmented DeFi
                landscape and creating a more unified, efficient ecosystem for all participants.
              </p>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 rounded-lg blur-3xl opacity-30"></div>
              <div className="relative bg-card border border-border/50 rounded-lg p-6 shadow-xl">
                <h3 className="text-xl font-bold mb-4">Our Vision</h3>
                <ul className="space-y-4">
                  <li className="flex items-start">
                    <div className="mr-4 mt-1">
                      <Globe className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Borderless Finance</p>
                      <p className="text-sm text-text/70">
                        A world where financial services flow freely across blockchain ecosystems
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <div className="mr-4 mt-1">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Community Governance</p>
                      <p className="text-sm text-text/70">
                        A protocol fully owned and governed by its community of users
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <div className="mr-4 mt-1">
                      <Shield className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Security & Transparency</p>
                      <p className="text-sm text-text/70">Setting the standard for security and transparency in DeFi</p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <div className="mr-4 mt-1">
                      <Lightbulb className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Continuous Innovation</p>
                      <p className="text-sm text-text/70">
                        Pushing the boundaries of what's possible in decentralized lending
                      </p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-6 text-center">Our Story</h2>
            <div className="space-y-6 text-text/80">
              <p>
                Peridot was founded in 2023 by a team of DeFi veterans and blockchain engineers who recognized a
                critical problem in the ecosystem: while blockchain technology was breaking down traditional financial
                barriers, new barriers were forming between different blockchain networks.
              </p>
              <p>
                The founding team had previously built and contributed to several successful DeFi protocols, but they
                saw that users were forced to fragment their capital across multiple chains, reducing capital efficiency
                and creating unnecessary complexity.
              </p>
              <p>
                With this insight, they set out to build Peridot—a protocol that would unify lending markets across
                blockchains and create a seamless experience for users, regardless of which networks they preferred to
                use.
              </p>
              <p>
                After months of research and development, Peridot launched its alpha version in early 2024, initially
                supporting Ethereum and Solana. The protocol quickly gained traction for its innovative cross-chain
                architecture and user-friendly interface.
              </p>
              <p>
                Today, Peridot supports 8+ blockchains and continues to expand its ecosystem, with a growing community
                of users, developers, and governance participants shaping its future.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold mb-12 text-center">Our Team</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                name: "Alex Chen",
                role: "Founder & CEO",
                bio: "Former lead developer at a top DeFi protocol with 8+ years in blockchain development.",
                image: "alex-chen",
              },
              {
                name: "Sarah Johnson",
                role: "CTO",
                bio: "Cryptography expert and smart contract security specialist with a background in distributed systems.",
                image: "sarah-johnson",
              },
              {
                name: "Michael Rodriguez",
                role: "Head of Research",
                bio: "PhD in Financial Economics with expertise in market design and algorithmic pricing mechanisms.",
                image: "michael-rodriguez",
              },
              {
                name: "Emma Wilson",
                role: "Head of Community",
                bio: "Community builder with experience growing several successful DAO communities in DeFi.",
                image: "emma-wilson",
              },
              {
                name: "David Park",
                role: "Lead Smart Contract Engineer",
                bio: "Solidity expert who has audited and developed protocols securing billions in TVL.",
                image: "david-park",
              },
              {
                name: "Sophia Martinez",
                role: "Cross-Chain Architect",
                bio: "Specialized in cross-chain messaging protocols and interoperability solutions.",
                image: "sophia-martinez",
              },
              {
                name: "James Taylor",
                role: "Product Lead",
                bio: "Former product manager at a leading crypto exchange with a focus on user experience.",
                image: "james-taylor",
              },
              {
                name: "Olivia Brown",
                role: "Head of Operations",
                bio: "Operations specialist with experience scaling DeFi startups from concept to market leaders.",
                image: "olivia-brown",
              },
            ].map((member) => (
              <div key={member.name} className="bg-card border border-border/50 rounded-lg overflow-hidden card-hover">
                <div className="aspect-square relative">
                  <Image
                    src={`/placeholder.svg?height=300&width=300&query=${member.name}`}
                    alt={member.name}
                    width={300}
                    height={300}
                    className="object-cover"
                  />
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-lg">{member.name}</h3>
                  <p className="text-primary text-sm mb-2">{member.role}</p>
                  <p className="text-text/70 text-sm">{member.bio}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Investors & Partners */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold mb-12 text-center">Our Investors & Partners</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              "Blockchain Capital",
              "Polychain",
              "Paradigm",
              "a16z Crypto",
              "Coinbase Ventures",
              "Binance Labs",
              "Solana Ventures",
              "Avalanche Foundation",
            ].map((investor) => (
              <div
                key={investor}
                className="bg-card border border-border/50 rounded-lg p-6 flex items-center justify-center h-32 card-hover"
              >
                <Image
                  src={`/placeholder.svg?height=80&width=160&query=${investor}`}
                  alt={investor}
                  width={160}
                  height={80}
                  className="max-h-16 w-auto"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Join Us */}
      <section className="py-16 bg-gradient-to-br from-secondary to-accent/70">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-6">Join Our Team</h2>
            <p className="text-lg mb-8">
              We're always looking for talented individuals who are passionate about DeFi and want to help build the
              future of cross-chain finance.
            </p>
            <Button asChild size="lg" className="bg-primary text-background hover:bg-primary/90">
              <Link href="/careers">
                View Open Positions
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
