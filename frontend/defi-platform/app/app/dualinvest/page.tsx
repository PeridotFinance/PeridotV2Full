"use client"

import React from "react"
import { useState, useMemo, useCallback, useEffect } from "react"
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi"
import { motion } from "framer-motion"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { AnimatedCard, DonutChart } from "@/components/ui/animated-components"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

import { getMarketsForChain, getAssetContractAddresses, getAssetById } from "@/data/market-data"
import { useHybridApy } from "@/hooks/use-hybrid-apy"
import { 
  useDualEnterPosition,
  useDualSupportedMarkets,
  useDualCanEnter,
  useDualDiagnostics,
  useTokenAllowance,
  useDualPositions,
  useDualSettlement,
} from "@/hooks/use-dualinvest"
import { useLivePrice } from "@/hooks/use-live-price"
import { useApyTimeseries } from "@/hooks/use-apy-timeseries"
import { useDualInvestmentAddresses } from "@/hooks/use-dualinvest"
import managerAbi from "@/app/abis/DualinvestmentManagerAbi.json"
import { getChainConfig } from "@/config/contracts"

type Direction = 0 | 1 // 0=CALL (Sell high), 1=PUT (Buy low)

const dayOptions = [1, 3, 7, 14, 30]

function formatPct(n: number) {
  if (!isFinite(n)) return "0%"
  return `${n.toFixed(2)}%`
}

function formatUsd(n: number) {
  if (!isFinite(n)) return "$0"
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function GlassWrap(props: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={
        "relative rounded-2xl border border-white/15 bg-white/5 dark:bg-white/5 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.25)] " +
        (props.className || "")
      }
    >
      {/* subtle cyber glow */}
      <div className="pointer-events-none absolute -inset-0.5 rounded-2xl bg-gradient-to-br from-[#5e7945]/20 via-[#5e7945]/10 to-transparent blur-xl" />
      <div className="relative">{props.children}</div>
    </div>
  )
}

// Minimal ABIs for conversions and balances
const pTokenAbi = [
  { type: "function", name: "exchangeRateStored", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
] as const

const erc20Abi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const

// Minimal admin ABIs for auth wiring
const vaultExecutorAbi = [
  { type: "function", name: "setAuthorizedManager", stateMutability: "nonpayable", inputs: [{ name: "manager", type: "address" }, { name: "authorized", type: "bool" }], outputs: [] },
] as const
const positionTokenAbi = [
  { type: "function", name: "setAuthorizedMinter", stateMutability: "nonpayable", inputs: [{ name: "minter", type: "address" }, { name: "authorized", type: "bool" }], outputs: [] },
] as const
const borrowRouterAbi = [
  { type: "function", name: "setAuthorizedDestination", stateMutability: "nonpayable", inputs: [{ name: "destination", type: "address" }, { name: "authorized", type: "bool" }], outputs: [] },
] as const

function parseUnits(amount: string, decimals: number): bigint {
  if (!amount || !isFinite(Number(amount))) return BigInt(0)
  const [wholeRaw, fracRaw = ""] = amount.split(".")
  const whole = wholeRaw.replace(/[^0-9]/g, "") || "0"
  const frac = (fracRaw.replace(/[^0-9]/g, "") + "0".repeat(decimals)).slice(0, decimals)
  const scale = BigInt("1" + "0".repeat(decimals))
  return BigInt(whole) * scale + BigInt(frac || "0")
}

function formatUnits(value: bigint, decimals: number, maxFrac = 6): string {
  if (decimals <= 0) return value.toString()
  const scale = BigInt("1" + "0".repeat(decimals))
  const whole = value / scale
  const frac = value % scale
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, Math.max(0, Math.min(maxFrac, decimals)))
  return fracStr.length ? `${whole.toString()}.${fracStr}` : whole.toString()
}

