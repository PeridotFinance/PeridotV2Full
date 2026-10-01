/**
 * Is there enough ETH on Robinhood Chain to sign what the page offers?
 *
 * Every action here is several transactions (a deposit is up to four, an open
 * up to five), and the gas token is ETH, which the product never mentions
 * otherwise: margin, prices and positions are all USDG. A wallet funded with
 * USDG alone therefore looks ready and fails at the first signature, so the
 * page reads the native balance with the rest of the account and says so.
 *
 * The threshold is derived, not hardcoded in ETH: the chain's gas price times
 * a gas budget, with headroom for a fee that rises between the read and the
 * signature. An unreadable gas price falls back to a deliberately high one
 * rather than to zero, because under-warning is the failure that costs a user
 * a stuck flow.
 */

/** Gas a single action costs at worst (the five-transaction open, generously). */
export const ROBINHOOD_GAS_BUDGET_ACTION = 400_000n

/** Deposit, open and close end to end, which is what "you can trade" means here. */
export const ROBINHOOD_GAS_BUDGET_ROUND_TRIP = 2_000_000n

/** The gas price can move between this read and the signature. */
export const ROBINHOOD_GAS_HEADROOM = 2n

/** Used when `gasPriceWei` could not be read or came back zero. 0.5 gwei is ten times the price observed on 2026-09-21. */
export const ROBINHOOD_FALLBACK_GAS_PRICE_WEI = 500_000_000n

export interface RobinhoodGasInput {
  /** Native ETH balance of the wallet, wei. Null when the read failed. */
  balanceWei: bigint | null
  /** Current gas price, wei. Null when the read failed. */
  gasPriceWei: bigint | null
}

export type RobinhoodGasLevel =
  /** Balance unreadable. Never blocks: a failed read is not a zero. */
  | 'unknown'
  /** No ETH at all. */
  | 'empty'
  /** Some ETH, but not enough for one action. */
  | 'short'
  /** Enough to start, not enough for deposit, open and close together. */
  | 'thin'
  | 'ok'

export interface RobinhoodGasStatus {
  level: RobinhoodGasLevel
  balanceWei: bigint | null
  /** What one action needs, at the assumed fee with headroom. */
  requiredForActionWei: bigint
  /** What a full deposit, open and close needs. */
  requiredForRoundTripWei: bigint
  /** True when signing cannot succeed, so the page disables the action. */
  blocks: boolean
  /** One sentence for the user, or null when there is nothing to say. */
  message: string | null
}

export function robinhoodGasStatus(gas: RobinhoodGasInput | null | undefined): RobinhoodGasStatus {
  // A zero is as unusable as a missing value here, and chains do report one
  // (Multicall3's getBasefee answers 0 on 4663), so both take the fallback.
  const price = gas?.gasPriceWei && gas.gasPriceWei > 0n ? gas.gasPriceWei : ROBINHOOD_FALLBACK_GAS_PRICE_WEI
  const requiredForActionWei = price * ROBINHOOD_GAS_HEADROOM * ROBINHOOD_GAS_BUDGET_ACTION
  const requiredForRoundTripWei = price * ROBINHOOD_GAS_HEADROOM * ROBINHOOD_GAS_BUDGET_ROUND_TRIP
  const balanceWei = gas?.balanceWei ?? null

  const shell = { balanceWei, requiredForActionWei, requiredForRoundTripWei }

  if (balanceWei === null) return { ...shell, level: 'unknown', blocks: false, message: null }
  if (balanceWei === 0n) {
    return {
      ...shell,
      level: 'empty',
      blocks: true,
      message: 'This wallet holds no ETH on Robinhood Chain. ETH pays the network fee for every step, so nothing can be signed until some arrives.',
    }
  }
  if (balanceWei < requiredForActionWei) {
    return {
      ...shell,
      level: 'short',
      blocks: true,
      message: 'There is not enough ETH for the network fee. Top the wallet up with ETH on Robinhood Chain before trying again.',
    }
  }
  if (balanceWei < requiredForRoundTripWei) {
    return {
      ...shell,
      level: 'thin',
      blocks: false,
      message: 'ETH for network fees is running low. It may not cover depositing, opening and closing in one go.',
    }
  }
  return { ...shell, level: 'ok', blocks: false, message: null }
}
