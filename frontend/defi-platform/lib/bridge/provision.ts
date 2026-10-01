/**
 * Provisioning of a user's virtual bank account (IBAN) at Bridge.
 *
 * Extracted from the /api/bridge/virtual-account route so the webhook can run
 * the exact same code path the button runs. Two callers, one implementation:
 *   - the user taps "Set up my account" (POST /api/bridge/virtual-account)
 *   - Bridge tells us KYC + SEPA just went through (POST /api/bridge/webhook)
 * A second implementation would eventually mint a second IBAN with a different
 * destination, and an IBAN is bound to its destination for good.
 *
 * Everything here is idempotent: an existing account is reused before one is
 * created, and the create carries a stable idempotency key per
 * (user, source currency, destination currency).
 */

import { FEATURE_FLAGS } from "@/config/featureFlags"
import { getPrivyClient } from "@/lib/bridge/auth"
import { resolveStellarAddress } from "@/lib/agents/resolve-wallet"
import {
  createBridgeWallet,
  createVirtualAccount,
  listBridgeWallets,
  listVirtualAccounts,
} from "@/lib/bridge/client"
import {
  getCustomerByPrivyId,
  insertVirtualAccount,
  listVirtualAccountsByPrivyId,
  setBridgeWalletForCustomer,
  setPayoutAddressForCustomer,
  type BridgeCustomerRow,
  type BridgeVirtualAccountRow,
} from "@/lib/bridge/store"
import { hasSepaEndorsement, isKycApproved } from "@/lib/bridge/status"
import {
  ONRAMP_CURRENCY,
  ONRAMP_DESTINATION_CURRENCY,
  ONRAMP_DESTINATION_RAIL,
  ONRAMP_DIRECT_CURRENCIES,
  ONRAMP_DIRECT_MEMO,
  ONRAMP_DIRECT_RAIL,
  ONRAMP_WALLET_CHAIN,
  type OnrampDestinationCurrency,
} from "@/app/api/bridge/_state"

interface ResolvedWallet {
  id: string
  chain: string
  address: string
}

/**
 * No Stellar wallet to pay out to. Thrown rather than resolved to a fallback:
 * a virtual account is bound to its destination for good, so guessing would
 * misroute real money.
 */
export class NoDestinationWalletError extends Error {
  constructor() {
    super("No embedded Stellar wallet for this user")
    this.name = "NoDestinationWalletError"
  }
}

/**
 * The currency to provision when the caller does not name one, i.e. what the
 * automatic paths pick on the user's behalf.
 *
 * Choosing for them is safe because the choice is not exclusive: accounts are
 * keyed per (user, fiat, destination currency), so a user who later wants the
 * other stablecoin still gets a second IBAN from the manual flow. What we pick
 * here is only which one exists without being asked for.
 */
export function defaultDestinationCurrency(): OnrampDestinationCurrency {
  // Direct mode has no EUR->EURC route, so a caller that omits the field must
  // not be handed the one currency that cannot work. In managed mode the
  // default is EURC, the zero-FX option for the EU users this rail serves.
  return FEATURE_FLAGS.FIAT_ONRAMP_DIRECT_TO_WALLET
    ? ONRAMP_DIRECT_CURRENCIES[0]
    : ONRAMP_DESTINATION_CURRENCY
}

/** Whether this destination currency can be provisioned in the current mode. */
export function isDestinationCurrencySupported(
  currency: OnrampDestinationCurrency,
): boolean {
  return FEATURE_FLAGS.FIAT_ONRAMP_DIRECT_TO_WALLET
    ? ONRAMP_DIRECT_CURRENCIES.includes(currency)
    : true
}

/** Everything the onboarding gates require before an IBAN may be created. */
export function isReadyForVirtualAccount(customer: BridgeCustomerRow | null): boolean {
  return Boolean(
    customer?.bridge_customer_id &&
      isKycApproved(customer.kyc_status) &&
      hasSepaEndorsement(customer.endorsements),
  )
}

/**
 * Returns the Bridge-managed wallet for this customer, creating it on first use.
 * Idempotent — re-uses a stored wallet, or an existing one on Bridge's side,
 * before creating a new one.
 */
