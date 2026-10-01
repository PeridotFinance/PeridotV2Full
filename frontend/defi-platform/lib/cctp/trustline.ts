/**
 * Recipient readiness for an inbound CCTP deposit.
 *
 * Why this is its own module and not just a call into `lib/stellar-trustline.ts`:
 * the trustline question is *the* hard gate of the cross-chain deposit, and it
 * has to be asked at a different moment than everywhere else in the app.
 *
 * Everywhere else a missing trustline means "the payment bounces" — annoying,
 * recoverable, the sender still has the money. Here the burn already happened on
 * the source chain: the USDC is gone from Ethereum/Base and Circle will only
 * ever mint it on Stellar. If the recipient has no trustline at that point,
 * `mint_and_forward` reverts *atomically* — nothing mints, the transfer parks at
 * the forwarder, and it stays parked until the user opens the trustline and
 * someone re-drives the relay. Nobody loses funds, but the user watches a
 * deposit hang for as long as it takes them to understand why.
 *
 * So: every surface that can start a burn asks this first, and blocks. The check
 * is deliberately cheap (one Horizon read) and deliberately fail-closed —
 * `reason: "unknown"` when Horizon can't be reached, never a hopeful `true`.
 *
 * Also preset-aware, which `lib/stellar-trustline.ts` is not: that module is
 * hardwired to mainnet Horizon because the Peridot Stellar markets are
 * mainnet-only. The CCTP transport, however, is exercised on testnet by
 * `scripts/cctp-testnet-probe.ts`, against a different USDC issuer.
 */

import { CCTP_STELLAR_ASSET } from "@/config/cctp"
import { TRUSTLINE_RESERVE_RAW } from "@/lib/stellar-trustline"

const IS_MAINNET_PRESET = (process.env.NEXT_PUBLIC_NETWORK_PRESET || "testnet").startsWith("mainnet")

/** Horizon for the active preset. Soroban RPC cannot answer trustline questions. */
export const CCTP_HORIZON_URL = IS_MAINNET_PRESET
  ? "https://horizon.stellar.org"
  : "https://horizon-testnet.stellar.org"

/** Fee headroom kept spendable so the changeTrust fee never eats the reserve. */
const FEE_BUFFER_RAW = 1_000_000 // 0.1 XLM

export type CctpRecipientBlocker =
  /** Account is not on-ledger yet — it must be created/funded before anything. */
  | "no_account"
  /** Account exists but does not trust the asset CCTP will mint. */
  | "no_trustline"
  /** Wants a trustline but cannot cover the +0.5 XLM subentry reserve. */
  | "no_reserve"
  /** Horizon unreachable. We do not know, so we do not let a burn proceed. */
  | "unknown"

export interface CctpRecipientReadiness {
  /** Safe to burn: the mint will land and the forward leg will not revert. */
  ready: boolean
  /** What stops it, or `null` when ready. */
  blocker: CctpRecipientBlocker | null
  /** The asset the recipient must trust, so callers can render code + issuer. */
  asset: { code: string; issuer: string }
  /** Raw XLM (7 decimals) missing to afford one more trustline. 0 when fine. */
  reserveShortfallRaw: number
}

interface HorizonAccount {
  balances?: { asset_type?: string; asset_code?: string; asset_issuer?: string; balance?: string }[]
  subentry_count?: number
  num_sponsoring?: number
  num_sponsored?: number
}

/**
 * Can `address` receive a CCTP mint right now?
 *
 * One Horizon read answers all three questions — existence, trustline, reserve —
 * so the deposit sheet does not fire three requests to draw one line of copy.
 *
 * The reserve arithmetic mirrors `stellarTrustlineFunding`: base reserve is two
 * entries, each subentry one more, sponsored entries are paid by someone else.
 * We only report a shortfall when the trustline is actually missing; an account
 * that already trusts the asset needs no further reserve and must not be told to
 * top up.
 */
export async function checkCctpRecipient(address: string): Promise<CctpRecipientReadiness> {
  const asset = { code: CCTP_STELLAR_ASSET.code, issuer: CCTP_STELLAR_ASSET.issuer }
  const blocked = (blocker: CctpRecipientBlocker, reserveShortfallRaw = 0) => ({
    ready: false,
    blocker,
    asset,
    reserveShortfallRaw,
  })

  let data: HorizonAccount
  try {
    const res = await fetch(`${CCTP_HORIZON_URL}/accounts/${address}`, { cache: "no-store" })
    // 404 is a real answer (no such account); anything else is us not knowing.
    if (res.status === 404) return blocked("no_account", TRUSTLINE_RESERVE_RAW)
    if (!res.ok) return blocked("unknown")
    data = (await res.json()) as HorizonAccount
  } catch {
    return blocked("unknown")
  }

  const balances = data.balances ?? []
  if (balances.some((b) => b.asset_code === asset.code && b.asset_issuer === asset.issuer)) {
    return { ready: true, blocker: null, asset, reserveShortfallRaw: 0 }
  }

  const native = balances.find((b) => b.asset_type === "native")
  const totalRaw = Math.floor(parseFloat(native?.balance ?? "0") * 1e7)
  const reserveEntries =
    2 +
    Number(data.subentry_count ?? 0) +
    Number(data.num_sponsoring ?? 0) -
    Number(data.num_sponsored ?? 0)
  const spendableRaw = Math.max(0, totalRaw - Math.max(0, reserveEntries) * TRUSTLINE_RESERVE_RAW - FEE_BUFFER_RAW)
  const shortfallRaw = Math.max(0, TRUSTLINE_RESERVE_RAW - spendableRaw)

  return shortfallRaw > 0 ? blocked("no_reserve", shortfallRaw) : blocked("no_trustline")
}

/**
 * User-facing copy for a blocker, in the app's consumer voice — no "trustline",
 * no "subentry reserve", no issuer hashes. `null` for `ready`.
 *
 * Kept next to the check rather than in the component so the API route and the
 * UI cannot describe the same blocker differently.
 */
export function describeCctpBlocker(
  blocker: CctpRecipientBlocker | null,
  shortfallRaw = 0,
): { title: string; detail: string } | null {
  switch (blocker) {
    case null:
      return null
    case "no_trustline":
      return {
        title: "Enable dollars once",
        detail:
          "Your Stellar wallet needs to accept US dollars before money can arrive. One signature, and it stays enabled.",
      }
    case "no_reserve": {
      const xlm = (shortfallRaw / 1e7).toFixed(2)
      return {
        title: "A little XLM short",
        detail: `Enabling a currency reserves a small amount of XLM on your account. You need about ${xlm} more XLM.`,
      }
    }
    case "no_account":
      return {
        title: "Wallet still being set up",
        detail: "Your Stellar wallet isn't active yet. Give it a moment and try again.",
      }
    case "unknown":
      return {
        title: "Stellar isn't responding",
        detail:
          "We can't check your wallet right now. We won't start anything that could get stuck — try again shortly.",
      }
  }
}
