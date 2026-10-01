/**
 * The one-time test-money grant behind the margin onboarding faucet.
 *
 * Server-only (DB + Soroban reads). The client mints the mock-USDT itself — the
 * token's `mint` is open on testnet, so there is no secret to protect here. What
 * this module protects is FAIRNESS: without it, `needsSetup` (wallet + margin
 * balance == 0) offered another 250 USDT to anyone who had traded their stack to
 * zero, so the challenge leaderboard ranked whoever refilled most often.
 *
 * One grant per account, for the account's lifetime. "Account" is resolved the
 * same way the challenge resolves it (`lib/challenge/db.ts`), so a second wallet
 * under the same Peridot account does not get a second stack; the address is
 * keyed separately so a second Peridot account on the same wallet doesn't either.
 *
 * Retry, without a refill loophole: a reserved-but-failed run (the mint reverted,
 * the tab closed mid-flow) must not burn the grant, so an existing row can be
 * re-used — but ONLY while we can see on-chain that no funds ever landed, and at
 * most RETRY_LIMIT times. `hasFunds` looks at wallet + vault pTokens + margin
 * custody together, because the successful path leaves the money in the last of
 * those three and zero in the first.
 */
import * as S from "@stellar/stellar-sdk"
import { sql } from "@/lib/database"
import { STELLAR_MARGIN_CONFIG as CFG } from "@/app/app/margin/config/stellarMarginConfig"
import { getAccountIdForPrivyDid, getAccountIdForStellarAddress } from "@/lib/challenge/db"

/** Raw base units of one grant (250 USDT at 7 decimals). Built by multiplication —
 *  bigint `**` needs a higher tsconfig target than this project sets. */
export const FAUCET_GRANT_UNITS = BigInt(
  Math.round(CFG.constants.FAUCET_GRANT_USDT * 10 ** CFG.assets.MOCK_USDT.decimals),
)

const NETWORK = "testnet"

/** How often a reserved-but-never-funded grant may be retried before we stop.
 *  Bounds a client that reserves in a loop without ever completing the mint. */
const RETRY_LIMIT = 5

export type FaucetDenyReason = "already_claimed" | "retry_limit"

export interface FaucetClaimResult {
  granted: boolean
  /** Raw units the caller may mint — 0 when denied. */
  amountUnits: bigint
  reason?: FaucetDenyReason
}

interface ClaimRow {
  id: number
  account_key: string
  attempts: number
}

// ── Identity ─────────────────────────────────────────────────────────────────

/**
 * The key one grant is spent against. Prefers the Peridot account (so every
 * wallet the user has linked shares a single stack), and falls back to whichever
 * credential the request actually proved. Never falls back to something the
 * caller merely asserted — the address here has already been ownership-checked
 * by `authorizeStellarAddress`.
 */
export async function resolveFaucetAccountKey(
  address: string,
  privyUserId?: string | null,
): Promise<string> {
  try {
    if (privyUserId) {
      const id = await getAccountIdForPrivyDid(privyUserId)
      if (id) return `account:${id}`
    }
    const byWallet = await getAccountIdForStellarAddress(address)
    if (byWallet) return `account:${byWallet}`
  } catch (e) {
    // A lookup failure must not hand out a second grant, but it must not block a
    // first one either — fall through to the credential-scoped key, which is
    // still unique per user (just not shared across their wallets).
    console.error("[margin/faucet-claim] account lookup failed:", e)
  }
  return privyUserId ? `privy:${privyUserId}` : `stellar:${address.toUpperCase()}`
}

// ── On-chain: did this wallet ever actually receive the grant? ────────────────

async function simulateRead(contractId: string, method: string, args: S.xdr.ScVal[]): Promise<unknown> {
  const rpc = new S.rpc.Server(CFG.network.rpcUrl)
  const dummy = new S.Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0")
  const tx = new S.TransactionBuilder(dummy, { fee: "10000", networkPassphrase: CFG.network.networkPassphrase })
    .addOperation(new S.Contract(contractId).call(method, ...args))
    .setTimeout(120)
    .build()
  const sim = await rpc.simulateTransaction(await rpc.prepareTransaction(tx))
  if (!S.rpc.Api.isSimulationSuccess(sim)) throw new Error(`read ${method} failed`)
  return S.scValToNative(sim.result!.retval)
}

const toBig = (v: unknown): bigint => {
  try {
    return BigInt(String(v ?? 0))
  } catch {
    return BigInt(0)
  }
}

/**
 * True when the address holds mock-USDT anywhere the funding flow can leave it,
 * or has already traded. Any of these is proof the grant was really delivered,
 * which is what turns a reserved row into a spent one.
 *
 * Throws are treated as "yes, funded" by the caller: an RPC hiccup must not be a
 * free refill.
 */
