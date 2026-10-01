import { NextRequest, NextResponse } from 'next/server'
import { criticizeClaim } from '@/lib/fact-checker'

export async function POST(request: NextRequest) {
  try {
    const { claim } = await request.json()
    
    if (!claim || typeof claim !== 'string') {
      return NextResponse.json(
        { error: 'Claim is required and must be a string' },
        { status: 400 }
      )
    }

    const criticism = await criticizeClaim(claim)
    
    return NextResponse.json({ criticism })
  } catch (error) {
    console.error('Error criticizing claim:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

