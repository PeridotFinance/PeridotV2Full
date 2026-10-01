/**
 * POST /api/margin-challenge/join — enter the trading challenge.
 *
 * What is always required is control of the Stellar address, via
 * `authorizeStellarAddress` — otherwise anyone could enter under a stranger's
 * G-address and either farm their results or, with a DQ, poison them.
 *
 * What that proof resolves to is a Peridot ACCOUNT, because scoring is per
 * account (one person with an embedded wallet plus a Freighter key is one
 * competitor). Two credentials can produce one:
 *   1. A verified Privy session — the DID resolves to the account directly, and
 *      wins whenever it is present, so a Privy user never splits in two.
 *   2. The Stellar-wallet session cookie alone. A "pure Freighter" trader has
 *      no Privy account and CANNOT get one for this key — Privy holds no
 *      external Stellar wallets — so requiring a DID here locked them out of
 *      entering a competition they could otherwise trade in. Their proven
 *      address becomes a wallet-only account instead (lib/challenge/db.ts),
 *      which a later Privy sign-up absorbs rather than collides with.
 *
 * The handle is validated here rather than at render time: it becomes a public
 * label on a page we point outsiders at, and the unique index is per challenge.
 */
import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { getChallenge } from "@/config/challenges"
import { authorizeStellarAddress } from "@/lib/stellar/wallet-auth"
import { getPrivyClient } from "@/lib/bridge/auth"
import { validateHandle, fallbackHandle } from "@/lib/challenge/handles"
import { getOrCreateAccountId } from "@/app/api/account/wallet-links/_lib"
import {
  adoptStellarAddressIntoAccount,
  ensureChallengeRow,
  getAccountIdForPrivyDid,
  getOrCreateWalletOnlyAccountId,
  getParticipant,
  getUsernameForAccount,
  isHandleTaken,
  upsertParticipant,
} from "@/lib/challenge/db"
import { sql } from "@/lib/database"
import { getTableNames } from "@/lib/tableResolver"
import type { ChallengeJoinRequest, ChallengeJoinResponse } from "@/types/challenge"

