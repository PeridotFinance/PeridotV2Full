"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Asset } from "@/types/markets"
import { Button } from "@/components/ui/button"
import { Check, Loader2 } from "lucide-react"
import Image from "next/image"
import { useAccount, useReadContract } from "wagmi"
import { formatUnits } from "viem"
import { getAssetContractAddresses } from "@/data/market-data"
import { getChainConfig } from "@/config/contracts"
import { useSupplyTransaction } from "@/hooks/use-supply-transaction"
import { useBorrowTransaction } from "@/hooks/use-borrow-transaction"
import { useBorrowBalance } from "@/hooks/use-borrow-balance"
import { useRedeemTransaction } from "@/hooks/use-redeem-transaction"
import { usePTokenBalance } from "@/hooks/use-ptoken-balance"
import { useBorrowingPower } from "@/hooks/use-borrowing-power"
import { useMarketMembership } from "@/hooks/use-market-membership"
import { useEnterMarket } from "@/hooks/use-enter-market"
import { BalanceDebugInfo } from "./BalanceDebugInfo"
import combinedAbi from "@/app/abis/combinedAbi.json"

interface AssetDropdownProps {
  asset: Asset
  isOpen: boolean
  onClose: () => void
  onTransaction: (asset: Asset, amount: number, type: "supply" | "borrow") => void
  isDemoMode: boolean
}

