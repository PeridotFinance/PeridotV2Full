/**
 * MAX-button ceiling for a supply/deposit input.
 *
 * Stablecoins (USDC, EURC, USDT …) can go in at 100% — the wallet keeps its
 * XLM for fees regardless. Native XLM cannot: the account must keep its
 * minimum reserve on-ledger (2 XLM base + 0.5 per subentry/trustline) and
 * every Soroban deposit costs a fee. Depositing the literal full balance
 * either fails on-chain or leaves the account unable to sign anything after.
 *
 * So MAX on XLM fills 90% of the balance and leaves the rest as headroom.
 */
export const XLM_SUPPLY_MAX_FRACTION = 0.9

/** True for the native Stellar asset in any of the ids/symbols we use for it. */
export function isNativeXlm(assetIdOrSymbol?: string | null): boolean {
  if (!assetIdOrSymbol) return false
  const v = assetIdOrSymbol.toLowerCase()
  return v === "xlm" || v === "xlm-stellar" || v === "native"
}

/**
 * The amount a supply MAX button should fill, given the spendable wallet
 * balance. Full balance for everything except native XLM.
 */
export function supplyMaxAmount(balance: number, assetIdOrSymbol?: string | null): number {
  if (!Number.isFinite(balance) || balance <= 0) return 0
  return isNativeXlm(assetIdOrSymbol) ? balance * XLM_SUPPLY_MAX_FRACTION : balance
}
