"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { Asset } from "@/types/markets"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Check, CheckCircle2, Loader2, TrendingUp, TrendingDown, Wallet, RefreshCw, Info, Shield, ExternalLink, AlertTriangle, Sparkles, BarChart3 } from "lucide-react"
import Link from "next/link"
import { formatUserFacingError } from "@/lib/errorFormatter"
import { supplyMaxAmount } from "@/lib/supply-max"
import Image from "next/image"
import { useAccount, useReadContract, useReadContracts, usePublicClient, useBalance } from "wagmi"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { useAuthedFetch } from "@/hooks/use-authed-fetch"
import { readContract, writeContract, waitForTransactionReceipt } from "wagmi/actions"
import { useConfig } from "wagmi"
import { formatUnits, parseUnits, type Address } from "viem"
import { getAssetContractAddresses, getMarketsForChain, AXELAR_CROSS_CHAIN_ASSET_IDS } from "@/data/market-data"
import { getChainConfig, getOracleAddress, CHAIN_IDS, resolveHubReadChainId, isWmonMagmaSupplyDisabledOnMonad, isStellarNetwork } from "@/config/contracts"
// Remove wagmiConfig import - use wagmi actions without explicit config when using Privy
import { useSupplyTransaction } from "@/hooks/use-supply-transaction"
import { useStellarSupplyTransaction } from "@/hooks/use-stellar-supply-transaction"
import { useStellarRedeemTransaction } from "@/hooks/use-stellar-redeem-transaction"
import { useStellarBorrowTransaction } from "@/hooks/use-stellar-borrow-transaction"
import { useStellarRepayTransaction } from "@/hooks/use-stellar-repay-transaction"
import { useStellarPrice } from "@/hooks/use-stellar-price"
import { useMagmaBoostedSupplyTransaction } from "@/hooks/use-magma-boosted-supply-transaction"
// CrossChainBiconomyDialog removed - now using unified TxFeedbackDialog
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { useBorrowTransaction } from "@/hooks/use-borrow-transaction"
import { useBorrowBalance } from "@/hooks/use-borrow-balance"
import { useRedeemTransaction } from "@/hooks/use-redeem-transaction"
import { usePTokenBalance } from "@/hooks/use-ptoken-balance"
import { useRepayTransaction } from "@/hooks/use-repay-transaction"
import { useBorrowingPower } from "@/hooks/use-borrowing-power"
import { useMarketMembership } from "@/hooks/use-market-membership"
import { useEnterMarket } from "@/hooks/use-enter-market"
import { useExitMarket } from "@/hooks/use-exit-market"
import { useWalletBalance, useWalletBalanceTxRefresh } from "@/hooks/use-wallet-balance"
import { useHybridApy } from "@/hooks/use-hybrid-apy"
import { usePeridotRewards } from "@/hooks/use-peridot-rewards"
import { useDatabasePrice } from "@/hooks/use-database-price"
import dynamic from "next/dynamic"
import { TokenTooltip } from "@/components/ui/token-tooltip"

// Lazy load ErrorModal - only load when an error actually occurs
const ErrorModal = dynamic(
  () => import("@/components/ui/error-modal").then(mod => ({ default: mod.ErrorModal })),
  { 
    ssr: false, // Client-side only since errors are runtime events
  }
)
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AssetPromoBanner } from "@/components/ui/capsule"
import { AdvancedMetricsCard } from './AdvancedMetricsCard';
import { MARKET_PROMOTIONS } from "@/config/marketPromotions"
import combinedAbi from "@/app/abis/combinedAbi.json"
import peridotTrollerABI from "@/app/abis/peridottrollerABI.json";
import { useCallback } from "react";
import { playClick, playAction, playSuccess, playError, playOpen, playClose, playHover, playThump } from "@/lib/sound";
import { TOKENS as BICONOMY_TOKENS } from "@/biconomy/constants";
import { CHAIN_BY_ID } from "@/lib/biconomy/wallet";
import { useSmartAccountUpgrade } from "@/components/providers/SmartAccountUpgradeProvider";
import { useAccountType } from "@/hooks/use-account-type";
import BorrowAccountInfo from "@/components/wallet/BorrowAccountInfo";
import { useMarketActionGuard } from "@/hooks/use-market-action-guard";
import { toast } from 'sonner'
import useEnableCollateralTransaction from "@/hooks/use-enable-collateral-transaction"
import { useMarketMetrics } from "@/hooks/use-market-metrics"
import { useStellarMarketMetrics } from "@/hooks/use-stellar-market-metrics"
import { useNetworkContext } from "@/context"
import { StellarBorrowSlotsNotice } from "@/components/steallar/StellarBorrowSlotsNotice"
import {
  getStellarVaultConfig,
  stellarGetAvailableLiquidity,
  stellarGetBorrowBalance,
  stellarGetPortfolioTotals,
  stellarGetTotalBorrowed,
  stellarPreviewBorrowMax,
} from "@/lib/stellar-soroban-lending"
import { useTransactionFeeEstimate } from "@/hooks/use-transaction-fee-estimate"
import { useBoostedPosition } from "@/hooks/use-boosted-position"
import { useBoostedAPR } from "@/hooks/use-boosted-apr"

interface APYInfoProps {
  label: string
  value: string
  tooltip: string
  isSubtle?: boolean
  isTotal?: boolean
  actionButton?: React.ReactNode // Optional action button (e.g., external link)
}

const APYInfo = ({ label, value, tooltip, isSubtle = false, isTotal = false, actionButton }: APYInfoProps) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("flex justify-between items-center text-sm", isSubtle && "text-text/70", isTotal && "font-bold mt-1 pt-1 border-t border-border/20")}>
          <span className="flex items-center gap-1">
            {label}
          </span>
          <span className="flex items-center gap-1.5">
            {value}
            {actionButton}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)


interface AssetDropdownProps {
  asset: Asset
  isOpen: boolean
  onClose: () => void
  onTransaction: (asset: Asset, amount: number, type: "supply" | "borrow") => void
  isDemoMode: boolean
  supplyRewardsApy?: number
  borrowRewardsApy?: number
  initialTab?: ActionTab
}

interface BorrowInfoCardProps {
  borrowingPower: any;
  getMaxBorrowAmount: (assetId: string) => number;
  asset: Asset;
  borrowCap: bigint | null;
  totalBorrows: bigint | null;
  underlyingDecimals: number | undefined;
  hypotheticalUtilization: number;
  marketAvailableLiquidity?: number | null;
}

