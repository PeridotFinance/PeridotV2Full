/**
 * The funder's side of `lib/stellar-funder/policy.ts`: reading the ledger and
 * sending the XLM. Server only, it holds `STELLAR_FUNDER_SECRET`.
 */
import { stellarSorobanMainnetContracts } from "@/config/contracts"
import {
  decideFunding,
  funderConfigFromEnv,
  funderHealth,
  STROOPS_PER_XLM,
  type AccountSnapshot,
  type FunderConfig,
  type FunderHealth,
  type FundingDecision,
} from "@/lib/stellar-funder/policy"

export const HORIZON_URL = "https://horizon.stellar.org"
const FETCH_TIMEOUT_MS = 10_000
/** Payments read per wallet when looking for the last top-up. */
const HISTORY_PAGE = 200
const HISTORY_MAX_PAGES = 3

export class HorizonUnavailable extends Error {}

async function horizonGet(path: string): Promise<Response> {
  try {
    return await fetch(path.startsWith("http") ? path : `${HORIZON_URL}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (e) {
    throw new HorizonUnavailable(e instanceof Error ? e.message : "horizon request failed")
  }
}

const toRaw = (amount: string | undefined) => Math.round(Number(amount ?? "0") * STROOPS_PER_XLM)

/**
 * The account as the ledger knows it, or null when it does not exist. Anything
 * other than a clean answer throws: "could not read" must never be taken for
 * "not there", or a slow Horizon would make the funder pay for wallets twice.
 */
export async function readAccount(address: string): Promise<AccountSnapshot | null> {
  const res = await horizonGet(`/accounts/${address}`)
  if (res.status === 404) return null
  if (!res.ok) throw new HorizonUnavailable(`horizon answered ${res.status}`)
  const j = (await res.json()) as {
    subentry_count?: number
    num_sponsoring?: number
    num_sponsored?: number
    balances?: Array<{ asset_type: string; balance: string; selling_liabilities?: string }>
  }
  const native = j.balances?.find((b) => b.asset_type === "native")
  return {
    balanceRaw: toRaw(native?.balance),
    subentries: j.subentry_count ?? 0,
    numSponsoring: j.num_sponsoring ?? 0,
    numSponsored: j.num_sponsored ?? 0,
    sellingLiabilitiesRaw: toRaw(native?.selling_liabilities),
  }
}

/**
 * When the funder last topped this wallet up, looking back `days`. Reads the
 * wallet's own payment history, newest first, and stops at the window's edge.
 * A history too long to read to that edge answers "unknown".
 */
export async function lastRefillAt(address: string, funder: string, days: number): Promise<Date | null | "unknown"> {
  const edge = Date.now() - days * 86_400_000
  let url: string | null = `/accounts/${address}/payments?order=desc&limit=${HISTORY_PAGE}`
  for (let page = 0; page < HISTORY_MAX_PAGES && url; page++) {
    const res = await horizonGet(url)
    if (!res.ok) throw new HorizonUnavailable(`horizon answered ${res.status}`)
    const j = (await res.json()) as {
      _embedded?: { records?: Array<Record<string, string>> }
      _links?: { next?: { href?: string } }
    }
    const records = j._embedded?.records ?? []
    for (const r of records) {
      const at = new Date(r.created_at)
      if (at.getTime() < edge) return null
      if (r.type === "payment" && r.asset_type === "native" && r.from === funder && r.to === address) return at
    }
    if (records.length < HISTORY_PAGE) return null
    url = j._links?.next?.href ?? null
  }
  return "unknown"
}

export function funderPublicKey(Sdk: typeof import("@stellar/stellar-sdk"), secret: string): string {
  return Sdk.Keypair.fromSecret(secret).publicKey()
}

export interface FunderStatus extends FunderHealth {
  address: string
  balanceRaw: number
  config: FunderConfig
}

export async function readFunderStatus(secret: string): Promise<FunderStatus> {
  const Sdk = await import("@stellar/stellar-sdk")
  const address = funderPublicKey(Sdk, secret)
  const account = await readAccount(address)
  if (!account) throw new HorizonUnavailable("the funder account does not exist on the ledger")
  const config = funderConfigFromEnv()
  return { address, balanceRaw: account.balanceRaw, config, ...funderHealth(account, config) }
}

export type FundingOutcome =
  | { funded: true; kind: "create" | "refill"; amountRaw: number; hash: string }
  | { funded: false; kind: "none"; reason: Extract<FundingDecision, { action: "none" }>["reason"] }

/**
 * Create the wallet or top it up, whichever the policy calls for. Nothing is
 * signed unless the funder can pay for it.
 */
export async function fundWallet(address: string, secret: string): Promise<FundingOutcome> {
  const Sdk = await import("@stellar/stellar-sdk")
  const keypair = Sdk.Keypair.fromSecret(secret)
  const funderAddress = keypair.publicKey()
  const config = funderConfigFromEnv()

  const [wallet, funder] = await Promise.all([readAccount(address), readAccount(funderAddress)])
  if (!funder) throw new HorizonUnavailable("the funder account does not exist on the ledger")

  // The history is only worth reading for a wallet that is actually low.
  const probe = decideFunding({ wallet, funder, lastRefillAt: null, now: new Date(), config })
  const last = probe.action === "refill" ? await lastRefillAt(address, funderAddress, config.refillEveryDays) : null
  const decision = decideFunding({ wallet, funder, lastRefillAt: last, now: new Date(), config })
  if (decision.action === "none") return { funded: false, kind: "none", reason: decision.reason }

  const amount = (decision.amountRaw / STROOPS_PER_XLM).toFixed(7)
  const horizon = new Sdk.Horizon.Server(HORIZON_URL)
  const source = await horizon.loadAccount(funderAddress)
  const tx = new Sdk.TransactionBuilder(source, {
    fee: String(Number(Sdk.BASE_FEE) * 100),
    networkPassphrase: stellarSorobanMainnetContracts.networkPassphrase,
  })
    .addOperation(
      decision.action === "create"
        ? Sdk.Operation.createAccount({ destination: address, startingBalance: amount })
        : Sdk.Operation.payment({ destination: address, asset: Sdk.Asset.native(), amount }),
    )
    .setTimeout(60)
    .build()
  tx.sign(keypair)

  try {
    const res = await horizon.submitTransaction(tx)
    return { funded: true, kind: decision.action, amountRaw: decision.amountRaw, hash: res.hash }
  } catch (e) {
    const ops =
      (e as { response?: { data?: { extras?: { result_codes?: { operations?: string[] } } } } })?.response?.data
        ?.extras?.result_codes?.operations ?? []
    // Two calls for one new wallet: the other one won, which is fine.
    if (ops.includes("op_already_exists")) return { funded: false, kind: "none", reason: "already_funded" }
    if (ops.includes("op_underfunded")) return { funded: false, kind: "none", reason: "funder_depleted" }
    throw e
  }
}
