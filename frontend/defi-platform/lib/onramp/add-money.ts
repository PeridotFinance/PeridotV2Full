/**
 * The one way into "Add money".
 *
 * Every surface that offers to fund the account (wallet dialog, Easy home
 * card, deposit sheet, transaction toast, empty states) calls
 * {@link openAddMoney}; `components/onramp/AddMoneyHost.tsx` is mounted once
 * for all app routes and renders the sheet. An event rather than a context
 * because the callers live in unrelated trees: the wallet dialog hangs off
 * the site header, the sheets off the Easy layout, the toast off the desktop
 * shell.
 */

export const ADD_MONEY_EVENT = "peridot:add-money"

export type AddMoneyView = "choose" | "card" | "bank"

export interface AddMoneyRequest {
  /**
   * Pool the money is meant for. Decides whether a card route exists (Stellar
   * pools have none yet) and where a confirmed card purchase resumes.
   */
  assetId?: string
  /** Prefill for the card amount. */
  defaultAmount?: string | number
  /**
   * Currency `defaultAmount` was typed in. The card step is in euros, so a
   * `"usd"` amount is converted at the live rate. Defaults to `"eur"`.
   */
  defaultAmountCurrency?: "usd" | "eur"
  /**
   * Where to land. `"choose"` (default) shows the methods, or goes straight to
   * the bank transfer when that is the only one on offer.
   */
  view?: AddMoneyView
}

export function openAddMoney(request: AddMoneyRequest = {}): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<AddMoneyRequest>(ADD_MONEY_EVENT, { detail: request }))
}
