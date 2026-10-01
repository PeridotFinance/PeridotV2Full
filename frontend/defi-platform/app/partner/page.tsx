"use client"

import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ExternalLink, ArrowRight, Mail } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { cn } from "@/lib/utils"

// Partner data with placeholder images
interface Partner {
  id: string
  name: string
  logo: string
  logoDark?: string
  description: string
  website?: string
}

const partners: Partner[] = [
  {
    id: "stellar-network",
    name: "Stellar Network",
    logo: "/partner-assets/stellar-network-logo-.svg",
    logoDark: "/partner-assets/Stellar-Network-logo-white.svg",
    description: "Collaborating with Stellar ecosystem partners on cross-chain liquidity.",
    website: "https://stellar.org/",
  },
  {
    id: "magma",
    name: "Magma",
    logo: "/partner-assets/Magma_LogoText.svg",
    description: "Building with Magma to streamline modular liquidity experiences.",
    website: "https://www.magmastaking.xyz/",
  },
  {
    id: "agora",
    name: "Agora",
    logo: "/partner-assets/agora-logo--horizontal--agora-gold.png",
    description: "Working with Agora to extend reach across institutional-grade DeFi rails.",
    website: "https://www.agora.finance/",
  },
  {
    id: "monad",
    name: "Monad",
    logo: "/partner-assets/monadtext.svg",
    description: "Partnering with Monad to deliver performant cross-chain money markets.",
    website: "https://www.monad.xyz/",
  },
  {
    id: "bnb-chain",
    name: "BNB Chain",
    logo: "/partner-assets/BNB%20Chain_Logo_Black.svg",
    logoDark: "/partner-assets/BNB%20Chain_Logo_White.svg",
    description: "Ecosystem collaboration with BNB Chain to broaden access to liquidity.",
    website: "https://www.binance.com/",
  },
  {
    id: "jobited",
    name: "Jobited",
    logo: "/partner-assets/jobited.svg",
    description: "Teaming up with Jobited to advance compliant on-chain infrastructure.",
    website: "https://jobited.com/",
  },
  {
    id: "stabble",
    name: "Stabble",
    logo: "/partner-assets/stabble-dark.webp",
    description: "Working with Stabble to unlock capital efficiency and stable liquidity.",
    website: "https://stabble.org/",
  },
  {
    id: "cracked-labs",
    name: "Cracked Labs",
    logo: "/partner-assets/crackedlabs.webp",
    description: "Building with Cracked Labs to enhance data-driven DeFi experiences.",
    website: "https://crackedlabs.org/",
  },
  {
    id: "circle",
    name: "Circle",
    logo: "/partner-assets/circle.svg",
    description: "Partnering with Circle to bring USDC liquidity and dollar-backed stability to Peridot markets.",
    website: "https://www.circle.com/",
  },
  {
    id: "layerzero",
    name: "LayerZero",
    logo: "/misc/layerzero/layerzero-black.svg",
    logoDark: "/misc/layerzero/layerzero-white.svg",
    description: "Integrating LayerZero's omnichain messaging protocol to power secure cross-chain communication across Peridot's money markets.",
    website: "https://layerzero.network/",
  },
]

