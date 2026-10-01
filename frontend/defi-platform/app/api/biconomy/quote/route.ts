import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.BICONOMY_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing Biconomy API key' }), { status: 500 })
    }
    const body = await request.json()
    
    // DoS Protection: Validate essential field presence and size
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 })
    }

    if (body.ownerAddress && typeof body.ownerAddress === 'string' && body.ownerAddress.length > 128) {
      return new Response(JSON.stringify({ error: 'Invalid owner address' }), { status: 400 })
    }

    // Limit the number of flows/instructions to prevent massive upstream processing
    const MAX_FLOWS = 10;
    if (Array.isArray(body.composeFlows) && body.composeFlows.length > MAX_FLOWS) {
      return new Response(JSON.stringify({ error: 'Too many compose flows' }), { status: 400 })
    }
    if (Array.isArray(body.instructions) && body.instructions.length > MAX_FLOWS) {
      return new Response(JSON.stringify({ error: 'Too many instructions' }), { status: 400 })
    }

    // Extract intent-simple flow details for detailed logging
    const intentSimpleFlow = body?.composeFlows?.find((f: any) => f?.type === '/instructions/intent-simple')
    
    console.log('[API] biconomy/quote request details', {
      ownerAddress: body?.ownerAddress,
      mode: body?.mode,
      hasComposeFlows: Boolean(body?.composeFlows?.length),
      composeFlowsCount: Array.isArray(body?.composeFlows) ? body.composeFlows.length : 0,
      hasInstructions: Boolean(body?.instructions?.length),
      instructionsCount: Array.isArray(body?.instructions) ? body.instructions.length : 0,
      sponsorship: body?.sponsorship,
      hasTrigger: Boolean(body?.trigger),
      authorizations: Array.isArray(body?.authorizations) ? body.authorizations.length : 0,
      fundingTokens: body?.fundingTokens,
      feeToken: body?.feeToken,
      preferOnChainFunding: body?.preferOnChainFunding,
      intentSimpleFlow: intentSimpleFlow ? {
        srcToken: intentSimpleFlow.data?.srcToken,
        dstToken: intentSimpleFlow.data?.dstToken,
        srcChainId: intentSimpleFlow.data?.srcChainId,
        dstChainId: intentSimpleFlow.data?.dstChainId,
        amount: intentSimpleFlow.data?.amount,
        slippage: intentSimpleFlow.data?.slippage,
      } : null,
      allComposeFlows: body?.composeFlows?.map((f: any, idx: number) => ({
        index: idx,
        type: f.type,
        ...(f.type === '/instructions/intent-simple' ? {
          srcToken: f.data?.srcToken,
          dstToken: f.data?.dstToken,
          srcChainId: f.data?.srcChainId,
          dstChainId: f.data?.dstChainId,
          amount: f.data?.amount,
          slippage: f.data?.slippage,
        } : {
          functionSignature: f.data?.functionSignature,
          to: f.data?.to,
          chainId: f.data?.chainId,
        }),
      })),
    })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 40000)
    
    // New API: /v1/quote accepts composeFlows directly (no compose step needed)
    // Support both old format (instructions) and new format (composeFlows)
    const quotePayload: any = {
        ownerAddress: body?.ownerAddress,
        mode: body?.mode || 'eoa',
      // New format: composeFlows (preferred)
      ...(body?.composeFlows ? { composeFlows: body.composeFlows } : {}),
      // Old format: instructions (for backward compatibility)
      ...(body?.instructions ? { instructions: body.instructions } : {}),
        fundingTokens: body?.fundingTokens,
        feeToken: body?.feeToken,
        preferOnChainFunding: body?.preferOnChainFunding,
        trigger: body?.trigger,
        // Forward sponsorship/delegation fields when present for gasless UX
        sponsorship: body?.sponsorship,
        delegate: body?.delegate,
        authorization: body?.authorization,
        sponsorshipOptions: body?.sponsorshipOptions,
        authorizations: body?.authorizations,
        // Forward simulation parameter for accurate gas estimation
        simulation: body?.simulation,
    }
    
    // Try new endpoint first (/v1/quote), fallback to old (/v1/mee/quote) for backward compatibility
    let resp = await fetch('https://api.biconomy.io/v1/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(quotePayload),
      cache: 'no-store',
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))
    
    // If new endpoint returns 404, try old endpoint for backward compatibility
    if (resp.status === 404 && body?.instructions && !body?.composeFlows) {
      console.warn('[API] /v1/quote returned 404, trying /v1/mee/quote for backward compatibility')
      const controller2 = new AbortController()
      const timeout2 = setTimeout(() => controller2.abort(), 40000)
      resp = await fetch('https://api.biconomy.io/v1/mee/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify(quotePayload),
        cache: 'no-store',
        signal: controller2.signal,
      }).finally(() => clearTimeout(timeout2))
    }
    const text = await resp.text()
    if (!resp.ok) {
      let errorDetails: any = { status: resp.status, response: text }
      try {
        const errorJson = JSON.parse(text)
        errorDetails = { ...errorDetails, ...errorJson }
      } catch {
        // Not JSON, keep text as-is
      }
      
      console.error('[API] biconomy/quote upstream error', resp.status, {
        ...errorDetails,
        requestContext: {
          ownerAddress: body?.ownerAddress,
          intentSimpleFlow: intentSimpleFlow ? {
            srcToken: intentSimpleFlow.data?.srcToken,
            dstToken: intentSimpleFlow.data?.dstToken,
            srcChainId: intentSimpleFlow.data?.srcChainId,
            dstChainId: intentSimpleFlow.data?.dstChainId,
            amount: intentSimpleFlow.data?.amount,
            slippage: intentSimpleFlow.data?.slippage,
          } : null,
          fundingTokens: body?.fundingTokens,
          feeToken: body?.feeToken,
        },
      })
    }
    return new Response(text, { status: resp.status, headers: { 'Content-Type': 'application/json' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500 })
  }
}
