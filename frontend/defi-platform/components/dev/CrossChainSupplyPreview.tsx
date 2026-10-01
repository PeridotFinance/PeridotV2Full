"use client"

/**
 * Preview of the Expert cross-chain flows at /app/sodax/preview: the "Pay with"
 * and "Receive on" forms (live quotes, stubbed start), every step of both
 * progress cards and the banner rows, each with made-up numbers and no wallet.
 * Nothing here signs.
 */
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { getStellarSorobanMarkets } from "@/data/market-data"
import {
  CrossChainFlowStatic,
  type CrossChainFlowContextValue,
  type XcFlow,
} from "@/components/funding/CrossChainFlowProvider"
import { CrossChainWithdrawSection } from "@/components/funding/CrossChainWithdrawSection"
import { CrossChainSupplySection } from "@/components/funding/CrossChainSupplySection"
import { TransferProgress } from "@/components/funding/TransferProgress"
import { CrossChainActivityBanner } from "@/components/funding/CrossChainActivityBanner"
import type { FundingSource } from "@/hooks/use-funding-sources"
import { xcApi, type XcTokenInfo } from "@/lib/crosschain/client"
import {
  buildSupplyProgress,
  buildWithdrawProgress,
  type ProgressInput,
  type SupplyStepState,
  type WithdrawProgressInput,
} from "@/lib/crosschain/present"
import type { WithdrawNote } from "@/lib/crosschain/client"
import type { XcTransfer } from "@/lib/crosschain/view"

const STELLAR = "GPREVIEWPREVIEWPREVIEWPREVIEWPREVIEWPREVIEWPREVIEWPREVIEW"
const EVM = "0x000000000000000000000000000000000000dEaD"
const HASH = "0x5f1c0de5a2b0c6f1e4d3b2a1908172635445362718293a4b5c6d7e8f90a1b2c3"

const noop = () => {}

const transfer = (patch: Partial<XcTransfer> = {}): XcTransfer => ({
  id: 42,
  direction: "in",
  status: "relaying",
  stellarAddress: STELLAR,
  evmAddress: EVM,
  src: { chain: 43114, token: "0xusdc", symbol: "USDC", decimals: 6, amount: "25000000", txHash: HASH },
  dst: { chain: "stellar", token: "CUSDC", symbol: "USDC", decimals: 7 },
  quotedOut: "249650000",
  minOut: "247150000",
  deliveredOut: null,
  usdValue: 25,
  sodaxStatus: "relaying",
  fillTxHash: null,
  intentCancelled: null,
  failReason: null,
  supplyTxHash: null,
  deadlineAt: null,
  createdAt: new Date(Date.now() - 38_000).toISOString(),
  updatedAt: new Date().toISOString(),
  ...patch,
})

const flow: XcFlow = {
  kind: "supply",
  marketId: "usdc-stellar",
  srcChain: 43114,
  srcSymbol: "USDC",
  srcAmount: "25",
  dstChain: "stellar",
  dstSymbol: "USDC",
  transferId: 42,
  auto: true,
  resumed: false,
  startedAt: Date.now() - 38_000,
  usd: 25,
  withdrawKnown: false,
}

const withdrawFlow: XcFlow = {
  ...flow,
  kind: "withdraw",
  srcChain: "stellar",
  dstChain: 8453,
  auto: false,
  withdrawKnown: true,
}

const outTransfer = (patch: Partial<XcTransfer> = {}): XcTransfer =>
  transfer({
    id: 43,
    direction: "out",
    src: { chain: "stellar", token: "CUSDC", symbol: "USDC", decimals: 7, amount: "250000000", txHash: "ab12cd34" },
    dst: { chain: 8453, token: "0xusdc", symbol: "USDC", decimals: 6 },
    quotedOut: "24960000",
    minOut: "24710000",
    ...patch,
  })

const note: WithdrawNote = {
  key: "wpreview",
  stellarAddress: STELLAR,
  evmAddress: EVM,
  marketId: "usdc-stellar",
  srcToken: { address: "CUSDC", symbol: "USDC", decimals: 7 },
  dstChain: 8453,
  dstToken: { address: "0xusdc", symbol: "USDC", decimals: 6 },
  raw: "250012000",
  requested: "25",
  withdrawTxHash: "feed01",
  transferId: null,
  at: Date.now() - 3 * 60_000,
}

const baseInput: ProgressInput = {
  step: "idle",
  failedAt: null,
  errorMessage: null,
  approvalSeen: true,
  stalled: false,
  sodaxStatus: "relaying",
  srcChain: 43114,
  srcSymbol: "USDC",
  srcAmount: "25",
  dstSymbol: "USDC",
  arrived: null,
  minOut: "24.715",
  silentStellar: true,
  supply: { phase: "idle" },
}

