"use client"

/**
 * One cross-chain transfer, from the first click to arrival, and back again
 * after a reload.
 *
 *   preparing → (switching → approving) → signing → confirming → converting
 *             → arriving → arrived
 *
 * with `failed` from anywhere and `unsent` for a resumed transfer whose intent
 * was built but never paid. The steps are the ones `trackToSolved` in the
 * SODAX spike measured; the difference is that the server now holds the
 * transfer (`/api/crosschain/*`, row in `cctp_transfers`), so a closed tab
 * loses nothing after the signature:
 *
 *   - the row, with the intent and the relay payload, exists before the wallet
 *     opens;
 *   - the hash is written to localStorage and reported the moment the wallet
 *     returns it, before any waiting;
 *   - after that the relay cron finishes the job whether or not a tab watches.
 *
 * Investing is never part of this. An 'in' transfer ends with the money in the
 * Stellar wallet; supplying it is the caller's next step and the user's click.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useConfig } from "wagmi"
import { getBalance, readContract, waitForTransactionReceipt } from "wagmi/actions"
import { erc20Abi, type Hex } from "viem"
import { usePrivy } from "@privy-io/react-auth"
import { useXcEvmWallet, type UseXcEvmWalletOptions } from "@/hooks/use-xc-evm-wallet"
import { signStellarXdr } from "@/lib/stellar-signer"
import { getStellarRpcServer } from "@/lib/stellar-rpc"
import { stellarGetTokenBalance } from "@/lib/stellar-soroban-lending"
import { SODAX_NATIVE_EVM_TOKEN, type SodaxRawTx } from "@/lib/crosschain/sodax"
import { isStellar, type XcChain } from "@/lib/crosschain/route"
import { classifyXcError, xcError, type XcError } from "@/lib/crosschain/errors"
import {
  flushPendingHashes,
  forgetPendingHash,
  pendingHashFor,
  rememberPendingHash,
  xcApi,
  XcClientError,
  type GetToken,
} from "@/lib/crosschain/client"
import type { XcTransfer } from "@/lib/crosschain/view"

const STELLAR_PASSPHRASE = "Public Global Stellar Network ; September 2015"
const STATUS_POLL_MS = 4_000
const STATUS_TIMEOUT_MS = 20 * 60_000
const ARRIVAL_POLL_MS = 5_000
const ARRIVAL_TIMEOUT_MS = 10 * 60_000
const STELLAR_CONFIRM_TIMEOUT_MS = 90_000

export type XcStep =
  | "idle"
  | "preparing"
  | "switching"
  | "approving"
  | "signing"
  | "confirming"
  | "converting"
  | "arriving"
  | "arrived"
  | "unsent"
  | "failed"

export interface XcTokenRef {
  address: string
  symbol: string
  decimals: number
}

export interface XcStartInput {
  src: XcChain
  dst: XcChain
  srcToken: XcTokenRef
  dstToken: XcTokenRef
  /** Smallest unit of the source token. */
  amount: bigint
  slippageBps?: number
  stellarAddress: string
  evmAddress: string
}

export interface XcEvent {
  step: XcStep
  /** ms since the run started. */
  at: number
  detail?: string
}

export interface XcTransferState {
  step: XcStep
  transfer: XcTransfer | null
  error: XcError | null
  /** Source transaction, once the wallet returned it. */
  txHash: string | null
  /** Measured arrival (balance change), smallest unit of the destination token. */
  delivered: bigint | null
  /** Converting took longer than this tab waits; it carries on without the page. */
  stalled: boolean
  events: XcEvent[]
}

