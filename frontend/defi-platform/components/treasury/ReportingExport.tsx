"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, Calendar } from "lucide-react"
import { useAccount } from "wagmi"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info } from "lucide-react"

export function ReportingExport() {
  const { address } = useAccount()
  const [period, setPeriod] = useState<string>("30")
  const [isGenerating, setIsGenerating] = useState(false)

  const handleExport = async () => {
    if (!address) return

    setIsGenerating(true)
    try {
      // TODO: Implement actual CSV export logic
      // This would fetch transaction data and generate CSV
      console.log("Exporting report for period:", period, "days")
      
      // Simulate CSV generation
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // Create mock CSV data
      const csvData = [
        ["Date", "Type", "Amount", "Balance", "Transaction Hash"],
        ["2024-01-01", "Deposit", "10000.00", "10000.00", "0x..."],
        ["2024-01-15", "Yield", "45.21", "10045.21", "0x..."],
        ["2024-01-30", "Yield", "45.21", "10090.42", "0x..."]
      ].map(row => row.join(",")).join("\n")
      
      // Download CSV
      const blob = new Blob([csvData], { type: "text/csv" })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `treasury-report-${period}days-${new Date().toISOString().split("T")[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Export error:", error)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="period-select">Time Period</Label>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger id="period-select" className="rounded-2xl h-12">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Reports include all deposits, withdrawals, and accrued yield for the selected period.
          Data is fetched on-chain and includes transaction hashes for verification.
        </AlertDescription>
      </Alert>

      <Button
        className="w-full rounded-2xl h-12 text-base font-semibold shadow-lg hover:shadow-xl transition-all"
        onClick={handleExport}
        disabled={isGenerating || !address}
      >
        {isGenerating ? (
          <>
            <Download className="mr-2 w-5 h-5 animate-pulse" />
            Generating...
          </>
        ) : (
          <>
            <Download className="mr-2 w-5 h-5" />
            Export CSV Report
          </>
        )}
      </Button>

      {!address && (
        <p className="text-xs text-muted-foreground text-center">
          Connect wallet to generate reports
        </p>
      )}
    </div>
  )
}

