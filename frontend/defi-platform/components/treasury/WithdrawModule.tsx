"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAccount } from "wagmi"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { useTreasurySelection } from "@/hooks/use-treasury-selection"
import { TreasuryAssetSelector } from "./TreasuryAssetSelector"

export function WithdrawModule() {
  const { address, chainId } = useAccount()
  const { chainBalances, isLoading } = useCrossChainBalances()
  const { selectedHubChainId, selectedAsset, canInteractWithAsset } = useTreasurySelection()
  const [amount, setAmount] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  // Get available balance for selected chain and asset
  const availableBalance = useMemo(() => {
    if (!chainBalances || !selectedHubChainId) return "0.00"
    
    const chainBalance = chainBalances.find(cb => cb.chainId === selectedHubChainId)
    if (!chainBalance) return "0.00"
    
    // If asset is selected, show balance for that asset
    if (selectedAsset) {
      const position = chainBalance.positions?.find(
        p => p.marketData?.symbol?.toLowerCase() === selectedAsset.symbol.toLowerCase()
      )
      if (position) {
        return (position.suppliedValueUSD || 0).toFixed(2)
      }
    }
    
    // Otherwise show total for chain
    return (chainBalance.totalSupplied || 0).toFixed(2)
  }, [chainBalances, selectedHubChainId, selectedAsset])

  const handleWithdraw = async () => {
    if (!amount || parseFloat(amount) <= 0) return
    if (!address) return
    if (parseFloat(amount) > parseFloat(availableBalance)) return

    setIsProcessing(true)
    try {
      // TODO: Implement actual withdraw logic
      console.log("Withdraw:", amount, "on chain:", chainId)
      // Simulate processing
      await new Promise(resolve => setTimeout(resolve, 2000))
      setAmount("")
    } catch (error) {
      console.error("Withdraw error:", error)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">Withdraw</Label>
        <div className="flex items-center gap-2">
          <TreasuryAssetSelector showBalance={false} />
          <span className="text-xs text-muted-foreground">
            {isLoading ? "..." : `$${availableBalance}`}
          </span>
        </div>
      </div>
      
      <Input
        type="number"
        placeholder="0.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        disabled={isProcessing || !address || !canInteractWithAsset}
        max={availableBalance}
        className="h-12 text-lg font-semibold border-0 bg-muted/50"
      />
      
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setAmount(availableBalance)}
          disabled={isLoading || parseFloat(availableBalance) === 0 || !canInteractWithAsset}
        >
          Max
        </Button>
        <Button
          variant="outline"
          className="flex-1 h-9 text-sm font-medium"
          onClick={handleWithdraw}
          disabled={
            !amount || 
            parseFloat(amount) <= 0 || 
            parseFloat(amount) > parseFloat(availableBalance) ||
            isProcessing || 
            !address ||
            !canInteractWithAsset
          }
        >
          {isProcessing ? "Processing..." : "Withdraw"}
        </Button>
      </div>
    </div>
  )
}