function value(patch: Partial<CrossChainFlowContextValue>): CrossChainFlowContextValue {
  return {
    stellarAddress: STELLAR,
    evmAddress: EVM,
    silentStellar: true,
    sources: [],
    sourcesFetched: true,
    stellarTokens: [],
    flow: null,
    progress: null,
    transfer: null,
    srcTxHash: null,
    supply: { phase: "idle" },
    withdraw: { phase: "idle" },
    busy: false,
    blocked: false,
    openTransfers: [],
    waitingWithdrawals: [],
    startSupply: async () => {
      console.info("[preview] startSupply is stubbed")
    },
    startWithdraw: async () => {
      console.info("[preview] startWithdraw is stubbed")
    },
    supplyNow: noop,
    sendNow: noop,
    pickUp: noop,
    pickUpWithdrawal: noop,
    keepInWallet: async () => {},
    keepOnStellar: async () => {},
    clearFlow: noop,
    preselect: null,
    offerSource: noop,
    focusMarket: noop,
    ...patch,
  }
}

const baseWithdraw: WithdrawProgressInput = {
  withdraw: { phase: "done", amount: "25.0012", txHash: "feed01" },
  withdrawKnown: true,
  step: "idle",
  failedAt: null,
  errorMessage: null,
  stalled: false,
  sodaxStatus: "relaying",
  marketSymbol: "USDC",
  amount: "25",
  dstChain: 8453,
  dstSymbol: "USDC",
  arrived: null,
  minOut: "24.71",
  silentStellar: true,
  sendWaiting: false,
}

function withdrawState(label: string, input: Partial<WithdrawProgressInput>, t: XcTransfer | null = outTransfer()) {
  const merged = { ...baseWithdraw, ...input }
  const progress = buildWithdrawProgress(merged)
  return {
    label,
    value: value({
      flow: withdrawFlow,
      progress,
      withdraw: merged.withdraw,
      transfer: t,
      srcTxHash: t?.src.txHash ?? null,
      busy: progress.tone === "working",
    }),
  }
}

function state(label: string, input: Partial<ProgressInput>, supply: SupplyStepState = { phase: "idle" }, t = transfer()) {
  const progress = buildSupplyProgress({ ...baseInput, ...input, supply })
  return {
    label,
    value: value({ flow, progress, supply, transfer: t, srcTxHash: t.src.txHash, busy: progress.tone === "working" }),
  }
}

