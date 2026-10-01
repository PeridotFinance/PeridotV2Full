"use client"

import { useApy } from "@/hooks/use-apy"
import { usePeridotRewards } from "@/hooks/use-peridot-rewards"
import { monadTestnetMarkets } from "@/data/market-data"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAccount } from "wagmi"
import { formatUnits } from "viem"
import { getAssetContractAddresses, monadTestnetMarkets as monadMarketData } from "@/data/market-data"
import { monadTestnetContracts } from "@/config/contracts"


const AssetApyDebugger = ({ assetId }: { assetId: string }) => {
  const { supplyApy, borrowApy, peridotSupplyApy, peridotBorrowApy, totalSupplyApy, netBorrowApy, isLoading } = useApy({ assetId })

  if (isLoading) {
    return <div>Loading APY data for {assetId}...</div>
  }

  return (
    <div className="mb-2 p-2 border rounded">
      <h4 className="font-bold">{assetId.toUpperCase()}</h4>
      <p>Base Supply APY: {supplyApy.toFixed(2)}%</p>
      <p>Base Borrow APY: {borrowApy.toFixed(2)}%</p>
      <p className="text-green-400">PERIDOT Supply Rewards: {peridotSupplyApy.toFixed(2)}%</p>
      <p className="text-green-400">PERIDOT Borrow Rewards: {peridotBorrowApy.toFixed(2)}%</p>
      <p>Total Supply APY: {totalSupplyApy.toFixed(2)}%</p>
      <p>Net Borrow APY: {netBorrowApy.toFixed(2)}%</p>
    </div>
  )
}

export const PeridotRewardsDebugger = () => {
  const { isConnected, chain } = useAccount()
  const {
    accruedRewards,
    isLoadingAccruedRewards,
    claimRewards,
    isClaiming,
    isClaimed,
    isClaimError,
    claimError,
  } = usePeridotRewards()

  if (!isConnected) {
    return <p>Please connect your wallet to see the rewards debugger.</p>
  }
  
  if(chain?.id !== monadTestnetContracts.chainId) {
    return <p>Please switch to Monad Testnet to use the rewards debugger.</p>
  }
  
  const handleClaim = () => {
    const allMarketPtokens = Object.values(monadTestnetContracts.markets).map(market => market.pToken as `0x${string}`)
    claimRewards(allMarketPtokens)
  }

  const assetsToDebug = monadMarketData.map(asset => asset.id).slice(0, 4) // Debug first 4 assets

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Peridot Rewards Debugger (Monad Testnet)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Live APY with Rewards</h3>
          {assetsToDebug.map(assetId => (
            <AssetApyDebugger key={assetId} assetId={assetId} />
          ))}
        </div>
        <div>
          <h3 className="text-lg font-semibold">Accrued Rewards</h3>
          {isLoadingAccruedRewards ? (
            <p>Loading accrued rewards...</p>
          ) : (
            <p>
              Claimable PERIDOT:{" "}
              {accruedRewards ? formatUnits(accruedRewards as bigint, 18) : "0.0"}
            </p>
          )}
          <Button onClick={handleClaim} disabled={isClaiming || !accruedRewards}>
            {isClaiming ? "Claiming..." : "Claim All Rewards"}
          </Button>
          {isClaimed && <p className="text-green-500 mt-2">Rewards claimed successfully!</p>}
          {isClaimError && <p className="text-red-500 mt-2">Error claiming rewards: {claimError?.message}</p>}
        </div>
      </CardContent>
    </Card>
  )
} 