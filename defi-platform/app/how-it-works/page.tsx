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
      <section className="py-16 bg-gradient-to-br from-muted/30 via-background to-background relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent"></div>
        <div className="absolute top-0 right-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl opacity-30"></div>
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Introduction to <span className="gradient-text">Peridot</span>
              </h2>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              {/* Main Content */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-3xl blur-2xl opacity-50"></div>
                <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-8">
                  <div className="prose prose-invert max-w-none">
                    <p className="text-text/90 text-lg leading-relaxed mb-6">
                      Peridot introduces a <span className="text-primary font-semibold">decentralized protocol</span> on multiple blockchains that creates money markets for crypto assets. Our goal is to establish algorithmically determined interest rates based on supply and demand.
                    </p>
                    <p className="text-text/80 leading-relaxed">
                      This allows users to seamlessly trade the time value of their crypto assets through an automated, decentralized system with transparent interest calculation and immediate liquidity.
                    </p>
                  </div>
                </div>
              </div>

              {/* Problems Solved */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-transparent rounded-3xl blur-2xl opacity-50"></div>
                <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-8">
                  <h3 className="text-xl font-bold mb-6 text-accent">Problems We Solve</h3>
                  <ul className="space-y-4">
                    <li className="flex items-start group">
                      <div className="w-6 h-6 bg-primary/20 rounded-lg flex items-center justify-center mr-3 mt-0.5 flex-shrink-0 group-hover:bg-primary/30 transition-colors">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-text/80 text-sm leading-relaxed">Limited borrowing mechanisms for crypto assets</span>
                    </li>
                    <li className="flex items-start group">
                      <div className="w-6 h-6 bg-primary/20 rounded-lg flex items-center justify-center mr-3 mt-0.5 flex-shrink-0 group-hover:bg-primary/30 transition-colors">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-text/80 text-sm leading-relaxed">Negative yields due to storage costs and risks</span>
                    </li>
                    <li className="flex items-start group">
                      <div className="w-6 h-6 bg-primary/20 rounded-lg flex items-center justify-center mr-3 mt-0.5 flex-shrink-0 group-hover:bg-primary/30 transition-colors">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-text/80 text-sm leading-relaxed">Centralized exchange risks and limitations</span>
                    </li>
                    <li className="flex items-start group">
                      <div className="w-6 h-6 bg-primary/20 rounded-lg flex items-center justify-center mr-3 mt-0.5 flex-shrink-0 group-hover:bg-primary/30 transition-colors">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-text/80 text-sm leading-relaxed">High costs and low convenience in P2P solutions</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How the Protocol Works */}
      <section className="py-16 bg-gradient-to-br from-background via-muted/20 to-background relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-gradient-to-l from-accent/5 to-transparent"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl opacity-40"></div>
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                How the <span className="gradient-text">Protocol</span> Works
              </h2>
              <p className="text-text/70 text-lg max-w-3xl mx-auto leading-relaxed">
                Peridot creates separate markets for various crypto assets across multiple blockchains, providing 
                transparent, publicly accessible markets with complete transaction history and real-time interest rates.
              </p>
            </div>

                        {/* Mobile: Horizontal scroll container */}
            <div className="lg:hidden">
              <div className="flex gap-6 overflow-x-auto snap-x snap-mandatory pb-4 scrollbar-thin scrollbar-track-white/10 scrollbar-thumb-white/30">
                {/* Asset Supply - Mobile */}
                <div className="group relative flex-none w-80 snap-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-700"></div>
                  <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] h-full">
                    <div className="flex items-center mb-6">
                      <div className="w-14 h-14 bg-primary/20 rounded-2xl flex items-center justify-center mr-4">
                        <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-primary">Asset Supply</h3>
                        <p className="text-text/60 text-sm">Earn Interest</p>
                      </div>
                    </div>
                    
                    <p className="text-text/80 mb-4 text-sm leading-relaxed">
                      Users provide assets and receive pTokens representing a growing share as interest accumulates automatically.
                    </p>
                    
                    <div className="space-y-3 mb-6">
                      <div className="flex items-start">
                        <ArrowRight className="h-4 w-4 text-primary mr-2 mt-0.5 flex-shrink-0" />
                        <span className="text-text/70 text-sm">Liquid withdrawal anytime</span>
                      </div>
                      <div className="flex items-start">
                        <ArrowRight className="h-4 w-4 text-primary mr-2 mt-0.5 flex-shrink-0" />
                        <span className="text-text/70 text-sm">Automatic interest accumulation</span>
                      </div>
                    </div>
                    
                    <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                      <p className="text-text/70 text-xs uppercase tracking-wide mb-2 font-semibold">Ideal For:</p>
                      <ul className="space-y-1 text-sm">
                        <li className="flex items-center">
                          <Check className="h-3 w-3 text-primary mr-2" />
                          <span className="text-text/80">Long-term holders</span>
                        </li>
                        <li className="flex items-center">
                          <Check className="h-3 w-3 text-primary mr-2" />
                          <span className="text-text/80">dApps with idle assets</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Borrowing - Mobile */}
                <div className="group relative flex-none w-80 snap-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-transparent rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-700"></div>
                  <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] h-full">
                    <div className="flex items-center mb-6">
                      <div className="w-14 h-14 bg-accent/20 rounded-2xl flex items-center justify-center mr-4">
                        <svg className="w-7 h-7 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-accent">Borrowing</h3>
                        <p className="text-text/60 text-sm">Access Liquidity</p>
                      </div>
                    </div>
                    
                    <p className="text-text/80 mb-4 text-sm leading-relaxed">
                      Instant loans without negotiations using pTokens as collateral with dynamic interest rates.
                    </p>
                    
                    <div className="space-y-3 mb-6">
                      <div className="flex items-start">
                        <ArrowRight className="h-4 w-4 text-accent mr-2 mt-0.5 flex-shrink-0" />
                        <span className="text-text/70 text-sm">Collateral-backed loans</span>
                      </div>
                      <div className="flex items-start">
                        <ArrowRight className="h-4 w-4 text-accent mr-2 mt-0.5 flex-shrink-0" />
                        <span className="text-text/70 text-sm">Variable interest rates</span>
                      </div>
                    </div>
                    
                    <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                      <p className="text-text/70 text-xs uppercase tracking-wide mb-2 font-semibold">Use Cases:</p>
                      <ul className="space-y-1 text-sm">
                        <li className="flex items-center">
                          <Check className="h-3 w-3 text-accent mr-2" />
                          <span className="text-text/80">Leverage trading</span>
                        </li>
                        <li className="flex items-center">
                          <Check className="h-3 w-3 text-accent mr-2" />
                          <span className="text-text/80">Short positions</span>
                        </li>
                        <li className="flex items-center">
                          <Check className="h-3 w-3 text-accent mr-2" />
                          <span className="text-text/80">dApp liquidity</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Interest Model - Mobile */}
                <div className="group relative flex-none w-80 snap-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-transparent rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-700"></div>
                  <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] h-full">
                    <div className="flex items-center mb-6">
                      <div className="w-14 h-14 bg-green-500/20 rounded-2xl flex items-center justify-center mr-4">
                        <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-green-400">Interest Model</h3>
                        <p className="text-text/60 text-sm">Dynamic Rates</p>
                      </div>
                    </div>
                    
                    <p className="text-text/80 mb-4 text-sm leading-relaxed">
                      Automated model adjusts rates based on utilization - high demand increases rates, low demand decreases them.
                    </p>
                    
                    <div className="space-y-3 mb-6">
                      <div className="flex items-start">
                        <ArrowRight className="h-4 w-4 text-green-400 mr-2 mt-0.5 flex-shrink-0" />
                        <span className="text-text/70 text-sm">Supply/demand driven</span>
                      </div>
                      <div className="flex items-start">
                        <ArrowRight className="h-4 w-4 text-green-400 mr-2 mt-0.5 flex-shrink-0" />
                        <span className="text-text/70 text-sm">Natural liquidity incentives</span>
                      </div>
                    </div>
                    
                    <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                      <p className="text-text/70 text-xs uppercase tracking-wide mb-2 font-semibold">Benefits:</p>
                      <ul className="space-y-1 text-sm">
                        <li className="flex items-center">
                          <Check className="h-3 w-3 text-green-400 mr-2" />
                          <span className="text-text/80">Fair market rates</span>
                        </li>
                        <li className="flex items-center">
                          <Check className="h-3 w-3 text-green-400 mr-2" />
                          <span className="text-text/80">Automatic balancing</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop: Grid layout */}
            <div className="hidden lg:grid lg:grid-cols-3 lg:gap-8 mb-12">
              {/* Asset Supply - Desktop */}
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-700"></div>
                <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02]">
                  <div className="flex items-center mb-6">
                    <div className="w-14 h-14 bg-primary/20 rounded-2xl flex items-center justify-center mr-4">
                      <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-primary">Asset Supply</h3>
                      <p className="text-text/60 text-sm">Earn Interest</p>
                    </div>
                  </div>
                  
                  <p className="text-text/80 mb-4 text-sm leading-relaxed">
                    Users provide assets and receive pTokens representing a growing share as interest accumulates automatically.
                  </p>
                  
                  <div className="space-y-3 mb-6">
                    <div className="flex items-start">
                      <ArrowRight className="h-4 w-4 text-primary mr-2 mt-0.5 flex-shrink-0" />
                      <span className="text-text/70 text-sm">Liquid withdrawal anytime</span>
                    </div>
                    <div className="flex items-start">
                      <ArrowRight className="h-4 w-4 text-primary mr-2 mt-0.5 flex-shrink-0" />
                      <span className="text-text/70 text-sm">Automatic interest accumulation</span>
                    </div>
                  </div>
                  
                  <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                    <p className="text-text/70 text-xs uppercase tracking-wide mb-2 font-semibold">Ideal For:</p>
                    <ul className="space-y-1 text-sm">
                      <li className="flex items-center">
                        <Check className="h-3 w-3 text-primary mr-2" />
                        <span className="text-text/80">Long-term holders</span>
                      </li>
                      <li className="flex items-center">
                        <Check className="h-3 w-3 text-primary mr-2" />
                        <span className="text-text/80">dApps with idle assets</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Borrowing - Desktop */}
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-transparent rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-700"></div>
                <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02]">
                  <div className="flex items-center mb-6">
                    <div className="w-14 h-14 bg-accent/20 rounded-2xl flex items-center justify-center mr-4">
                      <svg className="w-7 h-7 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-accent">Borrowing</h3>
                      <p className="text-text/60 text-sm">Access Liquidity</p>
                    </div>
                  </div>
                  
                  <p className="text-text/80 mb-4 text-sm leading-relaxed">
                    Instant loans without negotiations using pTokens as collateral with dynamic interest rates.
                  </p>
                  
                  <div className="space-y-3 mb-6">
                    <div className="flex items-start">
                      <ArrowRight className="h-4 w-4 text-accent mr-2 mt-0.5 flex-shrink-0" />
                      <span className="text-text/70 text-sm">Collateral-backed loans</span>
                    </div>
                    <div className="flex items-start">
                      <ArrowRight className="h-4 w-4 text-accent mr-2 mt-0.5 flex-shrink-0" />
                      <span className="text-text/70 text-sm">Variable interest rates</span>
                    </div>
                  </div>
                  
                  <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                    <p className="text-text/70 text-xs uppercase tracking-wide mb-2 font-semibold">Use Cases:</p>
                    <ul className="space-y-1 text-sm">
                      <li className="flex items-center">
                        <Check className="h-3 w-3 text-accent mr-2" />
                        <span className="text-text/80">Leverage trading</span>
                      </li>
                      <li className="flex items-center">
                        <Check className="h-3 w-3 text-accent mr-2" />
                        <span className="text-text/80">Short positions</span>
                      </li>
                      <li className="flex items-center">
                        <Check className="h-3 w-3 text-accent mr-2" />
                        <span className="text-text/80">dApp liquidity</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Interest Model - Desktop */}
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-transparent rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-700"></div>
                <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02]">
                  <div className="flex items-center mb-6">
                    <div className="w-14 h-14 bg-green-500/20 rounded-2xl flex items-center justify-center mr-4">
                      <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-green-400">Interest Model</h3>
                      <p className="text-text/60 text-sm">Dynamic Rates</p>
                    </div>
                  </div>
                  
                  <p className="text-text/80 mb-4 text-sm leading-relaxed">
                    Automated model adjusts rates based on utilization - high demand increases rates, low demand decreases them.
                  </p>
                  
                  <div className="space-y-3 mb-6">
                    <div className="flex items-start">
                      <ArrowRight className="h-4 w-4 text-green-400 mr-2 mt-0.5 flex-shrink-0" />
                      <span className="text-text/70 text-sm">Supply/demand driven</span>
                    </div>
                    <div className="flex items-start">
                      <ArrowRight className="h-4 w-4 text-green-400 mr-2 mt-0.5 flex-shrink-0" />
                      <span className="text-text/70 text-sm">Natural liquidity incentives</span>
                    </div>
                  </div>
                  
                  <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                    <p className="text-text/70 text-xs uppercase tracking-wide mb-2 font-semibold">Benefits:</p>
                    <ul className="space-y-1 text-sm">
                      <li className="flex items-center">
                        <Check className="h-3 w-3 text-green-400 mr-2" />
                        <span className="text-text/80">Fair market rates</span>
                      </li>
                      <li className="flex items-center">
                        <Check className="h-3 w-3 text-green-400 mr-2" />
                        <span className="text-text/80">Automatic balancing</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* User Guide & FAQ */}
      <section className="py-16 bg-gradient-to-br from-background via-background/95 to-muted/30 relative overflow-hidden">
        {/* Glass morphism background elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 backdrop-blur-3xl"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-20"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl opacity-20"></div>
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                User Guide & <span className="gradient-text">FAQ</span>
              </h2>
              <p className="text-text/70 text-lg max-w-2xl mx-auto">
                Everything you need to know to get started with Peridot
              </p>
            </div>
            
            {/* Mobile: Horizontal scroll container */}
            <div className="md:hidden">
              <div className="flex gap-6 overflow-x-auto snap-x snap-mandatory pb-4 scrollbar-thin scrollbar-track-white/10 scrollbar-thumb-white/30">
                {/* Assets & Wallets - Mobile */}
                <div className="group relative flex-none w-80 snap-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
                  <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl h-full">
                    <div className="flex items-center mb-6">
                      <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center mr-4">
                        <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-primary">Assets & Wallets</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                        <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide text-primary/80">Supported Assets</h4>
                        <p className="text-text/80 text-sm leading-relaxed">
                          ETH, USDC, DAI, and other major cryptocurrencies for earning yield and borrowing on-chain.
                        </p>
                      </div>
                      <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                        <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide text-primary/80">Compatible Wallets</h4>
                        <p className="text-text/80 text-sm leading-relaxed">
                          MetaMask, WalletConnect, hardware wallets, and other Web3-compatible wallets.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Fees & Costs - Mobile */}
                <div className="group relative flex-none w-80 snap-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
                  <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl h-full">
                    <div className="flex items-center mb-6">
                      <div className="w-12 h-12 bg-accent/20 rounded-xl flex items-center justify-center mr-4">
                        <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-accent">Fees & Costs</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                        <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide text-accent/80">Protocol Fees</h4>
                        <p className="text-text/80 text-sm leading-relaxed">
                          Zero upfront fees. Only blockchain gas fees for transactions.
                        </p>
                      </div>
                      <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                        <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide text-accent/80">Network Costs</h4>
                        <p className="text-text/80 text-sm leading-relaxed">
                          Ethereum has higher gas fees. Layer 2 and alternative chains offer lower costs.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Collateral & Risk - Mobile */}
                <div className="group relative flex-none w-80 snap-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
                  <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl h-full">
                    <div className="flex items-center mb-6">
                      <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center mr-4">
                        <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-orange-400">Collateral & Risk</h3>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      <div className="bg-black/20 rounded-lg p-2 border border-white/5">
                        <h4 className="font-semibold mb-1 text-xs uppercase tracking-wide text-orange-400/80">How is my collateral managed?</h4>
                        <p className="text-text/80 text-xs leading-relaxed">
                          Supplied assets are held in transparent, auditable smart contracts to back over-collateralized loans while earning interest.
                        </p>
                      </div>
                      <div className="bg-black/20 rounded-lg p-2 border border-white/5">
                        <h4 className="font-semibold mb-1 text-xs uppercase tracking-wide text-orange-400/80">What happens if my collateral value drops?</h4>
                        <p className="text-text/80 text-xs leading-relaxed">
                          If your health factor falls below the threshold, up to 50% of your debt can be liquidated, plus a liquidation penalty.
                        </p>
                      </div>
                      <div className="bg-black/20 rounded-lg p-2 border border-white/5">
                        <h4 className="font-semibold mb-1 text-xs uppercase tracking-wide text-orange-400/80">Who can initiate liquidations?</h4>
                        <p className="text-text/80 text-xs leading-relaxed">
                          Any network participant can trigger liquidation on under-collateralized positions, incentivized by a bonus on seized collateral.
                        </p>
                      </div>
                      <div className="bg-black/20 rounded-lg p-2 border border-white/5">
                        <h4 className="font-semibold mb-1 text-xs uppercase tracking-wide text-orange-400/80">How can I avoid liquidation?</h4>
                        <p className="text-text/80 text-xs leading-relaxed">
                          Keep your collateralization ratio safely above the liquidation threshold and monitor your health factor closely.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Interest & Returns - Mobile */}
                <div className="group relative flex-none w-80 snap-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
                  <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl h-full">
                    <div className="flex items-center mb-6">
                      <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center mr-4">
                        <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-green-400">Interest & Returns</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                        <h4 className="font-semibold mb-1 text-xs uppercase tracking-wide text-green-400/80">How is APY calculated?</h4>
                        <p className="text-text/80 text-xs leading-relaxed">
                          Interest compounds per block based on current supply rate and block time, following standard DeFi yield formulas.
                        </p>
                      </div>
                      <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                        <h4 className="font-semibold mb-1 text-xs uppercase tracking-wide text-green-400/80">Are there APY limits?</h4>
                        <p className="text-text/80 text-xs leading-relaxed">
                          Certain markets may have caps or range bounds set by governance to manage risk and ensure stability.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Security & Transparency - Mobile */}
                <div className="group relative flex-none w-80 snap-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
                  <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl h-full">
                    <div className="flex items-center mb-6">
                      <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mr-4">
                        <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-blue-400">Security & Transparency</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                        <h4 className="font-semibold mb-1 text-xs uppercase tracking-wide text-blue-400/80">Has Peridot been audited?</h4>
                        <p className="text-text/80 text-xs leading-relaxed">
                          Yes—contracts undergo regular third-party audits by leading security firms, with full audit reports publicly available.
                        </p>
                      </div>
                      <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                        <h4 className="font-semibold mb-1 text-xs uppercase tracking-wide text-blue-400/80">What if there's a vulnerability?</h4>
                        <p className="text-text/80 text-xs leading-relaxed">
                          Peridot maintains a bug bounty program to reward responsible disclosures and patch issues proactively.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Governance & Rewards - Mobile */}
                <div className="group relative flex-none w-80 snap-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
                  <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl h-full">
                    <div className="flex items-center mb-6">
                      <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mr-4">
                        <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-purple-400">Governance & Rewards</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                        <h4 className="font-semibold mb-1 text-xs uppercase tracking-wide text-purple-400/80">Is there a governance token?</h4>
                        <p className="text-text/80 text-xs leading-relaxed">
                          Peridot's native token grants holders voting rights on asset listings, protocol upgrades, and parameter changes.
                        </p>
                      </div>
                      <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                        <h4 className="font-semibold mb-1 text-xs uppercase tracking-wide text-purple-400/80">How do I participate in governance?</h4>
                        <p className="text-text/80 text-xs leading-relaxed">
                          Connect your wallet to the governance portal to propose, vote, or delegate—and earn participation rewards.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop: Grid layout */}
            <div className="hidden md:grid md:grid-cols-3 gap-6">
              {/* Assets & Wallets */}
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
                <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl">
                  <div className="flex items-center mb-6">
                    <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center mr-4">
                      <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-primary">Assets & Wallets</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                      <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide text-primary/80">Supported Assets</h4>
                      <p className="text-text/80 text-sm leading-relaxed">
                        ETH, USDC, DAI, and other major cryptocurrencies for earning yield and borrowing on-chain.
                      </p>
                    </div>
                    <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                      <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide text-primary/80">Compatible Wallets</h4>
                      <p className="text-text/80 text-sm leading-relaxed">
                        MetaMask, WalletConnect, hardware wallets, and other Web3-compatible wallets.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fees & Costs */}
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
                <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl">
                  <div className="flex items-center mb-6">
                    <div className="w-12 h-12 bg-accent/20 rounded-xl flex items-center justify-center mr-4">
                      <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-accent">Fees & Costs</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                      <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide text-accent/80">Protocol Fees</h4>
                      <p className="text-text/80 text-sm leading-relaxed">
                        Zero upfront fees. Only blockchain gas fees for transactions.
                      </p>
                    </div>
                    <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                      <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide text-accent/80">Network Costs</h4>
                      <p className="text-text/80 text-sm leading-relaxed">
                        Ethereum has higher gas fees. Layer 2 and alternative chains offer lower costs.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Collateral & Liquidation */}
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
                <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl">
                  <div className="flex items-center mb-6">
                    <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center mr-4">
                      <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-orange-400">Collateral & Risk</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                      <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide text-orange-400/80">Safety Measures</h4>
                      <p className="text-text/80 text-sm leading-relaxed">
                        Assets held in auditable smart contracts. Over-collateralized loans with health monitoring.
                      </p>
                    </div>
                    <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                      <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide text-orange-400/80">Liquidation Protection</h4>
                      <p className="text-text/80 text-sm leading-relaxed">
                        Monitor health factor, maintain safe ratios, and add collateral during market volatility.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Interest & APY */}
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
                <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl">
                  <div className="flex items-center mb-6">
                    <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center mr-4">
                      <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-green-400">Interest & Returns</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                      <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide text-green-400/80">How is APY calculated?</h4>
                      <p className="text-text/80 text-sm leading-relaxed">
                        Interest compounds per block based on current supply rate and block time, following standard DeFi yield formulas.
                      </p>
                    </div>
                    <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                      <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide text-green-400/80">Are there APY limits?</h4>
                      <p className="text-text/80 text-sm leading-relaxed">
                        Certain markets may have caps or range bounds set by governance to manage risk and ensure stability.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Security & Transparency - Desktop */}
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
                <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl">
                  <div className="flex items-center mb-6">
                    <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mr-4">
                      <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-blue-400">Security & Transparency</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                      <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide text-blue-400/80">Has Peridot been audited?</h4>
                      <p className="text-text/80 text-sm leading-relaxed">
                        Yes—contracts undergo regular third-party audits by leading security firms, with full audit reports publicly available.
                      </p>
                    </div>
                    <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                      <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide text-blue-400/80">What if there's a vulnerability?</h4>
                      <p className="text-text/80 text-sm leading-relaxed">
                        Peridot maintains a bug bounty program to reward responsible disclosures and patch issues proactively.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Governance & Rewards - Desktop */}
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
                <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl">
                  <div className="flex items-center mb-6">
                    <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mr-4">
                      <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-purple-400">Governance & Rewards</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                      <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide text-purple-400/80">Is there a governance token?</h4>
                      <p className="text-text/80 text-sm leading-relaxed">
                        Peridot's native token grants holders voting rights on asset listings, protocol upgrades, and parameter changes.
                      </p>
                    </div>
                    <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                      <h4 className="font-semibold mb-2 text-sm uppercase tracking-wide text-purple-400/80">How do I participate in governance?</h4>
                      <p className="text-text/80 text-sm leading-relaxed">
                        Connect your wallet to the governance portal to propose, vote, or delegate—and earn participation rewards.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="mt-12 text-center">
              <div className="inline-flex items-center space-x-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6">
                <span className="text-text/70">Ready to get started?</span>
                <Button asChild size="lg" className="bg-primary text-background hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all duration-300">
                  <Link href="/app">Launch App</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* Summary */}
      <section className="py-16 bg-gradient-to-br from-muted/30 via-background to-primary/5 relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-accent/5"></div>
        <div className="absolute top-1/3 right-1/3 w-80 h-80 bg-primary/10 rounded-full blur-3xl opacity-30"></div>
        <div className="absolute bottom-1/3 left-1/3 w-64 h-64 bg-accent/10 rounded-full blur-3xl opacity-25"></div>
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                <span className="gradient-text">Summary</span>
              </h2>
              <p className="text-text/70 text-lg max-w-2xl mx-auto">
                The future of decentralized finance, built for everyone
              </p>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 rounded-3xl blur-2xl opacity-50"></div>
              <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-8 md:p-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="flex items-start group">
                      <div className="w-8 h-8 bg-primary/20 rounded-xl flex items-center justify-center mr-4 mt-1 flex-shrink-0 group-hover:bg-primary/30 transition-colors">
                        <Check className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-text mb-2">Multi-Chain Money Markets</h3>
                        <p className="text-text/80 text-sm leading-relaxed">
                          Effective crypto asset markets across multiple blockchains with transparent operations
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start group">
                      <div className="w-8 h-8 bg-accent/20 rounded-xl flex items-center justify-center mr-4 mt-1 flex-shrink-0 group-hover:bg-accent/30 transition-colors">
                        <Check className="h-4 w-4 text-accent" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-text mb-2">Dynamic Interest Rates</h3>
                        <p className="text-text/80 text-sm leading-relaxed">
                          Algorithmically adjusted rates responding to real-time supply and demand
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start group">
                      <div className="w-8 h-8 bg-green-500/20 rounded-xl flex items-center justify-center mr-4 mt-1 flex-shrink-0 group-hover:bg-green-500/30 transition-colors">
                        <Check className="h-4 w-4 text-green-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-text mb-2">Trustless Yield Generation</h3>
                        <p className="text-text/80 text-sm leading-relaxed">
                          Earn interest on assets without relying on centralized entities
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="flex items-start group">
                      <div className="w-8 h-8 bg-orange-500/20 rounded-xl flex items-center justify-center mr-4 mt-1 flex-shrink-0 group-hover:bg-orange-500/30 transition-colors">
                        <Check className="h-4 w-4 text-orange-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-text mb-2">Instant Liquidity</h3>
                        <p className="text-text/80 text-sm leading-relaxed">
                          Immediate loans with assets as collateral, no waiting periods required
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start group">
                      <div className="w-8 h-8 bg-purple-500/20 rounded-xl flex items-center justify-center mr-4 mt-1 flex-shrink-0 group-hover:bg-purple-500/30 transition-colors">
                        <Check className="h-4 w-4 text-purple-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-text mb-2">Financial Infrastructure</h3>
                        <p className="text-text/80 text-sm leading-relaxed">
                          Stable, decentralized foundation for the future of blockchain finance
                        </p>
                      </div>
                    </div>
                    
                    <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl p-6 border border-white/10">
                      <div className="text-center">
                        <p className="text-text/90 font-medium mb-4">Ready to experience the future of DeFi?</p>
                        <Button asChild size="lg" className="bg-primary text-background hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all duration-300 w-full">
                          <Link href="/app">Launch Peridot App</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
