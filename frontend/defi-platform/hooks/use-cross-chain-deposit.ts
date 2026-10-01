"use client"

/**
 * Move USDC from an EVM chain into the user's Stellar wallet, in one flow.
 *
 * The steps the user signs are the minimum the chains demand: an approve (only
 * when the allowance does not already cover it) and the burn. Everything after
 * that — Circle's attestation, the mint on Stellar — happens without them, which
 * is why this hook's job ends at the burn hash and `use-cctp-transfers` takes
 * over the watching.
 *
 * Three things this deliberately does not do:
 *
 *   - It does not build the burn calldata. `/api/cctp/plan` does, because the
 *     hook encoding is what strands funds when it is wrong, and because the
 *     server can refuse to hand out calldata at all when the recipient is not
 *     ready. See the route's own comment.
 *   - It does not supply. The USDC arrives in the user's wallet and *they*
 *     decide — that was a deliberate product call, not an omission.
 *   - It does not swallow the burn hash. Once the burn is mined the money is
 *     already gone from the source chain, so recording it is not bookkeeping,
 *     it is the only thread back to the transfer. If the POST fails we keep
 *     retrying and, failing that, hand the hash to the caller to show.
 */

import { useCallback, useState } from "react"
import { useAccount, useConfig, type Config } from "wagmi"
import { readContract, sendTransaction, waitForTransactionReceipt } from "wagmi/actions"
import { usePrivy } from "@privy-io/react-auth"
import { erc20Abi } from "viem"
import { useEnsureEvmChain } from "@/hooks/use-ensure-evm-chain"
import { CCTP_CONTRACTS, CCTP_MIN_TRANSFER_USD, cctpUsdcAddress, isCctpSourceChain } from "@/config/cctp"
import { readPrivyToken } from "@/app/app/margin/hooks/use-stellar-margin-journal"
import type { CctpRecipientReadiness } from "@/lib/cctp/trustline"

export type CrossChainDepositStep =
  | "idle"
  /** Asking the server for calldata; also where the trustline gate answers. */
  | "planning"
  /** Waiting for the user's wallet to be on the source chain. */
  | "switching"
  | "approving"
  | "burning"
  /** Burn is mined. The money is on its way and the row exists. */
  | "sent"
  | "error"

export interface CrossChainDepositState {
  step: CrossChainDepositStep
  /** Set on `error`, in the user's language where we have copy for it. */
  error: string | null
  /** Why the deposit was refused, when the server refused it on the recipient. */
  blocked: CctpRecipientReadiness | null
  /** The burn hash, from the moment it is mined. */
  burnTxHash: string | null
}

interface PlanResponse {
  plan?: {
    chainId: number
    usdc: `0x${string}`
    tokenMessenger: `0x${string}`
    approve?: { to: `0x${string}`; data: `0x${string}` }
    burn: { to: `0x${string}`; data: `0x${string}` }
    amount: string
  }
  error?: string
  message?: string | { title: string; detail: string }
  recipient?: CctpRecipientReadiness
  minimumUsdc?: number
}

const IDLE: CrossChainDepositState = { step: "idle", error: null, blocked: null, burnTxHash: null }

export interface UseCrossChainDeposit extends CrossChainDepositState {
  /** True while anything is in flight — the button should be disabled. */
  isWorking: boolean
  /** Chains the connected wallet may deposit from. */
  canDepositFrom: (chainId: number) => boolean
  /** Run the whole flow. Resolves with the burn hash, or null if it did not start. */
  deposit: (input: { sourceChainId: number; amountUsdc: number; stellarAddress: string }) => Promise<string | null>
  reset: () => void
}

