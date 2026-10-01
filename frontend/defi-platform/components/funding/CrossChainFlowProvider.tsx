"use client"

/**
 * Money between a Stellar market and another network, in both directions:
 *
 *   - supply (stage X3): the engine carries the money from another network to
 *     the Stellar wallet, then it goes into the market;
 *   - withdraw (stage X4): it comes out of the market into the Stellar wallet,
 *     then the engine carries it to the connected wallet on another network.
 *
 * One provider per Expert view, so exactly one flow runs at a time and the
 * page, not a market panel, owns it: a panel mounts only once it is opened, and
 * a flow resumed after a reload must be followed whether or not its market is
 * open. What it holds:
 *
 *   - the funding sources (every non-zero balance the engine can move),
 *   - the running flow: `useCrossChainTransfer` for the leg between networks,
 *     plus the Stellar step on the market's side (supply after, withdraw before),
 *   - the user's other open transfers and withdrawals, for the banner.
 *
 * After a reload it resumes the newest transfer still on its way, a supply this
 * browser asked for a moment ago (`freshSupplyIntent`), or a withdrawal whose
 * money waits in the Stellar wallet (`withdrawNotesFor`), and opens that market
 * on the right tab. Resume never signs on its own: a supply runs by itself only
 * for a click from the last half hour in this browser, and a withdrawal that
 * has not been sent on waits for "Send to Base".
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useAccount } from "wagmi"
import { useQuery } from "@tanstack/react-query"
import { usePrivy } from "@privy-io/react-auth"
import { formatUnits, parseUnits } from "viem"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { useCrossChainTransfer, useCrossChainTransfers, type XcTokenRef } from "@/hooks/use-crosschain-transfer"
import { useFundingSources, type FundingSource } from "@/hooks/use-funding-sources"
import { announceStellarSupply } from "@/hooks/use-stellar-supply-transaction"
import { announceStellarRedeem } from "@/hooks/use-stellar-redeem-transaction"
import {
  stellarConvertUnderlyingToPtokenAmount,
  stellarDeposit,
  stellarGetTokenBalance,
  stellarWithdraw,
  stellarWithdrawAll,
} from "@/lib/stellar-soroban-lending"
import {
  forgetSupplyIntent,
  forgetWithdrawNote,
  freshSupplyIntent,
  rememberSupplyIntent,
  rememberWithdrawNote,
  updateWithdrawNote,
  withdrawNotesFor,
  xcApi,
  type WithdrawNote,
  type XcTokenInfo,
} from "@/lib/crosschain/client"
import { isUserRejection } from "@/lib/crosschain/errors"
import { STELLAR_XLM_KEEP } from "@/lib/crosschain/preflight"
import { XC_STELLAR_MARKET_SYMBOL, type XcChain } from "@/lib/crosschain/route"
import { isInFlight, type XcTransfer } from "@/lib/crosschain/view"
import {
  buildSupplyProgress,
  buildWithdrawProgress,
  formatTokenAmount,
  type ProgressModel,
  type SupplyStepState,
  type WithdrawLegState,
  type XcFlowStep,
  XC_FOCUS_TAB_EVENT,
} from "@/lib/crosschain/present"
import { trackXc, usdBucket } from "@/lib/analytics/crosschain"

/** Arrivals older than this are no longer offered in the banner. */
const OPEN_ARRIVAL_WINDOW_MS = 7 * 24 * 60 * 60_000
const LIST_POLL_MS = 15_000
/** How long a freshly withdrawn balance may take to show in a balance read. */
const WITHDRAW_MEASURE_TRIES = 6
const WITHDRAW_MEASURE_GAP_MS = 1_500

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The XLM a wallet keeps back, in stroop-like units of `decimals` (no `**` on bigint at ES6). */
function xlmKeep(decimals: number): bigint {
  let v = BigInt(STELLAR_XLM_KEEP)
  for (let i = 0; i < decimals; i++) v *= BigInt(10)
  return v
}

export function marketForStellarSymbol(symbol: string): string | null {
  return Object.entries(XC_STELLAR_MARKET_SYMBOL).find(([, s]) => s === symbol)?.[0] ?? null
}

/** The market a transfer belongs to: where it was supplied to, or withdrawn from. */
export function marketForTransfer(t: Pick<XcTransfer, "direction" | "src" | "dst">): string | null {
  return marketForStellarSymbol(t.direction === "in" ? t.dst.symbol : t.src.symbol)
}

export function sourceKey(s: Pick<FundingSource, "chain" | "token">): string {
  return s.chain === "stellar" ? "stellar" : `${s.chain}:${s.token.address.toLowerCase()}`
}

