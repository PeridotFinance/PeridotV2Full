import { NextRequest, NextResponse } from 'next/server'
import { LeaderboardDB } from '@/lib/database'
import { verifyTransactionOnChain } from '@/lib/transaction-verifier'

// This endpoint should be called by a cron job or admin interface
export async function POST(request: NextRequest) {
  try {
    const { chainId, limit = 50 } = await request.json()
    
    if (!chainId) {
      return NextResponse.json(
        { error: 'Chain ID is required' },
        { status: 400 }
      )
    }

    // Get transactions to re-verify (older than 24 hours)
    const transactionsToVerify = await LeaderboardDB.getTransactionsToReVerify(
      chainId, 
      24, // hours
      limit
    )

    let invalidatedCount = 0
    let verifiedCount = 0
    const errors: string[] = []

    // Re-verify each transaction
    for (const tx of transactionsToVerify) {
      try {
        const verificationResult = await verifyTransactionOnChain(
          tx.tx_hash,
          tx.chain_id,
          tx.wallet_address
        )

        if (!verificationResult.isValid) {
          // Transaction is no longer valid, invalidate it
          await LeaderboardDB.invalidateTransaction(tx.tx_hash)
          invalidatedCount++
          
          console.log(`Invalidated transaction ${tx.tx_hash}: ${verificationResult.reason}`)
        } else {
          verifiedCount++
        }
      } catch (error) {
        errors.push(`Failed to re-verify ${tx.tx_hash}: ${error}`)
        console.error(`Re-verification error for ${tx.tx_hash}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      processed: transactionsToVerify.length,
      verified: verifiedCount,
      invalidated: invalidatedCount,
      errors: errors.length > 0 ? errors : undefined
    })

  } catch (error) {
    console.error('Re-verification error:', error)
    
    return NextResponse.json(
      { error: 'Failed to re-verify transactions' },
      { status: 500 }
    )
  }
}

// GET endpoint for checking re-verification status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const chainId = parseInt(searchParams.get('chainId') || '0')
    
    if (!chainId) {
      return NextResponse.json(
        { error: 'Chain ID is required' },
        { status: 400 }
      )
    }

    // Get count of transactions that need re-verification
    const transactionsToVerify = await LeaderboardDB.getTransactionsToReVerify(chainId, 24, 1000)
    
    return NextResponse.json({
      chainId,
      transactionsNeedingVerification: transactionsToVerify.length,
      oldestTransaction: transactionsToVerify[0]?.verified_at || null
    })

  } catch (error) {
    console.error('Re-verification status error:', error)
    
    return NextResponse.json(
      { error: 'Failed to get re-verification status' },
      { status: 500 }
    )
  }
} 