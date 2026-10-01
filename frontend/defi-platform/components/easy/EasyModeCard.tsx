"use client"

import { useState, useMemo, useEffect, useRef, useCallback, lazy, Suspense } from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ChainBalanceDropdown } from "./ChainBalanceDropdown"
import { ArrowUpRight, DollarSign, History, AlertTriangle, Info, CircleHelp, TrendingUp } from "lucide-react"
import Link from "next/link"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { useNetworkContext, getNetworkIdFromChainId } from "@/context"
import { usePortfolioEarnings } from "@/hooks/use-portfolio-earnings"
import { LiveEarningsValue } from "@/components/shared/LiveEarnings"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { useEasySupply } from "@/hooks/use-easy-supply"
import { useEasyBorrow } from "@/hooks/use-easy-borrow"
import { useEasyCollateral } from "@/hooks/use-easy-collateral"
import { useStellarSupplyTransaction } from "@/hooks/use-stellar-supply-transaction"
import { useStellarBorrowTransaction } from "@/hooks/use-stellar-borrow-transaction"
import { useMarketActionGuard } from "@/hooks/use-market-action-guard"
import { useAccount, useSwitchChain } from "wagmi"
import { toast } from "sonner"
// Lazy-loaded the modal bundle is only fetched the first time the user opens it.
const EasyManagementModal = lazy(() =>
  import("./EasyManagementModal").then(m => ({ default: m.EasyManagementModal }))
)
import { useWalletBalance } from "@/hooks/use-wallet-balance"
import { useCrossChainWalletBalances } from "@/hooks/use-cross-chain-wallet-balances"
import { useLinkedWallets } from "@/hooks/use-linked-wallets"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { getAssetById, getMarketsForChain, getStellarSorobanMarkets, combinedMarkets } from "@/data/market-data"
import { CHAIN_IDS, STELLAR_NETWORK_ID, isStellarNetwork, chainConfigs, isHubChain } from "@/config/contracts"
import {
  getStellarVaultConfig,
  stellarFetchPrice,
  stellarGetExchangeRate,
  stellarGetNativeXlmBalance,
  stellarGetPtokenBalance,
  stellarGetTokenBalance,
} from "@/lib/stellar-soroban-lending"
import Image from "next/image"
import { Check } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useApyData } from "@/hooks/use-apy-data"
import { supplyMaxAmount } from "@/lib/supply-max"
import { InfoTooltip, type InfoTooltipContent } from "@/components/ui/InfoTooltip"
import { EasyModeTxStatus } from "./EasyModeTxStatus"

// ─── Tooltip content (static defined outside component to avoid re-creation) ─

const supplyTooltipContent: InfoTooltipContent = {
  title: "Supplying",
  description: "Deposit assets into Peridot to earn yield automatically.",
  bullets: [
    "You receive pTokens representing your deposit share",
    "Interest accrues every block no action needed",
    "Supplied assets can be enabled as collateral for borrowing",
  ],
}

const borrowTooltipContent: InfoTooltipContent = {
  title: "Borrowing",
  description: "Borrow against your supplied collateral.",
  bullets: [
    "Enable your supplied assets as collateral first",
    "Interest accrues continuously on your outstanding loan",
    "If collateral value drops too low, your position may be liquidated",
  ],
  note: "Keep your health factor well above 1 to stay safe.",
}

const suppliedTooltipContent: InfoTooltipContent = {
  title: "Total Supplied",
  description: "The total USD value of assets you've deposited into Peridot across all chains.",
}

const earnedTooltipContent: InfoTooltipContent = {
  title: "Lifetime Earned",
  description: "Cumulative interest and rewards earned since your first deposit.",
}

const availableToBorrowTooltipContent: InfoTooltipContent = {
  title: "Available to Borrow",
  description: "The maximum USD value you can borrow right now, based on your collateral and each asset's Loan-to-Value (LTV) ratio.",
  bullets: [
    "Each asset has its own LTV limit stablecoins are typically higher",
    "Borrowing less than the max gives you a safety buffer against market swings",
  ],
}

