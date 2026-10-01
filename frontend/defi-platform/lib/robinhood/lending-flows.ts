/**
 * Supply, withdraw, borrow, repay and the collateral switch on the Robinhood
 * lending markets, as plain async orchestration over runRobinhoodCall.
 *
 * Compound-style calls answer with an error code as well as by reverting:
 * `exitMarket` with debt outstanding returns 12 and changes nothing, and a
 * receipt with status "success" says nothing about which of the two it was.
 * So every call is simulated first and a nonzero code blocks the signature,
 * and every confirmed receipt is checked for the market's own event
 * (Mint / Redeem / Borrow / RepayBorrow) before the step counts as done.
 *
 * Verified by eth_simulateV1 against mainnet on 2026-09-25: enterMarkets,
 * borrow, exitMarket (12 while in debt, 0 after), repayBorrow(uint256.max)
 * clearing the accrued balance exactly with a 0.1% allowance buffer, redeem
 * and redeemUnderlying.
 */
import { maxUint256, parseEventLogs, type Abi, type Address, type TransactionReceipt } from "viem"
import { ROBINHOOD_ABIS } from "@/app/abis/robinhood"
import type { RobinhoodCall } from "./calls"
import { describeRobinhoodLendingCode, type RobinhoodDecodedError } from "./errors"
import { approveWithReset, type RobinhoodFlowDeps } from "./flows"
import {
  ROBINHOOD_CONTROLLER,
  ROBINHOOD_CONTROLLER_ABI,
  readRobinhoodLendingAccount,
  type RobinhoodLendingMarket,
  type RobinhoodLendingPosition,
} from "./lending"
import { RobinhoodTxError, runRobinhoodCall, type RobinhoodTxUpdate } from "./tx"

export { describeRobinhoodLendingCode }

const PTOKEN = ROBINHOOD_ABIS.pToken as Abi
const ERC20 = ROBINHOOD_ABIS.erc20 as Abi

/** Allowance headroom for a full repayment: interest keeps accruing until the block that repays. */
export const ROBINHOOD_REPAY_BUFFER_BPS = 10n

// ---------------------------------------------------------------------------
// Controller error codes
// ---------------------------------------------------------------------------

