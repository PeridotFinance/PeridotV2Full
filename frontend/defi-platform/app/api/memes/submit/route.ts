import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { ethers } from 'ethers'
import { sql } from '@/lib/database'
import { uploadMemeImages } from '@/lib/firebase-storage'

// Must match the message built on the client
function buildSubmitMessage(wallet: string, timestamp: number) {
  return `Peridot: submit meme for ${wallet} at ${timestamp}`
}

const MAX_BODY_BYTES   = 4_500_000  // full PNG (~3.5 MB b64) + thumb JPEG (~80 KB b64)
const MAX_IMAGE_BYTES  = 3_500_000  // full-res PNG base64 string length
const MAX_THUMB_BYTES  = 500_000    // 400×250 JPEG base64 — generous upper bound
const MAX_PER_DAY      = 5
const REPLAY_WINDOW    = 5 * 60 * 1000

export async function POST(req: NextRequest) {
  let bodyText: string
  try {
    bodyText = await req.text()
  } catch {
    return NextResponse.json({ error: 'Failed to read request body' }, { status: 400 })
  }

  if (bodyText.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(bodyText)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { imageData, thumbData, creatorName, walletAddress, signature, timestamp } = body

  // ── field presence ──
  if (!imageData || !thumbData || !walletAddress || !signature || timestamp === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (
    typeof imageData      !== 'string' || typeof thumbData  !== 'string' ||
    typeof walletAddress  !== 'string' || typeof signature  !== 'string' ||
    typeof timestamp      !== 'number'
  ) {
    return NextResponse.json({ error: 'Invalid field types' }, { status: 400 })
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
  }

  // ── replay attack prevention ──
  const now = Date.now()
  if (Math.abs(now - timestamp) > REPLAY_WINDOW || timestamp > now + 60_000) {
    return NextResponse.json({ error: 'Timestamp expired or invalid' }, { status: 400 })
  }

  // ── wallet ownership proof ──
  const message = buildSubmitMessage(walletAddress.toLowerCase(), timestamp)
  let recovered: string
  try {
    recovered = ethers.verifyMessage(message, signature)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }
  if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
    return NextResponse.json({ error: 'Signature does not match wallet' }, { status: 401 })
  }

  // ── image validation ──
  if (!imageData.startsWith('data:image/png;base64,') && !imageData.startsWith('data:image/jpeg;base64,')) {
    return NextResponse.json({ error: 'Invalid image format' }, { status: 400 })
  }
  if (imageData.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Image too large (max ~2.5 MB)' }, { status: 413 })
  }

  if (!thumbData.startsWith('data:image/jpeg;base64,') && !thumbData.startsWith('data:image/png;base64,')) {
    return NextResponse.json({ error: 'Invalid thumbnail format' }, { status: 400 })
  }
  if (thumbData.length > MAX_THUMB_BYTES) {
    return NextResponse.json({ error: 'Thumbnail too large' }, { status: 413 })
  }

  const wallet = walletAddress.toLowerCase()

  // ── per-wallet daily cap ──
  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM memes
    WHERE wallet_address = ${wallet}
      AND created_at > NOW() - INTERVAL '24 hours'
  `
  if (count >= MAX_PER_DAY) {
    return NextResponse.json({ error: `Max ${MAX_PER_DAY} memes per day per wallet` }, { status: 429 })
  }

  // ── upload both sizes to R2 ──
  try {
    const hex        = randomBytes(16).toString('hex')
    const fullBuffer = Buffer.from(imageData.split(',')[1], 'base64')
    const thumbBuf   = Buffer.from(thumbData.split(',')[1], 'base64')

    const { fullUrl, thumbUrl } = await uploadMemeImages(fullBuffer, thumbBuf, hex)

    const sanitizedName = creatorName ? String(creatorName).slice(0, 80).trim() || null : null

    const [meme] = await sql`
      INSERT INTO memes (image_url, image_url_hd, creator_name, wallet_address)
      VALUES (${thumbUrl}, ${fullUrl}, ${sanitizedName}, ${wallet})
      RETURNING id, image_url, image_url_hd, creator_name, votes, created_at
    `
    return NextResponse.json({ success: true, meme }, { status: 201 })
  } catch (err) {
    console.error('[memes/submit]', err)
    return NextResponse.json({ error: 'Submission failed' }, { status: 500 })
  }
}
