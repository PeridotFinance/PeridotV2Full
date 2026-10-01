import { NextRequest, NextResponse } from 'next/server'
import { LeaderboardDB, sql } from '@/lib/database'
import { CHAIN_IDS } from '@/config/contracts'
import { getTableNames } from '@/lib/tableResolver'
import {
  verifyStellarTransactionOnChain,
  isValidStellarAccountAddress,
  isValidStellarTxHash,
} from '@/lib/stellar-transaction-verifier'
import { stellarFetchPriceForSymbol } from '@/lib/stellar-pricing'
import { calculatePoints } from '@/lib/transaction-verifier'
import { getPointsMultiplier, getPointsPolicy, getThrottleFactorFromPolicy } from '@/lib/rewards/policy'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { invalidateAccountIdentity } from '@/lib/accountIdentity'
import {
  getOrCreateAccountId,
  tryAuthenticatePrivyUserId,
} from '@/app/api/account/wallet-links/_lib'

// Per-wallet rate limit. Stellar lending hooks fire-and-forget once per
// successful tx, so 5/min is generous in practice and matches the EVM
// /api/leaderboard/verify limit.
const verifyRateLimitCache = new Map<string, number[]>()
const RATE_LIMIT_WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 5

const STELLAR_CONTRACT_REGEX = /^C[A-Z2-7]{55}$/
const ALLOWED_ACTION_TYPES = new Set(['supply', 'borrow', 'repay', 'redeem'])
const ALLOWED_TOKEN_SYMBOLS = new Set(['XLM', 'USDC', 'EURC'])

interface VerifyStellarBody {
  walletAddress?: string
  txHash?: string
  chainId?: number
  actionType?: 'supply' | 'borrow' | 'repay' | 'redeem'
  tokenSymbol?: string
  amount?: string
  /**
   * Optional. If absent, the route resolves it server-side via the
   * Reflector oracle so the chart keeps a USD-denominated x-asset view.
   */
  usdValue?: number
  /** Vault contract ID (`C…`) the user interacted with. */
  contractAddress?: string
}

