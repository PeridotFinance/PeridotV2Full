/**
 * Stellar-native margin types.
 *
 * Distinct from the EVM `types/margin.ts` (which carries `0x` addresses, pTokens
 * with 8 decimals, SMA concepts). These mirror the on-chain Stellar margin data
 * model: positions live on-chain, collateral sits in MarginController custody,
 * and there is no "enable borrowing" step — `isActive` simply means a wallet is
 * connected.
 */
import type { PositionSide, StellarMarginAssetKey } from "../config/stellarMarginConfig"

export type { PositionSide, StellarMarginAssetKey }

/** Per-market state hydrated from on-chain reads. */
export interface StellarMarginAsset {
  key: StellarMarginAssetKey
  /** Raw contract symbol, e.g. "mock-USDT". */
  symbol: string
  /** Consumer-facing label, e.g. "USDT". */
  label: string
  /** Underlying Soroban token contract (C…). MarginController asset arg. */
  token: string
  /** ReceiptVault contract (C…). */
  vault: string
  decimals: number
  /** USD price (1:1 fallback when the oracle returns null — spec §6). */
  priceUsd: number
  /** Collateral factor 0..1. */
  collateralFactor: number
  /** Exchange rate (underlying per pToken, scaled 1e6). */
  exchangeRate: bigint
  /** Underlying balance in the user's wallet (human). */
  walletBalance: number
  /** Margin-custody pToken balance, raw units — used as `collateral_ptokens`. */
  marginPtokensRaw: bigint
  /** Underlying value of the margin-custody balance (human). */
  marginUnderlying: number
  /** Vault SPOT pToken balance, raw units — pTokens minted to the wallet that
   *  have NOT yet been moved into margin custody (or withdrawn back to the
   *  wallet). This is the "stuck funds" bucket a half-finished collateral move
   *  leaves behind: a successful `vault.deposit` whose `transfer_spot_to_margin`
   *  (or `vault.withdraw`) tail never landed. Invisible in wallet/margin totals,
   *  so the recovery banner surfaces it (see use-stellar-margin-recovery). */
  spotPtokensRaw: bigint
  /** Underlying value of the spot (stuck) pToken balance (human). */
  spotUnderlying: number
  isSupported: boolean
  borrowPaused: boolean
  /**
   * Underlying this market can pay out right now (human) — supply minus what
   * other traders have borrowed. `null` when the read didn't answer.
   *
   * Closing a position moves its ENTIRE collateral out of the vault in one
   * transfer, so a position larger than this cannot be closed however healthy it
   * is. Without the number on screen that arrived as a bare "Insufficient token
   * balance for this step" after two signatures — an accusation about the
   * trader's own wallet, for someone else's borrow.
   */
  availableLiquidity: number | null
}

/** An open leveraged position (status === "Open"). */
export interface StellarMarginPosition {
  /** String form of the u64 position id (UI key). */
  id: string
  positionId: bigint
  side: PositionSide
  /** Final position (collateral) asset — underlying token addr. */
  collateralToken: string
  /** Debt asset — underlying token addr. */
  debtToken: string
  collateralSymbol: string
  debtSymbol: string
  collateralPtokens: bigint
  /** Position-asset underlying amount (human). */
  collateralAmount: number
  /** Current outstanding debt (human), incl. accrued interest. */
  debtAmount: number
  /** USD value of the position collateral at current price. */
  collateralUsd: number
  /** USD value of the debt at current price. */
  debtUsd: number
  /** Approx leverage = collateralUsd / equity. */
  leverage: number
  entryPriceScaled: bigint
  /** Health factor (1.0 == safe), already divided by 1e6. */
  healthFactor: number
  /**
   * True when the chain couldn't tell us the health factor this poll — the read
   * traps whenever the oracle can't price the pair, which is a temporary outage,
   * not a distressed position.
   *
   * `healthFactor` is left at 0 in that case so every consumer keeps a number to
   * work with, but 0 is the most alarming value in the range: it renders as
   * "0.00" in a red, pulsing badge and trips the "near liquidation" warning. So
   * anything that judges or displays health must check this flag first. Absent
   * (previews) means the value is real.
   */
  healthUnknown?: boolean
  openedAt: Date
  /** Optional take-profit trigger price (XLM/USD), if the trader set one. */
  takeProfitUsd?: number | null
  /** Optional stop-loss trigger price (XLM/USD). */
  stopLossUsd?: number | null
}

