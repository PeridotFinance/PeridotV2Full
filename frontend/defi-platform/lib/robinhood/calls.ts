/**
 * Transaction building blocks for the Robinhood margin product.
 *
 * A `RobinhoodCall` is one contract call the user signs, described with its
 * ABI so the same object can be simulated (eth_call with the user's `from`),
 * encoded for the wallet, and shown as a step in the UI. Every call is sent
 * with zero native value; ETH is only gas (guide section 5).
 */
import { encodeFunctionData, parseEventLogs, type Abi, type Address, type Hex, type TransactionReceipt } from "viem"
import { ROBINHOOD_ABIS } from "@/app/abis/robinhood"
import { ROBINHOOD_MARGIN, ROBINHOOD_TOKENS } from "@/config/robinhood"

export type RobinhoodCallId =
  | "reset-usdg-mint-allowance"
  | "approve-usdg-mint"
  | "mint-pusdg"
  | "reset-pusdg-vault-allowance"
  | "approve-pusdg-vault"
  | "deposit-margin"
  | "open-position"
  | "add-collateral"
  | "reset-repay-allowance"
  | "approve-repay"
  | "repay-debt"
  | "close-position"
  | "exit-debt-free"
  | "withdraw-margin"
  | "redeem-pusdg"
  | "settle-rewards"
  // Plain lending on the same markets (lib/robinhood/lending-flows.ts).
  | "reset-lending-allowance"
  | "approve-lending"
  | "lending-supply"
  | "lending-withdraw"
  | "lending-borrow"
  | "lending-repay"
  | "lending-enter-market"
  | "lending-exit-market"

export interface RobinhoodCall {
  id: RobinhoodCallId
  /** Short UI label, e.g. "Approve USDG". */
  label: string
  address: Address
  abi: Abi
  functionName: string
  args: readonly unknown[]
}

export function encodeRobinhoodCall(call: RobinhoodCall): { to: Address; data: Hex; value: bigint } {
  return {
    to: call.address,
    data: encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args } as any),
    value: 0n,
  }
}

const A = ROBINHOOD_ABIS
const M = ROBINHOOD_MARGIN
const T = ROBINHOOD_TOKENS

// ---------------------------------------------------------------------------
// Call constructors
// ---------------------------------------------------------------------------

export const approveUsdgForMint = (amount: bigint): RobinhoodCall => ({
  id: amount === 0n ? "reset-usdg-mint-allowance" : "approve-usdg-mint",
  label: amount === 0n ? "Reset USDG approval" : "Approve USDG",
  address: T.USDG,
  abi: A.erc20 as Abi,
  functionName: "approve",
  args: [T.pUSDG, amount],
})

export const mintPUsdg = (usdgAmount6: bigint): RobinhoodCall => ({
  id: "mint-pusdg",
  label: "Supply USDG",
  address: T.pUSDG,
  abi: A.pToken as Abi,
  functionName: "mint",
  args: [usdgAmount6],
})

export const approvePUsdgForVault = (shares: bigint): RobinhoodCall => ({
  id: shares === 0n ? "reset-pusdg-vault-allowance" : "approve-pusdg-vault",
  label: shares === 0n ? "Reset margin approval" : "Approve margin deposit",
  address: T.pUSDG,
  abi: A.pToken as Abi,
  functionName: "approve",
  args: [M.marginVault, shares],
})

export const depositMargin = (shares: bigint): RobinhoodCall => ({
  id: "deposit-margin",
  label: "Deposit margin",
  address: M.marginVault,
  abi: A.marginVault as Abi,
  functionName: "deposit",
  args: [T.pUSDG, shares],
})

/** Field names and order exactly as the executor's OpenParams tuple (guide 6C). */
export interface RobinhoodOpenParams {
  marginPToken: Address
  positionPToken: Address
  debtPToken: Address
  marginPTokenAmount: bigint
  leverageX100: number
  maxOpeningFeePToken: bigint
  minPositionUnderlying: bigint
  side: 0 | 1
  swapData: Hex
}

export const openPosition = (params: RobinhoodOpenParams): RobinhoodCall => ({
  id: "open-position",
  label: params.side === 0 ? "Open long" : "Open short",
  address: M.executor,
  abi: A.executor as Abi,
  functionName: "openPosition",
  args: [params],
})

