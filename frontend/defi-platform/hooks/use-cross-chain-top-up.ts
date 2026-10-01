"use client"

/**
 * One answer to "can this deposit be paid for, and from where?".
 *
 * The deposit sheet used to ask that question twice. The balance line asked the
 * Stellar wallet and said "0 USDC"; a separate box asked the EVM chains and
 * offered to bring $100 over. So the primary button read *Insufficient balance*
 * while the actual way forward sat above it in a muted box — the loudest thing
 * on screen reported a dead end. Worse, that box only appeared once the user had
 * typed an amount, so someone looking at a zero balance had no reason to type
 * anything at all and never learned their money could be used.
 *
 * This hook is the single answer both of them now read: what the user has,
 * everywhere we can reach it, and what the button should therefore do. Keeping
 * it in one place is the point — two sources of truth on one screen is exactly
 * how the contradiction arose.
 *
 * It stays deliberately narrow:
 *   - USDC on Stellar only. That is the one asset a CCTP mint lands as
 *     (`CCTP_STELLAR_ASSET`), so it is the only market this can fund.
 *   - It never supplies. It hands back the burn; the user still decides
 *     separately to put the money to work. That was a product call, not a gap.
 *   - Every field is `false`/`0`/`null` when the flow isn't available (wrong
 *     host, no EVM wallet, no USDC anywhere), so a caller that ignores
 *     `available` still behaves exactly as it did before this existed.
 */

import { useCallback } from "react"
import { CCTP_MIN_TRANSFER_USD } from "@/config/cctp"
import { useCctpSourceBalances, type CctpSourceBalance } from "@/hooks/use-cctp-source-balances"
import { useCrossChainDeposit, type CrossChainDepositStep } from "@/hooks/use-cross-chain-deposit"
import { useCrossChainDepositOffered } from "@/hooks/use-cross-chain-deposit-offered"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"

/** The asset a CCTP mint arrives as, and so the only one this can top up. */
const TOP_UP_ASSET_ID = "usdc-stellar"

export interface CrossChainTopUp {
  /**
   * The flow is usable here *and* the user holds USDC somewhere we can burn it.
   * Gate the aggregated balance display on this — not on `shouldOffer`, which
   * depends on the amount typed.
   */
  available: boolean
  /** Every source chain holding USDC, largest first. Empty unless `available`. */
  balances: CctpSourceBalance[]
  /** The chain holding the most — the one source we propose. */
  best: CctpSourceBalance | null
  /** Sum across all source chains. What "you also have $X" should say. */
  total: number
  /**
   * What one run would actually move. Clamped to the best chain's balance: a
   * burn draws from one chain, so a user whose USDC is spread across three of
   * them tops up more than once. The label must show this number and not the
   * shortfall, or the button would promise money it cannot fetch in one go.
   */
  moveAmount: number
  /**
   * The typed amount needs a top-up and one can be run right now. This is the
   * condition for the primary button to become the top-up.
   *
   * Goes false the moment a burn is mined, and stays false until the money
   * lands. Without that it would still be true — the shortfall is real until
   * the mint arrives — and the button would offer the same top-up a second
   * time to a user whose first one is still in the air.
   */
  shouldOffer: boolean
  /**
   * A top-up is needed and the user has USDC — but not enough of it on any one
   * chain to clear Circle's floor. Distinct from `!shouldOffer`, because it is
   * worth explaining rather than silently offering nothing.
   */
  belowMinimum: boolean
  /**
   * A burn is mined and the money has not landed yet. The one state where the
   * right thing for the button to do is nothing, and say so.
   */
  awaitingArrival: boolean
  /** True while the wallet is being talked to; the button must be disabled. */
  isWorking: boolean
  step: CrossChainDepositStep
  error: string | null
  /** Set from the moment the burn is mined — the money has left the source chain. */
  sentHash: string | null
  /** Run it. Resolves with the burn hash, or null if it did not start. */
  run: () => Promise<string | null>
}

export interface TopUpPlan {
  /** What one run would move. 0 when nothing should be moved. */
  moveAmount: number
  /** A top-up is needed and can actually run. */
  shouldOffer: boolean
  /** Needed, but no single chain clears Circle's floor. */
  belowMinimum: boolean
}