/** A pending (unfinished) open — needs resume or cancel. */
export interface StellarPendingOpenView {
  id: string
  positionId: bigint
  side: PositionSide
  collateralToken: string
  debtToken: string
  positionToken: string
  collateralVault: string
  debtVault: string
  positionVault: string
  collateralPtokens: bigint
  openFeePtokens: bigint
  /** Borrowed debt amount (human) — canonical swap input. */
  borrowAmount: number
  borrowAmountRaw: bigint
  /** Locked margin in UNDERLYING units (raw) — V3 stores it on the pending. */
  marginAmountRaw: bigint | null
  /** Minimum acceptable position amount (raw) for the on-chain swap. */
  minPositionAmountRaw: bigint
  expiresAt: Date
  isExpired: boolean
  /** V3: true once `swap_open_position_v3` executed. The pending can then ONLY
   *  be activated (finish) — cancel is off the table, and activation stays
   *  possible even past `expiresAt`. */
  hasExecution: boolean
  /** Position-asset amount the executed swap received (raw), when known. */
  executionPositionAmountRaw: bigint | null
}

/** A pending (unfinished) split-close — needs finish (crank), cancel, or expire.
 *  Mirrors {@link StellarPendingOpenView} for the close direction. */
export interface StellarPendingCloseView {
  id: string
  positionId: bigint
  side: PositionSide
  positionToken: string
  debtToken: string
  /** Collateral moved into the controller by `prepare_close` (raw, position
   *  asset underlying). */
  collateralUnderlyingRaw: bigint
  /** Outstanding debt to repay (raw), when the contract exposes it. */
  debtAmountRaw: bigint
  expiresAt: Date
  isExpired: boolean
  /** True once `swap_close_position_v3` executed: cancel is off the table, the
   *  only way forward is finish (permissionless, valid past expiry). */
  hasSwapped: boolean
  /** What that swap delivered (raw, debt asset). With `collateralUnderlyingRaw`
   *  it prices a close this client never ran — the only exit price available on
   *  the recovery path, and the one the journal prefers over the feed. */
  receivedDebtAssetRaw: bigint
}

/**
 * A position the contract has settled but not yet let go of.
 *
 * `finish_close_position_v3` pays the debt out of the swap proceeds. Interest
 * accrues while the close is in flight, so those proceeds can land a few stroops
 * short — and rather than reverting (which is what stranded closes before), the
 * contract books what it could as a `close_residual` and keeps the position in
 * `Closing` until the remainder settles.
 *
 * That state has no pending close attached to it any more, so the sweep would
 * otherwise classify the id as neither open, nor pending, nor closing — i.e.
 * drop it, and the trader would watch their position simply disappear a moment
 * before it actually did. It is not actionable: there is nothing for the user to
 * sign, which is why this view carries only what a notice needs.
 */
export interface StellarSettlingView {
  id: string
  positionId: bigint
  side: PositionSide
  /** Position (collateral) asset — underlying token address, for the label. */
  positionToken: string
  debtToken: string
}

/**
 * The minimum a repayment needs to know about what it is repaying.
 *
 * `repay_margin_position_v3` accepts a position in either `Open` or `Closing`
 * status, and needs nothing beyond the id and which asset the debt is in — the
 * hook re-reads the live debt itself. Naming that minimum lets one repay path
 * serve both an open row and a stranded split-close, instead of tying repayment
 * to the rich {@link StellarMarginPosition} shape that only exists for `Open`.
 *
 * Satisfied structurally by {@link StellarMarginPosition}; derived from a
 * {@link StellarPendingCloseView} for the mid-close case.
 */
export interface StellarRepayTarget {
  id: string
  positionId: bigint
  side: PositionSide
  debtToken: string
}

/** Loose account aggregate. No SMA / enable step on Stellar. */
export interface StellarMarginAccount {
  address: string | null
  isActive: boolean
  /** Total USD value of margin-custody collateral across markets. */
  marginCollateralUsd: number
  /** Total USD debt across open positions. */
  borrowUsd: number
  /** Worst (lowest) health factor across open positions, or null. */
  worstHealthFactor: number | null
}
