/**
 * Database access for the Bridge.xyz on-ramp tables. All rows are keyed by the
 * Privy DID (`privy_user_id`). See scripts/migration_bridge_onramp.sql.
 */

import { sql } from "@/lib/database"
import { getTableNames } from "@/lib/tableResolver"
import { bridgeEnvName } from "@/lib/bridge/client"

const t = getTableNames()

export interface BridgeCustomerRow {
  id: string
  privy_user_id: string
  bridge_customer_id: string | null
  email: string | null
  /** Bridge environment this customer was created in ("production"|"sandbox"). */
  bridge_env: string
  kyc_status: string
  tos_status: string
  endorsements: Record<string, string>
  kyc_link_id: string | null
  rejection_reasons: unknown
  bridge_wallet_id: string | null
  bridge_wallet_chain: string | null
  bridge_wallet_address: string | null
  payout_stellar_address: string | null
  payout_address_set_at: string | null
  auto_forward_enabled: boolean
  created_at: string
  updated_at: string
}

export interface BridgePayoutRow {
  id: string
  privy_user_id: string
  bridge_customer_id: string
  source_activity_id: string | null
  bridge_transfer_id: string | null
  destination_address: string
  amount: string
  currency: string
  fee_amount: string | null
  trigger: "auto" | "manual"
  status: "pending" | "submitted" | "processing" | "completed" | "failed" | "cancelled"
  failure_reason: string | null
  stellar_tx_hash: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface BridgeExternalAccountRow {
  id: string
  privy_user_id: string
  bridge_customer_id: string
  bridge_external_account_id: string
  currency: string
  iban_last4: string | null
  bic: string | null
  bank_name: string | null
  account_holder_name: string | null
  country: string | null
  bridge_env: string
  created_at: string
  updated_at: string
}

export interface BridgeLiquidationAddressRow {
  id: string
  privy_user_id: string
  bridge_customer_id: string
  bridge_liquidation_address_id: string
  chain: string
  currency: string
  address: string
  blockchain_memo: string | null
  memoless_address: string | null
  destination_rail: string
  destination_currency: string
  bridge_external_account_id: string
  state: string
  bridge_env: string
  created_at: string
  updated_at: string
}

export interface BridgeCashoutRow {
  id: string
  privy_user_id: string
  bridge_customer_id: string
  stellar_tx_hash: string
  bridge_drain_id: string | null
  amount: string
  currency: string
  fiat_amount: string | null
  destination_currency: string
  status:
    | "submitted"
    | "funds_received"
    | "payment_submitted"
    | "completed"
    | "failed"
    | "returned"
    | "refunded"
  failure_reason: string | null
  bridge_env: string
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface BridgeVirtualAccountRow {
  id: string
  privy_user_id: string
  bridge_customer_id: string
  bridge_account_id: string
  fiat_currency: string
  iban: string | null
  bic: string | null
  bank_name: string | null
  account_holder_name: string | null
  destination_rail: string
  destination_currency: string
  destination_address: string
  destination_memo: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface BridgeTransferEventRow {
  id: string
  bridge_event_object_id: string
  bridge_account_id: string
  privy_user_id: string
  activity_type: string | null
  amount: string | null
  currency: string | null
  source_amount: string | null
  source_currency: string | null
  status: string | null
  occurred_at: string | null
  created_at: string
  updated_at: string
}

// ── Customers ────────────────────────────────────────────────────────────────

export async function getCustomerByPrivyId(
  privyUserId: string,
): Promise<BridgeCustomerRow | null> {
  // Env-scoped: a sandbox-era customer must be invisible in production (and
  // vice versa) — its Bridge id 404s on the other API, which used to leave
  // users permanently stuck on a stale state (e.g. sepa_pending forever).
  const rows = await sql`
    SELECT * FROM ${sql(t.bridgeCustomers)}
    WHERE privy_user_id = ${privyUserId}
      AND bridge_env = ${bridgeEnvName()}
    LIMIT 1
  `
  return (rows[0] as BridgeCustomerRow) ?? null
}

export async function getCustomerByBridgeId(
  bridgeCustomerId: string,
): Promise<BridgeCustomerRow | null> {
  const rows = await sql`
    SELECT * FROM ${sql(t.bridgeCustomers)}
    WHERE bridge_customer_id = ${bridgeCustomerId}
    LIMIT 1
  `
  return (rows[0] as BridgeCustomerRow) ?? null
}

/**
 * Moves a Bridge customer — and every row hanging off it — from the Privy DID
 * that currently owns it to `toPrivyUserId`.
 *
 * This exists for the second-DID case: the same human signs in via a different
 * method (new DID), types their email, and Bridge dedupes onto the customer
 * their old DID created. The caller MUST have proven ownership first (the KYC
 * route requires the customer's email to be Privy-verified on the new DID) —
 * this function just performs the move.
 *
 * Child rows (virtual accounts, transfer events, external accounts,
 * liquidation addresses, cashouts, payouts) are keyed by privy_user_id, and
 * the old DID owns exactly this one customer, so re-keying everything under
 * the old DID is complete and touches nothing else. A leftover customer stub
 * under the new DID (e.g. from sandbox testing) would collide with
 * UNIQUE(privy_user_id), so it's dropped — Bridge just told us the adopted
 * customer is the authoritative one for this person.
 *
 * No-op when the customer is unknown or already owned by `toPrivyUserId`.
 */
export async function adoptCustomerForPrivyUser(
  bridgeCustomerId: string,
  toPrivyUserId: string,
): Promise<void> {
  await sql.begin(async (tx) => {
    const rows = await tx`
      SELECT privy_user_id FROM ${tx(t.bridgeCustomers)}
      WHERE bridge_customer_id = ${bridgeCustomerId}
      FOR UPDATE
    `
    const fromPrivyUserId = (rows[0] as { privy_user_id?: string } | undefined)?.privy_user_id
    if (!fromPrivyUserId || fromPrivyUserId === toPrivyUserId) return

    await tx`
      DELETE FROM ${tx(t.bridgeCustomers)} WHERE privy_user_id = ${toPrivyUserId}
    `
    await tx`
      UPDATE ${tx(t.bridgeCustomers)}
      SET privy_user_id = ${toPrivyUserId}
      WHERE bridge_customer_id = ${bridgeCustomerId}
    `
    for (const table of [
      t.bridgeVirtualAccounts,
      t.bridgeTransferEvents,
      t.bridgeExternalAccounts,
      t.bridgeLiquidationAddresses,
      t.bridgeCashouts,
      t.bridgePayouts,
    ]) {
      await tx`
        UPDATE ${tx(table)}
        SET privy_user_id = ${toPrivyUserId}
        WHERE privy_user_id = ${fromPrivyUserId}
      `
    }
  })
}

export interface UpsertCustomerInput {
  privyUserId: string
  bridgeCustomerId: string
  email: string | null
  kycLinkId: string | null
  kycStatus: string
  tosStatus: string
  endorsements: Record<string, string>
}

/**
 * Records (or refreshes) the customer row created by a KYC-link request.
 * Idempotent on `privy_user_id` — re-requesting a KYC link just updates status.
 */
export async function upsertCustomerFromKycLink(
  input: UpsertCustomerInput,
): Promise<BridgeCustomerRow> {
  // One row per privy user; the current env wins. A leftover row from the
  // other environment (e.g. sandbox testing) is repurposed wholesale — its
  // customer holds no real money and its id is unusable in this env anyway.
  const rows = await sql`
    INSERT INTO ${sql(t.bridgeCustomers)} (
      privy_user_id, bridge_customer_id, email, kyc_link_id, kyc_status, tos_status, endorsements, bridge_env
    ) VALUES (
      ${input.privyUserId}, ${input.bridgeCustomerId}, ${input.email}, ${input.kycLinkId},
      ${input.kycStatus}, ${input.tosStatus}, ${sql.json(input.endorsements)},
      ${bridgeEnvName()}
    )
    ON CONFLICT (privy_user_id) DO UPDATE SET
      bridge_customer_id = EXCLUDED.bridge_customer_id,
      email = COALESCE(EXCLUDED.email, ${sql(t.bridgeCustomers)}.email),
      kyc_link_id = EXCLUDED.kyc_link_id,
      kyc_status = EXCLUDED.kyc_status,
      tos_status = EXCLUDED.tos_status,
      endorsements = EXCLUDED.endorsements,
      rejection_reasons = NULL,
      -- Bridge-managed wallet ids are scoped to the env they were created in;
      -- on an env switch they must be re-provisioned, not carried over.
      bridge_wallet_id = CASE WHEN ${sql(t.bridgeCustomers)}.bridge_env = EXCLUDED.bridge_env
        THEN ${sql(t.bridgeCustomers)}.bridge_wallet_id ELSE NULL END,
      bridge_wallet_chain = CASE WHEN ${sql(t.bridgeCustomers)}.bridge_env = EXCLUDED.bridge_env
        THEN ${sql(t.bridgeCustomers)}.bridge_wallet_chain ELSE NULL END,
      bridge_wallet_address = CASE WHEN ${sql(t.bridgeCustomers)}.bridge_env = EXCLUDED.bridge_env
        THEN ${sql(t.bridgeCustomers)}.bridge_wallet_address ELSE NULL END,
      bridge_env = EXCLUDED.bridge_env
    RETURNING *
  `
  return rows[0] as BridgeCustomerRow
}

export interface UpdateCustomerStatusInput {
  kycStatus?: string
  tosStatus?: string
  endorsements?: Record<string, string>
  rejectionReasons?: unknown
}

/** Applies a status change from a webhook to an existing customer. */
export async function updateCustomerStatusByBridgeId(
  bridgeCustomerId: string,
  input: UpdateCustomerStatusInput,
): Promise<BridgeCustomerRow | null> {
  const rows = await sql`
    UPDATE ${sql(t.bridgeCustomers)} SET
      kyc_status = COALESCE(${input.kycStatus ?? null}, kyc_status),
      tos_status = COALESCE(${input.tosStatus ?? null}, tos_status),
      endorsements = COALESCE(
        ${input.endorsements ? sql.json(input.endorsements) : null},
        endorsements
      ),
      rejection_reasons = COALESCE(
        ${input.rejectionReasons ? sql.json(input.rejectionReasons as never) : null},
        rejection_reasons
      )
    WHERE bridge_customer_id = ${bridgeCustomerId}
    RETURNING *
  `
  return (rows[0] as BridgeCustomerRow) ?? null
}

/**
 * Sets (or rotates) the user's own Stellar payout address — the destination
 * Bridge transfers EURC to after a SEPA deposit settles. Caller MUST have
 * already verified the address belongs to this user via account_wallet_links.
 */
export async function setPayoutAddressForCustomer(
  privyUserId: string,
  stellarAddress: string,
  autoForwardEnabled = true,
): Promise<BridgeCustomerRow | null> {
  const rows = await sql`
    UPDATE ${sql(t.bridgeCustomers)} SET
      payout_stellar_address = ${stellarAddress},
      payout_address_set_at = NOW(),
      auto_forward_enabled = ${autoForwardEnabled}
    WHERE privy_user_id = ${privyUserId}
    RETURNING *
  `
  return (rows[0] as BridgeCustomerRow) ?? null
}

/** Records the Bridge-managed wallet provisioned for a customer. */
export async function setBridgeWalletForCustomer(
  privyUserId: string,
  wallet: { walletId: string; chain: string; address: string },
): Promise<BridgeCustomerRow | null> {
  const rows = await sql`
    UPDATE ${sql(t.bridgeCustomers)} SET
      bridge_wallet_id = ${wallet.walletId},
      bridge_wallet_chain = ${wallet.chain},
      bridge_wallet_address = ${wallet.address}
    WHERE privy_user_id = ${privyUserId}
    RETURNING *
  `
  return (rows[0] as BridgeCustomerRow) ?? null
}

// ── Virtual accounts ─────────────────────────────────────────────────────────

/**
 * Look up a single virtual account. With `destinationCurrency` set, returns
 * the exact (fiat, destination) row — used for currency-specific lookups
 * since the user may have both EUR→EURC and EUR→USDC accounts. Without it,
 * returns the EURC row if present, else the first match — preserves the
 * pre-multi-destination contract for callers that haven't been updated yet.
 */
export async function getVirtualAccountByPrivyId(
  privyUserId: string,
  fiatCurrency: string,
  destinationCurrency?: string,
): Promise<BridgeVirtualAccountRow | null> {
  if (destinationCurrency) {
    const rows = await sql`
      SELECT * FROM ${sql(t.bridgeVirtualAccounts)}
      WHERE privy_user_id = ${privyUserId}
        AND fiat_currency = ${fiatCurrency}
        AND destination_currency = ${destinationCurrency}
      LIMIT 1
    `
    return (rows[0] as BridgeVirtualAccountRow) ?? null
  }
  const rows = await sql`
    SELECT * FROM ${sql(t.bridgeVirtualAccounts)}
    WHERE privy_user_id = ${privyUserId} AND fiat_currency = ${fiatCurrency}
    ORDER BY (destination_currency = 'eurc') DESC, created_at ASC
    LIMIT 1
  `
  return (rows[0] as BridgeVirtualAccountRow) ?? null
}

/** All virtual accounts for the user/fiat pair — one per destination currency. */
export async function listVirtualAccountsByPrivyId(
  privyUserId: string,
  fiatCurrency: string,
): Promise<BridgeVirtualAccountRow[]> {
  const rows = await sql`
    SELECT * FROM ${sql(t.bridgeVirtualAccounts)}
    WHERE privy_user_id = ${privyUserId} AND fiat_currency = ${fiatCurrency}
    ORDER BY (destination_currency = 'eurc') DESC, created_at ASC
  `
  return rows as unknown as BridgeVirtualAccountRow[]
}

export async function getVirtualAccountByBridgeId(
  bridgeAccountId: string,
): Promise<BridgeVirtualAccountRow | null> {
  const rows = await sql`
    SELECT * FROM ${sql(t.bridgeVirtualAccounts)}
    WHERE bridge_account_id = ${bridgeAccountId}
    LIMIT 1
  `
  return (rows[0] as BridgeVirtualAccountRow) ?? null
}

export interface InsertVirtualAccountInput {
  privyUserId: string
  bridgeCustomerId: string
  bridgeAccountId: string
  fiatCurrency: string
  iban: string | null
  bic: string | null
  bankName: string | null
  accountHolderName: string | null
  destinationRail: string
  destinationCurrency: string
  destinationAddress: string
  destinationMemo: string | null
  status: string
}

/** Persists a newly created virtual account; idempotent per user+currency. */
export async function insertVirtualAccount(
  input: InsertVirtualAccountInput,
): Promise<BridgeVirtualAccountRow> {
  const rows = await sql`
    INSERT INTO ${sql(t.bridgeVirtualAccounts)} (
      privy_user_id, bridge_customer_id, bridge_account_id, fiat_currency,
      iban, bic, bank_name, account_holder_name,
      destination_rail, destination_currency, destination_address, destination_memo, status
    ) VALUES (
      ${input.privyUserId}, ${input.bridgeCustomerId}, ${input.bridgeAccountId}, ${input.fiatCurrency},
      ${input.iban}, ${input.bic}, ${input.bankName}, ${input.accountHolderName},
      ${input.destinationRail}, ${input.destinationCurrency}, ${input.destinationAddress},
      ${input.destinationMemo}, ${input.status}
    )
    ON CONFLICT (privy_user_id, fiat_currency, destination_currency) DO UPDATE SET
      bridge_account_id = EXCLUDED.bridge_account_id,
      iban = EXCLUDED.iban,
      bic = EXCLUDED.bic,
      bank_name = EXCLUDED.bank_name,
      account_holder_name = EXCLUDED.account_holder_name,
      destination_address = EXCLUDED.destination_address,
      destination_memo = EXCLUDED.destination_memo,
      status = EXCLUDED.status
    RETURNING *
  `
  return rows[0] as BridgeVirtualAccountRow
}

// ── Transfer events ──────────────────────────────────────────────────────────

export interface RecordTransferEventInput {
  bridgeEventObjectId: string
  bridgeAccountId: string
  privyUserId: string
  activityType: string | null
  amount: string | null
  currency: string | null
  sourceAmount: string | null
  sourceCurrency: string | null
  status: string | null
  occurredAt: string | null
}

/** Upserts a deposit-lifecycle event; idempotent on the Bridge activity id. */
export async function recordTransferEvent(
  input: RecordTransferEventInput,
): Promise<BridgeTransferEventRow> {
  const rows = await sql`
    INSERT INTO ${sql(t.bridgeTransferEvents)} (
      bridge_event_object_id, bridge_account_id, privy_user_id, activity_type,
      amount, currency, source_amount, source_currency, status, occurred_at
    ) VALUES (
      ${input.bridgeEventObjectId}, ${input.bridgeAccountId}, ${input.privyUserId},
      ${input.activityType}, ${input.amount}, ${input.currency},
      ${input.sourceAmount}, ${input.sourceCurrency}, ${input.status}, ${input.occurredAt}
    )
    ON CONFLICT (bridge_event_object_id) DO UPDATE SET
      activity_type = EXCLUDED.activity_type,
      amount = EXCLUDED.amount,
      currency = EXCLUDED.currency,
      source_amount = EXCLUDED.source_amount,
      source_currency = EXCLUDED.source_currency,
      status = EXCLUDED.status,
      occurred_at = EXCLUDED.occurred_at
    RETURNING *
  `
  return rows[0] as BridgeTransferEventRow
}

export async function listTransferEvents(
  privyUserId: string,
  limit = 25,
): Promise<BridgeTransferEventRow[]> {
  const rows = await sql`
    SELECT * FROM ${sql(t.bridgeTransferEvents)}
    WHERE privy_user_id = ${privyUserId}
    ORDER BY occurred_at DESC NULLS LAST, created_at DESC
    LIMIT ${limit}
  `
  return rows as unknown as BridgeTransferEventRow[]
}

/**
 * Sum of transfers that Bridge has acknowledged but not yet settled — what the
 * UI shows as "pending" alongside the live on-chain balance. Bridge's
 * `activity_type` / `status` vocabulary varies by lifecycle stage, so we treat
 * anything that doesn't look "done" or "returned" as still in flight.
 */
// ── Payouts (outbound transfers to the user's own Stellar wallet) ────────────

export interface InsertPendingPayoutInput {
  privyUserId: string
  bridgeCustomerId: string
  sourceActivityId: string | null
  destinationAddress: string
  amount: string
  currency: string
  trigger: "auto" | "manual"
}

/**
 * Reserves a payout slot BEFORE calling Bridge. If `sourceActivityId` is set
 * and a row already exists for it, returns null — the caller must treat that
 * as "already paid, skip". This is the idempotency anchor that protects against
 * replayed `funds_received` webhooks and double-clicks on the manual button.
 */
export async function insertPendingPayout(
  input: InsertPendingPayoutInput,
): Promise<BridgePayoutRow | null> {
  const rows = await sql`
    INSERT INTO ${sql(t.bridgePayouts)} (
      privy_user_id, bridge_customer_id, source_activity_id,
      destination_address, amount, currency, trigger, status
    ) VALUES (
      ${input.privyUserId}, ${input.bridgeCustomerId}, ${input.sourceActivityId},
      ${input.destinationAddress}, ${input.amount}, ${input.currency},
      ${input.trigger}, 'pending'
    )
    ON CONFLICT (source_activity_id) DO NOTHING
    RETURNING *
  `
  return (rows[0] as BridgePayoutRow) ?? null
}

export async function getPayoutBySourceActivityId(
  sourceActivityId: string,
): Promise<BridgePayoutRow | null> {
  const rows = await sql`
    SELECT * FROM ${sql(t.bridgePayouts)}
    WHERE source_activity_id = ${sourceActivityId}
    LIMIT 1
  `
  return (rows[0] as BridgePayoutRow) ?? null
}

export interface UpdatePayoutStatusInput {
  status: BridgePayoutRow["status"]
  bridgeTransferId?: string | null
  feeAmount?: string | null
  failureReason?: string | null
  stellarTxHash?: string | null
  completed?: boolean
}

export async function updatePayoutStatus(
  payoutId: string,
  input: UpdatePayoutStatusInput,
): Promise<BridgePayoutRow | null> {
  const rows = await sql`
    UPDATE ${sql(t.bridgePayouts)} SET
      status = ${input.status},
      bridge_transfer_id = COALESCE(${input.bridgeTransferId ?? null}, bridge_transfer_id),
      fee_amount = COALESCE(${input.feeAmount ?? null}, fee_amount),
      failure_reason = ${input.failureReason ?? null},
      stellar_tx_hash = COALESCE(${input.stellarTxHash ?? null}, stellar_tx_hash),
      completed_at = CASE WHEN ${input.completed ?? false} THEN NOW() ELSE completed_at END
    WHERE id = ${payoutId}
    RETURNING *
  `
  return (rows[0] as BridgePayoutRow) ?? null
}

/**
 * Most recent successfully-executed auto-forward for the user, or null.
 * Used by the balance route to drive the "money landed in your wallet"
 * notification — we only want to surface a toast for payouts the user didn't
 * trigger themselves (manual ones already toasted at click time).
 */
export async function getLatestAutoPayoutForUser(
  privyUserId: string,
): Promise<BridgePayoutRow | null> {
  const rows = await sql`
    SELECT * FROM ${sql(t.bridgePayouts)}
    WHERE privy_user_id = ${privyUserId}
      AND trigger = 'auto'
      AND status IN ('submitted', 'completed')
    ORDER BY created_at DESC
    LIMIT 1
  `
  return (rows[0] as BridgePayoutRow) ?? null
}

export async function listPayoutsForUser(
  privyUserId: string,
  limit = 25,
): Promise<BridgePayoutRow[]> {
  const rows = await sql`
    SELECT * FROM ${sql(t.bridgePayouts)}
    WHERE privy_user_id = ${privyUserId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  return rows as unknown as BridgePayoutRow[]
}

/**
 * `currency` filters by `bridge_transfer_events.currency` (the stablecoin
 * Bridge is converting to). Omit to sum across all destinations — what the
 * legacy EUR-only UI showed; new callers should pass "eurc" or "usdc".
 */
export async function sumPendingTransfersForUser(
  privyUserId: string,
  currency?: string,
): Promise<number> {
  const rows = currency
    ? await sql`
        SELECT activity_type, status, source_amount, amount
        FROM ${sql(t.bridgeTransferEvents)}
        WHERE privy_user_id = ${privyUserId}
          AND LOWER(currency) = LOWER(${currency})
      `
    : await sql`
        SELECT activity_type, status, source_amount, amount
        FROM ${sql(t.bridgeTransferEvents)}
        WHERE privy_user_id = ${privyUserId}
      `
  return (rows as unknown as BridgeTransferEventRow[]).reduce((sum, r) => {
    const tag = ((r.activity_type ?? "") + " " + (r.status ?? "")).toLowerCase()
    const settled = /processed|completed|paid|refund/.test(tag)
    if (settled) return sum
    const raw = r.source_amount ?? r.amount
    const n = raw == null ? 0 : Number(raw)
    return Number.isFinite(n) && n > 0 ? sum + n : sum
  }, 0)
}

// ── Off-ramp: external accounts (the user's own bank) ────────────────────────
// Everything below is the fiat OFF-ramp (EURC → SEPA). The `bridge_payouts`
// helpers above are the on-ramp's crypto tail despite the name — don't mix them.

export interface InsertExternalAccountInput {
  privyUserId: string
  bridgeCustomerId: string
  bridgeExternalAccountId: string
  currency: string
  ibanLast4: string | null
  bic: string | null
  bankName: string | null
  accountHolderName: string | null
  country: string | null
}

export async function getExternalAccountByPrivyId(
  privyUserId: string,
  currency = "eur",
): Promise<BridgeExternalAccountRow | null> {
  const rows = await sql`
    SELECT * FROM ${sql(t.bridgeExternalAccounts)}
    WHERE privy_user_id = ${privyUserId}
      AND currency = ${currency}
      AND bridge_env = ${bridgeEnvName()}
    ORDER BY created_at DESC
    LIMIT 1
  `
  return (rows[0] as BridgeExternalAccountRow) ?? null
}

export async function insertExternalAccount(
  input: InsertExternalAccountInput,
): Promise<BridgeExternalAccountRow | null> {
  const rows = await sql`
    INSERT INTO ${sql(t.bridgeExternalAccounts)} (
      privy_user_id, bridge_customer_id, bridge_external_account_id, currency,
      iban_last4, bic, bank_name, account_holder_name, country, bridge_env
    ) VALUES (
      ${input.privyUserId}, ${input.bridgeCustomerId}, ${input.bridgeExternalAccountId},
      ${input.currency}, ${input.ibanLast4}, ${input.bic}, ${input.bankName},
      ${input.accountHolderName}, ${input.country}, ${bridgeEnvName()}
    )
    ON CONFLICT (bridge_external_account_id) DO UPDATE SET
      iban_last4          = EXCLUDED.iban_last4,
      bic                 = EXCLUDED.bic,
      bank_name           = EXCLUDED.bank_name,
      account_holder_name = EXCLUDED.account_holder_name,
      country             = EXCLUDED.country
    RETURNING *
  `
  return (rows[0] as BridgeExternalAccountRow) ?? null
}

// ── Off-ramp: liquidation addresses ──────────────────────────────────────────

export interface InsertLiquidationAddressInput {
  privyUserId: string
  bridgeCustomerId: string
  bridgeLiquidationAddressId: string
  chain: string
  currency: string
  address: string
  blockchainMemo: string | null
  memolessAddress: string | null
  destinationRail: string
  destinationCurrency: string
  bridgeExternalAccountId: string
  state: string
}

export async function getLiquidationAddressByPrivyId(
  privyUserId: string,
  currency = "eurc",
  destinationCurrency = "eur",
): Promise<BridgeLiquidationAddressRow | null> {
  const rows = await sql`
    SELECT * FROM ${sql(t.bridgeLiquidationAddresses)}
    WHERE privy_user_id = ${privyUserId}
      AND currency = ${currency}
      AND destination_currency = ${destinationCurrency}
      AND bridge_env = ${bridgeEnvName()}
    LIMIT 1
  `
  return (rows[0] as BridgeLiquidationAddressRow) ?? null
}

/** Idempotent: re-running provisioning refreshes the address/memo in place. */
export async function insertLiquidationAddress(
  input: InsertLiquidationAddressInput,
): Promise<BridgeLiquidationAddressRow | null> {
  const rows = await sql`
    INSERT INTO ${sql(t.bridgeLiquidationAddresses)} (
      privy_user_id, bridge_customer_id, bridge_liquidation_address_id, chain,
      currency, address, blockchain_memo, memoless_address, destination_rail,
      destination_currency, bridge_external_account_id, state, bridge_env
    ) VALUES (
      ${input.privyUserId}, ${input.bridgeCustomerId}, ${input.bridgeLiquidationAddressId},
      ${input.chain}, ${input.currency}, ${input.address}, ${input.blockchainMemo},
      ${input.memolessAddress}, ${input.destinationRail}, ${input.destinationCurrency},
      ${input.bridgeExternalAccountId}, ${input.state}, ${bridgeEnvName()}
    )
    ON CONFLICT (privy_user_id, currency, destination_currency, bridge_env)
    DO UPDATE SET
      bridge_liquidation_address_id = EXCLUDED.bridge_liquidation_address_id,
      address                       = EXCLUDED.address,
      blockchain_memo               = EXCLUDED.blockchain_memo,
      memoless_address              = EXCLUDED.memoless_address,
      bridge_external_account_id    = EXCLUDED.bridge_external_account_id,
      state                         = EXCLUDED.state
    RETURNING *
  `
  return (rows[0] as BridgeLiquidationAddressRow) ?? null
}

// ── Off-ramp: cash-outs ──────────────────────────────────────────────────────

export interface InsertPendingCashoutInput {
  privyUserId: string
  bridgeCustomerId: string
  stellarTxHash: string
  amount: string
  currency: string
  destinationCurrency: string
}

/**
 * Reserves a cash-out row for a Stellar payment the user has already broadcast.
 *
 * The tx hash is the idempotency anchor and is always non-null — that is what
 * makes `ON CONFLICT DO NOTHING` mean anything here. (On a nullable column
 * Postgres NULLs never conflict, so the guard would silently do nothing.)
 * Returns null when a row already exists: a double-report of the same payment.
 */
export async function insertPendingCashout(
  input: InsertPendingCashoutInput,
): Promise<BridgeCashoutRow | null> {
  const rows = await sql`
    INSERT INTO ${sql(t.bridgeCashouts)} (
      privy_user_id, bridge_customer_id, stellar_tx_hash, amount, currency,
      destination_currency, status, bridge_env
    ) VALUES (
      ${input.privyUserId}, ${input.bridgeCustomerId}, ${input.stellarTxHash},
      ${input.amount}, ${input.currency}, ${input.destinationCurrency},
      'submitted', ${bridgeEnvName()}
    )
    ON CONFLICT (stellar_tx_hash) DO NOTHING
    RETURNING *
  `
  return (rows[0] as BridgeCashoutRow) ?? null
}

export async function getCashoutByTxHash(
  stellarTxHash: string,
): Promise<BridgeCashoutRow | null> {
  const rows = await sql`
    SELECT * FROM ${sql(t.bridgeCashouts)}
    WHERE stellar_tx_hash = ${stellarTxHash}
    LIMIT 1
  `
  return (rows[0] as BridgeCashoutRow) ?? null
}

export interface UpdateCashoutStatusInput {
  status: BridgeCashoutRow["status"]
  bridgeDrainId?: string | null
  fiatAmount?: string | null
  failureReason?: string | null
  completed?: boolean
}

export async function updateCashoutStatus(
  cashoutId: string,
  input: UpdateCashoutStatusInput,
): Promise<BridgeCashoutRow | null> {
  const rows = await sql`
    UPDATE ${sql(t.bridgeCashouts)} SET
      status          = ${input.status},
      bridge_drain_id = COALESCE(${input.bridgeDrainId ?? null}, bridge_drain_id),
      fiat_amount     = COALESCE(${input.fiatAmount ?? null}, fiat_amount),
      failure_reason  = ${input.failureReason ?? null},
      completed_at    = CASE WHEN ${input.completed ?? false} THEN NOW() ELSE completed_at END
    WHERE id = ${cashoutId}
    RETURNING *
  `
  return (rows[0] as BridgeCashoutRow) ?? null
}

export interface UpsertCashoutFromDrainInput {
  privyUserId: string
  bridgeCustomerId: string
  stellarTxHash: string
  bridgeDrainId: string
  amount: string
  currency: string
  fiatAmount: string | null
  destinationCurrency: string
  status: BridgeCashoutRow["status"]
  completed: boolean
}

/**
 * Webhook-side write. Usually the row already exists (our UI reported the
 * payment first) and this just advances it. It inserts when it doesn't: a user
 * can send to their liquidation address straight from an external wallet, and
 * that withdrawal is just as real — it should still show up in their history.
 */
export async function upsertCashoutFromDrain(
  input: UpsertCashoutFromDrainInput,
): Promise<BridgeCashoutRow | null> {
  const rows = await sql`
    INSERT INTO ${sql(t.bridgeCashouts)} (
      privy_user_id, bridge_customer_id, stellar_tx_hash, bridge_drain_id,
      amount, currency, fiat_amount, destination_currency, status, bridge_env,
      completed_at
    ) VALUES (
      ${input.privyUserId}, ${input.bridgeCustomerId}, ${input.stellarTxHash},
      ${input.bridgeDrainId}, ${input.amount}, ${input.currency},
      ${input.fiatAmount}, ${input.destinationCurrency}, ${input.status},
      ${bridgeEnvName()}, CASE WHEN ${input.completed} THEN NOW() ELSE NULL END
    )
    ON CONFLICT (stellar_tx_hash) DO UPDATE SET
      bridge_drain_id = EXCLUDED.bridge_drain_id,
      fiat_amount     = COALESCE(EXCLUDED.fiat_amount, ${sql(t.bridgeCashouts)}.fiat_amount),
      status          = EXCLUDED.status,
      completed_at    = CASE
                          WHEN ${input.completed} THEN NOW()
                          ELSE ${sql(t.bridgeCashouts)}.completed_at
                        END
    RETURNING *
  `
  return (rows[0] as BridgeCashoutRow) ?? null
}

export async function listCashoutsForUser(
  privyUserId: string,
  limit = 25,
): Promise<BridgeCashoutRow[]> {
  const rows = await sql`
    SELECT * FROM ${sql(t.bridgeCashouts)}
    WHERE privy_user_id = ${privyUserId}
      AND bridge_env = ${bridgeEnvName()}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  return rows as unknown as BridgeCashoutRow[]
}
