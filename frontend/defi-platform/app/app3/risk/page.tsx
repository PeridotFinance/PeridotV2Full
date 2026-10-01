"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RiskDisclosure } from "@/components/treasury/RiskDisclosure"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Shield, AlertTriangle, Info } from "lucide-react"

export default function RiskAndControlsPage() {
  return (
    <main className="container mx-auto px-4 py-8 md:py-12 max-w-4xl">
      {/* Header */}
      <div className="mb-10">
        <Link href="/app3/dashboard">
          <Button variant="ghost" className="mb-6 rounded-full">
            <ArrowLeft className="mr-2 w-4 h-4" />
            Back to Dashboard
          </Button>
        </Link>
        <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Risk & Controls
        </h1>
        <p className="text-muted-foreground text-lg">
          Understanding risks and system behavior
        </p>
      </div>

      {/* What the System Does */}
      <Card className="mb-6 rounded-3xl border-2 shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">What This System Does</CardTitle>
              <CardDescription className="text-sm mt-1">
                Core functionality and purpose
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <h4 className="font-medium mb-1">On-chain Treasury Management</h4>
            <p className="text-sm text-muted-foreground">
              Provides a secure interface for managing treasury assets on-chain with predictable yield generation.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-1">Liquidity Provision</h4>
            <p className="text-sm text-muted-foreground">
              Assets are deployed to audited lending protocols to generate yield while maintaining instant withdrawal capability.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-1">Multi-Chain Architecture</h4>
            <p className="text-sm text-muted-foreground">
              Hub-and-spoke model: deposits from spoke chains are routed to hub chains (BSC, Monad) for yield generation.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* What the System Does NOT Do */}
      <Card className="mb-6 rounded-3xl border-2 shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-muted/20 to-muted/10 flex items-center justify-center">
              <Info className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-xl">What This System Does Not Do</CardTitle>
              <CardDescription className="text-sm mt-1">
                Explicit limitations and boundaries
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <h4 className="font-medium mb-1">No Yield Optimization</h4>
            <p className="text-sm text-muted-foreground">
              This is not a yield optimizer. Strategies are conservative and predictable, not designed to maximize returns.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-1">No Leverage or Borrowing</h4>
            <p className="text-sm text-muted-foreground">
              Your treasury assets are not used as collateral for borrowing. No leverage is applied to your positions.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-1">No Speculative Strategies</h4>
            <p className="text-sm text-muted-foreground">
              No trading, no token swaps, no exposure to volatile assets beyond the base stablecoin holdings.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Risk Categories */}
      <Card className="mb-6 rounded-3xl border-2 shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-destructive/20 to-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-xl">Risk Categories</CardTitle>
              <CardDescription className="text-sm mt-1">
                Understanding potential risks
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <RiskDisclosure />
        </CardContent>
      </Card>

      {/* Emergency Behavior */}
      <Card className="rounded-3xl border-2 shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-500/10 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <CardTitle className="text-xl">Emergency Behavior</CardTitle>
              <CardDescription className="text-sm mt-1">
                System behavior in exceptional circumstances
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Pause Mechanism</h4>
            <p className="text-sm text-muted-foreground mb-2">
              In the event of a security incident or protocol issue, the system may be paused. During a pause:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside ml-4">
              <li>New deposits are disabled</li>
              <li>Existing positions remain secure</li>
              <li>Withdrawals may be temporarily restricted</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2">Withdraw-Only Mode</h4>
            <p className="text-sm text-muted-foreground mb-2">
              In certain scenarios, the system may enter withdraw-only mode:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside ml-4">
              <li>All withdrawals remain functional</li>
              <li>New deposits are disabled</li>
              <li>Yield generation continues on existing positions</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