const BorrowInfoCard: React.FC<BorrowInfoCardProps> = ({
  borrowingPower,
  getMaxBorrowAmount,
  asset,
  borrowCap,
  totalBorrows,
  underlyingDecimals,
  hypotheticalUtilization,
  marketAvailableLiquidity = null,
}) => {
  const borrowInfoRenderCount = useRef(0)
  borrowInfoRenderCount.current += 1
  if (borrowInfoRenderCount.current % 50 === 0) {
    console.debug('[BorrowInfoCard] render x50', {
      assetId: asset.id,
      symbol: asset.symbol,
      renderCount: borrowInfoRenderCount.current,
    })
  }

  useEffect(() => {
    console.debug('[BorrowInfoCard] props', {
      assetId: asset.id,
      symbol: asset.symbol,
      borrowCap: borrowCap ? borrowCap.toString() : null,
      totalBorrows: totalBorrows ? totalBorrows.toString() : null,
      underlyingDecimals,
      hypotheticalUtilization,
      marketAvailableLiquidity,
      borrowingPowerTotals: borrowingPower
        ? {
            totalBorrowedUSD: borrowingPower.totalBorrowedUSD,
            totalBorrowingPowerUSD: borrowingPower.totalBorrowingPowerUSD,
            availableBorrowingPowerUSD: borrowingPower.availableBorrowingPowerUSD,
            collateralUtilization: borrowingPower.collateralUtilization,
          }
        : null,
    })
  }, [
    asset.id,
    asset.symbol,
    borrowCap,
    totalBorrows,
    underlyingDecimals,
    hypotheticalUtilization,
    marketAvailableLiquidity,
    borrowingPower?.totalBorrowedUSD,
    borrowingPower?.totalBorrowingPowerUSD,
    borrowingPower?.availableBorrowingPowerUSD,
    borrowingPower?.collateralUtilization,
  ])
  useEffect(() => {
    const debugInfo = {
      borrowCap: borrowCap ? borrowCap.toString() : 'null or undefined',
      totalBorrows: totalBorrows ? totalBorrows.toString() : 'null or undefined',
      underlyingDecimals,
      isReady: !!(totalBorrows && underlyingDecimals), // The condition in the JSX for rendering
      capIsSet: !!(borrowCap && borrowCap > BigInt(0)),
      formatted: {
        borrowCap: borrowCap && underlyingDecimals ? formatUnits(borrowCap, underlyingDecimals) : 'N/A',
        totalBorrows: totalBorrows && underlyingDecimals ? formatUnits(totalBorrows, underlyingDecimals) : 'N/A',
      },
      displayAs: {
        borrowCap: borrowCap && underlyingDecimals ? formatNumber(parseFloat(formatUnits(borrowCap, underlyingDecimals))) : 'N/A',
        totalBorrows: totalBorrows && underlyingDecimals ? formatNumber(parseFloat(formatUnits(totalBorrows, underlyingDecimals))) : 'N/A',
      },
      totalBorrowsExceedsCap: borrowCap && totalBorrows ? totalBorrows > borrowCap : 'unknown'
    };
    console.log(`[Borrow Info Debug] for ${asset.symbol}:`, debugInfo);
  }, [asset.symbol, borrowCap, totalBorrows, underlyingDecimals]);

  const borrowsExceedCap = useMemo(() =>
    borrowCap && totalBorrows && borrowCap > BigInt(0)
      ? totalBorrows >= borrowCap
      : false
  , [borrowCap, totalBorrows]);

  const marketStatus = useMemo(() => {
    const totalBorrowsAmount =
      totalBorrows !== null && underlyingDecimals !== undefined
        ? parseFloat(formatUnits(totalBorrows, underlyingDecimals))
        : null;
    const availableAmount =
      marketAvailableLiquidity !== null && Number.isFinite(marketAvailableLiquidity)
        ? Math.max(0, marketAvailableLiquidity)
        : null;
    const util = borrowCap && borrowCap > BigInt(0) && totalBorrows
      ? Math.min(Number((totalBorrows * BigInt(100)) / borrowCap), 100)
      : (totalBorrowsAmount !== null && availableAmount !== null && (totalBorrowsAmount + availableAmount) > 0
          ? Math.min((totalBorrowsAmount / (totalBorrowsAmount + availableAmount)) * 100, 100)
          : 0);

    if (!borrowCap || borrowCap === BigInt(0)) {
      return {
        label: "Market Availability",
        tooltip: "This shows how much of this asset is left for all users to borrow.",
        color: "text-muted-foreground",
        utilization: util,
      };
    }
    if (borrowsExceedCap) {
      return {
        label: "Borrowing Paused",
        tooltip: "The borrow cap has been reached. No further borrowing is possible until some loans are repaid.",
        color: "text-red-500 font-semibold",
        utilization: util,
      };
    }
    if (util > 95) {
      return {
        label: "Market at Capacity",
        tooltip: "The market is nearing its borrow cap. Borrowing may be paused soon.",
        color: "text-orange-400 font-semibold",
        utilization: util,
      };
    }
    return {
      label: "Total Borrows / Borrow Cap",
      tooltip: "This shows how much of this asset is left for all users to borrow. If it's low, borrowing may be paused soon.",
      color: "text-muted-foreground",
      utilization: util,
    };
  }, [borrowCap, totalBorrows, borrowsExceedCap, underlyingDecimals, marketAvailableLiquidity]);

  const formatNumber = (num: number, precision = 2) => {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(precision)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(precision)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(precision)}K`;
    return num.toFixed(precision);
  };

  const trimTrailingZeros = (value: string) => value
    .replace(/(\.\d*?[1-9])0+$/, '$1')
    .replace(/\.0+$/, '');

  const formatTokenAmount = (amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return '0';
    if (amount < 0.000001) return '<0.000001';
    if (amount < 0.001) return trimTrailingZeros(amount.toFixed(6));
    if (amount < 1) return trimTrailingZeros(amount.toFixed(4));
    if (amount < 10) return trimTrailingZeros(amount.toFixed(3));
    return formatNumber(amount);
  };

  const formatUsdValue = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return '$0.00';
    if (value < 0.01) return '<$0.01';
    if (value < 1) return `$${value.toFixed(2)}`;
    return `$${formatNumber(value)}`;
  };

  const collateralHeadroomUSD = useMemo(
    () => Math.max(borrowingPower.totalBorrowingPowerUSD - borrowingPower.totalBorrowedUSD, 0),
    [borrowingPower.totalBorrowingPowerUSD, borrowingPower.totalBorrowedUSD]
  );

  const availableBorrowAmount = useMemo(
    () => getMaxBorrowAmount(asset.id),
    [getMaxBorrowAmount, asset.id]
  );

  const liveOraclePrice = asset.oraclePrice || asset.price || 0;
  const availableBorrowUSD = liveOraclePrice > 0 ? availableBorrowAmount * liveOraclePrice : 0;
  const hasCollateralHeadroom = collateralHeadroomUSD > 10;
  const isTinyLiquidity = liveOraclePrice > 0
    ? availableBorrowUSD < 5
    : availableBorrowAmount < 0.5;
  const isFractionalLiquidity = liveOraclePrice > 0 && collateralHeadroomUSD > 0
    ? (availableBorrowUSD + 0.01) < collateralHeadroomUSD * 0.1
    : false;
  const liquidityLimited = hasCollateralHeadroom && (isTinyLiquidity || isFractionalLiquidity);
  const availableBorrowAmountDisplay = formatTokenAmount(availableBorrowAmount);
  const availableBorrowUSDDisplay = liveOraclePrice > 0 ? formatUsdValue(availableBorrowUSD) : null;
  const collateralHeadroomDisplay = formatUsdValue(collateralHeadroomUSD);

  const riskLevel = hypotheticalUtilization > 90 ? 'High' : hypotheticalUtilization > 75 ? 'Moderate' : 'Safe';
  const riskColor = riskLevel === 'High' ? 'text-red-500' : riskLevel === 'Moderate' ? 'text-orange-500' : 'text-green-500';

  const displayTotalBorrows = useMemo(() => {
    if (underlyingDecimals === undefined) return 'N/A';
    if (totalBorrows === null) return 'N/A';
    return formatNumber(parseFloat(formatUnits(totalBorrows, underlyingDecimals)));
  }, [totalBorrows, underlyingDecimals]);

  const displayBorrowCap = useMemo(() => {
    if (underlyingDecimals === undefined) return 'No Cap';
    if (borrowCap !== null && borrowCap > BigInt(0)) {
      return formatNumber(parseFloat(formatUnits(borrowCap, underlyingDecimals)));
    }
    return 'No Cap';
  }, [borrowCap, underlyingDecimals]);

  const displayMarketAvailable = useMemo(() => {
    if (marketAvailableLiquidity === null || !Number.isFinite(marketAvailableLiquidity)) return null;
    return formatNumber(Math.max(0, marketAvailableLiquidity));
  }, [marketAvailableLiquidity]);

  return (
    <div className="bg-gradient-to-br from-white/5 via-white/2 to-transparent border border-white/10 shadow-lg rounded-2xl p-4 space-y-6">
      <div className="grid grid-cols-2 gap-6">
        {/* Your Risk Level */}
        <div className="flex flex-col items-center space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            Your Risk Level
            <Info
              size={14}
              className="text-muted-foreground"
              title="This shows how close you are to liquidation. Keep this in the green to protect your collateral."
            />
          </h4>
          <div className="relative w-28 h-28">
            <svg className="w-full h-full" viewBox="0 0 36 36">
              <path
                className="text-black/20"
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray="100, 100"
              />
              <path
                className={riskColor}
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${hypotheticalUtilization}, 100`}
                style={{ transition: 'stroke-dasharray 0.3s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-2xl font-bold ${riskColor}`}>{hypotheticalUtilization.toFixed(1)}%</span>
              <span className={`text-xs font-semibold ${riskColor}`}>{riskLevel}</span>
            </div>
          </div>
          <div className="text-xs text-center">
            <span>${formatNumber(borrowingPower.totalBorrowedUSD)}</span>
            <span className="text-muted-foreground"> / ${formatNumber(borrowingPower.totalBorrowingPowerUSD)}</span>
          </div>
          {liquidityLimited && (
            <div className="text-xs text-center text-sky-400 mt-1">
              {availableBorrowAmount <= 0
                ? `Borrowing is at capacity for this market right now, so no liquidity is available. Your collateral still backs ~${collateralHeadroomDisplay}. Try another asset or check back soon.`
                : `Limited market liquidity: only ${availableBorrowAmountDisplay} ${asset.symbol}${availableBorrowUSDDisplay ? ` (~${availableBorrowUSDDisplay})` : ''} available now. Your collateral still backs ~${collateralHeadroomDisplay}. Try a smaller amount or another asset until liquidity improves.`}
            </div>
          )}
        </div>

        {/* Market Availability */}
        <div className="flex flex-col items-center space-y-2">
           <h4 className={`text-sm font-semibold flex items-center gap-1.5 ${marketStatus.color}`}>
            {marketStatus.label}
            <Info
              size={14}
              className="text-muted-foreground"
              title={marketStatus.tooltip}
            />
          </h4>
          <div className="w-20 h-28 bg-black/20 rounded-2xl flex flex-col justify-end p-1">
            <div
              className="bg-gradient-to-t from-blue-500 to-purple-500 rounded-xl transition-all duration-500 ease-out"
              style={{ height: `${100 - marketStatus.utilization}%` }}
            >
            </div>
          </div>
           <div className={`text-xs text-center transition-colors ${borrowsExceedCap ? 'text-orange-400 font-medium' : ''}`}>
            {underlyingDecimals !== undefined ? (
              <>
                {borrowsExceedCap && (
                  <AlertTriangle
                    size={12}
                    className="inline-flex align-middle mr-1 text-orange-400"
                    title="Total borrows have reached or exceeded the market cap. Further borrowing may be paused."
                  />
                )}
                <span>{displayTotalBorrows} </span>
                <span className="text-muted-foreground">
                  {' / '}
                  {borrowCap && borrowCap > BigInt(0)
                    ? displayBorrowCap
                    : (displayMarketAvailable ? `${displayMarketAvailable} available` : displayBorrowCap)}
                </span>
              </>
            ) : (
              <div className="flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 size={12} className="animate-spin mr-1.5" />
                Loading Market...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
type ActionTab = 'supply' | 'borrow' | 'manage'

const BORROW_CHAIN_LABELS: Record<number, string> = {
  [CHAIN_IDS.BSC_MAINNET]: 'BSC Mainnet',
  42161: 'Arbitrum One',
  8453: 'Base',
  137: 'Polygon',
  10: 'Optimism',
  1: 'Ethereum Mainnet',
}

const getReadableChainName = (chainId?: number): string | undefined => {
  if (!chainId) return undefined
  const config = getChainConfig(chainId) as any
  if (config?.chainNameReadable) return config.chainNameReadable
  if (BORROW_CHAIN_LABELS[chainId]) return BORROW_CHAIN_LABELS[chainId]
  const viemChain = CHAIN_BY_ID[chainId]
  if (viemChain?.name) return viemChain.name
  return undefined
}

const BICONOMY_KEY_TO_CHAIN: Record<string, number> = {
  mainnet: 1,
  arbitrum: 42161,
  optimism: 10,
  polygon: 137,
  base: 8453,
}

// Format USD price with dynamic decimals: default 2, increase until non-zero (up to 8)
const formatUsdPrice = (price: number): string => {
  if (!isFinite(price)) return '$-';
  if (price >= 1) return `$${price.toFixed(2)}`;
  let decimals = 2;
  while (decimals < 8 && Number(price.toFixed(decimals)) === 0) {
    decimals++;
  }
  return `$${price.toFixed(decimals)}`;
}

export const AssetDropdown = ({
  asset,
  isOpen,
  onClose,
  onTransaction,
  isDemoMode,
  supplyRewardsApy,
  borrowRewardsApy,
  initialTab,
}: AssetDropdownProps) => {
  const assetDropdownRenderCount = useRef(0)
  assetDropdownRenderCount.current += 1
  if (assetDropdownRenderCount.current % 50 === 0) {
    console.debug('[AssetDropdown] render x50', {
      assetId: asset.id,
      symbol: asset.symbol,
      renderCount: assetDropdownRenderCount.current,
    })
  }
  const { isConnected: isWagmiConnected, chainId } = useAccount()
  const { address, isConnected } = useActiveWallet()
  const { authedFetch, authReady } = useAuthedFetch()
  const { selectedNetworkId, getChainIdFromNetworkId } = useNetworkContext()
  const stellarConfig = useMemo(() => getStellarVaultConfig(asset.id), [asset.id])
  const useStellarTxs = stellarConfig !== null && isStellarNetwork(selectedNetworkId)
  const stellarVaultId = stellarConfig?.vaultId
  const stellarDecimals = stellarConfig?.decimals
  const [activeTab, setActiveTab] = useState<ActionTab>(initialTab || (asset.isBorrowable === false ? 'manage' : 'supply'))
  const [amount, setAmount] = useState("")
  const [repayMax, setRepayMax] = useState(false)
  const [redeemType, setRedeemType] = useState<'pTokens' | 'underlying'>('underlying')
  const [manageAction, setManageAction] = useState<'repay' | 'withdraw'>(asset.isBorrowable === false ? 'withdraw' : 'repay')
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [confirmationMessage, setConfirmationMessage] = useState("Transaction Successful!")
  // Removed showBiconomyDialog - now using unified TxFeedbackDialog
  const [showValuePopup, setShowValuePopup] = useState(false)
  const [borrowDestinationChainId, setBorrowDestinationChainId] = useState<number | null>(null)
  const [borrowFeeMode, setBorrowFeeMode] = useState<'biconomy' | 'native'>('native')
  const [borrowBiconomySponsored, setBorrowBiconomySponsored] = useState(true)
  const [errorModal, setErrorModal] = useState<{isOpen: boolean, message: string, details?: string, isRetryable?: boolean, onRetry?: () => void}>({
    isOpen: false,
    message: '',
    details: undefined,
    isRetryable: false,
    onRetry: undefined,
  })
  const [realOraclePrice, setRealOraclePrice] = useState<number | null>(null);
  const [useNative, setUseNative] = useState(false)

  // Fetch native balance (e.g. MON) for auto-wrap markets
  const { data: nativeBalanceData } = useBalance({ 
    address, 
    chainId: asset.availableOnChainId ?? chainId, 
    query: { enabled: !!address && !!asset?.canAutoWrap && isOpen } 
  })

  // Get user's wallet balance for this asset
  const {
    formattedBalance: walletBalance,
    numericBalance: walletBalanceNumeric,
    isLoading: isWalletBalanceLoading,
    hasBalance: hasWalletBalance,
    rawBalance: rawWalletBalance,
    decimals: walletDecimals,
    refetch: refetchWallet,
  } = useWalletBalance({
    assetId: asset.id,
  })

  // Ensure wallet balance refreshes when opening or returning to Supply
  useEffect(() => {
    if (!refetchWallet) return
    if (isOpen && activeTab === 'supply') {
      try { refetchWallet() } catch {}
    }
  }, [isOpen, activeTab, refetchWallet])

  // Effective balance based on toggle
  const nativeBalanceNumeric = nativeBalanceData ? parseFloat(nativeBalanceData.formatted) : 0
  const nativeBalanceFormatted = nativeBalanceData ? nativeBalanceData.formatted : "0.00"
  
  const effectiveBalanceNumeric = useNative ? nativeBalanceNumeric : (walletBalanceNumeric ?? 0)
  const effectiveBalanceFormatted = useNative ? nativeBalanceFormatted : walletBalance
  const effectiveBalanceSymbol = useNative ? (asset?.nativeSymbol ?? "MON") : asset?.symbol

  // Reset useNative when asset changes or dropdown opens
  useEffect(() => {
    if (isOpen && asset?.canAutoWrap) {
      setUseNative(true)
    } else {
      setUseNative(false)
    }
  }, [isOpen, asset?.id, asset?.canAutoWrap])

  const [marketState, setMarketState] = useState<{
    cash: bigint | null;
    totalBorrows: bigint | null;
    totalReserves: bigint | null;
    liquidationIncentiveMantissa: bigint | null;
  }>({
    cash: null,
    totalBorrows: null,
    totalReserves: null,
    liquidationIncentiveMantissa: null,
  });
  const [stellarBorrowMetrics, setStellarBorrowMetrics] = useState<{
    maxBorrowAmount: number
    availableLiquidityAmount: number
    marketUtilization: number
    totalBorrowedAmount: number
    collateralUsd: number
    borrowedUsd: number
    borrowBalanceRaw: bigint
    borrowBalanceAmount: number
    isLoading: boolean
  }>({
    maxBorrowAmount: 0,
    availableLiquidityAmount: 0,
    marketUtilization: 0,
    totalBorrowedAmount: 0,
    collateralUsd: 0,
    borrowedUsd: 0,
    borrowBalanceRaw: BigInt(0),
    borrowBalanceAmount: 0,
    isLoading: false,
  })
  const [redeemOverride, setRedeemOverride] = useState<{ fn: 'redeem' | 'redeemUnderlying', amount: bigint } | null>(null)

  
  // Debounce error modal to prevent rapid multiple openings
  const showErrorModal = (error: Error, isRetryable?: boolean, onRetry?: () => void) => {
    if (FEATURE_FLAGS.INTERACTIVE_TX_DIALOG) {
      // Unified transaction dialog already handles step/error rendering; avoid stacking overlays.
      setErrorModal({ isOpen: false, message: '', details: undefined, isRetryable: false, onRetry: undefined })
      try {
        let toastId: any
        toastId = toast.error('Transaction failed', {
          description: formatUserFacingError(error?.message || 'An unexpected error occurred'),
          action: { label: 'Close', onClick: () => toast.dismiss(toastId) },
        })
      } catch {}
      playError()
      return
    }

    // Close any existing modal first
    setErrorModal({ isOpen: false, message: '', details: undefined })
    
    // Open new modal after a brief delay to prevent conflicts
    setTimeout(() => {
      setErrorModal({
        isOpen: true,
        message: error.message || 'An unexpected error occurred',
        details: error.message || 'No details available',
        isRetryable,
        onRetry
      })
    }, 100)
    playError()
  }
  const hasSmartContract = asset.hasSmartContract === true
  const { theme, resolvedTheme } = useTheme()
  const effectiveTheme = resolvedTheme || theme || "dark"
  const { openUpgradePrompt, status: smartAccountStatus, isUpgrading: isUpgradeInProgress } = useSmartAccountUpgrade()
  const upgradeLabel = smartAccountStatus.isSmartAccount
    ? "Smart account active"
    : isUpgradeInProgress
      ? "Upgrading..."
      : "Unlock gasless borrows"
  const upgradeDisabled = smartAccountStatus.isLoading || isUpgradeInProgress
  const upgradeVariant = smartAccountStatus.isSmartAccount ? "secondary" : "outline"
  const { accountType, eligibleForSponsored, reason: sponsoredReason } = useAccountType()

  // State for earnings calculation
  const [earningsHistory, setEarningsHistory] = useState<{ netSupplied: number, netBorrowed: number, loading: boolean } | null>(null)

  // Fetch earnings history when entering Manage tab
  useEffect(() => {
    if (activeTab === 'manage' && isConnected && address && asset.symbol && authReady) {
      // Only fetch if we haven't already, or if we want to refresh on tab change (optional)
      // Ideally we want to avoid spamming, but we also want up-to-date info.
      // Let's check if we have data or if it's stale. For now, simple check.
      if (!earningsHistory) {
        setEarningsHistory({ netSupplied: 0, netBorrowed: 0, loading: true })
        
        // Get contract addresses to be more precise
        const effectiveAddresses = getAssetContractAddresses(asset.id, chainId)
        const pTokenAddress = effectiveAddresses?.pTokenAddress
        
        const params = new URLSearchParams({
          address: address,
          chainId: chainId?.toString() || '',
          tokenSymbol: asset.symbol
        })
        
        if (pTokenAddress) {
          params.append('contractAddress', pTokenAddress)
        }

        authedFetch(`/api/user/asset-earnings?${params.toString()}`)
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              setEarningsHistory({
                netSupplied: data.netSuppliedTokens,
                netBorrowed: data.netBorrowedTokens,
                loading: false
              })
            } else {
              setEarningsHistory({ netSupplied: 0, netBorrowed: 0, loading: false })
            }
          })
          .catch(err => {
            console.error('Failed to fetch earnings:', err)
            setEarningsHistory({ netSupplied: 0, netBorrowed: 0, loading: false })
          })
      }
    }
  }, [activeTab, isConnected, address, chainId, asset.symbol, asset.id, authReady, authedFetch])



  const { metrics: marketMetrics } = useMarketMetrics()
  const { metrics: stellarMetrics } = useStellarMarketMetrics(
    [asset.id],
    useStellarTxs
  )
  const mergedMarketMetrics = useMemo(
    () => ({ ...marketMetrics, ...stellarMetrics }),
    [marketMetrics, stellarMetrics]
  )
  const config = useConfig()

  // Utility function to format numbers with K/M/B suffixes
  const formatNumber = (num: number, precision = 2) => {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(precision)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(precision)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(precision)}K`;
    return num.toFixed(precision);
  };
  const {
    allowBorrow,
    allowWithdraw,
    showBorrowBlockedToast,
    showWithdrawBlockedToast,
    sponsoredTooltip,
    crossChainSmartAccountNotice,
    hubSmartAccountNotice,
    testnetSpokeNotice,
    hasOwnMarkets,
  } = useMarketActionGuard({ chainId, selectedNetworkId, accountType, eligibleForSponsored, sponsoredReason })
  const assetSymbolUpper = (asset.symbol || '').toUpperCase()

  const borrowDestinationOptions = useMemo(() => {
    const seen = new Set<number>()
    const options: { chainId: number; label: string }[] = []
    const pushOption = (cid: number) => {
      if (!cid || seen.has(cid)) return
      seen.add(cid)
      const label = BORROW_CHAIN_LABELS[cid] ?? `Chain ${cid}`
      options.push({ chainId: cid, label })
    }

    // Determine the appropriate BSC chain based on network preset
    const isTestnetPreset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || '').startsWith('testnet')
    const bscChainId = isTestnetPreset ? CHAIN_IDS.BSC_TESTNET : CHAIN_IDS.BSC_MAINNET
    pushOption(bscChainId)
    if (FEATURE_FLAGS.CROSS_CHAIN_BORROW_BICONOMY) {
      Object.entries(BICONOMY_KEY_TO_CHAIN).forEach(([key, cid]) => {
        const tokens = (BICONOMY_TOKENS as any)[key]
        if (tokens && tokens[assetSymbolUpper]) {
          pushOption(cid)
        }
      })
    }

    return options
  }, [assetSymbolUpper])

  const supplyDestinationOptions = useMemo(() => {
    const options: { chainId: number; label: string; apy?: number }[] = []
    // List of potential Hub Chains
    const potentialHubs = [CHAIN_IDS.BSC_MAINNET, CHAIN_IDS.MONAD_MAINNET]
    
    potentialHubs.forEach(hubId => {
      const cfg = getChainConfig(hubId) as any
      const market = cfg?.markets?.[asset.symbol.toUpperCase()]
      // Only add if the market exists on this hub
      if (market && market.pToken) {
        const label = BORROW_CHAIN_LABELS[hubId] || cfg.chainNameReadable || `Chain ${hubId}`
        
        options.push({ chainId: hubId, label })
      }
    })
    
    return options
  }, [asset.symbol, asset.id, marketMetrics]) // Added marketMetrics dependency

  const [supplyDestinationChainId, setSupplyDestinationChainId] = useState<number | null>(null)

  useEffect(() => {
    if (activeTab === 'supply' && supplyDestinationOptions.length > 0) {
      if (supplyDestinationChainId != null && supplyDestinationOptions.some(opt => opt.chainId === supplyDestinationChainId)) return
      if (chainId && supplyDestinationOptions.some(opt => opt.chainId === chainId)) {
        setSupplyDestinationChainId(chainId)
      } else {
        setSupplyDestinationChainId(supplyDestinationOptions[0].chainId)
      }
    }
  }, [activeTab, chainId, supplyDestinationOptions, supplyDestinationChainId])

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
    crossChainStatus: borrowCrossChainStatus,
    biconomyTrackingUrl: borrowBiconomyTrackingUrl,
    biconomyExplorerLinks: borrowBiconomyExplorerLinks,
    biconomyBscTxHash: borrowBiconomyBscTxHash,
    biconomyFee: borrowBiconomyFee,
    biconomyFeeDetails: borrowBiconomyFeeDetails,
    biconomyMeeLink: borrowBiconomyMeeLink,
    biconomyExpectedNet: borrowBiconomyExpectedNet,
    biconomyFundingMode: borrowBiconomyFundingMode,
    isBiconomyCrossChain: isBorrowBiconomyCrossChain,
    statusHint: borrowStatusHint,
    feeTokenOptions: borrowFeeTokenOptions,
    selectedFeeToken: selectedBorrowFeeToken,
    selectFeeToken: selectBorrowFeeToken,
    isFeeTokenBalanceLoading: isBorrowFeeTokenBalanceLoading,
  } = useBorrowTransaction({
    assetId: asset.id,
    amount: amount,
    destinationChainId: borrowDestinationChainId ?? undefined,
    feeMode: borrowFeeMode,
    biconomySponsorship: borrowBiconomySponsored,
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

  useEffect(() => {
    if (activeTab !== 'borrow') return
    if (!borrowDestinationOptions.length) {
      setBorrowDestinationChainId(null)
      return
    }
    setBorrowDestinationChainId(prev => {
      if (prev != null && borrowDestinationOptions.some(opt => opt.chainId === prev)) return prev
      if (chainId && borrowDestinationOptions.some(opt => opt.chainId === chainId)) return chainId
      return borrowDestinationOptions[0]?.chainId ?? prev ?? null
    })
  }, [activeTab, chainId, borrowDestinationOptions])

  useEffect(() => {
    if (!FEATURE_FLAGS.CROSS_CHAIN_BORROW_BICONOMY) return
    if (!smartAccountStatus?.isSmartAccount) return
    
    // Determine the appropriate BSC chain based on network preset
    const isTestnetPreset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || '').startsWith('testnet')
    const bscChainId = isTestnetPreset ? CHAIN_IDS.BSC_TESTNET : CHAIN_IDS.BSC_MAINNET
    
    if (borrowDestinationChainId !== bscChainId && borrowFeeMode !== 'biconomy') {
      setBorrowFeeMode('biconomy')
    }
  }, [borrowDestinationChainId, borrowFeeMode, smartAccountStatus?.isSmartAccount])

  const selectedBorrowDestination = useMemo(() => {
    if (!borrowDestinationOptions.length) return undefined
    return borrowDestinationOptions.find(opt => opt.chainId === borrowDestinationChainId) ?? borrowDestinationOptions[0]
  }, [borrowDestinationOptions, borrowDestinationChainId])
  // Determine the appropriate BSC chain based on network preset
  const isTestnetPreset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || '').startsWith('testnet')
  const bscChainId = isTestnetPreset ? CHAIN_IDS.BSC_TESTNET : CHAIN_IDS.BSC_MAINNET
  
  const isCrossChainBorrow = selectedBorrowDestination ? selectedBorrowDestination.chainId !== bscChainId : false
  const nativeFeeOptionAvailable = (
    selectedBorrowDestination?.chainId === bscChainId ||
    (selectedBorrowDestination == null && chainId === bscChainId)
  )
  const effectiveBorrowFeeMode: 'biconomy' | 'native' = borrowBiconomyFundingMode
    ? (borrowBiconomyFundingMode === 'fallback' && borrowBiconomySponsored ? 'native' : 'biconomy')
    : borrowFeeMode
  const publicClient = usePublicClient();

  const selectedBorrowFeeTokenBalanceLabel = useMemo(() => {
    if (!selectedBorrowFeeToken) return 'Select a token for Biconomy to charge fees.'
    if (selectedBorrowFeeToken.balanceWei == null) return 'Checking wallet balance on BSC...'
    if (selectedBorrowFeeToken.balanceWei > BigInt(0)) {
      const numeric = Number(selectedBorrowFeeToken.formattedBalance ?? '0')
      const formatted = Number.isFinite(numeric)
        ? (numeric >= 1 ? numeric.toLocaleString(undefined, { maximumFractionDigits: 2 }) : numeric.toLocaleString(undefined, { maximumFractionDigits: 4 }))
        : selectedBorrowFeeToken.formattedBalance
      return `Wallet balance: ${formatted} ${selectedBorrowFeeToken.symbol}`
    }
    return `No ${selectedBorrowFeeToken.symbol} detected on BSC yet.`
  }, [selectedBorrowFeeToken])

  const formatBorrowFeeTokenPreview = (option?: { formattedBalance?: string; balanceWei?: bigint }) => {
    if (!option) return ''
    if (option.balanceWei == null) return '…'
    if (option.balanceWei === BigInt(0)) return '0'
    const numeric = Number(option.formattedBalance ?? '0')
    if (!Number.isFinite(numeric)) return option.formattedBalance ?? ''
    if (numeric >= 1) return numeric.toLocaleString(undefined, { maximumFractionDigits: 2 })
    return numeric.toLocaleString(undefined, { maximumFractionDigits: 4 })
  }

  // Handle scroll to hide popup
  useEffect(() => {
    const handleScroll = () => setShowValuePopup(false)
    window.addEventListener('scroll', handleScroll)
    // Removed openDialogOnCompose - now using unified tx-update events
    // Removed cc-dialog-open listener - now using unified tx-update events
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Sound on open/close
  useEffect(() => {
    if (isOpen) {
      playOpen()
    } else {
      playClose()
    }
  }, [isOpen])

  // Respect externally requested initial tab when opening
  useEffect(() => {
    if (!isOpen || !initialTab) return
    setActiveTab(prev => (prev === initialTab ? prev : initialTab))
  }, [isOpen, initialTab])

  useEffect(() => {
    // Only auto-switch away from borrow tab if wallet is connected and borrow is not allowed
    // When wallet is not connected, allow viewing the tab for exploration
    if (activeTab !== 'borrow' || allowBorrow || !isConnected) return
    setActiveTab('supply')
  }, [activeTab, allowBorrow, isConnected])

  // Tooltip open state is controlled via Radix onOpenChange handler.
  
  // Get contract addresses and chain config
  const contractAddresses = chainId ? getAssetContractAddresses(asset.id, chainId) : null
  if (asset.symbol === 'LINK') {
    console.log('[LINK DEBUG] contractAddresses:', contractAddresses);
  }
  const chainConfig = chainId ? getChainConfig(chainId) : null
  const controllerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy : null

  // Resolve effective read chain (route spoke chains like Arbitrum → BSC hub for reads)
  // When wallet is not connected, use asset's availableOnChainId if available (e.g., Monad Mainnet assets)
  const effectiveReadChainId = useMemo(() => {
    if (!isConnected && asset.availableOnChainId) {
      return asset.availableOnChainId
    }
    return resolveHubReadChainId(chainId ?? null) ?? undefined
  }, [chainId, isConnected, asset.availableOnChainId])

  const metricsChainId = useMemo(() => {
    if (useStellarTxs) return CHAIN_IDS.STELLAR_MAINNET
    if (effectiveReadChainId) return effectiveReadChainId
    if (chainId) return chainId
    const fromNetwork = selectedNetworkId ? getChainIdFromNetworkId(selectedNetworkId) : undefined
    return fromNetwork ?? null
  }, [useStellarTxs, effectiveReadChainId, chainId, selectedNetworkId, getChainIdFromNetworkId])

  // Create metricsKey for accessing market metrics data
  const metricsKey = asset.id && metricsChainId ? `${asset.id.replace(/_/g, '-').toUpperCase()}:${metricsChainId}` : null

  const supplyDisabledOnMonad = isWmonMagmaSupplyDisabledOnMonad(asset.id, effectiveReadChainId)
  useEffect(() => {
    if (!supplyDisabledOnMonad || activeTab !== 'supply') return
    // If borrowing is blocked, fall back to manage to avoid supply<->borrow ping-pong.
    if (asset.isBorrowable === false || (isConnected && !allowBorrow)) {
      setActiveTab('manage')
      return
    }
    setActiveTab('borrow')
  }, [supplyDisabledOnMonad, activeTab, asset.isBorrowable, allowBorrow, isConnected])
  const isAxelarAsset = AXELAR_CROSS_CHAIN_ASSET_IDS.has(asset.id)
  const isBsc = chainId === bscChainId
  const isEthWrapChain = chainId === 1 || chainId === 42161 || chainId === 10 || chainId === 8453
  const effectiveAddresses = effectiveReadChainId ? getAssetContractAddresses(asset.id, effectiveReadChainId) : null
  const effectiveChainConfig = effectiveReadChainId ? getChainConfig(effectiveReadChainId) : null
  const effectiveControllerAddress = effectiveChainConfig && 'unitrollerProxy' in (effectiveChainConfig as any)
    ? (effectiveChainConfig as any).unitrollerProxy as `0x${string}`
    : null

  // OPTIMIZATION: Only fetch borrow cap when user opens Borrow tab
  const needsBorrowCap = activeTab === 'borrow';
  // OPTIMIZATION: Only fetch market data when user opens Supply/Borrow tabs
  const needsMarketData = activeTab === 'supply' || activeTab === 'borrow';
  
  // Route oracle to hub chain when needed (e.g., Arbitrum → BSC)
  const oracleAddress = effectiveReadChainId ? getOracleAddress(effectiveReadChainId) : (chainId ? getOracleAddress(chainId) : null)
  
  // BATCHED RPC CALLS - Combine all contract reads into single multicall to reduce RPC burst
  // This replaces 6+ individual useReadContract calls with 1 batched call
  const batchedPTokenAddress = (effectiveAddresses?.pTokenAddress ?? contractAddresses?.pTokenAddress) as `0x${string}` | undefined;
  const batchedControllerAddr = (effectiveControllerAddress ?? controllerAddress) as `0x${string}` | undefined;
  const batchedUnderlyingAddr = (effectiveAddresses?.underlyingAddress ?? contractAddresses?.underlyingAddress) as `0x${string}` | undefined;
  
  const batchedContracts = useMemo(() => {
    const contracts: any[] = [];

    // Always include all contracts but conditionally enable them
    // This ensures consistent array indexes regardless of tab

    // 0: borrowCaps (enabled only when on borrow tab)
    contracts.push({
      address: batchedControllerAddr,
      abi: peridotTrollerABI,
      functionName: 'borrowCaps',
      args: batchedPTokenAddress ? [batchedPTokenAddress] : [],
      chainId: effectiveReadChainId,
      query: { enabled: !!(batchedControllerAddr && batchedPTokenAddress && needsBorrowCap) }
    });

    // 1: oraclePrice (getUnderlyingPrice for Monad, assetPrices for others)
    const isMonadMainnet = effectiveReadChainId === 143;
    contracts.push({
      address: oracleAddress,
      abi: combinedAbi,
      functionName: isMonadMainnet ? 'getUnderlyingPrice' : 'assetPrices',
      args: isMonadMainnet ? [batchedPTokenAddress] : [batchedUnderlyingAddr],
      chainId: effectiveReadChainId,
      query: { enabled: !!(batchedPTokenAddress && oracleAddress && isConnected) }
    });

    // 2: liquidationIncentiveMantissa (always enabled when connected, since it's always displayed)
    contracts.push({
      address: batchedControllerAddr,
      abi: combinedAbi,
      functionName: 'liquidationIncentiveMantissa',
      args: [],
      chainId: effectiveReadChainId,
      query: { enabled: !!(batchedControllerAddr && isConnected) }
    });

    // 3: totalBorrows (enabled when market data needed)
    contracts.push({
      address: batchedPTokenAddress,
      abi: combinedAbi,
      functionName: 'totalBorrows',
      args: [],
      chainId: effectiveReadChainId,
      query: { enabled: !!(batchedPTokenAddress && isConnected && needsMarketData) }
    });

    // 4: getCash (enabled when market data needed)
    contracts.push({
      address: batchedPTokenAddress,
      abi: combinedAbi,
      functionName: 'getCash',
      args: [],
      chainId: effectiveReadChainId,
      query: { enabled: !!(batchedPTokenAddress && isConnected && needsMarketData) }
    });

    // 5: totalReserves (enabled when market data needed)
    contracts.push({
      address: batchedPTokenAddress,
      abi: combinedAbi,
      functionName: 'totalReserves',
      args: [],
      chainId: effectiveReadChainId,
      query: { enabled: !!(batchedPTokenAddress && isConnected && needsMarketData) }
    });

    return contracts;
  }, [
    batchedControllerAddr, 
    batchedPTokenAddress, 
    batchedUnderlyingAddr, 
    oracleAddress, 
    needsBorrowCap, 
    needsMarketData, 
    isConnected, 
    effectiveReadChainId
  ]);
  
  const { data: batchedData, refetch: refetchBatchedData } = useReadContracts({
    contracts: batchedContracts as any,
    query: {
      enabled: batchedContracts.length > 0,
      refetchInterval: 60000, // Reduced frequency to prevent RPC rate limits
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    } as any,
  } as any);
  
  // Extract individual results from batched call (maintaining backward compatibility)
  const borrowCapData = useMemo(() => {
    if (!batchedData || batchedData.length === 0) return undefined;
    const result = batchedData[0];
    return result?.status === 'success' ? result.result : undefined;
  }, [batchedData]);
  
  // Simple price validator - reject suspicious values like stale stablecoin prices
  const isValidPrice = useCallback((price: number, expectedPrice: number): boolean => {
    if (!price || price <= 0 || !isFinite(price)) return false;
    // For assets with price 0 (like gMON), reject 0.5-2.0 range (likely stale stablecoin prices)
    if (expectedPrice === 0 && price > 0.5 && price < 2.0) return false;
    return true;
  }, []);

  // Get price from database first, then RPC as fallback
  const {
    price: dbPrice,
    isLoading: isDbPriceLoading,
    error: dbPriceError,
    hasValidPrice: hasValidDbPrice,
    source: dbSource
  } = useDatabasePrice({
    assetId: asset.id,
    chainId: useStellarTxs ? CHAIN_IDS.STELLAR_MAINNET : (effectiveReadChainId ?? null),
  })

  const oraclePrice = useMemo(() => {
    if (!batchedData || batchedData.length < 2) return undefined;
    const result = batchedData[1];
    return result?.status === 'success' ? result.result : undefined;
  }, [batchedData]);
  
  const liquidationIncentiveMantissaData = useMemo(() => {
    if (!batchedData || batchedData.length < 3) return undefined;
    const result = batchedData[2];
    return result?.status === 'success' ? result.result : undefined;
  }, [batchedData]);
  
  const totalBorrowsData = useMemo(() => {
    if (!batchedData || batchedData.length < 4) return undefined;
    const result = batchedData[3];
    return result?.status === 'success' ? result.result : undefined;
  }, [batchedData]);
  
  const cashData = useMemo(() => {
    if (!batchedData || batchedData.length < 5) return undefined;
    const result = batchedData[4];
    return result?.status === 'success' ? result.result : undefined;
  }, [batchedData]);
  
  const totalReservesData = useMemo(() => {
    if (!batchedData || batchedData.length < 6) return undefined;
    const result = batchedData[5];
    return result?.status === 'success' ? result.result : undefined;
  }, [batchedData]);

  // Native BNB balance (for wrapping into WBNB)
  const enableNativeBalance = Boolean(
    isConnected && address && (
      (isBsc && asset.symbol === 'WBNB') ||
      (isEthWrapChain && asset.symbol === 'WETH')
    )
  )
  const { data: nativeBnbBalance } = useBalance({
    address,
    chainId,
    query: {
      enabled: enableNativeBalance,
      refetchInterval: 60000, // Reduced frequency to prevent RPC rate limits
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  })

  const [isWrapping, setIsWrapping] = useState(false)
  const [showWrapControls, setShowWrapControls] = useState(false)
  const [wrapAmount, setWrapAmount] = useState<string>("")
  const [wrapGasReserveWei, setWrapGasReserveWei] = useState<bigint | null>(null)
  const [isMinting, setIsMinting] = useState(false)
  const nativeWeiBalance = nativeBnbBalance?.value ?? BigInt(0)
  const maxWrapWei = useMemo(() => {
    const reserve = wrapGasReserveWei ?? BigInt(0)
    if (nativeWeiBalance <= reserve) return BigInt(0)
    return nativeWeiBalance - reserve
  }, [nativeWeiBalance, wrapGasReserveWei])
  const wrapExceedsMax = useMemo(() => {
    try {
      if (!wrapAmount) return false
      const wei = parseUnits(wrapAmount, 18)
      return maxWrapWei > BigInt(0) && wei > maxWrapWei
    } catch { return false }
  }, [wrapAmount, maxWrapWei])
  const maxWrapDisplay = useMemo(() => {
    try { return maxWrapWei ? formatUnits(maxWrapWei, 18) : '0' } catch { return '0' }
  }, [maxWrapWei])

  const estimateGasReserveWei = useCallback(async (): Promise<bigint> => {
    try {
      // Rough estimate: 80k gas for deposit, times current gasPrice; cap with a sane upper bound
      const gp = await publicClient?.getGasPrice()
      const est = gp ? (gp * BigInt(80000)) : undefined
      const hardCap = parseUnits('0.002', 18)
      const softCap = parseUnits('0.0002', 18)
      if (!est) return softCap
      return est > hardCap ? hardCap : (est < softCap ? softCap : est)
    } catch {
      // Fallback if gas price not available
      return parseUnits('0.0005', 18)
    }
  }, [publicClient])
  useEffect(() => {
    let cancelled = false
    const primeReserve = async () => {
      if (!showWrapControls) return
      // Only estimate on relevant chains/assets
      if (!((isBsc && asset.symbol === 'WBNB') || (isEthWrapChain && asset.symbol === 'WETH'))) return
      try {
        const r = await estimateGasReserveWei()
        if (!cancelled) setWrapGasReserveWei(r)
      } catch { if (!cancelled) setWrapGasReserveWei(parseUnits('0.0005', 18)) }
    }
    primeReserve()
    return () => { cancelled = true }
  }, [showWrapControls, isBsc, isEthWrapChain, asset.symbol, estimateGasReserveWei])
  const handleWrapBnbToWbnb = async (overrideAmount?: string) => {
    try {
      if (!isConnected || !isBsc || asset.symbol !== 'WBNB') return
      const wbnbAddress = (chainConfig as any)?.tokens?.WBNB as `0x${string}` | undefined
      if (!wbnbAddress) throw new Error('WBNB address not configured for this chain')
      const nativeWei = nativeBnbBalance?.value ?? BigInt(0)
      if (nativeWei <= BigInt(0)) throw new Error('No BNB balance to convert')

      // Prefer entered amount; otherwise wrap nearly all (minus small gas reserve)
      const reserveWei = await estimateGasReserveWei()
      let desiredWei = BigInt(0)
      const selectedStr = typeof overrideAmount === 'string' && overrideAmount !== '' ? overrideAmount : amount
      if (selectedStr && !isNaN(parseFloat(selectedStr))) {
        desiredWei = parseUnits(selectedStr, 18)
        // Ensure we leave gas reserve
        const maxAfterReserve = nativeWei > reserveWei ? (nativeWei - reserveWei) : BigInt(0)
        if (desiredWei > maxAfterReserve) desiredWei = maxAfterReserve
      } else {
        desiredWei = nativeWei > reserveWei ? (nativeWei - reserveWei) : BigInt(0)
      }
      if (desiredWei <= BigInt(0)) throw new Error('Insufficient BNB after gas reserve')
      if (desiredWei + reserveWei > nativeWei) {
        desiredWei = nativeWei > reserveWei ? (nativeWei - reserveWei) : BigInt(0)
      }

      setIsWrapping(true)
      const wbnbAbi = [
        { type: 'function', stateMutability: 'payable', name: 'deposit', inputs: [], outputs: [] },
      ] as const

      const hash = await writeContract(config, {
        address: wbnbAddress,
        abi: wbnbAbi as any,
        functionName: 'deposit',
        args: [],
        value: desiredWei,
        chain: undefined,
        chainId,
        account: address as `0x${string}`,
      })
      await waitForTransactionReceipt(config, { hash })
      try { await refetchWallet?.() } catch {}
      playSuccess()
      setShowConfirmation(true)
      setConfirmationMessage('Converted BNB to WBNB successfully')
      setTimeout(() => setShowConfirmation(false), 2500)
      setShowWrapControls(false)
      setWrapAmount("")
    } catch (e: any) {
      console.error('Wrap BNB→WBNB failed:', e)
      showErrorModal(e)
    } finally {
      setIsWrapping(false)
    }
  }

  const handleWrapEthToWeth = async (overrideAmount?: string) => {
    try {
      if (!isConnected || !isEthWrapChain || asset.symbol !== 'WETH') return
      // Resolve WETH by chain
      const wethAddress = (() => {
        switch (chainId) {
          case 1: return BICONOMY_TOKENS.mainnet.WETH as `0x${string}`
          case 42161: return (BICONOMY_TOKENS as any).arbitrum.WETH as `0x${string}`
          case 10: return (BICONOMY_TOKENS as any).optimism.WETH as `0x${string}`
          case 8453: return (BICONOMY_TOKENS as any).base.WETH as `0x${string}`
          default: return undefined
        }
      })()
      if (!wethAddress) throw new Error('WETH address not configured for this chain')
      const nativeWei = nativeBnbBalance?.value ?? BigInt(0)
      if (nativeWei <= BigInt(0)) throw new Error('No ETH balance to convert')

      const reserveWei = await estimateGasReserveWei()
      let desiredWei = BigInt(0)
      const selectedStr = typeof overrideAmount === 'string' && overrideAmount !== '' ? overrideAmount : amount
      if (selectedStr && !isNaN(parseFloat(selectedStr))) {
        desiredWei = parseUnits(selectedStr, 18)
        const maxAfterReserve = nativeWei > reserveWei ? (nativeWei - reserveWei) : BigInt(0)
        if (desiredWei > maxAfterReserve) desiredWei = maxAfterReserve
      } else {
        desiredWei = nativeWei > reserveWei ? (nativeWei - reserveWei) : BigInt(0)
      }
      if (desiredWei <= BigInt(0)) throw new Error('Insufficient ETH after gas reserve')
      if (desiredWei + reserveWei > nativeWei) {
        desiredWei = nativeWei > reserveWei ? (nativeWei - reserveWei) : BigInt(0)
      }

      setIsWrapping(true)
      const wethAbi = [
        { type: 'function', stateMutability: 'payable', name: 'deposit', inputs: [], outputs: [] },
      ] as const

      const hash = await writeContract(config, {
        address: wethAddress,
        abi: wethAbi as any,
        functionName: 'deposit',
        args: [],
        value: desiredWei,
        chain: undefined,
        chainId,
        account: address as `0x${string}`,
      })
      await waitForTransactionReceipt(config, { hash })
      try { await refetchWallet?.() } catch {}
      playSuccess()
      setShowConfirmation(true)
      setConfirmationMessage('Converted ETH to WETH successfully')
      setTimeout(() => setShowConfirmation(false), 2500)
      setShowWrapControls(false)
      setWrapAmount("")
    } catch (e: any) {
      console.error('Wrap ETH→WETH failed:', e)
      showErrorModal(e)
    } finally {
      setIsWrapping(false)
    }
  }

  const handleMint = async () => {
    try {
      if (!isConnected || chainId !== CHAIN_IDS.SOMNIA_TESTNET || asset.id !== 'usdt') return
      
      setIsMinting(true)
      const usdtAddress = '0xa568bD70068A940910d04117c36Ab1A0225FD140' as `0x${string}`
      const mintAbi = [
        { 
          type: 'function', 
          stateMutability: 'payable', 
          name: 'mint', 
          inputs: [], 
          outputs: [] 
        },
      ] as const

      const hash = await writeContract(config, {
        address: usdtAddress,
        abi: mintAbi as any,
        functionName: 'mint',
        args: [],
        value: BigInt(0), // payable but can be 0
        chain: undefined,
        chainId,
        account: address as `0x${string}`,
      })
      await waitForTransactionReceipt(config, { hash })
      try { await refetchWallet?.() } catch {}
      playSuccess()
      setShowConfirmation(true)
      setConfirmationMessage('USDT minted successfully')
      setTimeout(() => setShowConfirmation(false), 2500)
    } catch (e: any) {
      console.error('Mint USDT failed:', e)
      showErrorModal(e)
    } finally {
      setIsMinting(false)
    }
  }

  // Effect to fetch price with a public client when not connected
  // OPTIMIZATION: Only fetch market data when user opens Supply/Borrow tabs
  useEffect(() => {
    const fetchPublicData = async () => {
      // Skip if user is connected (wagmi hooks handle it) or if market data not needed yet
      if (isConnected || (activeTab !== 'supply' && activeTab !== 'borrow')) {
        // Still set fallback price even if we skip market data
        if (!isConnected) {
          // Priority 1: Database price (fastest)
          if (hasValidDbPrice && dbPrice && isValidPrice(dbPrice, asset.price)) {
            setRealOraclePrice(dbPrice);
          } else {
            setRealOraclePrice(asset.price);
          }
        }
        return;
      }

      // For spoke chains, use hub chain; otherwise use current or default from env
      const defaultFromEnv = (() => {
        if (process.env.NEXT_PUBLIC_NETWORK_PRESET === 'mainnet-bsc-only') return CHAIN_IDS.BSC_MAINNET
        const envId = process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ? Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID) : undefined
        return !Number.isNaN(envId as any) && envId ? envId : CHAIN_IDS.BSC_TESTNET
      })()
      const targetChainId = resolveHubReadChainId(chainId || defaultFromEnv) ?? (chainId || defaultFromEnv);
      const publicContractAddresses = getAssetContractAddresses(asset.id, targetChainId);
      const effectiveChainConfig = getChainConfig(targetChainId);
      const controllerAddress = effectiveChainConfig && 'unitrollerProxy' in effectiveChainConfig ? (effectiveChainConfig as any).unitrollerProxy : null;
      const publicOracleAddress = getOracleAddress(targetChainId);

      if (publicContractAddresses?.pTokenAddress && publicOracleAddress) {
        if (asset.symbol === 'LINK') {
          console.log('[LINK DEBUG] publicContractAddresses:', publicContractAddresses);
        }
        try {
          // Use getUnderlyingPrice for Monad Mainnet, assetPrices for others
          const isMonadMainnet = targetChainId === 143;
          const priceFunction = isMonadMainnet ? 'getUnderlyingPrice' : 'assetPrices';
          const priceArgs = isMonadMainnet ? [publicContractAddresses.pTokenAddress!] : [publicContractAddresses.underlyingAddress!];

          const [price, cash, totalBorrows, totalReserves, liquidationIncentiveMantissa] = await Promise.all([
            readContract(config, {
              address: publicOracleAddress as `0x${string}`,
              abi: combinedAbi,
              functionName: priceFunction,
              args: priceArgs,
              chainId: targetChainId,
            }),
            readContract(config, { address: publicContractAddresses.pTokenAddress, abi: combinedAbi, functionName: 'getCash', chainId: targetChainId }),
            readContract(config, { address: publicContractAddresses.pTokenAddress, abi: combinedAbi, functionName: 'totalBorrows', chainId: targetChainId }),
            readContract(config, { address: publicContractAddresses.pTokenAddress, abi: combinedAbi, functionName: 'totalReserves', chainId: targetChainId }),
            controllerAddress ? readContract(config, { address: controllerAddress as `0x${string}`, abi: combinedAbi, functionName: 'liquidationIncentiveMantissa', chainId: targetChainId }) : Promise.resolve(null),
          ]);
          
        if (asset.symbol === 'LINK') {
          console.log('[LINK DEBUG] Fetched public price:', price);
        }
        const parsedPrice = parseFloat(formatUnits(price as bigint, 18));
        if (isValidPrice(parsedPrice, asset.price)) {
          setRealOraclePrice(parsedPrice);
        } else {
          // Invalid RPC price, fallback to database or static
          if (hasValidDbPrice && dbPrice && isValidPrice(dbPrice, asset.price)) {
            setRealOraclePrice(dbPrice);
          } else {
            setRealOraclePrice(asset.price);
          }
        }
          setMarketState({
            cash: cash as bigint,
            totalBorrows: totalBorrows as bigint,
            totalReserves: totalReserves as bigint,
            liquidationIncentiveMantissa: liquidationIncentiveMantissa as bigint | null
          });

        } catch (error) {
          console.error("Failed to fetch public market data:", error);
          // Fallback to database price, then static price
          if (hasValidDbPrice && dbPrice && isValidPrice(dbPrice, asset.price)) {
            setRealOraclePrice(dbPrice);
          } else {
            setRealOraclePrice(asset.price); // Fallback to static price
          }
          // Set default marketState to prevent infinite loading
          setMarketState({
            cash: BigInt(0),
            totalBorrows: BigInt(0),
            totalReserves: BigInt(0),
            liquidationIncentiveMantissa: null
          });
        }
      } else {
        // Fallback to database price, then static price
        if (hasValidDbPrice && dbPrice && isValidPrice(dbPrice, asset.price)) {
          setRealOraclePrice(dbPrice);
        } else {
          setRealOraclePrice(asset.price); // Fallback for assets not on default chain
        }
        // Set default marketState for assets not on default chain
        setMarketState({
          cash: BigInt(0),
          totalBorrows: BigInt(0),
          totalReserves: BigInt(0),
          liquidationIncentiveMantissa: null
        });
      }
    };

    if (!isConnected) {
      fetchPublicData();
    }
  }, [isConnected, asset.id, asset.price, chainId, activeTab, hasValidDbPrice, dbPrice, isValidPrice]);

  const { price: stellarPrice, hasValidPrice: hasValidStellarPrice } = useStellarPrice(
    asset.id,
    isOpen && useStellarTxs
  )

  // Effect: Stellar price (oracle.lastprice) when on Stellar – same as Python script
  useEffect(() => {
    if (!useStellarTxs) return
    if (hasValidStellarPrice && stellarPrice != null) {
      setRealOraclePrice(stellarPrice)
    } else {
      setRealOraclePrice(asset.price) // Fallback while loading or if oracle fails
    }
  }, [useStellarTxs, hasValidStellarPrice, stellarPrice, asset.price])

  // Effect to update price: database first, then RPC as fallback
  useEffect(() => {
    if (useStellarTxs && hasValidStellarPrice) return // Handled by Stellar effect above
    if (isConnected) {
      // Priority 1: Database price (fastest, most reliable)
      if (hasValidDbPrice && dbPrice && isValidPrice(dbPrice, asset.price)) {
        setRealOraclePrice(dbPrice);
        return;
      }

      // Priority 2: RPC price (slower, may be rate limited)
      if (oraclePrice) {
        if (asset.symbol === 'LINK') {
          console.log('[LINK DEBUG] Raw oraclePrice from useReadContract:', oraclePrice);
        }
        const parsedPrice = parseFloat(formatUnits(BigInt(oraclePrice.toString()), 18));
        if (isValidPrice(parsedPrice, asset.price)) {
          setRealOraclePrice(parsedPrice);
          return;
        }
      }

      // Fallback: Static price from asset config
      setRealOraclePrice(asset.price);
    }
  }, [useStellarTxs, hasValidStellarPrice, isConnected, hasValidDbPrice, dbPrice, oraclePrice, asset.price, asset.symbol, isValidPrice]);


  // liquidationIncentiveMantissaData now comes from batched call above

  const liquidationIncentive = useMemo(() => {
    if (!marketState.liquidationIncentiveMantissa) return null;
    // The incentive is returned as a mantissa (1e18), so we format it as a percentage.
    // e.g., 1.1e18 becomes 10%
    const formatted = parseFloat(formatUnits(marketState.liquidationIncentiveMantissa as bigint, 18));
    return (formatted - 1) * 100;
  }, [marketState.liquidationIncentiveMantissa]);


  // Calculate real oracle price in USD - REMOVED, now using state `realOraclePrice`

  // Calculate dollar value for popup
  const dollarValue = amount && !isNaN(parseFloat(amount)) 
    ? parseFloat(amount) * (realOraclePrice || asset.price)
    : 0

  // Use smart contract hook for supply transactions
  const {
    executeSupply,
    manualSupplyTrigger,
    retryCrossChain,
    retryTransaction,
    isLoading: isSupplyLoading,
    error: supplyError,
    canSupply,
    reset: resetSupply,
    step,
    statusMessage,
    needsApproval,
    approveHash,
    supplyHash,
    crossChainStatus,
    axelarGasPaymentWei,
    crossChainLastPoll,
    biconomyTrackingUrl,
    biconomyExplorerLinks,
    biconomyBscTxHash,
    biconomyFee,
    biconomyFeeDetails,
    biconomyMeeLink,
    isRetryable,
  } = useSupplyTransaction({
    assetId: asset.id,
    amount: amount,
    destinationChainId: supplyDestinationChainId || undefined,
    onSuccess: () => {
      const amountNum = parseFloat(amount);
      if (!isNaN(amountNum) && amountNum > 0) {
        onTransaction(asset, amountNum, "supply");
      }
      setAmount("");
      // For cross-chain assets, show a pending state instead of a success banner.
      if (isAxelarAsset) {
        // Do not show success toast; UI can display a "Cross-chain pending" message using `step` and `statusMessage`.
      } else {
        setShowConfirmation(true);
        setTimeout(() => setShowConfirmation(false), 3000);
        resetSupply();
      }
    },
    onError: (error) => {
      console.error('Supply transaction failed:', error);
      showErrorModal(error, isRetryable, retryTransaction);
    },
  })

  // New specialized hook for Magma auto-wrap supply
  const { 
    executeSupply: executeMagmaSupply, 
    isLoading: isMagmaSupplyLoading, 
    step: magmaSupplyStep, 
    reset: resetMagmaSupply,
    supplyHash: magmaSupplyHash,
    statusMessage: magmaStatusMessage,
  } = useMagmaBoostedSupplyTransaction({
    assetId: asset.id,
    amount,
    useNative,
    onSuccess: () => {
      const amountNum = parseFloat(amount);
      if (!isNaN(amountNum) && amountNum > 0) {
        onTransaction(asset, amountNum, "supply");
      }
      setAmount("");
      setShowConfirmation(true);
      setTimeout(() => setShowConfirmation(false), 3000);
      resetMagmaSupply();
    },
    onError: (error) => {
      console.error("Magma supply error:", error)
      showErrorModal(error as Error)
    }
  })

  const {
    executeSupply: stellarExecuteSupply,
    isLoading: isStellarSupplyLoading,
  } = useStellarSupplyTransaction({
    assetId: asset.id,
    amount,
    onSuccess: () => {
      const amountNum = parseFloat(amount)
      if (!isNaN(amountNum) && amountNum > 0) onTransaction(asset, amountNum, "supply")
      setAmount("")
      setShowConfirmation(true)
      setTimeout(() => setShowConfirmation(false), 3000)
    },
    onError: (e) => showErrorModal(e as Error),
  })

  const {
    executeBorrow: stellarExecuteBorrow,
    isLoading: isStellarBorrowLoading,
    canBorrow: canStellarBorrow,
    error: stellarBorrowError,
    step: stellarBorrowStep,
    statusMessage: stellarBorrowStatusMessage,
    borrowHash: stellarBorrowHash,
    reset: resetStellarBorrow,
  } = useStellarBorrowTransaction({
    assetId: asset.id,
    amount,
    onSuccess: () => {
      const amountNum = parseFloat(amount)
      if (!isNaN(amountNum) && amountNum > 0) {
        onTransaction(asset, amountNum, "borrow")
      }
      setAmount("")
      setConfirmationMessage(`Successfully borrowed ${amount} ${asset.symbol}!`)
      setShowConfirmation(true)
      setTimeout(() => setShowConfirmation(false), 3000)
      resetStellarBorrow()
    },
    onError: (e) => showErrorModal(e as Error),
  })

  const {
    executeRedeem: stellarExecuteRedeem,
    isLoading: isStellarRedeemLoading,
    canRedeem: canStellarRedeem,
    error: stellarRedeemError,
    step: stellarRedeemStep,
    statusMessage: stellarRedeemStatusMessage,
    redeemHash: stellarRedeemHash,
    reset: resetStellarRedeem,
  } = useStellarRedeemTransaction({
    assetId: asset.id,
    amount,
    onSuccess: () => {
      const amountNum = parseFloat(amount)
      if (!isNaN(amountNum) && amountNum > 0) {
        onTransaction(asset, amountNum, "supply")
      }
      setAmount("")
      setConfirmationMessage(`Successfully withdrew ${amount} ${asset.symbol}!`)
      setShowConfirmation(true)
      setTimeout(() => setShowConfirmation(false), 3000)
      setRedeemOverride(null)
      resetStellarRedeem()
    },
    onError: (e) => showErrorModal(e as Error),
  })
  // Cross-chain pending HUD
  const renderCrossChainPending = () => {
    if (!isAxelarAsset) return null
    if (!supplyHash) return null
    if (step !== 'success') return null // local-chain success reached; cross-chain may still be pending
    const statusText = crossChainStatus === 'executed' ? 'Executed on destination' : crossChainStatus === 'failed' ? 'Execution failed' : crossChainStatus === 'refunded' ? 'Gas refunded' : 'Pending cross-chain execution'
    const lastPolledAgoSec = crossChainLastPoll?.at ? Math.max(0, Math.floor((Date.now() - crossChainLastPoll.at) / 1000)) : null
    return (
      <div className="rounded-md border p-3 text-sm">
        <div className="font-medium">{statusText}</div>
        {crossChainLastPoll?.simplified && (
          <div className="text-xs opacity-80 mt-0.5">Axelar status: {crossChainLastPoll.simplified}{lastPolledAgoSec !== null ? ` • polled ${lastPolledAgoSec}s ago` : ''}</div>
        )}
        {crossChainLastPoll?.messageId && (
          <div className="text-xs opacity-80">Message ID: {crossChainLastPoll.messageId}</div>
        )}

      </div>
    )
  }

  // Minimal Biconomy retry block (shown after local success when a tracking URL exists)
  const renderBiconomyRetry = () => {
    const isBiconomyPath = !isBsc && Boolean(biconomyTrackingUrl)
    if (!isBiconomyPath) return null
    if (step !== 'success') return null
    return (
      <div className="rounded-md border p-3 text-sm mt-2">
        <div className="font-medium">Cross-chain execution</div>
        <div className="text-xs opacity-80 mt-0.5">
          Track status: {biconomyTrackingUrl ? (
            <a href={biconomyTrackingUrl} target="_blank" rel="noreferrer" className="underline">Open in explorer</a>
          ) : 'N/A'}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => retryCrossChain?.()}
            className="px-3 py-1.5 rounded-md border hover:bg-muted"
          >
            Retry cross-chain
          </button>
        </div>
      </div>
    )
  }



  // Removed Biconomy dialog logic - now using unified TxFeedbackDialog

  // Get user's borrow balance for this asset
  const {
    formattedBalance: borrowBalance,
    isLoading: isBorrowBalanceLoading,
    hasBorrow,
    numericBalance: borrowBalanceNumeric,
    rawBorrowBalance, // Add this to get the raw bigint value
  } = useBorrowBalance({
    assetId: asset.id,
    })

  // Get borrowing power information
  const { getMaxBorrowAmount, isBorrowAmountSafe, borrowingPower, getHypotheticalBorrowUtilization, refetch: refetchBorrowingPower } = useBorrowingPower()

  // Get user's pToken balance for redeeming
  const {
    pTokenBalance,
    underlyingBalance,
    formattedBalance: formattedUnderlyingBalance,
    decimals: underlyingDecimals,
    pTokenDecimals,
    isLoading: isPTokenBalanceLoading,
    hasBalance: hasSuppliedBalance,
    refetch: refetchPTokenBalance,
  } = usePTokenBalance({
    assetId: asset.id,
  })

  const effectiveBorrowDecimals = useStellarTxs ? (stellarDecimals ?? 7) : underlyingDecimals
  const effectiveBorrowBalanceRaw = useStellarTxs
    ? stellarBorrowMetrics.borrowBalanceRaw
    : (rawBorrowBalance ?? BigInt(0))
  const effectiveBorrowBalanceNumeric = useStellarTxs
    ? stellarBorrowMetrics.borrowBalanceAmount
    : (Number.isFinite(borrowBalanceNumeric) ? borrowBalanceNumeric : 0)
  const effectiveBorrowBalanceDisplay = useMemo(() => {
    if (!useStellarTxs) return borrowBalance
    const dec = effectiveBorrowDecimals ?? 7
    try {
      return formatUnits(effectiveBorrowBalanceRaw ?? BigInt(0), dec)
    } catch {
      return "0"
    }
  }, [useStellarTxs, effectiveBorrowDecimals, effectiveBorrowBalanceRaw, borrowBalance])
  const effectiveHasBorrow = useMemo(() => {
    if (!useStellarTxs) return hasBorrow
    return (effectiveBorrowBalanceRaw ?? BigInt(0)) > BigInt(0)
  }, [useStellarTxs, effectiveBorrowBalanceRaw, hasBorrow])

  // Get market membership (collateral status)
  const {
    isCollateralEnabled,
    isLoading: isMembershipLoading,
    refetch: refetchMembership,
  } = useMarketMembership({
    assetId: asset.id,
  })

  const stellarBorrowFetchInFlight = useRef(false)
  const stellarBorrowLastFetchAt = useRef(0)
  const stellarBorrowBackoffUntil = useRef(0)

  const fetchStellarBorrowMetrics = useCallback(async () => {
    if (!useStellarTxs || !stellarVaultId || !address || stellarDecimals == null) return
    const now = Date.now()
    if (stellarBorrowFetchInFlight.current) return
    if (now < stellarBorrowBackoffUntil.current) return
    if (now - stellarBorrowLastFetchAt.current < 1500) return
    stellarBorrowFetchInFlight.current = true
    stellarBorrowLastFetchAt.current = now
    const toBigIntSafe = (value: string) => {
      try {
        return BigInt(value)
      } catch {
        return BigInt(0)
      }
    }
    setStellarBorrowMetrics((prev) => ({ ...prev, isLoading: true }))
    try {
      const [previewRaw, availableRaw, totalBorrowedRaw, portfolioTotals, borrowBalanceRawStr] = await Promise.all([
        stellarPreviewBorrowMax(address, stellarVaultId),
        stellarGetAvailableLiquidity(stellarVaultId),
        stellarGetTotalBorrowed(stellarVaultId),
        stellarGetPortfolioTotals(address),
        stellarGetBorrowBalance(stellarVaultId, address),
      ])

      // null = the controller's liquidity loop could not run (compute budget).
      // Fall back to the market's liquidity so the form does not present an
      // unreadable limit as a limit of zero; the notice above says what to do.
      const preview = previewRaw === null ? null : toBigIntSafe(previewRaw)
      const available = toBigIntSafe(availableRaw)
      const totalBorrowed = toBigIntSafe(totalBorrowedRaw)
      const collateralUsdRaw = toBigIntSafe(portfolioTotals.collateralUsdRaw)
      const borrowedUsdRaw = toBigIntSafe(portfolioTotals.borrowUsdRaw)
      const borrowBalanceRaw = toBigIntSafe(borrowBalanceRawStr)

      const maxBorrowRaw = preview !== null && preview < available ? preview : available
      const marketDenominator = totalBorrowed + available
      const marketUtilization = marketDenominator > BigInt(0)
        ? Number((totalBorrowed * BigInt(10000)) / marketDenominator) / 100
        : 0

      const USD_SCALE = 1_000_000
      const collateralUsd = Number(collateralUsdRaw) / USD_SCALE
      const borrowedUsd = Number(borrowedUsdRaw) / USD_SCALE

      const borrowBalanceAmount = parseFloat(formatUnits(borrowBalanceRaw, stellarDecimals))
      setStellarBorrowMetrics({
        maxBorrowAmount: parseFloat(formatUnits(maxBorrowRaw, stellarDecimals)),
        availableLiquidityAmount: parseFloat(formatUnits(available, stellarDecimals)),
        marketUtilization,
        totalBorrowedAmount: parseFloat(formatUnits(totalBorrowed, stellarDecimals)),
        collateralUsd: Number.isFinite(collateralUsd) ? collateralUsd : 0,
        borrowedUsd: Number.isFinite(borrowedUsd) ? borrowedUsd : 0,
        borrowBalanceRaw,
        borrowBalanceAmount: Number.isFinite(borrowBalanceAmount) ? borrowBalanceAmount : 0,
        isLoading: false,
      })

      // Keep marketState meaningful on Stellar (used by availability/utilization cards).
      setMarketState((prev) => ({
        ...prev,
        cash: available,
        totalBorrows: totalBorrowed,
      }))
    } catch (err) {
      console.error("Failed to fetch Stellar borrow metrics:", err)
      const msg = String((err as any)?.message || err || '')
      const backoffMs = /INSUFFICIENT_RESOURCES/i.test(msg) ? 30000 : 15000
      stellarBorrowBackoffUntil.current = Date.now() + backoffMs
      setStellarBorrowMetrics((prev) => ({ ...prev, isLoading: false }))
    } finally {
      stellarBorrowFetchInFlight.current = false
    }
  }, [useStellarTxs, stellarVaultId, stellarDecimals, address])

  useEffect(() => {
    if (!useStellarTxs) return
    if (!address || !stellarVaultId || stellarDecimals == null) return
    if (!isOpen) return
    void fetchStellarBorrowMetrics()
    const interval = window.setInterval(() => {
      void fetchStellarBorrowMetrics()
    }, 15000)
    const onTxSuccess = () => { void fetchStellarBorrowMetrics() }
    window.addEventListener('peridot:tx-success', onTxSuccess as EventListener)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('peridot:tx-success', onTxSuccess as EventListener)
    }
  }, [useStellarTxs, address, stellarVaultId, stellarDecimals, isOpen, fetchStellarBorrowMetrics])

  const getEffectiveMaxBorrowAmount = useCallback((assetId: string): number => {
    if (useStellarTxs && assetId === asset.id) {
      return Math.max(0, stellarBorrowMetrics.maxBorrowAmount)
    }
    return getMaxBorrowAmount(assetId)
  }, [useStellarTxs, asset.id, stellarBorrowMetrics.maxBorrowAmount, getMaxBorrowAmount])

  const isEffectiveBorrowAmountSafe = useCallback((assetId: string, amountToBorrow: number): boolean => {
    if (useStellarTxs && assetId === asset.id) {
      return amountToBorrow <= Math.max(0, stellarBorrowMetrics.maxBorrowAmount)
    }
    return isBorrowAmountSafe(assetId, amountToBorrow)
  }, [useStellarTxs, asset.id, stellarBorrowMetrics.maxBorrowAmount, isBorrowAmountSafe])

  const getEffectiveHypotheticalBorrowUtilization = useCallback((assetId: string, amountToBorrow: number): number => {
    if (useStellarTxs && assetId === asset.id) {
      const collateralUsd = Math.max(stellarBorrowMetrics.collateralUsd, 0)
      const borrowedUsd = Math.max(stellarBorrowMetrics.borrowedUsd, 0)
      const price = realOraclePrice && realOraclePrice > 0 ? realOraclePrice : (asset.oraclePrice || asset.price || 0)
      const additionalBorrowUsd = Math.max(0, amountToBorrow) * Math.max(0, price)
      const denominator = Math.max(collateralUsd, borrowedUsd, 0.000001)
      const utilization = ((borrowedUsd + additionalBorrowUsd) / denominator) * 100
      return Math.min(Math.max(utilization, 0), 100)
    }
    return getHypotheticalBorrowUtilization(assetId, amountToBorrow)
  }, [
    useStellarTxs,
    asset.id,
    asset.oraclePrice,
    asset.price,
    realOraclePrice,
    stellarBorrowMetrics.collateralUsd,
    stellarBorrowMetrics.borrowedUsd,
    getHypotheticalBorrowUtilization,
  ])

  const borrowingPowerForBorrowCard = useMemo(() => {
    if (!useStellarTxs) return borrowingPower
    return {
      ...borrowingPower,
      totalBorrowedUSD: Math.max(stellarBorrowMetrics.borrowedUsd, 0),
      totalBorrowingPowerUSD: Math.max(stellarBorrowMetrics.collateralUsd, 0),
      availableBorrowingPowerUSD: Math.max(stellarBorrowMetrics.collateralUsd - stellarBorrowMetrics.borrowedUsd, 0),
      collateralUtilization: getEffectiveHypotheticalBorrowUtilization(asset.id, 0),
    }
  }, [
    useStellarTxs,
    borrowingPower,
    stellarBorrowMetrics.borrowedUsd,
    stellarBorrowMetrics.collateralUsd,
    getEffectiveHypotheticalBorrowUtilization,
    asset.id,
  ])

  const hasOtherEnabledCollateral = useMemo(
    () => borrowingPower.collateralAssets.some((collateralAsset) => collateralAsset.assetId !== asset.id && collateralAsset.borrowingPowerUSD > 0),
    [borrowingPower.collateralAssets, asset.id]
  )
  const showCollateralNudge = !isCollateralEnabled && hasSuppliedBalance && !hasOtherEnabledCollateral
  const showCollateralOptional = !isCollateralEnabled && hasSuppliedBalance && hasOtherEnabledCollateral
  const stellarExitBlockedByBalance = useStellarTxs && (hasSuppliedBalance || effectiveHasBorrow)

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
      // Add small delay to ensure transaction is confirmed before refetching
      setTimeout(() => {
        refetchMembership?.()
        refetchBorrowingPower?.()
      }, 1000)
    },
    onError: (error) => {
      console.error('Enter market failed:', error)
      showErrorModal(error);
    },
  })

  // Manual exit market hook (for disabling collateral)
  const {
    executeExitMarket,
    isLoading: isExitingMarket,
    step: exitMarketStep,
    statusMessage: exitMarketStatusMessage,
    error: exitMarketError,
  } = useExitMarket({
    assetId: asset.id,
    onSuccess: () => {
      console.log('Successfully exited market for', asset.symbol)
      // Add small delay to ensure transaction is confirmed before refetching
      setTimeout(() => {
        refetchMembership?.()
        refetchBorrowingPower?.()
      }, 1000)
    },
    onError: (error) => {
      console.error('Exit market failed:', error)
      showErrorModal(error);
    },
  })

  // Cross-chain enable (Biconomy) minimal integration, mirrors supply dialog state
  const {
    executeEnableCollateral,
    step: enableStep,
    statusMessage: enableStatusMessage,
    enterHash: enableHash,
    crossChainStatus: enableCrossChainStatus,
    biconomyTrackingUrl: enableBiconomyTrackingUrl,
    biconomyExplorerLinks: enableBiconomyExplorerLinks,
    biconomyBscTxHash: enableBiconomyBscTxHash,
    biconomyFee: enableBiconomyFee,
    biconomyFeeDetails: enableBiconomyFeeDetails,
    biconomyMeeLink: enableBiconomyMeeLink,
  } = useEnableCollateralTransaction({ assetId: asset.id })

  // Refetch membership when cross-chain enable succeeds
  useEffect(() => {
    if (enableStep === 'success') {
      refetchMembership?.()
    }
  }, [enableStep, refetchMembership])

  // Ensure wallet balance reflects recent approvals/transfers
  useWalletBalanceTxRefresh(refetchWallet)

  // Refetch wallet balance when the dropdown opens and when switching to Supply tab
  useEffect(() => {
    if (isOpen && isConnected) {
      Promise.resolve(refetchWallet?.()).catch(() => {})
      setTimeout(() => Promise.resolve(refetchWallet?.()).catch(() => {}), 800)
    }
  }, [isOpen, isConnected, asset.id])

  useEffect(() => {
    if (!isOpen) return
    if (!isConnected) return
    if (activeTab === 'supply') {
      try { refetchWallet?.() } catch {}
    }
  }, [activeTab, isOpen, isConnected])

  // Get APY rates from database with blockchain fallback
  const { 
    supplyApy: liveSupplyApy, 
    borrowApy: liveBorrowApy, 
    peridotSupplyApy,
    peridotBorrowApy,
    totalSupplyApy,
    netBorrowApy,
    isLoading: isApyLoading, 
    error: apyError,
  } = useHybridApy({ 
    assetId: asset.id,
    chainId: effectiveReadChainId ?? null,
  })

  const isBoosted = asset.category === 'boosted'
  const boostedType = isBoosted
    ? asset.id.endsWith('-stellar')
      ? 'defindex'
      : asset.id.includes('morpho')
        ? 'morpho'
        : asset.id.includes('magma')
          ? 'magma'
          : 'pancake'
    : null
  const boostedAPR = useBoostedAPR({
    assetId: asset.id,
    chainId: effectiveReadChainId ?? undefined,
    boostType: boostedType as 'morpho' | 'pancake' | 'magma' | 'defindex'
  })

  // Get boosted position values
  const {
    underlyingValue: boostedUnderlyingValue,
    usdValue: boostedUsdValue,
    isLoading: isBoostedPositionLoading,
  } = useBoostedPosition({
    assetId: asset.id,
    chainId: effectiveReadChainId ?? undefined,
  })

  // Add rewards hook
  const {
    accruedRewards,
    isLoadingAccruedRewards,
    claimRewards,
    isClaiming,
    isClaimed,
    isClaimError,
    claimError,
    refetchAccruedRewards,
  } = usePeridotRewards()

  // Market data (totalBorrows, getCash, totalReserves) now comes from batched call above
  // All individual useReadContract calls have been replaced with single batched call
  
  // Create refetch functions for backward compatibility with existing code
  const refetchTotalBorrows = refetchBatchedData;
  const refetchCash = refetchBatchedData;
  const refetchTotalReserves = refetchBatchedData;

  // Effect to update market data when connected
  useEffect(() => {
    if (useStellarTxs) return
    if (isConnected) {
      // Convert to BigInt, handling "0" as a valid value (not undefined)
      const newMarketState = {
        cash: cashData !== undefined && cashData !== null ? BigInt(cashData.toString()) : null,
        totalBorrows: totalBorrowsData !== undefined && totalBorrowsData !== null ? BigInt(totalBorrowsData.toString()) : null,
        totalReserves: totalReservesData !== undefined && totalReservesData !== null ? BigInt(totalReservesData.toString()) : null,
        liquidationIncentiveMantissa: liquidationIncentiveMantissaData !== undefined && liquidationIncentiveMantissaData !== null ? BigInt(liquidationIncentiveMantissaData.toString()) : null,
      };
      
      setMarketState(newMarketState);
    }
  }, [useStellarTxs, isConnected, cashData, totalBorrowsData, totalReservesData, liquidationIncentiveMantissaData]);

  // Scoped bursty refetch of market reads on tx events while dropdown is open
  useEffect(() => {
    if (!isOpen) return
    const timeoutIds: any[] = []
    const burst = () => {
      try { refetchCash?.() } catch {}
      try { refetchTotalBorrows?.() } catch {}
      try { refetchTotalReserves?.() } catch {}
      try { const t1 = setTimeout(() => { refetchCash?.().catch(() => {}) }, 800); timeoutIds.push(t1) } catch {}
      try { const t2 = setTimeout(() => { refetchTotalBorrows?.().catch(() => {}) }, 800); timeoutIds.push(t2) } catch {}
      try { const t3 = setTimeout(() => { refetchTotalReserves?.().catch(() => {}) }, 800); timeoutIds.push(t3) } catch {}
      try { const t4 = setTimeout(() => { refetchCash?.().catch(() => {}) }, 3000); timeoutIds.push(t4) } catch {}
      try { const t5 = setTimeout(() => { refetchTotalBorrows?.().catch(() => {}) }, 3000); timeoutIds.push(t5) } catch {}
      try { const t6 = setTimeout(() => { refetchTotalReserves?.().catch(() => {}) }, 3000); timeoutIds.push(t6) } catch {}
    }
    const onTxSuccess = (ev?: any) => {
      try {
        const id = String((ev as CustomEvent)?.detail?.assetId || '')
        if (id && id !== asset.id) return
      } catch {}
      burst()
    }
    const onBiconomyPhase = (e: any) => {
      try {
        const phase = e?.detail?.phase
        if (phase === 'execute-ok') {
          burst()
          const t7 = setTimeout(() => { try { burst() } catch {} }, 7000)
          try { timeoutIds.push(t7) } catch {}
        }
      } catch {}
    }
    try { window.addEventListener('peridot:tx-success' as any, onTxSuccess) } catch {}
    try { window.addEventListener('peridot:biconomy-phase' as any, onBiconomyPhase) } catch {}
    return () => {
      try { window.removeEventListener('peridot:tx-success' as any, onTxSuccess) } catch {}
      try { window.removeEventListener('peridot:biconomy-phase' as any, onBiconomyPhase) } catch {}
      try { timeoutIds.forEach((id) => { try { clearTimeout(id) } catch {} }) } catch {}
    }
  }, [isOpen, refetchCash, refetchTotalBorrows, refetchTotalReserves, asset.id])

  // Scoped bursty refetch of market reads on tx events while dropdown is open
  useEffect(() => {
    if (!isOpen) return
    const timeoutIds: any[] = []
    const burst = () => {
      try { refetchCash?.() } catch {}
      try { refetchTotalBorrows?.() } catch {}
      try { refetchTotalReserves?.() } catch {}
      try { const t1 = setTimeout(() => { refetchCash?.().catch(() => {}) }, 800); timeoutIds.push(t1) } catch {}
      try { const t2 = setTimeout(() => { refetchTotalBorrows?.().catch(() => {}) }, 800); timeoutIds.push(t2) } catch {}
      try { const t3 = setTimeout(() => { refetchTotalReserves?.().catch(() => {}) }, 800); timeoutIds.push(t3) } catch {}
      try { const t4 = setTimeout(() => { refetchCash?.().catch(() => {}) }, 3000); timeoutIds.push(t4) } catch {}
      try { const t5 = setTimeout(() => { refetchTotalBorrows?.().catch(() => {}) }, 3000); timeoutIds.push(t5) } catch {}
      try { const t6 = setTimeout(() => { refetchTotalReserves?.().catch(() => {}) }, 3000); timeoutIds.push(t6) } catch {}
    }
    const onTxSuccess = (ev?: any) => {
      try {
        const id = String((ev as CustomEvent)?.detail?.assetId || '')
        if (id && id !== asset.id) return
      } catch {}
      burst()
    }
    const onBiconomyPhase = (e: any) => {
      try {
        const phase = e?.detail?.phase
        if (phase === 'execute-ok') {
          burst()
          const t7 = setTimeout(() => { try { burst() } catch {} }, 7000)
          try { timeoutIds.push(t7) } catch {}
        }
      } catch {}
    }
    try { window.addEventListener('peridot:tx-success' as any, onTxSuccess) } catch {}
    try { window.addEventListener('peridot:biconomy-phase' as any, onBiconomyPhase) } catch {}
    return () => {
      try { window.removeEventListener('peridot:tx-success' as any, onTxSuccess) } catch {}
      try { window.removeEventListener('peridot:biconomy-phase' as any, onBiconomyPhase) } catch {}
      try { timeoutIds.forEach((id) => { try { clearTimeout(id) } catch {} }) } catch {}
    }
  }, [isOpen, refetchCash, refetchTotalBorrows, refetchTotalReserves, asset.id])

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
    biconomyTrackingUrl: repayBiconomyTrackingUrl,
    biconomyFee: repayBiconomyFee,
    biconomyFeeDetails: repayBiconomyFeeDetails,
    biconomyMeeLink: repayBiconomyMeeLink,
    needsApproval: needsRepayApproval,
  } = useRepayTransaction({
    assetId: asset.id,
    amount: amount,
    repayMax: repayMax,
    onSuccess: () => {
      const amountNum = parseFloat(amount);
      if (!isNaN(amountNum) && amountNum > 0) {
        onTransaction(asset, amountNum, "borrow");
      }
      setAmount("");
      setShowConfirmation(true);
      setTimeout(() => setShowConfirmation(false), 3000);
      resetRepay();
      setRepayMax(false);
    },
    onError: (error) => {
      console.error('Repay transaction failed:', error);
      showErrorModal(error);
      setRepayMax(false);
    },
  })

  const {
    executeRepay: stellarExecuteRepay,
    isLoading: isStellarRepayLoading,
    error: stellarRepayError,
    canRepay: canStellarRepay,
    reset: resetStellarRepay,
    step: stellarRepayStep,
    statusMessage: stellarRepayStatusMessage,
    repayHash: stellarRepayHash,
  } = useStellarRepayTransaction({
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
      resetStellarRepay();
      setRepayMax(false);
    },
    onError: (error) => {
      console.error('Stellar repay transaction failed:', error);
      showErrorModal(error);
      setRepayMax(false);
    },
  })

  const effectiveNeedsRepayApproval = useStellarTxs ? false : (needsRepayApproval ?? false)
  const effectiveCanRepay = useStellarTxs ? canStellarRepay : canRepay
  const effectiveIsRepayLoading = useStellarTxs ? isStellarRepayLoading : isRepayLoading
  const effectiveRepayError = useStellarTxs ? stellarRepayError : repayError
  const effectiveRepayStatusMessage = useStellarTxs ? stellarRepayStatusMessage : repayStatusMessage
  const effectiveRepayStep = useStellarTxs ? stellarRepayStep : repayStep
  const effectiveRepayHash = useStellarTxs ? stellarRepayHash : (repayHash || repayApproveHash)

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
    overrideFunctionName: redeemOverride?.fn,
    overrideRawAmount: redeemOverride?.amount,
    onSuccess: () => {
      const amountNum = parseFloat(amount);
      if (!isNaN(amountNum) && amountNum > 0) {
        onTransaction(asset, amountNum, "supply");
      }
      setAmount("");
      setRedeemOverride(null);
      setConfirmationMessage(`Successfully withdrew ${amount} ${asset.symbol}!`);
      setShowConfirmation(true);
      setTimeout(() => setShowConfirmation(false), 3000);
      resetRedeem();
    },
    onError: (error) => {
      const msg = String((error as any)?.message || '')
      // Suppress modal for transient rate limit; hook already shows toasts and fallback
      if (/rate limited|rate\s*limit/i.test(msg)) {
        console.warn('Withdraw rate-limited; suppressing modal and relying on toast/fallback.')
        return
      }
      console.error('Withdraw transaction failed:', error);
      showErrorModal(error);
    },
  })

  // Determine transaction type and fee mode for fee estimation
  const feeEstimateTransactionType = useMemo(() => {
    if (activeTab === 'supply') return 'supply' as const
    if (activeTab === 'borrow') return 'borrow' as const
    if (activeTab === 'manage') {
      return manageAction === 'repay' ? 'repay' as const : 'withdraw' as const
    }
    return 'supply' as const
  }, [activeTab, manageAction])

  const feeEstimateFeeMode = useMemo(() => {
    if (activeTab === 'borrow') return borrowFeeMode
    if (activeTab === 'manage' && manageAction === 'withdraw') return borrowFeeMode // Reuse borrow fee mode for withdraw
    return 'native' as const
  }, [activeTab, manageAction, borrowFeeMode])

  // Get fee estimation (after all transaction hooks are initialized)
  const feeEstimate = useTransactionFeeEstimate({
    assetId: asset.id,
    amount: amount,
    transactionType: feeEstimateTransactionType,
    feeMode: feeEstimateFeeMode,
    biconomySponsored: borrowBiconomySponsored,
    destinationChainId: borrowDestinationChainId ?? undefined,
    needsApproval: (activeTab === 'supply' && (needsApproval ?? false)) || (activeTab === 'manage' && manageAction === 'repay' && effectiveNeedsRepayApproval),
  })

  // Calculate maximum safe withdrawal amount for this asset (returns wei and display string from same raw)
  const calculateMaxSafeWithdrawal = (): { safeWei: bigint, safeDisplay: string } => {
    // Find the asset in collateral assets to get its live value, as the prop `asset.oraclePrice` can be stale.
    const collateralAssetData = borrowingPower.collateralAssets.find(a => a.assetId === asset.id);
    const liveOraclePrice = collateralAssetData && collateralAssetData.suppliedBalance > 0
      ? collateralAssetData.suppliedValueUSD / collateralAssetData.suppliedBalance
      : asset.oraclePrice; // Fallback to prop price if not found

    if (!borrowingPower || !liveOraclePrice || liveOraclePrice <= 0) {
      return { safeWei: BigInt(0), safeDisplay: '0' }
    }
    
    const suppliedAmount = underlyingBalance && underlyingDecimals !== undefined
      ? parseFloat(formatUnits(underlyingBalance, underlyingDecimals))
      : 0;
    
    // If user has no debt, they can withdraw everything
    if (borrowingPower.totalBorrowedUSD <= 0) {
      if (underlyingDecimals == null) return { safeWei: BigInt(0), safeDisplay: '0' }
      const safeWei = underlyingBalance ?? BigInt(0)
      return { safeWei, safeDisplay: formatUnits(safeWei, underlyingDecimals) }
    }
    
    const collateralFactor = asset.maxLTV / 100
    
    // If this asset is not used as collateral (or has no collateral entry), user can withdraw their full supplied amount
    // as it doesn't affect their borrowing power since it was never relevant for safe borrowing in the first place.
    if (collateralFactor <= 0 || !collateralAssetData) {
      if (underlyingDecimals == null) return { safeWei: BigInt(0), safeDisplay: '0' }
      const safeWei = underlyingBalance ?? BigInt(0)
      return { safeWei, safeDisplay: formatUnits(safeWei, underlyingDecimals) }
    }
    
    // We need to determine the maximum value (in USD) that can be withdrawn from this specific asset
    // without causing the user's total collateral to fall below the required level for their debt.

    // Total collateral value is the sum of (suppliedValueUSD * collateralFactor) for all collateral assets.
    // This is totalBorrowingPowerUSD.
    const totalBorrowingPowerUSD = borrowingPower.totalBorrowingPowerUSD;
    const totalBorrowedUSD = borrowingPower.totalBorrowedUSD;

    // The value of this specific asset's contribution to the borrowing power is:
    const assetBorrowingPowerContribution = (collateralAssetData?.suppliedValueUSD || 0) * collateralFactor;

    // The maximum borrowing power the user can afford to lose is the difference between their total borrowing power and their current debt.
    const excessBorrowingPower = totalBorrowingPowerUSD - totalBorrowedUSD;

    // The maximum value of this asset's *borrowing power* that can be removed is this excess amount.
    // To find the underlying asset value that can be withdrawn, we divide by the collateral factor.
    const maxWithdrawableValueUSD = excessBorrowingPower / collateralFactor;

    // We also can't withdraw more than what's supplied for this asset.
    const suppliedValueUSD = collateralAssetData?.suppliedValueUSD || 0;
    
    // The final max withdrawable value is the minimum of what's safe for the portfolio and what's available in this asset.
    const finalMaxWithdrawUSD = Math.min(maxWithdrawableValueUSD, suppliedValueUSD);

    const maxWithdrawAmount = finalMaxWithdrawUSD / liveOraclePrice;
    const safeUnderlying = Math.min(maxWithdrawAmount, suppliedAmount)
    if (underlyingDecimals == null) return { safeWei: BigInt(0), safeDisplay: '0' }
    // Convert to wei consistently and floor to avoid overestimation without parseUnits on scientific notation
    const scale = Math.pow(10, Math.max(0, underlyingDecimals))
    const safeWei = BigInt(Math.floor(safeUnderlying * scale))
    return { safeWei, safeDisplay: formatUnits(safeWei, underlyingDecimals) }
  }

  const maxSafeWithdrawalData = calculateMaxSafeWithdrawal()

  const isBorrowingCapped = useMemo(() => {
    const borrowCap = borrowCapData as bigint | undefined;
    const totalBorrows = marketState.totalBorrows;

    // Disable borrowing only if a cap is set (non-zero) and total borrows exceed it.
    if (borrowCap && totalBorrows && borrowCap > BigInt(0)) {
      return totalBorrows >= borrowCap;
    }
    return false;
  }, [borrowCapData, marketState.totalBorrows]);

  // Real-time validation state
  const validationState = useMemo(() => {
    if (!isConnected) {
      return { isValid: false, errorMessage: 'Please connect your wallet first' };
    }
    
    if (!hasSmartContract && !isDemoMode) {
      return { isValid: false, errorMessage: 'Smart contracts for this asset are not available' };
    }

    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      return { isValid: false, errorMessage: null }; // Don't show error for empty/zero amounts
    }

    // Supply validation
    if (activeTab === 'supply') {
      if (effectiveBalanceNumeric !== undefined && amountNum > effectiveBalanceNumeric) {
        return { isValid: false, errorMessage: `Insufficient balance. You have ${effectiveBalanceFormatted} ${effectiveBalanceSymbol}` };
      }
    }

    // Borrow validation
    if (activeTab === 'borrow') {
      if (!useStellarTxs && isBorrowingCapped) {
        return { isValid: false, errorMessage: 'Market borrow cap reached. Borrowing is temporarily unavailable.' };
      }
      const maxBorrow = getEffectiveMaxBorrowAmount(asset.id);
      if (amountNum > maxBorrow) {
        return { isValid: false, errorMessage: `Amount exceeds borrowing limit. Max: ${maxBorrow.toFixed(4)} ${asset.symbol}` };
      }
      if (!isEffectiveBorrowAmountSafe(asset.id, amountNum)) {
        return { isValid: false, errorMessage: 'This amount may put your position at risk of liquidation' };
      }
      // Do not block borrowing just because this specific asset isn't collateral-enabled.
      // Borrowing power is computed across all enabled collateral assets already.
    }

    // Manage validation
    if (activeTab === 'manage') {
      if (manageAction === 'repay') {
        const borrowBalanceNum = useStellarTxs
          ? effectiveBorrowBalanceNumeric
          : (rawBorrowBalance && underlyingDecimals != null)
            ? parseFloat(formatUnits(rawBorrowBalance, underlyingDecimals))
            : (Number.isFinite(borrowBalanceNumeric) ? borrowBalanceNumeric : 0);
        const walletBalanceNum = walletBalanceNumeric || 0;
        if (!repayMax && amountNum > borrowBalanceNum) {
          return { isValid: false, errorMessage: `Amount exceeds borrowed balance: ${effectiveBorrowBalanceDisplay} ${asset.symbol}` };
        }
        if (amountNum > walletBalanceNum) {
          return { isValid: false, errorMessage: `Insufficient wallet balance to repay. You have ${walletBalance} ${asset.symbol}` };
        }
      } else if (manageAction === 'withdraw') {
        const suppliedWei = underlyingBalance ?? BigInt(0)
        const amountWei = (underlyingDecimals != null && amount)
          ? (() => { try { return parseUnits(amount, underlyingDecimals) } catch { return BigInt(0) } })()
          : BigInt(0)
        // Epsilon: max(1 wei, supplied/1e6)
        let epsilon = suppliedWei / BigInt(1000000)
        if (epsilon < BigInt(1)) epsilon = BigInt(1)
        if (amountWei > (suppliedWei + epsilon)) {
          return { isValid: false, errorMessage: `Amount exceeds supplied balance: ${formattedUnderlyingBalance} ${asset.symbol}` };
        }
        
        // CRITICAL FIX: Check market cash (available liquidity) before allowing withdrawal
        // Exchange rate gives theoretical value, but market can only provide cash
        const marketCash = marketState.cash ?? BigInt(0)
        if (marketCash > BigInt(0) && amountWei > (marketCash + epsilon)) {
          const cashDisplay = underlyingDecimals != null 
            ? formatUnits(marketCash, underlyingDecimals)
            : marketCash.toString()
          const cashDisplayRounded = (() => {
            const n = parseFloat(cashDisplay)
            return isFinite(n) ? (n < 0.0001 ? n.toFixed(8) : n.toFixed(4)) : cashDisplay
          })()
          return { 
            isValid: false, 
            errorMessage: `Amount exceeds available market liquidity. Market has ${cashDisplayRounded} ${asset.symbol} available (some funds are currently borrowed out).` 
          };
        }
        
        // If we're executing via pTokens override (true MAX), allow and let simulation/backoff cap safely
        const isPTokensOverride = redeemOverride && redeemOverride.fn === 'redeem'
        
        // Only apply collateral safety checks if this asset is actually used as collateral
        const collateralAssetData = borrowingPower.collateralAssets.find(a => a.assetId === asset.id);
        const isAssetUsedAsCollateral = collateralAssetData && (asset.maxLTV / 100) > 0;
        const exceedsSafe = isAssetUsedAsCollateral && underlyingDecimals != null 
          ? (amountWei > (maxSafeWithdrawalData.safeWei + epsilon)) 
          : false;
          
        if (!isPTokensOverride && exceedsSafe) {
          const safeDisplayRounded = (() => {
            const n = parseFloat(maxSafeWithdrawalData.safeDisplay || '0')
            return isFinite(n) ? n.toFixed(4) : '0.0000'
          })()
          return { isValid: false, errorMessage: `Withdrawal would exceed safe limit (based on current collateral and price). Max safe: ${safeDisplayRounded} ${asset.symbol}` };
        }
      }
    }

    return { isValid: true, errorMessage: null };
  }, [
    isConnected, hasSmartContract, isDemoMode, amount, activeTab, 
    walletBalanceNumeric, walletBalance, asset.symbol, asset.id, 
    getEffectiveMaxBorrowAmount, isEffectiveBorrowAmountSafe, isCollateralEnabled, 
    hasSuppliedBalance, manageAction, borrowBalance, borrowBalanceNumeric, rawBorrowBalance,
    effectiveBorrowBalanceNumeric, effectiveBorrowBalanceDisplay,
    formattedUnderlyingBalance, maxSafeWithdrawalData, isBorrowingCapped,
    underlyingBalance, underlyingDecimals, marketState.cash, // Add market cash for liquidity check
    redeemOverride, // Add redeemOverride for pTokens override check
    useStellarTxs
  ]);

  // Quick amount suggestions with real wallet balance and borrowing power
  const getQuickAmounts = () => {
    if (activeTab === 'supply') {
      const balance = effectiveBalanceNumeric || 0;
      // MAX fills the whole balance for stablecoins; native XLM keeps a
      // reserve back for the account minimum + fees (see supplyMaxAmount).
      return [
        { label: "25%", value: balance * 0.25 },
        { label: "50%", value: balance * 0.5 },
        { label: "75%", value: balance * 0.75 },
        { label: "MAX", value: supplyMaxAmount(balance, asset.id) },
      ];
    } else if (activeTab === 'borrow') {
      const maxBorrow = getEffectiveMaxBorrowAmount(asset.id);
      return [
        { label: "25%", value: maxBorrow * 0.25 },
        { label: "50%", value: maxBorrow * 0.5 },
        { label: "75%", value: maxBorrow * 0.75 },
        { label: "MAX", value: maxBorrow },
      ];
    } else if (activeTab === 'manage') {
      if (manageAction === 'withdraw' && hasSuppliedBalance) {
        // CRITICAL FIX: Cap MAX to market cash (available liquidity)
        // Exchange rate gives theoretical value, but market can only provide cash
        const theoreticalMax = underlyingBalance && underlyingDecimals 
          ? parseFloat(formatUnits(underlyingBalance as bigint, underlyingDecimals)) 
          : 0;
        const marketCash = marketState.cash && underlyingDecimals
          ? parseFloat(formatUnits(marketState.cash as bigint, underlyingDecimals))
          : null;
        // Use the minimum of theoretical max and available cash
        const maxRedeem = marketCash !== null && marketCash < theoreticalMax
          ? marketCash
          : theoreticalMax;
        return [
          { label: "25%", value: maxRedeem * 0.25 },
          { label: "50%", value: maxRedeem * 0.5 },
          { label: "75%", value: maxRedeem * 0.75 },
          { label: "MAX", value: maxRedeem, isMax: true },
        ];
      } else if (manageAction === 'repay' && effectiveHasBorrow) {
        const maxRepay = useStellarTxs
          ? Math.max(0, effectiveBorrowBalanceNumeric)
          : (rawBorrowBalance && underlyingDecimals != null)
            ? parseFloat(formatUnits(rawBorrowBalance, underlyingDecimals))
            : (Number.isFinite(borrowBalanceNumeric) ? borrowBalanceNumeric : 0);
        return [
          { label: '25%', value: maxRepay * 0.25 },
          { label: '50%', value: maxRepay * 0.5 },
          { label: '75%', value: maxRepay * 0.75 },
          { label: 'MAX', value: maxRepay }
        ]
      }
    }
    return []
  }

  const handleAction = () => {
    const amountNum = parseFloat(amount);
    playAction()

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
        if (useStellarTxs) {
          stellarExecuteSupply();
        } else if (boostedType === 'magma') {
          executeMagmaSupply();
        } else {
          executeSupply();
        }
        break;
      case 'borrow':
        if (!useStellarTxs && !allowBorrow) {
          showBorrowBlockedToast()
          return
        }
        if (useStellarTxs) {
          stellarExecuteBorrow()
        } else {
          executeBorrow()
        }
        break;
      case 'manage':
        // Use selected manage action
        if (manageAction === 'repay') {
          if (useStellarTxs) {
            stellarExecuteRepay();
          } else {
            executeRepay();
          }
        } else {
          if (!useStellarTxs && !allowWithdraw) {
            showWithdrawBlockedToast()
            return
          }
          if (useStellarTxs) {
            stellarExecuteRedeem()
          } else {
            executeRedeem()
          }
        }
        break;
    }
  }

  const handleMaxRepay = () => {
    // Use raw full-precision borrow amount for MAX (always fill full borrow)
    const borrowRaw = effectiveBorrowBalanceRaw ?? BigInt(0)
    if (effectiveBorrowDecimals !== undefined) {
      const fullBorrowStr = formatUnits(borrowRaw, effectiveBorrowDecimals)
      setAmount(fullBorrowStr)
      // Only use repayMax sentinel when wallet can cover full borrow
      const walletCovers = (walletBalanceNumeric || 0) >= parseFloat(fullBorrowStr)
      setRepayMax(walletCovers)
    } else {
      // Fallback
      const fullBorrowStr = effectiveBorrowBalanceRaw && effectiveBorrowDecimals
        ? formatUnits(effectiveBorrowBalanceRaw, effectiveBorrowDecimals)
        : '0'
      setAmount(fullBorrowStr)
      const walletCovers = (walletBalanceNumeric || 0) >= parseFloat(fullBorrowStr)
      setRepayMax(walletCovers)
    }
  };

  const handleMaxRedeem = async () => {
    // Sync refresh to align balances and borrowing power for consistent validation
    try { await refetchPTokenBalance?.() } catch {}
    try { await refetchBorrowingPower?.() } catch {}
    if (underlyingBalance && underlyingDecimals) {
      // CRITICAL FIX: Cap withdrawal to market cash (available liquidity)
      // The exchange rate gives theoretical value, but market can only provide what's in cash
      const marketCash = marketState.cash ?? BigInt(0)
      const maxWithdrawableUnderlying = marketCash > BigInt(0) && underlyingBalance > marketCash
        ? marketCash - BigInt(1) // Leave 1 wei buffer
        : underlyingBalance > BigInt(0) 
          ? underlyingBalance - BigInt(1) // Standard 1 wei buffer
          : BigInt(0)
      
      // Display underlying units in the input
      const fullUnderlyingAmount = formatUnits(
        maxWithdrawableUnderlying,
        underlyingDecimals
      );
      setAmount(fullUnderlyingAmount);
      setRedeemType("underlying");
      
      // If cash is limiting, we need to calculate equivalent pTokens
      // exchangeRate = totalUnderlying / totalPTokens
      // So: pTokens = underlying / exchangeRate
      if (marketCash > BigInt(0) && underlyingBalance > marketCash && pTokenBalance) {
        // Calculate pToken amount that corresponds to available cash
        // We'll use redeemUnderlying with the capped amount
        setRedeemOverride({ fn: 'redeemUnderlying', amount: maxWithdrawableUnderlying });
      } else if (pTokenBalance) {
        // Normal case: use full pToken balance
        setRedeemOverride({ fn: 'redeem', amount: pTokenBalance });
      } else {
        // Fallback to redeemUnderlying with capped amount
        setRedeemOverride({ fn: 'redeemUnderlying', amount: maxWithdrawableUnderlying });
      }
    } else if (pTokenBalance && pTokenDecimals) {
      // Fallback: no underlying read, still redeem all pTokens
      const fullPTokenAmount = formatUnits(
        pTokenBalance,
        pTokenDecimals
      );
      setAmount(fullPTokenAmount);
      setRedeemType("pTokens");
      // Hook sim/backoff will cap if needed
      setRedeemOverride({ fn: 'redeem', amount: pTokenBalance });
    }
  };

  const getCurrentActionLoading = () => {
    switch (activeTab) {
      case 'supply': return useStellarTxs ? isStellarSupplyLoading : (boostedType === 'magma' ? isMagmaSupplyLoading : isSupplyLoading);
      case 'borrow': return useStellarTxs ? isStellarBorrowLoading : isBorrowLoading;
      case 'manage': return manageAction === 'repay' ? effectiveIsRepayLoading : (useStellarTxs ? isStellarRedeemLoading : isRedeemLoading);
      default: return false;
    }
  }

  const getCurrentActionError = () => {
    switch (activeTab) {
      case 'supply': return supplyError; // Errors are handled in hooks
      case 'borrow': return useStellarTxs ? stellarBorrowError : borrowError;
      case 'manage': return manageAction === 'repay' ? effectiveRepayError : (useStellarTxs ? stellarRedeemError : redeemError);
      default: return null;
    }
  }

  const getCurrentStatusMessage = () => {
    switch (activeTab) {
      case 'supply': return boostedType === 'magma' ? magmaStatusMessage : statusMessage;
      case 'borrow': return useStellarTxs ? stellarBorrowStatusMessage : borrowStatusMessage;
      case 'manage': return manageAction === 'repay' ? effectiveRepayStatusMessage : (useStellarTxs ? stellarRedeemStatusMessage : redeemStatusMessage);
      default: return null;
    }
  }

  const getCurrentStep = () => {
    switch (activeTab) {
      case 'supply': return boostedType === 'magma' ? magmaSupplyStep : step;
      case 'borrow': return useStellarTxs ? stellarBorrowStep : borrowStep;
      case 'manage': return manageAction === 'repay' ? effectiveRepayStep : (useStellarTxs ? stellarRedeemStep : redeemStep);
      default: return null;
    }
  }

  const getCurrentTransactionHash = () => {
    switch (activeTab) {
      case 'supply': return boostedType === 'magma' ? magmaSupplyHash : (supplyHash || approveHash);
      case 'borrow': return useStellarTxs ? stellarBorrowHash : borrowHash;
      case 'manage': return manageAction === 'repay' ? effectiveRepayHash : (useStellarTxs ? stellarRedeemHash : redeemHash);
      default: return null;
    }
  }



  // Derive underlying decimals from the effective chain config (hub for spoke reads)
  const displayUnderlyingDecimals = useMemo(() => {
    if (useStellarTxs && stellarDecimals != null) return stellarDecimals
    const cfg = effectiveChainConfig ?? chainConfig
    const addrs = effectiveAddresses ?? contractAddresses
    if (!cfg || !('markets' in (cfg as any))) return 18
    const markets = (cfg as any).markets as Record<string, any>
    const pTokenAddr = addrs?.pTokenAddress?.toLowerCase()
    const found = pTokenAddr ? Object.values(markets).find((m: any) => m.pToken?.toLowerCase?.() === pTokenAddr) as any : null
    return (found?.decimals as number) ?? 18
  }, [useStellarTxs, stellarDecimals, effectiveChainConfig, chainConfig, contractAddresses?.pTokenAddress, effectiveAddresses?.pTokenAddress])

  const marketLiquidity = useMemo(() => {
    if (!marketState.cash) return null

    try {
      const dec = displayUnderlyingDecimals ?? 18
      const numericLiquidity = parseFloat(formatUnits(marketState.cash as bigint, dec));

      // Handle invalid or extremely large values
      if (!isFinite(numericLiquidity) || numericLiquidity < 0 || numericLiquidity > 1e15) {
        return null;
      }

      if (numericLiquidity >= 1_000_000) {
        return `${(numericLiquidity / 1_000_000).toFixed(1)}M`;
      }
      if (numericLiquidity >= 1_000) {
        return `${(numericLiquidity / 1_000).toFixed(1)}K`;
      }
      return numericLiquidity.toFixed(2);
    } catch (error) {
      // Return null if calculation fails
      return null;
    }
  }, [marketState.cash, displayUnderlyingDecimals]);

  const utilizationRate = useMemo(() => {
    if (!marketState.totalBorrows || !marketState.cash) {
      return asset.utilizationRate === undefined ? 0 : Math.min(asset.utilizationRate, 100);
    }

    const totalBorrowsBI = BigInt(marketState.totalBorrows.toString());
    const cashBI = BigInt(marketState.cash.toString());

    // Align with backend formula: borrows / (borrows + cash)
    const denominator = cashBI + totalBorrowsBI;

    if (denominator === BigInt(0)) {
      return 0;
    }

    const rate = (totalBorrowsBI * BigInt(10000)) / denominator;
    const utilization = Number(rate) / 100;
    
    // Cap utilization at 100% to prevent display of values > 100%
    return Math.min(utilization, 100);
  }, [marketState.totalBorrows, marketState.cash, asset.utilizationRate]);

  const marketCap = useMemo(() => {
    // AdvancedMetricsCard now gets TVL data from database via props, so we can return null here
    return null;
  }, []);

  // Handle reward claim success
  useEffect(() => {
    if (isClaimed) {
      setConfirmationMessage("Rewards claimed successfully!")
      setShowConfirmation(true)
      setTimeout(() => setShowConfirmation(false), 3000)
      refetchAccruedRewards() // Refresh the accrued rewards
    }
  }, [isClaimed, refetchAccruedRewards])

  // Handle reward claim error
  useEffect(() => {
    if (isClaimError && claimError) {
      showErrorModal(claimError)
    }
  }, [isClaimError, claimError])

  const handleClaimRewards = () => {
    if (!isConnected || !chainConfig) {
      console.error('Cannot claim rewards: not connected or no chain config')
      return
    }
    
    console.log('Claiming rewards with simple method:', {
      chainId: chainId,
      userAddress: address,
      accruedRewards: accruedRewards?.toString(),
    })
    
    // Use the simple claimPeridot(address holder) function
    // This will claim from all markets automatically
    claimRewards()
  }

  if (asset.symbol === 'LINK') {
    console.log('[LINK DEBUG] Final realOraclePrice for LINK:', realOraclePrice);
  }
  if (!isOpen) return null;

  const toFixedDecimals = (value: number, decimals: number): string => {
    if (!Number.isFinite(value) || value <= 0) return ''
    const factor = Math.pow(10, Math.max(0, decimals))
    const clamped = Math.floor(value * factor) / factor
    // Avoid scientific notation by using toFixed up to decimals, then trim trailing zeros
    const s = clamped.toFixed(Math.min(18, Math.max(0, decimals)))
    return s.replace(/\.?(0+)$/, '')
  }

  const currentActionLoading = getCurrentActionLoading()
  const currentActionError = getCurrentActionError()
  const currentStepValue = getCurrentStep()
  const currentStatusMessage = getCurrentStatusMessage()
  const showTransactionError = Boolean(
    typeof currentActionError === 'string' &&
    currentStepValue === 'error' &&
    !currentActionLoading &&
    !validationState.errorMessage
  )

  const getTokenDecimalsForInput = (): number => {
    // Prefer underlying decimals for supply/withdraw and borrow
    if (activeTab === 'manage' && manageAction === 'repay' && walletDecimals != null) return walletDecimals as number
    if (activeTab === 'manage' && manageAction === 'withdraw' && underlyingDecimals != null) return underlyingDecimals as number
    if (activeTab === 'supply' && walletDecimals != null) return walletDecimals as number
    if (activeTab === 'borrow' && underlyingDecimals != null) return underlyingDecimals as number
    return 18
  }

  return (
    <TooltipProvider>
      <div
      className="relative overflow-hidden"
    >
      {/* Glassmorphism container */}
      <div className="relative backdrop-blur-xl bg-gradient-to-br from-white/5 via-white/2 to-transparent border-t border-white/10 shadow-2xl">
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-50" />
        
        {/* Content */}
        <div className="relative p-6 space-y-6">
          {/* Context strip — no repeated identity, only new info */}
          <div className="flex items-center justify-between gap-3 -mt-2 pb-1">
            {/* Left: collateral status + details link */}
            <div className="flex items-center gap-2 flex-wrap">
              {Boolean(hasSmartContract && isConnected && hasSuppliedBalance) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={cn(
                      "inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full cursor-default",
                      isCollateralEnabled
                        ? "bg-green-500/10 text-green-500"
                        : "bg-orange-500/10 text-orange-500"
                    )}>
                      {isCollateralEnabled ? "✓ Collateral" : "! No Collateral"}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[240px] text-xs">
                    {isCollateralEnabled
                      ? "Enabled as collateral — can be used to borrow other assets."
                      : "Not enabled as collateral. Enable it to borrow against this asset."}
                  </TooltipContent>
                </Tooltip>
              )}
              <Link
                href={`/app/markets/${asset.id}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
              >
                <BarChart3 className="w-3 h-3" />
                <span>Details</span>
              </Link>
            </div>

            {/* Right: Live price — clean, no glow */}
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/50 mb-0.5">
                Live Price
              </div>
              <div className="text-base font-bold font-mono text-foreground leading-tight">
                {(realOraclePrice && realOraclePrice > 0)
                  ? formatUsdPrice(realOraclePrice)
                  : <span className="animate-pulse text-sm text-muted-foreground/50">Fetching…</span>
                }
              </div>
            </div>
          </div>

          {/* Mint USDT Button for Somnia Testnet */}
          {isConnected && chainId === CHAIN_IDS.SOMNIA_TESTNET && asset.id === 'usdt' && (
            <div className="bg-background/40 border border-border/20 rounded-xl p-3 space-y-2">
              <div className="text-xs text-muted-foreground text-center">
                You can get USDT tokens by clicking the button below.
              </div>
              <Button
                type="button"
                onClick={handleMint}
                disabled={isMinting}
                className="w-full"
                variant="outline"
                size="sm"
              >
                {isMinting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-2" />
                    Minting...
                  </>
                ) : (
                  'Mint USDT'
                )}
              </Button>
            </div>
          )}

          {/* Advanced Metrics Card */}
          <AdvancedMetricsCard
            liquidity={marketLiquidity}
            utilization={utilizationRate}
            collateralFactor={mergedMarketMetrics?.[metricsKey]?.collateralFactorPct}
            isConnected={isConnected}
            serverTvl={mergedMarketMetrics?.[metricsKey]?.tvlUsd}
            serverUtilization={mergedMarketMetrics?.[metricsKey]?.utilizationPct}
            serverLiquidityUnderlying={mergedMarketMetrics?.[metricsKey]?.liquidityUnderlying}
            serverLiquidityUsd={mergedMarketMetrics?.[metricsKey]?.liquidityUsd}
            serverPriceUsd={mergedMarketMetrics?.[metricsKey]?.priceUsd}
          />


          {/* Enhanced Professional Tab Navigation */}
          <div className={cn(
            "flex rounded-2xl backdrop-blur-sm border p-0.5 sm:p-1 transition-all duration-300",
            "shadow-lg shadow-black/5",
            effectiveTheme === "light" 
              ? "bg-slate-100/80 border-slate-200/60" 
              : "bg-black/20 border-white/10"
          )}>
            {[
              { id: 'supply', label: 'Supply', icon: TrendingUp, color: 'text-green-500', disabled: supplyDisabledOnMonad },
              { id: 'borrow', label: 'Borrow', icon: TrendingDown, color: 'text-orange-500', disabled: asset.isBorrowable === false },
              { id: 'manage', label: effectiveHasBorrow ? 'Repay' : 'Withdraw', icon: Wallet, color: 'text-purple-500' }
            ].map((tab) => {
              if (tab.disabled) return null;
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    // Only show toast and block tab switch when wallet is connected and borrow is not allowed
                    // When wallet is not connected, allow viewing the tab for exploration
                    if (tab.id === 'borrow' && !allowBorrow && isConnected) {
                      showBorrowBlockedToast()
                      return
                    }
                    if (tab.id === 'manage') {
                      const withdrawOnly = hasSuppliedBalance && !effectiveHasBorrow
                      if (withdrawOnly && !useStellarTxs && !allowWithdraw) {
                        showWithdrawBlockedToast()
                        return
                      }
                    }

                    playThump()
                    setActiveTab(tab.id as ActionTab);
                    setAmount("");
                    setRepayMax(false);
                    // Set default manage action based on user position
                    if (tab.id === 'manage') {
                      if (effectiveHasBorrow && !hasSuppliedBalance) {
                        setManageAction('repay');
                      } else if (hasSuppliedBalance && !effectiveHasBorrow) {
                        setManageAction('withdraw');
                      } else if (effectiveHasBorrow && hasSuppliedBalance) {
                        // If both exist, prioritize repay since debt should be managed first
                        setManageAction('repay');
                      }
                    }
                  }}
                  className={cn(
                    "group flex-1 flex items-center justify-center gap-1 sm:gap-2",
                    "py-2.5 sm:py-3 px-1.5 sm:px-4 rounded-xl",
                    "text-xs sm:text-sm font-medium transition-all duration-300",
                    "touch-none select-none", // Better mobile interaction
                    "hover:scale-105 active:scale-95", // Pure CSS hover/tap animations
                    isActive ? (
                      effectiveTheme === "light"
                        ? "bg-white/90 backdrop-blur-md border border-white/60 shadow-lg shadow-slate-200/50 text-slate-800"
                        : "bg-white/15 backdrop-blur-md border border-white/20 shadow-lg shadow-black/20 text-white"
                    ) : (
                      effectiveTheme === "light"
                        ? "text-slate-600 hover:text-slate-800 hover:bg-white/50 active:bg-white/70"
                        : "text-muted-foreground hover:text-white hover:bg-white/8 active:bg-white/12"
                    )
                  )}
                >
                  <Icon className={cn(
                    "h-3.5 w-3.5 sm:h-4 sm:w-4 transition-colors duration-300",
                    isActive ? tab.color : ""
                  )} />
                  <span className="inline">{tab.label}</span>
                  
                  {/* Elegant notification indicator */}
                  {tab.id === 'manage' && (hasSuppliedBalance || effectiveHasBorrow) && (
                    <div 
                      className={cn(
                        "w-1.5 h-1.5 rounded-full animate-in zoom-in-50 duration-300",
                        effectiveTheme === "light" 
                          ? "bg-blue-500 shadow-sm shadow-blue-500/30" 
                          : "bg-blue-400 shadow-sm shadow-blue-400/50"
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Action content with smooth transitions */}
          <div
            key={activeTab}
            className="space-y-4 animate-in fade-in-0 slide-in-from-right-4 duration-200"
          >
              {/* Action-specific content */}
              {activeTab === 'supply' && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold mb-1">Supply {asset.symbol}</h3>
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-sm text-muted-foreground">Earn {isApyLoading ? 'Loading...' : (isBoosted ? (totalSupplyApy ?? 0) : (liveSupplyApy ?? 0)).toFixed(2)}% APY on your {asset.symbol}</p>
                      
                      {asset?.canAutoWrap && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/5 border border-primary/10 animate-in fade-in zoom-in-95 duration-300">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Use Native {asset.nativeSymbol}</span>
                          <input
                            type="checkbox"
                            checked={useNative}
                            onChange={(e) => setUseNative(e.target.checked)}
                            className="w-4 h-4 rounded-md accent-primary cursor-pointer transition-all"
                          />
                        </div>
                      )}
                    </div>

                    {/* Destination Chain Selector */}
                    {FEATURE_FLAGS.SHOW_SUPPLY_DESTINATION_SELECTOR && supplyDestinationOptions.length > 1 && (
                      <div className="mt-4 text-left max-w-xs mx-auto">
                         <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-1.5 text-center">Destination Network</label>
                         <Select
                            value={supplyDestinationChainId ? String(supplyDestinationChainId) : undefined}
                            onValueChange={(v) => setSupplyDestinationChainId(Number(v))}
                         >
                           <SelectTrigger className="w-full rounded-2xl h-14 px-4 bg-background/50 border-border/40 hover:border-border/60 transition-all">
                             <SelectValue placeholder="Select network" />
                           </SelectTrigger>
                           <SelectContent className="rounded-2xl border-border/40 bg-background/95 backdrop-blur-xl">
                             {supplyDestinationOptions.map(opt => (
                               <SelectItem key={opt.chainId} value={String(opt.chainId)} className="rounded-xl my-1 cursor-pointer">
                                 <div className="flex items-center justify-between w-full gap-4">
                                    <span className="font-medium">{opt.label}</span>
                                    {opt.apy !== undefined && (
                                      <span className="text-xs font-medium text-green-500 bg-green-500/10 px-2 py-0.5 rounded-lg">
                                        {(opt.apy ?? 0).toFixed(2)}% APY
                                      </span>
                                    )}
                                 </div>
                               </SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                      </div>
                    )}

                    {/* Cross-chain tracking now handled by unified TxFeedbackDialog */}

                  </div>
                </div>
              )}

              {activeTab === 'borrow' && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold mb-1">Borrow {asset.symbol}</h3>
                    <p className="text-sm text-muted-foreground">Borrow rate: {isApyLoading ? 'Loading...' : (liveBorrowApy ?? 0).toFixed(2)}% APY</p>
                  </div>
                  {FEATURE_FLAGS.SMART_ACCOUNT_UPGRADES && (
                    <div className="mt-1">
                      <BorrowAccountInfo accountType={accountType} eligibleForSponsored={eligibleForSponsored} reason={sponsoredReason} />
                    </div>
                  )}
                  {FEATURE_FLAGS.SMART_ACCOUNT_UPGRADES && (
                  <div className="flex justify-center">
                    <Button
                      size="sm"
                      variant={upgradeVariant}
                      disabled={upgradeDisabled}
                      onClick={openUpgradePrompt}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em]",
                        smartAccountStatus.isSmartAccount
                          ? effectiveTheme === "light"
                            ? "border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                          : effectiveTheme === "light"
                            ? "border-slate-200/70 bg-white/80 text-slate-700 hover:bg-white"
                            : "border-white/20 bg-white/10 text-white/80 hover:bg-white/15"
                      )}
                    >
                      {smartAccountStatus.isSmartAccount ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" /> {upgradeLabel}
                        </>
                      ) : (
                        <>
                          {isUpgradeInProgress ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                          {upgradeLabel}
                        </>
                      )}
                    </Button>
                  </div>
                  )}
                  {useStellarTxs && isConnected && (
                    <StellarBorrowSlotsNotice address={address ?? null} />
                  )}
                  {hasSmartContract && isConnected && (
                    <BorrowInfoCard
                      borrowingPower={borrowingPowerForBorrowCard}
                      getMaxBorrowAmount={getEffectiveMaxBorrowAmount}
                      asset={asset}
                      borrowCap={borrowCapData as bigint | null}
                      totalBorrows={marketState.totalBorrows}
                      underlyingDecimals={underlyingDecimals}
                      hypotheticalUtilization={getEffectiveHypotheticalBorrowUtilization(asset.id, parseFloat(amount || '0'))}
                      marketAvailableLiquidity={useStellarTxs ? stellarBorrowMetrics.availableLiquidityAmount : null}
                    />
                  )}
                  {FEATURE_FLAGS.MARKETS_DEBUG_TOOLBAR && FEATURE_FLAGS.CROSS_CHAIN_BORROW_BICONOMY && hasSmartContract && isConnected && borrowDestinationOptions.length > 0 && (
                    <div className="bg-background/40 border border-border/20 rounded-xl p-4 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold">Borrow route</div>
                          <div className="text-xs text-muted-foreground leading-relaxed">
                          {isCrossChainBorrow
                              ? `Fusion executes on BSC and delivers to ${selectedBorrowDestination?.label ?? 'your destination'}.`
                              : 'Fusion executes on BSC mainnet and sends funds directly to your wallet.'}
                          </div>
                        </div>
                        <div className={cn(
                          'px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border',
                          borrowBiconomyFundingMode === 'fallback'
                            ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                            : effectiveBorrowFeeMode === 'biconomy'
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                              : 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                        )}>
                          {borrowBiconomyFundingMode === 'fallback' && borrowBiconomySponsored
                            ? 'Biconomy fallback · Wallet Gas'
                            : borrowFeeMode === 'biconomy' && !borrowBiconomySponsored
                              ? 'Fusion · Wallet Fee'
                              : effectiveBorrowFeeMode === 'biconomy'
                                ? 'Fusion · Gasless'
                                : 'Wallet Gas · BSC'}
                        </div>
                      </div>

                      {crossChainSmartAccountNotice && (
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600">
                          {crossChainSmartAccountNotice}
                        </div>
                      )}
                      {hubSmartAccountNotice && (
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                          {hubSmartAccountNotice}
                        </div>
                      )}
                      {testnetSpokeNotice && (
                        <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-600">
                          {testnetSpokeNotice}
                        </div>
                      )}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground uppercase tracking-wide">Destination chain</div>
                          <Select
                            value={borrowDestinationChainId != null ? String(borrowDestinationChainId) : undefined}
                            onValueChange={(value) => {
                              playThump()
                              setBorrowDestinationChainId(Number(value))
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select chain" />
                            </SelectTrigger>
                            <SelectContent>
                              {borrowDestinationOptions.map((option) => (
                                <SelectItem key={option.chainId} value={String(option.chainId)}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground uppercase tracking-wide">Fee payment</div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={borrowFeeMode === 'biconomy' ? 'default' : 'outline'}
                              className="flex-1 justify-center"
                              onClick={() => {
                                playThump()
                                setBorrowFeeMode('biconomy')
                              }}
                            >
                              {smartAccountStatus?.isSmartAccount ? 'Fusion · Gasless' : 'Fusion · Wallet Fee'}
                            </Button>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={borrowFeeMode === 'native' ? 'default' : 'outline'}
                                    className={cn(
                                      'w-full justify-center',
                                      !nativeFeeOptionAvailable && 'opacity-50 cursor-not-allowed'
                                    )}
                                    disabled={!nativeFeeOptionAvailable || (!isBsc && smartAccountStatus?.isSmartAccount)}
                                    onClick={() => {
                                      if (!nativeFeeOptionAvailable) return
                                      if (!isBsc && smartAccountStatus?.isSmartAccount) {
                                        try {
                                          let toastId: any
                                          toastId = toast('Switch to Biconomy for cross-chain', {
                                            description: 'On non-BSC networks, use Biconomy (gasless) for a smoother experience without switching.',
                                            action: { label: 'Close', onClick: () => toast.dismiss(toastId) },
                                          })
                                        } catch {}
                                        return
                                      }
                                      playThump()
                                      setBorrowFeeMode('native')
                                    }}
                                  >
                                    Wallet gas
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {nativeFeeOptionAvailable
                                  ? 'Use your wallet gas on BSC for this borrow.'
                                  : 'Available when borrowing to BSC.'}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          {borrowFeeMode === 'biconomy' && !smartAccountStatus?.isSmartAccount && borrowFeeTokenOptions.length > 0 && (
                            <div className="pt-2 space-y-2">
                              <div className="text-xs text-muted-foreground uppercase tracking-wide">Fee token</div>
                              <Select
                                value={selectedBorrowFeeToken?.address ?? undefined}
                                onValueChange={(value) => selectBorrowFeeToken(value as Address)}
                                disabled={isBorrowFeeTokenBalanceLoading}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Choose token" />
                                </SelectTrigger>
                                <SelectContent>
                                  {borrowFeeTokenOptions.map((option) => (
                                    <SelectItem key={option.address} value={option.address}>
                                      {option.symbol}
                                      <span className="ml-2 text-xs text-muted-foreground">
                                        {formatBorrowFeeTokenPreview(option)}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <div className="text-[11px] text-muted-foreground leading-relaxed">
                                {selectedBorrowFeeTokenBalanceLabel}
                              </div>
                            </div>
                          )}
                          {borrowFeeMode === 'biconomy' && (
                            <div className="mt-3 flex items-center justify-between rounded-lg border border-border/20 bg-background/40 px-3 py-2">
                              <div className="mr-3 space-y-1">
                                {sponsoredTooltip ? (
                                  <Tooltip delayDuration={150}>
                                    <TooltipTrigger asChild>
                                      <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground cursor-help">
                                        Gas sponsorship
                                        <Info className="h-3 w-3 text-muted-foreground/70" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-xs leading-relaxed">
                                      {sponsoredTooltip}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gas sponsorship</div>
                                )}
                                <div className="text-xs text-muted-foreground/80">
                                  Enable to let Biconomy cover gas whenever sponsorship is available. Disable to pay fees from the borrowed amount instead.
                                </div>
                              </div>
                              <Switch
                                checked={borrowBiconomySponsored}
                                onCheckedChange={(value) => {
                                  playThump()
                                  setBorrowBiconomySponsored(value)
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                        <Info className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                        <span>
                          {borrowFeeMode === 'biconomy'
                            ? borrowBiconomyFundingMode === 'fallback' && borrowBiconomySponsored
                              ? 'Gasless sponsorship was unavailable, so this flow used wallet gas for execution.'
                              : borrowBiconomySponsored
                                ? (isCrossChainBorrow
                                    ? 'You will sign once on BSC; Biconomy sponsors execution and bridges the net amount to your chosen chain.'
                                    : 'You will sign once on BSC; Biconomy sponsors execution and any fee is deducted from the borrowed asset.')
                                : 'You will sign once on BSC; Biconomy will deduct execution fees from the borrowed asset instead of sponsoring gas.'
                            : 'You will submit a standard BSC transaction and pay gas from your wallet.'}
                          {' '}We will prompt you to switch to BSC before submitting the borrow.
                        </span>
                      </div>

                      {borrowBiconomyFundingMode === 'fallback' && borrowBiconomySponsored && (
                        <div className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                          Biconomy sponsorship was unavailable for the last attempt, so wallet gas was used. You can retry once sponsorship becomes available.
                        </div>
                      )}

                      {borrowFeeMode === 'biconomy' && borrowBiconomyExpectedNet && (
                        <div className="text-xs text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                          Estimated arrival: {borrowBiconomyExpectedNet} {asset.symbol}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Minimal fee selection when debug panel is hidden */}
                  {!FEATURE_FLAGS.MARKETS_DEBUG_TOOLBAR && FEATURE_FLAGS.CROSS_CHAIN_BORROW_BICONOMY && hasSmartContract && isConnected && (
                    <div className="bg-background/40 border border-border/20 rounded-xl p-4 space-y-3">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Fee payment</div>
                        <div className="flex flex-wrap gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={borrowFeeMode === 'biconomy' ? 'default' : 'outline'}
                                  className="w-full justify-center"
                                  onClick={() => {
                                    playThump()
                                    setBorrowFeeMode('biconomy')
                                  }}
                                >
                                  {smartAccountStatus?.isSmartAccount ? 'Fusion · Gasless' : 'Fusion · Wallet Fee'}
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {smartAccountStatus?.isSmartAccount
                                ? 'Biconomy covers gas when sponsorship is available.'
                                : 'Biconomy will use your selected fee token on BSC to cover execution.'}
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={borrowFeeMode === 'native' ? 'default' : 'outline'}
                                  className="w-full justify-center"
                                  disabled={!isBsc && smartAccountStatus?.isSmartAccount}
                                  onClick={() => {
                                    if (!isBsc && smartAccountStatus?.isSmartAccount) {
                                      try {
                                        let toastId: any
                                        toastId = toast('Wallet gas not available cross-chain', {
                                          description: 'On non-BSC networks, use Biconomy (gasless). We’ll avoid switching chains for you.',
                                          action: { label: 'Close', onClick: () => toast.dismiss(toastId) },
                                        })
                                      } catch {}
                                      return
                                    }
                                    playThump()
                                    setBorrowFeeMode('native')
                                  }}
                                >
                                  Wallet gas
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {!isBsc && smartAccountStatus?.isSmartAccount
                                ? 'Unavailable on this network. Use Biconomy (gasless) without switching.'
                                : 'Use your wallet gas on BSC for this action.'}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        {borrowFeeMode === 'biconomy' && !smartAccountStatus?.isSmartAccount && borrowFeeTokenOptions.length > 0 && (
                          <div className="pt-3 space-y-2">
                            <div className="text-xs text-muted-foreground uppercase tracking-wide">Fee token</div>
                            <Select
                              value={selectedBorrowFeeToken?.address ?? undefined}
                              onValueChange={(value) => selectBorrowFeeToken(value as Address)}
                              disabled={isBorrowFeeTokenBalanceLoading}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Choose token" />
                              </SelectTrigger>
                              <SelectContent>
                                {borrowFeeTokenOptions.map((option) => (
                                  <SelectItem key={option.address} value={option.address}>
                                    {option.symbol}
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      {formatBorrowFeeTokenPreview(option)}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="text-[11px] text-muted-foreground leading-relaxed">
                              {selectedBorrowFeeTokenBalanceLabel}
                            </div>
                          </div>
                        )}
                        {borrowFeeMode === 'biconomy' && (
                          <div className="mt-3 flex items-center justify-between rounded-lg border border-border/20 bg-background/40 px-3 py-2">
                            <div className="mr-3 space-y-1">
                              {sponsoredTooltip ? (
                                <Tooltip delayDuration={150}>
                                  <TooltipTrigger asChild>
                                    <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground cursor-help">
                                      Gas sponsorship
                                      <Info className="h-3 w-3 text-muted-foreground/70" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs text-xs leading-relaxed">
                                    {sponsoredTooltip}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gas sponsorship</div>
                              )}
                              <div className="text-xs text-muted-foreground/80">
                                Enable to let Biconomy cover gas whenever sponsorship is available. Disable to pay fees from the borrowed amount instead.
                              </div>
                            </div>
                            <Switch
                              checked={borrowBiconomySponsored}
                              onCheckedChange={(value) => {
                                playThump()
                                setBorrowBiconomySponsored(value)
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {hasSmartContract && isConnected && borrowingPower?.availableBorrowingPowerUSD > 0 && (
                      <div className="mt-2 space-y-1">
                       
                      </div>
                    )}
                    {Boolean(hasSmartContract && isConnected && showCollateralNudge) && (
                      <div className="mt-2 text-xs text-orange-600 bg-orange-500/10 border border-orange-500/20 rounded-lg p-2">
                        ⚠️ Enable {asset.symbol} as collateral to unlock borrowing power from this position.
                      </div>
                    )}
                    {Boolean(hasSmartContract && isConnected && showCollateralOptional) && (
                      <div className="mt-2 text-xs text-sky-500 bg-sky-500/10 border border-sky-500/20 rounded-lg p-2">
                        ℹ️ {asset.symbol} isn't marked as collateral yet. You can keep borrowing with your other collateral, or enable it to raise your limits further.
                      </div>
                    )}
                  </div>
                )}

              {activeTab === 'manage' && (
                <div className="space-y-4 sm:space-y-6">
                  {/* Withdraw fee selection (smart-account gated Biconomy) */}
                  {manageAction === 'withdraw' && hasSuppliedBalance && hasSmartContract && isConnected && (
                    <div className="bg-background/40 border border-border/20 rounded-xl p-3 sm:p-4 space-y-2">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Fee payment</div>
                      <div className="flex flex-wrap gap-2">
                        {smartAccountStatus?.isSmartAccount && (
                          <Button
                            type="button"
                            size="sm"
                            variant={borrowFeeMode === 'biconomy' ? 'default' : 'outline'}
                            className="flex-1 justify-center"
                            onClick={() => {
                              playThump()
                              setBorrowFeeMode('biconomy')
                            }}
                          >
                            Biconomy (gasless)
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant={borrowFeeMode === 'native' ? 'default' : 'outline'}
                          className="flex-1 justify-center"
                          disabled={!isBsc && smartAccountStatus?.isSmartAccount}
                          onClick={() => {
                            if (!isBsc && smartAccountStatus?.isSmartAccount) {
                              try {
                                let toastId: any
                                toastId = toast('Wallet gas not available cross-chain', {
                                  description: 'On non-BSC networks, use Biconomy (gasless). We’ll avoid switching chains for you.',
                                  action: { label: 'Close', onClick: () => toast.dismiss(toastId) },
                                })
                              } catch {}
                              return
                            }
                            playThump()
                            setBorrowFeeMode('native')
                          }}
                        >
                          Wallet gas (BSC)
                        </Button>
                      </div>
                      {borrowFeeMode === 'biconomy' && (
                        <div className="mt-2 sm:mt-3 flex items-center justify-between rounded-lg border border-border/20 bg-background/40 px-2 sm:px-3 py-2">
                          <div className="mr-2 sm:mr-3 space-y-0.5 sm:space-y-1 flex-1 min-w-0">
                            {sponsoredTooltip ? (
                              <Tooltip delayDuration={150}>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-1 text-[10px] sm:text-xs font-medium uppercase tracking-wide text-muted-foreground cursor-help">
                                    Gas sponsorship
                                    <Info className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-muted-foreground/70" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs leading-relaxed">
                                  {sponsoredTooltip}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <div className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-muted-foreground">Gas sponsorship</div>
                            )}
                            <div className="text-[10px] sm:text-xs text-muted-foreground/80 leading-relaxed">
                              Enable to let Biconomy cover gas whenever sponsorship is available. Disable to pay fees from the withdrawn amount instead.
                            </div>
                          </div>
                          <Switch
                            checked={borrowBiconomySponsored}
                            onCheckedChange={(value) => {
                              playThump()
                              setBorrowBiconomySponsored(value)
                            }}
                            className="flex-shrink-0"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {/* APY Breakdown Section */}
                  <div className="space-y-3 sm:space-y-4">
                     <h3 className="text-base sm:text-lg font-semibold text-center text-text/90 mb-1 sm:mb-2">Live APY Breakdown</h3>
                     {FEATURE_FLAGS.MARKETS_PROMO_BANNER && (() => {
                       const promo = MARKET_PROMOTIONS[asset.id] || MARKET_PROMOTIONS[asset.symbol]
                       return promo ? (
                         <div className="flex justify-center">
                           <AssetPromoBanner
                             label={promo.label}
                             tooltip={promo.tooltip}
                             rewardsApy={promo.rewardsApy ?? null}
                             variant={promo.variant}
                             glow={promo.glow}
                           />
                         </div>
                       ) : null
                     })()}
                     <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4">
                       {/* Supply APY */}
                       <div className="bg-background/40 p-2 sm:p-3 rounded-lg border border-border/20">
                         <h4 className="font-semibold text-sm sm:text-base mb-1 sm:mb-2 text-center">Supply APY</h4>
                         <div className="space-y-1">
                          <APYInfo
                            label={isBoosted ? "Lending APY" : "Base APY"}
                            value={`${(liveSupplyApy ?? 0).toFixed(2)}%`}
                            tooltip="Interest earned on deposits from borrowers."
                            isSubtle
                          />
                          {isBoosted && !boostedAPR.isLoading && (
                            <>
                              <APYInfo
                                label={
                                  boostedType === 'morpho'
                                    ? "Morpho Vault"
                                    : boostedType === 'defindex'
                                      ? "Blend via DeFindex"
                                      : "LP Fees"
                                }
                                value={`${(boostedAPR.breakdown.boostSource || 0).toFixed(2)}%`}
                                tooltip={
                                  boostedType === 'morpho'
                                    ? "Additional APR earned from the Morpho vault strategy."
                                    : boostedType === 'defindex'
                                      ? "Additional APR from a Peridot-owned DeFindex vault that auto-compounds yield on Blend Capital lending pools. Net of vault and protocol performance fees."
                                      : "Additional APR earned from PancakeSwap LP trading fees."
                                }
                                isSubtle
                              />
                              {boostedAPR.breakdown.rewards > 0 && (
                                <APYInfo
                                  label="Merkl Rewards"
                                  value={`${(boostedAPR.breakdown.rewards || 0).toFixed(2)}%`}
                                  tooltip="Extra incentives (claimable on Merkl). Click the button to claim your rewards."
                                  isSubtle
                                  actionButton={
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 w-5 p-0 hover:bg-primary/10"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        window.open('https://app.merkl.xyz/users/', '_blank', 'noopener,noreferrer')
                                      }}
                                      title="Claim rewards on Merkl (opens in new tab)"
                                    >
                                      <ExternalLink className="h-3 w-3 text-primary" />
                                    </Button>
                                  }
                                />
                              )}
                              <APYInfo
                                label="Total (with boosts)"
                                value={`${(
                                  (liveSupplyApy ?? 0) +
                                  (boostedAPR.breakdown.boostSource || 0) +
                                  (boostedAPR.breakdown.rewards || 0) +
                                  (!FEATURE_FLAGS.MARKETS_PROMO_BANNER ? (supplyRewardsApy || 0) : 0)
                                ).toFixed(2)}%`}
                                tooltip="Sum of lending APR + boosted sources + rewards (and Peridot rewards if enabled)."
                                isTotal
                              />
                            </>
                          )}
                          {!FEATURE_FLAGS.MARKETS_PROMO_BANNER && (
                            <APYInfo
                              label="PERIDOT Rewards"
                              value={`${(supplyRewardsApy || 0).toFixed(2)}%`}
                              tooltip="Additional rewards earned in PERIDOT tokens."
                              isSubtle
                            />
                          )}

                         </div>
                       </div>
                       
                       {/* Borrow APY */}
                       <div className="bg-background/40 p-2 sm:p-3 rounded-lg border border-border/20">
                         <h4 className="font-semibold text-sm sm:text-base mb-1 sm:mb-2 text-center">Borrow APY</h4>
                         <div className="space-y-1">
                           <APYInfo
                             label="Base APY"
                             value={`${(liveBorrowApy ?? 0).toFixed(2)}%`}
                             tooltip="Interest paid on loans."
                             isSubtle
                           />
                          {!FEATURE_FLAGS.MARKETS_PROMO_BANNER && (
                            <APYInfo
                              label="PERIDOT Rewards"
                              value={`${(borrowRewardsApy || 0).toFixed(2)}%`}
                              tooltip="Rewards earned for borrowing, which reduces your net cost."
                              isSubtle
                            />
                          )}

                         </div>
                       </div>

                       {/* Your Rewards */}
                       <div className="bg-background/40 p-2 sm:p-3 rounded-lg border border-border/20">
                         <h4 className="font-semibold text-sm sm:text-base mb-1 sm:mb-2 text-center">Your Rewards</h4>
                         <div className="space-y-2 sm:space-y-3">
                           <div className="text-center">
                             {isLoadingAccruedRewards ? (
                               <div className="flex items-center justify-center gap-2">
                                 <Loader2 size={16} className="animate-spin" />
                                 <span className="text-sm text-text/70">Loading...</span>
                               </div>
                             ) : (
                               <div>
                                 <div className="text-xs sm:text-sm text-text/70 mb-0.5 sm:mb-1">Total Claimable PERIDOT</div>
                                 <div className="font-bold text-base sm:text-lg">
                                   {accruedRewards ? 
                                     parseFloat(formatUnits(accruedRewards as bigint, 18)).toFixed(6) 
                                     : "0.000000"
                                   }
                                 </div>
                                 <div className="text-[10px] sm:text-xs text-text/60 mt-0.5 sm:mt-1">
                                   Across all markets
                                 </div>
                               </div>
                             )}
                           </div>
                           
                           <Button
                             onClick={handleClaimRewards}
                             disabled={isClaiming || !accruedRewards || !isConnected || (accruedRewards && Number(accruedRewards) === 0)}
                             className="w-full text-xs sm:text-sm" 
                             size="sm"
                           >
                             {isClaiming ? (
                               <div className="flex items-center gap-2">
                                 <Loader2 size={16} className="animate-spin" />
                                 Claiming...
                               </div>
                             ) : (
                               "Claim All Rewards"
                             )}
                           </Button>
                           
                           {!isConnected && (
                             <div className="text-xs text-text/60 text-center">
                               Connect wallet to claim
                             </div>
                           )}
                         </div>
                       </div>
                     </div>
                  </div>
                  
                  {/* Repay/Withdraw Section - Existing functionality preserved */}
                  <div className="bg-background/40 p-3 sm:p-4 rounded-lg border border-border/20">
                    <div className="flex justify-center mb-2 sm:mb-4">
                       <h3 className="text-base sm:text-lg font-semibold text-center text-text/90">Manage Position</h3>
                     </div>
                     
                     {/* Existing manage section content continues here... */}
                     <div className="grid grid-cols-1 gap-2 sm:gap-3 mt-2 sm:mt-3">
                       {hasSuppliedBalance && (
                        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-2 sm:p-3">
                          <div className="text-[10px] sm:text-xs text-green-600 mb-0.5 sm:mb-1">
                            {isBoosted ? 'Boosted Position' : 'Supplied'}
                          </div>
                          <div className="font-semibold text-sm sm:text-base">
                            {isBoosted
                              ? `${(boostedUnderlyingValue || Number(underlyingBalance || 0) / 10 ** (underlyingDecimals || 18)).toFixed(6)} ${asset.symbol}`
                              : `${formattedUnderlyingBalance} ${asset.symbol}`
                            }
                          </div>
                          {/* CRITICAL FIX: Show liquidity warning when cash limits withdrawal */}
                          {(() => {
                            const marketCash = marketState.cash ?? BigInt(0)
                            const underlyingBalanceWei = underlyingBalance ?? BigInt(0)
                            if (marketCash > BigInt(0) && underlyingBalanceWei > marketCash && underlyingDecimals) {
                              const cashDisplay = formatUnits(marketCash, underlyingDecimals)
                              const cashDisplayRounded = (() => {
                                const n = parseFloat(cashDisplay)
                                return isFinite(n) ? (n < 0.0001 ? n.toFixed(8) : n.toFixed(4)) : cashDisplay
                              })()
                              return (
                                <div className="text-[10px] sm:text-xs text-amber-600 mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-amber-500/20">
                                  <Info className="h-2.5 w-2.5 sm:h-3 sm:w-3 inline mr-1" />
                                  Available to withdraw: {cashDisplayRounded} {asset.symbol} (market liquidity limit)
                                </div>
                              )
                            }
                            return null
                          })()}
                        </div>
                      )}
                      {effectiveHasBorrow && (
                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-2 sm:p-3">
                          <div className="text-[10px] sm:text-xs text-orange-600 mb-0.5 sm:mb-1">Borrowed</div>
                           <div className="font-semibold text-sm sm:text-base">
                             {effectiveBorrowDecimals != null ? formatUnits(effectiveBorrowBalanceRaw ?? BigInt(0), effectiveBorrowDecimals) : '0'} {asset.symbol}
                           </div>
                        </div>
                      )}

                      {/* Earnings/Interest Display */}
                      {earningsHistory && !earningsHistory.loading && underlyingDecimals && (
                        <div className="col-span-1 mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-border/10">
                          {hasSuppliedBalance && (
                            <div className="flex justify-between items-center text-[10px] sm:text-xs px-1 mb-1 sm:mb-1.5">
                              <span className="text-muted-foreground">Lifetime Earnings:</span>
                              <span className="text-green-500 font-medium text-right">
                                {(() => {
                                  const currentSupply = parseFloat(formatUnits(underlyingBalance || BigInt(0), underlyingDecimals))
                                  const earned = Math.max(0, currentSupply - earningsHistory.netSupplied)
                                  const earnedUSD = earned * (asset.price || 0)
                                  return `+${earned.toFixed(4)} ${asset.symbol} ($${earnedUSD.toFixed(2)})`
                                })()}
                              </span>
                            </div>
                          )}
                          {effectiveHasBorrow && (
                            <div className="flex justify-between items-center text-[10px] sm:text-xs px-1">
                              <span className="text-muted-foreground">Interest Accrued:</span>
                              <span className="text-orange-500 font-medium text-right">
                                {(() => {
                                  const currentBorrow = effectiveBorrowDecimals != null
                                    ? parseFloat(formatUnits(effectiveBorrowBalanceRaw || BigInt(0), effectiveBorrowDecimals))
                                    : 0
                                  const interest = Math.max(0, currentBorrow - earningsHistory.netBorrowed)
                                  const interestUSD = interest * (asset.price || 0)
                                  return `-${interest.toFixed(4)} ${asset.symbol} ($${interestUSD.toFixed(2)})`
                                })()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {!hasSuppliedBalance && !effectiveHasBorrow && (
                        <div className="bg-muted/10 border border-white/10 rounded-xl p-2 sm:p-3 text-center">
                          <div className="text-xs sm:text-sm text-muted-foreground">No position in {asset.symbol}</div>
                        </div>
                      )}
                    </div>

                    {/* Action Selection - Only show if user has both supplied and borrowed */}
                    {hasSuppliedBalance && effectiveHasBorrow && (
                      <div className="mt-2 sm:mt-4">
                        <div className="flex rounded-lg bg-muted/10 p-0.5 sm:p-1 gap-0.5 sm:gap-1">
                          <button
                            onClick={() => {
                              playThump()
                              setManageAction('repay')
                              setAmount("")
                            }}
                            className={cn(
                              "flex-1 py-1.5 sm:py-2 px-2 sm:px-3 text-[10px] sm:text-xs font-medium rounded-md transition-all duration-200",
                              manageAction === 'repay'
                                ? "bg-orange-500 text-white shadow-sm"
                                : "text-muted-foreground hover:text-orange-500"
                            )}
                          >
                            Repay Debt
                          </button>
                          <button
                            onClick={(event) => {
                              playThump()
                              if (!useStellarTxs && !allowWithdraw) {
                                event.preventDefault()
                                showWithdrawBlockedToast()
                                return
                              }
                              setManageAction('withdraw')
                              setAmount("")
                            }}
                            className={cn(
                              "flex-1 py-1.5 sm:py-2 px-2 sm:px-3 text-[10px] sm:text-xs font-medium rounded-md transition-all duration-200",
                              manageAction === 'withdraw'
                                ? "bg-green-500 text-white shadow-sm"
                                : "text-muted-foreground hover:text-green-500",
                              !useStellarTxs && !allowWithdraw && "opacity-60 cursor-not-allowed"
                            )}
                            aria-disabled={!useStellarTxs && !allowWithdraw}
                          >
                            Withdraw
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Show current action if only one option is available */}
                    {((hasSuppliedBalance && !effectiveHasBorrow) || (!hasSuppliedBalance && effectiveHasBorrow)) && (
                      <div className="mt-2 sm:mt-3 text-[10px] sm:text-xs text-muted-foreground">
                        {manageAction === 'repay' ? 'Repaying borrowed amount' : 'Withdrawing supplied amount'}
                      </div>
                    )}
                    {!useStellarTxs && !allowWithdraw && hasSuppliedBalance && (
                      <div className="mt-2 sm:mt-3 text-[10px] sm:text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg p-1.5 sm:p-2">
                        Withdraws aren't available on this chain for standard wallets. Switch to BSC or use a Peridot smart account with Google login to continue.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Amount input with custom styling */}
              <div className="space-y-3">
                <div className="relative">
                  <div id="tour-step-4-amount-input" className={cn(
                    "inputbox rounded-2xl overflow-hidden transition-all duration-300",
                    validationState.errorMessage && amount 
                      ? "border-red-500/40 shadow-sm shadow-red-500/20" 
                      : validationState.isValid && amount 
                      ? "border-[#5E7945]/40 shadow-sm shadow-[#5E7945]/20" 
                      : ""
                  )}>
                    <input
                      type="text"
                      value={amount}
                      onChange={(e) => {
                        const { value } = e.target;
                        if (/^$|^\d*\.?\d*$/.test(value)) {
                           setAmount(value)
                           setShowValuePopup(value !== "" && !isNaN(parseFloat(value)))
                           setRepayMax(false)
                           setRedeemOverride(null)
                           // Safety: if user edits amount while managing a withdrawal,
                           // ensure we parse as underlying and call redeemUnderlying
                           if (activeTab === 'manage' && manageAction === 'withdraw') {
                             setRedeemType('underlying')
                           }
                        }
                      }}
                      onFocus={() => amount && !isNaN(parseFloat(amount)) && setShowValuePopup(true)}
                      onBlur={() => setTimeout(() => setShowValuePopup(false), 150)}
                      disabled={currentActionLoading}
                      placeholder=" "
                      required
                    />
                    <span>Amount</span>
                    <i></i>
                  </div>
                  <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
                    {asset.symbol}
                  </div>

                  {/* Professional Liquid Glass Popup */}
                  {showValuePopup && dollarValue > 0 && (
                    <div className="absolute -top-20 left-1/2 transform -translate-x-1/2 z-50 animate-popup-enter">
                      <div className="relative">
                        {/* Professional liquid glass backdrop */}
                        <div className="absolute inset-0 bg-gradient-to-br from-green-500/15 via-green-400/10 to-emerald-500/15 rounded-xl blur-lg"></div>
                        
                        {/* Main popup content */}
                        <div className="relative backdrop-blur-xl bg-background/90 border border-green-500/30 rounded-xl px-4 py-2.5 shadow-xl min-w-[180px]">
                          <div className="flex flex-col gap-1.5">
                            {/* Dollar value */}
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
                            
                            {/* Fee estimation */}
                            {feeEstimate && (feeEstimate.isLoading || feeEstimate.native || feeEstimate.biconomy || feeEstimate.approval) && (
                              <div className="border-t border-green-500/20 pt-1.5 mt-1">
                                <div className="text-xs text-muted-foreground/80 space-y-0.5">
                                  {feeEstimate.isLoading ? (
                                    <div className="flex items-center justify-center gap-1">
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                      <span>Calculating fees...</span>
                                    </div>
                                  ) : (
                                    <>
                                      {feeEstimate.approval && (
                                        <div className="flex items-center justify-between">
                                          <span>Approval:</span>
                                          <span className="font-medium">~${feeEstimate.approval.usd.toFixed(2)}</span>
                                        </div>
                                      )}
                                      {feeEstimate.biconomy && (
                                        <div className="flex items-center justify-between">
                                          <span>Fee:</span>
                                          <span className="font-medium">
                                            {feeEstimate.biconomy.isSponsored ? (
                                              <span className="text-emerald-400">Gasless</span>
                                            ) : (
                                              `~$${feeEstimate.biconomy.usd.toFixed(2)} (${feeEstimate.biconomy.token})`
                                            )}
                                          </span>
                                        </div>
                                      )}
                                      {feeEstimate.native && (
                                        <div className="flex items-center justify-between">
                                          <span>Gas:</span>
                                          <span className="font-medium">~${feeEstimate.native.usd.toFixed(2)} ({feeEstimate.native.token})</span>
                                        </div>
                                      )}
                                      {feeEstimate.totalUsd > 0 && (
                                        <div className="flex items-center justify-between pt-0.5 border-t border-green-500/10 mt-0.5">
                                          <span className="font-semibold">Total fees:</span>
                                          <span className="font-semibold">~${feeEstimate.totalUsd.toFixed(2)}</span>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                          
                          {/* Professional arrow */}
                          <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-background/90 border-r border-b border-green-500/30 rotate-45 backdrop-blur-xl"></div>
                        </div>
                        
                        {/* Subtle glow effect */}
                        <div className="absolute inset-0 rounded-xl bg-green-500/20 opacity-60 blur-sm animate-pulse"></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Wallet Balance Display */}
                {activeTab === 'supply' && isConnected && hasSmartContract && (
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>{useNative ? `Native ${effectiveBalanceSymbol} Balance:` : 'Wallet Balance:'}</span>
                    <span className={`font-medium ${isWalletBalanceLoading ? 'opacity-50' : ''}`}>
                      {isWalletBalanceLoading ? 'Loading...' : `${effectiveBalanceFormatted} ${effectiveBalanceSymbol}`}
                      {!useNative && ((isBsc && asset.symbol === 'WBNB') || (isEthWrapChain && asset.symbol === 'WETH')) && (
                        <span className="ml-2 opacity-80">
                          ({nativeBnbBalance?.formatted ? Number(nativeBnbBalance.formatted).toFixed(4) : '0.0000'} {isBsc ? 'BNB' : 'ETH'} ·{' '}
                          {!showWrapControls ? (
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowWrapControls(true) }}
                              className="underline hover:opacity-100"
                              disabled={isWrapping}
                            >
                              convert to {isBsc ? 'WBNB' : 'WETH'}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                inputMode="decimal"
                                placeholder="0.0"
                                value={wrapAmount}
                                onChange={(e) => setWrapAmount(e.target.value)}
                                className="w-24 px-2 py-0.5 text-xs border rounded-md bg-background"
                                disabled={isWrapping}
                              />
                              {(wrapExceedsMax || maxWrapWei === BigInt(0)) && (
                                <Tooltip delayDuration={150}>
                                  <TooltipTrigger asChild>
                                    <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 border border-amber-500/30 cursor-help">info</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs p-2 text-xs">
                                    {maxWrapWei === BigInt(0)
                                      ? 'Insufficient native balance after reserving gas for the transaction.'
                                      : `Maximum you can wrap now is ~${Number(maxWrapDisplay).toFixed(6)} ${isBsc ? 'BNB' : 'ETH'} due to gas reserve.`}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!isWrapping) { isBsc ? handleWrapBnbToWbnb(wrapAmount) : handleWrapEthToWeth(wrapAmount) } }}
                                className="underline hover:opacity-100"
                                disabled={isWrapping}
                              >
                                {isWrapping ? 'Converting…' : 'Wrap'}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowWrapControls(false); setWrapAmount("") }}
                                className="underline hover:opacity-100"
                                disabled={isWrapping}
                              >
                                Cancel
                              </button>
                            </span>
                          )}
                          )
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {/* Inline validation error message with liquid glass design */}
                {validationState.errorMessage && (
                  <div className="relative animate-slide-up-enter">
                    {/* Liquid glass backdrop with #5E7945 accent */}
                    <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-red-400/5 to-[#5E7945]/10 rounded-xl blur-sm"></div>
                    
                    {/* Main error container */}
                    <div className="relative backdrop-blur-xl bg-background/80 border border-red-500/30 rounded-xl p-3">
                      <div className="flex items-start gap-2">
                        {/* Accent indicator */}
                        <div className="w-1 h-4 bg-gradient-to-b from-red-500 to-[#5E7945] rounded-full mt-0.5 flex-shrink-0"></div>
                        
                        {/* Error message */}
                        <div className="text-sm text-red-600 font-medium leading-relaxed">
                          {validationState.errorMessage}
                        </div>
                      </div>
                      
                      {/* Subtle glow effect */}
                      <div className="absolute inset-0 rounded-xl bg-red-500/5 opacity-60 blur-sm pointer-events-none"></div>
                    </div>
                  </div>
                )}

                {/* Transaction error message: concise, user-friendly */}
                {showTransactionError && (
                  <div className="relative animate-slide-up-enter">
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-orange-400/5 to-amber-500/10 rounded-xl blur-sm"></div>
                    <div className="relative backdrop-blur-xl bg-background/80 border border-orange-500/30 rounded-xl p-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5" />
                        <div className="text-sm text-orange-600 font-medium leading-relaxed">
                          {(() => {
                            const actionPrefix = activeTab === 'supply'
                              ? 'Supply failed: '
                              : activeTab === 'borrow'
                              ? 'Borrow failed: '
                              : manageAction === 'repay'
                              ? 'Repay failed: '
                              : 'Withdraw failed: '
                            return actionPrefix + formatUserFacingError(currentActionError)
                          })()}
                        </div>
                      </div>
                      <div className="absolute inset-0 rounded-xl bg-orange-500/5 opacity-60 blur-sm pointer-events-none"></div>
                    </div>
                  </div>
                )}

                {/* Quick amount chips — segmented control */}
                <div className="flex gap-px bg-muted/40 rounded-2xl p-0.5">
                  {([0.25,0.5,0.75,1] as const).map(pct => {
                    const label = pct === 1 ? 'MAX' : `${Math.round(pct * 100)}%`
                    const isActive = (() => {
                      if (!amount || isNaN(parseFloat(amount))) return false
                      const decs = getTokenDecimalsForInput()
                      const cur = parseFloat(amount)
                      let base = 0
                      if (activeTab === 'supply') base = effectiveBalanceNumeric || 0
                      else if (activeTab === 'borrow') base = getEffectiveMaxBorrowAmount(asset.id)
                      else if (activeTab === 'manage' && manageAction === 'repay') {
                        base = useStellarTxs
                          ? Math.max(0, effectiveBorrowBalanceNumeric)
                          : (rawBorrowBalance && underlyingDecimals != null)
                            ? parseFloat(formatUnits(rawBorrowBalance, underlyingDecimals))
                            : parseFloat((borrowBalance||'0').toString().replace(/[<,]/g,'')) || 0
                      } else if (activeTab === 'manage' && manageAction === 'withdraw') {
                        base = underlyingBalance && underlyingDecimals ? parseFloat(formatUnits(underlyingBalance as bigint, underlyingDecimals)) : 0
                      }
                      const maxBase = activeTab === 'supply' ? supplyMaxAmount(base, asset.id) : base
                      const target = parseFloat(toFixedDecimals(pct === 1 ? maxBase : base * pct, decs))
                      return Math.abs(cur - target) < 1e-9
                    })()
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          const decs = getTokenDecimalsForInput()
                          if (activeTab === 'supply') {
                            const base = effectiveBalanceNumeric || 0
                            setAmount(toFixedDecimals(pct === 1 ? supplyMaxAmount(base, asset.id) : base * pct, decs))
                          } else if (activeTab === 'borrow') {
                            const base = getEffectiveMaxBorrowAmount(asset.id)
                            setAmount(toFixedDecimals(pct === 1 ? base : base * pct, decs))
                          } else if (activeTab === 'manage') {
                            if (manageAction === 'repay') {
                              const borrowNum = useStellarTxs
                                ? Math.max(0, effectiveBorrowBalanceNumeric)
                                : (rawBorrowBalance && underlyingDecimals != null)
                                  ? parseFloat(formatUnits(rawBorrowBalance, underlyingDecimals))
                                  : parseFloat((borrowBalance||'0').toString().replace(/[<,]/g,'')) || 0
                              if (pct === 1) {
                                setAmount(toFixedDecimals(borrowNum, decs))
                                setRepayMax((walletBalanceNumeric || 0) >= borrowNum)
                              } else {
                                setRepayMax(false)
                                setAmount(toFixedDecimals(borrowNum * pct, decs))
                              }
                            } else {
                              const maxRedeem = underlyingBalance && underlyingDecimals
                                ? parseFloat(formatUnits(underlyingBalance as bigint, underlyingDecimals)) : 0
                              setRedeemType('underlying')
                              setRedeemOverride(null)
                              setAmount(toFixedDecimals(pct === 1 ? maxRedeem : maxRedeem * pct, decs))
                            }
                          }
                        }}
                        className={cn(
                          "flex-1 py-1.5 text-xs font-semibold rounded-xl transition-all duration-150",
                          isActive
                            ? "bg-background shadow-sm text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>

                {/* Action button with enhanced styling */}
                  <div className="animate-button-interactive">
                    <Button
                      onClick={handleAction}
                      disabled={
                        currentActionLoading ||
                        !validationState.isValid ||
                        (hasSmartContract && activeTab === 'supply' && !(useStellarTxs ? validationState.isValid : canSupply)) ||
                        (hasSmartContract && activeTab === 'borrow' && !(useStellarTxs ? canStellarBorrow : canBorrow)) ||
                        (activeTab === 'borrow' && !useStellarTxs && !allowBorrow) ||
                        (hasSmartContract && activeTab === 'manage' && manageAction === 'repay' && !effectiveCanRepay) ||
                        (hasSmartContract && activeTab === 'manage' && manageAction === 'withdraw' && !(useStellarTxs ? canStellarRedeem : canRedeem)) ||
                        (activeTab === 'manage' && manageAction === 'withdraw' && !useStellarTxs && !allowWithdraw)
                      }
                      className={cn(
                        "w-full py-3.5 text-base font-semibold rounded-2xl transition-all duration-200",
                        "text-white border-0 disabled:opacity-40",
                        activeTab === 'supply'
                          ? 'bg-green-500 hover:bg-green-600 active:bg-green-700'
                          : activeTab === 'borrow'
                          ? 'bg-orange-500 hover:bg-orange-600 active:bg-orange-700'
                          : 'bg-purple-500 hover:bg-purple-600 active:bg-purple-700'
                      )}
                    >
                      {currentActionLoading ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          {hasSmartContract ? (
                            currentStepValue === 'wrapping' ? 'Wrapping...' :
                            currentStepValue === 'approving' ? 'Approving...' :
                            currentStepValue === 'approved' ? 'Approved!' :
                            currentStepValue === 'supplying' ? 'Supplying...' :
                            currentStepValue === 'borrowing' ? 'Borrowing...' :
                            currentStepValue === 'repaying' ? 'Repaying...' :
                            currentStepValue === 'redeeming' ? 'Withdrawing...' :
                            currentStepValue === 'entering-market' ? 'Enabling Collateral...' :
                            'Processing...'
                          ) : 'Processing...'}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {activeTab === 'supply' && <TrendingUp className="h-5 w-5" />}
                          {activeTab === 'borrow' && <TrendingDown className="h-5 w-5" />}
                          {activeTab === 'manage' && <RefreshCw className="h-5 w-5" />}
                          {activeTab === 'supply' ? (
                            hasSmartContract && needsApproval && !currentActionLoading ? 'Approve & Supply' : 'Supply'
                          ) : activeTab === 'borrow' ? 'Borrow' : manageAction === 'repay' ? (
                            hasSmartContract && effectiveNeedsRepayApproval && !currentActionLoading ? 'Approve & Repay' : 'Repay'
                          ) : 'Withdraw'}
                        </div>
                      )}
                    </Button>
                  </div>

                {/* Transaction Status */}
                {currentStatusMessage && currentActionLoading && (
                  <div className={`rounded-xl p-3 text-sm backdrop-blur-sm border animate-slide-up-enter ${
                    activeTab === 'supply' ? 'bg-green-500/10 border-green-500/20 text-green-600' :
                    activeTab === 'borrow' ? 'bg-orange-500/10 border-orange-500/20 text-orange-600' :
                    'bg-purple-500/10 border-purple-500/20 text-purple-600'
                  }`}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                      {currentStatusMessage}
                    </div>
                  </div>
                )}

                {/* Transaction Hash */}
                {getCurrentTransactionHash() && (
                  <div className="text-xs text-muted-foreground bg-white/5 border border-white/10 rounded-lg p-2 animate-slide-up-enter">
                    <div className="flex items-center justify-between">
                      <span>Transaction:</span>
                      {(() => {
                        const h = getCurrentTransactionHash()!
                        const cfg: any = chainId ? getChainConfig(chainId) : null
                        const explorerBase: string | null = (cfg && (cfg as any).explorer) ? (cfg as any).explorer : null
                        const base = explorerBase ? explorerBase.replace(/\/$/, '') : null
                        const txUrl = biconomyTrackingUrl || (base ? `${base}/tx/${h}` : null)
                        const short = `${h.slice(0, 6)}...${h.slice(-4)}`
                        return (
                          <div className="flex items-center gap-1">
                            {txUrl ? (
                              <a href={txUrl} target="_blank" rel="noopener noreferrer" className="font-mono underline">
                                {short}
                              </a>
                            ) : (
                              <span className="font-mono">{short}</span>
                            )}
                            <ExternalLink className="h-3 w-3" />
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                )}

                {/* Manual Supply Button (when approval is done but automatic transition fails) */}
                {step === 'approved' && !isSupplyLoading && activeTab === 'supply' && (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 animate-slide-up-enter">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-blue-600">
                        <Check className="h-4 w-4" />
                        <span className="text-sm">Approval successful! Ready to supply.</span>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => { playThump(); manualSupplyTrigger() }}
                        className="bg-blue-500 hover:bg-blue-600 text-white"
                      >
                        Supply Now
                      </Button>
                    </div>
                  </div>
                )}

                {/* Success Messages */}
                {currentStepValue === 'success' && !isAxelarAsset && (
                  <div className={`rounded-xl p-3 text-sm backdrop-blur-sm border animate-scale-fade-enter ${
                    activeTab === 'supply' ? 'bg-green-500/10 border-green-500/20 text-green-600' :
                    activeTab === 'borrow' ? 'bg-orange-500/10 border-orange-500/20 text-orange-600' :
                    'bg-purple-500/10 border-purple-500/20 text-purple-600'
                  }`}>
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      <span className="font-medium">
                        {activeTab === 'supply' ? `Successfully supplied ${amount} ${asset.symbol}!` :
                         activeTab === 'borrow' ? `Successfully borrowed ${amount} ${asset.symbol}!` :
                         effectiveHasBorrow ? `Successfully repaid ${amount} ${asset.symbol}!` :
                         `Successfully withdrew ${amount} ${asset.symbol}!`}
                      </span>
                    </div>
                  </div>
                )}
                {currentStepValue === 'success' && isAxelarAsset && (
                  <div className="mt-2">{renderCrossChainPending()}</div>
                )}

                {currentStepValue === 'success' && (
                  <div className="mt-2">{renderBiconomyRetry()}</div>
                )}

                {/* When INTERACTIVE_TX_DIALOG is enabled, suppress local error banners in favor of global dialog */}





                {/* Success confirmation */}
                {showConfirmation && (
                  <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center animate-scale-fade-enter">
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <Check className="h-5 w-5" />
                      <span className="font-medium">{confirmationMessage}</span>
                    </div>
                  </div>
                )}
              </div>
          </div>

          {/* Collateral — toggle row, no aggressive color buttons */}
          {Boolean(hasSmartContract && isConnected && hasSuppliedBalance) && (
            <div className="rounded-2xl border border-border/30 bg-muted/10 px-4 py-3 animate-in fade-in-0 duration-300">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Shield className={cn("h-4 w-4 shrink-0", isCollateralEnabled ? "text-green-500" : "text-muted-foreground/50")} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-tight">Collateral</div>
                    <div className="text-[11px] text-muted-foreground/60 leading-tight mt-0.5 truncate">
                      {isCollateralEnabled
                        ? "Used as borrowing collateral"
                        : "Enable to borrow against this asset"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {(isEnteringMarket || isExitingMarket) && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Switch
                          checked={isCollateralEnabled}
                          disabled={isEnteringMarket || isExitingMarket || (isCollateralEnabled && !!stellarExitBlockedByBalance)}
                          onCheckedChange={(checked) => {
                            playThump()
                            if (checked) {
                              if (FEATURE_FLAGS.CROSS_CHAIN_COLLATERAL_BICONOMY && chainId && chainId !== bscChainId) {
                                executeEnableCollateral()
                              } else {
                                executeEnterMarket()
                              }
                            } else {
                              executeExitMarket()
                            }
                          }}
                        />
                      </div>
                    </TooltipTrigger>
                    {stellarExitBlockedByBalance && isCollateralEnabled && (
                      <TooltipContent side="top" className="max-w-[240px] text-xs">
                        On Stellar, collateral can only be disabled when both supply and borrow balances are zero.
                      </TooltipContent>
                    )}
                  </Tooltip>
                </div>
              </div>

              {useStellarTxs && isCollateralEnabled && (
                <div className="mt-2 text-[11px] text-muted-foreground/60">
                  On Stellar, collateral is auto-enabled after supply. Disable only when supply and borrow are both zero.
                </div>
              )}

              {/* Status messages */}
              {enterMarketStatusMessage && isEnteringMarket && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  {enterMarketStatusMessage}
                </div>
              )}
              {exitMarketStatusMessage && isExitingMarket && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  {exitMarketStatusMessage}
                </div>
              )}
              {enterMarketStep === 'success' && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600">
                  <Check className="h-3 w-3" />
                  {asset.symbol} enabled as collateral
                </div>
              )}
              {exitMarketStep === 'success' && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Check className="h-3 w-3" />
                  {asset.symbol} disabled as collateral
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* Cross-chain dialog removed - now using unified TxFeedbackDialog */}

      {/* Error Modal */}
      <ErrorModal
        isOpen={errorModal.isOpen}
        onClose={() => setErrorModal({ isOpen: false, message: '', details: undefined, isRetryable: false, onRetry: undefined })}
        title="Transaction Failed"
        message={errorModal.message}
        details={errorModal.details}
        isRetryable={errorModal.isRetryable}
        onRetry={errorModal.onRetry}
      />
    </div>
    </TooltipProvider>
  );
}; 