// Step 6: manage and exit (guide 7, 8, 9).

export const addCollateral = (positionId: bigint, shares: bigint): RobinhoodCall => ({
  id: "add-collateral",
  label: "Add margin to position",
  address: M.executor,
  abi: A.executor as Abi,
  functionName: "addCollateral",
  args: [positionId, shares],
})

/** Approve the executor to pull the debt underlying (USDG for long, NVDA for short). */
export const approveUnderlyingForRepay = (asset: Address, amount: bigint): RobinhoodCall => ({
  id: amount === 0n ? "reset-repay-allowance" : "approve-repay",
  label: amount === 0n ? "Reset repayment approval" : `Approve ${asset.toLowerCase() === T.NVDA.toLowerCase() ? "NVDA" : "USDG"}`,
  address: asset,
  abi: A.erc20 as Abi,
  functionName: "approve",
  args: [M.executor, amount],
})

export const repayWithUnderlying = (positionId: bigint, maxUnderlyingAmount: bigint): RobinhoodCall => ({
  id: "repay-debt",
  label: "Repay debt",
  address: M.executor,
  abi: A.executor as Abi,
  functionName: "repayWithUnderlying",
  args: [positionId, maxUnderlyingAmount],
})

/** Field names and order exactly as the executor's CloseParams tuple (guide 8). */
export interface RobinhoodCloseParams {
  positionId: bigint
  /** 1..10000; 10000 closes fully. */
  closeBps: number
  /** Margin shares8, not bps. */
  maxClosingFeePToken: bigint
  minDebtUnderlying: bigint
  minMarginUnderlying: bigint
  positionToDebtSwapData: Hex
  debtToMarginSwapData: Hex
}

export const closePosition = (params: RobinhoodCloseParams): RobinhoodCall => ({
  id: "close-position",
  label: params.closeBps >= 10_000 ? "Close position" : "Close part of position",
  address: M.executor,
  abi: A.executor as Abi,
  functionName: "closePosition",
  args: [params],
})

/** In-kind exit without prices or swaps. The ceiling here is in bps, unlike closePosition. */
export const exitDebtFreeToPTokens = (positionId: bigint, maxClosingFeeBps: number): RobinhoodCall => ({
  id: "exit-debt-free",
  label: "Exit without prices",
  address: M.executor,
  abi: A.executor as Abi,
  functionName: "exitDebtFreeToPTokens",
  args: [positionId, maxClosingFeeBps],
})

export const withdrawMargin = (shares: bigint): RobinhoodCall => ({
  id: "withdraw-margin",
  label: "Withdraw from margin",
  address: M.marginVault,
  abi: A.marginVault as Abi,
  functionName: "withdraw",
  args: [T.pUSDG, shares],
})

export const redeemPUsdg = (shares: bigint): RobinhoodCall => ({
  id: "redeem-pusdg",
  label: "Convert to USDG",
  address: T.pUSDG,
  abi: A.pToken as Abi,
  functionName: "redeem",
  args: [shares],
})

export const settleRewards = (): RobinhoodCall => ({
  id: "settle-rewards",
  label: "Collect rewards",
  address: M.marginVault,
  abi: A.marginVault as Abi,
  functionName: "settle",
  args: [T.pUSDG],
})

// ---------------------------------------------------------------------------
// Receipt decoding
// ---------------------------------------------------------------------------

const sameAddress = (a: string | undefined, b: string) => !!a && a.toLowerCase() === b.toLowerCase()

export interface RobinhoodMintEvent {
  minter: Address
  mintAmount: bigint
  mintTokens: bigint
}

/**
 * The pToken's `Mint(minter, mintAmount, mintTokens)` for this user. A
 * Compound-style mint can return an error code without reverting, so a
 * successful receipt without this event is not a successful supply.
 */
export function findMintEvent(receipt: Pick<TransactionReceipt, "logs">, user: Address): RobinhoodMintEvent | null {
  const logs = parseEventLogs({ abi: A.pToken as Abi, logs: receipt.logs as any, eventName: "Mint", strict: false })
  for (const log of logs as any[]) {
    if (!sameAddress(log.address, T.pUSDG)) continue
    if (!sameAddress(log.args?.minter, user)) continue
    return { minter: log.args.minter, mintAmount: BigInt(log.args.mintAmount), mintTokens: BigInt(log.args.mintTokens) }
  }
  return null
}

