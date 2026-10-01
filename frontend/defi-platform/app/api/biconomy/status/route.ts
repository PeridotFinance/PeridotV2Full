import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.BICONOMY_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing Biconomy API key' }), { status: 500 })
    }
    const { searchParams } = new URL(request.url)
    const hash = searchParams.get('hash')
    if (!hash) {
      return new Response(JSON.stringify({ error: 'Missing hash' }), { status: 400 })
    }

    // According to Biconomy docs, the correct endpoint for tracking execution is:
    // https://network.biconomy.io/v1/explorer/{stx-hash}
    // This requires the X-API-Key header (which we're already providing)
    const endpoints = [
      `https://network.biconomy.io/v1/explorer/${encodeURIComponent(hash)}`,
      // Fallback to old endpoints for backward compatibility
      `https://api.biconomy.io/v1/mee/receipt?hash=${encodeURIComponent(hash)}`,
      `https://api.biconomy.io/v1/mee/receipt?superTxHash=${encodeURIComponent(hash)}`,
    ]

    let lastError: Error | null = null
    let lastStatus = 404

    for (const url of endpoints) {
      try {
        const resp = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
          cache: 'no-store',
        })
        
        if (resp.ok) {
          const receiptText = await resp.text()
          return new Response(receiptText, { 
            status: resp.status, 
            headers: { 'Content-Type': 'application/json' } 
          })
        }
        
        // Store last error for fallback
        lastStatus = resp.status
        if (resp.status !== 404) {
          // If it's not 404, it might be a different error we should return
          const errorText = await resp.text()
          return new Response(JSON.stringify({ 
            error: `API returned ${resp.status}`,
            message: errorText,
            endpoint: url
          }), { 
            status: resp.status, 
            headers: { 'Content-Type': 'application/json' } 
          })
        }
      } catch (err: any) {
        lastError = err
        continue
      }
    }

    // If all endpoints failed, return helpful error
    return new Response(JSON.stringify({ 
      error: 'Transaction not found',
      message: `Could not find transaction with hash: ${hash}`,
      triedEndpoints: endpoints,
      suggestion: 'Ensure the hash is a valid Biconomy supertransaction hash. Use getMeeScanLink() to verify the hash format.'
    }), { 
      status: 404, 
      headers: { 'Content-Type': 'application/json' } 
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500 })
  }
}


