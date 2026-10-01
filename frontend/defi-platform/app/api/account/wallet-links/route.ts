import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { getTableNames } from "@/lib/tableResolver"
import {
  authenticatePrivyRequest,
  formatWalletLinkRow,
  getAccountIdForPrivyUser,
  getOrCreateAccountId,
  normalizeLinkedWalletAddress,
  parseChainNamespace,
} from "./_lib"
import { adoptWalletOnlyAccount, findWalletOnlyOwner } from "@/lib/account/adoptWalletOnly"

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

interface WalletLinkOwnerRow {
  id: number
  account_id: number
  chain_namespace: "evm" | "stellar"
  verification_status: string
}

interface CreateWalletLinkBody {
  chainNamespace: unknown
  address: unknown
  label?: unknown
  chainReference?: unknown
  setPrimary?: unknown
  metadata?: unknown
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticatePrivyRequest(request)
    if (auth instanceof NextResponse) return auth

    const accountId = await getAccountIdForPrivyUser(auth.privyUserId)
    if (!accountId) {
      return NextResponse.json({ success: true, data: { accountId: null, links: [] } })
    }

    const t = getTableNames()
    const rows = (await sql`
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
      WHERE account_id = ${accountId}
      ORDER BY chain_namespace ASC, is_primary DESC, created_at ASC
    `) as WalletLinkDbRow[]

    return NextResponse.json({
      success: true,
      data: {
        accountId,
        links: rows.map(formatWalletLinkRow),
      },
    })
  } catch (error) {
    console.error("GET /api/account/wallet-links error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch wallet links" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticatePrivyRequest(request)
    if (auth instanceof NextResponse) return auth

    const body = (await request.json().catch(() => null)) as CreateWalletLinkBody | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 })
    }

    const chainNamespace = parseChainNamespace(body.chainNamespace)
    const rawAddress = typeof body.address === "string" ? body.address : ""
    const label = typeof body.label === "string" ? body.label.trim() : null
    const chainReference =
      typeof body.chainReference === "string" ? body.chainReference.trim() : null
    const setPrimary = Boolean(body.setPrimary)
    const metadata =
      body.metadata && typeof body.metadata === "object"
        ? (body.metadata as Record<string, unknown>)
        : {}

    if (!chainNamespace) {
      return NextResponse.json({ success: false, error: "Invalid chainNamespace" }, { status: 400 })
    }

    const normalizedAddress = normalizeLinkedWalletAddress(chainNamespace, rawAddress)
    if (!normalizedAddress) {
      return NextResponse.json({ success: false, error: "Invalid wallet address format" }, { status: 400 })
    }

    const accountId = await getOrCreateAccountId(auth.privyUserId)
    const t = getTableNames()

    const existingByAddress = (await sql`
      SELECT id, account_id, chain_namespace, verification_status
      FROM ${sql(t.accountWalletLinks)}
      WHERE chain_namespace = ${chainNamespace}
        AND normalized_address = ${normalizedAddress}
      LIMIT 1
    `) as Array<WalletLinkOwnerRow>

    let existing = existingByAddress[0]
    if (existing && Number(existing.account_id) !== accountId) {
      // The other account may be this very person's earlier wallet-only self:
      // a Freighter trader who entered the challenge before creating a Privy
      // login holds a synthetic `stellar:G…` account for exactly this address.
      // Refusing here would cost them their live entry for the crime of
      // signing up, so that account is absorbed instead.
      const walletOnlyOwner = await findWalletOnlyOwner(chainNamespace, normalizedAddress)
      if (walletOnlyOwner && walletOnlyOwner === Number(existing.account_id)) {
        await adoptWalletOnlyAccount(walletOnlyOwner, accountId)
        const rescan = (await sql`
          SELECT id, account_id, chain_namespace, verification_status
          FROM ${sql(t.accountWalletLinks)}
          WHERE chain_namespace = ${chainNamespace}
            AND normalized_address = ${normalizedAddress}
          LIMIT 1
        `) as Array<WalletLinkOwnerRow>
        existing = rescan[0]
      }
    }
    if (existing && Number(existing.account_id) !== accountId) {
      return NextResponse.json(
        { success: false, error: "Wallet is already linked to another Peridot account" },
        { status: 409 }
      )
    }

    const shouldAutoVerify = chainNamespace === "evm" && auth.evmAddressHint === normalizedAddress
    // Re-registering a link must never *downgrade* one that is already proven —
    // an adopted wallet-only link arrives verified by signature, and resetting
    // it to `pending` would quietly unhook the address from the account that
    // just absorbed it (and with it, the trader's challenge identity).
    const alreadyVerified = existing?.verification_status === "verified"
    const verificationStatus = shouldAutoVerify || alreadyVerified ? "verified" : "pending"
    const verificationMethod = shouldAutoVerify ? "privy_userid_match" : null
    const verifiedAt = shouldAutoVerify ? new Date() : null

    // Keep whatever proof the row already carries when it stays verified (an
    // adopted wallet-only link): a NULL method next to a verified status would
    // read as a verification nobody can account for.
    const keepExistingProof = alreadyVerified && !shouldAutoVerify

    let linkId: number
    if (existing) {
      linkId = Number(existing.id)
      await sql`
        UPDATE ${sql(t.accountWalletLinks)}
        SET
          chain_reference = ${chainReference},
          address = ${rawAddress},
          label = ${label},
          metadata = ${metadata},
          verification_status = ${verificationStatus},
          verification_method = ${keepExistingProof ? sql`verification_method` : sql`${verificationMethod}`},
          verified_at = ${keepExistingProof ? sql`verified_at` : sql`${verifiedAt}`},
          updated_at = NOW()
        WHERE id = ${linkId}
      `
    } else {
      const existingChainLinks = (await sql`
        SELECT COUNT(*)::int AS cnt
        FROM ${sql(t.accountWalletLinks)}
        WHERE account_id = ${accountId}
          AND chain_namespace = ${chainNamespace}
      `) as Array<{ cnt: number }>
      const countInChain = Number(existingChainLinks[0]?.cnt || 0)
      const shouldBePrimary = setPrimary || countInChain === 0

      const inserted = (await sql`
        INSERT INTO ${sql(t.accountWalletLinks)} (
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
          metadata
        )
        VALUES (
          ${accountId},
          ${chainNamespace},
          ${chainReference},
          ${rawAddress},
          ${normalizedAddress},
          ${label},
          ${shouldBePrimary},
          ${verificationStatus},
          ${verificationMethod},
          ${verifiedAt},
          ${metadata}
        )
        RETURNING id
      `) as Array<{ id: number }>
      linkId = Number(inserted[0].id)
    }

    if (setPrimary) {
      await sql`
        UPDATE ${sql(t.accountWalletLinks)}
        SET is_primary = FALSE, updated_at = NOW()
        WHERE account_id = ${accountId}
          AND chain_namespace = ${chainNamespace}
          AND id <> ${linkId}
      `
      await sql`
        UPDATE ${sql(t.accountWalletLinks)}
        SET is_primary = TRUE, updated_at = NOW()
        WHERE id = ${linkId}
      `
    }

    const rows = (await sql`
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

    return NextResponse.json({
      success: true,
      data: formatWalletLinkRow(rows[0]),
    })
  } catch (error) {
    console.error("POST /api/account/wallet-links error:", error)
    return NextResponse.json({ success: false, error: "Failed to create wallet link" }, { status: 500 })
  }
}
