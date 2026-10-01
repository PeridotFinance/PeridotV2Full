import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.BICONOMY_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing Biconomy API key' }), { status: 500 })
    }
    const body = await request.json()
    console.log('[API] biconomy/compose body', JSON.stringify(body))
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)
    
    // Try the compose endpoint
    let resp = await fetch('https://api.biconomy.io/v1/instructions/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))
    
    // If compose endpoint returns 404, it may be deprecated
    // Check if we can use an alternative approach
    if (resp.status === 404) {
      console.warn('[API] biconomy/compose endpoint returned 404 - endpoint may be deprecated')
      // Try alternative endpoint path (some APIs use /v2 or different paths)
      const altResp = await fetch('https://api.biconomy.io/v2/instructions/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout))
      
      if (altResp.ok) {
        resp = altResp
      } else {
        // Return helpful error message
        const errorMsg = {
          error: 'Biconomy compose endpoint not available',
          message: 'The /v1/instructions/compose endpoint appears to be deprecated or unavailable. Please migrate to using the SDK approach with getFusionQuote() which does not require the compose step.',
          status: 404,
          suggestion: 'Consider using @biconomy/abstractjs SDK with toMultichainNexusAccount and createMeeClient for building instructions directly.',
        }
        return new Response(JSON.stringify(errorMsg), { 
          status: 404, 
          headers: { 'Content-Type': 'application/json' } 
        })
      }
    }
    
    const text = await resp.text()
    if (!resp.ok) {
      console.error('[API] biconomy/compose upstream error', resp.status, text)
    }
    return new Response(text, { status: resp.status, headers: { 'Content-Type': 'application/json' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500 })
  }
}


