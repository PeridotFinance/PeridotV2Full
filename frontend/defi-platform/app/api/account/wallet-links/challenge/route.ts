import { randomBytes } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { getTableNames } from "@/lib/tableResolver"
import {
  authenticatePrivyRequest,
  formatWalletLinkRow,
  getOrCreateAccountId,
  normalizeLinkedWalletAddress,
  parseChainNamespace,
} from "../_lib"

interface CreateChallengeBody {
  chainNamespace: unknown
  address: unknown
  chainReference?: unknown
  label?: unknown
  metadata?: unknown
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

const CHALLENGE_WINDOW_INTERVAL_SQL = "10 minutes"
const MAX_CHALLENGES_PER_ACCOUNT_WINDOW = 8
const MAX_CHALLENGES_PER_ADDRESS_WINDOW = 4

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticatePrivyRequest(request)
    if (auth instanceof NextResponse) return auth

    const body = (await request.json().catch(() => null)) as CreateChallengeBody | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 })
    }

    const chainNamespace = parseChainNamespace(body.chainNamespace)
    const rawAddress = typeof body.address === "string" ? body.address : ""
    const chainReference =
      typeof body.chainReference === "string" ? body.chainReference.trim() : null
    const label = typeof body.label === "string" ? body.label.trim() : null
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

    const metadataJson = JSON.stringify(metadata)

    const [accountChallengeWindowRowsRaw, addressChallengeWindowRowsRaw] = await Promise.all([
      sql`
        SELECT COUNT(*)::int AS cnt
        FROM ${sql(t.walletLinkChallenges)}
        WHERE account_id = ${accountId}
          AND created_at > NOW() - ${CHALLENGE_WINDOW_INTERVAL_SQL}::interval
      `,
      sql`
        SELECT COUNT(*)::int AS cnt
        FROM ${sql(t.walletLinkChallenges)}
        WHERE account_id = ${accountId}
          AND chain_namespace = ${chainNamespace}
          AND normalized_address = ${normalizedAddress}
          AND created_at > NOW() - ${CHALLENGE_WINDOW_INTERVAL_SQL}::interval
      `,
    ])

    const accountChallengeWindowRows = accountChallengeWindowRowsRaw as Array<{ cnt: number }>
    const addressChallengeWindowRows = addressChallengeWindowRowsRaw as Array<{ cnt: number }>

    const accountWindowCount = Number(accountChallengeWindowRows[0]?.cnt || 0)
    if (accountWindowCount >= MAX_CHALLENGES_PER_ACCOUNT_WINDOW) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many wallet-link challenges for this account. Please retry shortly.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
          },
        }
      )
    }

    const addressWindowCount = Number(addressChallengeWindowRows[0]?.cnt || 0)
    if (addressWindowCount >= MAX_CHALLENGES_PER_ADDRESS_WINDOW) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many verification attempts for this wallet. Please retry shortly.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
          },
        }
      )
    }

    const existingByAddress = (await sql`
      SELECT id, account_id
      FROM ${sql(t.accountWalletLinks)}
      WHERE chain_namespace = ${chainNamespace}
        AND normalized_address = ${normalizedAddress}
      LIMIT 1
    `) as Array<{ id: number; account_id: number }>

    const addressOwner = existingByAddress[0]
    if (addressOwner && Number(addressOwner.account_id) !== accountId) {
      return NextResponse.json(
        { success: false, error: "Wallet is already linked to another Peridot account" },
        { status: 409 }
      )
    }

    let linkId: number
    if (addressOwner) {
      linkId = Number(addressOwner.id)
      await sql`
        UPDATE ${sql(t.accountWalletLinks)}
        SET
          chain_reference = ${chainReference},
          address = ${rawAddress},
          label = ${label},
          metadata = ${metadataJson}::jsonb,
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
      const shouldBePrimary = Number(existingChainLinks[0]?.cnt || 0) === 0

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
          'pending',
          ${metadataJson}::jsonb
        )
        RETURNING id
      `) as Array<{ id: number }>
      linkId = Number(inserted[0].id)
    }

    const nonce = randomBytes(16).toString("hex")
    const issuedAt = new Date()
    const expiresAt = new Date(issuedAt.getTime() + 10 * 60 * 1000)
    const message = [
      "Peridot Wallet Link",
      `Account ID: ${accountId}`,
      `Chain: ${chainNamespace}`,
      `Address: ${normalizedAddress}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt.toISOString()}`,
      `Expires At: ${expiresAt.toISOString()}`,
      "",
      "Sign this message to verify wallet ownership.",
      "This action does not initiate a blockchain transaction.",
    ].join("\n")

    const challengeRows = (await sql`
      INSERT INTO ${sql(t.walletLinkChallenges)} (
        account_id,
        chain_namespace,
        normalized_address,
        nonce,
        message,
        expires_at
      )
      VALUES (
        ${accountId},
        ${chainNamespace},
        ${normalizedAddress},
        ${nonce},
        ${message},
        ${expiresAt.toISOString()}
      )
      RETURNING id
    `) as Array<{ id: number }>

    const linkRows = (await sql`
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
      data: {
        challengeId: Number(challengeRows[0].id),
        nonce,
        message,
        expiresAt: expiresAt.toISOString(),
        walletLink: formatWalletLinkRow(linkRows[0]),
      },
    })
  } catch (error) {
    console.error("POST /api/account/wallet-links/challenge error:", error)
    return NextResponse.json({ success: false, error: "Failed to create link challenge" }, { status: 500 })
  }
}
