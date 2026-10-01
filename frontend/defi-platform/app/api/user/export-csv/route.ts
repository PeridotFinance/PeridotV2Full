import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'
import { resolveLinkedEvmWallets } from '@/lib/linkedAccountResolver'
import { authenticateUserScope, ensureScopeOwnsAddress } from '@/lib/auth/userScope'

const EXPORT_CACHE_TTL_MS = 20_000
const EXPORT_TIMEOUT_MS = 20_000

type CsvExportData = {
  csvContent: string
  filename: string
}

const exportCache = new Map<string, { data: CsvExportData; timestamp: number }>()
const pendingExports = new Map<string, Promise<CsvExportData>>()

// Helper to get chain display name
function getChainDisplayName(chainId: number | null): string {
  if (!chainId) return 'Unknown'

  const chainMap: Record<number, string> = {
    1: 'Ethereum',
    56: 'BNB Smart Chain',
    42161: 'Arbitrum',
    8453: 'Base',
    59144: 'Linea',
    10: 'Optimism',
    137: 'Polygon',
    324: 'zkSync',
    1868: 'Somnia',
    43114: 'Avalanche',
    97: 'BNB Testnet',
    421614: 'Arbitrum Sepolia',
    84532: 'Base Sepolia',
    11155111: 'Ethereum Sepolia',
    10143: 'Monad Testnet',
    1075: 'IOTA EVM Testnet',
    50312: 'Somnia Testnet',
  }

  return chainMap[chainId] || `Chain ${chainId}`
}

function escapeCsvValue(value: any): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().split('T')[0] + ' ' + d.toTimeString().split(' ')[0]
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('EXPORT_TIMEOUT'))
    }, timeoutMs)

    promise
      .then((result) => {
        clearTimeout(timeout)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timeout)
        reject(error)
      })
  })
}

function csvResponse(payload: CsvExportData, cacheState: string) {
  return new NextResponse(payload.csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${payload.filename}"`,
      'Cache-Control': 'private, max-age=20, stale-while-revalidate=40',
      'X-Cache': cacheState,
    },
  })
}