async function hasReceivedFunds(address: string): Promise<boolean> {
  const usdt = CFG.assets.MOCK_USDT
  const addr = S.Address.fromString(address).toScVal()
  const [wallet, ptokens, margin] = await Promise.all([
    simulateRead(usdt.token, "balance", [addr]).then(toBig),
    simulateRead(usdt.vault, "get_ptoken_balance", [addr]).then(toBig),
    simulateRead(CFG.contracts.marginController, "get_margin_balance_ptokens", [
      addr,
      S.Address.fromString(usdt.token).toScVal(),
    ]).then(toBig),
  ])
  return wallet + ptokens + margin > BigInt(0)
}

/** Has this wallet ever traded? A closed-out trader has zero balances but is
 *  obviously not a fresh account — the journal is the memory the chain lacks. */
async function hasTraded(address: string): Promise<boolean> {
  const rows = (await sql`
    SELECT 1 FROM margin_stellar_trades
    WHERE upper(user_address) = ${address.toUpperCase()} AND network = ${NETWORK}
    LIMIT 1
  `) as unknown as unknown[]
  return rows.length > 0
}

// ── Claim ────────────────────────────────────────────────────────────────────

async function findClaim(accountKey: string, address: string): Promise<ClaimRow | null> {
  const rows = (await sql`
    SELECT id, account_key, attempts
    FROM margin_faucet_claims
    WHERE network = ${NETWORK}
      AND (account_key = ${accountKey} OR upper(stellar_address) = ${address.toUpperCase()})
    ORDER BY claimed_at ASC
    LIMIT 1
  `) as unknown as ClaimRow[]
  return rows[0] ?? null
}

/** Whether a fresh run WOULD be granted, without spending anything. Drives the
 *  UI: a capped account is never shown the faucet at all (it gets the ordinary
 *  "add collateral" path instead), rather than a button that 409s. */
export async function faucetClaimAvailable(accountKey: string, address: string): Promise<boolean> {
  const existing = await findClaim(accountKey, address)
  if (existing && existing.attempts >= RETRY_LIMIT) return false
  // The `everFunded` test is applied with OR without a row on purpose. This table
  // starts empty on a live app whose traders have long since had their 250 — if a
  // missing row alone meant "never claimed", switching this on would have handed
  // every existing account one more stack. Their on-chain balance and their trade
  // history say otherwise, and that is the same evidence that makes a failed
  // reservation retryable. So no backfill script exists, and none is needed.
  return !(await everFunded(address))
}

/** Funded on-chain, or funded-and-spent (traded) per the journal. RPC failure
 *  answers "yes" — see hasReceivedFunds. */
async function everFunded(address: string): Promise<boolean> {
  try {
    if (await hasReceivedFunds(address)) return true
  } catch (e) {
    console.error("[margin/faucet-claim] balance read failed, treating as funded:", e)
    return true
  }
  try {
    return await hasTraded(address)
  } catch (e) {
    console.error("[margin/faucet-claim] journal read failed, treating as funded:", e)
    return true
  }
}

/**
 * Spend the account's one grant. Returns the amount the client may mint, or a
 * reason it may not. Idempotent for a run that reserved and then failed before
 * any funds landed (bounded by RETRY_LIMIT).
 */
export async function claimFaucetGrant(accountKey: string, address: string): Promise<FaucetClaimResult> {
  const existing = await findClaim(accountKey, address)

  if (existing && existing.attempts >= RETRY_LIMIT) {
    return { granted: false, amountUnits: BigInt(0), reason: "retry_limit" }
  }
  // Funded already — whether or not this table has ever heard of them (see
  // faucetClaimAvailable for why the row is not the only evidence).
  if (await everFunded(address)) {
    return { granted: false, amountUnits: BigInt(0), reason: "already_claimed" }
  }

  if (existing) {
    await sql`
      UPDATE margin_faucet_claims
      SET attempts = attempts + 1, updated_at = NOW()
      WHERE id = ${existing.id}
    `
    return { granted: true, amountUnits: FAUCET_GRANT_UNITS }
  }

  try {
    await sql`
      INSERT INTO margin_faucet_claims (account_key, stellar_address, amount_units, network)
      VALUES (${accountKey}, ${address}, ${String(FAUCET_GRANT_UNITS)}, ${NETWORK})
    `
  } catch (e) {
    // Lost a race against a concurrent reserve for the same account/address (the
    // unique indexes). The other request is handing out the same single grant,
    // so this one is a duplicate, not a second stack.
    if (String((e as { code?: string })?.code) === "23505") {
      return { granted: false, amountUnits: BigInt(0), reason: "already_claimed" }
    }
    throw e
  }
  return { granted: true, amountUnits: FAUCET_GRANT_UNITS }
}
