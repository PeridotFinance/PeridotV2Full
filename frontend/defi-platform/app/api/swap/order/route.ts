import { NextRequest } from 'next/server'
import { bitgetHeaders } from '@/lib/swap/bitget-sign'
import { FEE_RATE } from '@/lib/swap/fee-config'

const BITGET_BASE = 'https://bopenapi.bgwapi.io'

const API_PATH = '/bgw-pro/swapx/order/makeSwapOrder'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body?.fromChain || !body?.toChain || !body?.fromAmount || !body?.fromAddress) {
      return new Response(
        JSON.stringify({ error: 'fromChain, toChain, fromAmount, and fromAddress are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const payload = {
      fromChain: body.fromChain,
      toChain: body.toChain,
      fromContract: body.fromContract ?? '',
      toContract: body.toContract ?? '',
      fromAmount: body.fromAmount,
      fromAddress: body.fromAddress,
      toAddress: body.toAddress ?? body.fromAddress,
      slippage: body.slippage ?? '0.005',
      feeRate: body.feeRate ?? FEE_RATE,
      market: body.market ?? '',
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 40_000)

    const resp = await fetch(`${BITGET_BASE}${API_PATH}`, {
      method: 'POST',
      headers: bitgetHeaders(API_PATH, payload),
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))

    const text = await resp.text()
    if (!resp.ok) {
      console.error('[API] swap/order upstream error', resp.status, text)
    }
    return new Response(text, {
      status: resp.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return new Response(
        JSON.stringify({ error: 'Bitget order request timed out' }),
        { status: 504, headers: { 'Content-Type': 'application/json' } },
      )
    }
    console.error('[API] swap/order error', err)
    return new Response(
      JSON.stringify({ error: String(err?.message || err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

export const dynamic = 'force-dynamic'
