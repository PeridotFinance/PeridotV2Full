import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'
import { ClaimDB } from '@/lib/database'
import { resolveLinkedEvmWallets } from '@/lib/linkedAccountResolver'

// Rate limit: 1 per 20s (enforced by middleware category EXPORT_CSV)

function escapeCsv(value: any): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function fmtDate(d: Date | string) {
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toISOString().replace('T', ' ').slice(0, 19)
}

function chainName(chainId: number | null) {
  const map: Record<number, string> = {
    56: 'BNB Smart Chain', 97: 'BNB Testnet',
    1: 'Ethereum', 42161: 'Arbitrum', 8453: 'Base',
    137: 'Polygon', 43114: 'Avalanche', 10143: 'Monad Testnet', 50312: 'Somnia Testnet',
  }
  return chainId ? (map[chainId] ?? `Chain ${chainId}`) : 'Unknown'
}

// Simple FIFO P&L per asset: match each redeem against earlier supply lots
function computePnl(txs: Array<{
  action_type: string
  token_symbol: string
  chain_id: number
  usd_value: number
  verified_at: string
}>) {
  // lot queue per symbol
  const lots = new Map<string, Array<{ usd: number; date: string }>>()
  const pnl: Array<{ asset: string; supplied_usd: number; redeemed_usd: number; interest_usd: number; date: string }> = []

  for (const tx of txs) {
    const sym = tx.token_symbol.toUpperCase()
    const usd = Number(tx.usd_value) || 0
    const action = tx.action_type.replace(/^cross-chain_/, '')

    if (action === 'supply') {
      const queue = lots.get(sym) ?? []
      queue.push({ usd, date: tx.verified_at })
      lots.set(sym, queue)
    } else if (action === 'redeem' && usd > 0) {
      const queue = lots.get(sym) ?? []
      let remaining = usd
      let costBasis = 0
      while (remaining > 0 && queue.length > 0) {
        const lot = queue[0]
        const take = Math.min(lot.usd, remaining)
        costBasis += take
        remaining -= take
        lot.usd -= take
        if (lot.usd <= 0) queue.shift()
      }
      lots.set(sym, queue)
      // P&L = proceeds – cost; positive = earned interest
      const interest = usd - costBasis
      pnl.push({
        asset: sym,
        supplied_usd: costBasis,
        redeemed_usd: usd,
        interest_usd: interest,
        date: tx.verified_at,
      })
    }
  }

  return pnl
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const address = sp.get('address')?.toLowerCase()
    if (!address) {
      return NextResponse.json({ error: 'address required' }, { status: 400 })
    }

    // Verify premium
    const premium = await ClaimDB.getPremiumUser(address)
    if (!premium) {
      return NextResponse.json({ error: 'Premium access required' }, { status: 403 })
    }

    // Date range params
    const fromParam = sp.get('from')  // ISO date e.g. 2024-01-01
    const toParam   = sp.get('to')    // ISO date e.g. 2024-12-31
    const from = fromParam ? new Date(fromParam) : new Date('2000-01-01')
    const to   = toParam   ? new Date(toParam + 'T23:59:59Z') : new Date()

    // Resolve linked wallets
    const { walletAddresses: wallets } = await resolveLinkedEvmWallets(address)

    const t = getTableNames()

    const [txResult, balResult, apyResult] = await Promise.all([
      // Full transaction history within range
      query(
        `SELECT
          action_type,
          usd_value,
          verified_at,
          token_symbol,
          chain_id,
          tx_hash
        FROM ${t.verifiedTransactions}
        WHERE wallet_address = ANY($1::text[])
          AND is_valid = true
          AND usd_value > 0
          AND verified_at >= $2
          AND verified_at <= $3
          AND action_type IN (
            'supply','borrow','repay','redeem',
            'cross-chain_supply','cross-chain_borrow',
            'cross-chain_repay','cross-chain_redeem'
          )
        ORDER BY verified_at ASC`,
        [wallets, from.toISOString(), to.toISOString()]
      ),
      // Current positions snapshot
      query(
        `SELECT DISTINCT ON (asset_id, chain_id)
          asset_id, chain_id, supplied_usd, borrowed_usd, observed_at
        FROM ${t.userBalanceSnapshots}
        WHERE address = ANY($1::text[])
          AND (supplied_usd > 0 OR borrowed_usd > 0)
        ORDER BY asset_id, chain_id, observed_at DESC`,
        [wallets]
      ),
      // Portfolio summary
      query(
        `SELECT
          AVG(net_apy_pct) AS net_apy,
          SUM(total_supply_usd) AS total_supply_usd,
          SUM(total_borrow_usd) AS total_borrow_usd,
          MAX(updated_at) AS updated_at
        FROM ${t.userPortfolioApySnapshots}
        WHERE address = ANY($1::text[])`,
        [wallets]
      ),
    ])

    const txs = txResult.rows ?? []
    const positions = balResult.rows ?? []
    const portfolio = apyResult.rows?.[0]

    // Compute P&L
    const pnl = computePnl(txs)
    const totalInterest = pnl.reduce((s, r) => s + r.interest_usd, 0)

    // ── Build CSV ─────────────────────────────────────────────────────────────
    const lines: string[] = []

    // Header
    lines.push('Peridot Finance — Enhanced Premium Export')
    lines.push(`Generated: ${new Date().toISOString()}`)
    lines.push(`Address: ${address}`)
    lines.push(`Wallet scope: ${wallets.join(' | ')}`)
    lines.push(`Date range: ${from.toISOString().slice(0,10)} → ${to.toISOString().slice(0,10)}`)
    lines.push('')

    // Portfolio summary
    const totalSupply  = Number(portfolio?.total_supply_usd ?? 0)
    const totalBorrow  = Number(portfolio?.total_borrow_usd ?? 0)
    const netApy       = Number(portfolio?.net_apy ?? 0)
    lines.push('── PORTFOLIO SUMMARY ─────────────────────────────────────────')
    lines.push('Metric,Value')
    lines.push(`Total Supplied (USD),${totalSupply.toFixed(2)}`)
    lines.push(`Total Borrowed (USD),${totalBorrow.toFixed(2)}`)
    lines.push(`Net Equity (USD),${(totalSupply - totalBorrow).toFixed(2)}`)
    lines.push(`Net APY,${netApy.toFixed(2)}%`)
    lines.push(`Estimated Interest Earned (USD),${totalInterest.toFixed(2)}`)
    lines.push('')

    // Current positions
    lines.push('── CURRENT POSITIONS ─────────────────────────────────────────')
    lines.push('Asset,Chain,Supplied (USD),Borrowed (USD),Last Snapshot')
    for (const p of positions) {
      lines.push([
        escapeCsv(p.asset_id.toUpperCase()),
        escapeCsv(chainName(p.chain_id)),
        escapeCsv(Number(p.supplied_usd).toFixed(2)),
        escapeCsv(Number(p.borrowed_usd).toFixed(2)),
        escapeCsv(fmtDate(p.observed_at)),
      ].join(','))
    }
    lines.push('')

    // Transaction history
    lines.push('── TRANSACTION HISTORY ───────────────────────────────────────')
    lines.push('Date,Type,Asset,Amount (USD),Chain,Tx Hash')
    for (const tx of txs) {
      const type = tx.action_type.replace(/^cross-chain_/, '').toUpperCase()
      lines.push([
        escapeCsv(fmtDate(tx.verified_at)),
        escapeCsv(type),
        escapeCsv((tx.token_symbol ?? '').toUpperCase()),
        escapeCsv(Number(tx.usd_value).toFixed(2)),
        escapeCsv(chainName(tx.chain_id)),
        escapeCsv(tx.tx_hash ?? ''),
      ].join(','))
    }
    lines.push('')

    // P&L / interest breakdown (FIFO)
    lines.push('── INTEREST / P&L (FIFO matching) ────────────────────────────')
    lines.push('Date Redeemed,Asset,Cost Basis (USD),Proceeds (USD),Interest Earned (USD)')
    for (const r of pnl) {
      lines.push([
        escapeCsv(fmtDate(r.date)),
        escapeCsv(r.asset),
        escapeCsv(r.supplied_usd.toFixed(2)),
        escapeCsv(r.redeemed_usd.toFixed(2)),
        escapeCsv(r.interest_usd.toFixed(2)),
      ].join(','))
    }
    lines.push('')
    lines.push(`Total interest earned in period,${totalInterest.toFixed(2)}`)
    lines.push('')
    lines.push('Note: FIFO matching is an estimate. Consult a tax advisor for jurisdiction-specific treatment.')

    const csv = lines.join('\r\n')
    const year = from.getFullYear()
    const filename = `peridot-premium-export-${address.slice(0,8)}-${year}.csv`

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('[premium/export-csv]', err)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
