"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { Asset } from "@/types/markets"
import { Button } from "@/components/ui/button"
import { Check, Loader2, TrendingUp, TrendingDown, Wallet, RefreshCw, Info, Shield, ExternalLink } from "lucide-react"
import Image from "next/image"
import { useAccount, useReadContract } from "wagmi"
import { formatUnits } from "viem"
import { getAssetContractAddresses, getMarketsForChain } from "@/data/market-data"
import { getChainConfig } from "@/config/contracts"
import { useSupplyTransaction } from "@/hooks/use-supply-transaction"
import { useBorrowTransaction } from "@/hooks/use-borrow-transaction"
import { useBorrowBalance } from "@/hooks/use-borrow-balance"
import { useRedeemTransaction } from "@/hooks/use-redeem-transaction"
import { usePTokenBalance } from "@/hooks/use-ptoken-balance"
import { useRepayTransaction } from "@/hooks/use-repay-transaction"
import { useBorrowingPower } from "@/hooks/use-borrowing-power"
import { useMarketMembership } from "@/hooks/use-market-membership"
import { useEnterMarket } from "@/hooks/use-enter-market"
import { useWalletBalance } from "@/hooks/use-wallet-balance"
import { useApy } from "@/hooks/use-apy"
import { ErrorModal } from "@/components/ui/error-modal"
import { TokenTooltip } from "@/components/ui/token-tooltip"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import combinedAbi from "@/app/abis/combinedAbi.json"

interface AssetDropdownProps {
  asset: Asset
  isOpen: boolean
  onClose: () => void
  onTransaction: (asset: Asset, amount: number, type: "supply" | "borrow") => void
  isDemoMode: boolean
}

type ActionTab = 'supply' | 'borrow' | 'manage'

