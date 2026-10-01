"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAccount } from "wagmi"
import { useTreasurySelection } from "@/hooks/use-treasury-selection"
import { TreasuryAssetSelector } from "./TreasuryAssetSelector"

export function DepositModule() {
  const { address, chainId } = useAccount()
  const [amount, setAmount] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  
  const {
    isAutoRouting,
    routingInfo,
    canInteractWithAsset,
  } = useTreasurySelection()

  const handleDeposit = async () => {
    if (!amount || parseFloat(amount) <= 0) return
    if (!address) return

    setIsProcessing(true)
    try {
      // TODO: Implement actual deposit logic
      // This would call the appropriate smart contract function
      console.log("Deposit:", amount, "on chain:", chainId)
      // Simulate processing
      await new Promise(resolve => setTimeout(resolve, 2000))
      setAmount("")
    } catch (error) {
      console.error("Deposit error:", error)
    } finally {
      setIsProcessing(false)
    }
  }

  const maxAmount = "1000000" // Would come from wallet balance

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">Deposit</Label>
        <TreasuryAssetSelector showBalance={false} />
      </div>
      
      <Input
        type="number"
        placeholder="0.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        disabled={isProcessing || !address || !canInteractWithAsset}
        className="h-12 text-lg font-semibold border-0 bg-muted/50"
      />
      
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setAmount(maxAmount)}
        >
          Max
        </Button>
        <Button
          className="flex-1 h-9 text-sm font-medium"
          onClick={handleDeposit}
          disabled={!amount || parseFloat(amount) <= 0 || isProcessing || !address || !canInteractWithAsset}
        >
          {isProcessing ? "Processing..." : "Deposit"}
        </Button>
      </div>

      {/* Minimal routing hint */}
      {isAutoRouting && routingInfo && (
        <p className="text-xs text-muted-foreground text-center">
          → {routingInfo.to}
        </p>
      )}
    </div>
  )
}