export async function POST(request: NextRequest) {
  let body: VerifyStellarBody
  try {
    body = (await request.json()) as VerifyStellarBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    walletAddress,
    txHash,
    chainId,
    actionType,
    tokenSymbol,
    amount,
    usdValue: clientUsdValue,
    contractAddress,
  } = body

  // ── 1. Required fields ───────────────────────────────────────────────
  if (!walletAddress || !txHash || !chainId || !actionType || !tokenSymbol || !contractAddress) {
    return NextResponse.json(
      {
        error:
          'Missing required fields: walletAddress, txHash, chainId, actionType, tokenSymbol, contractAddress',
      },
      { status: 400 },
    )
  }

  // ── 2. Format checks ─────────────────────────────────────────────────
  if (chainId !== CHAIN_IDS.STELLAR_MAINNET) {
    return NextResponse.json(
      { error: `Unsupported chainId for Stellar verify: ${chainId}` },
      { status: 400 },
    )
  }
  if (!isValidStellarAccountAddress(walletAddress)) {
    return NextResponse.json({ error: 'Invalid Stellar wallet address' }, { status: 400 })
  }
  if (!isValidStellarTxHash(txHash)) {
    return NextResponse.json({ error: 'Invalid Stellar tx hash format' }, { status: 400 })
  }
  if (!STELLAR_CONTRACT_REGEX.test(contractAddress)) {
    return NextResponse.json({ error: 'Invalid Stellar contract address' }, { status: 400 })
  }
  if (!ALLOWED_ACTION_TYPES.has(actionType)) {
    return NextResponse.json({ error: 'Invalid actionType' }, { status: 400 })
  }
  const symbolUpper = String(tokenSymbol).toUpperCase()
  if (!ALLOWED_TOKEN_SYMBOLS.has(symbolUpper)) {
    return NextResponse.json({ error: 'Unsupported tokenSymbol for Stellar' }, { status: 400 })
  }

  const txHashLower = txHash.toLowerCase()

  // ── 3. Per-wallet rate limit ─────────────────────────────────────────
  const now = Date.now()
  const recent = (verifyRateLimitCache.get(walletAddress) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  )
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again in a minute.' },
      { status: 429 },
    )
  }
  recent.push(now)
  verifyRateLimitCache.set(walletAddress, recent)

  // ── 4. Idempotency — already verified? ───────────────────────────────
  try {
    const exists = await LeaderboardDB.transactionExists(txHashLower)
    if (exists) {
      return NextResponse.json({ success: true, alreadyProcessed: true })
    }
  } catch (err) {
    console.error('[verify-stellar] transactionExists check failed:', err)
    // Fall through — duplicate insert is guarded by ON CONFLICT (tx_hash).
  }

  // ── 5. On-chain verification via Soroban RPC ─────────────────────────
  const verification = await verifyStellarTransactionOnChain(txHashLower, walletAddress)
  if (!verification.isValid) {
    return NextResponse.json(
      { error: verification.reason || 'Stellar tx verification failed' },
      { status: 400 },
    )
  }

  // ── 6. USD value resolution ──────────────────────────────────────────
  // Prefer client-provided usdValue when present (it was computed from the
  // exact price shown to the user at sign time). Fall back to the oracle
  // for backfill / agent paths that don't carry a price.
  let usdValue: number | null =
    typeof clientUsdValue === 'number' && Number.isFinite(clientUsdValue) && clientUsdValue >= 0
      ? clientUsdValue
      : null

  if (usdValue == null && amount && Number.isFinite(parseFloat(amount))) {
    const price = await stellarFetchPriceForSymbol(symbolUpper)
    if (price != null) {
      const computed = parseFloat(amount) * price
      if (Number.isFinite(computed) && computed >= 0) {
        usdValue = computed
      }
    }
  }

  // ── 6b. Opportunistically link this G-address to the user's Peridot account.
  // The on-chain verification above is cryptographic proof that the user
  // controls the Stellar private key (they signed a Soroban tx from it), so we
  // can mark verification_status='verified' without an extra signMessage prompt.
  // This is what makes the G-address show up in /api/user/transactions and the
  // Deposited column when the user is also signed in via Privy.
  // Soft-fails: if Privy auth is missing/invalid the verify still records the
  // tx; only the cross-namespace stitching gets skipped.
  try {
    const privyUserId = await tryAuthenticatePrivyUserId(request)
    if (privyUserId) {
      const accountId = await getOrCreateAccountId(privyUserId)
      const t = getTableNames()
      const normalized = walletAddress.toUpperCase()
      const existing = (await sql`
        SELECT id, account_id
        FROM ${sql(t.accountWalletLinks)}
        WHERE chain_namespace = 'stellar'
          AND normalized_address = ${normalized}
        LIMIT 1
      `) as Array<{ id: number; account_id: number }>

      const collision = existing[0]
      if (collision && Number(collision.account_id) !== accountId) {
        // G-address already claimed by another Peridot account — do not move it
        // silently. Log and skip; the tx record below still goes through.
        console.warn(
          '[verify-stellar] Stellar address already linked to a different account; skipping link.',
          { gAddress: normalized, requestingAccount: accountId, ownerAccount: collision.account_id },
        )
      } else if (collision) {
        await sql`
          UPDATE ${sql(t.accountWalletLinks)}
          SET verification_status = 'verified',
              verification_method = 'soroban_tx_proof',
              verified_at = COALESCE(verified_at, NOW()),
              updated_at = NOW()
          WHERE id = ${Number(collision.id)}
        `
      } else {
        const existingChainLinks = (await sql`
          SELECT COUNT(*)::int AS cnt
          FROM ${sql(t.accountWalletLinks)}
          WHERE account_id = ${accountId}
            AND chain_namespace = 'stellar'
        `) as Array<{ cnt: number }>
        const isFirst = Number(existingChainLinks[0]?.cnt || 0) === 0
        await sql`
          INSERT INTO ${sql(t.accountWalletLinks)} (
            account_id, chain_namespace, address, normalized_address,
            is_primary, verification_status, verification_method, verified_at
          )
          VALUES (
            ${accountId}, 'stellar', ${walletAddress}, ${normalized},
            ${isFirst}, 'verified', 'soroban_tx_proof', NOW()
          )
        `
      }
    }
  } catch (err) {
    console.warn('[verify-stellar] account linking failed (non-fatal):', err)
  }

  // ── 6c. Points ───────────────────────────────────────────────────────
  // Mirror the EVM verify path exactly: base points by action + USD value,
  // chain/asset multiplier, then the optional rewards throttle keyed on the
  // wallet's tx count in the fixed window. Once linked to a Peridot account
  // (see §6b + login auto-link), these points pool into the account total via
  // the account-scoped leaderboard aggregation.
  let points = calculatePoints(actionType, amount ?? undefined, usdValue ?? undefined)
  points = Math.round(points * getPointsMultiplier(chainId, symbolUpper))
  if (FEATURE_FLAGS.REWARDS_THROTTLE) {
    const policy = getPointsPolicy()
    const windowHours = Math.max(1, policy.throttle?.windowHours || 24)
    const cnt = await LeaderboardDB.countUserTransactionsInFixedWindow(walletAddress, windowHours)
    points = Math.max(0, Math.ceil(points * getThrottleFactorFromPolicy(cnt + 1)))
  }

  // ── 7. Persist into shared verified_transactions ─────────────────────
  // Stellar txs now earn leaderboard points. The DB trigger updates the
  // G-address row in leaderboard_users; the account-scoped aggregation joins
  // it via account_wallet_links so it shows in the user's pooled total.
  try {
    await LeaderboardDB.addVerifiedTransaction({
      wallet_address: walletAddress,
      tx_hash: txHashLower,
      chain_id: chainId,
      block_number: BigInt(verification.ledgerSeq ?? 0),
      action_type: actionType,
      token_symbol: symbolUpper,
      amount: amount ?? undefined,
      usd_value: usdValue ?? undefined,
      points_awarded: points,
      is_valid: true,
      contract_address: contractAddress,
    })
  } catch (err) {
    console.error('[verify-stellar] insert failed:', err)
    return NextResponse.json(
      { error: 'Failed to record Stellar transaction' },
      { status: 500 },
    )
  }

  // Drop the cached account identity so the pooled total reflects these points
  // on the next read (mirrors the EVM verify path).
  try {
    invalidateAccountIdentity(walletAddress)
  } catch {
    /* cache invalidation is best-effort */
  }

  return NextResponse.json({
    success: true,
    points_awarded: points,
    transaction: {
      tx_hash: txHashLower,
      chain_id: chainId,
      action_type: actionType,
      token_symbol: symbolUpper,
      amount,
      usd_value: usdValue,
      ledger_seq: verification.ledgerSeq,
    },
  })
}
