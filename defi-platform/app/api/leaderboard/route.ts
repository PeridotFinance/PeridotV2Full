import { NextRequest, NextResponse } from 'next/server'
import { LeaderboardDB } from '@/lib/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')
    const walletAddress = searchParams.get('wallet')
    
    // Validate limit and offset
    if (limit < 1 || limit > 1000) {
      return NextResponse.json(
        { error: 'Limit must be between 1 and 1000' },
        { status: 400 }
      )
    }

    if (offset < 0) {
      return NextResponse.json(
        { error: 'Offset must be non-negative' },
        { status: 400 }
      )
    }

    // If wallet address is provided, get user-specific data
    if (walletAddress) {
      // Validate wallet address format
      if (!walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        return NextResponse.json(
          { error: 'Invalid wallet address format' },
          { status: 400 }
        )
      }

      const user = await LeaderboardDB.getUser(walletAddress)
      const userRank = await LeaderboardDB.getUserRank(walletAddress)
      const userTransactions = await LeaderboardDB.getUserTransactions(walletAddress, 20)

      return NextResponse.json({
        user: user ? {
          ...user,
          rank: userRank
        } : null,
        transactions: userTransactions
      })
    }

    // Get general leaderboard data
    const leaderboard = await LeaderboardDB.getLeaderboard(limit, offset)
    const stats = await LeaderboardDB.getLeaderboardStats()

    return NextResponse.json({
      leaderboard,
      stats,
      pagination: {
        limit,
        offset,
        hasMore: leaderboard.length === limit
      }
    })

  } catch (error) {
    console.error('Leaderboard API error:', error)
    
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard data' },
      { status: 500 }
    )
  }
} 