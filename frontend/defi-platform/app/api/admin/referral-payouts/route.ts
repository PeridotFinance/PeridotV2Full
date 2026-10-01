/**
 * Ambassador payout list — the only place the program's money is handled.
 *
 *   GET  /api/admin/referral-payouts?status=earned[&format=csv]
 *   POST /api/admin/referral-payouts   { ids:[…], txHash?, note?, action? }
 *
 * Qualification books `earned` rows; a human sends the USDC on Stellar and
 * POSTs the ids back as `paid` with the transaction hash. There is deliberately
 * no server-side signing path — no scheduled job can move money, so the worst a
 * bug in the sweep can do is over-report what is owed, never over-pay it.
 *
 * `void` rows (self-referral caught at qualification) are excluded from the
 * default listing and can never be marked paid.
 *
 * Auth: the shared admin gate (x-admin-password header or the admin session
 * cookie). Fails closed when ADMIN_BLOG_PASSWORD is unset in production.
 */
import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/database"
import { isAdminRequest } from "@/lib/admin-auth"
import { AMBASSADOR_PROGRAM, REFERRAL_TABLES as T } from "@/lib/referral/ambassador"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STATUSES = new Set(["earned", "paid", "void", "all"])

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const status = (request.nextUrl.searchParams.get("status") || "earned").toLowerCase()
  if (!STATUSES.has(status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 })
  }
  const format = (request.nextUrl.searchParams.get("format") || "json").toLowerCase()

  const rows = (
    await query(
      `SELECT w.id,
              w.referral_id,
              w.role,
              w.beneficiary_wallet_address,
              w.payout_address,
              w.amount_usd,
              w.payout_asset,
              w.payout_network,
              w.status,
              w.qualified_at,
              w.paid_at,
              w.payout_tx_hash,
              w.note,
              r.referrer_wallet_address,
              r.referred_wallet_address,
              r.last_supply_usd
         FROM ${T.rewards} w
         JOIN ${T.referrals} r ON r.id = w.referral_id
        WHERE ($1 = 'all' OR w.status = $1)
        ORDER BY w.qualified_at ASC, w.id ASC`,
      [status]
    )
  ).rows as any[]

  if (format === "csv") {
    const header = [
      "reward_id",
      "referral_id",
      "role",
      "beneficiary",
      "payout_address",
      "amount_usd",
      "asset",
      "network",
      "status",
      "qualified_at",
      "paid_at",
      "tx_hash",
      "note",
    ]
    const body = rows.map((r) =>
      [
        r.id,
        r.referral_id,
        r.role,
        r.beneficiary_wallet_address,
        r.payout_address,
        r.amount_usd,
        r.payout_asset,
        r.payout_network,
        r.status,
        r.qualified_at ? new Date(r.qualified_at).toISOString() : "",
        r.paid_at ? new Date(r.paid_at).toISOString() : "",
        r.payout_tx_hash,
        r.note,
      ]
        .map(csvCell)
        .join(",")
    )
    return new NextResponse([header.join(","), ...body].join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ambassador-payouts-${status}.csv"`,
        "Cache-Control": "private, no-store",
      },
    })
  }

  const totalUsd = rows.reduce((sum, r) => sum + (Number(r.amount_usd) || 0), 0)
  // A row without a payout address cannot be sent anything — surface it rather
  // than letting it sit in the list looking payable.
  const missingPayoutAddress = rows.filter((r) => !r.payout_address).length

  return NextResponse.json(
    {
      success: true,
      program: AMBASSADOR_PROGRAM,
      status,
      count: rows.length,
      totalUsd,
      missingPayoutAddress,
      rewards: rows,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: { ids?: unknown; txHash?: unknown; note?: unknown; action?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0)
    : []
  if (ids.length === 0) {
    return NextResponse.json({ error: "no_ids" }, { status: 400 })
  }

  const action = String(body.action || "paid")
  if (action !== "paid" && action !== "void") {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 })
  }

  const txHash = typeof body.txHash === "string" ? body.txHash.trim() || null : null
  const note = typeof body.note === "string" ? body.note.trim() || null : null

  if (action === "paid") {
    // Only `earned` rows can become `paid` — a re-POST of an already-settled id
    // updates nothing rather than overwriting the original payout hash.
    const updated = await query(
      `UPDATE ${T.rewards}
          SET status = 'paid',
              paid_at = NOW(),
              payout_tx_hash = COALESCE($2, payout_tx_hash),
              note = COALESCE($3, note)
        WHERE id = ANY($1::int[])
          AND status = 'earned'
        RETURNING id, beneficiary_wallet_address, amount_usd`,
      [ids, txHash, note]
    )
    return NextResponse.json({
      success: true,
      action,
      updated: updated.rows.length,
      skipped: ids.length - updated.rows.length,
      rows: updated.rows,
    })
  }

  const updated = await query(
    `UPDATE ${T.rewards}
        SET status = 'void',
            note = COALESCE($2, note)
      WHERE id = ANY($1::int[])
        AND status = 'earned'
      RETURNING id`,
    [ids, note]
  )
  return NextResponse.json({
    success: true,
    action,
    updated: updated.rows.length,
    skipped: ids.length - updated.rows.length,
  })
}
