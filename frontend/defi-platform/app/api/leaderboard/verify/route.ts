import { NextRequest, NextResponse } from 'next/server'
import { LeaderboardDB, VerifiedTransaction } from '@/lib/database'
import { verifyTransactionOnChain, calculatePoints } from '@/lib/transaction-verifier'
import { getEarnedBadges, getCurrentSeason } from '@/lib/achievements'
import { FEATURE_FLAGS, LEADERBOARD_ACCOUNT_SCOPED } from '@/config/featureFlags'
import { getPointsPolicy, getThrottleFactorFromPolicy, getPointsMultiplier } from '@/lib/rewards/policy'
import { invalidateAccountIdentity } from '@/lib/accountIdentity'

// Rate limiting for POST endpoint
const verifyRateLimitCache = new Map<string, number[]>();
const VERIFY_LIMIT_WINDOW = 60000; // 1 minute
const MAX_VERIFY_REQUESTS = 5;

// NOTE: This endpoint is now primarily used for admin/background verification
// Users get immediate rewards through /api/leaderboard/pre-verify
// This endpoint performs strict on-chain validation and updates the is_valid flag

export async function POST(request: NextRequest) {
  try {
    const { txHash, walletAddress, chainId, referralCode, destinationChainId } = await request.json()
    
    // Basic validation
    if (!txHash || !walletAddress || !chainId) {
      return NextResponse.json(
        { error: 'Missing required fields: txHash, walletAddress, chainId' },
        { status: 400 }
      )
    }

    // Rate limiting: 5 per minute
    const now = Date.now()
    const wallet = walletAddress.toLowerCase()
    const requests = verifyRateLimitCache.get(wallet) || []
    const recentRequests = requests.filter(time => now - time < VERIFY_LIMIT_WINDOW)
    
    if (recentRequests.length >= MAX_VERIFY_REQUESTS) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in a minute.' },
        { status: 429 }
      )
    }
    
    recentRequests.push(now)
    verifyRateLimitCache.set(wallet, recentRequests)

    // Validate transaction hash format
    if (!txHash.match(/^0x[a-fA-F0-9]{64}$/)) {
      return NextResponse.json(
        { error: 'Invalid transaction hash format' },
        { status: 400 }
      )
    }

    // Validate wallet address format
    if (!walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      )
    }

    // Check if transaction already exists and handle idempotently
    const existing = await LeaderboardDB.getTransaction(txHash)
    if (existing && existing.is_valid) {
      // Already verified; return success idempotently
      const updatedUser = await LeaderboardDB.getUser(walletAddress)
      const userRank = await LeaderboardDB.getUserRank(walletAddress)
      return NextResponse.json({
        success: true,
        message: 'Transaction already verified',
        points_awarded: existing.points_awarded,
        user: {
          ...updatedUser,
          rank: userRank
        },
        transaction: {
          tx_hash: txHash,
          action_type: existing.action_type,
          token_symbol: existing.token_symbol,
          amount: existing.amount,
          usd_value: existing.usd_value,
          points_awarded: existing.points_awarded
        }
      })
    }

    // Verify transaction on-chain
    const verificationResult = await verifyTransactionOnChain(txHash, chainId, walletAddress)
    
    if (!verificationResult.isValid) {
      return NextResponse.json(
        { error: verificationResult.reason || 'Transaction verification failed' },
        { status: 400 }
      )
    }

    // Calculate points based on transaction type and amount
    let points = calculatePoints(
      verificationResult.actionType!,
      verificationResult.amount,
      verificationResult.usdValue
    )

    // Apply chain and asset-specific multipliers (e.g., 10x for Somnia testnet, 5x for AUSD on Monad)
    const multiplier = getPointsMultiplier(chainId, verificationResult.tokenSymbol)
    points = Math.round(points * multiplier)

    // Apply rewards throttle (post-policy) if enabled
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

    if (existing) {
      // Upgrade pending record to verified, overwrite with on-chain values
      await LeaderboardDB.updateTransactionAsVerified(txHash, {
        wallet_address: walletAddress,
        chain_id: chainId,
        block_number: verificationResult.blockNumber!,
        action_type: (String(verificationResult.actionType || '').startsWith('cross-chain_') ? verificationResult.actionType! : (String(verificationResult.actionType) as any)),
        token_symbol: verificationResult.tokenSymbol,
        amount: verificationResult.amount,
        usd_value: verificationResult.usdValue,
        points_awarded: points,
        contract_address: verificationResult.contractAddress!,
      })
    } else {
      // Create verified transaction record
      const verifiedTransaction: VerifiedTransaction = {
        wallet_address: walletAddress,
        tx_hash: txHash,
        chain_id: chainId,
        block_number: BigInt(verificationResult.blockNumber!),
        action_type: (String(verificationResult.actionType || '').startsWith('cross-chain_') ? verificationResult.actionType! : (String(verificationResult.actionType) as any)),
        token_symbol: verificationResult.tokenSymbol,
        amount: verificationResult.amount,
        usd_value: verificationResult.usdValue,
        points_awarded: points,
        is_valid: true,
        contract_address: verificationResult.contractAddress!,
      }

      // Add to database (this will automatically update user stats via triggers)
      await LeaderboardDB.addVerifiedTransaction(verifiedTransaction)
    }

    // If a referral code is provided, verify the referral
    if (referralCode) {
      await LeaderboardDB.verifyReferral(walletAddress, referralCode)
    }

    // Get updated user stats
    const updatedUser = await LeaderboardDB.getUser(walletAddress)
    const userRank = await LeaderboardDB.getUserRank(walletAddress)

    // Award points for newly unlocked badges (if any), based on updated stats
    const currentSeason = getCurrentSeason()

    // OPTIMIZATION: Get stored badge IDs first - skip calculating these
    let storedBadgeIds: string[] = []
    try {
      const prevBadges = (updatedUser as any)?.badges
      const parsed = typeof prevBadges === 'string' ? JSON.parse(prevBadges) : prevBadges
      if (parsed && Array.isArray(parsed.earned)) storedBadgeIds = parsed.earned
    } catch {}

    // Fetch all position/streak data in parallel
    const [
      maintained,
      maintained100,
      maintained250,
      maintained2500,
      maintained10000,
      maintained100000,
      maintained500000,
      stablecoinSuppliedCount,
      blueChipSuppliedCount,
      transactionStreak,
      loginStreaks,
      // Season-scoped stats: only transactions since the current season started
      seasonStats,
      seasonLoginDays,
    ] = await Promise.all([
      LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 0,      lookbackDays: 180 }),
      LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 100,    lookbackDays: 180 }),
      LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 250,    lookbackDays: 180 }),
      LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 2500,   lookbackDays: 180 }),
      LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 10000,  lookbackDays: 180 }),
      LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 100000, lookbackDays: 180 }),
      LeaderboardDB.getMaintainedPositionStreaks(walletAddress, { minUsdValue: 500000, lookbackDays: 180 }),
      LeaderboardDB.getDistinctSuppliedStablecoinCount(walletAddress),
      LeaderboardDB.getDistinctSuppliedBlueChipCount(walletAddress),
      LeaderboardDB.getUserTransactionStreak(walletAddress),
      LeaderboardDB.getUserLoginStreaks(walletAddress),
      currentSeason
        ? LeaderboardDB.getSeasonTransactionStats(walletAddress, currentSeason.startAt)
        : LeaderboardDB.getUserTransactionStats(walletAddress),
      currentSeason
        ? LeaderboardDB.getSeasonLoginDays(walletAddress, currentSeason.id)
        : Promise.resolve(0),
    ])

    const loginStreak    = loginStreaks.current
    const maxLoginStreak = loginStreaks.max

    console.log(`[Transaction Verify] Evaluating badges for ${walletAddress}:`, {
      userXp: Number((updatedUser as any)?.total_points || 0),
      loginStreak,
      seasonId: currentSeason?.id,
      seasonTotalTransactions: seasonStats.totalTransactions,
      seasonLoginDays,
      storedBadgeCount: storedBadgeIds.length,
    })

    // OPTIMIZATION: Only calculate badges user doesn't have yet.
    // Pass season-scoped stats so S2 badges don't carry over S1 activity.
    const newlyEarned = getEarnedBadges({
      userXp: Number((updatedUser as any)?.total_points || 0),
      loginStreak,
      maxLoginStreak,
      totalLoginDays: seasonLoginDays,
      totalTransactions: seasonStats.totalTransactions,
      transactionsByType: seasonStats.transactionsByType,
      totalUsdVolume: seasonStats.totalUsdVolume,
      transactionStreak,
      supplyPositionDays: maintained.supply,
      positionMaintainedDays: { supply: maintained.supply, borrow: maintained.borrow, any: maintained.any },
      positionMaintainedDaysByThreshold: {
        '100':    { supply: maintained100.supply,    borrow: maintained100.borrow,    any: maintained100.any    },
        '250':    { supply: maintained250.supply,    borrow: maintained250.borrow,    any: maintained250.any    },
        '2500':   { supply: maintained2500.supply,   borrow: maintained2500.borrow,   any: maintained2500.any   },
        '10000':  { supply: maintained10000.supply,  borrow: maintained10000.borrow,  any: maintained10000.any  },
        '100000': { supply: maintained100000.supply, borrow: maintained100000.borrow, any: maintained100000.any },
        '500000': { supply: maintained500000.supply, borrow: maintained500000.borrow, any: maintained500000.any },
      },
      distinctStablecoinSuppliedCount: stablecoinSuppliedCount,
      distinctBlueChipSuppliedCount: blueChipSuppliedCount,
      completedAchievementsCount: storedBadgeIds.length,
      seasonId: currentSeason?.id,
    }, currentSeason?.id, { excludeIds: storedBadgeIds })
    
    console.log(`[Transaction Verify] Newly earned badges for ${walletAddress}:`, newlyEarned.map(b => b.id))
    
    for (const b of newlyEarned) {
      if (b.pointsReward && b.pointsReward > 0) {
        await LeaderboardDB.awardBadgePoints(walletAddress, b.pointsReward, `BADGE:${b.id}`)
      }
    }
    if (newlyEarned.length > 0) {
      await LeaderboardDB.upsertUserEarnedBadges(walletAddress, newlyEarned.map(b => b.id))
    }

    // If any badge points were awarded, refresh user again
    let finalUser = updatedUser
    if (newlyEarned.some(b => (b.pointsReward || 0) > 0)) {
      finalUser = await LeaderboardDB.getUser(walletAddress)
    }

    // Account-scoped read layer: kick a fire-and-forget MV refresh so the
    // user's new points show up in the next ranking read within seconds.
    // Advisory-lock + in-process debounce make this safe to call freely.
    if (LEADERBOARD_ACCOUNT_SCOPED !== 'off') {
      void LeaderboardDB.refreshLeaderboardAccountsMV().catch((err) => {
        console.warn('[Verify] MV refresh trigger failed:', (err as any)?.message)
      })
      // Cache invalidation isn't strictly needed (no link change), but keeps
      // the in-process resolver from holding a stale snapshot of XP totals.
      invalidateAccountIdentity(walletAddress)
    }

    return NextResponse.json({
      success: true,
      message: 'Transaction verified and points awarded',
      points_awarded: points,
      user: {
        ...finalUser,
        rank: userRank
      },
      transaction: {
        tx_hash: txHash,
        action_type: verificationResult.actionType,
        token_symbol: verificationResult.tokenSymbol,
        amount: verificationResult.amount,
        usd_value: verificationResult.usdValue,
        points_awarded: points
      }
    })

  } catch (error) {
    console.error('Transaction verification error:', error)
    
    return NextResponse.json(
      { error: 'Failed to verify transaction. Please try again.' },
      { status: 500 }
    )
  }
}

// GET endpoint for checking verification status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const txHash = searchParams.get('txHash')
    
    if (!txHash) {
      return NextResponse.json(
        { error: 'Missing txHash parameter' },
        { status: 400 }
      )
    }

    const exists = await LeaderboardDB.transactionExists(txHash)
    
    return NextResponse.json({
      verified: exists
    })

  } catch (error) {
    console.error('Transaction check error:', error)
    
    return NextResponse.json(
      { error: 'Failed to check transaction status' },
      { status: 500 }
    )
  }
} 