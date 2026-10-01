"use client"

import {
  useState,
  useMemo,
  useCallback,
  useEffect,
} from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowUpRight,
  Banknote,
  CreditCard,
  ChevronRight,
  History,
  Loader2,
  TrendingUp,
  DollarSign,
  Check,
  ChevronDown,
  User,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { usePortfolioEarnings } from "@/hooks/use-portfolio-earnings"
import { LiveEarningsValue } from "@/components/shared/LiveEarnings"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { useApyData } from "@/hooks/use-apy-data"
import {
  useMultiChainTokenBalances,
  type ChainAssets,
} from "@/hooks/use-multi-chain-token-balances"
import { EasyModeTxStatus } from "./EasyModeTxStatus"
import { FirstRunIntro, hasCompletedFirstRunIntro, getSavedGoal, useFirstRunIntro, type SavedGoal } from "./FirstRunIntro"
import { openAddMoney as openAddMoneySheet } from "@/lib/onramp/add-money"
import { useBridgeBalance } from "@/hooks/use-bridge-balance"
import { useLogin } from "@privy-io/react-auth"
import { useDemoMode } from "@/context/demo-mode"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import {
  getAssetById,
  combinedMarkets,
  getMarketsForChain,
  getStellarSorobanMarkets,
} from "@/data/market-data"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { useStellarSendBalances } from "@/hooks/use-stellar-send-balances"
import { useQuery } from "@tanstack/react-query"
import { useMeldReconcileOnLoad } from "@/hooks/use-meld-reconcile-on-load"
import { stellarFetchPrice } from "@/lib/stellar-soroban-lending"
import { CHAIN_IDS, isEvmAddress } from "@/config/contracts"
import { useStellarOnly } from "@/config/stellarOnly"
import { useStellarSheets } from "@/context/stellar-sheets"
import { StellarOnlyBanner } from "@/components/app/StellarOnlyBanner"
import { toast } from "sonner"

// ─── Cross-chain holdings derivation ──────────────────────────────────────────
//
// Holdings come from `useMultiChainTokenBalances`, which already scans every
// configured mainnet chain (BSC + Arbitrum + Ethereum + Polygon + Base +
// Avalanche + Monad) for native + USDC + USDT + WETH + WBNB. We derive a
// per-asset breakdown to drive (a) auto-selection (which stable to default to)
// and (b) the deposit cap (the largest single-chain balance, since Biconomy
// can only route from one chain at a time).

// Biconomy supports these spoke chains for cross-chain routing into the BSC
// hub. Holdings on other chains (e.g. Monad) cannot be the source of a deposit
// — they're excluded from both the displayed total and the cap.
const BICONOMY_SUPPORTED_SPOKE_IDS = new Set<number>([
  1, 10, 137, 42161, 8453, 43114,
])

// Stables we scan for auto-selection. Limited to what
// `useMultiChainTokenBalances` actually queries on mainnet.
const SCANNED_STABLE_IDS = ["usdc", "usdt"] as const

interface AssetHoldings {
  /** Sum across hub + Biconomy-supported spokes. Excludes unsupported chains. */
  total: number
  /** BSC mainnet balance — sponsored if used as source (no Biconomy fee). */
  hubBalance: number
  /** Highest-balance Biconomy spoke (for cross-chain routing). */
  bestSpokeChainId?: number
  bestSpokeBalance: number
  /**
   * Best single-deposit source — `max(hubBalance, bestSpokeBalance)`.
   * Hub wins ties because it's sponsored. This is the cap the input must
   * respect; amounts above it require splitting across multiple deposits.
   */
  bestSingleChainId?: number
  bestSingleBalance: number
}

function deriveAssetHoldings(chains: ChainAssets[], symbol: string): AssetHoldings {
  const symUp = symbol.toUpperCase()
  let total = 0
  let hubBalance = 0
  let bestSpokeChainId: number | undefined
  let bestSpokeBalance = 0

  for (const chain of chains) {
    const token = chain.tokens.find((t) => t.symbol === symUp)
    if (!token) continue
    const bal = parseFloat(token.balanceFormatted)
    if (!isFinite(bal) || bal <= 0) continue

    if (chain.chainId === CHAIN_IDS.BSC_MAINNET) {
      hubBalance = bal
      total += bal
    } else if (BICONOMY_SUPPORTED_SPOKE_IDS.has(chain.chainId)) {
      total += bal
      // Strict `>`: ties keep the first chain seen (stable iteration order).
      if (bal > bestSpokeBalance) {
        bestSpokeBalance = bal
        bestSpokeChainId = chain.chainId
      }
    }
    // Other chains (e.g. Monad) aren't depositable via this flow → excluded.
  }

  // Hub wins ties to prefer the sponsored route.
  let bestSingleChainId: number | undefined
  let bestSingleBalance = 0
  if (hubBalance >= bestSpokeBalance && hubBalance > 0) {
    bestSingleChainId = CHAIN_IDS.BSC_MAINNET
    bestSingleBalance = hubBalance
  } else if (bestSpokeBalance > 0) {
    bestSingleChainId = bestSpokeChainId
    bestSingleBalance = bestSpokeBalance
  }

  return {
    total,
    hubBalance,
    bestSpokeChainId,
    bestSpokeBalance,
    bestSingleChainId,
    bestSingleBalance,
  }
}

/** Minimum effective deposit accepted by the rest of the flow. Kept in one place. */
const MIN_DEPOSIT_USD = 1

// ─── Animation presets ────────────────────────────────────────────────────────
// All curves follow TR/native-UX physics: deceleration, never linear.

