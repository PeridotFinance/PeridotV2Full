import { NextRequest, NextResponse } from 'next/server'
import { LeaderboardDB, VerifiedTransaction } from '@/lib/database'
import { verifyTransactionOnChain, calculatePoints } from '@/lib/transaction-verifier'

export async function POST(request: NextRequest) {
  try {
    const { txHash, walletAddress, chainId } = await request.json()
    
    // Basic validation
    if (!txHash || !walletAddress || !chainId) {
      return NextResponse.json(
        { error: 'Missing required fields: txHash, walletAddress, chainId' },
        { status: 400 }
      )
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

    // Check if transaction already exists
    const exists = await LeaderboardDB.transactionExists(txHash)
    if (exists) {
      return NextResponse.json(
        { error: 'Transaction already verified' },
        { status: 409 }
      )
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
    const points = calculatePoints(
      verificationResult.actionType!,
      verificationResult.amount,
      verificationResult.usdValue
    )

    // Create verified transaction record
    const verifiedTransaction: VerifiedTransaction = {
      wallet_address: walletAddress,
      tx_hash: txHash,
      chain_id: chainId,
      block_number: BigInt(verificationResult.blockNumber!),
      action_type: verificationResult.actionType!,
      token_symbol: verificationResult.tokenSymbol,
      amount: verificationResult.amount,
      usd_value: verificationResult.usdValue,
      points_awarded: points,
      is_valid: true,
      contract_address: verificationResult.contractAddress!,
    }

    // Add to database (this will automatically update user stats via triggers)
    await LeaderboardDB.addVerifiedTransaction(verifiedTransaction)

    // Get updated user stats
    const updatedUser = await LeaderboardDB.getUser(walletAddress)
    const userRank = await LeaderboardDB.getUserRank(walletAddress)

    return NextResponse.json({
      success: true,
      message: 'Transaction verified and points awarded',
      points_awarded: points,
      user: {
        ...updatedUser,
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