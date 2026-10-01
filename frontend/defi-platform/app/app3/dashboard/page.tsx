"use client"

import { Suspense } from "react"
import { TreasuryBalanceCard } from "@/components/treasury/TreasuryBalanceCard"
import { YieldSummary } from "@/components/treasury/YieldSummary"
import { LiquidityStatus } from "@/components/treasury/LiquidityStatus"
import { DepositModule } from "@/components/treasury/DepositModule"
import { WithdrawModule } from "@/components/treasury/WithdrawModule"
import { TreasuryChainSelector } from "@/components/treasury/TreasuryChainSelector"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button"
import { useAccount } from "wagmi"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, FileText, AlertTriangle } from "lucide-react"

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32 w-full" />
      <div className="grid md:grid-cols-2 gap-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  )
}

export default function TreasuryDashboardPage() {
  const { isConnected } = useAccount()

  if (!isConnected) {
    return (
      <main className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="text-center space-y-8">
          <div>
            <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Treasury Dashboard
            </h1>
            <p className="text-muted-foreground text-lg">
              Please connect your wallet to view your treasury
            </p>
          </div>
          <div className="flex justify-center">
            <ConnectWalletButton />
          </div>
          <div className="pt-4">
            <Link href="/app3">
              <Button variant="ghost" className="rounded-full">
                <ArrowLeft className="mr-2 w-4 h-4" />
                Back to Overview
              </Button>
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="container mx-auto px-4 py-6 md:py-8 max-w-4xl">
      {/* Compact Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Treasury</h1>
        <div className="flex items-center gap-2">
          <TreasuryChainSelector />
          <Link href="/app3/risk">
            <Button variant="ghost" size="sm" className="h-8 px-3 text-xs">
              Risk
            </Button>
          </Link>
          <Link href="/app3/reporting">
            <Button variant="ghost" size="sm" className="h-8 px-3 text-xs">
              Reports
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Content - Compact Layout */}
      <Suspense fallback={<DashboardSkeleton />}>
        <div className="space-y-4">
          {/* Main Balance - Hero */}
          <TreasuryBalanceCard />

          {/* Quick Actions - Single Row */}
          <div className="grid grid-cols-2 gap-3">
            <DepositModule />
            <WithdrawModule />
          </div>

          {/* Summary Stats - Compact Row */}
          <div className="grid grid-cols-2 gap-3">
            <YieldSummary />
            <LiquidityStatus />
          </div>
        </div>
      </Suspense>
    </main>
  )
}

