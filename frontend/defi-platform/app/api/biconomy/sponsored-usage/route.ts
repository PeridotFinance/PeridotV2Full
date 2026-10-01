import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

// Minimal best-effort logging endpoint for sponsored usage
export async function POST(request: NextRequest) {
  try {
    const { walletAddress, superTxHash, label } = await request.json()
    if (!walletAddress || !superTxHash) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    // Create table if not exists (safe on Postgres)
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS sponsored_usage (
        id SERIAL PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        super_tx_hash TEXT NOT NULL,
        label TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_sponsored_usage_wallet ON sponsored_usage (wallet_address);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sponsored_usage_tx ON sponsored_usage (super_tx_hash);
    `)
    // Insert, ignore duplicates
    await sql.unsafe(
      `INSERT INTO sponsored_usage (wallet_address, super_tx_hash, label) VALUES ($1, $2, $3)
       ON CONFLICT (super_tx_hash) DO NOTHING`,
      [String(walletAddress).toLowerCase(), String(superTxHash).toLowerCase(), String(label || '')]
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    // Swallow errors to avoid impacting UX
    console.warn('[sponsored-usage] failed to log', error)
    return NextResponse.json({ success: false })
  }
}