export type XcFlowKind = "supply" | "withdraw"
export type XcPanelTab = "supply" | "withdraw"

export function tabForFlow(kind: XcFlowKind): XcPanelTab {
  return kind === "withdraw" ? "withdraw" : "supply"
}

/**
 * The flow the page follows. Flat rather than a union per kind: the project
 * compiles with `strict` off, where narrowing on `kind` is unreliable.
 */
export interface XcFlow {
  kind: XcFlowKind
  marketId: string
  srcChain: XcChain
  srcSymbol: string
  /** Whole source tokens, formatted. */
  srcAmount: string
  dstChain: XcChain
  dstSymbol: string
  transferId: number | null
  /** Supply: supply by itself once the money arrived. */
  auto: boolean
  resumed: boolean
  startedAt: number
  /** Dollar value at the start, for analytics. */
  usd: number | null
  /** Withdraw: the pool withdrawal is part of this flow (false for a transfer picked up without its note). */
  withdrawKnown: boolean
}

export interface StartSupplyInput {
  marketId: string
  source: FundingSource
  /** Smallest unit of the source token. */
  amount: bigint
  dstToken: XcTokenRef
  slippageBps?: number
}

export interface StartWithdrawInput {
  marketId: string
  /** Whole tokens, as typed. */
  amount: string
  /** Redeem the whole position, so no dust stays in the market. */
  full: boolean
  /** The market's token on Stellar, as SODAX lists it. */
  srcToken: XcTokenInfo
  dstChain: number
  dstToken: XcTokenInfo
}

interface CrossChainFlowContextValue {
  stellarAddress: string | null
  evmAddress: string | null
  /** Stellar signs without a prompt (embedded wallet). */
  silentStellar: boolean
  sources: FundingSource[]
  sourcesFetched: boolean
  stellarTokens: XcTokenInfo[]
  flow: XcFlow | null
  progress: ProgressModel | null
  transfer: XcTransfer | null
  srcTxHash: string | null
  supply: SupplyStepState
  withdraw: WithdrawLegState
  /** A transfer or its Stellar step is running. */
  busy: boolean
  /** A new flow may not start: one is running, or one waits for the user. */
  blocked: boolean
  /** Transfers that want attention besides the running flow. */
  openTransfers: XcTransfer[]
  /** Withdrawals whose money waits in the Stellar wallet, besides the running flow. */
  waitingWithdrawals: WithdrawNote[]
  startSupply: (input: StartSupplyInput) => Promise<void>
  startWithdraw: (input: StartWithdrawInput) => Promise<void>
  /** Supply what arrived, after a pause or a failed attempt. */
  supplyNow: () => void
  /** Send a withdrawal on, after a pause or a failed attempt. */
  sendNow: () => void
  /** Pick a listed transfer up: follow it, and supply it once it has arrived. */
  pickUp: (t: XcTransfer) => void
  /** Pick a waiting withdrawal up. */
  pickUpWithdrawal: (note: WithdrawNote) => void
  /** Leave an arrived supply in the Stellar wallet. */
  keepInWallet: (t: XcTransfer) => Promise<void>
  /** Leave a withdrawal's money in the Stellar wallet instead of sending it on. */
  keepOnStellar: (note?: WithdrawNote) => Promise<void>
  clearFlow: () => void
  /** A source the banner asked a market panel to preselect. */
  preselect: { marketId: string; key: string; n: number } | null
  offerSource: (marketId: string, key: string) => void
  focusMarket: (marketId: string, tab?: XcPanelTab) => void
}

const CrossChainFlowContext = createContext<CrossChainFlowContextValue | null>(null)

export type { CrossChainFlowContextValue }

/** A fixed value in place of the live provider, for the preview page and tests. */
export function CrossChainFlowStatic({ value, children }: { value: CrossChainFlowContextValue; children: ReactNode }) {
  return <CrossChainFlowContext.Provider value={value}>{children}</CrossChainFlowContext.Provider>
}

/** Null outside the provider (the flag is off, or not the Stellar markets): callers render as before. */
export function useCrossChainFlow(): CrossChainFlowContextValue | null {
  return useContext(CrossChainFlowContext)
}


const IDLE_SUPPLY: SupplyStepState = { phase: "idle" }
const IDLE_WITHDRAW: WithdrawLegState = { phase: "idle" }

function errorText(e: unknown, fallback: string): string {
  if (isUserRejection(e)) return "Cancelled in the wallet."
  return e instanceof Error && e.message ? e.message : fallback
}