export interface RobinhoodDepositedEvent {
  user: Address
  pToken: Address
  amount: bigint
}

export function findDepositedEvent(receipt: Pick<TransactionReceipt, "logs">, user: Address): RobinhoodDepositedEvent | null {
  const logs = parseEventLogs({ abi: A.marginVault as Abi, logs: receipt.logs as any, eventName: "Deposited", strict: false })
  for (const log of logs as any[]) {
    if (!sameAddress(log.address, M.marginVault)) continue
    if (!sameAddress(log.args?.user, user)) continue
    return { user: log.args.user, pToken: log.args.pToken, amount: BigInt(log.args.amount) }
  }
  return null
}

export interface RobinhoodPositionOpenedEvent {
  positionId: bigint
  user: Address
  account: Address
  side: 0 | 1
  marginPToken: Address
  positionPToken: Address
  debtPToken: Address
  marginPTokenAmount: bigint
  borrowedAmount: bigint
  grossAssetValueUsd18: bigint
  /** Realised, not requested. */
  leverageX100: bigint
  healthFactorBps: bigint
}

/**
 * `PositionOpened` emitted by the executor proxy for this user. The id and
 * the custody account come from here; nothing predicts `nextPositionId`.
 */
export function findPositionOpenedEvent(
  receipt: Pick<TransactionReceipt, "logs">,
  user: Address,
): RobinhoodPositionOpenedEvent | null {
  const logs = parseEventLogs({ abi: A.executor as Abi, logs: receipt.logs as any, eventName: "PositionOpened", strict: false })
  for (const log of logs as any[]) {
    if (!sameAddress(log.address, M.executor)) continue
    const a = log.args ?? {}
    if (!sameAddress(a.user, user)) continue
    return {
      positionId: BigInt(a.positionId),
      user: a.user,
      account: a.account,
      side: Number(a.side) === 1 ? 1 : 0,
      marginPToken: a.marginPToken,
      positionPToken: a.positionPToken,
      debtPToken: a.debtPToken,
      marginPTokenAmount: BigInt(a.marginPTokenAmount),
      borrowedAmount: BigInt(a.borrowedAmount),
      grossAssetValueUsd18: BigInt(a.grossAssetValueUsd),
      leverageX100: BigInt(a.leverageX100),
      healthFactorBps: BigInt(a.healthFactorBps),
    }
  }
  return null
}

/** First executor log of `eventName` for this position, args normalised to bigint where numeric. */
function findExecutorEvent(
  receipt: Pick<TransactionReceipt, "logs">,
  eventName: string,
  positionId: bigint,
): Record<string, any> | null {
  const logs = parseEventLogs({ abi: A.executor as Abi, logs: receipt.logs as any, eventName: eventName as any, strict: false })
  for (const log of logs as any[]) {
    if (!sameAddress(log.address, M.executor)) continue
    if (log.args?.positionId === undefined || BigInt(log.args.positionId) !== positionId) continue
    return log.args
  }
  return null
}

export interface RobinhoodCollateralAddedEvent {
  positionId: bigint
  shares: bigint
  healthFactorBps: bigint
}

export function findCollateralAddedEvent(receipt: Pick<TransactionReceipt, "logs">, positionId: bigint): RobinhoodCollateralAddedEvent | null {
  const a = findExecutorEvent(receipt, "CollateralAdded", positionId)
  return a ? { positionId, shares: BigInt(a.pTokenAmount), healthFactorBps: BigInt(a.healthFactorBps) } : null
}

export interface RobinhoodDebtRepaidEvent {
  positionId: bigint
  repaid: bigint
  remainingDebt: bigint
}

export function findDebtRepaidEvent(receipt: Pick<TransactionReceipt, "logs">, positionId: bigint): RobinhoodDebtRepaidEvent | null {
  const a = findExecutorEvent(receipt, "DebtRepaid", positionId)
  return a ? { positionId, repaid: BigInt(a.underlyingAmount), remainingDebt: BigInt(a.remainingDebt) } : null
}

export interface RobinhoodPositionClosedEvent {
  positionId: bigint
  closeBps: number
  debtRepaid: bigint
  /** pUSDG shares credited to free margin, after the fee. */
  returnedMarginShares: bigint
  closingFeeShares: bigint
  healthFactorBps: bigint
  fullyClosed: boolean
}

