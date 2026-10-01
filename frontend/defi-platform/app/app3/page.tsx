"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowRight, Shield, TrendingUp, Clock } from "lucide-react"
import Link from "next/link"
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button"
import { useAccount } from "wagmi"

export default function TreasuryOverviewPage() {
  const { isConnected } = useAccount()
  const [isHovered, setIsHovered] = useState<string | null>(null)

  return (
    <main className="container mx-auto px-4 py-12 md:py-16 max-w-6xl">
      {/* Hero Section */}
      <div className="text-center mb-16 space-y-6">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
          On-chain Treasury Management
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Institutional-grade cash management for DAOs and crypto-native organizations.
          Secure, liquid, and predictable yield on your treasury assets.
        </p>
      </div>

      {/* Key Features Grid */}
      <div className="grid md:grid-cols-3 gap-6 mb-12">
        <Card 
          className="rounded-3xl border-2 bg-gradient-to-br from-background via-background to-blue-500/5 shadow-xl hover:shadow-2xl transition-all duration-300 overflow-hidden relative"
          onMouseEnter={() => setIsHovered("treasury")}
          onMouseLeave={() => setIsHovered(null)}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent pointer-events-none" />
          <CardHeader className="relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-500/10 flex items-center justify-center mb-4">
              <TrendingUp className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle className="text-xl">24/7 Liquidität</CardTitle>
            <CardDescription className="text-sm">
              Instant withdrawals, no lockups. Your treasury remains accessible at all times.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="rounded-3xl border-2 bg-gradient-to-br from-background via-background to-green-500/5 shadow-xl hover:shadow-2xl transition-all duration-300 overflow-hidden relative"
          onMouseEnter={() => setIsHovered("yield")}
          onMouseLeave={() => setIsHovered(null)}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-transparent to-transparent pointer-events-none" />
          <CardHeader className="relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-500/10 flex items-center justify-center mb-4">
              <Clock className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-xl">Planbare Rendite</CardTitle>
            <CardDescription className="text-sm">
              Predictable yield ranges. No farming, no speculation—just steady returns.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="rounded-3xl border-2 bg-gradient-to-br from-background via-background to-purple-500/5 shadow-xl hover:shadow-2xl transition-all duration-300 overflow-hidden relative"
          onMouseEnter={() => setIsHovered("security")}
          onMouseLeave={() => setIsHovered(null)}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-transparent pointer-events-none" />
          <CardHeader className="relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-500/10 flex items-center justify-center mb-4">
              <Shield className="w-7 h-7 text-purple-600 dark:text-purple-400" />
            </div>
            <CardTitle className="text-xl">Sicherheit & Kontrolle</CardTitle>
            <CardDescription className="text-sm">
              Transparent smart contracts, audited protocols, and full control over your assets.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* CTA Section */}
      <div className="text-center space-y-6">
        {isConnected ? (
          <Link href="/app3/dashboard">
            <Button size="lg" className="text-base px-10 py-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all font-semibold">
              View Treasury
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        ) : (
          <div className="space-y-4">
            <p className="text-muted-foreground text-lg">
              Connect your wallet to access your treasury dashboard
            </p>
            <div className="flex justify-center">
              <ConnectWalletButton />
            </div>
          </div>
        )}
      </div>

      {/* Additional Info */}
      <div className="mt-16 pt-8 border-t">
        <div className="grid md:grid-cols-2 gap-8 text-sm text-muted-foreground">
          <div>
            <h3 className="font-medium text-foreground mb-2">What this is</h3>
            <ul className="space-y-1 list-disc list-inside">
              <li>On-chain cash management interface</li>
              <li>Bank account-like user experience</li>
              <li>Focus on security, control, and liquidity</li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-foreground mb-2">What this is not</h3>
            <ul className="space-y-1 list-disc list-inside">
              <li>No APY comparison or yield farming</li>
              <li>No tokenomics or gamification</li>
              <li>No market speculation tools</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  )
}

