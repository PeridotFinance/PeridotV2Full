import { NextRequest, NextResponse } from "next/server"
import { invalidateAccountIdentity } from "@/lib/accountIdentity"
import {
  authenticatePrivyRequest,
  fetchPrivyEmbeddedWallets,
  getOrCreateAccountId,
  upsertVerifiedEmbeddedLink,
} from "../_lib"

/**
 * Auto-link the user's Privy embedded wallets (EVM + Stellar) to a single
 * Peridot account, so leaderboard points pool across both from the first login
 * — no manual "Link" step, no signature prompt.
 *
 * Trust model: the request only needs a valid Privy bearer token. The embedded
 * addresses are read authoritatively from Privy's server (never from the
 * request body), so marking them `verified` is sound — the session proves the
 * user owns exactly these wallets. Idempotent: safe to call on every login and
 * again once the embedded Stellar wallet finishes provisioning.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticatePrivyRequest(request)
  if (auth instanceof NextResponse) return auth

  try {
    const accountId = await getOrCreateAccountId(auth.privyUserId)
    const embedded = await fetchPrivyEmbeddedWallets(auth.privyUserId)

    const linked: Array<{ namespace: string; address: string; outcome: string }> = []
    for (const w of embedded) {
      const outcome = await upsertVerifiedEmbeddedLink({
        accountId,
        namespace: w.namespace,
        address: w.address,
        normalized: w.normalized,
      })
      linked.push({ namespace: w.namespace, address: w.normalized, outcome })
    }

    // Drop cached identities for every touched address so the next leaderboard
    // read sees the merged account immediately.
    for (const w of embedded) {
      try {
        invalidateAccountIdentity(w.normalized)
      } catch {
        /* best-effort */
      }
    }

    return NextResponse.json({ success: true, accountId, linked })
  } catch (error) {
    console.error("[sync-embedded] failed:", error)
    return NextResponse.json(
      { success: false, error: "Failed to sync embedded wallets" },
      { status: 500 },
    )
  }
}
