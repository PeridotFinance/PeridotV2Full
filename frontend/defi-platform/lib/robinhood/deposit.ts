/**
 * Deposit flow planning: USDG -> pUSDG shares -> margin vault (guide 6A).
 *
 * Two phases, because the second one's amount is only known after the first
 * confirms. `planRobinhoodSupply` covers approve + mint for a USDG amount;
 * `planRobinhoodMarginDeposit` covers approve + deposit for a share amount,
 * which is the minted `mintTokens` from the receipt, or a balance the wallet
 * already holds (a user with pUSDG starts there). Approvals are bounded to
 * the amount of the step they unlock, never unlimited.
 */
import type { RobinhoodCall } from "./calls"
import { approvePUsdgForVault, approveUsdgForMint, depositMargin, mintPUsdg } from "./calls"
import type { RobinhoodAccountState, RobinhoodMarketState } from "./reads"

export interface RobinhoodPlan {
  calls: RobinhoodCall[]
  /** Reasons the flow cannot start. Empty means the calls are ready to simulate. */
  blockers: string[]
}

export function planRobinhoodSupply(account: RobinhoodAccountState, usdgAmount6: bigint): RobinhoodPlan {
  const blockers: string[] = []
  if (usdgAmount6 <= 0n) blockers.push("Enter an amount greater than zero.")
  const balance = account.wallet.usdg
  if (balance === null) blockers.push("The USDG balance could not be read.")
  else if (balance < usdgAmount6) blockers.push("Not enough USDG in the wallet.")
  if (blockers.length) return { calls: [], blockers }

  const calls: RobinhoodCall[] = []
  // An unreadable allowance is treated as zero: one extra approval is cheaper
  // than a mint that reverts.
  if ((account.allowances.usdgForMint ?? 0n) < usdgAmount6) calls.push(approveUsdgForMint(usdgAmount6))
  calls.push(mintPUsdg(usdgAmount6))
  return { calls, blockers }
}

export function planRobinhoodMarginDeposit(
  account: RobinhoodAccountState,
  shares: bigint,
  market?: Pick<RobinhoodMarketState, "marginAccepted"> | null,
): RobinhoodPlan {
  const blockers: string[] = []
  if (market?.marginAccepted === false) blockers.push("The margin vault is not accepting deposits right now.")
  if (shares <= 0n) blockers.push("Enter an amount greater than zero.")
  const balance = account.wallet.pUSDG
  if (balance === null) blockers.push("The pUSDG balance could not be read.")
  else if (balance < shares) blockers.push("Not enough pUSDG in the wallet.")
  if (blockers.length) return { calls: [], blockers }

  const calls: RobinhoodCall[] = []
  if ((account.allowances.pUsdgForVaultDeposit ?? 0n) < shares) calls.push(approvePUsdgForVault(shares))
  calls.push(depositMargin(shares))
  return { calls, blockers }
}
