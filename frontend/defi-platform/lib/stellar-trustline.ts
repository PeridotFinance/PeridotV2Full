/**
 * Classic-asset trustline management for the user's Stellar wallet.
 *
 * Why this exists: on Stellar every non-native asset (EURC, USDC, …) is issued
 * by an account, and a wallet can only **receive or hold** such an asset after
 * it opens a *trustline* to that issuer (a signed `changeTrust` op). The native
 * asset XLM needs none. So a freshly-provisioned Privy embedded Stellar wallet
 * can hold XLM out of the box, but EURC/USDC sent to it will bounce with
 * "no trustline" until we establish one.
 *
 * Two consumers:
 *   1. The Bridge fiat on-ramp — SEPA → EURC settles into a Bridge custodial
 *      wallet and auto-forwards to the user's embedded wallet, which must hold
 *      the EURC trustline first.
 *   2. The deposit flow — when a user opens Deposit on a classic Stellar market
 *      (EURC/USDC) we make sure their wallet can receive that asset.
 *
 * Signing routes through the same registry the lending flow uses
 * (`signStellarXdr` → Privy raw-sign for the embedded wallet, Stellar Wallets
 * Kit for external wallets — selected by address). The account must already
 * exist on-ledger and clear the reserve; Phase-A funding handles that for
 * embedded wallets. Each trustline adds one subentry → +0.5 XLM locked reserve.
 */

import { signStellarXdr } from "@/lib/stellar-signer"
import { stellarSorobanMainnetContracts } from "@/config/contracts"
import { describePaymentFailure, extractResultCodes } from "@/lib/stellar-payment"

const HORIZON_URL = "https://horizon.stellar.org"

/** Raw XLM (7-decimal) a single trustline subentry locks on-ledger — 0.5 XLM. */
export const TRUSTLINE_RESERVE_RAW = 5_000_000
/** Fee headroom kept spendable so the changeTrust fee never eats the reserve. */
const FEE_BUFFER_RAW = 1_000_000 // 0.1 XLM

/** A classic (issued) Stellar asset: 4/12-char code + issuer G-address. */
export interface StellarClassicAsset {
  code: string
  issuer: string
}

interface HorizonBalance {
  asset_code?: string
  asset_issuer?: string
}

/**
 * Resolve the classic asset that backs a Stellar market id, or `null` when the
 * market needs no trustline (native XLM) or isn't a known classic asset.
 *
 * Data-driven off `classicAssets` so adding a future classic market (e.g. a new
 * stablecoin) only needs an entry there plus its `…-stellar` market id — no
 * change here. XLM is native, never appears in `classicAssets`, → `null`.
 */
export function stellarClassicAssetForId(assetId: string): StellarClassicAsset | null {
  const m = /^([a-z0-9]+)-stellar$/.exec(assetId)
  if (!m) return null
  const symbol = m[1].toUpperCase()
  const assets = stellarSorobanMainnetContracts.classicAssets as Record<
    string,
    StellarClassicAsset
  >
  return assets[symbol] ?? null
}

/** True when `address` already trusts the given classic asset. */
export async function stellarHasTrustline(
  address: string,
  code: string,
  issuer: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${address}`, { cache: "no-store" })
    if (!res.ok) return false
    const data = (await res.json()) as { balances?: HorizonBalance[] }
    return (data.balances ?? []).some(
      (b) => b.asset_code === code && b.asset_issuer === issuer,
    )
  } catch {
    return false
  }
}

/**
 * Whether `address` can afford to open one more trustline right now.
 *
 * Every trustline locks a +0.5 XLM subentry reserve, and the changeTrust tx
 * needs a little XLM for its fee. A wallet seeded with just enough XLM for its
 * first trustline (the funder mints a flat starting balance) therefore hits a
 * hard `op_low_reserve` on the *second* one. We check this before signing so the
 * UI can offer a top-up instead of submitting a doomed transaction.
 *
 * `spendableRaw` is the XLM free above the current reserve + fee buffer;
 * `canAfford` is true when that clears one more subentry reserve. `exists` is
 * false when the account isn't on-ledger yet (a fresh embedded wallet before the
 * funder runs) — the caller funds first, then re-checks.
 */
export async function stellarTrustlineFunding(address: string): Promise<{
  exists: boolean
  spendableRaw: number
  shortfallRaw: number
  canAfford: boolean
}> {
  const miss = { exists: false, spendableRaw: 0, shortfallRaw: TRUSTLINE_RESERVE_RAW, canAfford: false }
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${address}`, { cache: "no-store" })
    if (!res.ok) return miss // 404 → account not created yet
    const data = (await res.json()) as {
      balances?: { asset_type?: string; balance?: string }[]
      subentry_count?: number
      num_sponsoring?: number
      num_sponsored?: number
    }
    const native = (data.balances ?? []).find((b) => b.asset_type === "native")
    const totalRaw = Math.floor(parseFloat(native?.balance ?? "0") * 1e7)
    const reserveEntries =
      2 + Number(data.subentry_count ?? 0) + Number(data.num_sponsoring ?? 0) - Number(data.num_sponsored ?? 0)
    const reserveRaw = Math.max(0, reserveEntries) * TRUSTLINE_RESERVE_RAW
    const spendableRaw = Math.max(0, totalRaw - reserveRaw - FEE_BUFFER_RAW)
    const shortfallRaw = Math.max(0, TRUSTLINE_RESERVE_RAW - spendableRaw)
    return { exists: true, spendableRaw, shortfallRaw, canAfford: spendableRaw >= TRUSTLINE_RESERVE_RAW }
  } catch {
    return miss
  }
}

