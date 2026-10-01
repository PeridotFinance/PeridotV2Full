/**
 * TypeScript shapes for the Bridge.xyz API surface the fiat on-ramp touches.
 * Mirrors https://apidocs.bridge.xyz — kept intentionally narrow (only the
 * fields we read) so the API growing new fields never breaks us.
 */

// ── KYC link / customer status ───────────────────────────────────────────────

export type BridgeKycStatus =
  | "not_started"
  | "incomplete"
  | "awaiting_questionnaire"
  | "awaiting_ubo"
  | "under_review"
  | "approved"
  | "rejected"
  | "paused"
  | "offboarded"

export type BridgeTosStatus = "pending" | "approved"

export type BridgeEndorsementName = "base" | "sepa" | "spei" | "cards" | string

export type BridgeEndorsementStatus = "incomplete" | "approved" | "revoked"

export interface BridgeEndorsement {
  name: BridgeEndorsementName
  status: BridgeEndorsementStatus
  requirements?: {
    complete?: string[]
    pending?: string[]
    missing?: unknown
    issues?: unknown[]
  }
}

export interface BridgeRejectionReason {
  reason: string
  developer_reason?: string
}

/** Response of POST /v0/kyc_links and GET /v0/kyc_links/:id */
export interface BridgeKycLink {
  id: string
  customer_id: string
  type: "individual" | "business"
  email: string
  full_name?: string
  kyc_link: string
  tos_link: string
  kyc_status: BridgeKycStatus
  tos_status: BridgeTosStatus
  created_at?: string
}

/** Response of GET /v0/customers/:id */
export interface BridgeCustomer {
  id: string
  email?: string
  status: string
  has_accepted_terms_of_service?: boolean
  endorsements?: BridgeEndorsement[]
  requirements_due?: string[]
  rejection_reasons?: BridgeRejectionReason[]
  created_at?: string
  updated_at?: string
}

// ── Bridge-managed wallets (Dollar-Access step 3) ────────────────────────────

/** A wallet Bridge provisions and custodies for a customer on a given chain. */
export interface BridgeWallet {
  id: string
  chain: string // "stellar", "base", …
  address: string
  created_at?: string
}

// ── Virtual accounts ─────────────────────────────────────────────────────────

export type BridgeFiatCurrency = "usd" | "eur" | "mxn" | "brl" | "gbp" | "cop"

export interface BridgeVirtualAccountSource {
  currency: BridgeFiatCurrency
}

export interface BridgeVirtualAccountDestination {
  payment_rail: string // "stellar"
  currency: string // "usdc"
  address: string
  blockchain_memo?: string
}

/** Fiat deposit instructions returned for an EUR/SEPA virtual account. */
export interface BridgeSepaDepositInstructions {
  currency?: string
  iban?: string
  bic?: string
  account_holder_name?: string
  bank_name?: string
  bank_address?: string
  payment_rails?: string[]
  // USD/GBP/etc. fields exist too but are unused for the EUR-only flow.
  [key: string]: unknown
}

/** Response of POST/GET /v0/customers/:id/virtual_accounts */
export interface BridgeVirtualAccount {
  id: string
  status: string
  customer_id: string
  developer_fee_percent?: string
  source: BridgeVirtualAccountSource
  destination: BridgeVirtualAccountDestination
  source_deposit_instructions: BridgeSepaDepositInstructions
  created_at?: string
}

// ── Virtual account activity (deposit lifecycle) ─────────────────────────────

export interface BridgeVirtualAccountActivity {
  id: string
  type: string // payment_submitted|funds_received|payment_processed|in_review|refunded
  amount?: string
  currency?: string
  source?: { amount?: string; currency?: string; description?: string }
  virtual_account_id: string
  customer_id: string
  created_at?: string
}

// ── Transfers (outbound from a Bridge-managed wallet) ───────────────────────

export type BridgeTransferState =
  | "awaiting_funds"
  | "funds_received"
  | "in_review"
  | "payment_submitted"
  | "payment_processed"
  | "returned"
  | "refunded"
  | "error"
  | "cancelled"