function noteFromTransfer(t: XcTransfer, marketId: string): WithdrawNote {
  return {
    key: `t${t.id}`,
    stellarAddress: t.stellarAddress,
    evmAddress: t.evmAddress,
    marketId,
    srcToken: { address: t.src.token, symbol: t.src.symbol, decimals: t.src.decimals },
    dstChain: Number(t.dst.chain),
    dstToken: { address: t.dst.token, symbol: t.dst.symbol, decimals: t.dst.decimals },
    raw: t.src.amount,
    requested: formatTokenAmount(Number(formatUnits(BigInt(t.src.amount), t.src.decimals))),
    withdrawTxHash: null,
    transferId: t.id,
    at: Date.parse(t.createdAt) || Date.now(),
  }
}

export function CrossChainFlowProvider({
  children,
  onFocusMarket,
}: {
  children: ReactNode
  /** Open a market's panel, so a resumed flow shows where it was started. */
  onFocusMarket?: (marketId: string) => void
}) {
  const { address: stellarAddress, source: stellarSource } = useStellarWallet()
  const { address: evmAddress } = useAccount()
  const { getAccessToken } = usePrivy()
  const xc = useCrossChainTransfer()
  const list = useCrossChainTransfers(stellarAddress)
  const funding = useFundingSources({ evmAddress, stellarAddress })
  const refreshList = list.refresh
  const refreshSources = funding.refresh
  const { start: xcStart, resume: xcResume, reset: xcReset, getToken } = xc
  const silentStellar = stellarSource === "privy"

  const { data: stellarTokens = [] } = useQuery({
    queryKey: ["xc-tokens", "stellar"],
    queryFn: async () => (await xcApi.tokens("stellar")).tokens,
    staleTime: 10 * 60_000,
  })

  const [flow, setFlow] = useState<XcFlow | null>(null)
  const [supply, setSupply] = useState<SupplyStepState>(IDLE_SUPPLY)
  const [withdraw, setWithdraw] = useState<WithdrawLegState>(IDLE_WITHDRAW)
  /** What the running withdrawal sends on; persisted unless it came from a transfer row. */
  const [note, setNote] = useState<WithdrawNote | null>(null)
  const [sendWaiting, setSendWaiting] = useState(false)
  const [notes, setNotes] = useState<WithdrawNote[]>([])
  const [preselect, setPreselect] = useState<CrossChainFlowContextValue["preselect"]>(null)
  const supplyingRef = useRef(false)

  const reloadNotes = useCallback(() => {
    setNotes(stellarAddress ? withdrawNotesFor(stellarAddress) : [])
  }, [stellarAddress])
  useEffect(reloadNotes, [reloadNotes, list.transfers])

  const focusMarket = useCallback(
    (marketId: string, tab: XcPanelTab = "supply") => {
      onFocusMarket?.(marketId)
      // After the panel had a chance to expand, so its tab bar is mounted.
      setTimeout(() => window.dispatchEvent(new CustomEvent(XC_FOCUS_TAB_EVENT, { detail: { marketId, tab } })), 0)
    },
    [onFocusMarket],
  )

  const resetAll = useCallback(() => {
    xcReset()
    setFlow(null)
    setSupply(IDLE_SUPPLY)
    setWithdraw(IDLE_WITHDRAW)
    setNote(null)
    setSendWaiting(false)
  }, [xcReset])

  // ─── Supply after arrival ─────────────────────────────────────────────────

  const runSupply = useCallback(
    async (t: XcTransfer, measured: bigint | null) => {
      const marketId = marketForStellarSymbol(t.dst.symbol)
      if (!stellarAddress || !marketId || supplyingRef.current) return
      supplyingRef.current = true
      setSupply({ phase: "running" })
      try {
        // What arrived: the measured balance change, else what SODAX reported,
        // else the guaranteed minimum. Never more than the wallet holds now,
        // and XLM keeps the account's reserve.
        const wanted = measured ?? (t.deliveredOut ? BigInt(t.deliveredOut) : BigInt(t.minOut))
        const balance = BigInt(await stellarGetTokenBalance(t.dst.token, stellarAddress))
        const keep = t.dst.symbol === "XLM" ? xlmKeep(t.dst.decimals) : BigInt(0)
        const spendable = balance > keep ? balance - keep : BigInt(0)
        const raw = wanted < spendable ? wanted : spendable
        if (raw <= BigInt(0)) throw new Error(`Your Stellar wallet no longer holds the ${t.dst.symbol}.`)
        const human = formatUnits(raw, t.dst.decimals)

        const hash = await stellarDeposit(stellarAddress, marketId, human, (message) =>
          setSupply((s) => (s.phase === "running" ? { ...s, message } : s)),
        )
        forgetSupplyIntent(t.id)
        setSupply({ phase: "done", txHash: hash, amount: formatTokenAmount(Number(human)) })
        trackXc("xc_supplied", { kind: "supply", market: marketId, src: t.src.chain, usd: usdBucket(t.usdValue) })
        announceStellarSupply({ address: stellarAddress, assetId: marketId, amount: human, txHash: hash, getAccessToken })
        await xcApi
          .update({ id: t.id, stellarAddress, action: "supplied", supplyTxHash: hash }, getToken)
          .catch(() => null)
        refreshList()
        void refreshSources()
      } catch (e) {
        setSupply({ phase: "failed", error: errorText(e, "The supply did not go through.") })
        trackXc("xc_failed", { kind: "supply", stage: "supply", rejected: isUserRejection(e) })
      } finally {
        supplyingRef.current = false
      }
    },
    [stellarAddress, getAccessToken, getToken, refreshList, refreshSources],
  )

  // Arrival of a supply: supply by itself when the user asked for it, else wait for a click.
  useEffect(() => {
    if (!flow || flow.kind !== "supply" || xc.step !== "arrived" || supply.phase !== "idle") return
    const t = xc.transfer
    if (!t || t.direction !== "in") return
    if (t.status === "supplied") {
      setSupply({ phase: "done" })
      return
    }
    if (flow.auto) void runSupply(t, xc.delivered)
    else setSupply({ phase: "waiting" })
  }, [flow, xc.step, xc.transfer, xc.delivered, supply.phase, runSupply])

  // The row exists before the wallet opens. A supply notes the wish to supply
  // it; a withdrawal notes which transfer carries its money. Either way a
  // reload after the signature finds its way back.
  const transferId = xc.transfer?.id ?? null
  useEffect(() => {
    if (!flow || transferId == null || flow.transferId === transferId) return
    if (flow.kind === "supply") {
      if (flow.resumed || flow.transferId != null) return
      rememberSupplyIntent(transferId, flow.marketId)
    } else if (note) {
      // A retried send is a new transfer: the note follows it.
      if (!note.key.startsWith("t")) updateWithdrawNote(note.key, { transferId })
      setNote((n) => (n ? { ...n, transferId } : n))
    }
    setFlow((f) => (f ? { ...f, transferId } : f))
  }, [flow, transferId, note])

  // A withdrawal is finished once its money arrived: the note has done its job.
  useEffect(() => {
    if (flow?.kind !== "withdraw" || xc.step !== "arrived" || !note) return
    forgetWithdrawNote(note.key)
    reloadNotes()
    refreshList()
    void refreshSources()
  }, [flow?.kind, xc.step, note, reloadNotes, refreshList, refreshSources])

  // Analytics: the signature and the arrival, once per transfer.
  const trackedRef = useRef<{ signed: number | null; arrived: number | null; failed: number | null }>({
    signed: null,
    arrived: null,
    failed: null,
  })
  useEffect(() => {
    const t = xc.transfer
    if (!flow || !t || flow.resumed) return
    const base = { kind: flow.kind, market: flow.marketId, src: flow.srcChain, dst: flow.dstChain, usd: usdBucket(flow.usd) }
    if (xc.txHash && trackedRef.current.signed !== t.id) {
      trackedRef.current.signed = t.id
      trackXc("xc_signed", base)
    }
    if (xc.step === "arrived" && trackedRef.current.arrived !== t.id) {
      trackedRef.current.arrived = t.id
      trackXc("xc_arrived", { ...base, seconds: Math.round((Date.now() - flow.startedAt) / 1000) })
    }
    if (xc.step === "failed" && trackedRef.current.failed !== t.id) {
      trackedRef.current.failed = t.id
      trackXc("xc_failed", { ...base, stage: "transfer", code: xc.error?.code ?? "unknown" })
    }
  }, [flow, xc.transfer, xc.txHash, xc.step, xc.error])

  // ─── Start ────────────────────────────────────────────────────────────────

  const busy = xc.isWorking || supply.phase === "running" || withdraw.phase === "running"

  const startSupply = useCallback(
    async (input: StartSupplyInput) => {
      if (!stellarAddress || !evmAddress || input.source.chain === "stellar") return
      resetAll()
      const whole = Number(formatUnits(input.amount, input.source.token.decimals))
      const usd = input.source.token.usdPrice != null ? whole * input.source.token.usdPrice : null
      setFlow({
        kind: "supply",
        marketId: input.marketId,
        srcChain: input.source.chain,
        srcSymbol: input.source.token.symbol,
        srcAmount: formatTokenAmount(whole),
        dstChain: "stellar",
        dstSymbol: input.dstToken.symbol,
        transferId: null,
        auto: true,
        resumed: false,
        startedAt: Date.now(),
        usd,
        withdrawKnown: false,
      })
      trackXc("xc_started", { kind: "supply", market: input.marketId, src: input.source.chain, usd: usdBucket(usd) })
      await xcStart({
        src: input.source.chain,
        dst: "stellar",
        srcToken: input.source.token,
        dstToken: input.dstToken,
        amount: input.amount,
        slippageBps: input.slippageBps,
        stellarAddress,
        evmAddress,
      })
      refreshList()
      void refreshSources()
    },
    [stellarAddress, evmAddress, resetAll, xcStart, refreshList, refreshSources],
  )

  /** The second leg of a withdrawal: from the Stellar wallet to the other network. */
  const runSend = useCallback(
    async (n: WithdrawNote) => {
      if (!stellarAddress || !n.evmAddress) return
      setSendWaiting(false)
      await xcStart({
        src: "stellar",
        dst: n.dstChain,
        srcToken: n.srcToken,
        dstToken: n.dstToken,
        amount: BigInt(n.raw),
        stellarAddress,
        evmAddress: n.evmAddress,
      })
      refreshList()
      void refreshSources()
    },
    [stellarAddress, xcStart, refreshList, refreshSources],
  )

  const startWithdraw = useCallback(
    async (input: StartWithdrawInput) => {
      if (!stellarAddress || !evmAddress) return
      const token = input.srcToken
      resetAll()
      const whole = Number(input.amount) || 0
      const usd = token.usdPrice != null ? whole * token.usdPrice : null
      setWithdraw({ phase: "running" })
      setFlow({
        kind: "withdraw",
        marketId: input.marketId,
        srcChain: "stellar",
        srcSymbol: token.symbol,
        srcAmount: formatTokenAmount(whole),
        dstChain: input.dstChain,
        dstSymbol: input.dstToken.symbol,
        transferId: null,
        auto: false,
        resumed: false,
        startedAt: Date.now(),
        usd,
        withdrawKnown: true,
      })
      trackXc("xc_started", { kind: "withdraw", market: input.marketId, dst: input.dstChain, usd: usdBucket(usd) })

      // 1. Out of the market, into the Stellar wallet.
      const onProgress = (message: string) => setWithdraw((w) => (w.phase === "running" ? { ...w, message } : w))
      let before: bigint | null = null
      let hash: string
      try {
        before = BigInt(await stellarGetTokenBalance(token.address, stellarAddress))
      } catch {
        before = null
      }
      try {
        hash = input.full
          ? await stellarWithdrawAll(stellarAddress, input.marketId, onProgress)
          : await stellarWithdraw(
              stellarAddress,
              input.marketId,
              await stellarConvertUnderlyingToPtokenAmount(input.marketId, input.amount),
              onProgress,
            )
      } catch (e) {
        setWithdraw({ phase: "failed", error: errorText(e, "The withdrawal did not go through.") })
        trackXc("xc_failed", { kind: "withdraw", stage: "withdraw", rejected: isUserRejection(e) })
        return
      }
      announceStellarRedeem({ address: stellarAddress, assetId: input.marketId, amount: input.amount, txHash: hash, getAccessToken })
      trackXc("xc_withdrawn", { kind: "withdraw", market: input.marketId, dst: input.dstChain, usd: usdBucket(usd) })

      // 2. Note the plan at once, so a reload from here on still finds the
      // money and where it was going. The amount is corrected once measured.
      let requested = BigInt(0)
      try {
        requested = parseUnits(input.amount, token.decimals)
      } catch {
        /* an amount with more decimals than the token: the measurement decides */
      }
      const n: WithdrawNote = {
        key: `w${Date.now()}`,
        stellarAddress,
        evmAddress,
        marketId: input.marketId,
        srcToken: { address: token.address, symbol: token.symbol, decimals: token.decimals },
        dstChain: input.dstChain,
        dstToken: { address: input.dstToken.address, symbol: input.dstToken.symbol, decimals: input.dstToken.decimals },
        raw: requested.toString(),
        requested: formatTokenAmount(whole),
        withdrawTxHash: hash,
        transferId: null,
        at: Date.now(),
      }
      rememberWithdrawNote(n)

      // 3. Measure what reached the wallet; that, not the typed amount, is what goes on.
      setWithdraw((w) => ({ ...w, message: "Checking your Stellar wallet" }))
      let after: bigint | null = null
      for (let i = 0; i < WITHDRAW_MEASURE_TRIES; i++) {
        try {
          after = BigInt(await stellarGetTokenBalance(token.address, stellarAddress))
        } catch {
          after = null
        }
        if (after != null && before != null && after > before) break
        await sleep(WITHDRAW_MEASURE_GAP_MS)
      }
      let raw = after != null && before != null && after > before ? after - before : requested
      if (after != null) {
        const keep = token.symbol === "XLM" ? xlmKeep(token.decimals) : BigInt(0)
        const spendable = after > keep ? after - keep : BigInt(0)
        if (raw > spendable) raw = spendable
      }
      n.raw = raw.toString()
      updateWithdrawNote(n.key, { raw: n.raw })
      setNote(n)
      setWithdraw({ phase: "done", txHash: hash, amount: formatTokenAmount(Number(formatUnits(raw, token.decimals))) })
      void refreshSources()

      // 4. On to the other network.
      if (raw <= BigInt(0)) {
        setSendWaiting(true)
        return
      }
      await runSend(n)
    },
    [stellarAddress, evmAddress, resetAll, getAccessToken, refreshSources, runSend],
  )

  // ─── Pick up, resume ──────────────────────────────────────────────────────

  /** Follow a stored transfer, in either direction. */
  const follow = useCallback(
    (t: XcTransfer, opts: { auto?: boolean; note?: WithdrawNote | null } = {}) => {
      const marketId = marketForTransfer(t)
      if (!marketId) return
      resetAll()
      const out = t.direction === "out"
      const known = Boolean(opts.note?.withdrawTxHash)
      const n = out ? opts.note ?? noteFromTransfer(t, marketId) : null
      setNote(n)
      if (out && known) {
        setWithdraw({
          phase: "done",
          txHash: n.withdrawTxHash,
          amount: formatTokenAmount(Number(formatUnits(BigInt(n.raw), n.srcToken.decimals))),
        })
      }
      setFlow({
        kind: out ? "withdraw" : "supply",
        marketId,
        srcChain: t.src.chain,
        srcSymbol: t.src.symbol,
        srcAmount: out && n ? n.requested : formatTokenAmount(Number(formatUnits(BigInt(t.src.amount), t.src.decimals))),
        dstChain: t.dst.chain,
        dstSymbol: t.dst.symbol,
        transferId: t.id,
        auto: Boolean(opts.auto),
        resumed: true,
        startedAt: out && n ? n.at : Date.parse(t.createdAt) || Date.now(),
        usd: t.usdValue,
        withdrawKnown: known,
      })
      focusMarket(marketId, out ? "withdraw" : "supply")
      void xcResume(t)
    },
    [resetAll, focusMarket, xcResume],
  )

  /** A withdrawal whose money sits in the Stellar wallet, not sent on yet. */
  const restoreWaiting = useCallback(
    (n: WithdrawNote) => {
      resetAll()
      setNote(n)
      setWithdraw({
        phase: "done",
        txHash: n.withdrawTxHash ?? undefined,
        amount: formatTokenAmount(Number(formatUnits(BigInt(n.raw), n.srcToken.decimals))),
      })
      setSendWaiting(true)
      setFlow({
        kind: "withdraw",
        marketId: n.marketId,
        srcChain: "stellar",
        srcSymbol: n.srcToken.symbol,
        srcAmount: n.requested,
        dstChain: n.dstChain,
        dstSymbol: n.dstToken.symbol,
        transferId: n.transferId,
        auto: false,
        resumed: true,
        startedAt: n.at,
        usd: null,
        withdrawKnown: Boolean(n.withdrawTxHash),
      })
      focusMarket(n.marketId, "withdraw")
    },
    [resetAll, focusMarket],
  )

  /** Continue a withdrawal from its note: follow its transfer, or wait to send. */
  const resumeNote = useCallback(
    async (n: WithdrawNote) => {
      let row = n.transferId != null ? list.transfers.find((t) => t.id === n.transferId) ?? null : null
      if (n.transferId != null && !row && stellarAddress) {
        row = (await xcApi.status(n.transferId, stellarAddress, getToken).catch(() => null))?.transfer ?? null
      }
      if (row?.status === "dismissed") {
        forgetWithdrawNote(n.key)
        reloadNotes()
        return
      }
      // Sent (on its way, arrived, or refused by the solver): show how it went.
      if (row && row.status !== "created" && row.status !== "expired") follow(row, { note: n })
      else restoreWaiting(n)
    },
    [list.transfers, stellarAddress, getToken, follow, restoreWaiting, reloadNotes],
  )

  const pickUp = useCallback(
    (t: XcTransfer) => {
      if (busy) return
      // A click on the banner is a fresh request to supply it.
      follow(t, { auto: true, note: notes.find((n) => n.transferId === t.id) ?? null })
    },
    [busy, follow, notes],
  )

  const pickUpWithdrawal = useCallback(
    (n: WithdrawNote) => {
      if (busy) return
      void resumeNote(n)
    },
    [busy, resumeNote],
  )

  // Once per wallet: continue what the last visit left.
  const resumedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!stellarAddress || !list.loaded || resumedFor.current === stellarAddress) return
    resumedFor.current = stellarAddress
    if (flow || xc.step !== "idle") return
    const mine = list.transfers.filter((t) => marketForTransfer(t))
    const saved = withdrawNotesFor(stellarAddress)

    // 1. Anything still on its way, newest first (the list puts those first).
    const running = mine.find(isInFlight)
    if (running) {
      follow(running, { auto: Boolean(freshSupplyIntent(running.id)), note: saved.find((n) => n.transferId === running.id) ?? null })
      return
    }
    // 2. The newer of: a supply asked for a moment ago, a withdrawal not finished.
    const asked = mine.find((t) => t.direction === "in" && t.status === "solved" && freshSupplyIntent(t.id))
    const pending = saved[0]
    const askedAt = asked ? Date.parse(asked.createdAt) : -1
    if (pending && pending.at >= askedAt) void resumeNote(pending)
    else if (asked) follow(asked, { auto: true })
  }, [stellarAddress, list.loaded, list.transfers, flow, xc.step, follow, resumeNote])

  const keepInWallet = useCallback(
    async (t: XcTransfer) => {
      if (!stellarAddress) return
      forgetSupplyIntent(t.id)
      trackXc("xc_kept", { kind: "supply", market: marketForTransfer(t) })
      await xcApi.update({ id: t.id, stellarAddress, action: "dismissed" }, getToken).catch(() => null)
      if (flow?.transferId === t.id) resetAll()
      refreshList()
    },
    [stellarAddress, getToken, resetAll, flow?.transferId, refreshList],
  )

  const keepOnStellar = useCallback(
    async (target?: WithdrawNote) => {
      const n = target ?? note
      if (!n || busy) return
      forgetWithdrawNote(n.key)
      trackXc("xc_kept", { kind: "withdraw", market: n.marketId })
      // A refused or expired row closes by hand; one never sent expires by itself.
      if (stellarAddress && n.transferId != null) {
        await xcApi.update({ id: n.transferId, stellarAddress, action: "dismissed" }, getToken).catch(() => null)
      }
      if (!target || target.key === note?.key) resetAll()
      reloadNotes()
      refreshList()
    },
    [note, busy, stellarAddress, getToken, resetAll, reloadNotes, refreshList],
  )

  const supplyNow = useCallback(() => {
    const t = xc.transfer
    if (!t || busy) return
    void runSupply(t, xc.delivered)
  }, [xc.transfer, xc.delivered, busy, runSupply])

  const sendNow = useCallback(() => {
    if (!note || busy) return
    void runSend(note)
  }, [note, busy, runSend])

  const clearFlow = useCallback(() => {
    if (busy) return
    // A finished or dead withdrawal has nothing left to resume.
    if (flow?.kind === "withdraw" && note && (xc.step === "arrived" || xc.step === "failed" || withdraw.phase === "failed")) {
      forgetWithdrawNote(note.key)
      reloadNotes()
    }
    resetAll()
    refreshList()
  }, [busy, flow?.kind, note, xc.step, withdraw.phase, resetAll, reloadNotes, refreshList])

  const offerSource = useCallback(
    (marketId: string, key: string) => {
      setPreselect((p) => ({ marketId, key, n: (p?.n ?? 0) + 1 }))
      focusMarket(marketId, "supply")
    },
    [focusMarket],
  )

  // ─── What the banner lists ────────────────────────────────────────────────

  const openTransfers = useMemo(
    () =>
      list.transfers.filter((t) => {
        if (t.id === flow?.transferId || marketForTransfer(t) == null) return false
        if (isInFlight(t)) return true
        return t.direction === "in" && t.status === "solved" && Date.now() - Date.parse(t.updatedAt) < OPEN_ARRIVAL_WINDOW_MS
      }),
    [list.transfers, flow?.transferId],
  )

  const waitingWithdrawals = useMemo(
    () =>
      notes.filter((n) => {
        if (n.key === note?.key) return false
        const row = n.transferId != null ? list.transfers.find((t) => t.id === n.transferId) : null
        // On its way: listed as an open transfer. Arrived: finished.
        return !row || row.status === "created" || row.status === "expired" || row.status === "failed"
      }),
    [notes, note?.key, list.transfers],
  )

  // Transfers the flow does not follow move on the server (the cron); read them again now and then.
  const othersMoving = openTransfers.some(isInFlight)
  useEffect(() => {
    if (!othersMoving) return
    const id = setInterval(refreshList, LIST_POLL_MS)
    return () => clearInterval(id)
  }, [othersMoving, refreshList])

  // ─── Progress ─────────────────────────────────────────────────────────────

  const progress = useMemo<ProgressModel | null>(() => {
    if (!flow) return null
    const t = xc.transfer
    const events = xc.events
    const failedIndex = xc.step === "failed" ? events.map((e) => e.step).lastIndexOf("failed") : -1
    let failedAt: XcFlowStep | null =
      failedIndex > 0 ? (events[failedIndex - 1].step as XcFlowStep) : xc.step === "failed" ? "preparing" : null
    // A transfer resumed after a reload fails without the steps before it in
    // this tab's log. If it had been sent, it failed on the way, not before.
    if (failedAt && t?.src.txHash && ["preparing", "switching", "approving", "signing"].includes(failedAt)) {
      failedAt = "converting"
    }
    const dstDecimals = t?.dst.decimals ?? (flow.kind === "withdraw" ? note?.dstToken.decimals : 7) ?? 7
    const arrivedRaw = xc.delivered ?? (t?.deliveredOut ? BigInt(t.deliveredOut) : null)
    const arrived = arrivedRaw != null ? formatTokenAmount(Number(formatUnits(arrivedRaw, dstDecimals))) : null
    const minOut = t?.minOut ? formatTokenAmount(Number(formatUnits(BigInt(t.minOut), dstDecimals))) : null

    if (flow.kind === "withdraw") {
      return buildWithdrawProgress({
        withdraw,
        withdrawKnown: flow.withdrawKnown,
        step: xc.step,
        failedAt,
        errorMessage: xc.error?.message ?? null,
        stalled: xc.stalled,
        sodaxStatus: t?.sodaxStatus ?? null,
        marketSymbol: flow.srcSymbol,
        amount: flow.srcAmount,
        dstChain: flow.dstChain,
        dstSymbol: flow.dstSymbol,
        arrived,
        minOut,
        silentStellar,
        sendWaiting,
      })
    }
    if (xc.step === "idle") return null
    return buildSupplyProgress({
      step: xc.step,
      failedAt,
      errorMessage: xc.error?.message ?? null,
      cancelled: xc.error?.code === "user_rejected",
      approvalSeen: events.some((e) => e.step === "approving"),
      stalled: xc.stalled,
      sodaxStatus: t?.sodaxStatus ?? null,
      srcChain: flow.srcChain,
      srcSymbol: flow.srcSymbol,
      srcAmount: flow.srcAmount,
      dstSymbol: flow.dstSymbol,
      arrived,
      minOut: minOut ?? "0",
      silentStellar,
      supply,
    })
  }, [flow, xc.step, xc.transfer, xc.events, xc.delivered, xc.error, xc.stalled, silentStellar, supply, withdraw, sendWaiting, note])

  // One flow at a time, and one that waits for the user counts: it has to be
  // sent, supplied or kept before the next one starts.
  const blocked = busy || progress?.tone === "attention"

  const value: CrossChainFlowContextValue = {
    stellarAddress: stellarAddress ?? null,
    evmAddress: evmAddress ?? null,
    silentStellar,
    sources: funding.sources,
    sourcesFetched: funding.isFetched,
    stellarTokens,
    flow,
    progress,
    transfer: xc.transfer,
    srcTxHash: xc.txHash ?? xc.transfer?.src.txHash ?? null,
    supply,
    withdraw,
    busy,
    blocked,
    openTransfers,
    waitingWithdrawals,
    startSupply,
    startWithdraw,
    supplyNow,
    sendNow,
    pickUp,
    pickUpWithdrawal,
    keepInWallet,
    keepOnStellar,
    clearFlow,
    preselect,
    offerSource,
    focusMarket,
  }

  return <CrossChainFlowContext.Provider value={value}>{children}</CrossChainFlowContext.Provider>
}