export function useCrossChainDeposit(): UseCrossChainDeposit {
  const { address: evmAddress, isConnected } = useAccount()
  const config = useConfig()
  const { ensureChain } = useEnsureEvmChain()
  const { getAccessToken } = usePrivy()
  const [state, setState] = useState<CrossChainDepositState>(IDLE)
  // Every read, send and receipt below names the source chain explicitly
  // (wagmi actions with `chainId`). The hook used to hold a wallet client and a
  // public client from the render before the switch, which still pointed at the
  // previous chain afterwards: the allowance read was skipped, the send could
  // be refused as a chain mismatch, and the receipt was polled on the wrong
  // network.

  const reset = useCallback(() => setState(IDLE), [])

  const deposit = useCallback<UseCrossChainDeposit["deposit"]>(
    async ({ sourceChainId: chainId, amountUsdc, stellarAddress }) => {
      const fail = (error: string, blocked: CctpRecipientReadiness | null = null) => {
        setState({ step: "error", error, blocked, burnTxHash: null })
        return null
      }

      if (!evmAddress || !isConnected) return fail("Connect your wallet first.")
      if (!isCctpSourceChain(chainId)) {
        return fail("We can't deposit directly from this network yet.")
      }
      if (!(amountUsdc >= CCTP_MIN_TRANSFER_USD)) {
        return fail(`At least ${CCTP_MIN_TRANSFER_USD} USD — below that the fee eats too much of the deposit.`)
      }

      setState({ step: "planning", error: null, blocked: null, burnTxHash: null })

      try {
        // ── Allowance, read on the source chain ──────────────────────────
        // Without a client for that chain we cannot know, and guessing 0 only
        // ever adds a redundant approve — so that is the safe guess.
        let currentAllowance = BigInt(0)
        const usdc = cctpUsdcAddress(chainId) as `0x${string}` | undefined
        if (usdc) {
          currentAllowance = await readContract(config, {
            chainId,
            address: usdc,
            abi: erc20Abi,
            functionName: "allowance",
            args: [evmAddress, CCTP_CONTRACTS.evm.tokenMessengerV2 as `0x${string}`],
          }).catch(() => BigInt(0))
        }

        // ── Plan (and the trustline gate) ────────────────────────────────
        const token = await readPrivyToken(getAccessToken)
        const res = await fetch("/api/cctp/plan", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            stellarAddress,
            sourceChainId: chainId,
            amountUsdc,
            currentAllowance: currentAllowance.toString(),
          }),
        })
        const json = (await res.json().catch(() => ({}))) as PlanResponse
        if (!res.ok || !json.plan) {
          if (json.error === "recipient_not_ready") {
            const detail =
              typeof json.message === "object" && json.message ? json.message.detail : "Your Stellar wallet isn't ready to receive yet."
            return fail(detail, json.recipient ?? null)
          }
          return fail(typeof json.message === "string" ? json.message : "We couldn't prepare this deposit.")
        }
        const plan = json.plan

        // ── The user's wallet must be on the source chain to sign ────────
        // `useEnsureEvmChain`, not wagmi's switch alone: the Privy embedded
        // wallet otherwise signs on its default chain (BNB Smart Chain).
        setState((s) => ({ ...s, step: "switching" }))
        await ensureChain(chainId)

        // ── Approve, only when the plan says one is missing ──────────────
        if (plan.approve) {
          setState((s) => ({ ...s, step: "approving" }))
          const approveHash = await sendPrepared(config, evmAddress, chainId, plan.approve)
          // Waiting matters: the burn reads the allowance, so sending it before
          // the approve is mined reverts and costs the user gas for nothing.
          const approveReceipt = await waitForTransactionReceipt(config, { hash: approveHash, chainId })
          if (approveReceipt.status === "reverted") return fail("The approval failed on-chain. Nothing was sent.")
        }

        // ── Burn ─────────────────────────────────────────────────────────
        setState((s) => ({ ...s, step: "burning" }))
        const burnTxHash = await sendPrepared(config, evmAddress, chainId, plan.burn)
        // A reverted burn moved nothing, so there is nothing to record. A
        // receipt we cannot fetch (RPC hiccup) is recorded anyway: if the burn
        // did land, the row is the only thread back to it, and Circle simply
        // never attests one that did not.
        const burnReceipt = await waitForTransactionReceipt(config, { hash: burnTxHash, chainId }).catch(() => null)
        if (burnReceipt?.status === "reverted") return fail("The transfer failed on-chain. Your USDC did not leave the wallet.")

        // ── Record it. From here on the money is in Circle's hands ───────
        await recordBurnWithRetry(
          {
            stellarAddress,
            evmAddress,
            sourceChainId: chainId,
            burnTxHash,
            amountUsdc,
          },
          getAccessToken,
        )

        setState({ step: "sent", error: null, blocked: null, burnTxHash })
        return burnTxHash
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // A user closing the wallet popup is not an error worth a red banner.
        if (/User rejected|denied|cancelled|canceled/i.test(msg)) {
          setState(IDLE)
          return null
        }
        return fail(msg)
      }
    },
    [evmAddress, isConnected, config, ensureChain, getAccessToken],
  )

  return {
    ...state,
    isWorking: state.step !== "idle" && state.step !== "sent" && state.step !== "error",
    canDepositFrom: isCctpSourceChain,
    deposit,
    reset,
  }
}

/**
 * Send one prepared call from the user's wallet on `chainId`.
 *
 * wagmi resolves the connector client for that chain at call time and refuses
 * with a chain mismatch instead of signing elsewhere, so a switch that did not
 * land fails loudly rather than burning on the wrong network.
 */
async function sendPrepared(
  config: Config,
  account: `0x${string}`,
  chainId: number,
  call: { to: `0x${string}`; data: `0x${string}` },
): Promise<`0x${string}`> {
  return sendTransaction(config, { account, chainId, to: call.to, data: call.data })
}

/**
 * Record the burn, and do not give up easily.
 *
 * The burn is mined: the USDC has left the source chain and only the row ties it
 * to this user. A dropped POST here means a transfer nobody polls and a user who
 * sees nothing happen. Three tries with a short backoff covers the realistic
 * failure (a blip, a token that just expired); beyond that the caller still has
 * the hash on screen and the cron will pick the transfer up as soon as any later
 * request creates the row.
 */
async function recordBurnWithRetry(
  body: Record<string, unknown>,
  getAccessToken: () => Promise<string | null>,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = await readPrivyToken(getAccessToken)
    const res = await fetch("/api/cctp/transfers", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }).catch(() => null)
    if (res?.ok) return
    await new Promise((r) => setTimeout(r, 1_000 * (attempt + 1)))
  }
}
