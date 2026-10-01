import { Buffer } from "buffer"
import { NextRequest, NextResponse } from "next/server"
import { recoverMessageAddress } from "viem"
import { Keypair } from "@stellar/stellar-sdk"
import { LeaderboardDB, sql } from "@/lib/database"
import { getTableNames } from "@/lib/tableResolver"
import { jsonbObject, jsonbParam } from "@/lib/jsonb"
import { FEATURE_FLAGS, LEADERBOARD_ACCOUNT_SCOPED } from "@/config/featureFlags"
import { invalidateAccountIdentity } from "@/lib/accountIdentity"
import {
  getCustomerByPrivyId,
  setPayoutAddressForCustomer,
} from "@/lib/bridge/store"
import {
  authenticatePrivyRequest,
  formatWalletLinkRow,
  getAccountIdForPrivyUser,
  normalizeLinkedWalletAddress,
  parseChainNamespace,
} from "../_lib"

interface VerifyWalletLinkBody {
  chainNamespace: unknown
  address: unknown
  signature: unknown
  nonce?: unknown
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

interface ChallengeDbRow {
  id: number
  message: string
  nonce: string
  expires_at: string
}

interface VerificationSecurityState {
  failedAttempts: number
  cooldownUntil: string | null
  lastFailedAt: string | null
}

const BASE_FAILURE_COOLDOWN_MS = 30 * 1000
const MAX_FAILURE_COOLDOWN_MS = 15 * 60 * 1000

function extractVerificationSecurityState(metadata: Record<string, unknown> | null): VerificationSecurityState {
  const raw =
    metadata &&
    typeof metadata === "object" &&
    metadata.verificationSecurity &&
    typeof metadata.verificationSecurity === "object"
      ? (metadata.verificationSecurity as Record<string, unknown>)
      : null

  const failedAttempts = Number(raw?.failedAttempts || 0)
  const cooldownUntil = typeof raw?.cooldownUntil === "string" ? raw.cooldownUntil : null
  const lastFailedAt = typeof raw?.lastFailedAt === "string" ? raw.lastFailedAt : null
  return {
    failedAttempts: Number.isFinite(failedAttempts) ? failedAttempts : 0,
    cooldownUntil,
    lastFailedAt,
  }
}

function buildFailureState(previous: VerificationSecurityState): VerificationSecurityState {
  const failedAttempts = previous.failedAttempts + 1
  const backoffMultiplier = Math.max(0, failedAttempts - 1)
  const cooldownMs = Math.min(MAX_FAILURE_COOLDOWN_MS, BASE_FAILURE_COOLDOWN_MS * Math.pow(2, backoffMultiplier))
  const now = new Date()
  return {
    failedAttempts,
    cooldownUntil: new Date(now.getTime() + cooldownMs).toISOString(),
    lastFailedAt: now.toISOString(),
  }
}

function buildSuccessState(): VerificationSecurityState {
  return {
    failedAttempts: 0,
    cooldownUntil: null,
    lastFailedAt: null,
  }
}

function decodeStellarSignature(signature: string): Uint8Array | null {
  const trimmed = signature.trim()
  if (!trimmed) return null

  // Freighter commonly returns base64; we also support hex and 0x-prefixed hex.
  try {
    const base64Decoded = Buffer.from(trimmed, "base64")
    if (base64Decoded.length > 0) return new Uint8Array(base64Decoded)
  } catch {
    // no-op
  }

  const normalizedHex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed
  if (/^[a-fA-F0-9]+$/.test(normalizedHex) && normalizedHex.length % 2 === 0) {
    try {
      const hexDecoded = Buffer.from(normalizedHex, "hex")
      if (hexDecoded.length > 0) return new Uint8Array(hexDecoded)
    } catch {
      // no-op
    }
  }
  return null
}

async function verifyEvmSignature(message: string, signature: string, expectedAddressLower: string): Promise<boolean> {
  try {
    const sig = signature.startsWith("0x") ? signature : `0x${signature}`
    const recovered = await recoverMessageAddress({ message, signature: sig as `0x${string}` })
    return recovered.toLowerCase() === expectedAddressLower
  } catch {
    return false
  }
}

function verifyStellarSignature(message: string, signature: string, expectedAddress: string): boolean {
  try {
    const decoded = decodeStellarSignature(signature)
    if (!decoded) return false
    const kp = Keypair.fromPublicKey(expectedAddress)
    return kp.verify(Buffer.from(message, "utf8"), Buffer.from(decoded))
  } catch {
    return false
  }
}

async function persistVerificationSecurityState(params: {
  tableName: string
  linkId: number
  metadata: Record<string, unknown> | null
  state: VerificationSecurityState
}) {
  const mergedMetadata = {
    ...jsonbObject(params.metadata),
    verificationSecurity: params.state,
  }

  await sql`
    UPDATE ${sql(params.tableName)}
    SET
      metadata = ${jsonbParam(mergedMetadata)},
      updated_at = NOW()
    WHERE id = ${params.linkId}
  `
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticatePrivyRequest(request)
    if (auth instanceof NextResponse) return auth

    const accountId = await getAccountIdForPrivyUser(auth.privyUserId)
    if (!accountId) {
      return NextResponse.json({ success: false, error: "Peridot account not found" }, { status: 404 })
    }

    const body = (await request.json().catch(() => null)) as VerifyWalletLinkBody | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 })
    }

    const chainNamespace = parseChainNamespace(body.chainNamespace)
    const rawAddress = typeof body.address === "string" ? body.address : ""
    const signature = typeof body.signature === "string" ? body.signature : ""
    const nonce = typeof body.nonce === "string" ? body.nonce.trim() : null

    if (!chainNamespace) {
      return NextResponse.json({ success: false, error: "Invalid chainNamespace" }, { status: 400 })
    }
    if (!signature.trim()) {
      return NextResponse.json({ success: false, error: "Missing signature" }, { status: 400 })
    }

    const normalizedAddress = normalizeLinkedWalletAddress(chainNamespace, rawAddress)
    if (!normalizedAddress) {
      return NextResponse.json({ success: false, error: "Invalid wallet address format" }, { status: 400 })
    }

    const t = getTableNames()

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
      WHERE account_id = ${accountId}
        AND chain_namespace = ${chainNamespace}
        AND normalized_address = ${normalizedAddress}
      LIMIT 1
    `) as WalletLinkDbRow[]

    const link = linkRows[0]
    if (!link) {
      return NextResponse.json({ success: false, error: "Wallet link not found" }, { status: 404 })
    }

    const verificationSecurity = extractVerificationSecurityState(
      jsonbObject(link.metadata),
    )
    if (verificationSecurity.cooldownUntil) {
      const cooldownUntilMs = new Date(verificationSecurity.cooldownUntil).getTime()
      if (Number.isFinite(cooldownUntilMs) && cooldownUntilMs > Date.now()) {
        const retryAfterSeconds = Math.max(1, Math.ceil((cooldownUntilMs - Date.now()) / 1000))
        return NextResponse.json(
          {
            success: false,
            error: "Verification temporarily locked due to repeated failures. Please retry shortly.",
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(retryAfterSeconds),
            },
          }
        )
      }
    }

    const challengeRows = (await sql`
      SELECT id, message, nonce, expires_at
      FROM ${sql(t.walletLinkChallenges)}
      WHERE account_id = ${accountId}
        AND chain_namespace = ${chainNamespace}
        AND normalized_address = ${normalizedAddress}
        AND used_at IS NULL
        AND expires_at > NOW()
        ${nonce ? sql`AND nonce = ${nonce}` : sql``}
      ORDER BY created_at DESC
      LIMIT 1
    `) as ChallengeDbRow[]

    const challenge = challengeRows[0]
    if (!challenge) {
      return NextResponse.json({ success: false, error: "No active challenge found" }, { status: 400 })
    }

    const isValidSignature =
      chainNamespace === "evm"
        ? await verifyEvmSignature(challenge.message, signature, normalizedAddress.toLowerCase())
        : verifyStellarSignature(challenge.message, signature, normalizedAddress)

    if (!isValidSignature) {
      const failureState = buildFailureState(verificationSecurity)
      await persistVerificationSecurityState({
        tableName: t.accountWalletLinks,
        linkId: Number(link.id),
        metadata: link.metadata || {},
        state: failureState,
      })

      const retryAfterSeconds = failureState.cooldownUntil
        ? Math.max(1, Math.ceil((new Date(failureState.cooldownUntil).getTime() - Date.now()) / 1000))
        : 30

      return NextResponse.json(
        {
          success: false,
          error: "Signature verification failed",
        },
        {
          status: 400,
          headers: {
            "Retry-After": String(retryAfterSeconds),
          },
        }
      )
    }

    await sql`
      UPDATE ${sql(t.walletLinkChallenges)}
      SET used_at = NOW()
      WHERE id = ${challenge.id}
    `

    await sql`
      UPDATE ${sql(t.accountWalletLinks)}
      SET
        verification_status = 'verified',
        verification_method = ${chainNamespace === "evm" ? "evm_personal_sign" : "freighter_sign_message"},
        verified_at = NOW(),
        updated_at = NOW()
      WHERE id = ${link.id}
    `

    await persistVerificationSecurityState({
      tableName: t.accountWalletLinks,
      linkId: Number(link.id),
      metadata: link.metadata || {},
      state: buildSuccessState(),
    })

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
      WHERE id = ${link.id}
      LIMIT 1
    `) as WalletLinkDbRow[]

    // Account-scoped read layer: newly-verified link reshapes the MV and the
    // resolver's view of which wallets belong to this account. Bust the cache
    // and trigger a refresh so the next page load reflects the merge.
    if (LEADERBOARD_ACCOUNT_SCOPED !== 'off') {
      invalidateAccountIdentity(normalizedAddress)
      void LeaderboardDB.refreshLeaderboardAccountsMV().catch((err) => {
        console.warn('[WalletLinkVerify] MV refresh trigger failed:', (err as any)?.message)
      })
    }

    // Side-effect: if the just-verified link is a Stellar G-address and the
    // user has already started the Bridge SEPA flow, register the address as
    // their Bridge payout destination so subsequent deposits auto-forward to
    // their own wallet. We deliberately do NOT clobber an existing payout
    // address — rotating it is an explicit /api/bridge/payout-address call.
    // Best-effort: a failure here must never block the wallet-link verify
    // success, since the user can always trigger a manual withdrawal later.
    if (
      FEATURE_FLAGS.FIAT_ONRAMP_BRIDGE &&
      chainNamespace === "stellar" &&
      typeof rawAddress === "string"
    ) {
      try {
        const customer = await getCustomerByPrivyId(auth.privyUserId)
        if (customer && !customer.payout_stellar_address) {
          await setPayoutAddressForCustomer(auth.privyUserId, rawAddress, true)
        }
      } catch (err) {
        console.warn(
          "[WalletLinkVerify] Bridge payout-address auto-set failed:",
          (err as any)?.message,
        )
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        walletLink: formatWalletLinkRow(updatedRows[0]),
        verifiedWithChallengeId: Number(challenge.id),
      },
    })
  } catch (error) {
    console.error("POST /api/account/wallet-links/verify error:", error)
    return NextResponse.json({ success: false, error: "Failed to verify wallet link" }, { status: 500 })
  }
}
