/**
 * Reads the EURC and USDC balances of a Bridge-managed Stellar wallet via
 * Horizon. The Bridge-custodial wallet is a single Stellar account — both
 * stablecoins live on it side-by-side once their respective trustlines exist.
 *
 * Bridge's sandbox virtual accounts settle into a Stellar **mainnet** address
 * (the sandbox is about KYC/IBAN simulation, not ledger separation), so we use
 * the same Horizon URL + issuer config as the rest of the Stellar code path.
 * Returns 0 for any failure — a fresh Bridge wallet with no trustline or no
 * funding is correctly surfaced as "€0.00" / "$0.00" in the UI.
 */

import { stellarSorobanMainnetContracts } from "@/config/contracts"

const HORIZON_URL = "https://horizon.stellar.org"
const EURC = stellarSorobanMainnetContracts.classicAssets.EURC
const USDC = stellarSorobanMainnetContracts.classicAssets.USDC

interface HorizonBalance {
  balance: string
  asset_type: string
  asset_code?: string
  asset_issuer?: string
}

interface HorizonAccount {
  balances?: HorizonBalance[]
}

const STELLAR_ADDR_RE = /^G[A-Z2-7]{55}$/

export function isLikelyStellarAddress(addr: string | null | undefined): addr is string {
  return typeof addr === "string" && STELLAR_ADDR_RE.test(addr)
}

async function fetchBalances(address: string): Promise<HorizonBalance[]> {
  const res = await fetch(`${HORIZON_URL}/accounts/${address}`, { cache: "no-store" })
  if (!res.ok) return []
  const data = (await res.json()) as HorizonAccount
  return data.balances ?? []
}

function pickAsset(
  balances: HorizonBalance[],
  code: string,
  issuer: string,
): number {
  const line = balances.find((b) => b.asset_code === code && b.asset_issuer === issuer)
  if (!line) return 0
  const n = Number.parseFloat(line.balance)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export interface StellarStablecoinBalances {
  eurc: number
  usdc: number
}

/** Both EURC + USDC in one Horizon round-trip — used by the balance route. */
export async function getStellarStablecoinBalances(
  address: string | null | undefined,
): Promise<StellarStablecoinBalances> {
  if (!isLikelyStellarAddress(address)) return { eurc: 0, usdc: 0 }
  try {
    const balances = await fetchBalances(address)
    return {
      eurc: pickAsset(balances, EURC.code, EURC.issuer),
      usdc: pickAsset(balances, USDC.code, USDC.issuer),
    }
  } catch {
    return { eurc: 0, usdc: 0 }
  }
}

/** Live EURC balance, kept for callers that only need euros. */
export async function getStellarEurcBalance(
  address: string | null | undefined,
): Promise<number> {
  const b = await getStellarStablecoinBalances(address)
  return b.eurc
}

/** Live USDC balance — the dollar equivalent. */
export async function getStellarUsdcBalance(
  address: string | null | undefined,
): Promise<number> {
  const b = await getStellarStablecoinBalances(address)
  return b.usdc
}