export const runtime = "nodejs"

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.MARGIN_TRADING_CHALLENGES) {
    return NextResponse.json({ error: "not_enabled" }, { status: 404 })
  }

  let body: Partial<ChallengeJoinRequest> = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" } as ChallengeJoinResponse, { status: 400 })
  }

  const def = getChallenge(body.slug || "")
  if (!def) {
    return NextResponse.json({ ok: false, error: "unknown_challenge" } as ChallengeJoinResponse, { status: 404 })
  }
  // Joining after the bell would put a zero row on a finished board; joining
  // before the gun is fine — signups open early on purpose.
  if (new Date(def.endsAt) <= new Date()) {
    return NextResponse.json({ ok: false, error: "challenge_over" } as ChallengeJoinResponse, { status: 400 })
  }

  const address = (body.address || "").toUpperCase()
  if (!STELLAR_ADDRESS_RE.test(address)) {
    return NextResponse.json({ ok: false, error: "invalid_address" } as ChallengeJoinResponse, { status: 400 })
  }

  // The proof: control of the trading address. Nothing below runs without it.
  const auth = await authorizeStellarAddress(req, address)
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } as ChallengeJoinResponse, { status: auth.status })
  }

  // A Privy session, when there is one. Read independently of `auth.method`:
  // authorizeStellarAddress checks the cheap cookie first and stops there, so a
  // Privy user who also holds a wallet session would otherwise be sent down the
  // wallet-only path and end up as a second identity.
  let privyUserId: string | undefined
  const authHeader = req.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const claims = await getPrivyClient().verifyAuthToken(authHeader.slice(7))
      privyUserId = claims?.userId
    } catch {
      /* an expired bearer is not fatal — the address proof already stands */
    }
  }

  const wantsHandle = typeof body.handle === "string" && body.handle.trim().length > 0
  let handle = wantsHandle ? body.handle!.trim() : fallbackHandle(address)
  if (wantsHandle) {
    const check = validateHandle(handle)
    if (!check.ok) {
      return NextResponse.json({ ok: false, error: check.error } as ChallengeJoinResponse, { status: 400 })
    }
  }

  try {
    // The address is proven at this point (see above), which is the same
    // standard the wallet-links route demands — so a Privy session that has no
    // account row yet gets one here, and the proven address is linked to the
    // Privy account automatically. Before this the route answered 409 for a
    // fresh login and 403 (`address_not_owned`) for a Freighter key next to a
    // Privy login; both read to the user as "the site doesn't recognise my
    // wallet", and nothing short of finding the settings page fixed it.
    let accountId: number | null = null
    if (privyUserId) {
      accountId = (await getAccountIdForPrivyDid(privyUserId)) ?? (await getOrCreateAccountId(privyUserId))
      const adopted = await adoptStellarAddressIntoAccount(accountId, address)
      if (adopted === "collision") {
        // Another real account verifiably owns this key. Enter under that one
        // rather than forking — the proof is of the address, not the login.
        accountId = await getOrCreateWalletOnlyAccountId(address)
      }
    } else {
      accountId = await getOrCreateWalletOnlyAccountId(address)
    }

    // No name typed → default to the leaderboard username rather than the
    // truncated address, so the same person is the same name on both boards.
    // The trading address's own profile wins over other linked wallets'.
    if (!wantsHandle && accountId) {
      try {
        const t = getTableNames()
        const own = (await sql`
          SELECT username FROM ${sql(t.userProfiles)}
          WHERE wallet_address = ${address.toLowerCase()} AND username IS NOT NULL
          LIMIT 1
        `) as unknown as Array<{ username: string }>
        const username = own[0]?.username ?? (await getUsernameForAccount(accountId, address))
        // Legacy usernames may predate the shared rules; only adopt one the
        // challenge would accept, and never let a defaulted name cause a 409.
        if (username && validateHandle(username).ok) handle = username
      } catch {
        /* profile lookup is a nicety — the fallback handle still works */
      }
    }
    const challenge = await ensureChallengeRow(def)

    // Re-joining with the handle you already hold must not 409 on your own row.
    const existing = await getParticipant(challenge.id, accountId)
    if (existing?.disqualified) {
      return NextResponse.json({ ok: false, error: "disqualified" } as ChallengeJoinResponse, { status: 403 })
    }
    if (!existing || existing.handle.toLowerCase() !== handle.toLowerCase()) {
      if (await isHandleTaken(challenge.id, handle)) {
        // A name the user actually typed must bounce loudly; a name we merely
        // defaulted from their leaderboard profile quietly steps aside instead
        // of blocking the join with an error about a name they never entered.
        if (wantsHandle) {
          return NextResponse.json({ ok: false, error: "handle_taken" } as ChallengeJoinResponse, { status: 409 })
        }
        handle = fallbackHandle(address)
      }
    }

    const row = await upsertParticipant({
      challengeId: challenge.id,
      accountId,
      stellarAddress: address,
      handle,
      feedOptIn: Boolean(body.feedOptIn),
    })

    const res: ChallengeJoinResponse = { ok: true, handle: row.handle }
    return NextResponse.json(res)
  } catch (e) {
    // The unique indexes are the real arbiter — a race between two tabs lands
    // here rather than producing a duplicate handle.
    const msg = String((e as { message?: string })?.message || "")
    if (msg.includes("idx_challenge_participants_handle")) {
      return NextResponse.json({ ok: false, error: "handle_taken" } as ChallengeJoinResponse, { status: 409 })
    }
    console.error("[challenge/join] failed:", e)
    return NextResponse.json({ ok: false, error: "join_failed" } as ChallengeJoinResponse, { status: 500 })
  }
}
