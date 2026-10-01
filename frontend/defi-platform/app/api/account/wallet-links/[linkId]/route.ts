import { NextRequest, NextResponse } from "next/server"
import { LeaderboardDB, sql } from "@/lib/database"
import { getTableNames } from "@/lib/tableResolver"
import { LEADERBOARD_ACCOUNT_SCOPED } from "@/config/featureFlags"
import { invalidateAccountIdentity } from "@/lib/accountIdentity"
import {
  authenticatePrivyRequest,
  formatWalletLinkRow,
  getAccountIdForPrivyUser,
} from "../_lib"

function triggerAccountScopedRefresh(addressForCacheBust: string | null) {
  if (LEADERBOARD_ACCOUNT_SCOPED === 'off') return
  if (addressForCacheBust) invalidateAccountIdentity(addressForCacheBust)
  void LeaderboardDB.refreshLeaderboardAccountsMV().catch((err) => {
    console.warn('[WalletLinkMutate] MV refresh trigger failed:', (err as any)?.message)
  })
}

interface WalletLinkDbRow {
  id: number
  account_id: number
  chain_namespace: "evm" | "stellar"
  chain_reference: string | null
  address: string
  normalized_address: string
  label: string | null
  is_primary: boolean
  verification_status: string
  verification_method: string | null
  verified_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

interface PatchWalletLinkBody {
  setPrimary?: unknown
  label?: unknown
  metadata?: unknown
}

function parseLinkId(value: string): number | null {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ linkId: string }> }
) {
  try {
    const auth = await authenticatePrivyRequest(request)
    if (auth instanceof NextResponse) return auth

    const accountId = await getAccountIdForPrivyUser(auth.privyUserId)
    if (!accountId) {
      return NextResponse.json({ success: false, error: "Peridot account not found" }, { status: 404 })
    }

    const { linkId: rawLinkId } = await context.params
    const linkId = parseLinkId(rawLinkId)
    if (!linkId) {
      return NextResponse.json({ success: false, error: "Invalid linkId" }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as PatchWalletLinkBody | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 })
    }

    const t = getTableNames()
    const existingRows = (await sql`
      SELECT
        id,
        account_id,
        chain_namespace
      FROM ${sql(t.accountWalletLinks)}
      WHERE id = ${linkId}
        AND account_id = ${accountId}
      LIMIT 1
    `) as Array<{ id: number; account_id: number; chain_namespace: "evm" | "stellar" }>
    const existing = existingRows[0]
    if (!existing) {
      return NextResponse.json({ success: false, error: "Wallet link not found" }, { status: 404 })
    }

    const setPrimary = body.setPrimary === true
    const label = typeof body.label === "string" ? body.label.trim() : undefined
    const metadata =
      body.metadata && typeof body.metadata === "object"
        ? (body.metadata as Record<string, unknown>)
        : undefined

    if (setPrimary) {
      await sql`
        UPDATE ${sql(t.accountWalletLinks)}
        SET is_primary = FALSE, updated_at = NOW()
        WHERE account_id = ${accountId}
          AND chain_namespace = ${existing.chain_namespace}
      `
      await sql`
        UPDATE ${sql(t.accountWalletLinks)}
        SET is_primary = TRUE, updated_at = NOW()
        WHERE id = ${linkId}
      `
    }

    if (label !== undefined || metadata !== undefined) {
      await sql`
        UPDATE ${sql(t.accountWalletLinks)}
        SET
          label = COALESCE(${label}, label),
          metadata = COALESCE(${metadata}, metadata),
          updated_at = NOW()
        WHERE id = ${linkId}
      `
    }

    const updatedRows = (await sql`
      SELECT
        id,
        account_id,
        chain_namespace,
        chain_reference,
        address,
        normalized_address,
        label,
        is_primary,
        verification_status,
        verification_method,
        verified_at,
        metadata,
        created_at,
        updated_at
      FROM ${sql(t.accountWalletLinks)}
      WHERE id = ${linkId}
      LIMIT 1
    `) as WalletLinkDbRow[]

    // Primary change affects which wallet is shown as the account's face in
    // the leaderboard MV. Bust resolver cache and trigger an MV refresh.
    if (setPrimary) {
      triggerAccountScopedRefresh(updatedRows[0]?.normalized_address || null)
    }

    return NextResponse.json({
      success: true,
      data: formatWalletLinkRow(updatedRows[0]),
    })
  } catch (error) {
    console.error("PATCH /api/account/wallet-links/[linkId] error:", error)
    return NextResponse.json({ success: false, error: "Failed to update wallet link" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ linkId: string }> }
) {
  try {
    const auth = await authenticatePrivyRequest(request)
    if (auth instanceof NextResponse) return auth

    const accountId = await getAccountIdForPrivyUser(auth.privyUserId)
    if (!accountId) {
      return NextResponse.json({ success: false, error: "Peridot account not found" }, { status: 404 })
    }

    const { linkId: rawLinkId } = await context.params
    const linkId = parseLinkId(rawLinkId)
    if (!linkId) {
      return NextResponse.json({ success: false, error: "Invalid linkId" }, { status: 400 })
    }

    const t = getTableNames()
    const existingRows = (await sql`
      SELECT
        id,
        account_id,
        chain_namespace,
        normalized_address,
        is_primary
      FROM ${sql(t.accountWalletLinks)}
      WHERE id = ${linkId}
        AND account_id = ${accountId}
      LIMIT 1
    `) as Array<{ id: number; account_id: number; chain_namespace: "evm" | "stellar"; normalized_address: string; is_primary: boolean }>
    const existing = existingRows[0]
    if (!existing) {
      return NextResponse.json({ success: false, error: "Wallet link not found" }, { status: 404 })
    }

    await sql`
      DELETE FROM ${sql(t.accountWalletLinks)}
      WHERE id = ${linkId}
    `

    if (existing.is_primary) {
      const fallbackRows = (await sql`
        SELECT id
        FROM ${sql(t.accountWalletLinks)}
        WHERE account_id = ${accountId}
          AND chain_namespace = ${existing.chain_namespace}
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `) as Array<{ id: number }>
      const fallback = fallbackRows[0]
      if (fallback) {
        await sql`
          UPDATE ${sql(t.accountWalletLinks)}
          SET is_primary = TRUE, updated_at = NOW()
          WHERE id = ${fallback.id}
        `
      }
    }

    // Unlinking shrinks the account's wallet set — refresh MV + bust cache.
    triggerAccountScopedRefresh(existing.normalized_address)

    return NextResponse.json({ success: true, data: { deletedId: linkId } })
  } catch (error) {
    console.error("DELETE /api/account/wallet-links/[linkId] error:", error)
    return NextResponse.json({ success: false, error: "Failed to delete wallet link" }, { status: 500 })
  }
}