function AssetCard({ assetId, direction }: { assetId: string; direction: Direction }) {
  const chainId = useChainId()
  const asset = getAssetById(assetId)
  const { totalSupplyApy, netBorrowApy } = useHybridApy({ assetId, chainId })
  const { price: livePrice } = useLivePrice({ assetId, chainIdOverride: chainId })
  const { data: tsData } = useApyTimeseries(assetId, chainId, '30d')

  const apyPrimary = direction === 0 ? totalSupplyApy : netBorrowApy
  const apyPrimaryFmt = formatPct(apyPrimary)

  const apySeries = Array.isArray(tsData) ? tsData : []
  const apyValues = apySeries.map(p => (direction === 0 ? p.supply : p.borrow)).filter(v => typeof v === 'number' && isFinite(v))
  const apyMin = apyValues.length ? Math.min(...apyValues) : apyPrimary
  const apyMax = apyValues.length ? Math.max(...apyValues) : apyPrimary
  const apyAvg = (apyMin + apyMax) / 2
  const apyRangeLabel = `${formatPct(apyMin)} – ${formatPct(apyMax)}`

  const price = livePrice ?? 0

  const payoutSymbol = useMemo(() => {
    if (!chainId) return getAssetById('usdc')?.symbol || 'USDC'
    const usdc = getAssetContractAddresses('usdc', chainId)
    if (usdc?.pTokenAddress) return getAssetById('usdc')?.symbol || 'USDC'
    return asset?.symbol || assetId.toUpperCase()
  }, [chainId, asset?.symbol, assetId])

  return (
    <AnimatedCard>
      <Dialog>
        <DialogTrigger asChild>
          <button className="w-full text-left">
            <GlassWrap className="p-4 transition-transform duration-300 hover:scale-[1.01]">
              <div className="flex items-center gap-4">
                {/* Icon */}
                <div className="relative h-12 w-12 overflow-hidden rounded-xl bg-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset?.icon || "/placeholder.svg"} alt={asset?.symbol || assetId} className="h-full w-full object-contain" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-base font-semibold tracking-wide text-black/90 dark:text-white">{asset?.name || assetId.toUpperCase()}</div>
                      <div className="text-xs text-black/60 dark:text-white/60">Price · {formatUsd(price)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wide text-black/60 dark:text-white/60">APY (30d)</div>
                      <div className="text-sm font-semibold text-[#5e7945] drop-shadow">{apyRangeLabel}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-black/70 dark:text-white/60">Payout in: <span className="font-semibold">{payoutSymbol}</span></div>
                  <div className="mt-3">
                    <DonutChart value={Math.min(Math.max(apyAvg, 0), 100)} size={72} strokeWidth={10} color="#5e7945" />
                  </div>
                </div>
              </div>
            </GlassWrap>
          </button>
        </DialogTrigger>
        <DialogContent className="w-[96vw] sm:max-w-xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl border-black/10 bg-white/85 p-0 text-foreground shadow-xl ring-1 ring-black/10 backdrop-blur-xl rounded-none sm:rounded-2xl dark:border-white/10 dark:bg-black/60 dark:text-white dark:ring-white/10">
          <DialogHeader className="px-6 pb-2 pt-6">
            <DialogTitle className="text-lg">{asset?.name} — {direction === 0 ? "Sell High" : "Buy Low"}</DialogTitle>
          </DialogHeader>
          <Separator className="opacity-20" />
          <div className="px-6 py-5">
            <EnterForm assetId={assetId} direction={direction} apyRange={{ min: apyMin, max: apyMax }} livePrice={price} payoutSymbol={payoutSymbol} />
            <div className="mt-3 text-[11px] text-black/70 dark:text-white/60">Payout in: <span className="font-semibold">{payoutSymbol}</span></div>
          </div>
        </DialogContent>
      </Dialog>
    </AnimatedCard>
  )
}

function EnterForm({ assetId, direction, apyRange, livePrice, payoutSymbol }: { assetId: string; direction: Direction; apyRange: { min: number; max: number }; livePrice: number; payoutSymbol: string }) {
  const chainId = useChainId()
  const { address } = useAccount()
  const { enterPosition, enterPositionWithBorrowed, borrowAndEnterPosition } = useDualEnterPosition()
  const diAddresses = useDualInvestmentAddresses()
  const publicClient = usePublicClient({ chainId })
  const { canEnter } = useDualCanEnter()
  const { list: listMarkets } = useDualSupportedMarkets()
  const { getManagerDiagnostics } = useDualDiagnostics()

  const assetSymbol = useMemo(() => getAssetById(assetId)?.symbol || assetId.toUpperCase(), [assetId])
  const [amountStr, setAmountStr] = useState("") // underlying amount (human units)
  const [days, setDays] = useState<number>(7)
  const [strikeStr, setStrikeStr] = useState("")
  const [useCollateral, setUseCollateral] = useState(true)

  const { price: hookLivePrice } = useLivePrice({ assetId, chainIdOverride: chainId })
  const priceNow = hookLivePrice ?? livePrice ?? 0

  const contracts = useMemo(() => {
    if (!chainId) return null
    const cIn = getAssetContractAddresses(assetId, chainId)
    // Try to default payout to USDC market if available; fallback to same as input
    const usdc = getAssetContractAddresses("usdc", chainId)
    return {
      cTokenIn: cIn?.pTokenAddress as `0x${string}` | undefined,
      cTokenOut: (usdc?.pTokenAddress || cIn?.pTokenAddress) as `0x${string}` | undefined,
      underlyingIn: cIn?.underlyingAddress as `0x${string}` | undefined,
    }
  }, [assetId, chainId])

  // On-chain params for conversions and Max
  const [exchangeRate, setExchangeRate] = useState<bigint>(BigInt(0))
  const [cTokenDecimals, setCTokenDecimals] = useState<number>(8)
  const [underlyingDecimals, setUnderlyingDecimals] = useState<number>(18)
  const [cTokenBalance, setCTokenBalance] = useState<bigint>(BigInt(0))
  const [underlyingBalance, setUnderlyingBalance] = useState<bigint>(BigInt(0))
  const [isIntegratedMarket, setIsIntegratedMarket] = useState<boolean>(false)
  const [enterError, setEnterError] = useState<string>("")

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        if (!publicClient || !contracts?.cTokenIn) return
        const [er, cdec] = await Promise.all([
          publicClient.readContract({ address: contracts.cTokenIn, abi: pTokenAbi as any, functionName: "exchangeRateStored", args: [] }) as Promise<bigint>,
          publicClient.readContract({ address: contracts.cTokenIn, abi: pTokenAbi as any, functionName: "decimals", args: [] }) as Promise<number>,
        ])
        let udec = underlyingDecimals
        if (contracts.underlyingIn) {
          try {
            udec = await publicClient.readContract({ address: contracts.underlyingIn, abi: erc20Abi as any, functionName: "decimals", args: [] }) as number
          } catch {}
        }
        let bal = BigInt(0)
        let uBal = BigInt(0)
        if (address) {
          try {
            bal = await publicClient.readContract({ address: contracts.cTokenIn, abi: erc20Abi as any, functionName: "balanceOf", args: [address] }) as bigint
          } catch {}
          if (contracts.underlyingIn) {
            try {
              uBal = await publicClient.readContract({ address: contracts.underlyingIn, abi: erc20Abi as any, functionName: "balanceOf", args: [address] }) as bigint
            } catch {}
          }
        }
        if (!cancelled) {
          setExchangeRate(er)
          setCTokenDecimals(cdec ?? 8)
          setUnderlyingDecimals(udec ?? 18)
          setCTokenBalance(bal)
          setUnderlyingBalance(uBal)
        }
      } catch {}
    }
    load()
  }, [publicClient, contracts?.cTokenIn, contracts?.underlyingIn, address])

  // Default to collateral if available; otherwise wallet
  useEffect(() => {
    if (cTokenBalance === BigInt(0)) setUseCollateral(false)
    else setUseCollateral(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cTokenBalance])

  const { read: readAllowance, approve } = useTokenAllowance(
    contracts?.cTokenIn,
    (diAddresses?.vaultExecutor as `0x${string}` | undefined)
  )
  const { read: readUnderlyingAllowance, approve: approveUnderlying } = useTokenAllowance(
    contracts?.underlyingIn,
    (diAddresses?.vaultExecutor as `0x${string}` | undefined)
  )
  const [allowance, setAllowance] = useState<bigint>(BigInt(0))
  const [underlyingAllowance, setUnderlyingAllowance] = useState<bigint>(BigInt(0))
  const amountCToken: bigint = useMemo(() => {
    try {
      if (!exchangeRate || exchangeRate === BigInt(0)) return BigInt(0)
      const underlyingUnits = parseUnits(amountStr || "0", underlyingDecimals)
      // cToken = underlying * 1e18 / exchangeRate
      const one = BigInt("1" + "0".repeat(18))
      return (underlyingUnits * one) / exchangeRate
    } catch {
      return BigInt(0)
    }
  }, [amountStr, underlyingDecimals, exchangeRate])
  const underlyingUnits: bigint = useMemo(() => parseUnits(amountStr || "0", underlyingDecimals), [amountStr, underlyingDecimals])
  const willBorrowFallback = useMemo(() => {
    // Borrow fallback when user selected Wallet (no underlying), has collateral, and market is integrated
    if (useCollateral) return false
    if (!contracts?.cTokenIn) return false
    if (!isIntegratedMarket) return false
    // Need more underlying than wallet balance
    if (underlyingUnits <= BigInt(0)) return false
    return underlyingBalance < underlyingUnits && cTokenBalance > BigInt(0)
  }, [useCollateral, isIntegratedMarket, contracts?.cTokenIn, underlyingUnits, underlyingBalance, cTokenBalance])
  const needsApproval = useMemo(() => {
    if (willBorrowFallback) return false
    if (useCollateral) return allowance < amountCToken && amountCToken > BigInt(0)
    return underlyingAllowance < underlyingUnits && underlyingUnits > BigInt(0)
  }, [useCollateral, allowance, amountCToken, underlyingAllowance, underlyingUnits, willBorrowFallback])

  // Discover integrated markets to enable borrow fallback
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        if (!contracts?.cTokenIn) return
        const { integrated, supported } = await listMarkets()
        const ok = integrated.includes(contracts.cTokenIn.toLowerCase())
        if (!cancelled) setIsIntegratedMarket(ok)
      } catch {}
    }
    run()
    const id = setInterval(run, 30000)
    return () => { cancelled = true; clearInterval(id) }
  }, [listMarkets, contracts?.cTokenIn])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const v = await readAllowance()
        if (!cancelled) setAllowance(v)
      } catch {}
      try {
        const vu = await readUnderlyingAllowance()
        if (!cancelled) setUnderlyingAllowance(vu)
      } catch {}
    }
    run()
    const id = setInterval(run, 15000)
    return () => { cancelled = true; clearInterval(id) }
  }, [readAllowance, readUnderlyingAllowance])

  // Compute simple estimates for fun UX
  const pApy = useHybridApy({ assetId, chainId })
  const yearlyPct = direction === 0 ? pApy.totalSupplyApy : pApy.netBorrowApy
  const dailyRate = yearlyPct / 365
  const notional = Number(amountStr || "0")
  const estYieldPct = dailyRate * days
  const estYieldTokens = notional * (estYieldPct / 100)
  const estYieldUsd = priceNow * estYieldTokens

  // Window-based APY range that changes with selected days
  const windowParam = days <= 7 ? '7d' : days <= 30 ? '30d' : '90d'
  const { data: apyWindowData } = useApyTimeseries(assetId, chainId, windowParam)
  const apyWindowValues = Array.isArray(apyWindowData)
    ? apyWindowData
        .map(p => (direction === 0 ? p.supply : p.borrow))
        .filter(v => typeof v === 'number' && isFinite(v))
    : []
  const apyMinSelected = apyWindowValues.length ? Math.min(...apyWindowValues) : yearlyPct
  const apyMaxSelected = apyWindowValues.length ? Math.max(...apyWindowValues) : yearlyPct

  const onApprove = useCallback(async () => {
    if (!diAddresses?.vaultExecutor) return
    if (useCollateral) {
      if (!contracts?.cTokenIn) return
      const amt = amountCToken
      if (amt <= BigInt(0)) return
      // eslint-disable-next-line no-console
      console.log('[DualInvestPage] approve pToken', { token: contracts.cTokenIn, spender: diAddresses.vaultExecutor, amount: String(amt) })
      await approve(amt)
      const v = await readAllowance()
      setAllowance(v)
    } else {
      if (!contracts?.underlyingIn) return
      const amtU = underlyingUnits
      if (amtU <= BigInt(0)) return
      // eslint-disable-next-line no-console
      console.log('[DualInvestPage] approve underlying', { token: contracts.underlyingIn, spender: diAddresses.vaultExecutor, amount: String(amtU) })
      await approveUnderlying(amtU)
      const vu = await readUnderlyingAllowance()
      setUnderlyingAllowance(vu)
    }
  }, [diAddresses?.vaultExecutor, useCollateral, contracts?.cTokenIn, contracts?.underlyingIn, amountCToken, underlyingUnits, approve, readAllowance, approveUnderlying, readUnderlyingAllowance])

  const onEnter = useCallback(async () => {
    if (!contracts?.cTokenIn || !contracts?.cTokenOut) return
    const now = Math.floor(Date.now() / 1000)
    const expiry = BigInt(now + days * 24 * 60 * 60)
    const strike = BigInt(strikeStr && Number(strikeStr) > 0 ? Math.floor(Number(strikeStr) * 1e18) : Math.floor((priceNow || 0) * 1e18))
    setEnterError("")
    // Centralized diagnostics snapshot (what could be missing)
    try {
      const diag = await getManagerDiagnostics({ cTokenIn: contracts.cTokenIn, cTokenOut: contracts.cTokenOut })
      // eslint-disable-next-line no-console
      console.log('[DualInvest:diagnostics]', diag)
    } catch {}
    if (useCollateral) {
      const amount = amountCToken
      try {
        // eslint-disable-next-line no-console
        console.log('[DualInvest:canEnter] request', { mode: 'collateral', amount: String(amount), cTokenIn: contracts.cTokenIn })
        const pre = await canEnter({ cTokenIn: contracts.cTokenIn, amount, useCollateral: true })
        // eslint-disable-next-line no-console
        console.log('[DualInvest:canEnter] result', pre)
        if (!pre.canEnter) { setEnterError(pre.reason || "cannot-enter"); return }
        await enterPosition({
          cTokenIn: contracts.cTokenIn,
          cTokenOut: contracts.cTokenOut,
          amount,
          direction,
          strike,
          expiry,
          useCollateral: true,
          enableAutoCompound: false,
        })
      } catch (e: any) {
        setEnterError(e?.shortMessage || e?.message || "enter-error")
      }
    } else {
      const underlyingAmount = underlyingUnits
      try {
        if (willBorrowFallback) {
          // eslint-disable-next-line no-console
          console.log('[DualInvest:canEnter] request', { mode: 'borrow-fallback', amount: String(underlyingAmount), cTokenIn: contracts.cTokenIn })
          const pre = await canEnter({ cTokenIn: contracts.cTokenIn, amount: underlyingAmount, useCollateral: false })
          // eslint-disable-next-line no-console
          console.log('[DualInvest:canEnter] result', pre)
          if (!pre.canEnter) { setEnterError(pre.reason || "cannot-enter"); return }
          await borrowAndEnterPosition({
            cToken: contracts.cTokenIn,
            cTokenOut: contracts.cTokenOut,
            borrowUnderlyingAmount: underlyingAmount,
            direction,
            strike,
            expiry,
          })
        } else {
          // eslint-disable-next-line no-console
          console.log('[DualInvest:canEnter] request', { mode: 'wallet-underlying', amount: String(underlyingAmount), cTokenIn: contracts.cTokenIn })
          const pre = await canEnter({ cTokenIn: contracts.cTokenIn, amount: underlyingAmount, useCollateral: false })
          // eslint-disable-next-line no-console
          console.log('[DualInvest:canEnter] result', pre)
          if (!pre.canEnter) { setEnterError(pre.reason || "cannot-enter"); return }
          await enterPositionWithBorrowed({
            cToken: contracts.cTokenIn,
            cTokenOut: contracts.cTokenOut,
            underlyingAmount,
            direction,
            strike,
            expiry,
          })
        }
      } catch (e: any) {
        setEnterError(e?.shortMessage || e?.message || "enter-error")
      }
    }
  }, [contracts, days, strikeStr, priceNow, useCollateral, amountCToken, underlyingUnits, direction, enterPosition, enterPositionWithBorrowed, borrowAndEnterPosition, canEnter, willBorrowFallback, getManagerDiagnostics])

  // Compute Max from cToken balance
  const maxUnderlyingHuman = useMemo(() => {
    try {
      if (!exchangeRate || exchangeRate === BigInt(0)) return "0"
      const one = BigInt("1" + "0".repeat(18))
      const underlyingUnits = (cTokenBalance * exchangeRate) / one
      return formatUnits(underlyingUnits, underlyingDecimals, 6)
    } catch { return "0" }
  }, [cTokenBalance, exchangeRate, underlyingDecimals])
  const walletUnderlyingHuman = useMemo(() => {
    try { return formatUnits(underlyingBalance, underlyingDecimals, 6) } catch { return "0" }
  }, [underlyingBalance, underlyingDecimals])
  const onMax = useCallback(() => {
    const target = useCollateral ? maxUnderlyingHuman : walletUnderlyingHuman
    if (Number(target) > 0) setAmountStr(target)
  }, [useCollateral, maxUnderlyingHuman, walletUnderlyingHuman])

  // Strike ladder: fallback steps scaled by sqrt(days/7), skip ATM (100%)
  const computeStrikeMultipliers = useCallback((d: number, dir: Direction) => {
    // Baseline steps for 7d (5%, 7.5%, 10%, 12.5%)
    const base = [0.05, 0.075, 0.10, 0.125]
    const scale = Math.sqrt(Math.max(d, 1) / 7)
    const minStep = 0.03
    const maxStep = 0.35
    const steps = base
      .map(s => Math.min(Math.max(s * scale, minStep), maxStep))
      .map(s => {
        // Round to nearest 0.5%
        const rounded = Math.round((s * 100) / 0.5) * 0.5 / 100
        return Math.max(rounded, 0)
      })
      .filter((v, i, arr) => arr.indexOf(v) === i) // dedupe after rounding
    if (dir === 0) {
      // CALL: above spot
      return steps.map(s => 1 + s)
    } else {
      // PUT: below spot (ensure positive multiplier)
      return steps.map(s => Math.max(0.0001, 1 - s))
    }
  }, [])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <GlassWrap className="p-3">
          <div className="flex items-center justify-between text-xs text-black/70 dark:text-white/60">
            <div className="flex items-center gap-2">
              <span>Amount in {assetSymbol}</span>
              <div className="rounded-md border border-black/10 p-0.5 dark:border-white/10">
                <button
                  className={`rounded px-2 py-0.5 text-[11px] ${useCollateral ? 'bg-[#5e7945]/30 text-black dark:text-white' : 'text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10'}`}
                  onClick={() => setUseCollateral(true)}
                >Collateral</button>
                <button
                  className={`rounded px-2 py-0.5 text-[11px] ${!useCollateral ? 'bg-[#5e7945]/30 text-black dark:text-white' : 'text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10'}`}
                  onClick={() => setUseCollateral(false)}
                >Wallet</button>
              </div>
            </div>
            <button onClick={onMax} className="rounded-md border border-black/10 px-2 py-0.5 text-[11px] text-black/70 hover:bg-black/5 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10">Max</button>
          </div>
          <input
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder={`e.g. 10.5 ${assetSymbol}`}
            className="mt-2 w-full rounded-lg border border-black/10 bg-white/60 px-3 py-2 text-sm text-black outline-none placeholder:text-black/40 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/40"
          />
          {!useCollateral && willBorrowFallback && (
            <div className="mt-1 text-[11px] text-black/70 dark:text-white/60">
              Will borrow against your collateral to enter this position.
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-3 text-[11px]">
            <div className="rounded-md border border-black/10 bg-white/60 p-2 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-2 text-black/60 dark:text-white/60">
                <span>Collateral</span>
                <span className="rounded-full bg-[#5e7945]/20 px-2 py-0.5 text-[10px] font-semibold text-[#5e7945]">pToken</span>
              </div>
              <div className="mt-1 font-semibold text-black dark:text-white">{formatUnits(cTokenBalance, cTokenDecimals, 4)} p{assetSymbol}</div>
              <div className="text-black/60 dark:text-white/60">≈ {maxUnderlyingHuman} {assetSymbol}</div>
            </div>
            <div className="rounded-md border border-black/10 bg-white/60 p-2 dark:border-white/10 dark:bg-white/5">
              <div className="text-black/60 dark:text-white/60">Wallet</div>
              <div className="mt-1 font-semibold text-black dark:text-white">{walletUnderlyingHuman} {assetSymbol}</div>
              <div className="text-black/60 dark:text-white/60">≈ {formatUsd((parseFloat(walletUnderlyingHuman || '0') || 0) * (priceNow || 0))}</div>
            </div>
          </div>
        </GlassWrap>

        <GlassWrap className="p-3">
          <div className="text-xs text-muted-foreground">Pick time & target price</div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]
            [&::-webkit-scrollbar]:hidden">
            {[1, 3, 7, 14].map((d) => (
              <button
                key={`day-${d}`}
                onClick={() => setDays(d)}
                className={`rounded-md px-2 py-1 text-xs transition ${
                  days === d
                    ? "bg-[#5e7945]/30 text-black ring-1 ring-[#5e7945]/50 dark:bg-[#5e7945]/30 dark:text-white"
                    : "border border-black/10 text-black/70 hover:bg-black/5 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <div className="mt-2 max-h-[48vh] space-y-2 overflow-y-auto pr-1 md:max-h-40">
            {(() => {
              const d = days
              const multipliers = computeStrikeMultipliers(d, direction)
              const opts: Array<{ d: number; pct: number; strikeUsd: number }> = multipliers.map((pct) => ({ d, pct, strikeUsd: Math.max(0, (priceNow || 0) * pct) }))
              return opts.map((o, idx) => {
                const periodRate = (dailyRate / 100) * o.d
                const amt = Number(amountStr || "0")
                const sellHigh = direction === 0
                // Compute both representations for clarity
                const ifHitUSD = sellHigh ? (amt * o.strikeUsd) * (1 + periodRate) : amt * (1 + periodRate)
                const ifHitTokens = sellHigh ? (ifHitUSD / (priceNow || 1)) : ((amt / (o.strikeUsd || 1)) * (1 + periodRate))
                const ifNotTokens = sellHigh ? (amt * (1 + periodRate)) : ((amt / (o.strikeUsd || 1)) * (1 + periodRate))
                const ifNotUSD = ifNotTokens * (priceNow || 0)
                return (
                  <button
                    key={`${idx}-${o.d}-${o.pct}`}
                    onClick={() => { setDays(o.d); setStrikeStr(o.strikeUsd.toFixed(2)) }}
                    className="w-full rounded-lg border border-white/10 bg-white/40 p-2 text-left hover:bg-white/60 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">{o.d}d · Strike {Math.round(o.pct * 100)}% (${o.strikeUsd.toFixed(2)})</div>
                      <span className="rounded-full bg-[#5e7945]/20 px-2 py-0.5 text-[10px] font-semibold text-[#5e7945]">APY {`${formatPct(apyMinSelected)} – ${formatPct(apyMaxSelected)}`}</span>
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-md bg-[#5e7945]/10 p-2 text-[#5e7945]">
                        <div className="font-semibold">If price hits</div>
                        <div className="opacity-80">≈ {formatUsd(ifHitUSD)} ({(ifHitTokens || 0).toFixed(4)} {assetSymbol})</div>
                      </div>
                      <div className="rounded-md bg-[#5e7945]/10 p-2 text-[#5e7945]">
                        <div className="font-semibold">If it doesn’t</div>
                        <div className="opacity-80">≈ {ifNotTokens.toFixed(4)} {assetSymbol} ({formatUsd(ifNotUSD)})</div>
                      </div>
                    </div>
                  </button>
                )
              })
            })()}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>APY range</span>
            <LiveApyRange assetId={assetId} days={days} direction={direction} fallbackRange={apyRange} />
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">Payout window opens after expiry. Payout in <span className="font-semibold">{payoutSymbol}</span>.</div>
        </GlassWrap>
      </div>

      <GlassWrap className="p-3">
        <div className="grid grid-cols-2 items-center gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Custom strike (USD)</div>
            <input
              value={strikeStr}
              onChange={(e) => setStrikeStr(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder={String(priceNow || 0)}
              className="mt-2 w-full rounded-lg border border-black/10 bg-white/60 px-3 py-2 text-sm text-black outline-none placeholder:text-black/40 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/40"
            />
            <div className="mt-2 text-[11px] text-muted-foreground">Defaults to current price if left empty.</div>
          </div>
          <div className="justify-self-end text-right">
            <div className="text-xs text-muted-foreground">Time‑based APY</div>
            <div className="text-xl font-bold text-[#5e7945]">{`${formatPct(apyMinSelected)} – ${formatPct(apyMaxSelected)}`}</div>
            <div className="mt-2 text-[11px] text-muted-foreground">Selected outcome</div>
            {(() => {
              const srk = Number(strikeStr) > 0 ? Number(strikeStr) : (priceNow || 0)
              const pr = (dailyRate / 100) * days
              const amt = Number(amountStr || "0")
              const sellHigh = direction === 0
              const hitUSD = sellHigh ? (amt * srk) * (1 + pr) : amt * (1 + pr)
              const hitTokens = sellHigh ? (hitUSD / (priceNow || 1)) : ((amt / (srk || 1)) * (1 + pr))
              const notTokens = sellHigh ? (amt * (1 + pr)) : ((amt / (srk || 1)) * (1 + pr))
              const notUSD = notTokens * (priceNow || 0)
              return (
                <div className="mt-1 space-y-0.5 text-[11px] text-black/70 dark:text-white/60">
                  <div>If hits: {formatUsd(hitUSD)} ({hitTokens.toFixed(4)} {assetSymbol})</div>
                  <div>If not: {notTokens.toFixed(4)} {assetSymbol} ({formatUsd(notUSD)})</div>
                </div>
              )
            })()}
          </div>
        </div>
      </GlassWrap>

      <div className="hidden items-center justify-between gap-3 md:flex">
        <Button variant="secondary" className="border-white/20 bg-white/10 hover:bg-white/20" onClick={onApprove} disabled={!needsApproval}>
          {needsApproval ? "Enable Collateral" : "Enabled"}
        </Button>
        <Button className="bg-[#5e7945] text-white hover:opacity-90" onClick={onEnter}>
          Enter Position
        </Button>
      </div>
      {enterError && (
        <div className="mt-2 text-xs text-red-500">
          {enterError}
        </div>
      )}

      {/* Mobile sticky CTA bar */}
      <div className="fixed inset-x-0 bottom-0 z-[75] flex items-center gap-3 border-t border-black/10 bg-white/80 p-3 backdrop-blur md:hidden dark:border-white/10 dark:bg-black/60">
        <Button variant="secondary" className="flex-1 border-white/20 bg-white/10 hover:bg-white/20" onClick={onApprove} disabled={!needsApproval}>
          {needsApproval ? "Enable" : "Enabled"}
        </Button>
        <Button className="flex-1 bg-[#5e7945] text-white hover:opacity-90" onClick={onEnter}>
          Enter
        </Button>
      </div>
    </div>
  )
}

function LiveApyRange({ assetId, days, direction, fallbackRange }: { assetId: string; days: number; direction: Direction; fallbackRange: { min: number; max: number } }) {
  const { chainId } = useAccount()
  const windowParam = days <= 7 ? '7d' : days <= 30 ? '30d' : '90d'
  const { data } = useApyTimeseries(assetId, chainId, windowParam)
  const apySeries = Array.isArray(data) ? data : []
  const apyValues = apySeries.map(p => (direction === 0 ? p.supply : p.borrow)).filter(v => typeof v === 'number' && isFinite(v))
  const min = apyValues.length ? Math.min(...apyValues) : fallbackRange.min
  const max = apyValues.length ? Math.max(...apyValues) : fallbackRange.max
  return <span className="font-semibold" style={{ color: '#5e7945' }}>{`${formatPct(min)} – ${formatPct(max)}`}</span>
}

function PositionsPanel() {
  const { findUserPositions, getPositionInfo } = useDualPositions()
  const { canSettlePosition, settlePosition } = useDualSettlement()
  const { address } = useAccount()
  const [open, setOpen] = useState<Array<{ tokenId: bigint }>>([])
  const [past, setPast] = useState<Array<{ tokenId: bigint }>>([])

  useEffect(() => {
    let mounted = true
    const run = async () => {
      const ids = await findUserPositions()
      const openArr: Array<{ tokenId: bigint }> = []
      const pastArr: Array<{ tokenId: bigint }> = []
      for (const it of ids) {
        const info = await getPositionInfo(it.tokenId)
        if (!info) continue
        if (info.isSettled) pastArr.push({ tokenId: it.tokenId })
        else openArr.push({ tokenId: it.tokenId })
      }
      if (mounted) {
        setOpen(openArr)
        setPast(pastArr)
      }
    }
    run()
    return () => {
      mounted = false
    }
  }, [findUserPositions, getPositionInfo])

  return (
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <GlassWrap className="p-4">
        <div className="mb-3 text-sm font-semibold">Open Positions</div>
        <div className="space-y-2 text-sm">
          {open.length === 0 && <div className="text-white/50">No open positions</div>}
          {open.map(({ tokenId }) => (
            <div key={String(tokenId)} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="truncate text-white/80">#{String(tokenId)}</div>
              <span className="mr-2 rounded-full bg-cyan-400/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">Projected</span>
              <SettleButton tokenId={tokenId} canSettlePosition={canSettlePosition} settlePosition={settlePosition} user={address as `0x${string}` | undefined} />
            </div>
          ))}
        </div>
      </GlassWrap>
      <GlassWrap className="p-4">
        <div className="mb-3 text-sm font-semibold">Past Positions</div>
        <div className="space-y-2 text-sm">
          {past.length === 0 && <div className="text-white/50">No past positions</div>}
          {past.map(({ tokenId }) => (
            <div key={String(tokenId)} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="truncate text-white/80">#{String(tokenId)}</div>
              <span className="rounded-full bg-fuchsia-400/20 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-300">Realized</span>
            </div>
          ))}
        </div>
      </GlassWrap>
    </div>
  )
}

function SettleButton({ tokenId, canSettlePosition, settlePosition, user }: {
  tokenId: bigint
  canSettlePosition: (tokenId: bigint) => Promise<{ canSettle: boolean; reason: string }>
  settlePosition: (tokenId: bigint, user: `0x${string}`) => Promise<unknown>
  user?: `0x${string}`
}) {
  const [can, setCan] = useState<null | { canSettle: boolean; reason: string }>(null)
  useEffect(() => {
    let mounted = true
    const run = async () => {
      const r = await canSettlePosition(tokenId)
      if (mounted) setCan(r)
    }
    run()
    return () => { mounted = false }
  }, [tokenId, canSettlePosition])

  const onSettle = useCallback(async () => {
    if (!user) return
    await settlePosition(tokenId, user)
  }, [settlePosition, tokenId, user])

  if (!can) return <div className="text-xs text-white/50">Checking…</div>
  if (!can.canSettle) return <div className="text-xs text-white/50">{can.reason || "Locked"}</div>

  return (
    <Button size="sm" className="bg-emerald-400 text-black hover:bg-emerald-300" onClick={onSettle}>Settle</Button>
  )
}

export default function DualInvest2Page() {
  const chainId = useChainId()
  const markets = getMarketsForChain(chainId).filter(m => m.hasSmartContract)
  const tradable = markets.filter(m => ["usdc", "usdt"].indexOf(m.id) === -1)

  const [tab, setTab] = useState<"sell" | "buy">("sell")
  const direction: Direction = tab === "sell" ? 0 : 1
  const accent = "#5e7945"

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-8">
      {/* background cyber gradient */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(1000px_500px_at_10%_10%,rgba(168,85,247,0.08),transparent),radial-gradient(1000px_500px_at_90%_20%,rgba(34,211,238,0.08),transparent)]" />

      <div className="mb-6">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-2xl font-bold tracking-tight"
        >
          Dual Investments
        </motion.h1>
        <div className="mt-1 text-sm text-muted-foreground">Tap a card to enter.</div>
      </div>

      <GlassWrap className="p-2">
        <div className="mb-2 flex items-center gap-3 px-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: accent }} /> Projected</div>
          <div className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: accent }} /> Realized</div>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <TabsList className="relative grid w-full grid-cols-2 rounded-2xl border border-white/20  from-white/50 to-white/30 p-1 dark:from-white/10 dark:to-white/5">
            <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/20" />
            <TabsTrigger value="sell" className="relative rounded-xl px-4 py-2 text-sm text-black/80 backdrop-blur transition data-[state=active]:bg-[#5e7945]/20 data-[state=active]:text-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)] dark:text-white/80">
              Sell
            </TabsTrigger>
            <TabsTrigger value="buy" className="relative rounded-xl px-4 py-2 text-sm text-black/80 backdrop-blur transition data-[state=active]:bg-[#5e7945]/20 data-[state=active]:text-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)] dark:text-white/80">
              Buy
            </TabsTrigger>
          </TabsList>
          <TabsContent value="sell" className="mt-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tradable.map((m) => (
                <AssetCard key={m.id} assetId={m.id} direction={0} />
              ))}
            </div>
          </TabsContent>
          <TabsContent value="buy" className="mt-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tradable.map((m) => (
                <AssetCard key={m.id} assetId={m.id} direction={1} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </GlassWrap>

      <PositionsPanel />

      {/* Admin Debug Panel */}
      <AdminDebugPanel />

      {/* Quick jump chips */}
      <div className="mt-10 max-w-3xl mx-auto flex flex-wrap gap-2 justify-center px-2 md:px-0">
        {[
          { href: "#what-is-di", label: "What is Dual Invest" },
          { href: "#how-it-works", label: "How it Works" },
          { href: "#benefits", label: "Benefits" },
          { href: "#risks", label: "Risks" },
          { href: "#who", label: "Who it's for" },
          { href: "#examples", label: "Examples" },
          { href: "#faq", label: "FAQ" },
        ].map((item) => (
          <a key={item.href} href={item.href}>
            <Badge
              className="cursor-pointer transition-opacity hover:opacity-90"
              style={{ backgroundColor: accent, color: "black" }}
            >
              {item.label}
            </Badge>
          </a>
        ))}
      </div>

      {/* Educational article */}
      <div className="mt-8 px-2 md:px-0 max-w-3xl mx-auto space-y-8">
        <section id="what-is-di" className="space-y-3">
          <h2 className="text-2xl font-semibold" style={{ color: accent }}>What is Dual Investing?</h2>
          <div className="h-1 w-12 rounded" style={{ backgroundColor: accent }} />
          <p className="text-sm md:text-base text-muted-foreground">
            Dual Investing lets you earn a targeted yield over a short window while expressing a simple market view: 
            either “sell high” (earn yield and potentially exit at a higher price) or “buy low” (earn yield and potentially enter at a lower price). 
            Funds are committed until expiry; after that, your payout depends on whether the target price (strike) was reached.
          </p>
        </section>

        <section id="how-it-works" className="space-y-3">
          <h2 className="text-2xl font-semibold" style={{ color: accent }}>How it Works</h2>
          <div className="h-1 w-12 rounded" style={{ backgroundColor: accent }} />
          <ol className="list-decimal pl-5 text-sm md:text-base text-muted-foreground space-y-2">
            <li>
              <span className="font-medium">Choose direction:</span> Sell High (CALL) if you’re happy to take profit above a target; Buy Low (PUT) if you’d like to accumulate below a target.
            </li>
            <li>
              <span className="font-medium">Pick time and strike:</span> Select a holding period (e.g., 3–14 days) and a target price.
            </li>
            <li>
              <span className="font-medium">Commit amount:</span> Deposit from collateral or wallet. You’ll see an estimated APY range based on recent market conditions.
            </li>
            <li>
              <span className="font-medium">At expiry:</span> If price hits the target, you settle at the strike (with yield). If not, you keep your original asset plus yield.
            </li>
          </ol>
          <Alert className="mt-2" style={{ borderColor: accent, background: "#5e7945" }}>
            <AlertTitle style={{ color: accent }}>Tip</AlertTitle>
            <AlertDescription>
              Not sure where to start? Begin with a small test amount and a short duration to experience the flow.
            </AlertDescription>
          </Alert>
        </section>

        <section id="benefits" className="space-y-3">
          <h2 className="text-2xl font-semibold" style={{ color: accent }}>Benefits</h2>
          <div className="h-1 w-12 rounded" style={{ backgroundColor: accent }} />
          <ul className="list-disc pl-5 text-sm md:text-base text-muted-foreground space-y-2">
            <li><span className="font-medium">Earn while waiting:</span> Generate yield during a short holding window.</li>
            <li><span className="font-medium">Simple thesis:</span> A clear “buy low” or “sell high” stance—no complex options jargon needed.</li>
            <li><span className="font-medium">Flexible windows:</span> Pick durations that fit your schedule and market view.</li>
            <li><span className="font-medium">Self-custodial:</span> You interact directly from your wallet; approvals are explicit.</li>
          </ul>
        </section>

        <section id="risks" className="space-y-3">
          <h2 className="text-2xl font-semibold" style={{ color: accent }}>Risks</h2>
          <div className="h-1 w-12 rounded" style={{ backgroundColor: accent }} />
          <ul className="list-disc pl-5 text-sm md:text-base text-muted-foreground space-y-2">
            <li><span className="font-medium">Market movement:</span> If your view is wrong, you may end up selling earlier than ideal or buying higher than you hoped.</li>
            <li><span className="font-medium">Lock-up until expiry:</span> Funds are committed for the selected window; consider your liquidity needs.</li>
            <li><span className="font-medium">Strike selection:</span> Aggressive targets can reduce the chance of being hit (and vice versa).</li>
            <li><span className="font-medium">Smart contract risk:</span> As with any DeFi protocol, use at your own risk and size positions prudently.</li>
          </ul>
        </section>

        <section id="who" className="space-y-3">
          <h2 className="text-2xl font-semibold" style={{ color: accent }}>Who Is It For?</h2>
          <div className="h-1 w-12 rounded" style={{ backgroundColor: accent }} />
          <p className="text-sm md:text-base text-muted-foreground">
            Ideal for users who want to earn short-term yield with a directional opinion and clear boundaries.
            Less suited for traders who need instant liquidity or expect to change positions frequently during the period.
          </p>
        </section>

        <section id="examples" className="space-y-3">
          <h2 className="text-2xl font-semibold" style={{ color: accent }}>Quick Examples</h2>
          <div className="h-1 w-12 rounded" style={{ backgroundColor: accent }} />
          <ul className="list-disc pl-5 text-sm md:text-base text-muted-foreground space-y-2">
            <li>
              <span className="font-medium">Sell High (CALL):</span> You deposit 10 ETH for 7 days with a strike above current price. If price hits, you realize proceeds at the strike plus yield; if not, you keep your ETH plus yield.
            </li>
            <li>
              <span className="font-medium">Buy Low (PUT):</span> You commit USDC for 7 days with a lower strike. If price falls to the strike, you acquire ETH at that level (plus yield considerations). If not, you keep USDC plus yield.
            </li>
          </ul>
        </section>

        <section id="faq" className="space-y-3">
          <h2 className="text-2xl font-semibold" style={{ color: accent }}>FAQ</h2>
          <div className="h-1 w-12 rounded" style={{ backgroundColor: accent }} />
          <Accordion type="single" collapsible>
            <AccordionItem value="faq-1">
              <AccordionTrigger>When do I receive the payout?</AccordionTrigger>
              <AccordionContent className="text-sm md:text-base text-muted-foreground">
                After the selected period ends. If your strike was hit, settlement follows the target outcome; otherwise you keep your original asset plus yield.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="faq-2">
              <AccordionTrigger>Can I exit before expiry?</AccordionTrigger>
              <AccordionContent className="text-sm md:text-base text-muted-foreground">
                Positions are designed for short, fixed windows and generally can’t be exited early. Choose durations that fit your liquidity needs.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="faq-3">
              <AccordionTrigger>What determines the APY range?</AccordionTrigger>
              <AccordionContent className="text-sm md:text-base text-muted-foreground">
                Recent market rates, volatility, and your selected strike and duration. The UI shows live ranges to help you set expectations.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
      </div>
    </div>
  )
}

function AdminDebugPanel() {
  const chainId = useChainId()
  const { address } = useAccount()
  const di = useDualInvestmentAddresses()
  const cfg = getChainConfig(chainId) as any
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })
  const { getManagerDiagnostics } = useDualDiagnostics()

  const defaultCTokenIn = useMemo(() => {
    // Choose a sensible market: LINK if present, else first tradable
    const markets = getMarketsForChain(chainId).filter(m => m.hasSmartContract)
    const link = markets.find(m => m.id.toLowerCase() === 'link')
    const chosen = link || markets.find(m => ["usdc","usdt"].indexOf(m.id) === -1) || markets[0]
    return getAssetContractAddresses(chosen?.id || 'link', chainId)?.pTokenAddress as `0x${string}` | undefined
  }, [chainId])
  const defaultUnderlyingIn = useMemo(() => {
    const markets = getMarketsForChain(chainId).filter(m => m.hasSmartContract)
    const link = markets.find(m => m.id.toLowerCase() === 'link')
    const chosen = link || markets.find(m => ["usdc","usdt"].indexOf(m.id) === -1) || markets[0]
    return getAssetContractAddresses(chosen?.id || 'link', chainId)?.underlyingAddress as `0x${string}` | undefined
  }, [chainId])
  const defaultCTokenOut = useMemo(() => {
    const usdc = getAssetContractAddresses('usdc', chainId)
    return (usdc?.pTokenAddress || defaultCTokenIn) as `0x${string}` | undefined
  }, [chainId, defaultCTokenIn])

  const peridottroller = useMemo(() => {
    return (cfg?.peridottrollerG7Proxy || cfg?.unitrollerProxy || cfg?.peridottrollerG7Impl || "0x0000000000000000000000000000000000000000") as `0x${string}`
  }, [cfg])
  const protocolToken = useMemo(() => {
    return (cfg?.peridotToken || cfg?.peridotTokenSymbolP || "0x0000000000000000000000000000000000000000") as `0x${string}`
  }, [cfg])
  const protocolTreasury = address as `0x${string}` | undefined

  const onInitialize = useCallback(async () => {
    if (!walletClient || !di?.managerImplementation || !di?.erc1155DualPosition || !di?.vaultExecutor || !di?.settlementEngine || !di?.compoundBorrowRouter || !di?.riskGuard || !peridottroller || !protocolToken || !protocolTreasury) return
    try {
      console.log('[DualInvest:admin] initialize request', {
        manager: di.managerImplementation,
        positionToken: di.erc1155DualPosition,
        vaultExecutor: di.vaultExecutor,
        settlementEngine: di.settlementEngine,
        borrowRouter: di.compoundBorrowRouter,
        riskGuard: di.riskGuard,
        peridottroller,
        protocolTreasury,
        protocolToken,
      })
      const hash = await walletClient.writeContract({
        address: di.managerImplementation as `0x${string}`,
        abi: managerAbi as any,
        functionName: 'initialize',
        args: [di.erc1155DualPosition, di.vaultExecutor, di.settlementEngine, di.compoundBorrowRouter, di.riskGuard, peridottroller, protocolTreasury, protocolToken],
        account: address as `0x${string}`,
        chain: undefined,
      })
      await publicClient?.waitForTransactionReceipt({ hash })
      const diag = await getManagerDiagnostics({ cTokenIn: (defaultCTokenIn as any) })
      console.log('[DualInvest:admin] initialize done', diag)
    } catch (e: any) {
      console.log('[DualInvest:admin] initialize error', e?.shortMessage || e?.message || String(e))
    }
  }, [walletClient, publicClient, di?.managerImplementation, di?.erc1155DualPosition, di?.vaultExecutor, di?.settlementEngine, di?.compoundBorrowRouter, di?.riskGuard, peridottroller, protocolTreasury, protocolToken, address, getManagerDiagnostics, defaultCTokenIn])

  const onSupportMarkets = useCallback(async () => {
    if (!walletClient || !di?.managerImplementation) return
    const cIn = defaultCTokenIn
    const cOut = defaultCTokenOut
    if (!cIn) return
    try {
      console.log('[DualInvest:admin] setSupportedCToken', { cIn, cOut })
      let hash = await walletClient.writeContract({ address: di.managerImplementation as `0x${string}`, abi: managerAbi as any, functionName: 'setSupportedCToken', args: [cIn, true], account: address as `0x${string}`, chain: undefined })
      await publicClient?.waitForTransactionReceipt({ hash })
      if (cOut) {
        hash = await walletClient.writeContract({ address: di.managerImplementation as `0x${string}`, abi: managerAbi as any, functionName: 'setSupportedCToken', args: [cOut, true], account: address as `0x${string}`, chain: undefined })
        await publicClient?.waitForTransactionReceipt({ hash })
      }
      // Try integrate borrow on input
      hash = await walletClient.writeContract({ address: di.managerImplementation as `0x${string}`, abi: managerAbi as any, functionName: 'setMarketIntegration', args: [cIn, true], account: address as `0x${string}`, chain: undefined })
      await publicClient?.waitForTransactionReceipt({ hash })
      const diag = await getManagerDiagnostics({ cTokenIn: cIn, cTokenOut: cOut })
      console.log('[DualInvest:admin] support done', diag)
    } catch (e: any) {
      console.log('[DualInvest:admin] support error', e?.shortMessage || e?.message || String(e))
    }
  }, [walletClient, publicClient, di?.managerImplementation, defaultCTokenIn, defaultCTokenOut, address, getManagerDiagnostics])

  const onTestCanEnter = useCallback(async () => {
    if (!publicClient || !di?.managerImplementation) return
    const cIn = defaultCTokenIn
    if (!cIn || !address) return
    try {
      const one = BigInt("1" + "0".repeat(18))
      const underlyingAmt = one * BigInt("10") // 10 underlying units
      // Convert to cToken amount for collateral path: cToken = underlying * 1e18 / exchangeRate
      const exchangeRate = await publicClient.readContract({ address: cIn, abi: pTokenAbi as any, functionName: 'exchangeRateStored', args: [] }) as bigint
      const zero = BigInt(0)
      const cTokenAmt = exchangeRate > zero ? (underlyingAmt * one) / exchangeRate : zero
      console.log('[DualInvest:admin] test amounts', { underlyingAmt: String(underlyingAmt), exchangeRate: String(exchangeRate), cTokenAmt: String(cTokenAmt) })
      const [canEnterCol, reasonCol] = await publicClient.readContract({ address: di.managerImplementation as `0x${string}`, abi: managerAbi as any, functionName: 'canEnterPosition', args: [address, cIn, cTokenAmt, true] }) as [boolean, string]
      console.log('[DualInvest:admin] canEnter (collateral)', { canEnter: canEnterCol, reason: reasonCol })
      const [canEnterWal, reasonWal] = await publicClient.readContract({ address: di.managerImplementation as `0x${string}`, abi: managerAbi as any, functionName: 'canEnterPosition', args: [address, cIn, underlyingAmt, false] }) as [boolean, string]
      console.log('[DualInvest:admin] canEnter (wallet)', { canEnter: canEnterWal, reason: reasonWal })
    } catch (e: any) {
      console.log('[DualInvest:admin] canEnter error', e?.shortMessage || e?.message || String(e))
    }
  }, [publicClient, di?.managerImplementation, defaultCTokenIn, address])

  const onSetRiskTesting = useCallback(async () => {
    if (!walletClient || !di?.managerImplementation) return
    try {
      const maxPos = BigInt("1000000000000000000000000000000")
      const minPos = BigInt("1")
      // Manager expects expiry bounds as ABSOLUTE TIMESTAMPS (seconds since epoch)
      const nowSec = Math.floor(Date.now() / 1000)
      const minExp = BigInt(String(nowSec + 1 * 24 * 60 * 60)) // now + 1 day
      const maxExp = BigInt(String(nowSec + 30 * 24 * 60 * 60)) // now + 30 days
      console.log('[DualInvest:admin] setRiskParameters', { maxPos: String(maxPos), minPos: String(minPos), maxExp: String(maxExp), minExp: String(minExp) })
      const hash = await walletClient.writeContract({ address: di.managerImplementation as `0x${string}`, abi: managerAbi as any, functionName: 'setRiskParameters', args: [maxPos, minPos, maxExp, minExp], account: address as `0x${string}`, chain: undefined })
      await publicClient?.waitForTransactionReceipt({ hash })
      const diag = await getManagerDiagnostics({ cTokenIn: (defaultCTokenIn as any), cTokenOut: (defaultCTokenOut as any) })
      console.log('[DualInvest:admin] setRiskParameters done', diag)
    } catch (e: any) {
      console.log('[DualInvest:admin] setRiskParameters error', e?.shortMessage || e?.message || String(e))
    }
  }, [walletClient, publicClient, di?.managerImplementation, address, getManagerDiagnostics, defaultCTokenIn, defaultCTokenOut])

  const onDebugEnterCollateral = useCallback(async () => {
    if (!walletClient || !publicClient || !di?.managerImplementation || !defaultCTokenIn || !defaultCTokenOut || !address) return
    try {
      const one = BigInt("1" + "0".repeat(18))
      const underlyingAmt = one * BigInt("1") // 1 underlying
      const exchangeRate = await publicClient.readContract({ address: defaultCTokenIn, abi: pTokenAbi as any, functionName: 'exchangeRateStored', args: [] }) as bigint
      const zero = BigInt(0)
      const cTokenAmt = exchangeRate > zero ? (underlyingAmt * one) / exchangeRate : zero
      const now = Math.floor(Date.now() / 1000)
      // Use absolute bounds from manager; clamp expiry within [min+60, max-60]
      const diag = await getManagerDiagnostics({ cTokenIn: defaultCTokenIn })
      const minAbs = Number(diag?.bounds?.minExpiry || BigInt(String(now + 24 * 60 * 60)))
      const maxAbs = Number(diag?.bounds?.maxExpiry || BigInt(String(now + 30 * 24 * 60 * 60)))
      const target = now + 3 * 24 * 60 * 60
      const expiry = BigInt(String(Math.min(Math.max(target, minAbs + 60), maxAbs - 60)))
      const strike = BigInt("20000000000000000000") // 20 * 1e18
      console.log('[DualInvest:admin] enterPosition (collateral) request', { cTokenIn: defaultCTokenIn, cTokenOut: defaultCTokenOut, amount: String(cTokenAmt), strike: String(strike), expiry: String(expiry) })
      try {
        await publicClient.simulateContract({ account: address as `0x${string}`, address: di.managerImplementation as `0x${string}`, abi: managerAbi as any, functionName: 'enterPosition', args: [defaultCTokenIn, defaultCTokenOut, cTokenAmt, 0, strike, expiry, true, false] })
        console.log('[DualInvest:admin] simulate enterPosition OK')
      } catch (e: any) {
        console.log('[DualInvest:admin] simulate enterPosition REVERT', e?.shortMessage || e?.message || String(e))
      }
      const hash = await walletClient.writeContract({ address: di.managerImplementation as `0x${string}`, abi: managerAbi as any, functionName: 'enterPosition', args: [defaultCTokenIn, defaultCTokenOut, cTokenAmt, 0, strike, expiry, true, false], account: address as `0x${string}`, chain: undefined })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      console.log('[DualInvest:admin] enterPosition (collateral) receipt', receipt)
    } catch (e: any) {
      console.log('[DualInvest:admin] enterPosition (collateral) error', e?.shortMessage || e?.message || String(e))
    }
  }, [walletClient, publicClient, di?.managerImplementation, defaultCTokenIn, defaultCTokenOut, address])

  const onDebugEnterWallet = useCallback(async () => {
    if (!walletClient || !publicClient || !di?.managerImplementation || !defaultCTokenIn || !defaultCTokenOut || !address) return
    try {
      const one = BigInt("1" + "0".repeat(18))
      const underlyingAmt = one * BigInt("1") // 1 underlying
      const now = Math.floor(Date.now() / 1000)
      const diag = await getManagerDiagnostics({ cTokenIn: defaultCTokenIn })
      const minAbs = Number(diag?.bounds?.minExpiry || BigInt(String(now + 24 * 60 * 60)))
      const maxAbs = Number(diag?.bounds?.maxExpiry || BigInt(String(now + 30 * 24 * 60 * 60)))
      const target = now + 3 * 24 * 60 * 60
      const expiry = BigInt(String(Math.min(Math.max(target, minAbs + 60), maxAbs - 60)))
      const strike = BigInt("20000000000000000000")
      console.log('[DualInvest:admin] enterPositionWithBorrowed (wallet) request', { cToken: defaultCTokenIn, cTokenOut: defaultCTokenOut, underlyingAmount: String(underlyingAmt), strike: String(strike), expiry: String(expiry) })
      try {
        await publicClient.simulateContract({ account: address as `0x${string}`, address: di.managerImplementation as `0x${string}`, abi: managerAbi as any, functionName: 'enterPositionWithBorrowed', args: [defaultCTokenIn, defaultCTokenOut, underlyingAmt, 0, strike, expiry] })
        console.log('[DualInvest:admin] simulate enterPositionWithBorrowed OK')
      } catch (e: any) {
        console.log('[DualInvest:admin] simulate enterPositionWithBorrowed REVERT', e?.shortMessage || e?.message || String(e))
      }
      const hash = await walletClient.writeContract({ address: di.managerImplementation as `0x${string}`, abi: managerAbi as any, functionName: 'enterPositionWithBorrowed', args: [defaultCTokenIn, defaultCTokenOut, underlyingAmt, 0, strike, expiry], account: address as `0x${string}`, chain: undefined })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      console.log('[DualInvest:admin] enterPositionWithBorrowed (wallet) receipt', receipt)
    } catch (e: any) {
      console.log('[DualInvest:admin] enterPositionWithBorrowed (wallet) error', e?.shortMessage || e?.message || String(e))
    }
  }, [walletClient, publicClient, di?.managerImplementation, defaultCTokenIn, defaultCTokenOut, address])

  const onApproveDebugPToken = useCallback(async () => {
    if (!walletClient || !di?.vaultExecutor || !defaultCTokenIn || !address) return
    try {
      const max = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
      console.log('[DualInvest:admin] approve pToken to vault', { token: defaultCTokenIn, spender: di.vaultExecutor, amount: String(max) })
      const hash = await walletClient.writeContract({ address: defaultCTokenIn as `0x${string}`, abi: erc20Abi as any, functionName: 'approve', args: [di.vaultExecutor as `0x${string}`, max], account: address as `0x${string}`, chain: undefined })
      const receipt = await publicClient?.waitForTransactionReceipt({ hash })
      console.log('[DualInvest:admin] approve pToken receipt', receipt)
    } catch (e: any) {
      console.log('[DualInvest:admin] approve pToken error', e?.shortMessage || e?.message || String(e))
    }
  }, [walletClient, publicClient, di?.vaultExecutor, defaultCTokenIn, address])

  const onApproveDebugUnderlying = useCallback(async () => {
    if (!walletClient || !di?.vaultExecutor || !defaultUnderlyingIn || !address) return
    try {
      const max = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
      console.log('[DualInvest:admin] approve underlying to vault', { token: defaultUnderlyingIn, spender: di.vaultExecutor, amount: String(max) })
      const hash = await walletClient.writeContract({ address: defaultUnderlyingIn as `0x${string}`, abi: erc20Abi as any, functionName: 'approve', args: [di.vaultExecutor as `0x${string}`, max], account: address as `0x${string}`, chain: undefined })
      const receipt = await publicClient?.waitForTransactionReceipt({ hash })
      console.log('[DualInvest:admin] approve underlying receipt', receipt)
    } catch (e: any) {
      console.log('[DualInvest:admin] approve underlying error', e?.shortMessage || e?.message || String(e))
    }
  }, [walletClient, publicClient, di?.vaultExecutor, defaultUnderlyingIn, address])

  const onDebugEnterBorrow = useCallback(async () => {
    if (!walletClient || !publicClient || !di?.managerImplementation || !defaultCTokenIn || !defaultCTokenOut || !address) return
    try {
      const one = BigInt("1" + "0".repeat(18))
      const borrowUnderlyingAmount = one * BigInt("1")
      const now = Math.floor(Date.now() / 1000)
      const diag = await getManagerDiagnostics({ cTokenIn: defaultCTokenIn })
      const minAbs = Number(diag?.bounds?.minExpiry || BigInt(String(now + 24 * 60 * 60)))
      const maxAbs = Number(diag?.bounds?.maxExpiry || BigInt(String(now + 30 * 24 * 60 * 60)))
      const target = now + 3 * 24 * 60 * 60
      const expiry = BigInt(String(Math.min(Math.max(target, minAbs + 60), maxAbs - 60)))
      const strike = BigInt("20000000000000000000")
      console.log('[DualInvest:admin] borrowAndEnterPosition request', { cToken: defaultCTokenIn, cTokenOut: defaultCTokenOut, borrowUnderlyingAmount: String(borrowUnderlyingAmount), strike: String(strike), expiry: String(expiry) })
      try {
        await publicClient.simulateContract({ account: address as `0x${string}`, address: di.managerImplementation as `0x${string}`, abi: managerAbi as any, functionName: 'borrowAndEnterPosition', args: [defaultCTokenIn, defaultCTokenOut, borrowUnderlyingAmount, 0, strike, expiry] })
        console.log('[DualInvest:admin] simulate borrowAndEnterPosition OK')
      } catch (e: any) {
        console.log('[DualInvest:admin] simulate borrowAndEnterPosition REVERT', e?.shortMessage || e?.message || String(e))
      }
      const hash = await walletClient.writeContract({ address: di.managerImplementation as `0x${string}`, abi: managerAbi as any, functionName: 'borrowAndEnterPosition', args: [defaultCTokenIn, defaultCTokenOut, borrowUnderlyingAmount, 0, strike, expiry], account: address as `0x${string}`, chain: undefined })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      console.log('[DualInvest:admin] borrowAndEnterPosition receipt', receipt)
    } catch (e: any) {
      console.log('[DualInvest:admin] borrowAndEnterPosition error', e?.shortMessage || e?.message || String(e))
    }
  }, [walletClient, publicClient, di?.managerImplementation, defaultCTokenIn, defaultCTokenOut, address])

  const onAuthorizeManager = useCallback(async () => {
    if (!walletClient || !publicClient || !di?.managerImplementation || !di?.vaultExecutor || !di?.erc1155DualPosition) return
    try {
      console.log('[DualInvest:admin] authorize manager for vault and position token')
      // Authorize manager in VaultExecutor
      let hash = await walletClient.writeContract({ address: di.vaultExecutor as `0x${string}`, abi: vaultExecutorAbi as any, functionName: 'setAuthorizedManager', args: [di.managerImplementation as `0x${string}`, true], account: address as `0x${string}`, chain: undefined })
      await publicClient.waitForTransactionReceipt({ hash })
      // Authorize manager to mint on PositionToken
      hash = await walletClient.writeContract({ address: di.erc1155DualPosition as `0x${string}`, abi: positionTokenAbi as any, functionName: 'setAuthorizedMinter', args: [di.managerImplementation as `0x${string}`, true], account: address as `0x${string}`, chain: undefined })
      await publicClient.waitForTransactionReceipt({ hash })
      // Authorize VaultExecutor as destination in BorrowRouter (required for borrow path)
      if (di.compoundBorrowRouter) {
        hash = await walletClient.writeContract({ address: di.compoundBorrowRouter as `0x${string}`, abi: borrowRouterAbi as any, functionName: 'setAuthorizedDestination', args: [di.vaultExecutor as `0x${string}`, true], account: address as `0x${string}`, chain: undefined })
        await publicClient.waitForTransactionReceipt({ hash })
      }
      console.log('[DualInvest:admin] authorization done')
    } catch (e: any) {
      console.log('[DualInvest:admin] authorization error', e?.shortMessage || e?.message || String(e))
    }
  }, [walletClient, publicClient, di?.managerImplementation, di?.vaultExecutor, di?.erc1155DualPosition, address])

  return (
    <GlassWrap className="p-3 mt-6">
      <div className="text-sm font-semibold">Admin Debug</div>
      <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] text-black/70 dark:text-white/60">
        <div>Manager: {di?.managerImplementation}</div>
        <div>PositionToken: {di?.erc1155DualPosition}</div>
        <div>VaultExecutor: {di?.vaultExecutor}</div>
        <div>SettlementEngine: {di?.settlementEngine}</div>
        <div>BorrowRouter: {di?.compoundBorrowRouter}</div>
        <div>RiskGuard: {di?.riskGuard}</div>
        <div>Peridottroller: {peridottroller}</div>
        <div>ProtocolToken: {protocolToken}</div>
        <div>ProtocolTreasury: {protocolTreasury}</div>
        <div>Default cTokenIn: {defaultCTokenIn}</div>
        <div>Default cTokenOut: {defaultCTokenOut}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={onInitialize} className="bg-[#5e7945] text-white hover:opacity-90">Initialize Manager</Button>
        <Button onClick={onSupportMarkets} className="bg-[#5e7945] text-white hover:opacity-90">Enable Markets</Button>
        <Button onClick={onSetRiskTesting} className="bg-[#5e7945] text-white hover:opacity-90">Set Risk Params (testing)</Button>
        <Button onClick={onAuthorizeManager} className="bg-[#5e7945] text-white hover:opacity-90">Authorize Manager</Button>
        <Button onClick={onTestCanEnter} className="bg-[#5e7945] text-white hover:opacity-90">Test canEnter</Button>
        <Button onClick={onApproveDebugPToken} className="bg-[#5e7945] text-white hover:opacity-90">Approve pToken</Button>
        <Button onClick={onApproveDebugUnderlying} className="bg-[#5e7945] text-white hover:opacity-90">Approve Underlying</Button>
        <Button onClick={onDebugEnterCollateral} className="bg-[#5e7945] text-white hover:opacity-90">Debug Enter (collateral)</Button>
        <Button onClick={onDebugEnterWallet} className="bg-[#5e7945] text-white hover:opacity-90">Debug Enter (wallet)</Button>
        <Button onClick={onDebugEnterBorrow} className="bg-[#5e7945] text-white hover:opacity-90">Debug Enter (borrow)</Button>
      </div>
    </GlassWrap>
  )
}