/**
 * The whole decision, as arithmetic — extracted from the hook because this is
 * the part that can be quietly wrong. Three rules, and they interact:
 *
 *   1. Move the shortfall, not everything the user owns. Someone depositing
 *      $100 of their $5,000 should not have $5,000 dragged across a chain.
 *   2. Never below the floor. Under it Circle's fee and the source-chain gas
 *      take a visible bite out of the deposit, so we round *up* to the floor
 *      rather than offer a transfer that loses money.
 *   3. Never above what one chain holds. A burn draws from a single chain, so
 *      a user with $60 on Base and $60 on Arbitrum tops up twice for $100 —
 *      the label has to show what will really move, not what is needed.
 */
export function planTopUp(input: {
  amount: number
  stellarBalance: number
  best: CctpSourceBalance | null
}): TopUpPlan {
  const { amount, stellarBalance, best } = input
  const shortfall = amount - stellarBalance
  if (!best || !(shortfall > 0)) {
    return { moveAmount: 0, shouldOffer: false, belowMinimum: false }
  }
  const moveAmount = Math.min(best.balance, Math.max(shortfall, CCTP_MIN_TRANSFER_USD))
  const shouldOffer = moveAmount >= CCTP_MIN_TRANSFER_USD
  return { moveAmount, shouldOffer, belowMinimum: !shouldOffer }
}

const UNAVAILABLE = {
  available: false as const,
  balances: [] as CctpSourceBalance[],
  best: null,
  total: 0,
  moveAmount: 0,
  shouldOffer: false as const,
  belowMinimum: false as const,
  awaitingArrival: false as const,
}

export interface UseCrossChainTopUpInput {
  /** The market being deposited into. Anything but USDC-on-Stellar is a no-op. */
  assetId: string
  /** What the user typed, in USDC. */
  amount: number
  /** What they already hold on Stellar — the part that needs no hop. */
  stellarBalance: number
}

export function useCrossChainTopUp({
  assetId,
  amount,
  stellarBalance,
}: UseCrossChainTopUpInput): CrossChainTopUp {
  const offered = useCrossChainDepositOffered()
  const { address: stellarAddress } = useStellarWallet()
  const enabled = offered && assetId === TOP_UP_ASSET_ID && Boolean(stellarAddress)

  const { balances, best, total } = useCctpSourceBalances(enabled)
  const { step, error, isWorking, burnTxHash, deposit } = useCrossChainDeposit()

  const usable = enabled && Boolean(best)

  // Someone whose Stellar balance already covers the amount should not be
  // nudged into a cross-chain hop and a source-chain gas fee for nothing —
  // planTopUp returns an all-zero plan for that case, and for every other one
  // where there is nothing sensible to move.
  const plan = planTopUp({ amount, stellarBalance, best: usable ? best : null })

  // Between the burn and the mint the shortfall is still real, so the plan
  // still says "offer a top-up". It is the one moment where that is wrong: the
  // money is already on its way and offering again would burn it twice.
  const awaitingArrival = Boolean(burnTxHash) && amount > stellarBalance
  const shouldOffer = plan.shouldOffer && !awaitingArrival
  const { moveAmount, belowMinimum } = plan

  const run = useCallback(async () => {
    // Same guard as `shouldOffer`, restated here because a caller can hold a
    // stale render and this one is the last thing between a mis-click and a
    // second burn.
    if (burnTxHash) return null
    if (!best || !stellarAddress || moveAmount < CCTP_MIN_TRANSFER_USD) return null
    return deposit({ sourceChainId: best.chainId, amountUsdc: moveAmount, stellarAddress })
  }, [best, stellarAddress, moveAmount, deposit, burnTxHash])

  const shared = { isWorking, step, error, sentHash: burnTxHash, run }

  if (!usable) return { ...UNAVAILABLE, ...shared }

  return {
    available: true,
    balances,
    best,
    total,
    moveAmount,
    shouldOffer,
    belowMinimum,
    awaitingArrival,
    ...shared,
  }
}