export const AssetDropdown = ({
  asset,
  isOpen,
  onClose,
  onTransaction,
  isDemoMode,
}: AssetDropdownProps) => {
  const [supplyAmount, setSupplyAmount] = useState("")
  const [borrowAmount, setBorrowAmount] = useState("")
  const [redeemAmount, setRedeemAmount] = useState("")
  const [redeemType, setRedeemType] = useState<'pTokens' | 'underlying'>('underlying')
  const [showConfirmation, setShowConfirmation] = useState(false)
  const hasSmartContract = asset.hasSmartContract !== false
  
  const { isConnected, chainId } = useAccount()
  
  // Get contract addresses and chain config
  const contractAddresses = chainId ? getAssetContractAddresses(asset.id, chainId) : null
  const chainConfig = chainId ? getChainConfig(chainId) : null
  const controllerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy : null

  // Fetch real oracle price
  const knownOracleAddress = '0xeAEdaF63CbC1d00cB6C14B5c4DE161d68b7C63A0' // Monad testnet oracle
  const { data: oraclePrice } = useReadContract({
    address: knownOracleAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'getUnderlyingPrice',
    args: [contractAddresses?.pTokenAddress!],
    query: {
      enabled: !!contractAddresses?.pTokenAddress && chainId === 10143, // Only for Monad testnet
    }
  })

  // Calculate real oracle price in USD
  const realOraclePrice = oraclePrice 
    ? parseFloat(formatUnits(BigInt(oraclePrice.toString()), 18))
    : null
  
  // Use smart contract hook for supply transactions
  const {
    executeSupply,
    manualSupplyTrigger,
    isLoading: isSupplyLoading,
    error: supplyError,
    canSupply,
    reset: resetSupply,
    step,
    statusMessage,
    needsApproval,
    approveHash,
    supplyHash,
  } = useSupplyTransaction({
    assetId: asset.id,
    amount: supplyAmount,
    onSuccess: () => {
      const amount = parseFloat(supplyAmount);
      if (!isNaN(amount) && amount > 0) {
        onTransaction(asset, amount, "supply");
      }
      setSupplyAmount("");
      setShowConfirmation(true);
      setTimeout(() => setShowConfirmation(false), 3000);
      resetSupply();
    },
    onError: (error) => {
      console.error('Supply transaction failed:', error);
      // The error is already shown in the UI via the error state
    },
  })

  // Use smart contract hook for borrow transactions
  const {
    executeBorrow,
    isLoading: isBorrowLoading,
    error: borrowError,
    canBorrow,
    reset: resetBorrow,
    step: borrowStep,
    statusMessage: borrowStatusMessage,
    borrowHash,
  } = useBorrowTransaction({
    assetId: asset.id,
    amount: borrowAmount,
    onSuccess: () => {
      const amount = parseFloat(borrowAmount);
      if (!isNaN(amount) && amount > 0) {
        onTransaction(asset, amount, "borrow");
      }
      setBorrowAmount("");
      setShowConfirmation(true);
      setTimeout(() => setShowConfirmation(false), 3000);
      resetBorrow();
    },
    onError: (error) => {
      console.error('Borrow transaction failed:', error);
      // The error is already shown in the UI via the error state
    },
  })

  // Get user's borrow balance for this asset
  const {
    formattedBalance: borrowBalance,
    isLoading: isBorrowBalanceLoading,
    hasBorrow,
  } = useBorrowBalance({
    assetId: asset.id,
  })

  // Get borrowing power information
  const { getMaxBorrowAmount, isBorrowAmountSafe, borrowingPower } = useBorrowingPower()

  // Get user's pToken balance for redeeming
  const {
    formattedBalance: pTokenBalance,
    hasBalance: hasPTokenBalance,
    isLoading: isPTokenBalanceLoading,
  } = usePTokenBalance({
    assetId: asset.id,
  })

  // Get market membership (collateral status)
  const {
    isCollateralEnabled,
    isLoading: isCollateralStatusLoading,
    refetch: refetchCollateralStatus,
  } = useMarketMembership({
    assetId: asset.id,
  })

  // Manual enter market hook (for fixing collateral issues)
  const {
    executeEnterMarket,
    isLoading: isEnteringMarket,
    error: enterMarketError,
    step: enterMarketStep,
    statusMessage: enterMarketStatusMessage,
    reset: resetEnterMarket,
  } = useEnterMarket({
    assetId: asset.id,
    onSuccess: () => {
      console.log('Successfully entered market manually for', asset.symbol)
      // Refresh collateral status
      refetchCollateralStatus()
      // Reset the enter market state
      setTimeout(() => resetEnterMarket(), 2000)
    },
    onError: (error) => {
      console.error('Manual enter market failed:', error)
    },
  })

  // Use smart contract hook for redeem transactions
  const {
    executeRedeem,
    isLoading: isRedeemLoading,
    error: redeemError,
    canRedeem,
    reset: resetRedeem,
    step: redeemStep,
    statusMessage: redeemStatusMessage,
    redeemHash,
  } = useRedeemTransaction({
    assetId: asset.id,
    amount: redeemAmount,
    redeemType: redeemType,
    onSuccess: () => {
      const amount = parseFloat(redeemAmount);
      if (!isNaN(amount) && amount > 0) {
        onTransaction(asset, amount, "supply"); // Using "supply" for demo purposes - you might want to add "redeem" type
      }
      setRedeemAmount("");
      setShowConfirmation(true);
      setTimeout(() => setShowConfirmation(false), 3000);
      resetRedeem();
    },
    onError: (error) => {
      console.error('Redeem transaction failed:', error);
      // The error is already shown in the UI via the error state
    },
  })

  const handleSupply = () => {
    if (!isConnected) {
      alert('Please connect your wallet first');
      return;
    }
    
    if (!hasSmartContract) {
      // Fallback to demo mode for assets without smart contracts
      if (!isDemoMode) return;
      const amount = parseFloat(supplyAmount);
      if (isNaN(amount) || amount <= 0) return;
      onTransaction(asset, amount, "supply");
      setSupplyAmount("");
      setShowConfirmation(true);
      setTimeout(() => setShowConfirmation(false), 2000);
      return;
    }

    // Use real smart contract interaction
    const amount = parseFloat(supplyAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    
    executeSupply();
  }

  const handleBorrow = () => {
    if (!isConnected) {
      alert('Please connect your wallet first');
      return;
    }
    
    if (!hasSmartContract) {
      // Fallback to demo mode for assets without smart contracts
      if (!isDemoMode) return;
    const amount = parseFloat(borrowAmount);
    if (isNaN(amount) || amount <= 0) return;
    onTransaction(asset, amount, "borrow");
    setBorrowAmount("");
    setShowConfirmation(true);
    setTimeout(() => setShowConfirmation(false), 2000);
      return;
    }

    // Use real smart contract interaction
    const amount = parseFloat(borrowAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    
    executeBorrow();
  }

  const handleRedeem = () => {
    if (!isConnected) {
      alert('Please connect your wallet first');
      return;
    }
    
    if (!hasSmartContract) {
      alert('This asset does not support smart contract operations');
      return;
    }

    // Use real smart contract interaction
    const amount = parseFloat(redeemAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    
    executeRedeem();
  }

  const handleMaxRedeem = () => {
    if (redeemType === 'underlying' && pTokenBalance) {
      // Set the amount to the available underlying balance
      setRedeemAmount(pTokenBalance.replace(' < 0.01', '0.01')); // Handle small amounts
    } else if (redeemType === 'pTokens') {
      // For pTokens, we'd need the raw pToken balance - for now, use the formatted one
      setRedeemAmount(pTokenBalance.replace(' < 0.01', '0.01'));
    }
  }

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="bg-muted/30 border-t border-border/50 p-4 overflow-hidden"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Asset Info */}
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <Image src={asset.icon} alt={asset.name} width={36} height={36} />
            </div>
            <div>
              <div className="font-medium flex items-center gap-2">
                {asset.name}
                {hasSmartContract && isConnected && hasPTokenBalance && (
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    isCollateralEnabled 
                      ? 'bg-green-100 text-green-700 border border-green-200' 
                      : 'bg-orange-100 text-orange-700 border border-orange-200'
                  }`}>
                    {isCollateralEnabled ? '✓ Collateral' : '⚠ Not Collateral'}
                  </span>
                )}
              </div>
              <div className="text-sm text-text/60">{asset.symbol}</div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2 text-sm">
            <div className="flex justify-between">
              <span>Oracle Price:</span>
              <span className="font-medium">${realOraclePrice?.toLocaleString() || asset.oraclePrice?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Market Cap:</span>
              <span className="font-medium">{asset.marketCap}</span>
            </div>
            <div className="flex justify-between">
              <span>24h Volume:</span>
              <span className="font-medium">{asset.volume24h}</span>
            </div>
          </div>
        </div>

        {/* Market Data */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Market Details</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2 text-sm">
            <div className="flex justify-between">
              <span>Available Liquidity:</span>
              <span className="font-medium">{asset.liquidity}</span>
            </div>
            <div className="flex justify-between">
              <span>Utilization Rate:</span>
              <span className="font-medium">{asset.utilizationRate}%</span>
            </div>
            <div className="flex justify-between">
              <span>Liq. Threshold:</span>
              <span className="font-medium">{asset.liquidationThreshold}%</span>
            </div>
            <div className="flex justify-between">
              <span>Liquidation Penalty:</span>
              <span className="font-medium">{asset.liquidationPenalty}%</span>
            </div>
            <div className="flex justify-between">
              <span>Max LTV:</span>
              <span className="font-medium">{asset.maxLTV}%</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Actions</h4>
          
          {/* Collateral Status Info */}
          {hasSmartContract && isConnected && hasPTokenBalance && (
            <div className={`p-3 rounded-lg text-sm ${
              isCollateralEnabled 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-orange-50 border border-orange-200'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">
                  {isCollateralEnabled ? '✓ Enabled as Collateral' : '⚠ Not Enabled as Collateral'}
                </span>
                {!isCollateralEnabled && (
                  <Button
                    size="sm"
                    onClick={executeEnterMarket}
                    disabled={isEnteringMarket}
                    className="bg-orange-500 hover:bg-orange-600 text-white text-xs py-1 px-2 h-auto"
                  >
                    {isEnteringMarket ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        {enterMarketStep === 'entering' ? 'Enabling...' : 'Processing...'}
                      </>
                    ) : (
                      'Enable'
                    )}
                  </Button>
                )}
              </div>
              <p className={`text-xs ${
                isCollateralEnabled ? 'text-green-700' : 'text-orange-700'
              }`}>
                {isCollateralEnabled 
                  ? 'This asset is counting towards your borrowing power. You can borrow against it.'
                  : 'You have supplied this asset but it\'s not enabled as collateral. Click "Enable" to fix this.'
                }
              </p>
              
              {/* Enter Market Status */}
              {enterMarketStatusMessage && isEnteringMarket && (
                <div className="mt-2 p-2 bg-orange-100 border border-orange-300 text-orange-800 rounded text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
                    {enterMarketStatusMessage}
                  </div>
                </div>
              )}
              
              {/* Enter Market Success */}
              {enterMarketStep === 'success' && (
                <div className="mt-2 p-2 bg-green-100 border border-green-300 text-green-800 rounded text-xs">
                  <div className="flex items-center gap-2">
                    <Check className="h-3 w-3" />
                    Successfully enabled {asset.symbol} as collateral!
                  </div>
                </div>
              )}
              
              {/* Enter Market Error */}
              {enterMarketError && (
                <div className="mt-2 p-2 bg-red-100 border border-red-300 text-red-800 rounded text-xs">
                  <p>{enterMarketError}</p>
                </div>
              )}
            </div>
          )}
          
          {/* Manual Enable Collateral Button - Always show if user has balance but no collateral */}
          {hasSmartContract && isConnected && (
            <div className="space-y-2">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-blue-800">Collateral Status</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      isCollateralEnabled 
                        ? 'bg-green-100 text-green-700 border border-green-200' 
                        : 'bg-orange-100 text-orange-700 border border-orange-200'
                    }`}>
                      {isCollateralEnabled ? '✓ Enabled' : '⚠ Disabled'}
                    </span>
                    <Button
                      size="sm"
                      onClick={executeEnterMarket}
                      disabled={isEnteringMarket || isCollateralEnabled}
                      className="bg-blue-500 hover:bg-blue-600 text-white text-xs py-1 px-3 h-auto"
                    >
                      {isEnteringMarket ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Enabling...
                        </>
                      ) : isCollateralEnabled ? (
                        'Enabled'
                      ) : (
                        'Enable Collateral'
                      )}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-blue-700">
                  {isCollateralEnabled 
                    ? 'This asset is enabled as collateral and counts towards your borrowing power.'
                    : 'Enable this asset as collateral to use it for borrowing. This is required to borrow other tokens.'
                  }
                </p>
                
                {/* Enter Market Status */}
                {enterMarketStatusMessage && isEnteringMarket && (
                  <div className="mt-2 p-2 bg-blue-100 border border-blue-300 text-blue-800 rounded text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      {enterMarketStatusMessage}
                    </div>
                  </div>
                )}
                
                {/* Enter Market Success */}
                {enterMarketStep === 'success' && (
                  <div className="mt-2 p-2 bg-green-100 border border-green-300 text-green-800 rounded text-xs">
                    <div className="flex items-center gap-2">
                      <Check className="h-3 w-3" />
                      Successfully enabled {asset.symbol} as collateral!
                    </div>
                  </div>
                )}
                
                {/* Enter Market Error */}
                {enterMarketError && (
                  <div className="mt-2 p-2 bg-red-100 border border-red-300 text-red-800 rounded text-xs">
                    <p>Error: {enterMarketError}</p>
                  </div>
                )}
              </div>
              
              {/* Debug Info - Temporarily enabled for debugging */}
            <BalanceDebugInfo assetId={asset.id} assetSymbol={asset.symbol} />
            </div>
          )}
          
          {!hasSmartContract && (
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-sm text-muted-foreground">
                Smart contracts for this asset are coming soon!
              </p>
            </div>
          )}
          
          {hasSmartContract && !isConnected && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
              <p className="text-sm text-orange-700">
                Please connect your wallet to supply assets
              </p>
            </div>
          )}
          
          {hasSmartContract && isConnected && !canSupply && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
              <p className="text-sm text-red-700">
                This asset is not supported on the current network
              </p>
            </div>
          )}
          
          {hasSmartContract && isConnected && !canBorrow && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
              <p className="text-sm text-red-700">
                Borrowing for this asset is not supported on the current network
              </p>
            </div>
          )}
          
          {supplyError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{supplyError}</p>
            </div>
          )}
          
          {/* Supply Section */}
          <div className="space-y-2">
            <div className="flex items-center">
              <span className="text-sm font-medium">Supply</span>
            </div>
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="0.00"
                value={supplyAmount}
                onChange={(e) => setSupplyAmount(e.target.value)}
                className="flex-1 px-3 py-2 text-sm rounded-md border bg-background disabled:opacity-50"
                disabled={
                  isSupplyLoading ||
                  (hasSmartContract && !canSupply) ||
                  (!hasSmartContract && !isDemoMode)
                }
              />
              <Button
                size="sm"
                onClick={handleSupply}
                disabled={
                  isSupplyLoading || 
                  !supplyAmount || 
                  (hasSmartContract && !canSupply) ||
                  (!hasSmartContract && !isDemoMode)
                }
                className="bg-green-500 hover:bg-green-600 text-white disabled:opacity-50"
              >
                {isSupplyLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {hasSmartContract ? (
                      step === 'approving' ? 'Approving...' :
                      step === 'approved' ? 'Approved!' :
                      step === 'supplying' ? 'Supplying...' :
                      step === 'entering-market' ? 'Enabling Collateral...' :
                      'Processing...'
                    ) : 'Supply'}
                  </>
                ) : (
                  hasSmartContract && needsApproval && !isSupplyLoading ? 'Approve & Supply' : 'Supply'
                )}
              </Button>
            </div>
            
            {/* Transaction Status */}
            {statusMessage && isSupplyLoading && (
              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 text-blue-800 rounded text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  {statusMessage}
                </div>
              </div>
            )}
            
            {/* Transaction Hashes */}
            {(approveHash || supplyHash) && (
              <div className="mt-2 text-xs text-gray-600">
                {approveHash && (
                  <div>
                    Approval: <span className="font-mono">{approveHash.slice(0, 10)}...{approveHash.slice(-8)}</span>
                  </div>
                )}
                {supplyHash && (
                  <div>
                    Supply: <span className="font-mono">{supplyHash.slice(0, 10)}...{supplyHash.slice(-8)}</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Manual Supply Button (when approval is done but automatic transition fails) */}
            {step === 'approved' && !isSupplyLoading && (
              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 text-blue-800 rounded text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    <span>Approval successful! Ready to supply.</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={manualSupplyTrigger}
                    className="bg-blue-500 hover:bg-blue-600 text-white ml-2"
                  >
                    Supply Now
                  </Button>
                </div>
              </div>
            )}

            {/* Success Message */}
            {step === 'success' && (
              <div className="mt-2 p-2 bg-green-50 border border-green-200 text-green-800 rounded text-sm">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Successfully supplied {supplyAmount} {asset.symbol}. You can now earn interest!
                </div>
              </div>
            )}
          </div>

          {/* Borrow Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Borrow</span>
              <div className="text-right">
                {hasSmartContract && isConnected && hasBorrow && (
                  <div className="text-xs text-orange-600">
                    Current: {borrowBalance} {asset.symbol}
                  </div>
                )}
                {hasSmartContract && isConnected && borrowingPower.availableBorrowingPowerUSD > 0 && (
                  <div className="text-xs text-blue-600">
                    Max: {getMaxBorrowAmount(asset.id).toFixed(4)} {asset.symbol}
                  </div>
                )}
              </div>
            </div>
            <div className="flex space-x-2">
              <div className="flex-1 relative">
              <input
                type="text"
                placeholder="0.00"
                value={borrowAmount}
                onChange={(e) => setBorrowAmount(e.target.value)}
                  className="w-full px-3 py-2 pr-12 text-sm rounded-md border bg-background disabled:opacity-50"
                  disabled={
                    isBorrowLoading ||
                    (hasSmartContract && !canBorrow) ||
                    (!hasSmartContract && !isDemoMode)
                  }
                />
                {hasSmartContract && isConnected && borrowingPower.availableBorrowingPowerUSD > 0 && (
                  <button
                    onClick={() => setBorrowAmount(getMaxBorrowAmount(asset.id).toFixed(4))}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-blue-600 hover:text-blue-800"
                    disabled={
                      isBorrowLoading ||
                      (hasSmartContract && !canBorrow) ||
                      (!hasSmartContract && !isDemoMode)
                    }
                  >
                    Max
                  </button>
                )}
              </div>
              <Button
                size="sm"
                onClick={handleBorrow}
                disabled={
                  isBorrowLoading || 
                  !borrowAmount || 
                  (hasSmartContract && !canBorrow) ||
                  (!hasSmartContract && !isDemoMode)
                }
                className="bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
              >
                {isBorrowLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {hasSmartContract ? (
                      borrowStep === 'checking-liquidity' ? 'Checking...' :
                      borrowStep === 'borrowing' ? 'Borrowing...' :
                      'Processing...'
                    ) : 'Borrow'}
                  </>
                ) : (
                  'Borrow'
                )}
              </Button>
            </div>
            
            {/* Borrow Transaction Status */}
            {borrowStatusMessage && isBorrowLoading && (
              <div className="mt-2 p-2 bg-orange-50 border border-orange-200 text-orange-800 rounded text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
                  {borrowStatusMessage}
                </div>
              </div>
            )}
            
            {/* Borrow Transaction Hash */}
            {borrowHash && (
              <div className="mt-2 text-xs text-gray-600">
                Borrow: <span className="font-mono">{borrowHash.slice(0, 10)}...{borrowHash.slice(-8)}</span>
              </div>
            )}
            
            {/* Borrow Success Message */}
            {borrowStep === 'success' && (
              <div className="mt-2 p-2 bg-orange-50 border border-orange-200 text-orange-800 rounded text-sm">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Successfully borrowed {borrowAmount} {asset.symbol}. Remember to repay on time!
                </div>
              </div>
            )}
            
            {/* Borrow Error */}
            {borrowError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{borrowError}</p>
              </div>
            )}
          </div>

          {/* Redeem/Withdraw Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Withdraw</span>
              {hasSmartContract && isConnected && hasPTokenBalance && (
                <span className="text-xs text-purple-600">
                  Available: {pTokenBalance} {asset.symbol}
                </span>
              )}
            </div>
            
            {/* Redeem Type Toggle */}
            <div className="flex space-x-2 mb-2">
              <button
                onClick={() => setRedeemType('underlying')}
                className={`px-3 py-1 text-xs rounded ${
                  redeemType === 'underlying' 
                    ? 'bg-purple-500 text-white' 
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                Specific Amount
              </button>
              <button
                onClick={() => setRedeemType('pTokens')}
                className={`px-3 py-1 text-xs rounded ${
                  redeemType === 'pTokens' 
                    ? 'bg-purple-500 text-white' 
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                All pTokens
              </button>
            </div>
            
            <div className="flex space-x-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder={redeemType === 'underlying' ? `${asset.symbol} to receive` : `p${asset.symbol} to redeem`}
                  value={redeemAmount}
                  onChange={(e) => setRedeemAmount(e.target.value)}
                  className="w-full px-3 py-2 pr-12 text-sm rounded-md border bg-background disabled:opacity-50"
                  disabled={
                    isRedeemLoading ||
                    (hasSmartContract && !canRedeem) ||
                    (!hasSmartContract && !isDemoMode) ||
                    !hasPTokenBalance
                  }
                />
                {hasPTokenBalance && (
                  <button
                    onClick={handleMaxRedeem}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-purple-600 hover:text-purple-800"
                    disabled={
                      isRedeemLoading ||
                      (hasSmartContract && !canRedeem) ||
                      (!hasSmartContract && !isDemoMode)
                    }
                  >
                    Max
                  </button>
                )}
              </div>
              <Button
                size="sm"
                onClick={handleRedeem}
                disabled={
                  isRedeemLoading || 
                  !redeemAmount || 
                  (hasSmartContract && !canRedeem) ||
                  (!hasSmartContract && !isDemoMode) ||
                  !hasPTokenBalance
                }
                className="bg-purple-500 hover:bg-purple-600 text-white disabled:opacity-50"
              >
                {isRedeemLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {hasSmartContract ? (
                      redeemStep === 'redeeming' ? 'Redeeming...' :
                      'Processing...'
                    ) : 'Redeem'}
                  </>
                ) : (
                  'Withdraw'
                )}
              </Button>
            </div>
            
            {/* Show message if no pTokens to redeem */}
            {hasSmartContract && isConnected && !hasPTokenBalance && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                <p className="text-sm text-yellow-700">
                  No {asset.symbol} supplied to withdraw
                </p>
              </div>
            )}
            
            {/* Redeem Transaction Status */}
            {redeemStatusMessage && isRedeemLoading && (
              <div className="mt-2 p-2 bg-purple-50 border border-purple-200 text-purple-800 rounded text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                  {redeemStatusMessage}
                </div>
              </div>
            )}
            
            {/* Redeem Transaction Hash */}
            {redeemHash && (
              <div className="mt-2 text-xs text-gray-600">
                Redeem: <span className="font-mono">{redeemHash.slice(0, 10)}...{redeemHash.slice(-8)}</span>
              </div>
            )}
            
            {/* Redeem Success Message */}
            {redeemStep === 'success' && (
              <div className="mt-2 p-2 bg-purple-50 border border-purple-200 text-purple-800 rounded text-sm">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Successfully redeemed {redeemAmount} {redeemType === 'underlying' ? asset.symbol : `p${asset.symbol}`}!
                </div>
              </div>
            )}
            
            {/* Redeem Error */}
            {redeemError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{redeemError}</p>
              </div>
            )}
          </div>

          {showConfirmation && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-center text-green-500 flex items-center justify-center"
            >
              <Check className="h-4 w-4 mr-1" />
              Transaction Successful!
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  )
} 