export function CrossChainSupplyPreview() {
  const usdc = useMemo(() => getStellarSorobanMarkets().find((a) => a.id === "usdc-stellar")!, [])
  const { data: stellarTokens = [] } = useQuery({
    queryKey: ["xc-tokens", "stellar"],
    queryFn: async () => (await xcApi.tokens("stellar")).tokens,
  })
  const { data: avaxTokens = [] } = useQuery({
    queryKey: ["xc-tokens", 43114],
    queryFn: async () => (await xcApi.tokens(43114)).tokens,
  })

  const sources = useMemo<FundingSource[]>(() => {
    const pick = (symbol: string): XcTokenInfo | undefined => avaxTokens.find((t) => t.symbol === symbol)
    const out: FundingSource[] = []
    const usdcAvax = pick("USDC")
    const avax = pick("AVAX")
    if (usdcAvax) out.push({ chain: 43114, chainName: "Avalanche", token: usdcAvax, balance: BigInt(25_000_000), amount: 25, usd: 25, isNative: false })
    if (avax) out.push({ chain: 43114, chainName: "Avalanche", token: avax, balance: BigInt(0), amount: 0.12, usd: avax.usdPrice ? 0.12 * avax.usdPrice : null, isNative: true })
    return out
  }, [avaxTokens])

  const states = [
    state("Confirm the approval", { step: "approving" }),
    state("Confirm the send", { step: "signing" }),
    state("Waiting for Avalanche", { step: "confirming" }),
    state("Converting", { step: "converting" }),
    state("Converting, slow", { step: "converting", stalled: true }),
    state("Arriving", { step: "arriving" }),
    state("Supplying", { step: "arrived", arrived: "24.965" }, { phase: "running", message: "Approving market access" }),
    state("Supplied", { step: "arrived", arrived: "24.965" }, { phase: "done", amount: "24.965", txHash: "abc123" }),
    state("Arrived after a reload, waiting for a click", { step: "arrived", arrived: "24.965", approvalSeen: false }, { phase: "waiting" }, transfer({ status: "solved", deliveredOut: "249650000" })),
    state("Supply cancelled in the wallet", { step: "arrived", arrived: "24.965" }, { phase: "failed", error: "Cancelled in the wallet." }, transfer({ status: "solved" })),
    state("Cancelled before sending", { step: "failed", failedAt: "signing", errorMessage: "Cancelled in the wallet. Nothing was sent." }, { phase: "idle" }, transfer({ status: "created", src: { ...transfer().src, txHash: null } })),
    state("Relay failed", { step: "failed", failedAt: "converting", errorMessage: "The conversion failed and the intent was refunded to your Avalanche wallet." }, { phase: "idle" }, transfer({ status: "failed" })),
  ]

  const withdrawStates = [
    withdrawState("Withdrawing from the market", { withdraw: { phase: "running", message: "Submitting to the network" }, step: "idle" }, null),
    withdrawState("Withdrawal refused", { withdraw: { phase: "failed", error: "Cancelled in the wallet." } }, null),
    withdrawState("Sending from Stellar", { step: "signing" }, outTransfer({ status: "created", src: { ...outTransfer().src, txHash: null } })),
    withdrawState("Converting", { step: "converting" }),
    withdrawState("Arriving on Base", { step: "arriving", sodaxStatus: "executed" }, outTransfer({ status: "solved" })),
    withdrawState("Arrived", { step: "arrived", arrived: "24.9601" }, outTransfer({ status: "solved", deliveredOut: "24960100" })),
    withdrawState("Waiting after a reload", { sendWaiting: true }, null),
    withdrawState("Send cancelled", { step: "failed", failedAt: "signing", errorMessage: "Cancelled in the wallet. Nothing was sent." }),
    withdrawState("Conversion failed", {
      step: "failed",
      failedAt: "converting",
      errorMessage: "This didn't go through. Your money is back in your Stellar wallet.",
    }, outTransfer({ status: "failed" })),
    withdrawState("Picked up without its note", { withdrawKnown: false, withdraw: { phase: "idle" }, step: "converting" }),
  ]

  const bannerValue = value({
    sources,
    flow,
    progress: buildSupplyProgress({ ...baseInput, step: "converting" }),
    openTransfers: [
      transfer({ id: 40, status: "relaying" }),
      transfer({ id: 41, status: "solved", deliveredOut: "49930574", src: { ...transfer().src, chain: 8453, amount: "50000000" } }),
      outTransfer({ id: 44, status: "relaying" }),
    ],
    waitingWithdrawals: [note],
  })
  const withdrawBannerValue = value({
    flow: withdrawFlow,
    progress: buildWithdrawProgress({ ...baseWithdraw, step: "converting" }),
  })
  const hintValue = value({ sources })

  return (
    <div className="mx-auto max-w-5xl space-y-8 text-sm">
      <div>
        <h1 className="text-xl font-semibold">Cross-chain supply and withdraw (preview)</h1>
        <p className="text-muted-foreground">Made-up numbers. The form quotes live; its button does nothing here.</p>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Banner</h2>
        <CrossChainFlowStatic value={bannerValue}>
          <CrossChainActivityBanner expandedMarketId={null} />
        </CrossChainFlowStatic>
        <CrossChainFlowStatic value={withdrawBannerValue}>
          <CrossChainActivityBanner expandedMarketId={null} />
        </CrossChainFlowStatic>
        <CrossChainFlowStatic value={hintValue}>
          <CrossChainActivityBanner expandedMarketId={null} />
        </CrossChainFlowStatic>
      </section>

      <section className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
        <div className="space-y-2">
          <h2 className="font-semibold">Supply tab, Stellar wallet empty</h2>
          <div className="rounded-2xl border border-border/40 p-4">
            <CrossChainFlowStatic value={value({ sources, stellarTokens, stellarAddress: null })}>
              <CrossChainSupplySection
                asset={usdc}
                supplyApy={6.2}
                priceUsd={1}
                stellarBalance={0}
                stellarForm={<div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">Stellar supply form</div>}
                stellarBusy={false}
              />
            </CrossChainFlowStatic>
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold">Supply tab, Stellar wallet holds USDC</h2>
          <div className="rounded-2xl border border-border/40 p-4">
            <CrossChainFlowStatic value={value({ sources, stellarTokens, stellarAddress: null })}>
              <CrossChainSupplySection
                asset={usdc}
                supplyApy={6.2}
                priceUsd={1}
                stellarBalance={120.5}
                stellarForm={<div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">Stellar supply form</div>}
                stellarBusy={false}
              />
            </CrossChainFlowStatic>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
        <div className="space-y-2">
          <h2 className="font-semibold">Withdraw tab, Receive on</h2>
          <div className="rounded-2xl border border-border/40 p-4">
            <CrossChainFlowStatic value={value({ stellarTokens, stellarAddress: null })}>
              <CrossChainWithdrawSection
                asset={usdc}
                supplied={120.5}
                hasPosition
                stellarForm={<div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">Stellar withdraw form</div>}
                stellarBusy={false}
              />
            </CrossChainFlowStatic>
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold">Withdraw tab, nothing supplied</h2>
          <div className="rounded-2xl border border-border/40 p-4">
            <CrossChainFlowStatic value={value({ stellarTokens })}>
              <CrossChainWithdrawSection
                asset={usdc}
                supplied={0}
                hasPosition={false}
                stellarForm={<div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">No supplied USDC to withdraw</div>}
                stellarBusy={false}
              />
            </CrossChainFlowStatic>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Withdraw progress</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
          {withdrawStates.map((s) => (
            <div key={s.label} className="space-y-1.5">
              <div className="text-xs font-mono text-muted-foreground">{s.label}</div>
              <CrossChainFlowStatic value={s.value}>
                <TransferProgress />
              </CrossChainFlowStatic>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Supply progress</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
          {states.map((s) => (
            <div key={s.label} className="space-y-1.5">
              <div className="text-xs font-mono text-muted-foreground">{s.label}</div>
              <CrossChainFlowStatic value={s.value}>
                <TransferProgress />
              </CrossChainFlowStatic>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
