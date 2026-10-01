import { NextRequest, NextResponse } from 'next/server'
import { LeaderboardDB } from '@/lib/database'
import { calculatePoints } from '@/lib/transaction-verifier'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { getPointsPolicy, getThrottleFactorFromPolicy, getPointsMultiplier } from '@/lib/rewards/policy'
import { PrivyClient } from '@privy-io/server-auth'
import { resolveEvmAddress } from '@/lib/agents/resolve-wallet'

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const privy = new PrivyClient(PRIVY_APP_ID!, PRIVY_APP_SECRET!);

// 🚨 CRITICAL: This endpoint accepts user-submitted cross-chain data.
// Security Model:
// 1. Authenticate user via Privy (ownership check)
// 2. In the future: Verification MUST be upgraded to verify signatures from a trusted Oracle or Relayer.
//    Currently relying on auth + rate limits + post-hoc anomaly detection.

export async function POST(request: NextRequest) {
  try {
    // 1. Soft-verify Privy Access Token
    const authHeader = request.headers.get('authorization')
    let authenticatedAddress = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      try {
        const verifiedClaims = await privy.verifyAuthToken(token)
        // resolveEvmAddress — social-login users have a DID CUID, not an
        // EVM address, in verifiedClaims.userId. The SDK looks up the
        // linked embedded wallet instead.
        const resolved = await resolveEvmAddress(privy, verifiedClaims.userId)
        authenticatedAddress = resolved?.toLowerCase() ?? null
      } catch (e) {
        console.warn('[verify-crosschain] Privy token verification failed (continuing):', e)
      }
    }

    const {
      walletAddress,
      superTxHash,
      chainId,
      actionType,
      tokenSymbol,
      amount,
      usdValue,
      contractAddress,
      destinationChainId,
    } = await request.json()

    if (!walletAddress || !superTxHash || !chainId || !actionType || !contractAddress) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 2. Mandatory ownership. Points may only be claimed for the caller's own
    // wallet. This was previously a soft check (`!authenticatedAddress` passed),
    // which let an anonymous caller award points to ANY wallet for an arbitrary
    // superTxHash. A valid Privy token matching walletAddress is now required.
    if (!authenticatedAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (authenticatedAddress !== walletAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Idempotency
    const exists = await LeaderboardDB.transactionExists(superTxHash)
    if (exists) {
      return NextResponse.json({ success: true, alreadyProcessed: true })
    }

    const baseAction = String(actionType || '').replace('cross-chain_', '') as 'supply' | 'borrow' | 'repay' | 'redeem'
    let points = calculatePoints(baseAction, amount, usdValue)

    // Apply chain and asset-specific multipliers (e.g., 10x for Somnia testnet, 5x for AUSD on Monad)
    const multiplier = getPointsMultiplier(chainId, tokenSymbol)
    points = Math.round(points * multiplier)

    // Apply rewards throttle consistent with on-chain verify flow
    if (FEATURE_FLAGS.REWARDS_THROTTLE) {
      const policy = getPointsPolicy()
      const windowHours = Math.max(1, policy.throttle?.windowHours || 24)
      // Use fixed window logic instead of rolling 24h
      const cnt = await LeaderboardDB.countUserTransactionsInFixedWindow(walletAddress, windowHours)
      const ordinal = cnt + 1
      const factor = getThrottleFactorFromPolicy(ordinal)
      // Use Math.ceil to ensure points don't round down to 0 for micro-transactions
      points = Math.max(0, Math.ceil(points * factor))
    }

    // Always store using base action_type and the provided (source) chainId.
    // Cross-chain bookkeeping: flag the row, record the Biconomy superTxHash
    // as bridge_ref, and persist destination_chain_id up-front. The actual
    // destination_tx_hash is filled asynchronously by the status poller (see
    // LeaderboardDB.setCrossChainDestination) once the bundler lands the
    // UserOp on the hub — until then the frontend suppresses the explorer
    // link rather than rendering one that 404s on the source chain.
    const destChainIdParsed =
      destinationChainId != null && Number.isFinite(Number(destinationChainId))
        ? Number(destinationChainId)
        : null

    await LeaderboardDB.addVerifiedTransaction({
      wallet_address: walletAddress,
      tx_hash: superTxHash,
      chain_id: Number(chainId),
      block_number: BigInt(0),
      action_type: baseAction,
      token_symbol: tokenSymbol,
      amount: amount,
      usd_value: usdValue,
      points_awarded: points,
      is_valid: true,
      contract_address: contractAddress,
      is_cross_chain: true,
      destination_chain_id: destChainIdParsed,
      destination_tx_hash: null,
      destination_block_number: null,
      bridge_ref: superTxHash,
    })

    return NextResponse.json({ success: true, points_awarded: points })
  } catch (error) {
    console.error('[verify-crosschain] error', error)
    return NextResponse.json({ error: 'Failed to save cross-chain transaction' }, { status: 500 })
  }
}