/** Block the signature when the simulated call answered a nonzero code. */
export function checkLendingCode(result: unknown): string | null {
  if (typeof result === "bigint") return result === 0n ? null : describeRobinhoodLendingCode(result)
  if (Array.isArray(result)) {
    const bad = result.find((r) => typeof r === "bigint" && r !== 0n)
    return bad === undefined ? null : describeRobinhoodLendingCode(bad as bigint)
  }
  return null
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export const approveLending = (market: RobinhoodLendingMarket, amount: bigint): RobinhoodCall => ({
  id: amount === 0n ? "reset-lending-allowance" : "approve-lending",
  label: amount === 0n ? `Reset ${market.symbol} approval` : `Approve ${market.symbol}`,
  address: market.underlying,
  abi: ERC20,
  functionName: "approve",
  args: [market.pToken, amount],
})

export const lendingSupply = (market: RobinhoodLendingMarket, amount: bigint): RobinhoodCall => ({
  id: "lending-supply",
  label: `Supply ${market.symbol}`,
  address: market.pToken,
  abi: PTOKEN,
  functionName: "mint",
  args: [amount],
})

/** `all` redeems every share, so no dust of the position is left behind. */
export const lendingWithdraw = (market: RobinhoodLendingMarket, amount: bigint, all: boolean): RobinhoodCall => ({
  id: "lending-withdraw",
  label: `Withdraw ${market.symbol}`,
  address: market.pToken,
  abi: PTOKEN,
  functionName: all ? "redeem" : "redeemUnderlying",
  args: [amount],
})

export const lendingBorrow = (market: RobinhoodLendingMarket, amount: bigint): RobinhoodCall => ({
  id: "lending-borrow",
  label: `Borrow ${market.symbol}`,
  address: market.pToken,
  abi: PTOKEN,
  functionName: "borrow",
  args: [amount],
})

/** uint256.max repays exactly the accrued balance at execution time. */
export const lendingRepay = (market: RobinhoodLendingMarket, amount: bigint): RobinhoodCall => ({
  id: "lending-repay",
  label: `Repay ${market.symbol}`,
  address: market.pToken,
  abi: PTOKEN,
  functionName: "repayBorrow",
  args: [amount],
})

export const lendingEnterMarket = (market: RobinhoodLendingMarket): RobinhoodCall => ({
  id: "lending-enter-market",
  label: `Use ${market.symbol} as collateral`,
  address: ROBINHOOD_CONTROLLER,
  abi: ROBINHOOD_CONTROLLER_ABI as unknown as Abi,
  functionName: "enterMarkets",
  args: [[market.pToken]],
})

export const lendingExitMarket = (market: RobinhoodLendingMarket): RobinhoodCall => ({
  id: "lending-exit-market",
  label: `Stop using ${market.symbol} as collateral`,
  address: ROBINHOOD_CONTROLLER,
  abi: ROBINHOOD_CONTROLLER_ABI as unknown as Abi,
  functionName: "exitMarket",
  args: [market.pToken],
})

// ---------------------------------------------------------------------------
// Receipt checks
// ---------------------------------------------------------------------------

type LendingEventName = "Mint" | "Redeem" | "Borrow" | "RepayBorrow"

const USER_ARG: Record<LendingEventName, string> = {
  Mint: "minter",
  Redeem: "redeemer",
  Borrow: "borrower",
  RepayBorrow: "borrower",
}

/** The market's own event for this user, or null (a code-returning failure). */
export function findLendingEvent(
  receipt: Pick<TransactionReceipt, "logs">,
  market: RobinhoodLendingMarket,
  eventName: LendingEventName,
  user: Address,
): Record<string, unknown> | null {
  const logs = parseEventLogs({ abi: PTOKEN, logs: receipt.logs as any, eventName, strict: false }) as any[]
  for (const log of logs) {
    if (log.address?.toLowerCase() !== market.pToken.toLowerCase()) continue
    const who = log.args?.[USER_ARG[eventName]]
    if (typeof who === "string" && who.toLowerCase() === user.toLowerCase()) return log.args
  }
  return null
}

const flowError = (
  message: string,
  kind: RobinhoodDecodedError["kind"] = "lending",
  phase: "pending" | "submitted" = "pending",
): RobinhoodTxError => new RobinhoodTxError({ kind, errorName: null, args: [], message, detail: message }, phase)

async function runChecked(
  deps: RobinhoodFlowDeps,
  user: Address,
  call: RobinhoodCall,
  onUpdate: ((u: RobinhoodTxUpdate) => void) | undefined,
  confirm?: { market: RobinhoodLendingMarket; event: LendingEventName },
) {
  const res = await runRobinhoodCall(deps, user, call, { checkSimulation: checkLendingCode, onUpdate })
  if (confirm && !findLendingEvent(res.receipt, confirm.market, confirm.event, user)) {
    throw flowError("The transaction confirmed but the market did not record it. Nothing was changed.", "lending", "submitted")
  }
  return res
}

async function freshPosition(deps: RobinhoodFlowDeps, user: Address, market: RobinhoodLendingMarket): Promise<RobinhoodLendingPosition> {
  const account = await readRobinhoodLendingAccount(deps.client as any, user)
  const pos = account.positions.find((p) => p.market.id === market.id)
  if (!pos) throw flowError("The market could not be read. Try again in a moment.", "network")
  return pos
}

// ---------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------

export interface RobinhoodLendingFlowInput {
  market: RobinhoodLendingMarket
  /** Underlying units. Ignored for the collateral switch. */
  amount: bigint
  /** Withdraw everything / repay the whole debt. */
  all?: boolean
  /** Supply only: also turn the market on as collateral when it is not yet. */
  enableCollateral?: boolean
}

export interface RobinhoodLendingFlowResult {
  hashes: `0x${string}`[]
}

export async function runRobinhoodLendingSupply(
  deps: RobinhoodFlowDeps,
  user: Address,
  input: RobinhoodLendingFlowInput,
  onUpdate?: (u: RobinhoodTxUpdate) => void,
): Promise<RobinhoodLendingFlowResult> {
  const { market, amount } = input
  if (amount <= 0n) throw flowError("Enter an amount greater than zero.", "margin")
  const pos = await freshPosition(deps, user, market)
  if (pos.walletBalance !== null && pos.walletBalance < amount) throw flowError(`Not enough ${market.symbol} in the wallet.`, "margin")

  const hashes: `0x${string}`[] = []
  // An unreadable allowance counts as zero: one extra approval beats a mint that reverts.
  if ((pos.allowance ?? 0n) < amount) {
    await approveWithReset(deps, user, pos.allowance, (a) => approveLending(market, a), amount, onUpdate)
  }
  const mint = await runChecked(deps, user, lendingSupply(market, amount), onUpdate, { market, event: "Mint" })
  hashes.push(mint.hash)

  if (input.enableCollateral && !pos.isCollateral) {
    const enter = await runChecked(deps, user, lendingEnterMarket(market), onUpdate)
    hashes.push(enter.hash)
  }
  return { hashes }
}

export async function runRobinhoodLendingWithdraw(
  deps: RobinhoodFlowDeps,
  user: Address,
  input: RobinhoodLendingFlowInput,
  onUpdate?: (u: RobinhoodTxUpdate) => void,
): Promise<RobinhoodLendingFlowResult> {
  const { market } = input
  const pos = await freshPosition(deps, user, market)
  let call: RobinhoodCall
  if (input.all) {
    if (!pos.shares) throw flowError("Nothing supplied in this market.", "margin")
    call = lendingWithdraw(market, pos.shares, true)
  } else {
    if (input.amount <= 0n) throw flowError("Enter an amount greater than zero.", "margin")
    call = lendingWithdraw(market, input.amount, false)
  }
  const res = await runChecked(deps, user, call, onUpdate, { market, event: "Redeem" })
  return { hashes: [res.hash] }
}

export async function runRobinhoodLendingBorrow(
  deps: RobinhoodFlowDeps,
  user: Address,
  input: RobinhoodLendingFlowInput,
  onUpdate?: (u: RobinhoodTxUpdate) => void,
): Promise<RobinhoodLendingFlowResult> {
  const { market, amount } = input
  if (amount <= 0n) throw flowError("Enter an amount greater than zero.", "margin")
  const res = await runChecked(deps, user, lendingBorrow(market, amount), onUpdate, { market, event: "Borrow" })
  return { hashes: [res.hash] }
}

export async function runRobinhoodLendingRepay(
  deps: RobinhoodFlowDeps,
  user: Address,
  input: RobinhoodLendingFlowInput,
  onUpdate?: (u: RobinhoodTxUpdate) => void,
): Promise<RobinhoodLendingFlowResult> {
  const { market } = input
  const pos = await freshPosition(deps, user, market)
  const debt = pos.borrowed ?? 0n
  if (debt === 0n) throw flowError("Nothing to repay in this market.", "margin")

  // A full repayment pays the balance accrued at execution, which is a little
  // more than the stored one; it needs an allowance with that headroom and a
  // wallet that covers it. Without the headroom it falls back to the typed amount.
  const fullAllowance = debt + (debt * ROBINHOOD_REPAY_BUFFER_BPS) / 10_000n + 1n
  const canRepayAll = input.all && pos.walletBalance !== null && pos.walletBalance >= fullAllowance
  let amount: bigint
  if (canRepayAll) amount = maxUint256
  else if (input.all) amount = pos.walletBalance !== null && pos.walletBalance < debt ? pos.walletBalance : debt
  else amount = input.amount
  const approval = canRepayAll ? fullAllowance : amount
  if (approval <= 0n) throw flowError(`No ${market.symbol} in the wallet to repay with.`, "margin")
  if (!canRepayAll && pos.walletBalance !== null && pos.walletBalance < amount) {
    throw flowError(`Not enough ${market.symbol} in the wallet.`, "margin")
  }

  if ((pos.allowance ?? 0n) < approval) {
    await approveWithReset(deps, user, pos.allowance, (a) => approveLending(market, a), approval, onUpdate)
  }
  const res = await runChecked(deps, user, lendingRepay(market, amount), onUpdate, { market, event: "RepayBorrow" })
  return { hashes: [res.hash] }
}

export async function runRobinhoodLendingCollateral(
  deps: RobinhoodFlowDeps,
  user: Address,
  input: { market: RobinhoodLendingMarket; enable: boolean },
  onUpdate?: (u: RobinhoodTxUpdate) => void,
): Promise<RobinhoodLendingFlowResult> {
  const call = input.enable ? lendingEnterMarket(input.market) : lendingExitMarket(input.market)
  const res = await runChecked(deps, user, call, onUpdate)
  // exitMarket can confirm with a code on a state that moved after the
  // simulation; membership is the ground truth.
  const after = await freshPosition(deps, user, input.market)
  if (after.isCollateral !== null && after.isCollateral !== input.enable) {
    throw flowError(
      input.enable
        ? "The market did not enable this collateral. Nothing was changed."
        : "The market kept this collateral on because your debt still needs it.",
      "lending",
      "submitted",
    )
  }
  return { hashes: [res.hash] }
}