async function resolveBridgeWallet(
  privyUserId: string,
  customer: BridgeCustomerRow,
): Promise<ResolvedWallet> {
  if (customer.bridge_wallet_id && customer.bridge_wallet_address) {
    return {
      id: customer.bridge_wallet_id,
      chain: customer.bridge_wallet_chain ?? ONRAMP_WALLET_CHAIN,
      address: customer.bridge_wallet_address,
    }
  }
  const customerId = customer.bridge_customer_id as string
  const existing = await listBridgeWallets(customerId)
  let wallet = existing.find((w) => w.chain === ONRAMP_WALLET_CHAIN)
  if (!wallet) {
    wallet = await createBridgeWallet(
      customerId,
      ONRAMP_WALLET_CHAIN,
      `wallet-${privyUserId}-${ONRAMP_WALLET_CHAIN}`,
    )
  }
  await setBridgeWalletForCustomer(privyUserId, {
    walletId: wallet.id,
    chain: wallet.chain,
    address: wallet.address,
  })
  return { id: wallet.id, chain: wallet.chain, address: wallet.address }
}

/**
 * The user's OWN embedded Stellar wallet, used as the virtual account's payout
 * destination when {@link FEATURE_FLAGS.FIAT_ONRAMP_DIRECT_TO_WALLET} is on.
 */
async function resolveDirectWallet(privyUserId: string): Promise<ResolvedWallet> {
  const address = await resolveStellarAddress(getPrivyClient(), privyUserId)
  if (!address) throw new NoDestinationWalletError()
  return { id: `direct:${address}`, chain: ONRAMP_WALLET_CHAIN, address }
}

/**
 * Creates (or re-uses) the EUR virtual account for one customer and stores it.
 *
 * The caller is responsible for the onboarding gates — see
 * {@link isReadyForVirtualAccount} — because the two callers report a failed
 * gate very differently: the route answers with a 409 the UI routes on, the
 * webhook simply does nothing yet.
 */
export async function provisionVirtualAccount({
  privyUserId,
  customer,
  destinationCurrency,
}: {
  privyUserId: string
  customer: BridgeCustomerRow
  destinationCurrency: OnrampDestinationCurrency
}): Promise<BridgeVirtualAccountRow> {
  const bridgeCustomerId = customer.bridge_customer_id as string
  const direct = FEATURE_FLAGS.FIAT_ONRAMP_DIRECT_TO_WALLET

  // Dollar-Access step 3 — the destination the IBAN pays out to.
  //
  // Default: a Bridge-managed wallet, which then auto-forwards to the user's
  // own Stellar wallet. Behind FIAT_ONRAMP_DIRECT_TO_WALLET we skip that hop
  // and pay out to the user's wallet directly — required while our Bridge
  // account cannot create managed wallets at all.
  const wallet = direct
    ? await resolveDirectWallet(privyUserId)
    : await resolveBridgeWallet(privyUserId, customer)

  // Reuse before create. The idempotency key alone is not enough: it only
  // dedupes identical requests, so an account provisioned under any other key
  // (a past flow, an operator script) would be invisible here and we'd mint a
  // SECOND IBAN for the same user. An IBAN is bound to its destination for
  // good, so a duplicate is confusing and effectively permanent.
  const existing = (await listVirtualAccounts(bridgeCustomerId)).find(
    (a) => a.destination?.currency === destinationCurrency,
  )

  // Dollar-Access step 4 — virtual account that routes EUR deposits into it.
  const account =
    existing ??
    (await createVirtualAccount({
      customerId: bridgeCustomerId,
      sourceCurrency: ONRAMP_CURRENCY,
      // Direct mode pays the user's own account, so the rail is the chain.
      // `bridge_wallet` is the rail our production account lacks entitlement
      // for — routing around it is the entire point of this mode.
      destinationRail: direct ? ONRAMP_DIRECT_RAIL : ONRAMP_DESTINATION_RAIL,
      destinationCurrency,
      destinationAddress: wallet.address,
      // Bridge rejects a Stellar payout without a memo. Irrelevant for
      // routing here (it's the user's own account) but mandatory.
      ...(direct ? { destinationMemo: ONRAMP_DIRECT_MEMO } : {}),
      // Stable key — one per (user, source, destination). Re-tapping returns
      // the same account; switching dest currency provisions a separate one.
      idempotencyKey: `va-${privyUserId}-${ONRAMP_CURRENCY}-${destinationCurrency}`,
    }))

  const deposit = account.source_deposit_instructions ?? {}
  const row = await insertVirtualAccount({
    privyUserId,
    bridgeCustomerId,
    bridgeAccountId: account.id,
    fiatCurrency: ONRAMP_CURRENCY,
    iban: (deposit.iban as string) ?? null,
    bic: (deposit.bic as string) ?? null,
    bankName: (deposit.bank_name as string) ?? null,
    accountHolderName: (deposit.account_holder_name as string) ?? null,
    destinationRail: account.destination?.payment_rail ?? ONRAMP_DESTINATION_RAIL,
    destinationCurrency: account.destination?.currency ?? destinationCurrency,
    destinationAddress: account.destination?.address ?? wallet.address,
    destinationMemo: account.destination?.blockchain_memo ?? null,
    status: account.status ?? "activated",
  })

  // Embedded-wallet path: the user's Privy Stellar wallet is the auto-forward
  // destination. They never run link & verify (it's their own account), so we
  // wire it as the payout target here — once — so SEPA→EURC forwards to the
  // very wallet they supply from. Best-effort: a failure must not block the
  // IBAN. The matching EURC trustline is established client-side on the same
  // provisioning step (see use-bridge-onramp).
  // Not needed in direct mode: the deposit already lands in the user's own
  // wallet, so there is nothing to forward on from.
  if (
    !direct &&
    FEATURE_FLAGS.WALLET_PRIVY_STELLAR_EMBEDDED &&
    !customer.payout_stellar_address
  ) {
    try {
      const stellarAddress = await resolveStellarAddress(getPrivyClient(), privyUserId)
      if (stellarAddress) {
        await setPayoutAddressForCustomer(privyUserId, stellarAddress, true)
      }
    } catch (e) {
      console.warn("[bridge/provision] embedded payout-address wiring failed", e)
    }
  }

  return row
}