export const AssetDropdown = ({
  asset,
  isOpen,
  onClose,
  onTransaction,
  isDemoMode,
}: AssetDropdownProps) => {
  const [activeTab, setActiveTab] = useState<ActionTab>('supply')
  const [amount, setAmount] = useState("")
  const [redeemType, setRedeemType] = useState<'pTokens' | 'underlying'>('underlying')
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [confirmationMessage, setConfirmationMessage] = useState("Transaction Successful!")
  const [showValuePopup, setShowValuePopup] = useState(false)
  const [showCollateralTooltip, setShowCollateralTooltip] = useState(false)
  const [errorModal, setErrorModal] = useState<{isOpen: boolean, message: string, details?: string}>({
    isOpen: false,
    message: '',
    details: undefined,
  })
  
  // Debounce error modal to prevent rapid multiple openings
  const showErrorModal = (error: Error) => {
    // Close any existing modal first
    setErrorModal({ isOpen: false, message: '', details: undefined })
    
    // Open new modal after a brief delay to prevent conflicts
    setTimeout(() => {
      setErrorModal({
        isOpen: true,
        message: error.message || 'An unexpected error occurred',
        details: error.message || 'No details available',
      })
    }, 100)
  }
  const hasSmartContract = asset.hasSmartContract !== false
  const { theme } = useTheme()
  
  const { isConnected, chainId } = useAccount()

  // Handle scroll to hide popup
  useEffect(() => {
    const handleScroll = () => setShowValuePopup(false)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Handle clicks outside to hide collateral tooltip
  useEffect(() => {
    const handleClickOutside = () => setShowCollateralTooltip(false)
    if (showCollateralTooltip) {
      document.addEventListener('click', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }
    return () => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [showCollateralTooltip])
  
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

  // Calculate dollar value for popup
  const dollarValue = amount && !isNaN(parseFloat(amount)) 
    ? parseFloat(amount) * (realOraclePrice || asset.price)
    : 0

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
    amount: amount,
    onSuccess: () => {
      const amountNum = parseFloat(amount);
      if (!isNaN(amountNum) && amountNum > 0) {
        onTransaction(asset, amountNum, "supply");
      }
      setAmount("");
      setShowConfirmation(true);
      setTimeout(() => setShowConfirmation(false), 3000);
      resetSupply();
    },
    onError: (error) => {
      console.error('Supply transaction failed:', error);
      showErrorModal(error);
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
    amount: amount,
    onSuccess: () => {
      const amountNum = parseFloat(amount);
      if (!isNaN(amountNum) && amountNum > 0) {
        onTransaction(asset, amountNum, "borrow");
      }
      setAmount("");
      setShowConfirmation(true);
      setTimeout(() => setShowConfirmation(false), 3000);
      resetBorrow();
    },
    onError: (error) => {
      console.error('Borrow transaction failed:', error);
      showErrorModal(error);
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
    pTokenBalance,
    underlyingBalance,
    formattedBalance: formattedUnderlyingBalance,
    decimals: underlyingDecimals,
    pTokenDecimals,
    isLoading: isPTokenBalanceLoading,
    hasBalance: hasSuppliedBalance,
  } = usePTokenBalance({
    assetId: asset.id,
  })

  // Get market membership (collateral status)
  const {
    isCollateralEnabled,
    isLoading: isMembershipLoading,
  } = useMarketMembership({
    assetId: asset.id,
  })

  // Manual enter market hook (for fixing collateral issues)
  const {
    executeEnterMarket,
    isLoading: isEnteringMarket,
    step: enterMarketStep,
    statusMessage: enterMarketStatusMessage,
    error: enterMarketError,
  } = useEnterMarket({
    assetId: asset.id,
    onSuccess: () => {
      console.log('Successfully entered market for', asset.symbol)
    },
    onError: (error) => {
      console.error('Enter market failed:', error)
      showErrorModal(error);
    },
  })

  // Get user's wallet balance for this asset
  const {
    formattedBalance: walletBalance,
    numericBalance: walletBalanceNumeric,
    isLoading: isWalletBalanceLoading,
    hasBalance: hasWalletBalance,
  } = useWalletBalance({
    assetId: asset.id,
  })

  // Get real-time APY rates from smart contracts
  const {
    supplyApy: realSupplyApy,
    borrowApy: realBorrowApy,
    isLoading: isApyLoading,
  } = useApy({
    assetId: asset.id,
  })

  // Fetch market liquidity and utilization
  const { data: totalBorrows } = useReadContract({
    address: contractAddresses?.pTokenAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'totalBorrows',
    query: {
      enabled: !!contractAddresses?.pTokenAddress && isConnected,
    },
  });

  const { data: cash } = useReadContract({
    address: contractAddresses?.pTokenAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'getCash',
    query: {
      enabled: !!contractAddresses?.pTokenAddress && isConnected,
    },
  });

  const { data: totalReserves } = useReadContract({
    address: contractAddresses?.pTokenAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'totalReserves',
    query: {
      enabled: !!contractAddresses?.pTokenAddress && isConnected,
    },
  });

  // Use smart contract hook for repay transactions
  const {
    executeRepay,
    isLoading: isRepayLoading,
    error: repayError,
    canRepay,
    reset: resetRepay,
    step: repayStep,
    statusMessage: repayStatusMessage,
    approveHash: repayApproveHash,
    repayHash,
  } = useRepayTransaction({
    assetId: asset.id,
    amount: amount,
    onSuccess: () => {
      const amountNum = parseFloat(amount);
      if (!isNaN(amountNum) && amountNum > 0) {
        onTransaction(asset, amountNum, "borrow");
      }
      setAmount("");
      setShowConfirmation(true);
      setTimeout(() => setShowConfirmation(false), 3000);
      resetRepay();
    },
    onError: (error) => {
      console.error('Repay transaction failed:', error);
      showErrorModal(error);
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
    amount: amount,
    redeemType: redeemType,
    onSuccess: () => {
      const amountNum = parseFloat(amount);
      if (!isNaN(amountNum) && amountNum > 0) {
        onTransaction(asset, amountNum, "supply");
      }
      setAmount("");
      setConfirmationMessage(`Successfully withdrew ${amount} ${asset.symbol}!`);
      setShowConfirmation(true);
      setTimeout(() => setShowConfirmation(false), 3000);
      resetRedeem();
    },
    onError: (error) => {
      console.error('Redeem transaction failed:', error);
      showErrorModal(error);
    },
  })

  // Calculate maximum safe withdrawal amount for this asset
  const calculateMaxSafeWithdrawal = (): number => {
    if (!borrowingPower || !asset.oraclePrice) return 0
    
    const availableLiquidityUSD = borrowingPower.availableBorrowingPowerUSD
    const collateralFactor = asset.maxLTV / 100

    if (collateralFactor <= 0) {
      const suppliedAmount = parseFloat(formattedUnderlyingBalance?.replace(/[<,]/g, '') || '0')
      return suppliedAmount
    }
    
    const maxWithdrawValueUSD = availableLiquidityUSD / collateralFactor
    const maxWithdrawAmount = maxWithdrawValueUSD / asset.oraclePrice
    const suppliedAmount = parseFloat(formattedUnderlyingBalance?.replace(/[<,]/g, '') || '0')
    
    return Math.min(maxWithdrawAmount, suppliedAmount)
  }

  const maxSafeWithdrawal = calculateMaxSafeWithdrawal()

  // Smart tab determination based on user position
  const getRecommendedTab = (): ActionTab => {
    if (hasBorrow) return 'manage' // If user has borrowed, they need to manage debt
    if (hasSuppliedBalance) return 'manage' // If user has supplied, show management options
    return 'supply' // Default to supply for new users
  }

  // Quick amount suggestions with real wallet balance and borrowing power
  const getQuickAmounts = () => {
    if (activeTab === 'supply') {
      const balance = walletBalanceNumeric || 0;
      return [
        { label: "25%", value: balance * 0.25 },
        { label: "50%", value: balance * 0.5 },
        { label: "75%", value: balance * 0.75 },
        { label: "MAX", value: balance },
      ];
    } else if (activeTab === 'borrow') {
      const maxBorrow = getMaxBorrowAmount(asset.id);
      return [
        { label: "25%", value: maxBorrow * 0.25 },
        { label: "50%", value: maxBorrow * 0.5 },
        { label: "75%", value: maxBorrow * 0.75 },
        { label: "MAX", value: maxBorrow },
      ];
    } else if (activeTab === 'manage' && hasSuppliedBalance) {
      const maxRedeem = underlyingBalance && underlyingDecimals ? parseFloat(formatUnits(underlyingBalance as bigint, underlyingDecimals)) : 0;
      return [
        { label: "25%", value: maxRedeem * 0.25 },
        { label: "50%", value: maxRedeem * 0.5 },
        { label: "75%", value: maxRedeem * 0.75 },
        { label: "MAX", value: maxRedeem, isMax: true },
      ];
    } else if (activeTab === 'manage' && hasBorrow) {
      const maxRepay = parseFloat(borrowBalance) || 0;
      return [
        { label: '25%', value: (maxRepay * 0.25).toFixed(8) },
        { label: '50%', value: (maxRepay * 0.5).toFixed(8) },
        { label: '75%', value: (maxRepay * 0.75).toFixed(8) },
        { label: 'Max', value: maxRepay.toFixed(4) }
      ]
    }
    return []
  }

  const handleAction = () => {
    if (!isConnected) {
      alert('Please connect your wallet first');
      return;
    }
    
    if (!hasSmartContract && !isDemoMode) {
      alert('Smart contracts for this asset are not available');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    // Demo mode fallback for assets without smart contracts
    if (!hasSmartContract && isDemoMode) {
      const type = activeTab === 'supply' ? 'supply' : activeTab === 'borrow' ? 'borrow' : 'supply';
      onTransaction(asset, amountNum, type);
      setAmount("");
      setShowConfirmation(true);
      setTimeout(() => setShowConfirmation(false), 3000);
      return;
    }

    switch (activeTab) {
      case 'supply':
        executeSupply();
        break;
      case 'borrow':
        executeBorrow();
        break;
      case 'manage':
        // Determine if withdraw or repay based on context
        if (hasBorrow && parseFloat(borrowBalance?.replace(/[<,]/g, '') || '0') > 0) {
          executeRepay();
        } else {
          executeRedeem();
        }
        break;
    }
  }

  const handleMaxRepay = () => {
    setAmount(borrowBalance.toString());
  };

  const handleMaxRedeem = () => {
    if (underlyingBalance && underlyingDecimals) {
      const fullUnderlyingAmount = formatUnits(
        underlyingBalance,
        underlyingDecimals
      );
      setAmount(fullUnderlyingAmount);
      setRedeemType("underlying");
    } else if (pTokenBalance && pTokenDecimals) {
      // Fallback for safety, though should ideally not be hit if underlyingBalance is available.
      // This ensures that the MAX button still allows a full withdrawal.
      const fullPTokenAmount = formatUnits(
        pTokenBalance,
        pTokenDecimals
      );
      setAmount(fullPTokenAmount);
      setRedeemType("pTokens");
    }
  };

  const getCurrentActionLoading = () => {
    switch (activeTab) {
      case 'supply': return isSupplyLoading;
      case 'borrow': return isBorrowLoading;
      case 'manage': return hasBorrow ? isRepayLoading : isRedeemLoading;
      default: return false;
    }
  }

  const getCurrentActionError = () => {
    switch (activeTab) {
      case 'supply': return supplyError;
      case 'borrow': return borrowError;
      case 'manage': return hasBorrow ? repayError : redeemError;
      default: return null;
    }
  }

  const getCurrentStatusMessage = () => {
    switch (activeTab) {
      case 'supply': return statusMessage;
      case 'borrow': return borrowStatusMessage;
      case 'manage': return hasBorrow ? repayStatusMessage : redeemStatusMessage;
      default: return null;
    }
  }

  const getCurrentStep = () => {
    switch (activeTab) {
      case 'supply': return step;
      case 'borrow': return borrowStep;
      case 'manage': return hasBorrow ? repayStep : redeemStep;
      default: return null;
    }
  }

  const getCurrentTransactionHash = () => {
    switch (activeTab) {
      case 'supply': return supplyHash || approveHash;
      case 'borrow': return borrowHash;
      case 'manage': return hasBorrow ? (repayHash || repayApproveHash) : redeemHash;
      default: return null;
    }
  }

  // Check if amount is safe for borrowing
  const isAmountSafe = () => {
    if (activeTab === 'borrow' && amount) {
      const amountNum = parseFloat(amount);
      return isBorrowAmountSafe(asset.id, amountNum);
    }
    return true;
  }

  const marketLiquidity = useMemo(() => {
    if (!cash || underlyingDecimals === undefined) return asset.liquidity; // Fallback to hardcoded
    const numericLiquidity = parseFloat(formatUnits(cash as bigint, underlyingDecimals));
    
    if (numericLiquidity >= 1_000_000) {
      return `${(numericLiquidity / 1_000_000).toFixed(1)}M`;
    }
    if (numericLiquidity >= 1_000) {
      return `${(numericLiquidity / 1_000).toFixed(1)}K`;
    }
    return numericLiquidity.toFixed(2);
  }, [cash, underlyingDecimals, asset.liquidity]);

  const utilizationRate = useMemo(() => {
    if (!totalBorrows || !cash || !totalReserves) {
      return asset.utilizationRate === undefined ? null : asset.utilizationRate;
    }

    const totalBorrowsBI = BigInt(totalBorrows.toString());
    const cashBI = BigInt(cash.toString());
    const totalReservesBI = BigInt(totalReserves.toString());

    const denominator = cashBI + totalBorrowsBI - totalReservesBI;

    if (denominator === BigInt(0)) {
      return 0;
    }

    const rate = (totalBorrowsBI * BigInt(10000)) / denominator;
    return Number(rate) / 100;
  }, [totalBorrows, cash, totalReserves, asset.utilizationRate]);

  if (!isOpen) return null;

  return (
    <TooltipProvider>
      <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0.0, 0.2, 1] }}
      className="relative overflow-hidden"
    >
      {/* Glassmorphism container */}
      <div className="relative backdrop-blur-xl bg-gradient-to-br from-white/5 via-white/2 to-transparent border-t border-white/10 shadow-2xl">
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-50" />
        
        {/* Content */}
        <div className="relative p-6 space-y-6">
          {/* Asset Header with enhanced styling */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <TokenTooltip
                  asset={asset}
                  supplyApy={realSupplyApy}
                  borrowApy={realBorrowApy}
                  price={realOraclePrice || asset.oraclePrice}
                  balance={formattedUnderlyingBalance}
                >
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 backdrop-blur-sm border border-white/10 shadow-lg flex items-center justify-center">
                    <Image src={asset.icon} alt={asset.name} width={40} height={40} className="rounded-xl" />
                  </div>
                </TokenTooltip>
                {hasSmartContract && isConnected && hasSuppliedBalance && (
                  <div className="relative">
                    <Tooltip delayDuration={200} open={showCollateralTooltip}>
                      <TooltipTrigger asChild>
                        <div 
                          className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-lg cursor-help ${
                            isCollateralEnabled 
                              ? 'bg-green-500 text-white' 
                              : 'bg-orange-500 text-white'
                          }`}
                          onMouseEnter={() => setShowCollateralTooltip(true)}
                          onMouseLeave={() => setShowCollateralTooltip(false)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowCollateralTooltip(!showCollateralTooltip);
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            setShowCollateralTooltip(!showCollateralTooltip);
                          }}
                        >
                          {isCollateralEnabled ? '✓' : '!'}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent 
                        side="left" 
                        align="center"
                        className="z-[9999] max-w-xs"
                        sideOffset={8}
                        onPointerDownOutside={() => setShowCollateralTooltip(false)}
                      >
                        <p className="text-sm">
                          {isCollateralEnabled 
                            ? 'This asset is enabled as collateral and can be used to borrow other assets'
                            : 'This asset is not enabled as collateral. Enable it to use for borrowing other assets'
                          }
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>
              <div>
                <div className="font-semibold text-lg">{asset.name}</div>
                <div className="text-sm text-muted-foreground">{asset.symbol}</div>
                {realOraclePrice && (
                  <div className="text-xs text-green-600 font-medium">
                    ${realOraclePrice.toFixed(2)}
                  </div>
                )}
              </div>
            </div>

            {/* Quick stats with rates */}
                          <div className="text-right space-y-1">

                <div className="text-xs text-muted-foreground">
                  Liquidity: {marketLiquidity}
                </div>
                <div className="text-muted-foreground">Utilization: {utilizationRate !== null ? `${utilizationRate.toFixed(2)}%` : '...'}</div>
              </div>
          </div>

          {/* Enhanced Professional Tab Navigation */}
          <div className={cn(
            "flex rounded-2xl backdrop-blur-sm border p-1 transition-all duration-300",
            "shadow-lg shadow-black/5",
            theme === "light" 
              ? "bg-slate-100/80 border-slate-200/60" 
              : "bg-black/20 border-white/10"
          )}>
            {[
              { id: 'supply', label: 'Supply', icon: TrendingUp, color: 'text-green-500' },
              { id: 'borrow', label: 'Borrow', icon: TrendingDown, color: 'text-orange-500' },
              { id: 'manage', label: 'Manage', icon: Wallet, color: 'text-purple-500' }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as ActionTab);
                    setAmount("");
                  }}
                  className={cn(
                    "group flex-1 flex items-center justify-center gap-1.5 sm:gap-2",
                    "py-2.5 sm:py-3 px-2 sm:px-4 rounded-xl",
                    "text-xs sm:text-sm font-medium transition-all duration-300",
                    "touch-none select-none", // Better mobile interaction
                    isActive ? (
                      theme === "light"
                        ? "bg-white/90 backdrop-blur-md border border-white/60 shadow-lg shadow-slate-200/50 text-slate-800"
                        : "bg-white/15 backdrop-blur-md border border-white/20 shadow-lg shadow-black/20 text-white"
                    ) : (
                      theme === "light"
                        ? "text-slate-600 hover:text-slate-800 hover:bg-white/50 active:bg-white/70"
                        : "text-muted-foreground hover:text-white hover:bg-white/8 active:bg-white/12"
                    )
                  )}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                >
                  <Icon className={cn(
                    "h-3.5 w-3.5 sm:h-4 sm:w-4 transition-colors duration-300",
                    isActive ? tab.color : ""
                  )} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.slice(0, 3)}</span>
                  
                  {/* Elegant notification indicator */}
                  {tab.id === 'manage' && (hasSuppliedBalance || hasBorrow) && (
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        theme === "light" 
                          ? "bg-blue-500 shadow-sm shadow-blue-500/30" 
                          : "bg-blue-400 shadow-sm shadow-blue-400/50"
                      )}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* Action content with smooth transitions */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Action-specific content */}
              {activeTab === 'supply' && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold mb-1">Supply {asset.symbol}</h3>
                    <p className="text-sm text-muted-foreground">Earn {isApyLoading ? 'Loading...' : realSupplyApy.toFixed(2)}% APY on your {asset.symbol}</p>

                  </div>
                </div>
              )}

              {activeTab === 'borrow' && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold mb-1">Borrow {asset.symbol}</h3>
                    <p className="text-sm text-muted-foreground">Borrow rate: {isApyLoading ? 'Loading...' : realBorrowApy.toFixed(2)}% APY</p>
                    {hasSmartContract && isConnected && borrowingPower?.availableBorrowingPowerUSD > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-blue-600">
                          Max available: {getMaxBorrowAmount(asset.id).toFixed(4)} {asset.symbol}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Available borrowing power: ${borrowingPower.availableBorrowingPowerUSD.toFixed(2)}
                        </p>
                      </div>
                    )}
                    {hasSmartContract && isConnected && !isCollateralEnabled && hasSuppliedBalance && (
                      <div className="mt-2 text-xs text-orange-600 bg-orange-500/10 border border-orange-500/20 rounded-lg p-2">
                        ⚠️ Enable {asset.symbol} as collateral first to increase borrowing power
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'manage' && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold mb-1">Manage Position</h3>
                    <div className="grid grid-cols-1 gap-3 mt-3">
                      {hasSuppliedBalance && (
                        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                          <div className="text-xs text-green-600 mb-1">Supplied</div>
                          <div className="font-semibold">{formattedUnderlyingBalance} {asset.symbol}</div>

                        </div>
                      )}
                      {hasBorrow && (
                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
                          <div className="text-xs text-orange-600 mb-1">Borrowed</div>
                          <div className="font-semibold">{borrowBalance} {asset.symbol}</div>
                        </div>
                      )}
                      {!hasSuppliedBalance && !hasBorrow && (
                        <div className="bg-muted/10 border border-white/10 rounded-xl p-3 text-center">
                          <div className="text-sm text-muted-foreground">No position in {asset.symbol}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Amount input with custom styling */}
              <div className="space-y-3">
                <div className="relative">
                  <div className={`inputbox ${!isAmountSafe() ? 'opacity-50' : ''}`}>
                    <input
                      type="text"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value)
                        setShowValuePopup(e.target.value !== "" && !isNaN(parseFloat(e.target.value)))
                      }}
                      onFocus={() => amount && !isNaN(parseFloat(amount)) && setShowValuePopup(true)}
                      onBlur={() => setTimeout(() => setShowValuePopup(false), 150)}
                      disabled={getCurrentActionLoading()}
                      required
                    />
                    <span>Amount</span>
                    <i></i>
                  </div>
                  <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
                    {asset.symbol}
                  </div>

                  {/* Professional Liquid Glass Popup */}
                  <AnimatePresence>
                    {showValuePopup && dollarValue > 0 && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 8 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        className="absolute -top-14 left-1/2 transform -translate-x-1/2 z-50"
                      >
                        <div className="relative">
                          {/* Professional liquid glass backdrop */}
                          <div className="absolute inset-0 bg-gradient-to-br from-green-500/15 via-green-400/10 to-emerald-500/15 rounded-xl blur-lg"></div>
                          
                          {/* Main popup content */}
                          <div className="relative backdrop-blur-xl bg-background/90 border border-green-500/30 rounded-xl px-4 py-2.5 shadow-xl">
                            <div className="flex items-center justify-center gap-2">
                              {/* Peridot accent indicator */}
                              <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-sm shadow-green-500/50"></div>
                              
                              {/* Dollar value - more visible */}
                              <div className="text-base font-semibold text-foreground">
                                ${dollarValue.toLocaleString(undefined, { 
                                  minimumFractionDigits: 2, 
                                  maximumFractionDigits: 2 
                                })}
                              </div>
                              
                              {/* Matching accent */}
                              <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-sm shadow-green-500/50"></div>
                            </div>
                            
                            {/* Professional arrow */}
                            <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-background/90 border-r border-b border-green-500/30 rotate-45 backdrop-blur-xl"></div>
                          </div>
                          
                          {/* Subtle glow effect */}
                          <div className="absolute inset-0 rounded-xl bg-green-500/20 opacity-60 blur-sm animate-pulse"></div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Wallet Balance Display */}
                {activeTab === 'supply' && isConnected && hasSmartContract && (
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>Wallet Balance:</span>
                    <span className={`font-medium ${isWalletBalanceLoading ? 'opacity-50' : ''}`}>
                      {isWalletBalanceLoading ? 'Loading...' : `${walletBalance} ${asset.symbol}`}
                    </span>
                  </div>
                )}

                {/* Amount validation warning */}
                {!isAmountSafe() && amount && (
                  <div className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
                    ⚠️ This borrow amount may put your position at risk of liquidation
                  </div>
                )}

                {/* Quick amount buttons */}
                <div className="flex gap-2">
                  {getQuickAmounts().map((quickAmount) => (
                    <motion.button
                      key={quickAmount.label}
                      onClick={() => {
                        if ((quickAmount as any).isMax) {
                          console.log('MAX button clicked, calling handleMaxRedeem()');
                          handleMaxRedeem();
                        } else {
                          setAmount(quickAmount.value.toString());
                        }
                      }}
                      className="flex-1 py-2 text-xs font-medium bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg hover:bg-white/10 transition-all duration-200"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      disabled={getCurrentActionLoading()}
                    >
                      {quickAmount.label}
                    </motion.button>
                  ))}
                </div>

                {/* Action button with enhanced styling */}
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={handleAction}
                    disabled={
                      getCurrentActionLoading() || 
                      !amount || 
                      (hasSmartContract && activeTab === 'supply' && !canSupply) ||
                      (hasSmartContract && activeTab === 'borrow' && !canBorrow) ||
                      (hasSmartContract && activeTab === 'manage' && !hasBorrow && !canRedeem) ||
                      (!hasSmartContract && !isDemoMode)
                    }
                    className={`w-full py-4 text-lg font-semibold rounded-2xl shadow-lg transition-all duration-200 ${
                      activeTab === 'supply' 
                        ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700' 
                        : activeTab === 'borrow'
                        ? 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700'
                        : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700'
                    } text-white border-0 disabled:opacity-50`}
                  >
                    {getCurrentActionLoading() ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        {hasSmartContract ? (
                          getCurrentStep() === 'approving' ? 'Approving...' :
                          getCurrentStep() === 'approved' ? 'Approved!' :
                          getCurrentStep() === 'supplying' ? 'Supplying...' :
                          getCurrentStep() === 'borrowing' ? 'Borrowing...' :
                          getCurrentStep() === 'repaying' ? 'Repaying...' :
                          getCurrentStep() === 'redeeming' ? 'Withdrawing...' :
                          getCurrentStep() === 'entering-market' ? 'Enabling Collateral...' :
                          'Processing...'
                        ) : 'Processing...'}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {activeTab === 'supply' && <TrendingUp className="h-5 w-5" />}
                        {activeTab === 'borrow' && <TrendingDown className="h-5 w-5" />}
                        {activeTab === 'manage' && <RefreshCw className="h-5 w-5" />}
                        {activeTab === 'supply' ? (
                          hasSmartContract && needsApproval && !getCurrentActionLoading() ? 'Approve & Supply' : 'Supply'
                        ) : activeTab === 'borrow' ? 'Borrow' : hasBorrow ? 'Repay' : 'Withdraw'}
                      </div>
                    )}
                  </Button>
                </motion.div>

                {/* Transaction Status */}
                {getCurrentStatusMessage() && getCurrentActionLoading() && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-xl p-3 text-sm backdrop-blur-sm border ${
                      activeTab === 'supply' ? 'bg-green-500/10 border-green-500/20 text-green-600' :
                      activeTab === 'borrow' ? 'bg-orange-500/10 border-orange-500/20 text-orange-600' :
                      'bg-purple-500/10 border-purple-500/20 text-purple-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                      {getCurrentStatusMessage()}
                    </div>
                  </motion.div>
                )}

                {/* Transaction Hash */}
                {getCurrentTransactionHash() && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-muted-foreground bg-white/5 border border-white/10 rounded-lg p-2"
                  >
                    <div className="flex items-center justify-between">
                      <span>Transaction:</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono">{getCurrentTransactionHash()!.slice(0, 6)}...{getCurrentTransactionHash()!.slice(-4)}</span>
                        <ExternalLink className="h-3 w-3" />
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Manual Supply Button (when approval is done but automatic transition fails) */}
                {step === 'approved' && !isSupplyLoading && activeTab === 'supply' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-blue-600">
                        <Check className="h-4 w-4" />
                        <span className="text-sm">Approval successful! Ready to supply.</span>
                      </div>
                      <Button
                        size="sm"
                        onClick={manualSupplyTrigger}
                        className="bg-blue-500 hover:bg-blue-600 text-white"
                      >
                        Supply Now
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* Success Messages */}
                {getCurrentStep() === 'success' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`rounded-xl p-3 text-sm backdrop-blur-sm border ${
                      activeTab === 'supply' ? 'bg-green-500/10 border-green-500/20 text-green-600' :
                      activeTab === 'borrow' ? 'bg-orange-500/10 border-orange-500/20 text-orange-600' :
                      'bg-purple-500/10 border-purple-500/20 text-purple-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      <span className="font-medium">
                        {activeTab === 'supply' ? `Successfully supplied ${amount} ${asset.symbol}!` :
                         activeTab === 'borrow' ? `Successfully borrowed ${amount} ${asset.symbol}!` :
                         hasBorrow ? `Successfully repaid ${amount} ${asset.symbol}!` :
                         `Successfully withdrew ${amount} ${asset.symbol}!`}
                      </span>
                    </div>
                  </motion.div>
                )}





                {/* Success confirmation */}
                {showConfirmation && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center"
                  >
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <Check className="h-5 w-5" />
                      <span className="font-medium">{confirmationMessage}</span>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Collateral status for users with positions */}
          {hasSmartContract && isConnected && hasSuppliedBalance && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`rounded-xl p-4 border backdrop-blur-sm ${
                isCollateralEnabled 
                  ? 'bg-green-500/10 border-green-500/20' 
                  : 'bg-orange-500/10 border-orange-500/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className={`h-4 w-4 ${isCollateralEnabled ? 'text-green-600' : 'text-orange-600'}`} />
                  <span className={`text-sm font-medium ${isCollateralEnabled ? 'text-green-600' : 'text-orange-600'}`}>
                    {isCollateralEnabled ? 'Collateral Enabled' : 'Collateral Disabled'}
                  </span>
                </div>
                {!isCollateralEnabled && (
                  <Button
                    size="sm"
                    onClick={executeEnterMarket}
                    disabled={isEnteringMarket}
                    className="bg-orange-500 hover:bg-orange-600 text-white"
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
              
              {/* Enter Market Status */}
              {enterMarketStatusMessage && isEnteringMarket && (
                <div className="mt-3 p-2 bg-orange-100/10 border border-orange-200/20 text-orange-600 rounded text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
                    {enterMarketStatusMessage}
                  </div>
                </div>
              )}

              {/* Enter Market Success */}
              {enterMarketStep === 'success' && (
                <div className="mt-3 p-2 bg-green-100/10 border border-green-200/20 text-green-600 rounded text-xs">
                  <div className="flex items-center gap-2">
                    <Check className="h-3 w-3" />
                    Successfully enabled {asset.symbol} as collateral!
                  </div>
                </div>
              )}


            </motion.div>
          )}
        </div>
      </div>

      {/* Error Modal */}
      <ErrorModal
        isOpen={errorModal.isOpen}
        onClose={() => setErrorModal({ isOpen: false, message: '', details: undefined })}
        title="Transaction Failed"
        message={errorModal.message}
        details={errorModal.details}
      />
    </motion.div>
    </TooltipProvider>
  );
}; 