// OutCubic — standard for fades, panels, slides
const OUT_CUBIC = [0.22, 0, 0.36, 1] as const
// OutQuart — more dramatic, for height expansions / important state transitions
const OUT_QUART = [0.25, 0.46, 0.45, 0.94] as const

const FADE_DOWN = {
  initial:    { opacity: 0 },
  animate:    { opacity: 1 },
  exit:       { opacity: 0 },
  transition: { duration: 0.25, ease: OUT_CUBIC },
}

const FADE = {
  initial:    { opacity: 0 },
  animate:    { opacity: 1 },
  exit:       { opacity: 0 },
  transition: { duration: 0.2, ease: OUT_CUBIC },
}

// Height-based expand/collapse — OutQuart feels organic, not mechanical
const HEIGHT_EXPAND = {
  initial:    { opacity: 0, height: 0 },
  animate:    { opacity: 1, height: "auto" },
  exit:       { opacity: 0, height: 0 },
  transition: { duration: 0.25, ease: OUT_QUART },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EasyCardDev() {
  // Catch Meld card funding that landed while the tab was closed.
  useMeldReconcileOnLoad()
  // Host-gated Stellar-only presentation (peridot.finance → Stellar; v1.* → full).
  const stellarOnly = useStellarOnly()
  const { address: walletAddress } = useActiveWallet()
  const stellarWallet = useStellarWallet()
  // Hoisted from below — auto-asset-selection needs to see Stellar balances to
  // default to USDC/EURC on Stellar when the user only has Freighter/xBull
  // connected. React Query dedupes the underlying request across consumers.
  const stellarBalances = useStellarSendBalances()
  const { isDemoMode, setDemoMode } = useDemoMode()

  const [usdInput, setUsdInput] = useState("")
  const [selectedAssetId, setSelectedAssetId] = useState("usdc")
  const [hasManuallySelected, setHasManuallySelected] = useState(false)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)

  // Saved goal from the first-run intro (Step 2). Reactive: FirstRunIntro
  // fires a `peridot:goal-saved` event when the user confirms, so the
  // empty-state pitch + Add-money CTA personalize the moment the overlay
  // closes. Lives in localStorage only — no DB writes for the minimum cut.
  const [savedGoal, setSavedGoal] = useState<SavedGoal | null>(() => getSavedGoal())
  useEffect(() => {
    const onSaved = (e: Event) => setSavedGoal((e as CustomEvent<SavedGoal>).detail ?? getSavedGoal())
    window.addEventListener("peridot:goal-saved", onSaved as EventListener)
    return () => window.removeEventListener("peridot:goal-saved", onSaved as EventListener)
  }, [])

  // Suggested first deposit toward the goal: ~1/12 of the target (one month's
  // worth), rounded to a clean €10. Floored at €50 so the CTA always names a
  // commit that's worth the friction of paying in.
  const firstDepositEur = useMemo(() => {
    if (!savedGoal) return null
    return Math.max(50, Math.round(savedGoal.amount / 12 / 10) * 10)
  }, [savedGoal])

  // ── APY data (shared via React Query cache — one request across all tabs) ──

  const { liveApyData, bestApyPerAsset } = useApyData()

  // ── Cross-chain holdings (drives auto-selection + Available + cap) ────────
  //
  // Single multicall pass shared with the WalletManagementDialog ↦
  // <AssetsAcrossChains> via React Query, so opening the wallet sheet first
  // makes this an instant cache hit.
  const {
    chains: holdingsChains,
    isLoading: isHoldingsLoading,
    hasAnyLoaded: hasHoldingsLoaded,
  } = useMultiChainTokenBalances(walletAddress as string | undefined)

  // ── Auto-select the asset the user actually holds, fall back to best APY ──
  //
  // Trade-Republic-style: don't make the user think. If they hold USDC on Base
  // we default to USDC even when USDT has the higher yield. Manual picks are
  // respected (`hasManuallySelected`). APY-only fallback fires only when the
  // user holds nothing scannable.
  const STABLE_IDS = ["usdc", "usdt", "dai", "busd"]

  // Stellar-only mode: user has Freighter/xBull but no EVM signer. Falling
  // through to the EVM holdings scan would default them to an EVM USDC they
  // can't deposit without first bridging. Default to the Stellar stable they
  // actually hold (USDC > EURC), and to USDC-stellar when both are empty.
  // `walletAddress` is the active wallet (`useActiveWallet`) — for Stellar-
  // only users it returns the G-address, which is truthy. Test for EVM-shape
  // explicitly so the Stellar branch fires correctly in that case.
  const isStellarOnlyMode = stellarWallet.isConnected && !isEvmAddress(walletAddress)

  useEffect(() => {
    if (hasManuallySelected) return

    // 0. Stellar-only: prefer the Soroban stable with the largest balance.
    //    Also forced on the Stellar-only host — even for EVM-wallet users — so
    //    the default never lands on a now-hidden EVM stable.
    if (isStellarOnlyMode || stellarOnly) {
      const usdcTok = stellarBalances.tokens.find((t) => t.symbol === "USDC")
      const eurcTok = stellarBalances.tokens.find((t) => t.symbol === "EURC")
      const usdcBal = usdcTok ? parseFloat(usdcTok.balanceFormatted) || 0 : 0
      const eurcBal = eurcTok ? parseFloat(eurcTok.balanceFormatted) || 0 : 0
      if (usdcBal > 0 || eurcBal > 0) {
        setSelectedAssetId(eurcBal > usdcBal ? "eurc-stellar" : "usdc-stellar")
      } else {
        setSelectedAssetId("usdc-stellar")
      }
      return
    }

    // 1. Holdings-driven: pick the scanned stable with the highest total.
    if (hasHoldingsLoaded) {
      let bestHoldingsId: string | undefined
      let bestHoldingsTotal = 0
      for (const id of SCANNED_STABLE_IDS) {
        const market = combinedMarkets.find((m) => m.id === id)
        if (!market) continue
        const h = deriveAssetHoldings(holdingsChains, market.symbol)
        // Strict `>`: ties keep the first scanned (USDC priority).
        if (h.total > bestHoldingsTotal) {
          bestHoldingsTotal = h.total
          bestHoldingsId = id
        }
      }
      if (bestHoldingsId) {
        setSelectedAssetId(bestHoldingsId)
        return
      }
    }

    // 2. APY fallback: best-yielding stable, or global best if no APY data yet.
    if (!bestApyPerAsset || Object.keys(bestApyPerAsset).length === 0) return
    let bestId = "usdc"
    let bestRate = -1
    for (const id of STABLE_IDS) {
      const rate = bestApyPerAsset[id] ?? 0
      if (rate > bestRate) { bestRate = rate; bestId = id }
    }
    if (bestRate <= 0) {
      for (const [id, rate] of Object.entries(bestApyPerAsset)) {
        if (rate > bestRate) { bestRate = rate; bestId = id }
      }
    }
    setSelectedAssetId(bestId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bestApyPerAsset, hasManuallySelected, hasHoldingsLoaded, holdingsChains, isStellarOnlyMode, stellarOnly, stellarBalances.tokens])

  // ── Portfolio ─────────────────────────────────────────────────────────────

  const {
    totalSupplied,
    weightedSupplyAPY,
    weightedSupplyRewardsAPY,
    isLoading: isBalancesLoading,
  } = useCrossChainBalances(liveApyData)

  const { totalLifetimeEarnings, isLoading: earningsLoading } = usePortfolioEarnings()
  // Bridge-managed Euro balance — money the user funded via SEPA that hasn't
  // been deposited into a vault yet. Distinct from `totalSupplied` (which is
  // money already earning). Only rendered when there's something to show.
  const bridgeBalance = useBridgeBalance()
  const bridgeBalanceTotal = bridgeBalance.available + bridgeBalance.pending

  const isStatsLoadingRaw = isBalancesLoading || earningsLoading
  // Cap skeleton at 6s — if data hasn't arrived by then, unblock the UI
  const [statsTimedOut, setStatsTimedOut] = useState(false)
  useEffect(() => {
    if (!isStatsLoadingRaw) { setStatsTimedOut(false); return }
    const t = setTimeout(() => setStatsTimedOut(true), 6000)
    return () => clearTimeout(t)
  }, [isStatsLoadingRaw])
  const isStatsLoading = isStatsLoadingRaw && !statsTimedOut

  // Give balances a chance to settle before flipping to "empty" state.
  // After the 6s skeleton timeout, trust cached totalSupplied even if RQ is still fetching,
  // otherwise the stats header vanishes on slow connections.
  const hasSupply = (!isBalancesLoading || statsTimedOut) && totalSupplied > 0.01

  // Lifted so the savings stats header + empty-state pitch can suppress
  // themselves while the first-run overlay is up — otherwise the loading
  // skeleton flashes through before the overlay covers the card.
  const { active: firstRunActive } = useFirstRunIntro({ hasSupply, isBalancesLoading })

  // ── Asset list (EVM mainnet only, deduped by symbol) ─────────────────────

  const availableMarkets = useMemo(() => {
    const mainnetChainIds = [
      CHAIN_IDS.BSC_MAINNET,
      CHAIN_IDS.MONAD_MAINNET,
      CHAIN_IDS.ARBITRUM_MAINNET,
      CHAIN_IDS.ETHEREUM_MAINNET,
      CHAIN_IDS.POLYGON_MAINNET,
      CHAIN_IDS.AVALANCHE_MAINNET,
      CHAIN_IDS.BASE_MAINNET,
    ]
    const validIds = new Set<string>()
    mainnetChainIds.forEach((cid) =>
      getMarketsForChain(cid).forEach((m) => validIds.add(m.id))
    )
    const HIDDEN_SYMBOLS = new Set(["ASTER", "CAKE"])
    const seenSymbols = new Set<string>()
    const evm = combinedMarkets
      .filter((a) => a.id && validIds.has(a.id) && a.hasSmartContract && !HIDDEN_SYMBOLS.has(a.symbol.toUpperCase()) && (a as any).category !== "stock")
      .sort((a, b) => {
        // Bubble assets with real APY data to the top
        const apyA = bestApyPerAsset[a.id] || 0
        const apyB = bestApyPerAsset[b.id] || 0
        if (apyB !== apyA) return apyB - apyA
        return a.symbol.localeCompare(b.symbol)
      })
      .filter((a) => {
        const sym = a.symbol.toUpperCase()
        if (seenSymbols.has(sym)) return false
        seenSymbols.add(sym)
        return true
      })

    // Stellar stables — pinned to the TOP of the list (USDC then EURC), ahead
    // of the APY-sorted EVM assets. Deduped after EVM so the same symbols
    // (USDC) don't collide. XLM is excluded: easy view only surfaces stables.
    const stellarStables = getStellarSorobanMarkets()
      .filter((m) => m.id === "usdc-stellar" || m.id === "eurc-stellar")
      .sort((a, b) => (a.id === "usdc-stellar" ? -1 : 1))
    // Stellar-only host (peridot.finance) hides the EVM pools entirely; the full
    // multi-chain picker stays on v1.peridot.finance.
    if (stellarOnly) return [...stellarStables]
    return [...stellarStables, ...evm]
  }, [bestApyPerAsset, stellarOnly])

  const selectedAsset = useMemo(
    () =>
      availableMarkets.find((m) => m.id === selectedAssetId) ??
      // Fallback must respect Stellar-only mode — never fall back to EVM USDC
      // when the EVM pools are hidden.
      getAssetById(stellarOnly ? "usdc-stellar" : "usdc")!,
    [availableMarkets, selectedAssetId, stellarOnly]
  )

  const assetId     = selectedAsset.id
  const assetSymbol = selectedAsset.symbol
  // Stellar assets live on Soroban — separate wallet stack (Freighter / xBull /
  // Albedo, or the Privy embedded wallet).
  const isStellarSelected = assetId.endsWith("-stellar")
  const assetPrice  = useMemo(
    () => (selectedAsset as any).price || (selectedAsset as any).oraclePrice || 1,
    [selectedAsset]
  )

  const bestApy = bestApyPerAsset[assetId] || 0
  const displayApy = (weightedSupplyAPY + weightedSupplyRewardsAPY) || bestApy

  // ── Holdings of the selected stable across hub + Biconomy spokes ──────────
  // Drives both the "Available" total and the per-deposit cap, since Biconomy
  // can only route from one chain per transaction.
  const assetHoldings = useMemo(
    () => deriveAssetHoldings(holdingsChains, assetSymbol),
    [holdingsChains, assetSymbol],
  )

  // ── Stellar balances + price (only used when a -stellar asset is picked) ──
  //
  // EVM `useMultiChainTokenBalances` doesn't scan Soroban — without this the
  // Available row would always read $0 even for a fully funded Freighter.
  // `stellarBalances` itself is hoisted to the top of the component so the
  // auto-select effect can read it before this section runs.
  const stellarBalanceRaw = useMemo(() => {
    if (!isStellarSelected) return 0
    const t = stellarBalances.tokens.find((tk) => tk.symbol === assetSymbol.toUpperCase())
    return t ? parseFloat(t.balanceFormatted) || 0 : 0
  }, [isStellarSelected, stellarBalances.tokens, assetSymbol])
  const stellarPriceQ = useQuery({
    queryKey: ["stellar-price", assetId],
    enabled: isStellarSelected,
    staleTime: 60_000,
    queryFn: () => stellarFetchPrice(assetId).then((p) => p ?? 1),
  })

  const enteredUSD       = parseFloat(usdInput) || 0
  const walletHasLoaded  = isStellarSelected
    ? !!stellarWallet.address && !stellarBalances.isLoading
    : !!walletAddress && hasHoldingsLoaded
  // True total across hub + spokes — what the user genuinely owns and can
  // eventually deposit (across one or more transactions). On Stellar this is
  // the single Freighter balance (no spokes).
  const displayBalanceUSD = isStellarSelected
    ? stellarBalanceRaw * (stellarPriceQ.data ?? 1)
    : assetHoldings.total * assetPrice
  const isOverBalance = walletHasLoaded && enteredUSD > 0 && enteredUSD > displayBalanceUSD

  // ── Hand-off to the deposit sheet ─────────────────────────────────────────
  //
  // The card only collects the intent. The deposit itself, and every way of
  // getting there when the wallet is short (money on another network, bank
  // transfer, card), runs in the shared deposit sheet, the same one desktop
  // opens. One flow means one set of checks, states and error copy.
  //
  // The card speaks dollars; the Stellar sheet takes token units, so a
  // non-stable (XLM) amount is converted at the oracle price first. The EVM
  // sheet takes the dollar figure as is.
  const { openDeposit } = useStellarSheets()
  const openDepositSheet = useCallback(() => {
    const usd = parseFloat(usdInput) || 0
    let defaultAmount: string | undefined
    if (usd > 0) {
      if (isStellarSelected) {
        const price = stellarPriceQ.data ?? 1
        defaultAmount = (usd / (price > 0 ? price : 1)).toFixed(7).replace(/\.?0+$/, "")
      } else {
        defaultAmount = usdInput
      }
    }
    openDeposit({ assetId, defaultAmount })
  }, [usdInput, isStellarSelected, stellarPriceQ.data, openDeposit, assetId])
  // ── Actions ───────────────────────────────────────────────────────────────

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const withPeriod = e.target.value.replace(/,/g, ".")
    const clean      = withPeriod.replace(/[^0-9.]/g, "")
    const firstDot   = clean.indexOf(".")
    const normalized =
      firstDot === -1
        ? clean
        : clean.slice(0, firstDot + 1) + clean.slice(firstDot + 1).replace(/\./g, "")
    setUsdInput(normalized)
  }, [])

  // Opens the one "Add money" sheet (card or bank transfer), seeded with the
  // pool and the amount typed on the card. A confirmed card purchase resumes
  // this deposit via /app/funded; the sheet handles that.
  const doOpenAddMoney = useCallback(() => {
    openAddMoneySheet({ assetId, defaultAmount: usdInput, defaultAmountCurrency: "usd" })
  }, [assetId, usdInput])

  // Demo-mode users have no wallet and no auth token, so funding can't work.
  // Tapping "Add money" routes them through sign-in first; once Privy login
  // completes we drop demo mode and resume the funding flow they asked for —
  // their intent is never lost.
  const { login } = useLogin({
    onComplete: () => {
      setDemoMode(false)
      // Brand-new accounts get the Welcome on landing — don't pop AddMoney
      // over it. Once they dismiss the Welcome they land on the empty-state
      // and can tap "Add money" themselves when they're ready.
      if (!hasCompletedFirstRunIntro()) return
      doOpenAddMoney()
    },
  })

  // Unified "Add money" entry point used by every funding call site.
  //
  // Demo mode can't move real funds, so we route through Privy login first.
  // Before opening the wallet picker we surface a one-line toast so the
  // user understands why the modal that comes next asks for a wallet
  // instead of showing card / bank options — otherwise the jump from
  // "Add money" to "Pick MetaMask / Coinbase / …" feels like a bug.
  const openAddMoney = useCallback(() => {
    if (isDemoMode) {
      toast.info("Sign in to add money", {
        description: "Demo mode can't move real funds — pick a wallet or use email.",
        duration: 4000,
      })
      login()
      return
    }
    doOpenAddMoney()
  }, [isDemoMode, login, doOpenAddMoney])

  // ── Helpers ───────────────────────────────────────────────────────────────

  const potentialYearlyEarn = useMemo(() => {
    const usd = parseFloat(usdInput)
    if (!usd || usd <= 0 || bestApy <= 0) return null
    return usd * (bestApy / 100)
  }, [usdInput, bestApy])

  // ── CTA state machine ──────────────────────────────────────────────────────
  //
  // One primary button, label + icon + action all derived from the current
  // wallet / balance / input state. Branches:
  //   - signin           demo mode, or nothing to sign with yet → Privy login
  //   - connect-stellar  Stellar market picked, no Stellar wallet yet
  //   - busy             balances still loading
  //   - topup            balance can't cover the entry → deposit sheet, which
  //                      offers the way to fill the gap (another network,
  //                      bank transfer, card)
  //   - save             balance is enough → deposit sheet, prefilled
  //
  // The label names what happens next; the sheet does it. Each branch is
  // mutually exclusive; the first matching condition wins.
  const cta = useMemo(() => {
    if (isDemoMode || (!walletAddress && !stellarWallet.isConnected)) {
      return { kind: "signin" as const, label: "Sign in to start", disabled: false }
    }

    if (isStellarSelected && !stellarWallet.isConnected) {
      return {
        kind: "connect-stellar" as const,
        label: stellarWallet.isLoading ? "Connecting…" : "Connect Stellar wallet",
        disabled: stellarWallet.isLoading,
      }
    }

    // Balances still loading: a neutral hold rather than promising an action
    // we can't yet name.
    if (!walletHasLoaded) {
      return { kind: "busy" as const, label: "Loading…", disabled: true }
    }

    if (displayBalanceUSD <= 0) {
      const label = firstDepositEur ? `Start with €${firstDepositEur}` : "Add money"
      return { kind: "topup" as const, label, disabled: false }
    }

    if (enteredUSD > displayBalanceUSD) {
      const short = enteredUSD - displayBalanceUSD
      const shortStr = short.toLocaleString(undefined, { maximumFractionDigits: 0 })
      return { kind: "topup" as const, label: `Top up $${shortStr} to continue`, disabled: false }
    }

    // EVM deposits carry a routing fee that comes out of the amount, so tiny
    // amounts can't be covered. Name the floor instead of greying out silently.
    // Stellar has no such fee; any positive amount works there.
    if (!isStellarSelected && enteredUSD > 0 && enteredUSD < MIN_DEPOSIT_USD) {
      return { kind: "save" as const, label: `Minimum is $${MIN_DEPOSIT_USD}`, disabled: true }
    }

    if (enteredUSD > 0) {
      const label = `Save $${enteredUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      return { kind: "save" as const, label, disabled: false }
    }
    return { kind: "save" as const, label: hasSupply ? "Add more" : "Add money", disabled: false }
  }, [
    isDemoMode, walletAddress, walletHasLoaded, displayBalanceUSD, enteredUSD,
    hasSupply, isStellarSelected, stellarWallet.isConnected, stellarWallet.isLoading,
    firstDepositEur,
  ])

  const onCtaClick = useCallback(() => {
    switch (cta.kind) {
      case "signin": login(); return
      case "connect-stellar":
        stellarWallet.connect().then((ok) => {
          if (!ok && stellarWallet.error) toast.error(stellarWallet.error)
        })
        return
      case "topup":
      case "save":
        openDepositSheet()
        return
      case "busy": return
    }
  }, [cta.kind, login, stellarWallet, openDepositSheet])

  const inputFontSize = useMemo(() => {
    const len = (usdInput || '').length
    if (len <= 3) return '3.5rem'
    if (len <= 5) return '2.75rem'
    if (len <= 7) return '2.1rem'
    if (len <= 9) return '1.7rem'
    return '1.35rem'
  }, [usdInput])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-full md:max-w-md mx-auto relative z-10 px-0 md:px-4">
      <div
        className={cn(
          "relative rounded-none md:rounded-[2rem] overflow-hidden",
          // Mobile: transparent so the global `.app-gradient-bg` flows from the
          // header through the card to the bottom nav as one continuous surface
          // — no horizontal seam where `bg-background` used to butt against the
          // gradient. Desktop keeps the glassmorphism plate.
          "bg-transparent md:bg-background/[0.03] md:backdrop-blur-3xl",
          // Border only on desktop. The previous `border-y` drew the visible
          // hairline above and below the mobile card.
          "md:border transition-all duration-500 md:shadow-2xl border-foreground/[0.09]"
        )}
      >
        {/* Ambient gradient — desktop only. On mobile the card is transparent
            and lives on top of the global `.app-gradient-bg`; this inner tint
            would otherwise render as a faint rectangle (card-shaped color
            patch) against the dark gradient and reintroduce visible edges. */}
        <div className="hidden md:block absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-emerald-500/5 opacity-60 pointer-events-none" />

        {/* ── Stats header — ONLY after balances confirm supply > 0. The previous
            `|| isStatsLoading` clause reserved the slot during initial load,
            which caused the opposite of its intent for the common case (new,
            empty wallet): the skeleton header rendered, balances resolved with
            no supply, the header collapsed, and the pitch jumped up to fill the
            space. Without the loading branch the pitch skeleton holds the
            position from the first paint until the real pitch swaps in at the
            exact same height — zero shift. Users WITH supply briefly see the
            pitch skeleton before the stats header fades in above; that's the
            rarer first-paint and is a downward expansion, not a jump-up. */}
        <AnimatePresence>
          {hasSupply && !firstRunActive && (
            <motion.div {...FADE_DOWN} className="overflow-hidden" data-testid="easy-balance">
              <div className="relative px-6 pt-6 pb-0 text-center space-y-5">
                {/* Balance hero */}
                <div className="space-y-0.5">
                  <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
                    Your savings
                  </p>
                  {isStatsLoading ? (
                    <div className="mx-auto h-[2.5rem] w-44 rounded-2xl bg-foreground/10 animate-skeleton" />
                  ) : (
                    <p className="text-[2.5rem] font-black tracking-tighter tabular-nums leading-none">
                      ${totalSupplied.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  )}
                </div>

                {/* ── Stats row ── */}
                <div className="grid grid-cols-2 divide-x divide-foreground/10 pb-4">
                  <InfoTooltip
                    title="Total earned"
                    content="Interest you've collected since your first deposit — added to your balance every day, automatically."
                    side="top"
                    className="w-full"
                  >
                    <div className="px-2">
                      <p className="text-[10px] text-emerald-400 uppercase font-bold mb-1 tracking-wider">Earned</p>
                      {isStatsLoading ? (
                        <div className="h-5 w-16 mx-auto rounded-full bg-emerald-500/20 animate-skeleton" />
                      ) : (
                        <p className="text-sm font-bold text-emerald-400 tabular-nums">
                          {/* Ticks up live instead of sitting at +$0.00: one
                              day of interest on a small balance is sub-cent,
                              so a static two-decimal figure looks broken even
                              when the money is genuinely working. */}
                          <LiveEarningsValue
                            base={totalLifetimeEarnings || 0}
                            balanceUsd={totalSupplied}
                            apyPercent={displayApy}
                          />
                        </p>
                      )}
                    </div>
                  </InfoTooltip>
                  <InfoTooltip
                    title="Annual interest rate"
                    content="Your current rate — how much your savings grow in a year. It shifts with market demand, like a variable savings account that updates in real time."
                    side="top"
                    className="w-full"
                  >
                    <div className="px-2">
                      <p className="text-[10px] text-emerald-400 uppercase font-bold mb-1 tracking-wider">Per year</p>
                      {isStatsLoading ? (
                        <div className="h-5 w-12 mx-auto rounded-full bg-emerald-500/20 animate-skeleton" />
                      ) : (
                        <p className="text-sm font-bold text-emerald-400 tabular-nums">
                          {displayApy.toFixed(2)}%
                        </p>
                      )}
                    </div>
                  </InfoTooltip>
                </div>

                {/* Divider */}
                <div className="absolute bottom-0 left-6 right-6 h-px bg-foreground/[0.07]" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Euro balance — money the user funded via bank transfer but hasn't
            deposited into a vault yet. Tap to open the bank-transfer flow
            (IBAN + transfer history). Hidden at €0 so new users don't see
            "you have €0.00 ready" before they ever transferred anything. */}
        <AnimatePresence>
          {bridgeBalanceTotal > 0 && (
            <motion.div
              {...FADE_DOWN}
              data-testid="easy-euro-balance"
              className="px-6 pt-4"
            >
              <button
                type="button"
                onClick={openAddMoney}
                className={cn(
                  "w-full rounded-2xl px-4 py-3 flex items-center gap-3 text-left",
                  "border border-emerald-500/25 bg-emerald-500/[0.06]",
                  "hover:border-emerald-500/45 hover:bg-emerald-500/[0.10] transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
                )}
              >
                <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
                  <Banknote className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold tracking-widest uppercase text-emerald-500/80">
                    Euro balance
                  </p>
                  <p className="text-base font-bold tabular-nums text-foreground">
                    {bridgeBalance.available.toLocaleString(undefined, {
                      style: "currency",
                      currency: "EUR",
                    })}
                    {bridgeBalance.pending > 0 && (
                      <span className="ml-1.5 text-[11px] font-semibold text-emerald-500/80 tabular-nums">
                        +{bridgeBalance.pending.toLocaleString(undefined, {
                          style: "currency",
                          currency: "EUR",
                        })}{" "}
                        on the way
                      </span>
                    )}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Main interaction area ── */}
        <div className="relative z-20 px-6 pt-6 pb-6 space-y-5">

          {/* First-run welcome overlay — covers empty-state UI for new accounts.
              Dismissing it writes a localStorage flag so it never returns, and
              drops the user onto the normal empty-state. They decide when to
              tap "Add money" — we no longer auto-open it for them. */}
          <FirstRunIntro
            hasSupply={hasSupply}
            isBalancesLoading={isBalancesLoading}
            bestApy={bestApy}
          />

          {/* TX status widget */}
          <EasyModeTxStatus consumerMode onAddFunds={openAddMoney} />

          {/* ── Empty-state pitch ── */}
          <AnimatePresence>
            {!hasSupply && !isBalancesLoading && !firstRunActive && (
              <motion.div
                {...FADE}
                className="text-center pt-3 pb-1 space-y-2"
                data-testid="easy-pitch"
              >
                {/* Wordmark */}
                <p className="text-[10px] font-black tracking-[0.35em] uppercase text-muted-foreground/40">
                  Peridot
                </p>

                {/* Yield pitch — goal-aware when the user set one in Step 2.
                    Generic earn-pitch otherwise so first-time visitors who
                    skipped goal-setting still see the headline number. */}
                {savedGoal ? (
                  <>
                    <div className="space-y-0">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Your goal
                      </p>
                      <p className="text-[2.1rem] font-black tracking-tight leading-[1.1]">
                        {savedGoal.label}
                      </p>
                      <p className="text-[2.1rem] font-black tracking-tight leading-[1.1] text-emerald-500 tabular-nums">
                        {new Intl.NumberFormat("en-IE", {
                          style: "currency", currency: "EUR", maximumFractionDigits: 0,
                        }).format(savedGoal.amount)}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Add money toward it — Peridot grows it at{" "}
                      <span className="font-bold text-foreground/80">
                        {(bestApy > 0 ? bestApy : 8).toFixed(2)}%
                      </span>{" "}
                      per year.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="space-y-0">
                      <p className="text-[2.1rem] font-black tracking-tight leading-[1.1]">
                        Earn up to{" "}
                        {bestApy > 0 ? (
                          <motion.span
                            key={bestApy}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, ease: OUT_CUBIC }}
                            className="text-emerald-500"
                          >
                            {bestApy.toFixed(2)}%
                          </motion.span>
                        ) : (
                          <span className="text-emerald-500">12%</span>
                        )}
                      </p>
                      <p className="text-[2.1rem] font-black tracking-tight leading-[1.1] text-muted-foreground/50">
                        per year
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Add money and watch it grow.
                      <br />
                      Withdraw anytime, no lock-up.
                    </p>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading skeleton for empty-state pitch — dimensions match actual pitch exactly */}
          {isBalancesLoading && !hasSupply && !firstRunActive && (
            <div className="text-center pt-3 pb-1 space-y-2">
              {/* "Peridot" wordmark line */}
              <div className="h-[10px] w-10 mx-auto rounded-full bg-foreground/[0.05] animate-skeleton" />
              {/* "Earn X%" + "per year" — two lines of text-[2.1rem] leading-[1.1] */}
              <div className="space-y-0.5">
                <div className="h-[2.31rem] w-40 mx-auto rounded-lg bg-foreground/[0.08] animate-skeleton" />
                <div className="h-[2.31rem] w-28 mx-auto rounded-lg bg-foreground/[0.05] animate-skeleton" />
              </div>
              {/* "Add money…" sub-text — two lines of text-sm leading-relaxed */}
              <div className="space-y-1.5">
                <div className="h-[22px] w-44 mx-auto rounded-full bg-foreground/[0.05] animate-skeleton" />
                <div className="h-[22px] w-36 mx-auto rounded-full bg-foreground/[0.04] animate-skeleton" />
              </div>
            </div>
          )}

          {/* ── Input box — pure USD, no token names ── */}
          <div
            data-testid="easy-input"
            className={cn(
              "p-4 rounded-3xl border transition-all duration-300",
              isOverBalance
                ? "bg-red-500/[0.04] border-red-500/30"
                : "bg-foreground/[0.04] border-foreground/10 focus-within:border-emerald-500/50 focus-within:bg-foreground/[0.07]"
            )}
          >
            {/* Header row: intent label left, available balance right */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-muted-foreground/40">
                {hasSupply ? "Add to savings" : "Start saving"}
              </p>
              {walletHasLoaded && (
                <motion.p
                  key={displayBalanceUSD}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={cn(
                    "text-[11px] font-semibold tabular-nums transition-colors duration-300",
                    isOverBalance ? "text-red-400" : "text-muted-foreground/40"
                  )}
                >
                  Available: ${displayBalanceUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </motion.p>
              )}
            </div>

            {/* Dollar input */}
            <div className="flex items-center h-16">
              <span
                style={{ fontSize: inputFontSize, lineHeight: 1, transition: 'font-size 0.15s ease' }}
                className={cn(
                  "font-bold select-none mr-1 transition-colors duration-300",
                  isOverBalance ? "text-red-400/40" : "text-foreground/25"
                )}
              >$</span>
              <input
                data-testid="easy-amount-input"
                type="text"
                inputMode="decimal"
                placeholder="100"
                value={usdInput}
                onChange={handleInputChange}
                style={{ fontSize: inputFontSize, lineHeight: 1, transition: 'font-size 0.15s ease' }}
                className={cn(
                  "font-bold bg-transparent border-0 outline-none shadow-none p-0 placeholder:text-foreground/20 w-full h-full transition-colors duration-300",
                  isOverBalance ? "text-red-400" : "text-foreground"
                )}
              />
            </div>

            {/* ── Row 2: earnings projection — always visible when amount entered ── */}
            <AnimatePresence>
              {potentialYearlyEarn !== null ? (
                <motion.div
                  key="live"
                  {...HEIGHT_EXPAND}
                  className={cn(
                    "overflow-hidden",
                    "mt-2 pt-2 border-t border-foreground/[0.07]"
                  )}
                >
                  <InfoTooltip
                    content="At today's rate, this is what you'd earn over a full year. Interest compounds daily — your actual return will be a touch higher."
                    side="top"
                    align="start"
                  >
                    <p className={cn(
                      "text-[12px] font-semibold tabular-nums transition-colors duration-300",
                      // Dimmed when not actionable yet — aspirational only
                      isOverBalance ? "text-emerald-400/35" : "text-emerald-400/70"
                    )}>
                      Earns about +${potentialYearlyEarn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / year
                    </p>
                  </InfoTooltip>
                </motion.div>
              ) : bestApy > 0 ? (
                <motion.div
                  key="teaser"
                  {...HEIGHT_EXPAND}
                  className="mt-2 pt-2 border-t border-foreground/[0.07] overflow-hidden"
                >
                  <InfoTooltip
                    content="A rough idea of what you'd earn. Enter an amount above to see your personal projection."
                    side="top"
                    align="start"
                  >
                    <p className="text-[12px] text-emerald-400/40 font-semibold tabular-nums">
                      e.g. $100 earns +${(100 * bestApy / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / year
                    </p>
                  </InfoTooltip>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* ── Primary CTA — single morphing button, see `cta` memo above ── */}
          <motion.button
            data-testid="easy-cta"
            type="button"
            onClick={onCtaClick}
            disabled={cta.disabled}
            className={cn(
              "relative w-full h-14 rounded-2xl text-base font-bold transition-all duration-150",
              "bg-emerald-600 hover:bg-emerald-500 text-white",
              "shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30",
              "active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
              "flex items-center justify-center gap-2"
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={`${cta.kind}:${cta.label}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: OUT_CUBIC }}
                className="flex items-center justify-center gap-2"
              >
                {cta.kind === "connect-stellar" && stellarWallet.isLoading && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {cta.kind === "topup" && <CreditCard className="w-5 h-5" />}
                <span>{cta.label}</span>
                {cta.kind === "save" && <ArrowUpRight className="w-5 h-5" />}
              </motion.span>
            </AnimatePresence>
          </motion.button>

          {/* ── Passive asset note + advanced picker ── */}
          {/* The user doesn't need to know about tokens — this is a quiet escape hatch */}
          <div>
            <button
              type="button"
              onClick={() => setAssetPickerOpen((o) => !o)}
              className="w-full flex items-center justify-center gap-1.5 py-0.5 text-[11px] text-muted-foreground/35 hover:text-muted-foreground/60 transition-colors"
            >
              {selectedAsset.icon && (
                <Image
                  src={selectedAsset.icon}
                  alt={assetSymbol}
                  width={11}
                  height={11}
                  className="rounded-full opacity-50"
                  unoptimized
                />
              )}
              <span>
                {isStellarSelected ? "Wallet in" : "Saving in"} {assetSymbol}
                {isStellarSelected ? " · Stellar" : bestApy > 0 ? ` · ${bestApy.toFixed(1)}% / yr` : ""}
              </span>
              <ChevronDown
                className={cn(
                  "w-3 h-3 transition-transform duration-150",
                  assetPickerOpen && "rotate-180"
                )}
              />
            </button>

            {/* Inline asset picker — only if user wants to choose */}
            <AnimatePresence>
              {assetPickerOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="overflow-hidden mt-2"
                >
                  <div className="rounded-2xl bg-foreground/[0.04] border border-foreground/[0.07] p-1.5 space-y-px">
                    {availableMarkets.map((asset) => {
                      const apy        = bestApyPerAsset[asset.id] || 0
                      const isSelected = selectedAssetId === asset.id
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => {
                            setSelectedAssetId(asset.id)
                            setHasManuallySelected(true)
                            setAssetPickerOpen(false)
                          }}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors cursor-pointer",
                            isSelected ? "bg-foreground/[0.07]" : "hover:bg-foreground/[0.04]"
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            {asset.icon ? (
                              <Image
                                src={asset.icon}
                                alt={asset.symbol}
                                width={20}
                                height={20}
                                className="rounded-full"
                                unoptimized
                              />
                            ) : (
                              <DollarSign className="w-4 h-4 text-muted-foreground" />
                            )}
                            <span className={cn(
                              "text-[13px] font-semibold",
                              isSelected ? "text-foreground" : "text-foreground/70"
                            )}>
                              {asset.symbol}
                            </span>
                            {asset.id.endsWith("-stellar") && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 bg-foreground/[0.05] rounded-full px-1.5 py-0.5">
                                Stellar
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {apy > 0 && (
                              <span className="text-[12px] font-bold text-emerald-500 tabular-nums">
                                {apy.toFixed(1)}% / yr
                              </span>
                            )}
                            {isSelected && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>

        {/* ── Footer — positions + progress, only when has deposit ── */}
        <AnimatePresence>
          {hasSupply && (
            <motion.div {...FADE_DOWN} className="overflow-hidden">
              <div className="hidden md:grid grid-cols-3 divide-x divide-foreground/[0.07] border-t border-foreground/[0.07] mt-5">
                {([
                  { href: "/app/easy/portfolio", icon: History,    label: "Positions" },
                  { href: "/app/easy/activity",  icon: TrendingUp, label: "Activity"  },
                  { href: "/app/easy/account",   icon: User,       label: "Profile"   },
                ] as const).map(({ href, icon: Icon, label }, i) => (
                  <motion.div
                    key={href}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, delay: i * 0.018, ease: OUT_CUBIC }}
                  >
                    <Link
                      href={href}
                      className="flex items-center justify-center gap-2 py-4 text-[11px] font-medium text-muted-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.03] transition-colors duration-150"
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </Link>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  )
}