export function EasyModeCard() {
  const queryClient = useQueryClient()
  const { isConnected, isSmartAccountActive } = useActiveWallet()
  const { chainId, address: evmAddress } = useAccount()
  const { switchChain } = useSwitchChain()

  // APY comes from the shared hook rather than a local copy of the same query.
  // The copy that lived here mapped `supplyApy`/`peridotSupplyApy` and dropped
  // `totalSupplyApy`, so every Stellar market (whose yield is entirely in the
  // boost layer) displayed and sorted as 0%. `useApyData` reads the same cache
  // key, so this is the same single request — just the correct projection.
  const { liveApyData, bestApyPerAsset } = useApyData()

  const {
    totalSupplied,
    netAPY,
    liveNetAPY,
    netEarningsUSD,
    allPositions,
    weightedSupplyAPY,
    weightedSupplyRewardsAPY,
    weightedBorrowAPY,
    isLoading: isBalancesLoading,
  } = useCrossChainBalances(liveApyData)
  
  const { totalLifetimeEarnings, isLoading: earningsLoading } = usePortfolioEarnings()
  
  const { selectedNetworkId, setSelectedNetworkId, getChainIdFromNetworkId } = useNetworkContext()
  const [mode, setMode] = useState<"supply" | "borrow">("supply")
  const [usdInput, setUsdInput] = useState("")
  const [hasManuallySwitched, setHasManuallySwitched] = useState(false)
  const [isMgmtModalOpen, setIsMgmtModalOpen] = useState(false)

  // Dynamic Asset State
  const [selectedAssetId, setSelectedAssetId] = useState("usdc")
  const previousAssetIdRef = useRef<string | null>(null)
  // Tracks the last non-Stellar networkId so we can restore it when leaving XLM
  const lastEvmNetworkIdRef = useRef<string | null>(null)
  // True when we auto-switched to Stellar because XLM was selected
  const autoSwitchedToStellarRef = useRef(false)
  
  // Get all available markets (mainnet only), prioritizing those with smart contracts
  const availableMarkets = useMemo(() => {
    // Mainnet chain IDs only
    const mainnetChainIds = [
      CHAIN_IDS.BSC_MAINNET,
      CHAIN_IDS.MONAD_MAINNET,
      CHAIN_IDS.ARBITRUM_MAINNET,
      CHAIN_IDS.ETHEREUM_MAINNET,
      CHAIN_IDS.POLYGON_MAINNET,
      CHAIN_IDS.AVALANCHE_MAINNET,
      CHAIN_IDS.BASE_MAINNET,
      CHAIN_IDS.SOMNIA_MAINNET,
    ]
    
    // Get all unique assets that exist on at least one mainnet chain
    const mainnetAssetIds = new Set<string>()
    mainnetChainIds.forEach(chainId => {
      const markets = getMarketsForChain(chainId)
      markets.forEach(m => mainnetAssetIds.add(m.id))
    })
    
    // Filter combinedMarkets to only include mainnet assets
    const allMarkets = combinedMarkets.filter(asset => 
      asset.id && mainnetAssetIds.has(asset.id)
    )
    
    // Add Stellar markets so Easy mode can execute Soroban actions directly.
    const stellarMarkets = getStellarSorobanMarkets()
    const mergedIds = new Set<string>()
    const mergedMarkets = [...allMarkets, ...stellarMarkets].filter(asset => {
      if (mergedIds.has(asset.id)) return false
      mergedIds.add(asset.id)
      return true
    })

    // Hide assets not relevant in Easy Mode
    const HIDDEN_SYMBOLS = new Set(['ASTER', 'CAKE'])

    // Sort: markets with smart contracts first, then by symbol.
    // EVM assets (allMarkets) precede Stellar assets in the array, so after a stable
    // sort EVM entries win when two assets share the same symbol (e.g. USDC / usdc-stellar).
    const sorted = mergedMarkets
      .filter(asset => !HIDDEN_SYMBOLS.has(asset.symbol.toUpperCase()))
      .sort((a, b) => {
        // First priority: hasSmartContract (true first)
        if (a.hasSmartContract && !b.hasSmartContract) return -1
        if (!a.hasSmartContract && b.hasSmartContract) return 1
        // Second priority: alphabetical by symbol
        return a.symbol.localeCompare(b.symbol)
      })

    // Deduplicate by symbol O(n) Set lookup instead of the previous O(n²)
    // findIndex-inside-filter. Keeps the first (EVM) entry when multiple assets
    // share the same display symbol; Stellar routing is handled by isStellarTxMode.
    const seenSymbols = new Set<string>()
    const seenIds = new Set<string>()
    return sorted.filter(asset => {
      const sym = asset.symbol.toUpperCase()
      if (seenSymbols.has(sym) || seenIds.has(asset.id)) return false
      seenSymbols.add(sym)
      seenIds.add(asset.id)
      return true
    })
  }, [])
  
  // Get asset metadata. If selectedAssetId was a Stellar variant (e.g. "usdc-stellar")
  // that is now deduped away, fall back to the EVM counterpart that's actually in the list.
  const selectedAsset = useMemo(() => {
    const fromAvailable = availableMarkets.find((market) => market.id === selectedAssetId)
    if (fromAvailable) return fromAvailable
    // Try matching by symbol so "usdc-stellar" → EVM "usdc" entry
    const bySymbol = getAssetById(selectedAssetId)
    if (bySymbol) {
      const evmMatch = availableMarkets.find(m => m.symbol === bySymbol.symbol)
      if (evmMatch) return evmMatch
    }
    return bySymbol || getAssetById("usdc")!
  }, [selectedAssetId, availableMarkets])

  const assetId = selectedAsset.id
  const assetSymbol = selectedAsset.symbol

  // USD-first abstraction: derive token amount from USD input
  const assetPrice = useMemo(
    () => (selectedAsset as any).price || (selectedAsset as any).oraclePrice || 1,
    [selectedAsset]
  )
  const amount = useMemo(() => {
    const usd = parseFloat(usdInput)
    if (!usd || usd <= 0) return ""
    return (usd / assetPrice).toFixed(8).replace(/\.?0+$/, "")
  }, [usdInput, assetPrice])

  // Determine destination hub chain for cross-chain supply
  const getDestinationHubChainForAsset = useMemo(() => {
    // Check which hub chains have this asset available
    const hubChains = [CHAIN_IDS.BSC_MAINNET, CHAIN_IDS.MONAD_MAINNET]
    
    for (const hubChainId of hubChains) {
      const markets = getMarketsForChain(hubChainId)
      const hasMarket = markets.some(m => m.id === assetId && m.hasSmartContract)
      if (hasMarket) return hubChainId
    }
    return CHAIN_IDS.BSC_MAINNET
  }, [assetId])

  // Market Guard for professional error checking
  const actionGuard = useMarketActionGuard({
    chainId,
    selectedNetworkId,
    accountType: isSmartAccountActive ? "SMART_ACCOUNT" : "EOA",
    eligibleForSponsored: true
  })

  // Stable callbacks defined with useCallback so the four transaction hooks
  // don't see new function references on every EasyModeCard render (which would
  // retrigger their internal effects and cause unnecessary re-renders).
  const onSupplySuccess = useCallback(() => {
    setUsdInput("")
    toast.success("Supply successful!")
  }, [])

  const onBorrowSuccess = useCallback(() => {
    setUsdInput("")
    toast.success("Borrow successful!")
  }, [])

  // Supply Transaction Hook (Easy Mode uses the simplified use-easy-supply)
  const supplyTx = useEasySupply({
    assetId,
    amount,
    destinationChainId: getDestinationHubChainForAsset,
    onSuccess: onSupplySuccess,
  })

  // Borrow Transaction Hook
  const borrowTx = useEasyBorrow({
    assetId,
    amount,
    onSuccess: onBorrowSuccess,
  })

  // Enable Collateral Hook (for borrow hint CTA)
  const enableCollateralTx = useEasyCollateral({ assetId })

  const stellarTxAssetId = useMemo(() => {
    if (assetId === "xlm-stellar" || assetId === "usdc-stellar" || assetId === "eurc-stellar") return assetId
    if (assetId === "usdt" || assetId === "usdc") return "usdc-stellar"
    if (assetId === "eurc") return "eurc-stellar"
    if (assetId === "xlm") return "xlm-stellar"
    return null
  }, [assetId])

  const isStellarTxMode = useMemo(
    () => Boolean(stellarTxAssetId && isStellarNetwork(selectedNetworkId)),
    [stellarTxAssetId, selectedNetworkId]
  )

  const stellarSupplyTx = useStellarSupplyTransaction({
    assetId: stellarTxAssetId || "",
    amount,
    onSuccess: onSupplySuccess,
  })

  const stellarBorrowTx = useStellarBorrowTransaction({
    assetId: stellarTxAssetId || "",
    amount,
    onSuccess: onBorrowSuccess,
  })

  const handleAction = async () => {
    if (!isConnected) {
      // On Stellar, "not connected" means Freighter never granted access.
      // Trigger requestAccess() directly so the user has a one-click path.
      if (isStellarTxMode) {
        const ok = await stellarWallet.connect()
        if (!ok) toast.error(stellarWallet.error || "Unable to connect Stellar wallet")
        return
      }
      toast.error("Please connect your wallet")
      return
    }

    if (!usdInput || parseFloat(usdInput) <= 0) {
      toast.error("Please enter a valid USD amount")
      return
    }

    try {
      if (mode === "supply") {
        if (isStellarTxMode) {
          await stellarSupplyTx.executeSupply()
        } else {
          // Supply works cross-chain via Biconomy, no guard check needed
          await supplyTx.executeSupply()
        }
      } else {
        if (isStellarTxMode) {
          await stellarBorrowTx.executeBorrow()
        } else {
          // Only check borrow permissions for borrow mode
          if (!actionGuard.allowBorrow && !isHubChain(chainId)) {
            actionGuard.showBorrowBlockedToast()
            return
          }
          await borrowTx.executeBorrow()
        }
      }
    } catch (err) {
      console.error("Transaction failed:", err)
    }
  }

  const isLoading = mode === "supply"
    ? (isStellarTxMode ? stellarSupplyTx.isLoading : supplyTx.isLoading)
    : (isStellarTxMode ? stellarBorrowTx.isLoading : borrowTx.isLoading)

  const isTxActiveGlobally = isLoading || (mode === "supply" ? supplyTx.step !== 'idle' : borrowTx.step !== 'idle')

  const txError = mode === "supply"
    ? (isStellarTxMode ? null : supplyTx.error)
    : (isStellarTxMode ? stellarBorrowTx.error : borrowTx.error)
  const needsApproval = mode === "supply" && !isStellarTxMode && supplyTx.needsApproval

  const getButtonText = () => {
    if (isLoading) return "Processing..."
    if (!isConnected) {
      if (isStellarTxMode) return stellarWallet.isLoading ? "Connecting…" : "Connect a Stellar wallet"
      return "Connect Wallet"
    }
    if (needsApproval) return `Approve ${assetSymbol}`
    return mode === "supply" ? `Earn ${assetSymbol}` : `Borrow ${assetSymbol}`
  }

  const { balances: walletBalancesAcrossChains } = useCrossChainWalletBalances(assetId)
  const { groupedLinks } = useLinkedWallets()
  const stellarWallet = useStellarWallet()

  const stellarAssetId = useMemo(() => {
    if (assetId === "usdt") return "usdc-stellar"
    if (assetId === "usdc") return "usdc-stellar"
    if (assetId === "eurc") return "eurc-stellar"
    if (assetId === "xlm") return "xlm-stellar"
    if (assetId === "xlm-stellar") return "xlm-stellar"
    if (assetId === "usdc-stellar") return "usdc-stellar"
    if (assetId === "eurc-stellar") return "eurc-stellar"
    return null
  }, [assetId])

  const selectedStellarWalletAddress = useMemo(() => {
    const verified = groupedLinks.stellar.find((link) => link.verificationStatus === "verified")
    return verified?.normalizedAddress || groupedLinks.stellar[0]?.normalizedAddress || stellarWallet.address || null
  }, [groupedLinks.stellar, stellarWallet.address])

  // A valid Stellar address starts with 'G' and is never an EVM 0x address.
  // Guards against EVM addresses leaking through the linked-wallets fallback.
  const isValidStellarAddress = (addr: string | null): addr is string =>
    typeof addr === "string" && addr.length > 0 && !addr.startsWith("0x")

  const { data: stellarBalance = 0 } = useQuery({
    queryKey: ["easy-stellar-balance", stellarAssetId, selectedStellarWalletAddress],
    enabled: !!stellarAssetId && isValidStellarAddress(selectedStellarWalletAddress),
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!stellarAssetId || !selectedStellarWalletAddress) return 0
      const config = getStellarVaultConfig(stellarAssetId)
      if (!config) return 0
      const [wrapped, native] = await Promise.all([
        stellarGetTokenBalance(config.underlying, selectedStellarWalletAddress),
        stellarAssetId === "xlm-stellar" ? stellarGetNativeXlmBalance(selectedStellarWalletAddress) : Promise.resolve("0"),
      ])
      const maxRaw = BigInt(wrapped) > BigInt(native) ? wrapped : native
      const divisor = Math.pow(10, config.decimals)
      return Number(maxRaw) / divisor
    },
  })

  const { data: stellarSuppliedUsd = 0, isLoading: isStellarSuppliedLoading } = useQuery({
    queryKey: ["easy-stellar-supplied-usd", selectedStellarWalletAddress],
    enabled: isValidStellarAddress(selectedStellarWalletAddress),
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!selectedStellarWalletAddress) return 0
      const stellarMarkets = getStellarSorobanMarkets()

      const values = await Promise.all(stellarMarkets.map(async (asset) => {
        const cfg = getStellarVaultConfig(asset.id)
        if (!cfg) return 0

        const [ptokenRawStr, exchangeRateRawStr, price] = await Promise.all([
          stellarGetPtokenBalance(cfg.vaultId, selectedStellarWalletAddress),
          stellarGetExchangeRate(cfg.vaultId),
          stellarFetchPrice(asset.id),
        ])

        const toBigIntSafe = (v: string) => {
          try {
            return BigInt(v)
          } catch {
            return BigInt(0)
          }
        }

        const ptokenRaw = toBigIntSafe(ptokenRawStr)
        const exchangeRateRaw = toBigIntSafe(exchangeRateRawStr)
        if (ptokenRaw <= 0n || exchangeRateRaw <= 0n) return 0

        // Vault stores ptoken_raw and underlying_raw raw-to-raw (verified
        // empirically across all three mainnet vaults). decimals() metadata
        // does not enter the conversion: underlying_raw = ptoken_raw × rate / 1e6.
        const underlyingScale = BigInt(10) ** BigInt(cfg.decimals)
        const exchangeScale = BigInt(1_000_000)
        const suppliedUnderlyingRaw = (ptokenRaw * exchangeRateRaw) / exchangeScale

        const suppliedAmount = Number(suppliedUnderlyingRaw) / Number(underlyingScale)
        const priceUsd = Number.isFinite(price ?? NaN) ? Number(price) : 0
        return suppliedAmount * priceUsd
      }))

      return values.reduce((sum, value) => sum + value, 0)
    },
  })

  const easyQueryClientRef = useRef(queryClient)
  useEffect(() => { easyQueryClientRef.current = queryClient }, [queryClient])

  useEffect(() => {
    const onTxSuccess = () => {
      try {
        easyQueryClientRef.current.invalidateQueries({ queryKey: ["easy-stellar-balance"] })
        easyQueryClientRef.current.invalidateQueries({ queryKey: ["easy-stellar-supplied-usd"] })
      } catch {}
    }
    window.addEventListener("peridot:tx-success" as any, onTxSuccess)
    return () => window.removeEventListener("peridot:tx-success" as any, onTxSuccess)
  }, []) // stable queryClient accessed via ref

  const walletBalancesIncludingStellar = useMemo(() => {
    const balances = [...walletBalancesAcrossChains]
    if (stellarBalance > 0) {
      balances.push({
        chainId: CHAIN_IDS.STELLAR_MAINNET,
        chainName: "Stellar",
        balance: stellarBalance,
        symbol: assetSymbol,
      })
    }
    return balances
  }, [walletBalancesAcrossChains, stellarBalance, assetSymbol])

  // Find the chain with the highest wallet balance for the selected token
  const bestChainForToken = useMemo(() => {
    if (!isConnected || walletBalancesIncludingStellar.length === 0) return null
    const tokenPrice = selectedAsset.price || 1.0
    const sorted = [...walletBalancesIncludingStellar].sort(
      (a, b) => (b.balance * tokenPrice) - (a.balance * tokenPrice)
    )
    return sorted[0]?.chainId ?? null
  }, [walletBalancesIncludingStellar, isConnected, selectedAsset.price])

  // Find the chain with the most value wallet balance wins over supplied position
  const topChainId = useMemo(() => {
    if (bestChainForToken) return bestChainForToken

    // Fallback: highest total value (supply + wallet) across chains for this asset
    const totalValuePerChain: Record<number, number> = {}
    allPositions
      .filter(p => p.symbol === assetSymbol)
      .forEach(p => {
        totalValuePerChain[p.chainId] = (totalValuePerChain[p.chainId] || 0) + p.suppliedValueUSD
      })
    walletBalancesIncludingStellar.forEach(wb => {
      const price = selectedAsset.price || 1.0
      totalValuePerChain[wb.chainId] = (totalValuePerChain[wb.chainId] || 0) + (wb.balance * price)
    })
    const sorted = Object.entries(totalValuePerChain).sort((a, b) => b[1] - a[1])
    return sorted.length > 0 ? Number(sorted[0][0]) : null
  }, [allPositions, assetSymbol, walletBalancesIncludingStellar, selectedAsset.price, bestChainForToken])

  // Reset manual switch flag when asset changes
  useEffect(() => {
    if (previousAssetIdRef.current !== null && previousAssetIdRef.current !== assetId) {
      setHasManuallySwitched(false)
    }
    previousAssetIdRef.current = assetId
  }, [assetId])

  // Synchronize network and asset states in a single effect to reduce re-renders
  useEffect(() => {
    const isXlm = assetId === "xlm" || assetId === "xlm-stellar"

    // Stellar→EVM revert must run BEFORE the isConnected guard.
    // While selectedNetworkId=Stellar, useActiveWallet() returns Freighter state
    // (isConnected=false when Freighter is not connected), which would block the
    // revert entirely if this check came after the guard.
    if (!isXlm && autoSwitchedToStellarRef.current && isStellarNetwork(selectedNetworkId)) {
      autoSwitchedToStellarRef.current = false
      const targetNetworkId = lastEvmNetworkIdRef.current ?? "bnb"
      setSelectedNetworkId(targetNetworkId)
      const targetChainId = getChainIdFromNetworkId(targetNetworkId)
      if (switchChain && targetChainId) {
        switchChain({ chainId: targetChainId })
      }
      return
    }

    if (!isConnected) return

    // For borrow mode, always route natively through BSC Mainnet (or testnet)
    if (mode === "borrow") {
      const isTestnetPreset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || '').startsWith('testnet')
      const targetChainId = isTestnetPreset ? CHAIN_IDS.BSC_TESTNET : CHAIN_IDS.BSC_MAINNET
      const networkId = getNetworkIdFromChainId(targetChainId)

      if (networkId && networkId !== selectedNetworkId) {
        setSelectedNetworkId(networkId)
        if (switchChain && chainId !== targetChainId) {
          switchChain({ chainId: targetChainId })
        }
      }
      return // Skip other smart-switch logic when in borrow mode
    }

    // 1. Smart-switch to best chain for current asset (only if not manually switched)
    if (!hasManuallySwitched && topChainId) {
      const networkId = getNetworkIdFromChainId(topChainId)
      if (networkId && networkId !== selectedNetworkId) {
        setSelectedNetworkId(networkId)
        if (switchChain && networkId !== STELLAR_NETWORK_ID) {
          switchChain({ chainId: topChainId })
        }
      }
    }

    // 2. EVM Network Persistence track last non-Stellar networkId for revert
    if (!isStellarNetwork(selectedNetworkId)) {
      lastEvmNetworkIdRef.current = selectedNetworkId
    }

    // 3. EVM→Stellar forward switch (the revert direction is handled above the guard)
    if (isXlm && !isStellarNetwork(selectedNetworkId)) {
      autoSwitchedToStellarRef.current = true
      setSelectedNetworkId(STELLAR_NETWORK_ID)
    } else if (!isXlm) {
      autoSwitchedToStellarRef.current = false
    }
  }, [mode, assetId, selectedNetworkId, topChainId, chainId, isConnected, hasManuallySwitched, setSelectedNetworkId, switchChain, getChainIdFromNetworkId])

  // All chains (EVM + Stellar) where the selected asset is available used to
  // populate the chain picker with all options, not just those with wallet balances.
  const allChainsForAsset = useMemo(() => {
    const mainnetChainIds = [
      CHAIN_IDS.BSC_MAINNET,
      CHAIN_IDS.MONAD_MAINNET,
      CHAIN_IDS.ARBITRUM_MAINNET,
      CHAIN_IDS.ETHEREUM_MAINNET,
      CHAIN_IDS.POLYGON_MAINNET,
      CHAIN_IDS.AVALANCHE_MAINNET,
      CHAIN_IDS.BASE_MAINNET,
      CHAIN_IDS.SOMNIA_MAINNET,
    ]

    const evmChains: Array<{ chainId: number; chainName: string; balance: number; symbol: string }> = mainnetChainIds.flatMap(cId => {
      const markets = getMarketsForChain(cId)
      const match = markets.find(
        m => m.id === assetId || m.symbol.toUpperCase() === assetSymbol.toUpperCase()
      )
      if (!match) return []
      const cfg = Object.values(chainConfigs).find((c: any) => c.chainId === cId) as any
      return [{
        chainId: cId,
        chainName: (cfg?.chainNameReadable as string) ?? `Chain ${cId}`,
        balance: 0,
        symbol: assetSymbol,
      }]
    })

    // Include Stellar if the asset exists there
    if (stellarTxAssetId) {
      evmChains.push({
        chainId: CHAIN_IDS.STELLAR_MAINNET,
        chainName: "Stellar",
        balance: 0,
        symbol: assetSymbol,
      })
    }

    return evmChains
  }, [assetId, assetSymbol, stellarTxAssetId])

  // Map balances for the dropdown only include chains where the user actually holds funds.
  const assetBalances = useMemo(() => {
    const balanceByChain = new Map(walletBalancesIncludingStellar.map(wb => [wb.chainId, wb.balance]))
    return allChainsForAsset
      .map(chain => ({ ...chain, balance: balanceByChain.get(chain.chainId) ?? 0 }))
      .filter(chain => chain.balance > 0)
  }, [allChainsForAsset, walletBalancesIncludingStellar])

  const { numericBalance: currentBalance } = useWalletBalance({ assetId })

  // Total wallet balance across all configured chains for the selected asset.
  // Used for the trigger display to avoid showing 0 when the wallet's current chain
  // doesn't have the asset contract configured (e.g. BSC hub with USDC spoke address).
  // The cross-chain multicall queries all chains simultaneously and is more reliable
  // than the single-chain read in useWalletBalance on first load.
  const displayBalance = useMemo(
    () => walletBalancesIncludingStellar.reduce((sum, wb) => sum + wb.balance, 0),
    [walletBalancesIncludingStellar]
  )

  // When Stellar network is active, useActiveWallet returns the Freighter address.
  // useCrossChainBalances then uses useStellarPortfolioPositions internally, so
  // Stellar positions are ALREADY included in totalSupplied.
  // Adding stellarSuppliedUsd on top would double-count.
  // When EVM is active, useStellarPortfolioPositions is disabled (stellarAddress = null),
  // so stellarSuppliedUsd is the only Stellar source and must be added.
  const isOnStellar = isStellarNetwork(selectedNetworkId)

  // Persist APY and yearly earnings from EVM so Stellar doesn't overwrite them.
  // mergeWithStellarPositions dilutes APY to ~0 because Stellar positions have no
  // APY data in the DB (stellarAnnualNet = 0 but Stellar supply grows the denominator).
  const [persistedApy, setPersistedApy] = useState(0)
  const [persistedYearlyEarnings, setPersistedYearlyEarnings] = useState(0)
  useEffect(() => {
    if (isOnStellar) return
    const apy = Number(liveNetAPY || netAPY) || 0
    if (apy > 0) setPersistedApy(apy)
    setPersistedYearlyEarnings(netEarningsUSD)
  }, [isOnStellar, liveNetAPY, netAPY, netEarningsUSD])

  const stats = useMemo(() => ({
    supplied: isOnStellar ? totalSupplied : totalSupplied + stellarSuppliedUsd,
    earned: totalLifetimeEarnings,
    apy: isOnStellar ? persistedApy : (Number(liveNetAPY || netAPY) || 0),
    potentialYearly: isOnStellar ? persistedYearlyEarnings : netEarningsUSD,
  }), [isOnStellar, totalSupplied, stellarSuppliedUsd, totalLifetimeEarnings, persistedApy, liveNetAPY, netAPY, persistedYearlyEarnings, netEarningsUSD])

  const isStatsLoading = isBalancesLoading || earningsLoading || isStellarSuppliedLoading

  // Aggregate supplied USD per asset symbol for dropdown balance display
  const suppliedPerSymbol = useMemo(() => {
    const map: Record<string, number> = {}
    allPositions.forEach(p => {
      const key = p.symbol.toUpperCase()
      map[key] = (map[key] || 0) + p.suppliedValueUSD
    })
    return map
  }, [allPositions])

  // Persist wallet balances per symbol across asset switches.
  // Once a positive balance is loaded for any asset, it stays visible in the picker
  // until a successful transaction clears the cache and forces a fresh fetch.
  const [persistedWalletBalances, setPersistedWalletBalances] = useState<Record<string, number>>({})

  useEffect(() => {
    const updates: Record<string, number> = {}
    walletBalancesIncludingStellar.forEach(wb => {
      if (wb.balance > 0) {
        const key = wb.symbol.toUpperCase()
        updates[key] = (updates[key] || 0) + wb.balance
      }
    })
    if (Object.keys(updates).length === 0) return
    setPersistedWalletBalances(prev => {
      let changed = false
      const next = { ...prev }
      Object.entries(updates).forEach(([sym, bal]) => {
        if (next[sym] !== bal) { next[sym] = bal; changed = true }
      })
      return changed ? next : prev
    })
  }, [walletBalancesIncludingStellar])

  // Clear persisted balances after a tx so fresh data is loaded
  useEffect(() => {
    const onTxSuccess = () => setPersistedWalletBalances({})
    window.addEventListener("peridot:tx-success" as any, onTxSuccess)
    return () => window.removeEventListener("peridot:tx-success" as any, onTxSuccess)
  }, [])

  // MAX button: wallet balance for supply, available borrow power for borrow
  // Cross-chain supply via Biconomy charges a fee on top of the supplied amount
  // (e.g. 100 USDC supplied costs ~101–102 USDC from wallet). Reserve 2.5% so
  // the MAX button never sets an amount the wallet cannot cover.
  const BICONOMY_FEE_BUFFER = 0.025

  const maxAmount = useMemo(() => {
    if (mode === "borrow") {
      const price = selectedAsset.price || (selectedAsset as any).oraclePrice || 1
      return price > 0 ? (borrowTx.borrowingPower?.availableBorrowingPowerUSD || 0) / price : 0
    }
    // Stablecoins go in at 100%; native XLM keeps a reserve back for the
    // account minimum + Soroban fees (see supplyMaxAmount).
    if (isStellarTxMode) return supplyMaxAmount(stellarBalance || 0, assetId)
    const raw = supplyMaxAmount(currentBalance || 0, assetId)
    return supplyTx.isBiconomyCrossChain ? raw * (1 - BICONOMY_FEE_BUFFER) : raw
  }, [mode, isStellarTxMode, stellarBalance, currentBalance, assetId, supplyTx.isBiconomyCrossChain, borrowTx.borrowingPower?.availableBorrowingPowerUSD, selectedAsset.price, (selectedAsset as any).oraclePrice])

  const handleMax = useCallback(() => {
    // Compute max in USD for the USD-first input
    let maxUsd: number
    if (mode === "borrow" && !isStellarTxMode) {
      maxUsd = borrowTx.borrowingPower?.availableBorrowingPowerUSD || 0
    } else {
      maxUsd = maxAmount * assetPrice
    }
    if (maxUsd <= 0) return
    setUsdInput(maxUsd.toFixed(2))
  }, [mode, isStellarTxMode, maxAmount, assetPrice, borrowTx.borrowingPower?.availableBorrowingPowerUSD])

  // Stable callback for the chain picker dropdown. Inline arrow functions in JSX
  // create a new reference every render; ChainBalanceDropdown (and any memo'd
  // children it has) would re-render needlessly on every EasyModeCard update.
  const handleChainSelect = useCallback((cid: number) => {
    setHasManuallySwitched(true)
    const nid = getNetworkIdFromChainId(cid)
    if (nid) {
      setSelectedNetworkId(nid)
      if (nid !== STELLAR_NETWORK_ID && switchChain) {
        switchChain({ chainId: cid })
      }
    }
  }, [setSelectedNetworkId, setHasManuallySwitched, switchChain])

  // APY tooltip content recalculates whenever the relevant APY values change
  const apyTooltipContent = useMemo((): InfoTooltipContent => ({
    title: "Net APY",
    description: "Your portfolio's net annual yield across all positions.",
    calculation: [
      { label: "Supply APY",   value: `${weightedSupplyAPY.toFixed(2)}%` },
      { label: "Rewards APY",  value: `+${weightedSupplyRewardsAPY.toFixed(2)}%` },
      { label: "Borrow Cost",  value: `-${weightedBorrowAPY.toFixed(2)}%` },
      { separator: true },
      { label: "Net APY",      value: `${stats.apy.toFixed(2)}%`, highlight: true },
    ],
    note: "Weighted across all supplied and borrowed positions.",
  }), [weightedSupplyAPY, weightedSupplyRewardsAPY, weightedBorrowAPY, stats.apy])

  const potentialYearlyTooltipContent = useMemo((): InfoTooltipContent => ({
    title: "Potential Yearly Gain",
    description: "An estimate of how much you'd earn in one year at your current deposit and net APY.",
    calculation: [
      { label: "Supplied",         value: `$${stats.supplied.toFixed(2)}` },
      { label: "× Net APY",        value: `${stats.apy.toFixed(2)}%` },
      { separator: true },
      { label: "Est. yearly gain", value: `$${stats.potentialYearly.toFixed(2)}`, highlight: true },
    ],
    note: "Based on current rates. Actual returns will vary.",
  }), [stats.supplied, stats.apy, stats.potentialYearly])

  // Borrow mode inline hint: detect collateral state
  const borrowHint = useMemo(() => {
    if (mode !== "borrow" || isStellarTxMode || isStatsLoading) return null
    const hasSupply = stats.supplied > 0
    const hasBorrowPower = (borrowTx.borrowingPower?.availableBorrowingPowerUSD ?? 0) > 0
    if (hasSupply && !hasBorrowPower) return "collateral-not-enabled"
    if (!hasSupply) return "no-supply"
    return null
  }, [mode, isStellarTxMode, isStatsLoading, stats.supplied, borrowTx.borrowingPower?.availableBorrowingPowerUSD])

  // Sort asset picker by best APY in supply mode so top earners surface first
  const displayMarkets = useMemo(() => {
    if (mode !== "supply") return availableMarkets
    return [...availableMarkets].sort((a, b) => {
      const apyA = bestApyPerAsset[a.id] || 0
      const apyB = bestApyPerAsset[b.id] || 0
      return apyB - apyA
    })
  }, [availableMarkets, mode, bestApyPerAsset])

  return (
    <div className="w-full max-w-full md:max-w-md mx-auto relative z-10 px-px md:px-4">
      {/* Liquid Glass Card */}
      <div className={cn(
        "relative rounded-none md:rounded-[2rem] overflow-hidden backdrop-blur-3xl bg-white/5 border-y md:border transition-all duration-700 md:shadow-2xl",
        isTxActiveGlobally ? "border-emerald-500/50 md:shadow-[0_0_40px_rgba(16,185,129,0.2)]" : "border-white/10"
      )}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-emerald-500/5 opacity-50 pointer-events-none" />
        
        {/* Header Stats */}
        <div className="relative p-6 pb-0 text-center space-y-6">
           <div className="space-y-1">
             <div className="text-sm text-muted-foreground font-medium flex items-center justify-center gap-1.5">
               Estimated Yearly Gain
               <InfoTooltip content={potentialYearlyTooltipContent} side="bottom">
                 <CircleHelp className="w-3.5 h-3.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors" />
               </InfoTooltip>
             </div>
             {isStatsLoading ? (
               <div className="mx-auto h-9 w-40 rounded-2xl bg-white/10 animate-pulse" />
             ) : (
               <div className="text-4xl font-black tracking-tighter text-foreground drop-shadow-[0_0_15px_rgba(0,0,0,0.1)] dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                 ${stats.potentialYearly.toFixed(2)} <span className="text-lg text-muted-foreground align-top">USD</span>
               </div>
             )}
           </div>

           <div className="grid grid-cols-3 gap-0 pt-4 divide-x divide-foreground/10">
              <div className="px-2">
                <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1 flex items-center justify-center gap-1">
                  Deposited
                  <InfoTooltip content={suppliedTooltipContent} side="top">
                    <CircleHelp className="w-2.5 h-2.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors" />
                  </InfoTooltip>
                </div>
                {isStatsLoading ? (
                  <div className="h-5 w-16 mx-auto rounded-full bg-white/10 animate-pulse" />
                ) : (
                  <div className="text-sm font-bold text-foreground">
                    ${stats.supplied.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                )}
              </div>
              <div className="px-2">
                <div className="text-[10px] text-emerald-400 uppercase font-bold mb-1 flex items-center justify-center gap-1">
                  Earned
                  <InfoTooltip content={earnedTooltipContent} side="top">
                    <CircleHelp className="w-2.5 h-2.5 text-emerald-400/50 hover:text-emerald-400 transition-colors" />
                  </InfoTooltip>
                </div>
                {isStatsLoading ? (
                  <div className="h-5 w-16 mx-auto rounded-full bg-emerald-500/20 animate-pulse" />
                ) : (
                  <div className="text-sm font-bold text-emerald-400">
                    {/* Live-accruing — see EasyCardDev / PortfolioHero. */}
                    <LiveEarningsValue
                      base={stats.earned}
                      balanceUsd={stats.supplied}
                      apyPercent={Number(stats.apy) || 0}
                    />
                  </div>
                )}
              </div>
              <div className="px-2">
                 <div className="text-[10px] text-emerald-400 uppercase font-bold mb-1 flex items-center justify-center gap-1">
                   APY
                   <InfoTooltip content={apyTooltipContent} side="top">
                     <CircleHelp className="w-2.5 h-2.5 text-emerald-400/60 hover:text-emerald-400 transition-colors" />
                   </InfoTooltip>
                 </div>
                 {isStatsLoading ? (
                   <div className="h-5 w-12 mx-auto rounded-full bg-emerald-500/20 animate-pulse" />
                 ) : (
                   <div className="text-sm font-bold text-emerald-400 flex items-center justify-center gap-1">
                     {(Number(stats.apy) || 0).toFixed(2)}% <ArrowUpRight className="w-3 h-3" />
                   </div>
                 )}
              </div>
           </div>
        </div>

        {/* Interaction Area */}
        <div className="p-6 pt-8 space-y-6 relative z-20">
          <EasyModeTxStatus />
          
          <Tabs value={mode} onValueChange={(v) => setMode(v as "supply" | "borrow")} className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-12 rounded-2xl bg-foreground/5 dark:bg-black/40 p-1 border border-foreground/10 relative z-30">
              <TabsTrigger
                value="supply"
                className="rounded-xl font-bold data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-emerald-500/20 transition-all cursor-pointer relative z-40"
              >
                <span className="flex items-center gap-1.5">
                  EARN
                  <InfoTooltip content={supplyTooltipContent} side="top">
                    <CircleHelp className="w-3 h-3 opacity-40 hover:opacity-80 transition-opacity" />
                  </InfoTooltip>
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="borrow"
                className="rounded-xl font-bold data-[state=active]:bg-background/50 dark:data-[state=active]:bg-white/10 data-[state=active]:text-foreground transition-all cursor-pointer relative z-40"
              >
                <span className="flex items-center gap-1.5">
                  BORROW
                  <InfoTooltip content={borrowTooltipContent} side="top">
                    <CircleHelp className="w-3 h-3 opacity-40 hover:opacity-80 transition-opacity" />
                  </InfoTooltip>
                </span>
              </TabsTrigger>
            </TabsList>
            
            <div className="mt-8 space-y-6 relative z-30">
               <div className="p-5 rounded-3xl bg-foreground/5 dark:bg-black/20 border border-foreground/10 relative group transition-all focus-within:border-emerald-500/50 focus-within:bg-foreground/[0.08] dark:focus-within:bg-black/30">
                 <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-muted-foreground font-medium">Amount in USD</span>
                    <div className="flex items-center gap-3">
                      {mode === "supply" && !isStellarTxMode && (
                        <ChainBalanceDropdown
                          balances={assetBalances}
                          currentBalance={displayBalance || currentBalance}
                          symbol={assetSymbol}
                          valueUsd={(displayBalance || currentBalance) * assetPrice}
                          assetPrice={assetPrice}
                          onSelectChain={handleChainSelect}
                        />
                      )}

                      {/* Asset picker just the coin icon */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="relative flex items-center justify-center w-5 h-5 rounded-full ring-1 ring-foreground/10 hover:ring-foreground/25 transition-all active:scale-95 cursor-pointer">
                            {selectedAsset.icon ? (
                              <Image src={selectedAsset.icon} alt={assetSymbol} width={20} height={20} className="rounded-full" unoptimized />
                            ) : (
                              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" sideOffset={10} className="w-60 p-0 bg-background border border-foreground/[0.08] rounded-2xl shadow-2xl z-50 overflow-hidden">
                          <div className="px-4 pt-3.5 pb-2.5 border-b border-foreground/[0.06]">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">Select asset</p>
                          </div>
                          <div className="p-2 max-h-[340px] overflow-y-auto space-y-px">
                            {displayMarkets.map((asset) => {
                              if (!asset) return null
                              const symKey = asset.symbol.toUpperCase()
                              const walletBal = persistedWalletBalances[symKey] || 0
                              const suppliedUsd = suppliedPerSymbol[symKey] || 0
                              const showWallet = walletBal > 0
                              const showSupplied = !showWallet && suppliedUsd > 0
                              const bestApy = bestApyPerAsset[asset.id] || 0
                              const isSelected = selectedAssetId === asset.id
                              return (
                                <button
                                  key={asset.id}
                                  onClick={() => {
                                    previousAssetIdRef.current = selectedAssetId
                                    setSelectedAssetId(asset.id)
                                    setHasManuallySwitched(false)
                                  }}
                                  className={cn(
                                    "w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors text-left group",
                                    isSelected ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.04]",
                                    !asset.hasSmartContract && "opacity-40 pointer-events-none"
                                  )}
                                  disabled={!asset.hasSmartContract}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    {asset.icon ? (
                                      <Image src={asset.icon} alt={asset.symbol} width={20} height={20} className="rounded-full shrink-0" unoptimized />
                                    ) : (
                                      <DollarSign className="w-4 h-4 shrink-0 text-muted-foreground" />
                                    )}
                                    <div className="min-w-0">
                                      <p className={cn("text-[13px] font-semibold leading-none", isSelected ? "text-foreground" : "text-foreground/70 group-hover:text-foreground/90")}>
                                        {asset.symbol}
                                      </p>
                                      {!asset.hasSmartContract && (
                                        <p className="text-[10px] text-muted-foreground/40 mt-0.5">Soon</p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 ml-2">
                                    {mode === "supply" && bestApy > 0 && (
                                      <span className="text-[11px] font-bold text-emerald-500 tabular-nums">{bestApy.toFixed(2)}%</span>
                                    )}
                                    {showWallet && (
                                      <span className="text-[11px] text-muted-foreground/50 tabular-nums">${(walletBal * ((asset as any).price || 1)).toFixed(2)}</span>
                                    )}
                                    {showSupplied && (
                                      <span className="text-[11px] text-emerald-500/60 tabular-nums">${suppliedUsd.toFixed(2)}</span>
                                    )}
                                    {isSelected && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>

                      {maxAmount > 0 && (
                        <button
                          onClick={handleMax}
                          className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 active:scale-95 transition-all"
                        >
                          MAX
                        </button>
                      )}
                    </div>
                 </div>

                 <div className="flex items-center">
                   <span className="text-4xl font-bold text-foreground/30 select-none mr-1">$</span>
                   <Input
                     type="text"
                     inputMode="decimal"
                     placeholder="0.00"
                     value={usdInput}
                     onChange={(e) => {
                       // Normalize comma → period (European keyboards) then strip non-numeric
                       const withPeriod = e.target.value.replace(/,/g, '.')
                       const clean = withPeriod.replace(/[^0-9.]/g, '')
                       // Allow only one decimal point
                       const firstDot = clean.indexOf('.')
                       const normalized = firstDot === -1
                         ? clean
                         : clean.slice(0, firstDot + 1) + clean.slice(firstDot + 1).replace(/\./g, '')
                       setUsdInput(normalized)
                     }}
                     className="h-14 text-4xl font-bold bg-transparent border-0 p-0 focus-visible:ring-0 text-foreground placeholder:text-foreground/20 transition-all w-full"
                   />
                 </div>

                 {usdInput && parseFloat(usdInput) > 0 && amount && (
                   <div className="mt-1.5 text-[11px] text-muted-foreground/60 tabular-nums">
                     ≈ {parseFloat(amount) < 0.0001
                       ? parseFloat(amount).toPrecision(3)
                       : parseFloat(amount) < 1
                         ? parseFloat(amount).toFixed(6).replace(/\.?0+$/, "")
                         : parseFloat(amount).toFixed(4).replace(/\.?0+$/, "")} {assetSymbol}
                   </div>
                 )}

                 {mode === "borrow" && !isStellarTxMode && (
                   <div className="mt-2 pt-2 border-t border-foreground/10 flex items-center gap-1.5 text-xs text-muted-foreground">
                     <span className="flex items-center gap-1">
                       Available to borrow
                       <InfoTooltip content={availableToBorrowTooltipContent} side="top">
                         <CircleHelp className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors" />
                       </InfoTooltip>
                       :
                     </span>
                     <span className={cn(
                       "font-bold tabular-nums",
                       (borrowTx.borrowingPower?.availableBorrowingPowerUSD ?? 0) > 0
                         ? "text-emerald-400"
                         : "text-muted-foreground"
                     )}>
                       ${(borrowTx.borrowingPower?.availableBorrowingPowerUSD ?? 0).toFixed(2)}
                     </span>
                   </div>
                 )}
               </div>

              {borrowHint === "collateral-not-enabled" && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs animate-in fade-in slide-in-from-top-1">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span className="flex-1 leading-relaxed">Your supply isn't counted as collateral yet.</span>
                  <button
                    onClick={() => enableCollateralTx.executeEnableCollateral()}
                    disabled={enableCollateralTx.step === "entering"}
                    className="font-bold underline underline-offset-2 shrink-0 disabled:opacity-50"
                  >
                    {enableCollateralTx.step === "entering" ? "Enabling…" : "Enable →"}
                  </button>
                </div>
              )}

              {borrowHint === "no-supply" && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-foreground/5 border border-foreground/10 text-muted-foreground text-xs animate-in fade-in slide-in-from-top-1">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>Supply assets first to unlock borrowing.</span>
                </div>
              )}

              {txError && (
                <p className="text-[10px] text-red-400 text-center animate-in fade-in slide-in-from-top-1 px-4">
                  {txError}
                </p>
              )}

              <Button
                className="w-full h-14 rounded-2xl text-lg font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 bg-emerald-600 hover:bg-emerald-500 text-white transition-all active:scale-[0.98] uppercase tracking-wide disabled:opacity-50"
                size="lg"
                onClick={handleAction}
                disabled={isLoading || !usdInput || parseFloat(usdInput) <= 0}
              >
                {getButtonText()}
                {!isLoading && <ArrowUpRight className="ml-2 w-5 h-5" />}
                {isLoading && <div className="ml-2 w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              </Button>
            </div>
            
          </Tabs>

          {/* Footer actions */}
          <div className="border-t border-foreground/[0.07] grid grid-cols-2 divide-x divide-foreground/[0.07] relative z-30">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsMgmtModalOpen(true) }}
              className="flex items-center justify-center gap-2 py-3.5 text-[11px] font-medium text-muted-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.03] transition-colors cursor-pointer"
            >
              <History className="w-3.5 h-3.5" />
              Positions
            </button>
            <Link
              href="/app/easy/history"
              className={cn(
                "flex items-center justify-center gap-2 py-3.5 text-[11px] font-medium transition-colors",
                stats.supplied > 0
                  ? "text-muted-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.03]"
                  : "text-muted-foreground/20 pointer-events-none"
              )}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Progress
            </Link>
          </div>
        </div>
      </div>

      {isMgmtModalOpen && (
        <Suspense fallback={null}>
          <EasyManagementModal
            open={isMgmtModalOpen}
            onOpenChange={setIsMgmtModalOpen}
          />
        </Suspense>
      )}
    </div>
  )
}
