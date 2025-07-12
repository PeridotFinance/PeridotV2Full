import { NextRequest, NextResponse } from 'next/server'
import { LeaderboardDB } from '@/lib/database'

// POST - Claim daily login bonus
export async function POST(request: NextRequest) {
  try {
    const { walletAddress } = await request.json()
    
    // Basic validation
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
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

    // Check if user is eligible for daily login bonus
    const isEligible = await LeaderboardDB.isEligibleForDailyLogin(walletAddress)
    
    if (!isEligible) {
      return NextResponse.json(
        { 
          awarded: false, 
          points: 0, 
          message: 'Already claimed today\'s login bonus',
          alreadyClaimed: true
        },
        { status: 200 }
      )
    }

    // Award the daily login bonus
    const result = await LeaderboardDB.awardDailyLoginBonus(walletAddress)
    
    if (result.awarded) {
      // Get updated user data
      const updatedUser = await LeaderboardDB.getUser(walletAddress)
      const userRank = await LeaderboardDB.getUserRank(walletAddress)
      const loginStreak = await LeaderboardDB.getUserLoginStreak(walletAddress)

      return NextResponse.json({
        success: true,
        awarded: true,
        points: result.points,
        message: result.message,
        user: {
          ...updatedUser,
          rank: userRank
        },
        loginStreak,
        isNewUser: !updatedUser || updatedUser.total_points === result.points
      })
    } else {
      return NextResponse.json(
        { 
          awarded: false, 
          points: 0, 
          message: result.message,
          alreadyClaimed: true
        },
        { status: 200 }
      )
    }

  } catch (error) {
    console.error('Daily login bonus error:', error)
    
    return NextResponse.json(
      { error: 'Failed to process daily login bonus. Please try again.' },
      { status: 500 }
    )
  }
}

// GET - Check eligibility and get login stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet')
    
    if (!walletAddress) {
      // Return general daily login stats
      const stats = await LeaderboardDB.getDailyLoginStats()
      return NextResponse.json({
        stats
      })
    }

    // Validate wallet address format
    if (!walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      )
    }

    // Get user-specific login data
    const isEligible = await LeaderboardDB.isEligibleForDailyLogin(walletAddress)
    const loginHistory = await LeaderboardDB.getUserDailyLogins(walletAddress, 7) // Last 7 days
    const loginStreak = await LeaderboardDB.getUserLoginStreak(walletAddress)

    return NextResponse.json({
      eligible: isEligible,
      loginHistory,
      loginStreak,
      dailyPoints: 20 // Points awarded per day
    })

  } catch (error) {
    console.error('Daily login check error:', error)
    
    return NextResponse.json(
      { error: 'Failed to check daily login status. Please try again.' },
      { status: 500 }
    )
  }
} 