export function findPositionClosedEvent(receipt: Pick<TransactionReceipt, "logs">, positionId: bigint): RobinhoodPositionClosedEvent | null {
  const a = findExecutorEvent(receipt, "PositionClosed", positionId)
  if (!a) return null
  return {
    positionId,
    closeBps: Number(a.closeBps),
    debtRepaid: BigInt(a.debtRepaid),
    returnedMarginShares: BigInt(a.returnedMarginPTokens),
    closingFeeShares: BigInt(a.closingFeePTokens),
    healthFactorBps: BigInt(a.healthFactorBps),
    fullyClosed: Boolean(a.fullyClosed),
  }
}

export interface RobinhoodDebtFreeExitEvent {
  positionId: bigint
  /** pUSDG shares to free margin. */
  returnedMarginShares: bigint
  /** Position-market shares to the wallet (pNVDA for a long; 0 when equal to the margin token). */
  returnedPositionShares: bigint
  returnedDebtShares: bigint
  marginFeeShares: bigint
  positionFeeShares: bigint
  debtFeeShares: bigint
}

export function findDebtFreeExitEvent(receipt: Pick<TransactionReceipt, "logs">, positionId: bigint): RobinhoodDebtFreeExitEvent | null {
  const a = findExecutorEvent(receipt, "DebtFreePTokenExit", positionId)
  if (!a) return null
  return {
    positionId,
    returnedMarginShares: BigInt(a.returnedMarginPTokens),
    returnedPositionShares: BigInt(a.returnedPositionPTokens),
    returnedDebtShares: BigInt(a.returnedDebtPTokens),
    marginFeeShares: BigInt(a.marginFeePTokens),
    positionFeeShares: BigInt(a.positionFeePTokens),
    debtFeeShares: BigInt(a.debtFeePTokens),
  }
}

/** Vault `Withdrawn` or `RewardsSettled` for this user and pUSDG. */
export function findVaultEvent(
  receipt: Pick<TransactionReceipt, "logs">,
  eventName: "Withdrawn" | "RewardsSettled",
  user: Address,
): { amount: bigint } | null {
  const logs = parseEventLogs({ abi: A.marginVault as Abi, logs: receipt.logs as any, eventName, strict: false })
  for (const log of logs as any[]) {
    if (!sameAddress(log.address, M.marginVault)) continue
    if (!sameAddress(log.args?.user, user)) continue
    if (!sameAddress(log.args?.pToken, T.pUSDG)) continue
    return { amount: BigInt(log.args.amount) }
  }
  return null
}

export interface RobinhoodRedeemEvent {
  redeemer: Address
  /** Raw USDG6 paid out. */
  redeemAmount: bigint
  redeemTokens: bigint
}

/** pUSDG `Redeem`. Like mint, a Compound-style redeem can return a code without reverting. */
export function findRedeemEvent(receipt: Pick<TransactionReceipt, "logs">, user: Address): RobinhoodRedeemEvent | null {
  const logs = parseEventLogs({ abi: A.pToken as Abi, logs: receipt.logs as any, eventName: "Redeem", strict: false })
  for (const log of logs as any[]) {
    if (!sameAddress(log.address, T.pUSDG)) continue
    if (!sameAddress(log.args?.redeemer, user)) continue
    return { redeemer: log.args.redeemer, redeemAmount: BigInt(log.args.redeemAmount), redeemTokens: BigInt(log.args.redeemTokens) }
  }
  return null
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export type RobinhoodSimulator = { simulateContract: (args: any) => Promise<{ result: unknown }> }

export type RobinhoodSimulation =
  | { ok: true; result: unknown }
  | { ok: false; error: unknown }

/**
 * eth_call of the exact call the wallet will sign, from the user's address.
 * Each simulation is independent: state from an earlier simulated step does
 * not carry over, so a dependent step is simulated only after the previous
 * one has confirmed.
 */
export async function simulateRobinhoodCall(
  client: RobinhoodSimulator,
  user: Address,
  call: RobinhoodCall,
): Promise<RobinhoodSimulation> {
  try {
    const { result } = await client.simulateContract({
      account: user,
      address: call.address,
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
    })
    return { ok: true, result }
  } catch (error) {
    return { ok: false, error }
  }
}