async function generateCsvExport(params: {
  address: string
  accountId: number | null
  walletAddresses: string[]
}): Promise<CsvExportData> {
  const { address, accountId, walletAddresses } = params
  const t = getTableNames()

  const [transactionData, portfolioApy, currentPositions] = await Promise.all([
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
        AND action_type IN ('supply', 'borrow', 'repay', 'redeem', 'cross-chain_supply', 'cross-chain_borrow', 'cross-chain_repay', 'cross-chain_redeem')
      ORDER BY verified_at DESC`,
      [walletAddresses]
    ),
    query(
      `WITH filtered AS (
        SELECT net_apy_pct, total_supply_usd, total_borrow_usd, updated_at, breakdown
        FROM ${t.userPortfolioApySnapshots}
        WHERE address = ANY($1::text[])
      )
      SELECT
        AVG(net_apy_pct) AS net_apy_pct,
        SUM(total_supply_usd) AS total_supply_usd,
        SUM(total_borrow_usd) AS total_borrow_usd,
        MAX(updated_at) AS updated_at,
        (ARRAY_AGG(breakdown ORDER BY updated_at DESC))[1] AS breakdown
      FROM filtered`,
      [walletAddresses]
    ),
    query(
      `SELECT DISTINCT ON (asset_id, chain_id)
        asset_id,
        chain_id,
        supplied_usd,
        borrowed_usd,
        observed_at
      FROM ${t.userBalanceSnapshots}
      WHERE address = ANY($1::text[])
        AND (supplied_usd > 0 OR borrowed_usd > 0)
      ORDER BY asset_id, chain_id, observed_at DESC`,
      [walletAddresses]
    ),
  ])

  const transactions = transactionData.rows || []
  const currentPortfolio = portfolioApy.rows?.[0]
  const positions = currentPositions.rows || []

  const apyBreakdown: Record<string, { supplyApy?: number; borrowApy?: number }> = {}
  try {
    if (currentPortfolio?.breakdown && typeof currentPortfolio.breakdown === 'object') {
      const breakdown = currentPortfolio.breakdown as any
      Object.keys(breakdown).forEach((chainId) => {
        const chainData = breakdown[chainId]
        if (chainData && typeof chainData === 'object') {
          Object.keys(chainData).forEach((assetId) => {
            const assetData = chainData[assetId]
            if (assetData) {
              const key = `${chainId}-${assetId}`
              const supplyApy = assetData.supplyApy || assetData.supply_apy
              const borrowApy = assetData.borrowApy || assetData.borrow_apy
              apyBreakdown[key] = {
                supplyApy: supplyApy ? parseFloat(String(supplyApy)) || 0 : 0,
                borrowApy: borrowApy ? parseFloat(String(borrowApy)) || 0 : 0,
              }
            }
          })
        }
      })
    }
  } catch (error) {
    console.warn('Failed to parse APY breakdown:', error)
  }

  const csvLines: string[] = []
  csvLines.push('Peridot Portfolio Export')
  csvLines.push(`Generated: ${new Date().toISOString()}`)
  csvLines.push(`Requested Address: ${address}`)
  csvLines.push(`Resolved Wallet Scope: ${walletAddresses.join(' | ')}`)
  if (accountId) csvLines.push(`Peridot Account ID: ${accountId}`)
  csvLines.push('')

  csvLines.push('PORTFOLIO SUMMARY')
  csvLines.push('Metric,Value')
  const totalSupplied = parseFloat(currentPortfolio?.total_supply_usd || '0') || 0
  const totalBorrowed = parseFloat(currentPortfolio?.total_borrow_usd || '0') || 0
  const netApy = parseFloat(currentPortfolio?.net_apy_pct || '0') || 0
  csvLines.push(`Total Supplied (USD),${escapeCsvValue(totalSupplied.toFixed(2))}`)
  csvLines.push(`Total Borrowed (USD),${escapeCsvValue(totalBorrowed.toFixed(2))}`)
  csvLines.push(`Net Portfolio Value (USD),${escapeCsvValue((totalSupplied - totalBorrowed).toFixed(2))}`)
  csvLines.push(`Net APY,${escapeCsvValue(netApy.toFixed(2))}%`)
  csvLines.push(`Last Updated,${escapeCsvValue(currentPortfolio?.updated_at ? formatDate(currentPortfolio.updated_at) : 'N/A')}`)
  csvLines.push('')

  csvLines.push('TRANSACTION HISTORY')
  csvLines.push('Date,Time,Type,Token,Amount (USD),Chain,Transaction Hash')

  transactions.forEach((tx: any) => {
    const date = new Date(tx.verified_at)
    const dateStr = date.toISOString().split('T')[0]
    const timeStr = date.toTimeString().split(' ')[0]
    const type = tx.action_type.replace('cross-chain_', '').replace('_', ' ').toUpperCase()
    const token = tx.token_symbol || 'Unknown'
    const amount = parseFloat(tx.usd_value) || 0
    const chain = getChainDisplayName(tx.chain_id)
    const txHash = tx.tx_hash || 'N/A'

    csvLines.push([
      escapeCsvValue(dateStr),
      escapeCsvValue(timeStr),
      escapeCsvValue(type),
      escapeCsvValue(token),
      escapeCsvValue(amount.toFixed(2)),
      escapeCsvValue(chain),
      escapeCsvValue(txHash),
    ].join(','))
  })

  csvLines.push('')
  csvLines.push('SUPPLIED ASSETS')
  csvLines.push('Asset,Chain,Balance (USD),Supply APY (%),Last Updated')

  const suppliedPositions = positions.filter((pos: any) => parseFloat(pos.supplied_usd || 0) > 0)
  if (suppliedPositions.length > 0) {
    suppliedPositions.forEach((pos: any) => {
      const key = `${pos.chain_id}-${pos.asset_id}`
      const apy = apyBreakdown[key]?.supplyApy
      csvLines.push([
        escapeCsvValue(pos.asset_id || 'Unknown'),
        escapeCsvValue(getChainDisplayName(pos.chain_id)),
        escapeCsvValue(parseFloat(pos.supplied_usd || 0).toFixed(2)),
        escapeCsvValue(apy ? apy.toFixed(2) : 'N/A'),
        escapeCsvValue(formatDate(pos.observed_at)),
      ].join(','))
    })
  } else {
    csvLines.push('No supplied assets')
  }

  csvLines.push('')
  csvLines.push('BORROWED ASSETS')
  csvLines.push('Asset,Chain,Balance (USD),Borrow APY (%),Last Updated')

  const borrowedPositions = positions.filter((pos: any) => parseFloat(pos.borrowed_usd || 0) > 0)
  if (borrowedPositions.length > 0) {
    borrowedPositions.forEach((pos: any) => {
      const key = `${pos.chain_id}-${pos.asset_id}`
      const apy = apyBreakdown[key]?.borrowApy
      csvLines.push([
        escapeCsvValue(pos.asset_id || 'Unknown'),
        escapeCsvValue(getChainDisplayName(pos.chain_id)),
        escapeCsvValue(parseFloat(pos.borrowed_usd || 0).toFixed(2)),
        escapeCsvValue(apy ? apy.toFixed(2) : 'N/A'),
        escapeCsvValue(formatDate(pos.observed_at)),
      ].join(','))
    })
  } else {
    csvLines.push('No borrowed assets')
  }

  csvLines.push('')
  csvLines.push('TRANSACTION STATISTICS')
  csvLines.push('Metric,Value')

  const supplyTxs = transactions.filter((tx: any) => tx.action_type === 'supply' || tx.action_type === 'cross-chain_supply')
  const borrowTxs = transactions.filter((tx: any) => tx.action_type === 'borrow' || tx.action_type === 'cross-chain_borrow')
  const repayTxs = transactions.filter((tx: any) => tx.action_type === 'repay' || tx.action_type === 'cross-chain_repay')
  const redeemTxs = transactions.filter((tx: any) => tx.action_type === 'redeem' || tx.action_type === 'cross-chain_redeem')

  const totalSupplyValue = supplyTxs.reduce((sum: number, tx: any) => sum + (parseFloat(tx.usd_value) || 0), 0)
  const totalBorrowValue = borrowTxs.reduce((sum: number, tx: any) => sum + (parseFloat(tx.usd_value) || 0), 0)

  csvLines.push(`Total Transactions,${escapeCsvValue(transactions.length)}`)
  csvLines.push(`Supply Transactions,${escapeCsvValue(supplyTxs.length)}`)
  csvLines.push(`Borrow Transactions,${escapeCsvValue(borrowTxs.length)}`)
  csvLines.push(`Repay Transactions,${escapeCsvValue(repayTxs.length)}`)
  csvLines.push(`Redeem Transactions,${escapeCsvValue(redeemTxs.length)}`)
  csvLines.push(`Total Supply Value (USD),${escapeCsvValue(totalSupplyValue.toFixed(2))}`)
  csvLines.push(`Total Borrow Value (USD),${escapeCsvValue(totalBorrowValue.toFixed(2))}`)

  const csvContent = csvLines.join('\n')
  const filename = `peridot-portfolio-export-${new Date().toISOString().split('T')[0]}.csv`
  return { csvContent, filename }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const address = searchParams.get('address')

    if (!address) {
      return NextResponse.json({ success: false, error: 'Missing address' }, { status: 400 })
    }

    // Private financial export — gate to the authenticated owner. Without this,
    // any caller could download anyone's full transaction history by address.
    const scope = await authenticateUserScope(request)
    if (!scope) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await ensureScopeOwnsAddress(scope, address))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { accountId, walletAddresses, cacheScopeKey } = await resolveLinkedEvmWallets(address)
    const cacheKey = `${cacheScopeKey}:csv:v1`

    const cached = exportCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < EXPORT_CACHE_TTL_MS) {
      return csvResponse(cached.data, 'HIT')
    }

    if (pendingExports.has(cacheKey)) {
      const coalesced = await pendingExports.get(cacheKey)
      if (coalesced) return csvResponse(coalesced, 'COALESCED')
    }

    const exportPromise = withTimeout(
      generateCsvExport({
        address,
        accountId,
        walletAddresses,
      }),
      EXPORT_TIMEOUT_MS
    )
    pendingExports.set(cacheKey, exportPromise)

    try {
      const generated = await exportPromise
      exportCache.set(cacheKey, {
        data: generated,
        timestamp: Date.now(),
      })
      return csvResponse(generated, 'MISS')
    } finally {
      pendingExports.delete(cacheKey)
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'EXPORT_TIMEOUT') {
      return NextResponse.json(
        {
          success: false,
          error: 'Export generation timed out. Please retry in a few seconds.',
        },
        {
          status: 503,
          headers: {
            'Retry-After': '10',
          },
        }
      )
    }

    console.error('GET /api/user/export-csv error:', error)
    return NextResponse.json({ success: false, error: 'Failed to generate CSV export' }, { status: 500 })
  }
}