const IDLE: XcTransferState = {
  step: "idle",
  transfer: null,
  error: null,
  txHash: null,
  delivered: null,
  stalled: false,
  events: [],
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

class Cancelled extends Error {}

/** Retry a report a few times: it is the one request that must not be lost. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      // A refusal is an answer; only transport trouble is worth repeating.
      if (e instanceof XcClientError && e.httpStatus >= 400 && e.httpStatus < 500 && e.httpStatus !== 429) throw e
      await sleep(1_000 * (i + 1))
    }
  }
  throw last
}

/**
 * `silentEmbedded` is for Easy mode: the embedded wallet signs the source
 * transaction without a confirmation window. Expert leaves it off and behaves
 * as before.
 */
export function useCrossChainTransfer(options: UseXcEvmWalletOptions = {}) {
  const config = useConfig()
  const evm = useXcEvmWallet(options)
  const { prepare: ensureChain, send: sendEvm } = evm
  const connectedEvm = evm.wallet?.address
  const { getAccessToken } = usePrivy()
  const [state, setState] = useState<XcTransferState>(IDLE)

  const runRef = useRef(0)
  const startedRef = useRef(0)
  useEffect(() => () => void (runRef.current += 1), [])

  const getToken: GetToken = useCallback(async () => {
    try {
      return await getAccessToken()
    } catch {
      return null
    }
  }, [getAccessToken])

  // ─── Plumbing shared by both directions ────────────────────────────────────

  const begin = useCallback(() => {
    runRef.current += 1
    startedRef.current = Date.now()
    setState({ ...IDLE, step: "preparing", events: [{ step: "preparing", at: 0 }] })
    return runRef.current
  }, [])

  const makeGuard = useCallback((run: number) => () => {
    if (runRef.current !== run) throw new Cancelled()
  }, [])

  const stepTo = useCallback((run: number, step: XcStep, patch: Partial<XcTransferState> = {}, detail?: string) => {
    if (runRef.current !== run) return
    setState((s) => ({
      ...s,
      ...patch,
      step,
      events: s.step === step && !detail ? s.events : [...s.events, { step, at: Date.now() - startedRef.current, detail }],
    }))
  }, [])

  const fail = useCallback(
    (run: number, e: unknown) => {
      if (e instanceof Cancelled || runRef.current !== run) return
      const error = e instanceof XcClientError ? e.error : classifyXcError(e)
      stepTo(run, "failed", { error }, error.message)
    },
    [stepTo],
  )

  const readDstBalance = useCallback(
    async (t: Pick<XcTransfer, "direction" | "dst" | "stellarAddress" | "evmAddress">): Promise<bigint | null> => {
      try {
        if (isStellar(t.dst.chain)) return BigInt(await stellarGetTokenBalance(t.dst.token, t.stellarAddress))
        const chainId = t.dst.chain
        const owner = t.evmAddress as Hex
        if (t.dst.token.toLowerCase() === SODAX_NATIVE_EVM_TOKEN) {
          return (await getBalance(config, { address: owner, chainId })).value
        }
        return await readContract(config, {
          chainId,
          address: t.dst.token as Hex,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [owner],
        })
      } catch {
        return null
      }
    },
    [config],
  )

  /** Wait for the source transaction and tell the server how it ended. */
  const confirmSource = useCallback(
    async (run: number, t: XcTransfer, txHash: string): Promise<boolean> => {
      const guard = makeGuard(run)
      stepTo(run, "confirming", { txHash })
      let outcome: "confirmed" | "reverted" | null = null
      if (isStellar(t.src.chain)) {
        const StellarSdk = await import("@stellar/stellar-sdk")
        const rpc = getStellarRpcServer(StellarSdk)
        const until = Date.now() + STELLAR_CONFIRM_TIMEOUT_MS
        while (Date.now() < until && !outcome) {
          await sleep(1_500)
          guard()
          const r = await rpc.getTransaction(txHash).catch(() => null)
          if (!r || r.status === "NOT_FOUND") continue
          outcome = r.status === "SUCCESS" ? "confirmed" : "reverted"
        }
      } else {
        const receipt = await waitForTransactionReceipt(config, { hash: txHash as Hex, chainId: t.src.chain }).catch(
          () => null,
        )
        if (receipt) outcome = receipt.status === "success" ? "confirmed" : "reverted"
      }
      guard()
      // No verdict (an RPC that would not answer): the server hands the hash to
      // the relay on its own after a minute, so carry on watching.
      if (!outcome) return true
      const { transfer } = await withRetry(() =>
        xcApi.submit({ id: t.id, stellarAddress: t.stellarAddress, txHash, stage: outcome! }, getToken),
      )
      guard()
      stepTo(run, outcome === "reverted" ? "failed" : "confirming", {
        transfer,
        error: outcome === "reverted" ? xcError("unknown", transfer.failReason ?? "The transaction failed. Nothing was sent.") : null,
      })
      return outcome === "confirmed"
    },
    [config, getToken, makeGuard, stepTo],
  )

  /** Poll the server until the transfer settles, then watch the balance for arrival. */
  const follow = useCallback(
    async (run: number, start: XcTransfer, baseline: bigint | null) => {
      const guard = makeGuard(run)
      stepTo(run, "converting", { transfer: start })
      let t = start
      const until = Date.now() + STATUS_TIMEOUT_MS
      while (t.status === "submitted" || t.status === "relaying") {
        if (Date.now() > until) {
          stepTo(run, "converting", { stalled: true }, "still converting, continues without this page")
          return
        }
        await sleep(STATUS_POLL_MS)
        guard()
        const res = await xcApi.status(t.id, t.stellarAddress, getToken).catch(() => null)
        guard()
        if (!res) continue
        if (res.transfer.sodaxStatus !== t.sodaxStatus) {
          stepTo(run, "converting", { transfer: res.transfer }, res.transfer.sodaxStatus ?? undefined)
        }
        t = res.transfer
      }
      setState((s) => (runRef.current === run ? { ...s, transfer: t } : s))

      if (t.status === "failed" || t.status === "expired" || t.status === "dismissed") {
        stepTo(run, "failed", { error: xcError("unknown", t.failReason ?? "This transfer did not go through.") })
        return
      }
      if (t.status === "created") {
        stepTo(run, "unsent")
        return
      }
      // solved or supplied: delivered on the destination chain.
      if (baseline == null || t.status === "supplied") {
        const delivered = t.deliveredOut ? BigInt(t.deliveredOut) : null
        stepTo(run, "arrived", { delivered })
        return
      }
      stepTo(run, "arriving")
      const arrivalUntil = Date.now() + ARRIVAL_TIMEOUT_MS
      while (Date.now() < arrivalUntil) {
        const now = await readDstBalance(t)
        guard()
        if (now != null && now > baseline) {
          const delivered = now - baseline
          stepTo(run, "arrived", { delivered })
          xcApi
            .update({ id: t.id, stellarAddress: t.stellarAddress, action: "delivered", amount: delivered.toString() }, getToken)
            .then(({ transfer }) => setState((s) => (runRef.current === run ? { ...s, transfer } : s)))
            .catch(() => null)
          return
        }
        await sleep(ARRIVAL_POLL_MS)
        guard()
      }
      // SODAX says delivered; the balance read may lag or the wallet moved funds meanwhile.
      stepTo(run, "arrived", { delivered: null }, "delivered, balance change not seen")
    },
    [getToken, makeGuard, readDstBalance, stepTo],
  )

  // ─── Start ─────────────────────────────────────────────────────────────────

  const start = useCallback(
    async (input: XcStartInput): Promise<XcTransfer | null> => {
      const run = begin()
      const guard = makeGuard(run)
      const leg = {
        src: input.src,
        dst: input.dst,
        srcToken: input.srcToken.address,
        dstToken: input.dstToken.address,
        amount: input.amount.toString(),
        slippageBps: input.slippageBps,
        stellarAddress: input.stellarAddress,
        evmAddress: input.evmAddress,
      }
      try {
        if (!isStellar(input.src)) {
          const chainId = input.src
          if (connectedEvm && connectedEvm.toLowerCase() !== input.evmAddress.toLowerCase()) {
            throw new XcClientError(xcError("unsupported", "The connected wallet changed. Start again."), 0)
          }
          const approval = await xcApi.approve(leg)
          guard()
          if (!approval.valid) {
            stepTo(run, "switching")
            await ensureChain(chainId)
            guard()
            stepTo(run, "approving")
            for (const tx of [approval.resetTx, approval.tx]) {
              if (!tx) continue
              const hash = await sendEvm(chainId, input.evmAddress, tx)
              const receipt = await waitForTransactionReceipt(config, { hash, chainId })
              guard()
              if (receipt.status !== "success") {
                throw new XcClientError(xcError("unknown", "The approval failed on-chain. Nothing was sent."), 0)
              }
            }
          }
        }

        const { transfer, tx } = await xcApi.intent(leg, getToken)
        guard()
        setState((s) => ({ ...s, transfer }))
        const baseline = await readDstBalance(transfer)
        guard()

        let txHash: string
        if (isStellar(input.src)) {
          stepTo(run, "signing")
          const { signedTxXdr } = await signStellarXdr(tx.data, {
            networkPassphrase: STELLAR_PASSPHRASE,
            address: input.stellarAddress,
          })
          guard()
          const StellarSdk = await import("@stellar/stellar-sdk")
          const signed = StellarSdk.TransactionBuilder.fromXDR(signedTxXdr, STELLAR_PASSPHRASE)
          txHash = signed.hash().toString("hex")
          rememberPendingHash({ id: transfer.id, stellarAddress: input.stellarAddress, txHash })
          // A send that throws may still have reached the network, so it is
          // reported like any other and the confirmation step decides. Only an
          // explicit refusal means nothing left the wallet.
          const sent = await getStellarRpcServer(StellarSdk).sendTransaction(signed).catch(() => null)
          if (sent && (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER")) {
            forgetPendingHash(transfer.id)
            throw new XcClientError(xcError("unknown", "Stellar did not accept the transaction. Nothing was sent."), 0)
          }
        } else {
          stepTo(run, "switching")
          await ensureChain(input.src)
          guard()
          stepTo(run, "signing")
          txHash = await sendEvm(input.src, input.evmAddress, tx)
          rememberPendingHash({ id: transfer.id, stellarAddress: input.stellarAddress, txHash })
        }

        // Past this line the money may have left the wallet. The report is
        // retried, and whatever is still pending is reported on the next visit.
        stepTo(run, "confirming", { txHash }, txHash)
        const reported = await withRetry(() =>
          xcApi.submit({ id: transfer.id, stellarAddress: input.stellarAddress, txHash, stage: "sent" }, getToken),
        )
        forgetPendingHash(transfer.id)
        guard()

        const ok = await confirmSource(run, reported.transfer, txHash)
        if (!ok) return reported.transfer
        const latest = await xcApi.status(transfer.id, input.stellarAddress, getToken).catch(() => reported)
        guard()
        await follow(run, latest.transfer, baseline)
        return latest.transfer
      } catch (e) {
        fail(run, e)
        return null
      }
    },
    [begin, config, confirmSource, connectedEvm, ensureChain, fail, follow, getToken, makeGuard, readDstBalance, sendEvm, stepTo],
  )

  // ─── Resume ────────────────────────────────────────────────────────────────

  /**
   * Pick a stored transfer up where it stands. Never signs anything: a
   * transfer that was built but has no hash is shown as `unsent`, because
   * paying the same intent twice is the one mistake resume must not make.
   */
  const resume = useCallback(
    async (t: XcTransfer) => {
      const run = begin()
      setState((s) => ({ ...s, transfer: t, txHash: t.src.txHash }))
      try {
        let current = t
        if (current.status === "created") {
          const pending = pendingHashFor(current.id)
          if (!pending) {
            stepTo(run, "unsent")
            return
          }
          current = (
            await withRetry(() =>
              xcApi.submit({ id: t.id, stellarAddress: t.stellarAddress, txHash: pending, stage: "sent" }, getToken),
            )
          ).transfer
          forgetPendingHash(t.id)
        }
        if (current.status === "submitted" && current.src.txHash) {
          const ok = await confirmSource(run, current, current.src.txHash)
          if (!ok) return
          current = (await xcApi.status(current.id, current.stellarAddress, getToken)).transfer
        }
        await follow(run, current, null)
      } catch (e) {
        fail(run, e)
      }
    },
    [begin, confirmSource, fail, follow, getToken, stepTo],
  )

  const reset = useCallback(() => {
    runRef.current += 1
    setState(IDLE)
  }, [])

  return {
    ...state,
    isWorking: !["idle", "arrived", "failed", "unsent"].includes(state.step) && !state.stalled,
    start,
    resume,
    reset,
    getToken,
  }
}

/**
 * The user's transfers on the SODAX rail, for a resume list or a banner.
 * Reports any hash this browser still holds before reading, so a transfer paid
 * in a tab that died a moment later shows up as sent, not as never sent.
 */
export function useCrossChainTransfers(stellarAddress: string | null | undefined, refreshKey = 0) {
  const { getAccessToken } = usePrivy()
  const [transfers, setTransfers] = useState<XcTransfer[]>([])
  const [error, setError] = useState<XcError | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!stellarAddress) {
      setTransfers([])
      setLoadedFor(null)
      return
    }
    let alive = true
    const getToken: GetToken = () => getAccessToken().catch(() => null)
    setLoading(true)
    flushPendingHashes(stellarAddress, getToken)
      .then(() => xcApi.list(stellarAddress, getToken))
      .then((r) => alive && (setTransfers(r.transfers), setError(null), setLoadedFor(stellarAddress)))
      .catch((e) => alive && setError(e instanceof XcClientError ? e.error : classifyXcError(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [stellarAddress, getAccessToken, refreshKey, tick])

  const refresh = useCallback(() => setTick((n) => n + 1), [])
  /** `loaded` turns true once the list for this address has been read, so an empty list means "none". */
  return { transfers, error, loading, loaded: loadedFor === stellarAddress && Boolean(stellarAddress), refresh }
}