export interface BridgeTransferEndpoint {
  payment_rail: string // "stellar", "base", …
  currency: string
  address?: string
  blockchain_memo?: string
  /** For source = Bridge-managed wallet: pass the wallet id instead of address. */
  from_wallet_id?: string
}

export interface BridgeTransferReceipt {
  id?: string
  state?: string
  destination_tx_hash?: string
  source_tx_hash?: string
  url?: string
}

/** Response of POST /v0/transfers and GET /v0/transfers/:id */
export interface BridgeTransfer {
  id: string
  state: BridgeTransferState | string
  amount: string
  currency: string
  developer_fee?: string
  source: BridgeTransferEndpoint
  destination: BridgeTransferEndpoint
  receipt?: BridgeTransferReceipt
  on_behalf_of?: string
  created_at?: string
  updated_at?: string
}

// ── External accounts (the user's own bank account, off-ramp destination) ────

/** Bank rails we can pay out to. Only `sepa` is wired today. */
export type BridgeExternalAccountType = "iban" | "us" | "clabe" | string

export interface BridgeIbanDetails {
  account_number?: string
  bic?: string
  country?: string
  last_4?: string
}

/** Response of POST/GET /v0/customers/:id/external_accounts */
export interface BridgeExternalAccount {
  id: string
  customer_id?: string
  currency: string // "eur"
  account_type: BridgeExternalAccountType
  bank_name?: string
  account_owner_name?: string
  account_owner_type?: "individual" | "business"
  iban?: BridgeIbanDetails
  active?: boolean
  created_at?: string
  updated_at?: string
}

// ── Liquidation addresses (off-ramp: crypto in → fiat out) ───────────────────

/**
 * A permanent chain address tied to a fiat destination. Anything the user sends
 * to it is auto-converted and paid out — no per-withdrawal API call from us.
 */
export interface BridgeLiquidationAddress {
  id: string
  customer_id?: string
  chain: string // "stellar"
  currency: string // "eurc"
  address: string
  /**
   * Memo-based chains (Stellar) route by memo — a deposit without it is
   * delayed or misattributed. See `memoless_address` for the escape hatch.
   */
  blockchain_memo?: string
  /**
   * Stellar only: a dedicated address needing no memo. Bridge documents this in
   * the response schema but not in prose — treat as optional and prefer it when
   * present.
   */
  memoless_address?: string
  destination_payment_rail?: string // "sepa"
  destination_currency?: string // "eur"
  destination_sepa_reference?: string
  external_account_id?: string
  state?: string
  return_memo?: string
  custom_developer_fee_percent?: string
  created_at?: string
  updated_at?: string
}

/**
 * A single conversion+payout triggered by a deposit to a liquidation address.
 * Always advances forward: funds_received → payment_submitted → payment_processed.
 */
export type BridgeDrainState =
  | "in_review"
  | "funds_received"
  | "payment_submitted"
  | "payment_processed"
  | "undeliverable"
  | "returned"
  | "refund_in_flight"
  | "refunded"
  | "error"

export interface BridgeDrainDestination {
  payment_rail?: string
  currency?: string
  external_account_id?: string
}

/** Response item of GET /v0/customers/:id/liquidation_addresses/:id/drains */
export interface BridgeDrain {
  id: string
  amount: string
  currency: string
  state: BridgeDrainState | string
  /** Hash of the user's inbound payment — our join key back to `bridge_cashouts`. */
  deposit_tx_hash?: string
  destination_tx_hash?: string
  destination?: BridgeDrainDestination
  liquidation_address_id?: string
  customer_id?: string
  created_at?: string
  updated_at?: string
}

// ── Webhook envelope ─────────────────────────────────────────────────────────

export interface BridgeWebhookEvent {
  api_version: string
  event_id: string
  event_category: string // "customer" | "kyc_link" | "virtual_account.activity" | ...
  event_type: string // "<category>.<mutation>"
  event_object_id: string
  event_object_status?: string | null
  event_object: Record<string, unknown>
  event_object_changes?: Record<string, unknown>
  event_created_at: string
}