/**
 * Provisions the IBAN the moment verification completes, so a user who finishes
 * KYC finds a ready bank account instead of one more button to press.
 *
 * Best-effort by contract: every failure is swallowed after logging. The caller
 * is a webhook whose acknowledgement must not depend on this, and the manual
 * route stays as the fallback — the user can still tap "Set up my account",
 * which reuses whatever this call did or did not manage to create.
 *
 * Returns the account when one now exists (freshly created or already there),
 * null when it could not be provisioned yet.
 */
export async function ensureVirtualAccountForCustomer(
  customer: BridgeCustomerRow | null,
): Promise<BridgeVirtualAccountRow | null> {
  if (!FEATURE_FLAGS.FIAT_ONRAMP_BRIDGE) return null
  if (!isReadyForVirtualAccount(customer) || !customer) return null

  const currency = defaultDestinationCurrency()
  try {
    // Cheap local check first — this runs on every customer webhook, and an
    // already-provisioned user must not cost a Bridge round-trip each time.
    const rows = await listVirtualAccountsByPrivyId(
      customer.privy_user_id,
      ONRAMP_CURRENCY,
    )
    const known = rows.find((r) => r.destination_currency === currency)
    if (known) return known

    return await provisionVirtualAccount({
      privyUserId: customer.privy_user_id,
      customer,
      destinationCurrency: currency,
    })
  } catch (err) {
    // A user without an embedded Stellar wallet is not an error worth shouting
    // about: they simply have not opened the app on this path yet, and the
    // manual button will provision the account once they do.
    if (err instanceof NoDestinationWalletError) {
      console.info(
        "[bridge/provision] auto-provision deferred, no destination wallet yet",
        customer.privy_user_id,
      )
      return null
    }
    console.error("[bridge/provision] auto-provision failed", err)
    return null
  }
}

/**
 * Same as {@link ensureVirtualAccountForCustomer}, addressed by Privy user.
 *
 * Called from the read paths for users who were approved before auto-
 * provisioning existed (or whose webhook was never delivered): the `ready`
 * state is exactly "verified, no IBAN yet", so it exists only until this
 * succeeds and cannot turn into a cost paid on every poll.
 */
export async function ensureVirtualAccountForPrivyUser(
  privyUserId: string,
): Promise<BridgeVirtualAccountRow | null> {
  const customer = await getCustomerByPrivyId(privyUserId)
  return ensureVirtualAccountForCustomer(customer)
}
