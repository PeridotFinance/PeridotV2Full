import { NextRequest, NextResponse } from 'next/server'
import { LeaderboardDB } from '@/lib/database'
import { calculatePoints } from '@/lib/transaction-verifier'
import { getPointsMultiplier } from '@/lib/rewards/policy'
import { PrivyClient } from '@privy-io/server-auth'
import { resolveEvmAddress } from '@/lib/agents/resolve-wallet'

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const privy = new PrivyClient(PRIVY_APP_ID!, PRIVY_APP_SECRET!);

export async function POST(request: NextRequest) {
  try {
    // 1. Soft-verify Privy Access Token and resolve to a real EVM address.
    //
    // NB: `verifiedClaims.userId` is a Privy DID — for wallet-login users it
    // ends with the 0x address, but for social-login / email users it's a
    // CUID (e.g. `did:privy:cm9xxx`). Splitting on `:` and assuming an
    // address was the root of the reported 400 "Invalid wallet address
    // format" bug. The other agent routes use `resolveEvmAddress` which
    // looks up the user's linked embedded wallet via the Privy SDK. Doing
    // the same here.
    const authHeader = request.headers.get('authorization')
    let authenticatedAddress: string | null = null

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      try {
        const verifiedClaims = await privy.verifyAuthToken(token)
        const resolved = await resolveEvmAddress(privy, verifiedClaims.userId)
        if (resolved) {
          authenticatedAddress = resolved.toLowerCase()
        } else {
          console.warn('[pre-verify] No EVM wallet linked for userId', verifiedClaims.userId)
        }
      } catch (e) {
        console.warn('[pre-verify] Privy token verification failed (continuing):', e)
      }
    }

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid or empty JSON body' },
        { status: 400 },
      )
    }
    const { txHash, chainId, actionType, referralCode, usdValue } = body as {
      txHash?: string
      chainId?: number
      actionType?: string
      referralCode?: string
      usdValue?: number
    }
    // walletAddress is optional: if the caller didn't pass one but authenticated
    // with a Privy token, fall back to that address. This matches how the
    // other agent routes (execute, chat) resolve the user — the Privy JWT is
    // the source of truth for identity, the body field is a convenience.
    let walletAddress = (body?.walletAddress as string | undefined) ?? null
    if (!walletAddress && authenticatedAddress) {
      walletAddress = `0x${authenticatedAddress.replace(/^0x/, '')}`
    }

    // Basic validation
    if (!txHash || !walletAddress || !chainId || !actionType) {
      return NextResponse.json(
        { error: 'Missing required fields: txHash, walletAddress, chainId, actionType' },
        { status: 400 }
      )
    }

    // 2. Optional: Verify Wallet Ownership (Soft Check)
    const isDirectOwner = authenticatedAddress === walletAddress.toLowerCase();
    const isAuthorized = !authenticatedAddress || isDirectOwner;

    if (authenticatedAddress && !isAuthorized) {
      console.warn('[pre-verify] Auth token does not match wallet address', {
        authenticatedAddress,
        walletAddress
      })
    }

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

    // Validate action type
    const allowedActions = new Set(['supply', 'borrow', 'repay', 'redeem'])
    if (!allowedActions.has(String(actionType))) {
      return NextResponse.json(
        { error: 'Invalid actionType' },
        { status: 400 }
      )
    }

    // Check if transaction already exists
    const exists = await LeaderboardDB.transactionExists(txHash)
    if (exists) {
      return NextResponse.json(
        { error: 'Transaction already processed', alreadyProcessed: true },
        { status: 409 }
      )
    }

    // Do not write anything to the database here. Only acknowledge receipt.
    const points = 0
    let estimatedPoints = typeof usdValue === 'number'
      ? calculatePoints(actionType as any, undefined, usdValue)
      : calculatePoints(actionType as any)
    
    // Apply chain-specific multiplier (e.g., 10x for Somnia testnet) to estimated points
    // Note: Asset-specific multipliers are applied during full verification when token info is available
    const multiplier = getPointsMultiplier(chainId)
    estimatedPoints = Math.round(estimatedPoints * multiplier)

    // Do not verify referrals at pre-verify stage to prevent abuse; handled after on-chain verification

    // Get updated user stats
    const updatedUser = await LeaderboardDB.getUser(walletAddress)
    const userRank = await LeaderboardDB.getUserRank(walletAddress)

    return NextResponse.json({
      success: true,
      message: 'Transaction acknowledged and points awarded (pending verification)',
      points_awarded: points,
      user: {
        ...updatedUser,
        rank: userRank
      },
      transaction: {
        tx_hash: txHash,
        action_type: actionType,
        token_symbol: null,
        amount: null,
        usd_value: null,
        points_awarded: points,
        estimated_points: estimatedPoints,
        verification_status: 'pending'
      }
    })

  } catch (error) {
    console.error('Pre-verification error:', error)
    
    return NextResponse.json(
      { error: 'Failed to process transaction. Please try again.' },
      { status: 500 }
    )
  }
} 