import { NextRequest } from 'next/server'
import { bitgetHeaders } from '@/lib/swap/bitget-sign'

const BITGET_BASE = 'https://bopenapi.bgwapi.io'

const API_PATH = '/bgw-pro/swapx/order/getSwapOrder'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body?.orderId) {
      return new Response(
        JSON.stringify({ error: 'orderId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const payload = {
      orderId: body.orderId,
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)

    const resp = await fetch(`${BITGET_BASE}${API_PATH}`, {
      method: 'POST',
      headers: bitgetHeaders(API_PATH, payload),
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))

    const text = await resp.text()
    if (!resp.ok) {
      console.error('[API] swap/status upstream error', resp.status, text)
    }
    return new Response(text, {
      status: resp.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return new Response(
        JSON.stringify({ error: 'Bitget status request timed out' }),
        { status: 504, headers: { 'Content-Type': 'application/json' } },
      )
    }
    console.error('[API] swap/status error', err)
    return new Response(
      JSON.stringify({ error: String(err?.message || err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

export const dynamic = 'force-dynamic'