export default function PartnerPage() {
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null)
  const [isVisible, setIsVisible] = useState<Record<string, boolean>>({})

  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    // Create Intersection Observer for scroll animations
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible((prev) => ({
              ...prev,
              [entry.target.id]: true,
            }))
          }
        })
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    )

    // Observe all elements with data-animate attribute
    const elements = document.querySelectorAll("[data-animate]")
    elements.forEach((el) => {
      if (observerRef.current) {
        observerRef.current.observe(el)
      }
    })

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [])

  const handlePartnerClick = (partner: Partner) => {
    setSelectedPartner(partner)
  }

  const benefits = [
    "Technical integrations and shared liquidity tooling",
    "Developer community exposure",
    "Joint marketing and ecosystem programs",
    "Early access to Peridot launches and events",
  ]

  return (
    <>
      {/* styled-jsx scoping */}
      {/* @ts-expect-error styled-jsx attribute */}
      <style jsx>{`
        @keyframes floatUp {
          0% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
          100% {
            transform: translateY(0);
          }
        }

        @keyframes floatDown {
          0% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(10px);
          }
          100% {
            transform: translateY(0);
          }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeInLeft {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .animate-float-up {
          animation: floatUp 14s ease-in-out infinite;
        }

        .animate-float-down {
          animation: floatDown 16s ease-in-out infinite;
        }

        .animate-fade-in-up {
          animation: fadeInUp 0.6s ease-out forwards;
        }

        .animate-fade-in-left {
          animation: fadeInLeft 0.4s ease-out forwards;
        }

        .animate-on-scroll {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }

        .animate-on-scroll.visible {
          opacity: 1;
          transform: translateY(0);
        }

        .animate-on-scroll-left {
          opacity: 0;
          transform: translateX(-20px);
          transition: opacity 0.4s ease-out, transform 0.4s ease-out;
        }

        .animate-on-scroll-left.visible {
          opacity: 1;
          transform: translateX(0);
        }

        .partner-card {
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease;
        }

        .partner-card:hover {
          transform: scale(1.05) translateY(-4px);
        }

        .stagger-delay-1 { animation-delay: 0.1s; }
        .stagger-delay-2 { animation-delay: 0.2s; }
        .stagger-delay-3 { animation-delay: 0.3s; }
        .stagger-delay-4 { animation-delay: 0.4s; }
        .stagger-delay-5 { animation-delay: 0.5s; }
        .stagger-delay-6 { animation-delay: 0.6s; }
      `}</style>

      <TooltipProvider>
        <div className="flex flex-col min-h-screen">
          {/* Hero Section */}
          <section className="py-16 md:py-24 relative overflow-hidden bg-background">
            <div className="absolute inset-0 pointer-events-none">
              <div
                className="absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full blur-3xl opacity-30 animate-float-up"
                style={{ background: "rgba(94,121,69,0.18)" }}
              />
              <div
                className="absolute -bottom-24 -left-24 w-[420px] h-[420px] rounded-full blur-3xl opacity-30 animate-float-down"
                style={{ background: "rgba(238,241,236,0.28)" }}
              />
              {/* Subtle gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background" />
            </div>

            <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
              <div className="max-w-4xl mx-auto text-center animate-fade-in-up">
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  Connected with us
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed">
                  Peridot works with leading protocols, liquidity platforms, and analytics providers to bring transparency and performance to every layer of DeFi.
                </p>
              </div>
            </div>
          </section>

          {/* Partners Section */}
          <section className="py-16 md:py-20 relative">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div
                id="partners-header"
                data-animate
                className={cn(
                  "text-center mb-12 animate-on-scroll",
                  isVisible["partners-header"] && "visible"
                )}
              >
                <h2 className="text-3xl md:text-4xl font-bold mb-4">Our partners</h2>
                <p className="text-muted-foreground max-w-3xl mx-auto mt-4 text-lg">
                  Together we make DeFi smarter, safer, and more accessible for everyone.
                </p>
              </div>

              {/* Partner Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
                {partners.map((partner, index) => (
                  <div
                    key={partner.id}
                    id={`partner-${partner.id}`}
                    data-animate
                    className={cn(
                      "group animate-on-scroll partner-card",
                      isVisible[`partner-${partner.id}`] && "visible",
                      `stagger-delay-${Math.min(index + 1, 6)}`
                    )}
                  >
                    <Card
                      onClick={() => handlePartnerClick(partner)}
                      className={cn(
                        "w-full h-32 md:h-40 glass-card rounded-2xl p-6 cursor-pointer",
                        "flex items-center justify-center",
                        "transition-all duration-300",
                        "hover:shadow-xl hover:shadow-primary/10",
                        "relative overflow-hidden border-0"
                      )}
                    >
                      {/* Glass morphism overlay on hover */}
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />
                      
                      {/* Placeholder logo */}
                      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center gap-3">
                        <div className="relative w-24 h-14 md:w-28 md:h-16">
                          {partner.logoDark ? (
                            <>
                              <Image
                                src={partner.logo}
                                alt={`${partner.name} logo`}
                                fill
                                sizes="(min-width: 1024px) 112px, (min-width: 768px) 104px, 96px"
                                className="object-contain drop-shadow-sm block dark:hidden"
                              />
                              <Image
                                src={partner.logoDark}
                                alt={`${partner.name} logo`}
                                fill
                                sizes="(min-width: 1024px) 112px, (min-width: 768px) 104px, 96px"
                                className="object-contain drop-shadow-sm hidden dark:block"
                                priority
                              />
                            </>
                          ) : (
                            <Image
                              src={partner.logo}
                              alt={`${partner.name} logo`}
                              fill
                              sizes="(min-width: 1024px) 112px, (min-width: 768px) 104px, 96px"
                              className="object-contain drop-shadow-sm"
                            />
                          )}
                        </div>
                        <p className="text-sm font-medium text-foreground/90 text-center">
                          {partner.name}
                        </p>
                      </div>

                      {/* External link indicator */}
                      {partner.website && (
                        <ExternalLink className="absolute top-3 right-3 w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20" />
                      )}
                    </Card>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Become a Partner Section */}
          <section className="py-16 md:py-20 relative">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="max-w-4xl mx-auto">
                <div
                  id="become-partner"
                  data-animate
                  className={cn(
                    "glass-strong rounded-3xl p-8 md:p-12 animate-on-scroll",
                    isVisible["become-partner"] && "visible"
                  )}
                >
                  <h2 className="text-3xl md:text-4xl font-bold mb-6">Become a Partner</h2>
                  <p className="text-muted-foreground text-lg mb-8">
                    By joining our partner network, you'll gain access to:
                  </p>

                  <ul className="space-y-4 mb-8">
                    {benefits.map((benefit, index) => (
                      <li
                        key={index}
                        id={`benefit-${index}`}
                        data-animate
                        className={cn(
                          "flex items-start gap-3 animate-on-scroll-left",
                          isVisible[`benefit-${index}`] && "visible",
                          `stagger-delay-${Math.min(index + 1, 6)}`
                        )}
                      >
                        <div className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                        <span className="text-foreground">{benefit}</span>
                      </li>
                    ))}
                  </ul>

                  <div
                    id="partner-button"
                    data-animate
                    className={cn(
                      "flex flex-col items-center gap-2 animate-on-scroll",
                      isVisible["partner-button"] && "visible"
                    )}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex flex-col items-center gap-1">
                          <Button
                            size="lg"
                            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-8 py-6 text-base font-semibold group"
                            asChild
                          >
                            <Link href="mailto:team@peridot.finance?subject=Partnerhip Inquiry">
                              Apply to Become a Partner
                              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                            </Link>
                          </Button>
                          <p className="text-xs text-muted-foreground/70">
                            Opens email client
                          </p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="bg-background/95 backdrop-blur-sm border border-border/50">
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="h-3.5 w-3.5" />
                          <span>Opens your email client</span>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Learn More Section */}
          <section className="py-16 md:py-20 relative">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="max-w-4xl mx-auto">
                <div
                  id="learn-more"
                  data-animate
                  className={cn(
                    "glass-card rounded-3xl p-8 md:p-12 text-center animate-on-scroll",
                    isVisible["learn-more"] && "visible"
                  )}
                >
                  <h2 className="text-3xl md:text-4xl font-bold mb-6">What is Peridot Finance?</h2>
                  <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
                    Peridot is a cross chain money market with fintech grade UX.
                  </p>
                  <div
                    id="learn-more-button"
                    data-animate
                    className={cn(
                      "animate-on-scroll",
                      isVisible["learn-more-button"] && "visible"
                    )}
                  >
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-primary/20 hover:border-primary/40 hover:bg-primary/5 text-primary rounded-xl px-8 py-6 text-base font-semibold group"
                      asChild
                    >
                      <Link href="/how-it-works">
                        Learn more
                        <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Partner Dialog */}
          <Dialog open={!!selectedPartner} onOpenChange={() => setSelectedPartner(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl border border-border bg-white text-foreground shadow-2xl backdrop-blur-lg dark:bg-background/95">
          <DialogHeader>
            <DialogTitle className="text-2xl text-foreground">{selectedPartner?.name}</DialogTitle>
            <DialogDescription className="text-base mt-2 text-foreground/90">
              {selectedPartner?.description}
            </DialogDescription>
          </DialogHeader>
          {selectedPartner && (
            <div className="pt-2">
              <Button
                asChild
                className="w-full justify-center"
                variant="outline"
              >
                <a
                  href={
                    selectedPartner.website ||
                    `mailto:partners@peridot.finance?subject=Partner%20Inquiry%20-%20${encodeURIComponent(
                      selectedPartner.name
                    )}`
                  }
                  target={selectedPartner.website ? "_blank" : undefined}
                  rel={selectedPartner.website ? "noopener noreferrer" : undefined}
                >
                  Visit {selectedPartner.name}
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          )}
            </DialogContent>
          </Dialog>
        </div>
      </TooltipProvider>
    </>
  )
}
