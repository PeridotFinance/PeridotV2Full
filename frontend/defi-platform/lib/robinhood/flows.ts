/**
 * The two user flows of step 4, as plain async orchestration over the runner:
 *
 *   runRobinhoodDeposit  USDG approve -> pUSDG mint -> pUSDG approve -> vault deposit
 *   runRobinhoodOpen     requote -> fee ceiling check -> simulate -> sign -> PositionOpened
 *
 * Every dependent step re-reads chain state after the previous one confirms
 * (guide 5: "recheck receipt and allowance before the dependent transaction"),
 * because simulations do not carry state between calls. A step that already
 * happened is never repeated: a user who minted and then stopped resumes at
 * the vault deposit with `shares`.
 */
import type { Address } from "viem"
import {
  approvePUsdgForVault,
  approveUsdgForMint,
  findDepositedEvent,
  findMintEvent,
  findPositionOpenedEvent,
  openPosition,
  type RobinhoodCall,
  type RobinhoodDepositedEvent,
  type RobinhoodMintEvent,
  type RobinhoodPositionOpenedEvent,
} from "./calls"
import { planRobinhoodMarginDeposit, planRobinhoodSupply } from "./deposit"
import type { RobinhoodDecodedError } from "./errors"
import { quoteRobinhoodOpen, type RobinhoodOpenQuote } from "./open"
import { readRobinhoodAccountState, readRobinhoodMarketState, type RobinhoodReader } from "./reads"
import {
  RobinhoodTxError,
  runRobinhoodCall,
  type RobinhoodTxDeps,
  type RobinhoodTxResult,
  type RobinhoodTxUpdate,
} from "./tx"

export type RobinhoodFlowDeps = RobinhoodTxDeps & { client: RobinhoodTxDeps["client"] & RobinhoodReader }

const flowError = (message: string, kind: RobinhoodDecodedError["kind"] = "unknown"): RobinhoodTxError =>
  new RobinhoodTxError({ kind, errorName: null, args: [], message, detail: message }, "pending")

/**
 * Approve with a fallback for tokens that refuse a nonzero-to-nonzero change:
 * if the approval's simulation fails while an allowance exists, reset to zero
 * first and approve again.
 */
export async function approveWithReset(
  deps: RobinhoodFlowDeps,
  user: Address,
  current: bigint | null,
  make: (amount: bigint) => RobinhoodCall,
  amount: bigint,
  onUpdate?: (u: RobinhoodTxUpdate) => void,
): Promise<void> {
  try {
    await runRobinhoodCall(deps, user, make(amount), { onUpdate })
  } catch (err) {
    const retryable = err instanceof RobinhoodTxError && err.phase === "simulating" && (current ?? 0n) > 0n
    if (!retryable) throw err
    await runRobinhoodCall(deps, user, make(0n), { onUpdate })
    await runRobinhoodCall(deps, user, make(amount), { onUpdate })
  }
}

// ---------------------------------------------------------------------------
// Deposit
// ---------------------------------------------------------------------------

export interface RobinhoodDepositInput {
  /** Raw USDG6 to supply first. Omit to deposit pUSDG the wallet already holds. */
  usdgAmount6?: bigint
  /** Raw pUSDG shares to deposit. Defaults to the shares minted in this run. */
  shares?: bigint
}

export interface RobinhoodDepositResult {
  mint: RobinhoodMintEvent | null
  deposited: RobinhoodDepositedEvent
  /** `freeBalance(user, pUSDG)` read after the deposit confirmed. */
  freeSharesAfter: bigint | null
}

