import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.BICONOMY_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing Biconomy API key' }), { status: 500 })
    }
    const body = await request.json()
    console.log('[API] biconomy/execute body', JSON.stringify({ keys: Object.keys(body || {}) }))
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    
    // Try new endpoint first (/v1/execute), fallback to old (/v1/mee/execute) for backward compatibility
    let resp = await fetch('https://api.biconomy.io/v1/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))
    
    // If new endpoint returns 404, try old endpoint for backward compatibility
    if (resp.status === 404) {
      console.warn('[API] /v1/execute returned 404, trying /v1/mee/execute for backward compatibility')
      const controller2 = new AbortController()
      const timeout2 = setTimeout(() => controller2.abort(), 30000)
      resp = await fetch('https://api.biconomy.io/v1/mee/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: controller2.signal,
      }).finally(() => clearTimeout(timeout2))
    }
    
    const text = await resp.text()
    if (!resp.ok) {
      console.error('[API] biconomy/execute upstream error', resp.status, text)
    }
    return new Response(text, { status: resp.status, headers: { 'Content-Type': 'application/json' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500 })
  }
}


