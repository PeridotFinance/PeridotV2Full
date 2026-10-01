"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ReportingExport } from "@/components/treasury/ReportingExport"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Download } from "lucide-react"
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button"
import { useAccount } from "wagmi"

export default function ReportingPage() {
  const { isConnected } = useAccount()

  if (!isConnected) {
    return (
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="text-center space-y-8">
          <div>
            <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Reporting
            </h1>
            <p className="text-muted-foreground text-lg">
              Please connect your wallet to access reporting features
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
          Reporting
        </h1>
        <p className="text-muted-foreground text-lg">
          Export treasury activity and performance data
        </p>
      </div>

      {/* Reporting Card */}
      <Card className="rounded-3xl border-2 shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <Download className="w-6 h-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">Export Treasury Data</CardTitle>
              <CardDescription className="text-sm mt-1">
                Generate CSV reports of your treasury activity for accounting and analysis purposes.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ReportingExport />
        </CardContent>
      </Card>

      {/* Info Section */}
      <Card className="mt-6 rounded-3xl border-2 shadow-xl">
        <CardHeader>
          <CardTitle className="text-lg">Report Contents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Each exported report includes:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Starting balance for the selected period</li>
              <li>All deposits with timestamps</li>
              <li>All withdrawals with timestamps</li>
              <li>Accrued yield (earned interest)</li>
              <li>Ending balance</li>
            </ul>
            <p className="pt-4">
              Reports are generated on-chain and include transaction hashes for verification.
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

