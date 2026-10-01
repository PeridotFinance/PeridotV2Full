import { NextRequest, NextResponse } from 'next/server'
import { enhanceClaim } from '@/lib/fact-checker'

export async function POST(request: NextRequest) {
  try {
    const { claim, criticism } = await request.json()
    
    if (!claim || typeof claim !== 'string') {
      return NextResponse.json(
        { error: 'Claim is required and must be a string' },
        { status: 400 }
      )
    }

    const enhanced = await enhanceClaim(claim, criticism)
    
    return NextResponse.json({ enhanced })
  } catch (error) {
    console.error('Error enhancing claim:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