/**
 * Ensure `address` trusts the given classic asset. Idempotent — returns
 * `"exists"` when the trustline is already present, otherwise the submit hash.
 * Signs via the registry, so the embedded path only works for the registered
 * embedded address; external wallets sign through the kit.
 *
 * The account must be funded/created on-ledger first (Phase-A funder handles it
 * for embedded wallets) and clear the extra +0.5 XLM subentry reserve.
 */
export async function stellarEstablishTrustline(
  address: string,
  asset: StellarClassicAsset,
): Promise<string> {
  if (await stellarHasTrustline(address, asset.code, asset.issuer)) return "exists"

  const Sdk = await import("@stellar/stellar-sdk")
  const passphrase = stellarSorobanMainnetContracts.networkPassphrase
  const server = new Sdk.Horizon.Server(HORIZON_URL)

  const account = await server.loadAccount(address)
  const sdkAsset = new Sdk.Asset(asset.code, asset.issuer)

  const tx = new Sdk.TransactionBuilder(account, {
    fee: String(Number(Sdk.BASE_FEE) * 100),
    networkPassphrase: passphrase,
  })
    .addOperation(Sdk.Operation.changeTrust({ asset: sdkAsset }))
    .setTimeout(120)
    .build()

  const { signedTxXdr } = await signStellarXdr(tx.toXDR(), {
    networkPassphrase: passphrase,
    address,
  })
  const signed = Sdk.TransactionBuilder.fromXDR(signedTxXdr, passphrase)
  try {
    const res = await server.submitTransaction(
      signed as Parameters<typeof server.submitTransaction>[0],
    )
    return res.hash
  } catch (submitErr) {
    // Horizon rejects (op_low_reserve / tx_insufficient_balance for want of the
    // subentry reserve) throw an SDK error whose `.message` is opaque ("Request
    // failed with status code 400"). Map the real result codes to human copy so
    // the toast tells the user to add XLM, not something they can't act on.
    const codes = extractResultCodes(submitErr)
    if (codes) throw new Error(describePaymentFailure(codes))
    throw submitErr
  }
}

// ─── EURC convenience wrappers ──────────────────────────────────────────────
// Kept as named exports because the Bridge on-ramp imports them directly.

const EURC = stellarSorobanMainnetContracts.classicAssets.EURC

/** True when `address` already trusts the canonical classic EURC asset. */
export function stellarHasEurcTrustline(address: string): Promise<boolean> {
  return stellarHasTrustline(address, EURC.code, EURC.issuer)
}

/** Ensure the wallet trusts classic EURC. See {@link stellarEstablishTrustline}. */
export function stellarEstablishEurcTrustline(address: string): Promise<string> {
  return stellarEstablishTrustline(address, EURC)
}

const USDC = stellarSorobanMainnetContracts.classicAssets.USDC

/**
 * Ensure the wallet trusts whichever stablecoin an on-ramp deposit will arrive
 * as. Direct-to-wallet SEPA deposits settle in USDC, the managed-wallet flow
 * forwards EURC — sending either to an account without the matching trustline
 * bounces the payment, so this must follow the destination currency and not a
 * hardcoded asset.
 */
export function stellarEstablishOnrampTrustline(
  address: string,
  destinationCurrency: "eurc" | "usdc",
): Promise<string> {
  return stellarEstablishTrustline(address, destinationCurrency === "usdc" ? USDC : EURC)
}