export async function runRobinhoodDeposit(
  deps: RobinhoodFlowDeps,
  user: Address,
  input: RobinhoodDepositInput,
  onUpdate?: (u: RobinhoodTxUpdate) => void,
): Promise<RobinhoodDepositResult> {
  const client = deps.client
  let account = await readRobinhoodAccountState(client, user)
  let mint: RobinhoodMintEvent | null = null

  if (input.usdgAmount6 !== undefined) {
    const amount = input.usdgAmount6
    const plan = planRobinhoodSupply(account, amount)
    if (plan.blockers.length) throw flowError(plan.blockers[0], "margin")
    const sharesBefore = account.wallet.pUSDG ?? 0n

    if (plan.calls[0]?.id === "approve-usdg-mint") {
      await approveWithReset(deps, user, account.allowances.usdgForMint, approveUsdgForMint, amount, onUpdate)
      account = await readRobinhoodAccountState(client, user)
      if ((account.allowances.usdgForMint ?? 0n) < amount) {
        throw flowError("The USDG approval is not visible yet. Try again in a moment.", "network")
      }
    }

    // Compound-style mint returns an error code instead of always reverting;
    // a nonzero code in the simulation blocks the signature.
    const minted: RobinhoodTxResult = await runRobinhoodCall(deps, user, plan.calls[plan.calls.length - 1], {
      onUpdate,
      checkSimulation: (r) => (typeof r === "bigint" && r !== 0n ? `The market refused the supply (code ${r}).` : null),
    })
    mint = findMintEvent(minted.receipt, user)
    if (!mint) throw flowError("The supply transaction confirmed without a Mint event. No shares were credited.", "lending")

    account = await readRobinhoodAccountState(client, user)
    if (account.wallet.pUSDG !== null && account.wallet.pUSDG < sharesBefore + mint.mintTokens) {
      throw flowError("The new pUSDG balance is not visible yet. Try the deposit again in a moment.", "network")
    }
  }

  const shares = input.shares ?? mint?.mintTokens
  if (shares === undefined) throw flowError("Enter an amount to deposit.", "margin")

  const market = await readRobinhoodMarketState(client)
  const plan = planRobinhoodMarginDeposit(account, shares, market)
  if (plan.blockers.length) throw flowError(plan.blockers[0], "margin")

  if (plan.calls[0]?.id === "approve-pusdg-vault") {
    await approveWithReset(deps, user, account.allowances.pUsdgForVaultDeposit, approvePUsdgForVault, shares, onUpdate)
    account = await readRobinhoodAccountState(client, user)
    if ((account.allowances.pUsdgForVaultDeposit ?? 0n) < shares) {
      throw flowError("The margin approval is not visible yet. Try again in a moment.", "network")
    }
  }

  const deposit = await runRobinhoodCall(deps, user, plan.calls[plan.calls.length - 1], { onUpdate })
  const deposited = findDepositedEvent(deposit.receipt, user)
  if (!deposited) throw flowError("The deposit confirmed without a Deposited event. Check the margin balance.", "unknown")

  const after = await readRobinhoodAccountState(client, user)
  return { mint, deposited, freeSharesAfter: after.vault.freeShares }
}

// ---------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------

export interface RobinhoodOpenResult {
  event: RobinhoodPositionOpenedEvent
  /** The quote the transaction was sent with (the fresh one, not the accepted one). */
  quote: RobinhoodOpenQuote
  hash: `0x${string}`
}

/** Thrown when the fresh quote no longer fits what the user accepted. */
export class RobinhoodRequoteError extends RobinhoodTxError {
  readonly quote: RobinhoodOpenQuote
  constructor(message: string, quote: RobinhoodOpenQuote) {
    super({ kind: "fee", errorName: null, args: [], message, detail: message }, "pending")
    this.name = "RobinhoodRequoteError"
    this.quote = quote
  }
}

/**
 * Opens with a quote the user accepted. The quote is taken again right before
 * the signature (the guide: revalidate if the user waited). The fee ceiling
 * stays the one the user accepted; if the fresh fee needs more, the user sees
 * the new quote instead of a silently higher limit. The fresh minimum output
 * is used unchanged.
 */
export async function runRobinhoodOpen(
  deps: RobinhoodFlowDeps,
  user: Address,
  accepted: RobinhoodOpenQuote,
  onUpdate?: (u: RobinhoodTxUpdate) => void,
): Promise<RobinhoodOpenResult> {
  if (accepted.maxOpeningFeePToken === null) throw flowError("This quote cannot be opened. Request a new one.", "quote")

  const fresh = await quoteRobinhoodOpen(deps.client, accepted.input, user)
  if (!fresh.params) throw new RobinhoodRequoteError(fresh.issues[0]?.message ?? "The quote is no longer valid.", fresh)
  if (fresh.openingFeeShares !== null && fresh.openingFeeShares > accepted.maxOpeningFeePToken) {
    throw new RobinhoodRequoteError("The opening fee changed. Review the new quote.", fresh)
  }
  const params = { ...fresh.params, maxOpeningFeePToken: accepted.maxOpeningFeePToken }
  if ((fresh.freeShares ?? 0n) < params.marginPTokenAmount + params.maxOpeningFeePToken) {
    throw new RobinhoodRequoteError("Not enough free margin for this amount plus the opening fee.", fresh)
  }

  const sent = await runRobinhoodCall(deps, user, openPosition(params), { onUpdate })
  const event = findPositionOpenedEvent(sent.receipt, user)
  if (!event) throw flowError("The open confirmed without a PositionOpened event. Refresh the positions.", "unknown")
  return { event, quote: fresh, hash: sent.hash }
}
