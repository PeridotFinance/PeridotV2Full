import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { ethers } from 'ethers'

// Helper to construct the message that the user signed
function buildOnrampMessage(walletAddress: string, timestamp: number) {
  return `Authorize Moonpay funding for ${walletAddress} at timestamp ${timestamp}`
}

export async function POST(request: NextRequest) {
  try {
    const { 
      walletAddress, // The Smart Account address (destination)
      signerAddress, // The EOA address (signer)
      signature, 
      timestamp, 
      redirectUrl,
      email
    } = await request.json()

    // 1. Basic Validation
    if (!walletAddress || !signerAddress || !signature || !timestamp) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    // 2. Timestamp Check (Prevent Replay Attacks > 5 mins)
    const now = Date.now()
    if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
      return NextResponse.json({ success: false, error: 'Request expired' }, { status: 400 })
    }

    // 3. Verify Signature
    // The EOA (signerAddress) must have signed the message authorizing the action
    const msg = buildOnrampMessage(walletAddress, Number(timestamp))
    let recovered: string
    try {
      recovered = ethers.verifyMessage(msg, signature)
    } catch (err) {
      console.error('Signature verification failed:', err)
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 400 })
    }

    if (recovered.toLowerCase() !== signerAddress.toLowerCase()) {
      return NextResponse.json({ success: false, error: 'Signature does not match signer' }, { status: 400 })
    }

    // 4. Log the initiation in DB
    try {
        // We use a safe try/catch here so logging failure doesn't block the user
        // Assuming the table exists (manually applied)
        /* 
        await sql`
            INSERT INTO fiat_onramp_logs (wallet_address, signer_address, provider, status)
            VALUES (${walletAddress}, ${signerAddress}, 'moonpay', 'initiated')
        `
        */
       // NOTE: Since table creation is manual, we'll skip the actual INSERT for now 
       // or wrapped in a try/catch that ignores 'relation does not exist' errors
    } catch (e) {
        console.warn('Failed to log onramp initiation:', e)
    }

    // 5. Construct Moonpay URL
    const MOONPAY_PUBLIC_KEY = process.env.NEXT_PUBLIC_MOONPAY_PUBLIC_KEY
    const MOONPAY_SECRET_KEY = process.env.MOONPAY_SECRET_KEY

    if (!MOONPAY_PUBLIC_KEY || !MOONPAY_SECRET_KEY) {
       console.error('Moonpay keys missing')
       return NextResponse.json({ success: false, error: 'Service configuration error' }, { status: 500 })
    }

    // Base URL (sandbox or production based on environment, but defaulting to sandbox for safety if not specified)
    const isProd = process.env.NODE_ENV === 'production'
    const baseUrl = isProd 
        ? 'https://buy.moonpay.com' 
        : 'https://buy-sandbox.moonpay.com'
    
    const onrampUrl = new URL(baseUrl)
    onrampUrl.searchParams.set('apiKey', MOONPAY_PUBLIC_KEY)
    onrampUrl.searchParams.set('walletAddress', walletAddress)
    onrampUrl.searchParams.set('currencyCode', 'eth') // Default to ETH, can be parameterized
    
    if (email) onrampUrl.searchParams.set('email', email)
    if (redirectUrl) onrampUrl.searchParams.set('redirectURL', redirectUrl)

    // 6. Sign the URL
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const originalUrl = onrampUrl.toString()
    const signatureUrl = crypto
        .createHmac('sha256', MOONPAY_SECRET_KEY)
        .update(onrampUrl.search)
        .digest('base64')

    onrampUrl.searchParams.set('signature', signatureUrl)

    return NextResponse.json({ 
        success: true, 
        url: onrampUrl.toString() 
    })

  } catch (error) {
    console.error('Moonpay signing error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

