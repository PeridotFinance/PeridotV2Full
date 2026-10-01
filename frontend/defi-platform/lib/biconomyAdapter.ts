import type { Address } from 'viem'
import { bsc } from 'viem/chains'
import { PERIDOT_CONTROLLER, getUnderlyingToken, BICONOMY_API_URL, TOKENS, BSC_UNDERLYING_TOKENS } from '../biconomy/constants'
import { getMeeScanLink } from '@biconomy/abstractjs'
import type {
  CrossChainAdapter,
  StartSupplyParams,
  StartSupplyResult,
  StartWithdrawParams,
  StartWithdrawResult,
  StartBorrowParams,
  StartBorrowResult,
  StartRepayParams,
  StartRepayResult,
  GetStatusParams,
  GetStatusResult,
} from './crossChainAdapter'
import { CHAIN_BY_ID, createWalletClientForProvider, describeProviders, selectInjectedProvider, isPrivyProvider } from './biconomy/wallet'
import { extractQuotePayloads, getChainIdsFromPayloads, unwrapPayload } from './biconomy/payload'

// Collate WETH addresses across supported networks to make WETH-specific diagnostics simpler
const KNOWN_WETH_ADDRESSES = (() => {
  const addrs: string[] = [
    BSC_UNDERLYING_TOKENS.WETH?.toLowerCase?.(),
  ]
  const networks: Array<keyof typeof TOKENS> = ['mainnet', 'arbitrum', 'ethereum', 'optimism', 'polygon', 'base']
  for (const key of networks) {
    const maybe = (TOKENS as any)?.[key]?.WETH as Address | undefined
    if (maybe) addrs.push(maybe.toLowerCase())
  }
  return new Set(addrs.filter(Boolean))
})()

// Client-side adapter that calls Next server API to keep API key server-side

export class BiconomyAdapter implements CrossChainAdapter {
  async preQuote(params: any): Promise<any> {
    const { userAddress, smartAccountAddress, sourceChainId, sourceTokenAddress, destinationChainId, pTokenAddress, amountWei, slippage = 1, enableSimulation = false, executionMode: requestedExecutionMode } = params
    console.log('[BiconomyAdapter] 🔍 preQuote ENTRY - received executionMode:', { requestedExecutionMode, userAddress, smartAccountAddress })
    const underlying = getUnderlyingToken(pTokenAddress)
    const executionMode = requestedExecutionMode || 'eoa'
    console.log('[BiconomyAdapter] 🔍 preQuote - final executionMode:', executionMode)
    // For supply: source tokens are on EOA, so always use EOA address for quote
    const ownerAddress = userAddress

    const composeBody = {
      ownerAddress,
      mode: executionMode,
      composeFlows: [
        {
          type: '/instructions/intent-simple',
          data: {
            srcToken: sourceTokenAddress,
            dstToken: underlying,
            srcChainId: sourceChainId,
            dstChainId: destinationChainId,
            amount: amountWei.toString(),
            slippage,
          },
        },
      ],
    }
    // NEW API FLOW: Skip compose step, pass composeFlows directly to quote endpoint
    // The /v1/quote endpoint now accepts composeFlows directly (compose endpoint is deprecated)
    const quotePayload: any = {
      ownerAddress,
      mode: executionMode,
      // Pass composeFlows directly to quote (no compose step needed)
      composeFlows: composeBody.composeFlows,
      fundingTokens: [{ tokenAddress: sourceTokenAddress, chainId: sourceChainId, amount: amountWei.toString() }],
      feeToken: { address: sourceTokenAddress, chainId: sourceChainId },
      // Enable simulation for accurate gas estimation on spoke chains
      ...(enableSimulation ? { simulation: { simulate: true } } : {}),
    }
    let quoteRes = await fetch('/api/biconomy/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quotePayload),
    })
    if (!quoteRes.ok) {
      const errText = await quoteRes.text()
      // Retry once on transient rate-limit errors (Biconomy infrastructure 500s)
      if (/rate.?limit|server.?busy/i.test(errText)) {
        await new Promise(r => setTimeout(r, 2500))
        quoteRes = await fetch('/api/biconomy/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(quotePayload),
        })
        if (!quoteRes.ok) throw new Error(await quoteRes.text())
      } else {
        throw new Error(errText)
      }
    }
    const quote = await quoteRes.json()
    const normalizedFee = (quote as any)?.fee || (quote as any)?.result?.fee || undefined
    const paymentInfo = (quote as any)?.quote?.paymentInfo || (quote as any)?.result?.quote?.paymentInfo || undefined
    const feeDetails = {
      amount: normalizedFee?.amount,
      token: normalizedFee?.token,
      chainId: normalizedFee?.chainId,
      paymentToken: paymentInfo?.token,
      paymentTokenWeiAmount: paymentInfo?.tokenWeiAmount,
      paymentTokenValue: paymentInfo?.tokenValue,
    }
    return { fee: normalizedFee, feeDetails }
  }

  async startWithdraw(params: StartWithdrawParams): Promise<StartWithdrawResult> {
    const { userAddress, withdrawMarket, withdrawAmount, pTokenAmount, targetChainId, targetTokenAddress, slippage = 0.1, meeAuthorization } = params

    if (!withdrawAmount && !pTokenAmount) throw new Error('Either withdrawAmount or pTokenAmount must be provided')

    const underlying = getUnderlyingToken(withdrawMarket)

    // Compose: redeem on BSC → bridge to target or transfer to user
    const composeFlows: any[] = [
      {
        type: '/instructions/build',
        data: {
          functionSignature: pTokenAmount ? 'function redeem(uint256)' : 'function redeemUnderlying(uint256)',
          args: [(pTokenAmount || withdrawAmount)!.toString()],
          to: withdrawMarket,
          chainId: bsc.id,
          value: '0',
        },
      },
    ]

    if (targetChainId && targetTokenAddress) {
      composeFlows.push({
        type: '/instructions/intent-simple',
        data: {
          srcToken: underlying,
          dstToken: targetTokenAddress,
          srcChainId: bsc.id,
          dstChainId: targetChainId,
          amount: { type: 'runtimeErc20Balance', tokenAddress: underlying, constraints: { gte: '1' } },
          slippage,
        },
      })
    } else {
      composeFlows.push({
        type: '/instructions/build',
        data: {
          functionSignature: 'function transfer(address,uint256)',
          args: [userAddress, { type: 'runtimeErc20Balance', tokenAddress: underlying, constraints: { gte: '1' } }],
          to: underlying,
          chainId: bsc.id,
          value: '0',
        },
      })
    }

    const composeBody = { ownerAddress: userAddress, mode: 'eoa', composeFlows }

    const dispatchPhase = (phase: string, meta?: any) => {
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('peridot:biconomy-phase', { detail: { phase, meta } }))
        }
      } catch {}
    }

    dispatchPhase('compose-start', { operation: 'withdraw', ownerAddress: userAddress, withdrawAmount: withdrawAmount?.toString(), pTokenAmount: pTokenAmount?.toString() })

    const composeRes = await fetch('/api/biconomy/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(composeBody),
    })
    if (!composeRes.ok) throw new Error(`Compose failed: ${await composeRes.text()}`)
    const { instructions } = await composeRes.json()
    dispatchPhase('compose-ok', { operation: 'withdraw', instructionsCount: Array.isArray(instructions) ? instructions.length : 0 })

    // Quote: prefer sponsored; for withdrawals, if funding is needed, use the BSC underlying just redeemed
    const fundingTokenAddress = underlying
    const fundingChainId = bsc.id
    const inferredAmount = ((pTokenAmount ?? withdrawAmount) ?? BigInt(0)).toString()
    const quotePayload: any = {
      ownerAddress: userAddress,
      mode: 'eoa',
      instructions,
      sponsorship: true,
      // If funding is required, hint funding token on BSC (runtime amount is not supported here; use a conservative amount if needed)
      fundingTokens: [{ tokenAddress: fundingTokenAddress, chainId: fundingChainId, amount: inferredAmount }],
      feeToken: { address: fundingTokenAddress, chainId: fundingChainId },
      ...(meeAuthorization ? { delegate: true, authorization: meeAuthorization } : {}),
    }

    dispatchPhase('quote-start', { operation: 'withdraw', fundingToken: fundingTokenAddress, fundingChainId })

    let quoteRes = await fetch('/api/biconomy/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quotePayload),
    })
    if (!quoteRes.ok) {
      const errText = await quoteRes.text()
      // Retry with explicit on-chain funding preference if permit path fails
      const isPermitFailure = /nonces\(\)|permit signing failed|EIP-2612/i.test(errText)
      if (isPermitFailure) {
        try {
          const retryPayload = { ...quotePayload, preferOnChainFunding: true }
          quoteRes = await fetch('/api/biconomy/quote', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(retryPayload),
          })
        } catch {}
      }
      if (!quoteRes.ok) throw new Error(`Quote failed: ${errText}`)
    }
    const quote = await quoteRes.json()
    dispatchPhase('quote-ok', { operation: 'withdraw' })

    // Surface on-chain approval if required (spender + token on BSC)
    try {
      const quoteType: string | undefined = (quote?.quoteType || quote?.type || quote?.funding?.type || '').toString().toLowerCase?.()
      const funding = quote?.funding || quote?.payloads?.funding || null
      const requiresOnchain = quoteType === 'onchain' || funding?.mode === 'onchain' || funding?.type === 'onchain'
      const spender: string | undefined = funding?.spender || funding?.approval?.spender || funding?.transactions?.[0]?.to
      if (requiresOnchain && spender && typeof spender === 'string') {
        const data = { spender, tokenAddress: fundingTokenAddress, amount: inferredAmount, chainId: fundingChainId }
        throw new Error(`BICONOMY_ONCHAIN_APPROVAL_REQUIRED:${JSON.stringify(data)}`)
      }
    } catch {}

    // Sign payloads
    const { payloads, rawPayloads } = extractQuotePayloads(quote)
    if (!payloads.length) {
      console.error('[BiconomyAdapter] Withdraw quote missing signable payloads; aborting execute', { rawPayloadCount: rawPayloads.length })
      throw new Error('BICONOMY_MISSING_SIGNABLE_PAYLOADS')
    }

    const { provider: picked, candidates, matched } = await selectInjectedProvider(userAddress)
    try {
      console.log('[BiconomyAdapter] withdraw provider selection', {
        candidates: describeProviders(candidates),
        matched,
      })
    } catch {}
    const walletClient = createWalletClientForProvider(picked)
    const inferPrimaryType = (types: Record<string, any>): string => { const keys = Object.keys(types || {}).filter(k => k !== 'EIP712Domain'); return keys[0] || 'Permit' }

    dispatchPhase('sign-start', { operation: 'withdraw', payloadCount: payloads.length })

    const signedPayloads = [] as any[]
    for (const pRaw of payloads) {
      const hasWrapperTypeData = pRaw && pRaw.type && pRaw.data
      const hasSignableWrapper = pRaw && pRaw.signablePayload
      const signable = hasWrapperTypeData ? pRaw.data : hasSignableWrapper ? pRaw.signablePayload : pRaw
      const eip712 = signable?.eip712 || signable
      if (eip712?.domain && eip712?.types && eip712?.message) {
        const primaryType: string = eip712?.primaryType || inferPrimaryType(eip712.types)
        const signature = await walletClient.signTypedData({ account: userAddress as Address, domain: eip712.domain, types: eip712.types, primaryType, message: eip712.message } as any)
        signedPayloads.push(hasSignableWrapper ? { signablePayload: pRaw.signablePayload, metadata: pRaw.metadata, signature } : { message: eip712.message, signature })
        continue
      }
      if (signable?.to && signable?.data != null && signable?.chainId) {
        const chain = CHAIN_BY_ID[signable.chainId] || undefined
        const valueBig = (() => { try { return BigInt(signable?.value ?? '0') } catch { return BigInt(0) } })()
        try {
          let signed: string
          
          if (isPrivyProvider(picked)) {
            console.log('[BiconomyAdapter] Using Privy provider - sending transaction directly (withdraw path)')
            const txHash = await walletClient.sendTransaction({
              account: userAddress as Address,
              chain,
              to: signable.to as Address,
              data: signable.data as `0x${string}`,
              value: valueBig,
            } as any)
            signed = txHash
            console.log('[BiconomyAdapter] Privy smart account transaction executed (withdraw)', { txHash })
          } else {
            try {
              signed = await walletClient.signTransaction({ account: userAddress as Address, chain, to: signable.to as Address, data: signable.data as `0x${string}`, value: valueBig } as any)
              console.log('[BiconomyAdapter] signed transaction ok (withdraw)')
            } catch (signError: any) {
              if (signError?.message?.includes('eth_signTransaction') || 
                  signError?.message?.includes('Method not supported')) {
                console.log('[BiconomyAdapter] signTransaction failed, falling back to sendTransaction (withdraw)', { error: signError.message })
                const txHash = await walletClient.sendTransaction({
                  account: userAddress as Address,
                  chain,
                  to: signable.to as Address,
                  data: signable.data as `0x${string}`,
                  value: valueBig,
                } as any)
                signed = txHash
                console.log('[BiconomyAdapter] Fallback sendTransaction successful (withdraw)', { txHash })
              } else {
                throw signError
              }
            }
          }
          
          signedPayloads.push(hasSignableWrapper ? { signablePayload: pRaw.signablePayload, metadata: pRaw.metadata, signature: signed } : { to: signable.to, data: signable.data, value: signable?.value ?? '0', chainId: signable.chainId, signature: signed })
        } catch (e: any) {
          const reason = e?.message || e || 'unknown'
          console.error('[BiconomyAdapter] signTransaction failed; aborting execute (withdraw path)', { reason, to: signable?.to, chainId: signable?.chainId })
          throw new Error('BICONOMY_SIGN_TRANSACTION_UNSUPPORTED')
        }
        continue
      }
      if (signable?.message) {
        const signature = await (walletClient as any).signMessage?.({ account: userAddress as Address, message: signable.message })
        signedPayloads.push({ message: signable.message, signature })
        continue
      }
      signedPayloads.push(signable)
    }

    // Execute
    dispatchPhase('execute-start', { operation: 'withdraw' })
    const innerQuoteForDiag = (quote?.quote || quote?.result?.quote || undefined) as any
    const execRes = await fetch('/api/biconomy/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerAddress: userAddress, fee: quote?.fee, quoteType: (quote?.quoteType || quote?.type || '').toString().toLowerCase?.(), quote: innerQuoteForDiag || quote, payloadToSign: signedPayloads }),
    })
    if (!execRes.ok) throw new Error(`Execute failed: ${await execRes.text()}`)
    const exec = (await execRes.json()) as { hash?: string; trackingUrl?: string }
    dispatchPhase('execute-ok', { operation: 'withdraw', hash: exec?.hash, trackingUrl: exec?.trackingUrl })

    const innerQuoteAny: any = innerQuoteForDiag || quote || {}
    const normalizedFee = (quote as any)?.fee || (quote as any)?.result?.fee || innerQuoteAny?.fee || null
    const paymentInfo = (quote as any)?.quote?.paymentInfo || innerQuoteAny?.paymentInfo || null
    const feeDetails = {
      amount: normalizedFee?.amount,
      token: normalizedFee?.token,
      chainId: normalizedFee?.chainId,
      paymentToken: paymentInfo?.token,
      paymentTokenWeiAmount: paymentInfo?.tokenWeiAmount,
      paymentTokenValue: paymentInfo?.tokenValue,
    }

    const candidateHash = (exec?.hash || (innerQuoteAny?.hash as string | undefined) || ((quote as any)?.quote?.hash as string | undefined) || ((quote as any)?.result?.quote?.hash as string | undefined)) as string | undefined
    let meeScanLink: string | undefined
    if (candidateHash && /^0x[a-fA-F0-9]{64}$/.test(candidateHash)) { try { meeScanLink = getMeeScanLink(candidateHash as `0x${string}`) } catch {} }
    const resolvedHash = (exec?.hash || candidateHash || '')

    try {
      fetch('/api/biconomy/sponsored-usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ walletAddress: userAddress, superTxHash: resolvedHash, label: 'cross-chain_withdraw' }) }).catch(() => {})
    } catch {}

    return { superTxHash: resolvedHash, trackingUrl: exec?.trackingUrl, fee: normalizedFee || undefined, feeDetails, meeScanLink }
  }

  async startRepay(params: StartRepayParams): Promise<StartRepayResult> {
    const {
      userAddress,
      destinationChainId,
      pTokenAddress,
      amountWei,
      repayMax,
      targetChainId,
      targetTokenAddress,
      slippage = 0.1,
      meeAuthorization,
      sponsorship = true,
      initialFundingAmountWei,
      feeTokenOverride,
      executionMode: requestedExecutionMode,
      triggerMaxAmountWei,
      // Source chain context for bridge + funding
      // These are required for cross-chain repay when user is not on BSC
      // (EOA on spoke)
      // @ts-ignore allow extra fields when called via any
      sourceChainId,
      // @ts-ignore allow extra fields when called via any
      sourceTokenAddress,
      // Internal retry/debug knobs (not part of public interface)
      __attempt = 0,
      __preferOnChainFunding = false,
      __chainMismatchRetry = false,
    } = params as any

    if (!userAddress || !pTokenAddress || !amountWei || amountWei <= BigInt(0)) {
      throw new Error('Missing repay parameters')
    }

    const attempt = Number(__attempt) || 0
    const preferOnChainFunding = Boolean(__preferOnChainFunding)
    if (__chainMismatchRetry && !preferOnChainFunding) {
      // Safety: if we are in a retry path but prefer flag was stripped, restore expectation for diagnostics
      console.warn('[BiconomyAdapter] repay chain mismatch retry flag present without on-chain funding preference', {
        attempt,
      })
    }

    const underlying = getUnderlyingToken(pTokenAddress)

    // Compose: bridge from source → approve → repay → sweep
    const composeFlows: any[] = []

    if (sourceChainId && sourceTokenAddress) {
      composeFlows.push({
        type: '/instructions/intent-simple',
        data: {
          srcToken: sourceTokenAddress,
          dstToken: underlying,
          srcChainId: sourceChainId,
          dstChainId: bsc.id,
          amount: amountWei.toString(),
          slippage,
        },
        batch: false,
      })
    }

    composeFlows.push({
      type: '/instructions/build',
      data: {
        functionSignature: 'function approve(address,uint256)',
        args: [pTokenAddress, { type: 'runtimeErc20Balance', tokenAddress: underlying }],
        to: underlying,
        chainId: destinationChainId,
        value: '0',
      },
      batch: true,
    })

    composeFlows.push({
      type: '/instructions/build',
      data: {
        functionSignature: 'function repayBorrow(uint256)',
        args: [{ type: 'runtimeErc20Balance', tokenAddress: underlying }],
        to: pTokenAddress,
        chainId: bsc.id,
        value: '0',
      },
      batch: true,
    })

    if (targetChainId && targetTokenAddress) {
      // Biconomy intent-simple does not accept runtime balance for amount; fallback to local transfer to EOA on BSC
      composeFlows.push({
        type: '/instructions/build',
        data: {
          functionSignature: 'function transfer(address,uint256)',
          args: [userAddress, { type: 'runtimeErc20Balance', tokenAddress: underlying, constraints: { gte: '1' } }],
          to: underlying,
          chainId: bsc.id,
          value: '0',
        },
        batch: true,
      })
    } else {
      composeFlows.push({
        type: '/instructions/build',
        data: {
          functionSignature: 'function transfer(address,uint256)',
          args: [userAddress, { type: 'runtimeErc20Balance', tokenAddress: underlying, constraints: { gte: '1' } }],
          to: underlying,
          chainId: bsc.id,
          value: '0',
        },
        batch: true,
      })
    }

    const composeBody = { ownerAddress: userAddress, mode: 'eoa' as const, composeFlows }

    const dispatchPhase = (phase: string, meta?: any) => {
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('peridot:biconomy-phase', { detail: { phase, meta } }))
        }
      } catch {}
    }

    dispatchPhase('compose-start', { operation: 'repay', ownerAddress: userAddress, repayAmountWei: amountWei.toString(), attempt })

    try {
      console.groupCollapsed?.('[BiconomyAdapter] repay compose body')
      console.log?.('owner', userAddress)
      console.table?.(
        composeFlows.map((flow: any, idx: number) => ({
          idx,
          type: flow?.type,
          functionSignature: flow?.data?.functionSignature,
          to: flow?.data?.to,
          chainId: flow?.data?.chainId,
        })),
      )
      console.groupEnd?.()
    } catch {}

    const composeStart = Date.now()
    const composeRes = await fetch('/api/biconomy/compose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(composeBody) })
    if (!composeRes.ok) {
      const errText = await composeRes.text()
      console.error('[BiconomyAdapter] repay compose failed', { status: composeRes.status, tookMs: Date.now() - composeStart, body: composeBody, error: errText })
      throw new Error(`Compose failed: ${errText}`)
    }
    const { instructions } = await composeRes.json()
    console.log('[BiconomyAdapter] repay compose ok', { tookMs: Date.now() - composeStart, instructions: instructions?.length })
    dispatchPhase('compose-ok', { operation: 'repay', instructionsCount: Array.isArray(instructions) ? instructions.length : 0 })

    // Quote
    const executionMode = 'eoa'
    const fundingToken = (sourceTokenAddress && sourceChainId)
      ? { address: sourceTokenAddress, chainId: sourceChainId }
      : { address: underlying, chainId: bsc.id }
    const feeToken = feeTokenOverride
      ? { address: feeTokenOverride.address, chainId: feeTokenOverride.chainId }
      : fundingToken
    const fundingTokenEntry = {
      tokenAddress: fundingToken.address,
      chainId: fundingToken.chainId,
      amount: amountWei.toString(),
    }
    const baseQuotePayload: any = {
      ownerAddress: userAddress,
      mode: executionMode,
      instructions,
      sponsorship,
      fundingTokens: [fundingTokenEntry],
      feeToken,
      ...(meeAuthorization ? { delegate: true, authorization: meeAuthorization } : {}),
      ...(preferOnChainFunding ? { preferOnChainFunding: true } : {}),
    }

    if (initialFundingAmountWei && initialFundingAmountWei > BigInt(0)) {
      baseQuotePayload.fundingTokens[0].amount = initialFundingAmountWei.toString()
    }

    try {
      console.log('[BiconomyAdapter] repay quote payload prepared', {
        attempt,
        preferOnChainFunding,
        fundingToken: fundingToken.address,
        feeToken: feeToken.address,
        sponsorship,
        instructionsCount: Array.isArray(instructions) ? instructions.length : undefined,
      })
    } catch {}

    const doQuote = async (payload: any, label: string) => {
      const startedAt = Date.now()
      const res = await fetch('/api/biconomy/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) {
        const errText = await res.text()
        // Retry hint for permit path
        if (/nonces\(\)|permit signing failed|EIP-2612/i.test(errText)) {
          const retryPayload = { ...payload, preferOnChainFunding: true }
          console.warn('[BiconomyAdapter] repay quote permit fallback', { label, errText })
          const retry = await fetch('/api/biconomy/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(retryPayload) })
          if (retry.ok) return await retry.json()
        }
        console.error('[BiconomyAdapter] repay quote failed', { label, status: res.status, tookMs: Date.now() - startedAt, payload, errText })
        throw new Error(`Quote failed: ${errText}`)
      }
      const json = await res.json()
      console.log('[BiconomyAdapter] repay quote ok', { label, tookMs: Date.now() - startedAt, fundingToken: fundingToken.address, feeToken: feeToken.address, preferOnChainFunding })
      return json
    }

    dispatchPhase('quote-start', { operation: 'repay', attempt: sponsorship ? 'sponsored' : 'wallet', preferOnChainFunding })
    let quote = await doQuote(baseQuotePayload, preferOnChainFunding ? 'onchain-pref' : 'default')

    // Netting: if fee token equals funding token, reduce the bridge/repay amount by a conservative fee budget (2.5x like supply)
    try {
      const innerQuoteAny: any = (quote?.quote || quote?.result?.quote || quote || {}) as any
      const paymentInfo: any = innerQuoteAny?.paymentInfo || (quote as any)?.quote?.paymentInfo || null
      const feeTokenAddr: string | undefined = paymentInfo?.token
      const feeWeiStr: string | undefined = paymentInfo?.tokenWeiAmount
      const sameFeeToken = typeof feeTokenAddr === 'string' && feeTokenAddr?.toLowerCase?.() === fundingToken.address?.toLowerCase?.()
      const feeWei = (() => { try { return BigInt(feeWeiStr || '0') } catch { return BigInt(0) } })()
      console.log('[BiconomyAdapter] repay fee analysis', {
        feeToken: feeTokenAddr,
        feeWei: feeWei.toString(),
        sameFeeToken,
        fundingMode: quote?.funding?.mode || quote?.funding?.type,
      })
      if (sameFeeToken && feeWei > BigInt(0) && !repayMax) {
        const feeBudgetWei = ((feeWei * BigInt(5)) + BigInt(1)) / BigInt(2) // ceil(2.5x)
        const netWei = amountWei - feeBudgetWei
        if (netWei <= BigInt(0)) {
          throw new Error('INSUFFICIENT_FOR_FEE_BUDGET')
        }
        // Re-compose repay route with net amount
        const composeFlowsNet: any[] = []
        if (sourceChainId && sourceTokenAddress) {
          composeFlowsNet.push({
            type: '/instructions/intent-simple',
            data: { srcToken: sourceTokenAddress, dstToken: underlying, srcChainId: sourceChainId, dstChainId: bsc.id, amount: netWei.toString(), slippage },
            batch: false,
          })
        }
        composeFlowsNet.push(
          { type: '/instructions/build', data: { functionSignature: 'function approve(address,uint256)', args: [pTokenAddress, { type: 'runtimeErc20Balance', tokenAddress: underlying }], to: underlying, chainId: destinationChainId, value: '0' }, batch: true },
          { type: '/instructions/build', data: { functionSignature: 'function repayBorrow(uint256)', args: [{ type: 'runtimeErc20Balance', tokenAddress: underlying }], to: pTokenAddress, chainId: destinationChainId, value: '0' }, batch: true },
          { type: '/instructions/build', data: { functionSignature: 'function transfer(address,uint256)', args: [userAddress, { type: 'runtimeErc20Balance', tokenAddress: underlying, constraints: { gte: '1' } }], to: underlying, chainId: bsc.id, value: '0' }, batch: true },
        )
        const composeResNet = await fetch('/api/biconomy/compose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ownerAddress: userAddress, mode: 'eoa', composeFlows: composeFlowsNet }) })
        if (!composeResNet.ok) throw new Error(`Compose (net) failed: ${await composeResNet.text()}`)
        const { instructions: instructionsNet } = await composeResNet.json()
        const quotePayloadNet: any = {
          ownerAddress: userAddress,
          mode: 'eoa',
          instructions: instructionsNet,
          fundingTokens: [{ tokenAddress: fundingToken.address, chainId: fundingToken.chainId, amount: netWei.toString() }],
          feeToken: fundingToken,
          sponsorship: true,
          delegate: true,
          ...(meeAuthorization ? { authorization: meeAuthorization } : {}),
          ...(fundingToken.chainId !== bsc.id ? { preferOnChainFunding: true } : {}),
        }
        quote = await doQuote(quotePayloadNet, 'repay-net')
        // Validate final fee within budget
        const finalInner: any = (quote?.quote || quote?.result?.quote || quote || {}) as any
        const finalFeeWei = (() => { try { return BigInt(finalInner?.paymentInfo?.tokenWeiAmount || '0') } catch { return BigInt(0) } })()
        if (finalFeeWei > feeBudgetWei) throw new Error('FEE_EXCEEDS_TOLERANCE')
      }

      // For repayMax with same-fee-token: validate the user has enough to keep the repay amount fixed and pay fee on top
      if (sameFeeToken && feeWei > BigInt(0) && repayMax) {
        try {
          // If fee must be paid on top, ensure compose used amountWei for bridge and fee is handled separately via funding
          // Nothing to net here; just sanity-check non-zero amount
          if (amountWei <= BigInt(0)) throw new Error('INSUFFICIENT_FOR_FEE_BUDGET')
        } catch {}
      }
    } catch (e) {
      if (e instanceof Error && /INSUFFICIENT_FOR_FEE_BUDGET|FEE_EXCEEDS_TOLERANCE|Compose \(net\) failed/i.test(e.message)) {
        throw e
      }
    }

    // Surface on-chain approval if required (spender on source chain)
    try {
      const quoteType: string | undefined = (quote?.quoteType || quote?.type || quote?.funding?.type || '').toString().toLowerCase?.()
      const funding = quote?.funding || quote?.payloads?.funding || null
      const requiresOnchain = quoteType === 'onchain' || funding?.mode === 'onchain' || funding?.type === 'onchain'
      const spender: string | undefined = funding?.spender || funding?.approval?.spender || funding?.transactions?.[0]?.to
      if (requiresOnchain && spender && typeof spender === 'string') {
        const data = { spender, tokenAddress: fundingToken.address, amount: amountWei.toString(), chainId: fundingToken.chainId }
        console.warn('[BiconomyAdapter] repay on-chain approval required', data)
        throw new Error(`BICONOMY_ONCHAIN_APPROVAL_REQUIRED:${JSON.stringify(data)}`)
      }
    } catch {}

    dispatchPhase('quote-ok', { operation: 'repay', preferOnChainFunding })

    // Sign
    const { payloads, rawPayloads } = extractQuotePayloads(quote)
    if (!payloads.length) throw new Error('BICONOMY_MISSING_SIGNABLE_PAYLOADS')
    const chainIdsInPayload = getChainIdsFromPayloads(payloads)
    const requiresBscSignature = chainIdsInPayload.some((cid) => cid === bsc.id)
    if (requiresBscSignature) {
      dispatchPhase('quote-signature-required', { chainIds: chainIdsInPayload })
    }
    console.log('[BiconomyAdapter] repay payload summary', {
      payloadCount: payloads.length,
      chainIdsInPayload,
      requiresBscSignature,
    })
    const { provider } = await selectInjectedProvider(userAddress)
    const walletClient = createWalletClientForProvider(provider)
    const inferPrimaryType = (types: Record<string, any>): string => { const keys = Object.keys(types || {}).filter(k => k !== 'EIP712Domain'); return keys[0] || 'Permit' }
    const signedPayloads = [] as any[]
    dispatchPhase('sign-start', { operation: 'repay', payloadCount: payloads.length })
    for (const pRaw of payloads) {
      const hasWrapperTypeData = pRaw && pRaw.type && pRaw.data
      const hasSignableWrapper = pRaw && pRaw.signablePayload
      const signable = hasWrapperTypeData ? pRaw.data : hasSignableWrapper ? pRaw.signablePayload : pRaw
      const meta = hasSignableWrapper ? pRaw.metadata : undefined
      const eip712 = signable?.eip712 || signable
      if (eip712?.domain && eip712?.types && eip712?.message) {
        const primaryType: string = eip712?.primaryType || inferPrimaryType(eip712.types)
        const signature = await walletClient.signTypedData({ account: userAddress as Address, domain: eip712.domain, types: eip712.types, primaryType, message: eip712.message } as any)
        signedPayloads.push(hasSignableWrapper ? { signablePayload: pRaw.signablePayload, metadata: meta, signature } : { message: eip712.message, signature })
        continue
      }
      if (signable?.to && signable?.data != null && signable?.chainId) {
        const chain = CHAIN_BY_ID[signable.chainId] || undefined
        const valueBig = (() => { try { return BigInt(signable?.value ?? '0') } catch { return BigInt(0) } })()
        const txRequest: any = {
          account: userAddress as Address,
          to: signable.to as Address,
          data: signable.data as `0x${string}`,
          value: valueBig,
        }
        if (chain) txRequest.chain = chain
        dispatchPhase('onchain-funding-start', { operation: 'repay', chainId: signable.chainId, to: signable.to })
        try {
          const txHash = await walletClient.sendTransaction(txRequest)
          dispatchPhase('onchain-funding-ok', { operation: 'repay', chainId: signable.chainId, hash: txHash })
          signedPayloads.push(
            hasSignableWrapper
              ? { signablePayload: pRaw.signablePayload, metadata: meta, signature: txHash }
              : { to: signable.to, data: signable.data, value: signable?.value ?? '0', chainId: signable.chainId, signature: txHash },
          )
          continue
        } catch (err: any) {
          const msg = String(err?.message || err)
          dispatchPhase('onchain-funding-error', { operation: 'repay', chainId: signable?.chainId, message: msg, to: signable?.to })
          if (/ChainMismatchError|current chain/i.test(msg)) {
            try {
              if (__chainMismatchRetry) {
                console.error('[BiconomyAdapter] repay chain mismatch persists after retry', { attempt })
                throw new Error('BICONOMY_ONCHAIN_APPROVAL_WRONG_CHAIN')
              }
              const retryPayload: any = { ...baseQuotePayload, preferOnChainFunding: true }
              await doQuote(retryPayload, 'chain-mismatch')
              console.warn('[BiconomyAdapter] repay chain mismatch during signing; retrying with on-chain funding', { attempt })
              return await this.startRepay({
                userAddress,
                destinationChainId,
                pTokenAddress,
                amountWei,
                repayMax,
                targetChainId,
                targetTokenAddress,
                slippage,
                meeAuthorization,
                sponsorship,
                initialFundingAmountWei,
                feeTokenOverride,
                executionMode: requestedExecutionMode,
                triggerMaxAmountWei,
                sourceChainId,
                sourceTokenAddress,
                __attempt: attempt + 1,
                __preferOnChainFunding: true,
                __chainMismatchRetry: true,
              } as any)
            } catch (retryErr) {
              console.error('[BiconomyAdapter] repay chain mismatch retry failed', { message: (retryErr as Error)?.message, attempt })
              throw new Error('BICONOMY_ONCHAIN_APPROVAL_WRONG_CHAIN')
            }
          }
          throw (err instanceof Error ? err : new Error(msg))
        }
      }
      if (signable?.message) {
        const signature = await (walletClient as any).signMessage?.({ account: userAddress as Address, message: signable.message })
        signedPayloads.push({ message: signable.message, signature })
        continue
      }
      throw new Error('BICONOMY_INVALID_SIGNABLE_PAYLOAD')
    }

    dispatchPhase('sign-ok', { operation: 'repay', signedCount: signedPayloads.length })

    // Execute
    dispatchPhase('execute-start', { operation: 'repay', signedCount: signedPayloads.length })
    const innerQuoteForDiag = (quote?.quote || quote?.result?.quote || undefined) as any
    const execRes = await fetch('/api/biconomy/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ownerAddress: userAddress, fee: quote?.fee, quoteType: (quote?.quoteType || quote?.type || '').toString().toLowerCase?.(), quote: innerQuoteForDiag || quote, payloadToSign: signedPayloads }) })
    if (!execRes.ok) throw new Error(`Execute failed: ${await execRes.text()}`)
    const exec = (await execRes.json()) as { hash?: string; trackingUrl?: string }

    const innerQuoteAny: any = innerQuoteForDiag || quote || {}
    const normalizedFee = (quote as any)?.fee || (quote as any)?.result?.fee || innerQuoteAny?.fee || null
    const paymentInfo = (quote as any)?.quote?.paymentInfo || innerQuoteAny?.paymentInfo || null
    const feeDetails = { amount: normalizedFee?.amount, token: normalizedFee?.token, chainId: normalizedFee?.chainId, paymentToken: paymentInfo?.token, paymentTokenWeiAmount: paymentInfo?.tokenWeiAmount, paymentTokenValue: paymentInfo?.tokenValue }

    const candidateHash = (exec?.hash || (innerQuoteAny?.hash as string | undefined) || ((quote as any)?.quote?.hash as string | undefined) || ((quote as any)?.result?.quote?.hash as string | undefined)) as string | undefined
    let meeScanLink: string | undefined
    if (candidateHash && /^0x[a-fA-F0-9]{64}$/.test(candidateHash)) { try { meeScanLink = getMeeScanLink(candidateHash as `0x${string}`) } catch {} }
    const resolvedHash = exec?.hash || candidateHash || ''
    console.log('[BiconomyAdapter] repay execute ok', { superTxHash: resolvedHash, trackingUrl: exec?.trackingUrl })
    dispatchPhase('execute-ok', { operation: 'repay', superTxHash: resolvedHash })
    try { fetch('/api/biconomy/sponsored-usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ walletAddress: userAddress, superTxHash: resolvedHash, label: 'cross-chain_repay' }) }).catch(() => {}) } catch {}

    return { superTxHash: resolvedHash, trackingUrl: exec?.trackingUrl, fee: normalizedFee || undefined, feeDetails, meeScanLink, executedRepayWei: amountWei }
  }

  async startBorrow(params: StartBorrowParams): Promise<StartBorrowResult> {
    const {
      userAddress,
      destinationChainId,
      pTokenAddress,
      amountWei,
      collateralMarkets,
      targetChainId,
      targetTokenAddress,
      slippage = 0.1,
      meeAuthorization,
      sponsorship = true,
      initialFundingAmountWei,
      feeTokenOverride,
      executionMode: requestedExecutionMode,
      triggerMaxAmountWei,
    } = params || ({} as StartBorrowParams)

    if (!userAddress || !pTokenAddress || !amountWei || amountWei <= BigInt(0)) {
      throw new Error('Missing borrow parameters')
    }

    const underlying = getUnderlyingToken(pTokenAddress)

    const composeFlows: any[] = []

    if (Array.isArray(collateralMarkets) && collateralMarkets.length) {
      composeFlows.push({
        type: '/instructions/build',
        data: {
          functionSignature: 'function enterMarkets(address[] memory)',
          args: [collateralMarkets],
          to: PERIDOT_CONTROLLER,
          chainId: bsc.id,
          value: '0',
        },
        batch: true,
      })
    }

    composeFlows.push({
      type: '/instructions/build',
      data: {
        functionSignature: 'function borrow(uint256)',
        args: [amountWei.toString()],
        to: pTokenAddress,
        chainId: destinationChainId,
        value: '0',
      },
      batch: true,
    })

    if (targetChainId && targetTokenAddress) {
      const bridgeAmount = amountWei.toString()
      composeFlows.push({
        type: '/instructions/intent-simple',
        data: {
          srcToken: underlying,
          dstToken: targetTokenAddress,
          srcChainId: bsc.id,
          dstChainId: targetChainId,
          amount: bridgeAmount,
          slippage,
        },
        batch: false,
      })
    } else {
      composeFlows.push({
        type: '/instructions/build',
        data: {
          functionSignature: 'function transfer(address,uint256)',
          args: [userAddress, { type: 'runtimeErc20Balance', tokenAddress: underlying, constraints: { gte: '1' } }],
          to: underlying,
          chainId: bsc.id,
          value: '0',
        },
        batch: true,
      })
    }

    const composeBody = {
      ownerAddress: userAddress,
      mode: 'eoa' as const,
      composeFlows,
    }

    const dispatchPhase = (phase: string, meta?: any) => {
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('peridot:biconomy-phase', { detail: { phase, meta } }))
        }
      } catch {}
    }

    const composeStart = Date.now()
    dispatchPhase('compose-start', { operation: 'borrow', ownerAddress: userAddress, borrowAmountWei: amountWei.toString() })
    try {
      console.groupCollapsed?.('[BiconomyAdapter] borrow compose body')
      console.log?.('owner', userAddress)
      console.table?.(
        composeFlows.map((flow: any, idx: number) => ({
          idx,
          type: flow?.type,
          functionSignature: flow?.data?.functionSignature,
          to: flow?.data?.to,
          chainId: flow?.data?.chainId,
          amount: flow?.data?.amount,
        })),
      )
      console.groupEnd?.()
    } catch {}
    const composeRes = await fetch('/api/biconomy/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(composeBody),
    })
    if (!composeRes.ok) {
      const err = await composeRes.text()
      console.error('[BiconomyAdapter] borrow compose failed', { status: composeRes.status, tookMs: Date.now() - composeStart, body: composeBody, error: err })
      throw new Error(`Compose failed: ${err}`)
    }
    let { instructions } = await composeRes.json()
    dispatchPhase('compose-ok', { operation: 'borrow', instructionsCount: Array.isArray(instructions) ? instructions.length : 0 })
    try {
      console.groupCollapsed?.('[BiconomyAdapter] borrow compose -> instructions')
      console.log?.('count', Array.isArray(instructions) ? instructions.length : 0)
      if (Array.isArray(instructions)) {
        console.table?.(
          instructions.flatMap((inst: any, instIdx: number) =>
            (inst?.calls || []).map((call: any, callIdx: number) => ({
              instIdx,
              callIdx,
              chainId: inst?.chainId,
              to: call?.to,
              functionSig: call?.functionSig,
            })),
          ),
        )
      }
      console.groupEnd?.()
    } catch {}

    const quoteStart = Date.now()
    const inferredAmount = amountWei.toString()
    const executionMode = requestedExecutionMode || 'eoa'

    let walletClientCache: ReturnType<typeof createWalletClientForProvider> | null = null

    const fundingAmountWei = (() => {
      try {
        return initialFundingAmountWei != null ? BigInt(initialFundingAmountWei) : BigInt(0)
      } catch {
        return BigInt(0)
      }
    })()
    const triggerLimitWei = (() => {
      try {
        if (triggerMaxAmountWei == null) return undefined
        const coerced = BigInt(triggerMaxAmountWei)
        return coerced >= BigInt(0) ? coerced : undefined
      } catch {
        return undefined
      }
    })()
    const feeTokenConfig = feeTokenOverride || { address: underlying, chainId: bsc.id }
    const fundingDepositWei = fundingAmountWei > BigInt(0) ? fundingAmountWei : BigInt(0)

    // For borrow with feeTokenOverride: use trigger with maxAvailableFunds instead of fixed amount
    // This allows Biconomy to use whatever balance the user has in the fee token
    const useTriggerMode = feeTokenOverride != null
    const triggerAmountWei = useTriggerMode
      ? (triggerLimitWei != null ? triggerLimitWei : BigInt(0))
      : (fundingDepositWei > BigInt(0) ? fundingDepositWei : BigInt(0))
    const triggerAmountStr = triggerAmountWei.toString()

    // fundingTokenEntry: for borrow, this should represent the fee token, not the borrow amount
    const fundingTokenEntry = {
      tokenAddress: feeTokenConfig.address,
      chainId: feeTokenConfig.chainId,
      // When using fee token override, use trigger amount (0 with maxAvailableFunds), not borrow amount
      amount: useTriggerMode ? triggerAmountStr : (fundingDepositWei > BigInt(0) ? fundingDepositWei : amountWei).toString(),
    }

    const triggerConfig = useTriggerMode ? {
      chainId: feeTokenConfig.chainId,
      tokenAddress: feeTokenConfig.address,
      amount: triggerAmountStr,
      maxAvailableFunds: true,
    } : undefined

    const baseQuotePayload: any = {
      ownerAddress: userAddress,
      mode: executionMode,
      instructions,
      sponsorship,
      ...(triggerConfig ? { trigger: triggerConfig } : {}),
      fundingTokens: [fundingTokenEntry],
      feeToken: feeTokenConfig,  // Always set feeToken, even with sponsorship
      ...(meeAuthorization ? { delegate: true, authorization: meeAuthorization } : {}),
    }

    const doQuote = async (payload: any) => {
      const res = await fetch('/api/biconomy/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.status === 412) {
        return { status: 412, body: await res.json() }
      }
      if (!res.ok) {
        const errText = await res.text()
        console.error('[BiconomyAdapter] borrow quote failed', { status: res.status, tookMs: Date.now() - quoteStart, error: errText, payload })
        throw new Error(`Quote failed: ${errText}`)
      }
      return { status: res.status, body: await res.json() }
    }

    const ensureWalletClient = async () => {
      if (walletClientCache) return walletClientCache
      const { provider, candidates, matched } = await selectInjectedProvider(userAddress)
      try {
        console.log('[BiconomyAdapter] borrow provider selection', {
          candidates: describeProviders(candidates),
          matched,
        })
      } catch {}
      walletClientCache = createWalletClientForProvider(provider)
      return walletClientCache
    }

    dispatchPhase('quote-start', { operation: 'borrow', attempt: sponsorship ? 'sponsored' : 'wallet', triggerToken: triggerConfig.tokenAddress, triggerAmount: triggerConfig.amount })
    const quoteResult = await doQuote(baseQuotePayload)
    let quote = quoteResult.body
    const requestedSponsorship = sponsorship === true
    let fundingMode: 'sponsored' | 'fallback' = requestedSponsorship ? 'sponsored' : 'fallback'

    const extractQuoteType = (q: any): string => {
      const raw = q?.quoteType || q?.type || q?.result?.quoteType || q?.result?.type
      return typeof raw === 'string' ? raw.toLowerCase() : ''
    }

    const logQuoteDiagnostics = (label: string, currentQuote: any) => {
      try {
        const funding = currentQuote?.funding || currentQuote?.payloads?.funding || currentQuote?.result?.funding
        const payloadPreview = (Array.isArray(currentQuote?.payloadToSign)
          ? currentQuote?.payloadToSign
          : Array.isArray(currentQuote?.result?.payloadToSign)
          ? currentQuote?.result?.payloadToSign
          : [])?.map?.((entry: any, idx: number) => {
            const signable = entry?.signablePayload || entry?.data || entry
            return {
              idx,
              type: entry?.type,
              hasWrapper: Boolean(entry?.signablePayload),
              chainId: signable?.chainId || signable?.domain?.chainId,
              to: signable?.to,
            }
          }) || []
        console.groupCollapsed?.(`[BiconomyAdapter] borrow quote diagnostics (${label})`)
        console.log?.('quoteType', extractQuoteType(currentQuote))
        console.log?.('funding', funding)
        console.table?.(payloadPreview)
        console.groupEnd?.()
      } catch {}
    }

    logQuoteDiagnostics('sponsored', quote)

    const quoteType = extractQuoteType(quote)
    if (requestedSponsorship && (quoteType.includes('onchain') || quoteType.includes('fallback') || quoteType.includes('unsupported'))) {
      dispatchPhase('quote-fallback', { operation: 'borrow', reason: 'sponsorship-unavailable', quoteType })
      fundingMode = 'fallback'
      const fallbackPayload: any = {
        ownerAddress: userAddress,
        mode: 'eoa',
        instructions,
        sponsorship: false,
        preferOnChainFunding: true,
        fundingTokens: [fundingTokenEntry],
        feeToken: feeTokenConfig,
        ...(triggerConfig ? { trigger: triggerConfig } : {}),
        ...(meeAuthorization ? { delegate: true, authorization: meeAuthorization } : {}),
      }
      dispatchPhase('quote-start', { operation: 'borrow', attempt: 'fallback' })
      const fallbackRes = await doQuote(fallbackPayload)
      quote = fallbackRes.body
      logQuoteDiagnostics('fallback', quote)
    }

    const resolvePaymentInfo = (q: any) =>
      q?.quote?.paymentInfo || q?.result?.quote?.paymentInfo || q?.paymentInfo || null

    const paymentInfo: any = resolvePaymentInfo(quote)
    const feeTokenAddr: string | undefined = paymentInfo?.token
    const feeWeiStr: string | undefined = paymentInfo?.tokenWeiAmount
    const sameFeeToken = typeof feeTokenAddr === 'string' && feeTokenAddr?.toLowerCase?.() === underlying?.toLowerCase?.()
    const feeWei = (() => {
      try {
        return BigInt(feeWeiStr || '0')
      } catch {
        return BigInt(0)
      }
    })()

    if (sameFeeToken && feeWei >= amountWei) {
      throw new Error('INSUFFICIENT_FOR_FEE_BUDGET')
    }

    const expectedNetWei = sameFeeToken ? (amountWei - feeWei) : undefined

    dispatchPhase('quote-ok', {
      operation: 'borrow',
      feeToken: feeTokenAddr,
      feeWei: feeWei.toString(),
      sameFeeToken,
      fundingMode,
      expectedNetWei: expectedNetWei ? expectedNetWei.toString() : undefined,
    })

    const { payloads, rawPayloads, source: payloadSource } = extractQuotePayloads(quote)
    const chainIdsInPayload = getChainIdsFromPayloads(payloads)
    const requiresBscSignature = chainIdsInPayload.some((cid) => cid === bsc.id)
    if (requiresBscSignature) {
      dispatchPhase('quote-signature-required', { operation: 'borrow', chainIds: chainIdsInPayload })
    }
    if (!payloads.length) {
      console.error('[BiconomyAdapter] Missing signable payloads from borrow quote; aborting execute', {
        payloadSource,
        rawPayloadCount: rawPayloads.length,
        underlying,
      })
      throw new Error('BICONOMY_MISSING_SIGNABLE_PAYLOADS')
    }

    const walletClient = await ensureWalletClient()
    const inferPrimaryType = (types: Record<string, any>): string => {
      const keys = Object.keys(types || {}).filter(k => k !== 'EIP712Domain')
      return keys[0] || 'Permit'
    }

    payloads.forEach((pRaw, idx) => {
      if (!pRaw || (typeof pRaw === 'object' && !Object.keys(pRaw).length)) {
        console.error('[BiconomyAdapter] Invalid payload entry (borrow path)', { idx, payload: pRaw })
        throw new Error('BICONOMY_INVALID_SIGNABLE_PAYLOAD')
      }
    })

    dispatchPhase('sign-start', { operation: 'repay', payloadCount: payloads.length })

    const signedPayloads = [] as any[]
    for (const [index, pRaw] of payloads.entries()) {
      const hasWrapperTypeData = pRaw && pRaw.type && pRaw.data
      const hasSignableWrapper = pRaw && pRaw.signablePayload
      const signable = hasWrapperTypeData ? pRaw.data : hasSignableWrapper ? pRaw.signablePayload : pRaw
      const meta = hasSignableWrapper ? pRaw.metadata : undefined

      if (hasSignableWrapper) {
        try {
          console.log('[BiconomyAdapter] borrow signable wrapper detected', {
            signableKeys: Object.keys(signable || {}),
            metaKeys: meta ? Object.keys(meta || {}) : [],
          })
        } catch {}
      }

      const eip712 = signable?.eip712 || signable
      if (eip712?.domain && eip712?.types && eip712?.message) {
        const primaryType: string = eip712?.primaryType || inferPrimaryType(eip712.types)
        const signature = await walletClient.signTypedData({
          account: userAddress as Address,
          domain: eip712.domain,
          types: eip712.types,
          primaryType,
          message: eip712.message,
        } as any)
        signedPayloads.push(
          hasSignableWrapper
            ? { signablePayload: pRaw.signablePayload, metadata: meta, signature }
            : { message: eip712.message, signature },
        )
        continue
      }

      if (signable?.to && signable?.data != null && signable?.chainId) {
        const chain = CHAIN_BY_ID[signable.chainId] || undefined
        const valueBig = (() => {
          try {
            return BigInt(signable?.value ?? '0')
          } catch {
            return BigInt(0)
          }
        })()
        const txRequest: any = {
          account: userAddress as Address,
          to: signable.to as Address,
          data: signable.data as `0x${string}`,
          value: valueBig,
        }
        if (chain) {
          txRequest.chain = chain
        }
        dispatchPhase('onchain-funding-start', { operation: 'borrow', chainId: signable.chainId, to: signable.to })
        try {
          const txHash = await walletClient.sendTransaction(txRequest)
          dispatchPhase('onchain-funding-ok', { operation: 'borrow', chainId: signable.chainId, hash: txHash })
          signedPayloads.push(
            hasSignableWrapper
              ? { signablePayload: pRaw.signablePayload, metadata: meta, signature: txHash }
              : { to: signable.to, data: signable.data, value: signable?.value ?? '0', chainId: signable.chainId, signature: txHash },
          )
        } catch (e: any) {
          const reason = e?.message || e || 'unknown'
          dispatchPhase('onchain-funding-error', { operation: 'borrow', chainId: signable?.chainId, message: reason })
          console.error('[BiconomyAdapter] sendTransaction failed; aborting execute (borrow path)', { reason, to: signable?.to, chainId: signable?.chainId })
          throw new Error('BICONOMY_ONCHAIN_FUNDING_TX_FAILED')
        }
        continue
      }

      if (signable?.message) {
        const signature = await (walletClient as any).signMessage?.({ account: userAddress as Address, message: signable.message })
        signedPayloads.push({ message: signable.message, signature })
        continue
      }

      console.error('[BiconomyAdapter] Unhandled signable payload (borrow path)', { index, keys: Object.keys(signable || {}) })
      throw new Error('BICONOMY_INVALID_SIGNABLE_PAYLOAD')
    }

    const innerQuoteForDiag = (quote?.quote || quote?.result?.quote || undefined) as any
    dispatchPhase('sign-ok', { operation: 'borrow', signedCount: signedPayloads.length })

    dispatchPhase('execute-start', { operation: 'borrow', fundingMode })
    const execRes = await fetch('/api/biconomy/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerAddress: userAddress,
        fee: quote?.fee,
        quoteType: (quote?.quoteType || quote?.type || '').toString().toLowerCase?.(),
        quote: innerQuoteForDiag || quote,
        payloadToSign: signedPayloads,
      }),
    })
    if (!execRes.ok) {
      const errText = await execRes.text()
      console.error('[BiconomyAdapter] borrow execute failed', { status: execRes.status, error: errText })
      throw new Error(`Execute failed: ${errText}`)
    }
    const exec = (await execRes.json()) as { hash?: string; trackingUrl?: string }

    const innerQuoteAny: any = innerQuoteForDiag || quote || {}
    const normalizedFee = (quote as any)?.fee || (quote as any)?.result?.fee || innerQuoteAny?.fee || null
    const normalizedPaymentInfo = resolvePaymentInfo(innerQuoteAny) || paymentInfo
    const feeDetails = {
      amount: normalizedFee?.amount,
      token: normalizedFee?.token,
      chainId: normalizedFee?.chainId,
      paymentToken: normalizedPaymentInfo?.token,
      paymentTokenWeiAmount: normalizedPaymentInfo?.tokenWeiAmount,
      paymentTokenValue: normalizedPaymentInfo?.tokenValue,
    }

    const candidateHash = (exec?.hash
      || (innerQuoteAny?.hash as string | undefined)
      || ((quote as any)?.quote?.hash as string | undefined)
      || ((quote as any)?.result?.quote?.hash as string | undefined)) as string | undefined

    let meeScanLink: string | undefined
    if (candidateHash && /^0x[a-fA-F0-9]{64}$/.test(candidateHash)) {
      try {
        meeScanLink = getMeeScanLink(candidateHash as `0x${string}`)
      } catch {}
    }
    const resolvedHash = exec?.hash || candidateHash || ''
    dispatchPhase('execute-ok', { operation: 'borrow', superTxHash: resolvedHash, fundingMode })

    if (fundingMode === 'sponsored') {
      try {
        fetch('/api/biconomy/sponsored-usage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: userAddress, superTxHash: resolvedHash, label: 'cross-chain_borrow' }),
        }).catch(() => {})
      } catch {}
    }

    return {
      superTxHash: resolvedHash,
      trackingUrl: exec?.trackingUrl,
      fee: normalizedFee || undefined,
      feeDetails,
      meeScanLink,
      executedBorrowWei: amountWei,
      expectedNetWei,
      fundingMode,
    }
  }
  async startSupply(params: StartSupplyParams): Promise<StartSupplyResult> {
    const { userAddress, signerAddress, signingClient, smartAccountAddress, sourceChainId, sourceTokenAddress, destinationChainId, pTokenAddress, amountWei, enableAsCollateral, returnPTokensToUser = true, slippage = 1, postEnableAsCollateral, meeAuthorization, executionMode: requestedExecutionMode } = params as any

    console.log('[BiconomyAdapter] 🔍 startSupply ENTRY - received executionMode:', { requestedExecutionMode, userAddress, signerAddress, smartAccountAddress })

    const underlying = getUnderlyingToken(pTokenAddress)
    const lowerSourceToken = sourceTokenAddress?.toLowerCase?.()
    const lowerUnderlyingToken = underlying?.toLowerCase?.()
    const isWethPath = KNOWN_WETH_ADDRESSES.has(lowerSourceToken) || KNOWN_WETH_ADDRESSES.has(lowerUnderlyingToken)

    const executionMode = requestedExecutionMode || 'eoa'
    console.log('[BiconomyAdapter] 🔍 startSupply - final executionMode:', executionMode)
    // In smart-account mode the Biconomy SA is persistent and must retain pTokens
    // so that enterMarkets collateral registration is valid for subsequent borrows.
    // The caller's returnPTokensToUser is overridden to false in this mode.
    const effectiveReturnPTokens = executionMode === 'smart-account' ? false : (returnPTokensToUser ?? true)
    // signerAddress is the EOA that controls the smart account (Privy embedded wallet).
    // All signing operations use signerAddress regardless of executionMode because:
    //   - Privy smart accounts: signing via the EOA signer triggers EIP-1271 validation
    //     (the smart account's isValidSignature accepts signatures from its EOA owner)
    //   - Regular EOA users: signerAddress === userAddress → no change
    // Using userAddress (smart account) for signing would cause UnauthorizedProviderError
    // since the injected Privy provider only controls the EOA signer.
    const signingAddress: Address = (signerAddress as Address) ?? userAddress
    const quoteOwnerAddress = userAddress

    const composeBody = {
      ownerAddress: quoteOwnerAddress,
      mode: executionMode,
      composeFlows: [
        {
          type: '/instructions/intent-simple',
          data: {
            srcToken: sourceTokenAddress,
            dstToken: underlying,
            srcChainId: sourceChainId,
            dstChainId: destinationChainId,
            amount: amountWei.toString(),
            slippage,
          },
        },
        {
          type: '/instructions/build',
          data: {
            functionSignature: 'function approve(address,uint256)',
            args: [pTokenAddress, { type: 'runtimeErc20Balance', tokenAddress: underlying }],
            to: underlying,
            chainId: destinationChainId,
            value: '0',
          },
        },
        {
          type: '/instructions/build',
          data: {
            functionSignature: 'function mint(uint256)',
            args: [{ type: 'runtimeErc20Balance', tokenAddress: underlying }],
            to: pTokenAddress,
            chainId: destinationChainId,
            value: '0',
          },
        },
        ...(enableAsCollateral
          ? [
              {
                type: '/instructions/build',
                data: {
                  functionSignature: 'function enterMarkets(address[])',
                  args: [[pTokenAddress]],
                  to: PERIDOT_CONTROLLER,
                  chainId: destinationChainId,
                  value: '0',
                },
              },
            ]
          : []),
        ...(effectiveReturnPTokens
          ? [
              {
                type: '/instructions/build',
                data: {
                  functionSignature: 'function transfer(address,uint256)',
                  args: [userAddress, { type: 'runtimeErc20Balance', tokenAddress: pTokenAddress, constraints: { gte: '1' } }],
                  to: pTokenAddress,
                  chainId: destinationChainId,
                  value: '0',
                },
              },
            ]
          : []),
      ],
    }

    if (isWethPath) {
      try {
        const composeSummary = composeBody.composeFlows.map(flow => ({
          type: flow.type,
          functionSignature: (flow.data as any)?.functionSignature,
          to: (flow.data as any)?.to,
          chainId: (flow.data as any)?.chainId,
        }))
        console.log('[BiconomyAdapter] WETH path compose body', {
          sourceChainId,
          sourceToken: sourceTokenAddress,
          underlying,
          composeSummary,
        })
      } catch {}
    }

    const composeStart = Date.now()
    console.log('[BiconomyAdapter] startSupply called', {
      ownerAddress: userAddress,
      sourceChainId,
      sourceTokenAddress,
      destinationChainId,
      pTokenAddress,
      underlying,
      amountWei: amountWei.toString(),
      enableAsCollateral,
      returnPTokensToUser: effectiveReturnPTokens,
      slippage,
      isWethPath,
    })
    
    // Log the full composeFlows structure
    console.log('[BiconomyAdapter] composeFlows structure', {
      flowsCount: composeBody.composeFlows.length,
      flows: composeBody.composeFlows.map((flow: any, idx: number) => ({
        index: idx,
        type: flow.type,
        ...(flow.type === '/instructions/intent-simple' ? {
          srcToken: flow.data?.srcToken,
          dstToken: flow.data?.dstToken,
          srcChainId: flow.data?.srcChainId,
          dstChainId: flow.data?.dstChainId,
          amount: flow.data?.amount,
          slippage: flow.data?.slippage,
        } : {
          functionSignature: flow.data?.functionSignature,
          to: flow.data?.to,
          chainId: flow.data?.chainId,
          args: flow.data?.args,
        }),
      })),
    })
    const dispatchPhase = (phase: string, meta?: any) => {
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('peridot:biconomy-phase', { detail: { phase, meta } }))
        }
      } catch {}
    }

    // NEW API FLOW: Skip compose step, pass composeFlows directly to quote endpoint
    // The /v1/quote endpoint now accepts composeFlows directly (compose endpoint is deprecated)
    console.log('[BiconomyAdapter] using new API flow - composeFlows directly to quote', {
      composeFlowsCount: composeBody.composeFlows.length,
      ownerAddress: userAddress,
      srcChainId: sourceChainId,
    })
    dispatchPhase('compose-ok', { operation: 'supply', instructionsCount: 0, note: 'using composeFlows directly in quote' })

    if (isWethPath) {
      try {
        const composeFlowsSummary = composeBody.composeFlows.map((flow: any) => ({
          type: flow.type,
          functionSignature: flow.data?.functionSignature,
          to: flow.data?.to,
          chainId: flow.data?.chainId,
        }))
        console.log('[BiconomyAdapter] WETH path compose flows', { composeFlowsSummary })
      } catch {}
    }

    const quoteStart = Date.now()
    // Select funding token (Fusion requires exactly one funding token). Prefer source token if it likely supports permit; otherwise prefer USDC on the same chain.
    const selectFundingToken = (chainId: number, srcToken: string): string => {
      // Known non-permit tokens: USDT on multiple chains
      const byChain = Object.entries(TOKENS).find(([, v]: any) => Object.values(v).includes(srcToken as any))
      // If source is USDT, use USDC on the same chain when available
      if (byChain) {
        const [key, tokens] = byChain as [keyof typeof TOKENS, any]
        if (tokens?.USDT === srcToken && tokens?.USDC) return tokens.USDC
      }
      return srcToken
    }
    const fundingToken = selectFundingToken(sourceChainId, sourceTokenAddress)
    if (fundingToken !== sourceTokenAddress) {
      console.warn('[BiconomyAdapter] source token likely non-permit; preferring on-chain funding with source token', { sourceTokenAddress, previouslySelectedFundingToken: fundingToken })
    }
    // Quote helper
    const doQuote = async (payload: any) => {
      const res = await fetch('/api/biconomy/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return res
    }
    const isServerBusyError = (text: string) => /rate.?limit|server.?busy/i.test(text || '')
    const quoteWithRetry = async (payload: any, label: string, maxAttempts = 4) => {
      let attempt = 0
      let res = await doQuote(payload)
      while (!res.ok && attempt < maxAttempts - 1) {
        const errText = await res.text()
        if (!isServerBusyError(errText)) {
          // recreate a response-like object by reissuing once so callers can read full body
          res = await doQuote(payload)
          break
        }
        const delayMs = 2500 * Math.pow(2, attempt)
        console.warn('[BiconomyAdapter] quote busy, retrying', { label, attempt: attempt + 1, delayMs })
        await new Promise(r => setTimeout(r, delayMs))
        res = await doQuote(payload)
        attempt += 1
      }
      return res
    }
    const buildEoaFallbackComposeFlows = (flows: any[]) => {
      const withoutEnterMarkets = (Array.isArray(flows) ? flows : []).filter((f: any) => {
        const sig = String(f?.data?.functionSignature || '').toLowerCase()
        return !sig.includes('entermarkets')
      })
      const hasTransferBack = withoutEnterMarkets.some((f: any) => {
        const sig = String(f?.data?.functionSignature || '').toLowerCase()
        const to = String(f?.data?.to || '').toLowerCase()
        return sig.includes('transfer') && to === String(pTokenAddress).toLowerCase()
      })
      if (hasTransferBack) return withoutEnterMarkets
      return [
        ...withoutEnterMarkets,
        {
          type: '/instructions/build',
          data: {
            functionSignature: 'function transfer(address,uint256)',
            args: [quoteOwnerAddress, { type: 'runtimeErc20Balance', tokenAddress: pTokenAddress, constraints: { gte: '1' } }],
            to: pTokenAddress,
            chainId: destinationChainId,
            value: '0',
          },
        },
      ]
    }
    // Build quote payload: if we would switch to USDC for permit but user may lack USDC, prefer on-chain funding with source token
    const useSourceOnchainFunding = fundingToken !== sourceTokenAddress
    const FORCE_GASLESS_SPONSORED = true
    const selectedFundingToken = useSourceOnchainFunding ? sourceTokenAddress : fundingToken

    // For smart-account mode, fundingTokens/feeToken/preferOnChainFunding are
    // forbidden by the Biconomy API (returns 400 "fundingTokens must not be present").
    const isSmartAccountMode = executionMode === 'smart-account'

    // Smart wallets (Privy) cannot sign EIP-2612 permits because USDC's permit
    // uses ecrecover — a smart contract has no private key. Force on-chain funding
    // (approve + transferFrom) so the smart wallet sends an approval tx instead.
    const isSmartWalletOwner = signerAddress && signerAddress !== userAddress

    const preferOnChainFunding = !FORCE_GASLESS_SPONSORED && (useSourceOnchainFunding || isSmartWalletOwner)

    const quotePayload: any = {
      ownerAddress: quoteOwnerAddress,
      mode: executionMode,
      composeFlows: composeBody.composeFlows,
      // EOA / EIP-7702 modes: include funding token fields for Fusion flow
      ...(isSmartAccountMode ? {} : {
        fundingTokens: [{ tokenAddress: selectedFundingToken, chainId: sourceChainId, amount: amountWei.toString() }],
        feeToken: { address: selectedFundingToken, chainId: sourceChainId },
        // preferOnChainFunding: avoid EIP-2612 permit for smart wallet owners (ecrecover incompatible)
        ...(preferOnChainFunding ? { preferOnChainFunding: true } : {}),
      }),
      // Prefer sponsored flow to allow gasless UX with supported tokens
      sponsorship: true,
      // If provided, enable delegated mode with explicit authorization for EIP-7702
      ...(meeAuthorization ? { delegate: true, authorization: meeAuthorization } : {}),
    }
    if (isWethPath) {
      try {
        console.log('[BiconomyAdapter] WETH path quote payload', {
          fundingToken: selectedFundingToken,
          preferOnChainFunding: Boolean(quotePayload.preferOnChainFunding),
          sponsorship: Boolean(quotePayload.sponsorship),
        })
      } catch {}
    }
    console.log('[BiconomyAdapter] quote funding/fee', { selectedFundingToken, preferOnChainFunding: Boolean(quotePayload.preferOnChainFunding) })
    
    // Log the full quote payload for debugging
    console.log('[BiconomyAdapter] quote payload details', {
      ownerAddress: quotePayload.ownerAddress,
      mode: quotePayload.mode,
      composeFlowsCount: quotePayload.composeFlows?.length || 0,
      fundingTokens: quotePayload.fundingTokens,
      feeToken: quotePayload.feeToken,
      sponsorship: quotePayload.sponsorship,
      preferOnChainFunding: quotePayload.preferOnChainFunding,
      hasMeeAuthorization: !!quotePayload.authorization,
      intentSimpleFlow: quotePayload.composeFlows?.find((f: any) => f.type === '/instructions/intent-simple')?.data,
    })
    
    dispatchPhase('quote-start', { operation: 'supply', selectedFundingToken, preferOnChainFunding: Boolean(quotePayload.preferOnChainFunding), forceGaslessSponsored: FORCE_GASLESS_SPONSORED })
    let quoteRes = await quoteWithRetry(quotePayload, 'supply-primary')
    if (!quoteRes.ok) {
      let errText = await quoteRes.text()
      // If permit fails due to nonces() missing, retry by hinting on-chain funding preference
      // unless force-gasless mode is active.
      if (!quoteRes.ok && !FORCE_GASLESS_SPONSORED) {
        const isPermitFailure = /nonces\(\)|permit signing failed|EIP-2612/i.test(errText)
        if (isPermitFailure) {
          try {
            const retryPayload = { ...quotePayload, preferOnChainFunding: true }
            quoteRes = await quoteWithRetry(retryPayload, 'supply-permit-fallback')
          } catch {}
        }
      }
      // Smart-account quotes can fail if Biconomy's internal account simulation lacks spendable source
      // balance. Fallback to sponsored EOA mode with explicit funding token fields.
      if (!quoteRes.ok && isSmartAccountMode) {
        const isSmartBalanceFailure = /transfer amount exceeds balance|insufficient balance|UserOp \[\d+\] simulation failed/i.test(errText)
        if (isSmartBalanceFailure) {
          try {
            dispatchPhase('quote-fallback', { operation: 'supply', reason: 'smart-account-balance-simulation-failed', toMode: 'eoa', forceGaslessSponsored: FORCE_GASLESS_SPONSORED })
            const fallbackPayload: any = {
              ownerAddress: quoteOwnerAddress,
              mode: 'eoa',
              composeFlows: buildEoaFallbackComposeFlows(composeBody.composeFlows),
              fundingTokens: [{ tokenAddress: selectedFundingToken, chainId: sourceChainId, amount: amountWei.toString() }],
              feeToken: { address: selectedFundingToken, chainId: sourceChainId },
              sponsorship: true,
              ...(meeAuthorization ? { delegate: true, authorization: meeAuthorization } : {}),
            }
            quoteRes = await quoteWithRetry(fallbackPayload, 'supply-smart-to-eoa-fallback')
            if (quoteRes.ok) {
              errText = ''
            } else {
              errText = await quoteRes.text()
            }
          } catch {}
        }
      }
      if (!quoteRes.ok) {
        console.error('[BiconomyAdapter] quote failed', {
          status: quoteRes.status,
          tookMs: Date.now() - quoteStart,
          error: errText,
          requestDetails: {
            sourceChainId,
            destinationChainId,
            sourceToken: sourceTokenAddress,
            destinationToken: underlying,
            amount: amountWei.toString(),
            composeFlowsCount: quotePayload.composeFlows?.length,
            intentSimpleData: quotePayload.composeFlows?.find((f: any) => f.type === '/instructions/intent-simple')?.data,
            fundingTokens: quotePayload.fundingTokens,
            feeToken: quotePayload.feeToken,
          },
        })
        throw new Error(`Quote failed: ${errText}`)
      }
    }
    let quote = await quoteRes.json()
    
    // Extract fee info for logging/display purposes (Biconomy handles fee deduction automatically)
    const innerQuoteForFeeLog: any = (quote?.quote || quote?.result?.quote || quote || {}) as any
    const paymentInfoForLog: any = (quote as any)?.quote?.paymentInfo
        || (quote as any)?.result?.quote?.paymentInfo
      || innerQuoteForFeeLog?.paymentInfo
        || null
    
    // Extract normalized fee for immediate display
    const normalizedFeeForDisplay = (quote as any)?.fee || (quote as any)?.result?.fee || innerQuoteForFeeLog?.fee || null
    const feeDetailsForDisplay = paymentInfoForLog ? {
      amount: normalizedFeeForDisplay?.amount,
      token: normalizedFeeForDisplay?.token,
      chainId: normalizedFeeForDisplay?.chainId,
      paymentToken: paymentInfoForLog?.token,
      paymentTokenWeiAmount: paymentInfoForLog?.tokenWeiAmount,
      paymentTokenValue: paymentInfoForLog?.tokenValue,
    } : null
    
    if (paymentInfoForLog) {
      const feeTokenAddr: string | undefined = paymentInfoForLog?.token
      const feeWeiStr: string | undefined = paymentInfoForLog?.tokenWeiAmount
      console.log('[BiconomyAdapter] fee info (for display only)', {
        feeToken: feeTokenAddr,
        feeWei: feeWeiStr,
        feeValue: paymentInfoForLog?.tokenValue,
        sameAsFundingToken: feeTokenAddr?.toLowerCase?.() === selectedFundingToken?.toLowerCase?.(),
        note: 'Biconomy will automatically deduct fee from the input amount',
      })
    }
    
    // Continue with original quote - Biconomy handles fee deduction automatically
    // Dispatch fee details immediately when quote is received so UI can display it
    dispatchPhase('quote-ok', { 
      operation: 'supply',
      fee: normalizedFeeForDisplay,
      feeDetails: feeDetailsForDisplay,
    })
    // Diagnostics for main flow
    try {
      const rootKeys = Object.keys(quote || {})
      console.log('[BiconomyAdapter] quote ok', { tookMs: Date.now() - quoteStart, rootKeys })
      const innerQuote = (quote?.quote || quote?.result?.quote || undefined) as any
      console.log('[BiconomyAdapter] quote fields', {
        quoteType: (quote?.quoteType || quote?.type),
        feeSet: Boolean(quote?.fee),
        innerKeys: innerQuote ? Object.keys(innerQuote) : [],
        hashSet: Boolean(innerQuote?.hash),
        nodeSet: Boolean(innerQuote?.node),
        commitmentSet: Boolean(innerQuote?.commitment),
        paymentInfoSet: Boolean(innerQuote?.paymentInfo),
        userOpsLen: Array.isArray(innerQuote?.userOps) ? innerQuote.userOps.length : 0,
      })
      const payloadsDiag: any[] = (Array.isArray(quote?.payloadToSign) && quote.payloadToSign)
        || (Array.isArray(quote?.payloads?.toSign) && quote.payloads.toSign)
        || (Array.isArray(quote?.result?.payloadToSign) && quote.result.payloadToSign)
        || []
      if (payloadsDiag.length > 0) {
        const p0 = payloadsDiag[0]
        console.log('[BiconomyAdapter] payload[0] shape', {
          keys: Object.keys(p0 || {}),
          hasDomain: Boolean(p0?.domain),
          hasTypes: Boolean(p0?.types),
          hasMessage: Boolean(p0?.message),
          hasTxFields: Boolean(p0?.to && (p0?.data !== undefined) && (p0?.chainId !== undefined)),
          hasWrapperType: Boolean(p0?.type && p0?.data),
          chainId: p0?.chainId || p0?.domain?.chainId || p0?.data?.chainId,
        })
      } else {
        console.log('[BiconomyAdapter] payloads empty')
      }
      if (isWethPath) {
        try {
          console.log('[BiconomyAdapter] WETH quote diagnostics', {
            quoteType: quote?.quoteType || quote?.type,
            fundingMode: quote?.funding?.mode || quote?.funding?.type,
            fundingSpender: quote?.funding?.spender || quote?.funding?.approval?.spender,
            payloadCount: payloadsDiag.length,
          })
        } catch {}
      }
    } catch {}

    // Detect if on-chain funding approval is required. If so, surface a typed error so the UI can prompt wallet approval
    try {
      const quoteType: string | undefined = (quote?.quoteType || quote?.type || quote?.funding?.type || '').toString().toLowerCase?.()
      const funding = quote?.funding || quote?.payloads?.funding || null
      const requiresOnchain = quoteType === 'onchain' || funding?.mode === 'onchain' || funding?.type === 'onchain'
      const spender: string | undefined = funding?.spender || funding?.approval?.spender || funding?.transactions?.[0]?.to
      const amountStr: string = amountWei.toString()
      if (requiresOnchain && spender && typeof spender === 'string') {
        const data = { spender, tokenAddress: fundingToken, amount: amountStr, chainId: sourceChainId }
        throw new Error(`BICONOMY_ONCHAIN_APPROVAL_REQUIRED:${JSON.stringify(data)}`)
      }
    } catch {}

    // Sign payloads from quote (required by /v1/execute)
    const { payloads, rawPayloads, source: payloadSource } = extractQuotePayloads(quote)
    const payloadDiagnostics = payloads.map((entry, idx) => {
      const keys = entry ? Object.keys(entry) : []
      const { signable, metadata, hasSignableWrapper } = unwrapPayload(entry)
      const signableKeys = signable && typeof signable === 'object' ? Object.keys(signable) : []
      const metaKeys = metadata && typeof metadata === 'object' ? Object.keys(metadata) : []
      return {
        idx,
        keys,
        type: entry?.type,
        hasSignablePayload: hasSignableWrapper,
        signableKeys,
        metaKeys,
        chainId: signable?.chainId || signable?.domain?.chainId,
        to: signable?.to,
        primaryType: signable?.primaryType,
      }
    })
    console.log('[BiconomyAdapter] signing step', { payloadSource, payloadCount: payloads.length, rawPayloadCount: rawPayloads.length, payloadDiagnostics })
    dispatchPhase('sign-start', { operation: 'supply', payloadCount: payloads.length })
    if (!payloads.length) {
      console.error('[BiconomyAdapter] Missing signable payloads from quote; aborting execute', {
        payloadSource,
        rawPayloadCount: rawPayloads.length,
        sourceToken: sourceTokenAddress,
        underlying,
        isWethPath,
      })
      throw new Error('BICONOMY_MISSING_SIGNABLE_PAYLOADS')
    }
    // ── Wallet client selection ───────────────────────────────────────────────
    // signingClient: wagmi WalletClient passed from the React hook layer.
    //   Used for Privy smart wallets because Privy embedded wallets are NOT
    //   injected into window.ethereum — selectInjectedProvider can never find them.
    //   The wagmi client uses the active Privy connector and signs via the smart
    //   wallet (account = userAddress), which triggers EIP-1271 validation.
    //
    // Injected provider path: regular EOAs (MetaMask etc.) where window.ethereum works.
    let activeWalletClient: any
    let useExternalSigningClient = false
    let picked: any = null

    if (signingClient) {
      activeWalletClient = signingClient
      useExternalSigningClient = true
      console.log('[BiconomyAdapter] Using external signingClient (wagmi/Privy connector)', {
        hasAccount: !!(signingClient as any)?.account,
        accountAddress: (signingClient as any)?.account?.address,
        userAddress,
      })
    } else {
      const { provider, candidates, matched } = await selectInjectedProvider(signingAddress)
      picked = provider
      activeWalletClient = createWalletClientForProvider(provider)
      try {
        console.log('[BiconomyAdapter] provider selection (injected)', {
          candidates: describeProviders(candidates),
          matched,
          signingAddress,
          userAddress,
          pickedProvider: {
            isPrivy: provider?.isPrivy,
            constructorName: provider?.constructor?.name,
            hasSendTransaction: !!provider?.sendTransaction,
            hasSignTransaction: !!provider?.signTransaction,
            isPrivyDetected: isPrivyProvider(provider),
          }
        })
      } catch {}
    }

    // For the external (wagmi/Privy) client, sign using userAddress (the connected
    // account = smart wallet address). For the injected provider path, use signingAddress
    // (EOA, already selected against window.ethereum providers).
    const accountForSigning: Address = useExternalSigningClient ? (userAddress as Address) : (signingAddress as Address)

    const inferPrimaryType = (types: Record<string, any>): string => {
      const keys = Object.keys(types || {}).filter(k => k !== 'EIP712Domain')
      return keys[0] || 'Permit'
    }
    const signedPayloads = [] as any[]
    payloads.forEach((pRaw, idx) => {
      if (!pRaw || (typeof pRaw === 'object' && !Object.keys(pRaw).length)) {
        console.error('[BiconomyAdapter] Invalid payload entry (empty object)', { idx, payload: pRaw })
        throw new Error('BICONOMY_INVALID_SIGNABLE_PAYLOAD')
      }
    })

    for (const [index, pRaw] of payloads.entries()) {
      // Unwrap known wrappers: { type, data } and { signablePayload, metadata }
      const hasWrapperTypeData = pRaw && pRaw.type && pRaw.data
      const hasSignableWrapper = pRaw && pRaw.signablePayload
      const signable = hasWrapperTypeData ? pRaw.data : hasSignableWrapper ? pRaw.signablePayload : pRaw
      const meta = hasSignableWrapper ? pRaw.metadata : undefined
      if (!signable || (typeof signable === 'object' && !Object.keys(signable).length)) {
        console.error('[BiconomyAdapter] Signable payload missing fields', {
          index,
          wrapperType: hasSignableWrapper ? 'signablePayload' : hasWrapperTypeData ? pRaw.type : 'direct',
          rawKeys: Object.keys(pRaw || {}),
        })
        throw new Error('BICONOMY_INVALID_SIGNABLE_PAYLOAD')
      }
      if (hasSignableWrapper) {
        try {
          console.log('[BiconomyAdapter] signable wrapper detected', { signableKeys: Object.keys(signable || {}), metaKeys: meta ? Object.keys(meta || {}) : [] })
        } catch {}
      }
      const p = signable
      // EIP-712 typed data (permit/message)
      const eip712 = p?.eip712 || p
      if (eip712?.domain && eip712?.types && eip712?.message) {
        console.log('[BiconomyAdapter] signing typed data', {
          primaryType: p?.primaryType || inferPrimaryType(p.types),
          domainChainId: p?.domain?.chainId,
          accountForSigning,
          usingExternalClient: useExternalSigningClient,
        })
        const primaryType: string = eip712?.primaryType || inferPrimaryType(eip712.types)
        // For the external wagmi/Privy client, do NOT override account — the WalletClient has
        // a SmartWalletAccount object with Privy's own sign methods. Passing a plain 0x string
        // would bypass the SmartWalletAccount and fall back to eth_signTypedData_v4 on the
        // JSON-RPC provider, which doesn't handle the smart wallet address and silently hangs.
        const signature = await activeWalletClient.signTypedData({
          ...(useExternalSigningClient ? {} : { account: accountForSigning }),
          domain: eip712.domain,
          types: eip712.types,
          primaryType,
          message: eip712.message,
        } as any)
        console.log('[BiconomyAdapter] signed typed data ok')
        signedPayloads.push(
          hasSignableWrapper
            ? { signablePayload: pRaw.signablePayload, metadata: meta, signature }
            : { message: eip712.message, signature }
        )
        continue
      }
      // Onchain tx-shaped payload
      if (p?.to && p?.data != null && p?.chainId) {
        const chain = CHAIN_BY_ID[p.chainId] || undefined
        const valueBig = (() => { try { return BigInt(p?.value ?? '0') } catch { return BigInt(0) } })()
        console.log('[BiconomyAdapter] signing transaction', {
          to: p?.to,
          chainId: p?.chainId,
          hasData: Boolean(p?.data),
          accountForSigning,
          usingExternalClient: useExternalSigningClient,
        })
        try {
          let signed: string

          // External signing client (wagmi/Privy): smart wallet sends the tx directly.
          // Injected provider with Privy detection: also uses sendTransaction.
          // Regular EOA injected provider: tries signTransaction first, falls back to send.
          const useDirectSend = useExternalSigningClient || (!useExternalSigningClient && isPrivyProvider(picked))

          if (useDirectSend) {
            console.log('[BiconomyAdapter] sending transaction via wallet client')
            // Same rationale as signTypedData: don't override account for external Privy client.
            const txHash = await activeWalletClient.sendTransaction({
              ...(useExternalSigningClient ? {} : { account: accountForSigning }),
              chain,
              to: p.to as Address,
              data: p.data as `0x${string}`,
              value: valueBig,
            } as any)
            signed = txHash
            console.log('[BiconomyAdapter] transaction sent', { txHash })
          } else {
            try {
              signed = await activeWalletClient.signTransaction({
                account: accountForSigning,
                chain,
                to: p.to as Address,
                data: p.data as `0x${string}`,
                value: valueBig,
              } as any)
              console.log('[BiconomyAdapter] signed transaction ok')
            } catch (signError: any) {
              if (signError?.message?.includes('eth_signTransaction') ||
                  signError?.message?.includes('Method not supported')) {
                console.log('[BiconomyAdapter] signTransaction failed, falling back to sendTransaction', { error: signError.message })
                const txHash = await activeWalletClient.sendTransaction({
                  account: accountForSigning,
                  chain,
                  to: p.to as Address,
                  data: p.data as `0x${string}`,
                  value: valueBig,
                } as any)
                signed = txHash
                console.log('[BiconomyAdapter] fallback sendTransaction successful', { txHash })
              } else {
                throw signError
              }
            }
          }
          signedPayloads.push(
            hasSignableWrapper
              ? { signablePayload: pRaw.signablePayload, metadata: meta, signature: signed }
              : { to: p.to, data: p.data, value: p?.value ?? '0', chainId: p.chainId, signature: signed }
          )
        } catch (e: any) {
          const reason = e?.message || e || 'unknown'
          console.error('[BiconomyAdapter] signTransaction failed; aborting execute (supply path)', { reason, to: p?.to, chainId: p?.chainId })
          throw new Error('BICONOMY_SIGN_TRANSACTION_UNSUPPORTED')
        }
        continue
      }
      // Simple message payload
      if (p?.message) {
        console.log('[BiconomyAdapter] signing message')
        const signature = await (activeWalletClient as any).signMessage?.({
          ...(useExternalSigningClient ? {} : { account: accountForSigning }),
          message: p.message,
        })
        console.log('[BiconomyAdapter] signed message ok')
        signedPayloads.push({ message: p.message, signature })
        continue
      }
      try {
        console.warn('[BiconomyAdapter] Unrecognized payload to sign; forwarding as-is', { keys: Object.keys(p || {}), sample: JSON.stringify(p) })
      } catch {
        console.warn('[BiconomyAdapter] Unrecognized payload to sign; forwarding as-is (stringify failed)')
      }
      signedPayloads.push(p)
    }

    const execStart = Date.now()
    // Diagnostics for execute body
    const innerQuoteForDiag = (quote?.quote || quote?.result?.quote || undefined) as any
    const payload0 = signedPayloads?.[0] || null
    console.log('[BiconomyAdapter] execute body fields', {
      ownerSet: Boolean(userAddress),
      feeKeys: quote?.fee ? Object.keys(quote.fee) : [],
      quoteType: (quote?.quoteType || quote?.type),
      quoteKeys: Object.keys(quote || {}),
      innerQuoteKeys: innerQuoteForDiag ? Object.keys(innerQuoteForDiag) : [],
      innerQuoteHasHash: Boolean(innerQuoteForDiag?.hash),
      innerQuoteHasPaymentInfo: Boolean(innerQuoteForDiag?.paymentInfo),
      payloadLen: signedPayloads.length,
      payload0Keys: payload0 ? Object.keys(payload0) : [],
    })
    dispatchPhase('execute-start', { operation: 'supply' })
    const execRes = await fetch('/api/biconomy/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerAddress: userAddress,
        fee: quote?.fee,
        quoteType: (quote?.quoteType || quote?.type || '').toString().toLowerCase?.(),
        quote: innerQuoteForDiag || quote,
        payloadToSign: signedPayloads,
      }),
    })
    if (!execRes.ok) {
      const err = await execRes.text()
      console.error('[BiconomyAdapter] execute failed', { status: execRes.status, tookMs: Date.now() - execStart, error: err })
      throw new Error(`Execute failed: ${err}`)
    }
    const exec = (await execRes.json()) as { hash?: string; trackingUrl?: string }
    console.debug('[BiconomyAdapter] execute ok', { tookMs: Date.now() - execStart, hash: exec?.hash, trackingUrl: exec?.trackingUrl })

    // Try to surface a fee object from multiple possible locations in the quote
    const innerQuoteAny: any = innerQuoteForDiag || quote || {}
    const normalizedFee = (quote as any)?.fee
      || (quote as any)?.result?.fee
      || innerQuoteAny?.fee
      || null

    const paymentInfo = (quote as any)?.quote?.paymentInfo || innerQuoteAny?.paymentInfo || null
    const feeDetails = {
      amount: normalizedFee?.amount,
      token: normalizedFee?.token,
      chainId: normalizedFee?.chainId,
      paymentToken: paymentInfo?.token,
      paymentTokenWeiAmount: paymentInfo?.tokenWeiAmount,
      paymentTokenValue: paymentInfo?.tokenValue,
    }

    // Prefer execute hash; fallback to quote.hash if execute omitted hash
    const candidateHash = (exec?.hash
      || (innerQuoteAny?.hash as string | undefined)
      || ((quote as any)?.quote?.hash as string | undefined)
      || ((quote as any)?.result?.quote?.hash as string | undefined)
    ) as string | undefined
    let meeScanLink: string | undefined
    if (candidateHash && /^0x[a-fA-F0-9]{64}$/.test(candidateHash)) {
      try { meeScanLink = getMeeScanLink(candidateHash as `0x${string}`) } catch {}
    }
    const resolvedHash = (exec?.hash || candidateHash || '')
    dispatchPhase('execute-ok', { operation: 'supply', hash: resolvedHash, trackingUrl: exec?.trackingUrl })
    // Best-effort: log sponsored usage for analytics
    try {
      fetch('/api/biconomy/sponsored-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: userAddress, superTxHash: resolvedHash, label: 'cross-chain_supply' }),
      }).catch(() => {})
    } catch {}
    // Cross-chain only follow-up: gas-sponsored delegated enable-collateral
    if (postEnableAsCollateral && effectiveReturnPTokens) {
      try {
        if (!meeAuthorization) {
          console.warn('[BiconomyAdapter] Skipping enable-collateral: missing meeAuthorization (EIP-7702)')
          dispatchPhase('enable-skip', { operation: 'supply', reason: 'missing-authorization' })
          throw new Error('BICONOMY_ENABLE_REQUIRES_7702_AUTH')
        }

        dispatchPhase('compose-start', { operation: 'supply', phase: 'enable-collateral' })
        // Compose a single enterMarkets call via Biconomy
        const enableComposeBody = {
          ownerAddress: userAddress,
          mode: 'eoa',
          composeFlows: [
            {
              type: '/instructions/build',
              data: {
                functionSignature: 'function enterMarkets(address[])',
                args: [[pTokenAddress]],
                to: PERIDOT_CONTROLLER,
                chainId: destinationChainId,
                value: '0',
              },
            },
          ],
        }
        const enableComposeRes = await fetch('/api/biconomy/compose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enableComposeBody),
        })
        if (!enableComposeRes.ok) {
          const err = await enableComposeRes.text()
          console.error('[BiconomyAdapter] enable-collateral compose failed', { status: enableComposeRes.status, error: err })
          throw new Error(`Enable compose failed: ${err}`)
        }
        const { instructions: enableInstructionsComposed } = await enableComposeRes.json()

        const enableInstructions = [
          {
            type: '/instructions/build',
            data: {
              functionSignature: 'function enterMarkets(address[])',
              args: [[pTokenAddress]],
              to: PERIDOT_CONTROLLER,
              chainId: destinationChainId,
              value: '0',
            },
          },
        ]
        const enableQuotePayload: any = {
          ownerAddress: userAddress,
          mode: 'eoa',
          instructions: Array.isArray(enableInstructionsComposed) && enableInstructionsComposed.length ? enableInstructionsComposed : enableInstructions,
          sponsorship: true,
          // Request delegated execution so msg.sender is user's EOA; attach auth if provided
          delegate: true,
          ...(meeAuthorization ? { authorization: meeAuthorization } : {}),
        }
        const enableQuoteRes = await fetch('/api/biconomy/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enableQuotePayload),
        })
        if (enableQuoteRes.ok) {
          const enableQuote = await enableQuoteRes.json()
          const enablePayloadsRaw: any[] = (Array.isArray(enableQuote?.payloadToSign) && enableQuote.payloadToSign)
            || (Array.isArray(enableQuote?.payloads?.toSign) && enableQuote.payloads.toSign)
            || (Array.isArray(enableQuote?.result?.payloadToSign) && enableQuote.result.payloadToSign)
            || []
          const enablePayloads = enablePayloadsRaw.filter((p) => p != null)
          console.log('[BiconomyAdapter] enable-collateral quote ok', { payloadCount: enablePayloads.length, rawPayloadCount: enablePayloadsRaw.length })
          if (!enablePayloads.length) {
            console.error('[BiconomyAdapter] Enable collateral quote missing signable payloads; skipping execute', { rawPayloadCount: enablePayloadsRaw.length })
            throw new Error('BICONOMY_MISSING_SIGNABLE_PAYLOADS')
          }
          const signedEnablePayloads = [] as any[]
          for (const pRaw of enablePayloads) {
            const hasWrapperTypeData = pRaw && pRaw.type && pRaw.data
            const hasSignableWrapper = pRaw && pRaw.signablePayload
            const signable = hasWrapperTypeData ? pRaw.data : hasSignableWrapper ? pRaw.signablePayload : pRaw
            const meta = hasSignableWrapper ? pRaw.metadata : undefined
            const eip712 = signable?.eip712 || signable
            if (eip712?.domain && eip712?.types && eip712?.message) {
              const primaryType: string = eip712?.primaryType || (Object.keys(eip712.types || {}).find(k => k !== 'EIP712Domain') || 'Permit')
              const signature = await walletClient.signTypedData({
                account: userAddress as Address,
                domain: eip712.domain,
                types: eip712.types,
                primaryType,
                message: eip712.message,
              } as any)
              signedEnablePayloads.push(
                hasSignableWrapper
                  ? { signablePayload: pRaw.signablePayload, metadata: meta, signature }
                  : { message: eip712.message, signature }
              )
              continue
            }
            if (signable?.to && signable?.data != null && signable?.chainId) {
              const chain = CHAIN_BY_ID[signable.chainId] || undefined
              const valueBig = (() => { try { return BigInt(signable?.value ?? '0') } catch { return BigInt(0) } })()
              
              let signed: string
              if (isPrivyProvider(picked)) {
                console.log('[BiconomyAdapter] Using Privy provider - sending transaction directly (enable collateral path)')
                const txHash = await walletClient.sendTransaction({
                  account: userAddress as Address,
                  chain,
                  to: signable.to as Address,
                  data: signable.data as `0x${string}`,
                  value: valueBig,
                } as any)
                signed = txHash
                console.log('[BiconomyAdapter] Privy smart account transaction executed (enable collateral)', { txHash })
              } else {
                try {
                  signed = await walletClient.signTransaction({
                    account: userAddress as Address,
                    chain,
                    to: signable.to as Address,
                    data: signable.data as `0x${string}`,
                    value: valueBig,
                  } as any)
                  console.log('[BiconomyAdapter] signed transaction ok (enable collateral)')
                } catch (signError: any) {
                  if (signError?.message?.includes('eth_signTransaction') || 
                      signError?.message?.includes('Method not supported')) {
                    console.log('[BiconomyAdapter] signTransaction failed, falling back to sendTransaction (enable collateral)', { error: signError.message })
                    const txHash = await walletClient.sendTransaction({
                      account: userAddress as Address,
                      chain,
                      to: signable.to as Address,
                      data: signable.data as `0x${string}`,
                      value: valueBig,
                    } as any)
                    signed = txHash
                    console.log('[BiconomyAdapter] Fallback sendTransaction successful (enable collateral)', { txHash })
                  } else {
                    throw signError
                  }
                }
              }
              
              signedEnablePayloads.push(
                hasSignableWrapper
                  ? { signablePayload: pRaw.signablePayload, metadata: meta, signature: signed }
                  : { to: signable.to, data: signable.data, value: signable?.value ?? '0', chainId: signable.chainId, signature: signed }
              )
              continue
            }
            console.error('[BiconomyAdapter] signTransaction failed; aborting execute (enable path)', { to: signable?.to, chainId: signable?.chainId })
            throw new Error('BICONOMY_SIGN_TRANSACTION_UNSUPPORTED')
          }
          const enableExecuteRes = await fetch('/api/biconomy/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ownerAddress: userAddress,
              fee: (enableQuote as any)?.fee,
              quoteType: ((enableQuote as any)?.quoteType || (enableQuote as any)?.type || '').toString().toLowerCase?.(),
              quote: ((enableQuote as any)?.quote || (enableQuote as any)?.result?.quote || enableQuote),
              payloadToSign: signedEnablePayloads,
            }),
          })
          if (!enableExecuteRes.ok) {
            const err = await enableExecuteRes.text()
            console.error('[BiconomyAdapter] enable-collateral execute failed', { status: enableExecuteRes.status, error: err })
            throw new Error(`Enable execute failed: ${err}`)
          }
          console.log('[BiconomyAdapter] enable-collateral execute ok')
          try {
            fetch('/api/biconomy/sponsored-usage', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ walletAddress: userAddress, superTxHash: resolvedHash + ':enable', label: 'enable_collateral' }),
            }).catch(() => {})
          } catch {}
        }
      } catch (e) {
        console.warn('[BiconomyAdapter] enable-collateral follow-up failed', e)
      }
    }

    return { superTxHash: resolvedHash, trackingUrl: exec?.trackingUrl, fee: normalizedFee || undefined, feeDetails, meeScanLink }
  }

  /**
   * Transfer tokens from a Privy smart wallet to its embedded EOA signer,
   * using Biconomy Fusion for gas sponsorship (no ETH required in the smart wallet).
   *
   * @param smartWalletAddress - The Privy smart account address (owner/payer)
   * @param signerAddress      - The destination EOA address
   * @param signingClient      - wagmi WalletClient for the connected Privy connector
   * @param amountWei          - Amount to transfer (in token decimals / wei)
   * @param chainId            - Chain where the token lives (e.g. 42161 for Arbitrum)
   * @param tokenAddress       - ERC-20 token to transfer (e.g. USDC on Arbitrum)
   */
  async startWithdrawToSigner(params: {
    smartWalletAddress: Address
    signerAddress: Address
    signingClient: any
    amountWei: bigint
    chainId: number
    tokenAddress: Address
  }): Promise<{ superTxHash: string; meeScanLink?: string }> {
    const { smartWalletAddress, signerAddress, signingClient, amountWei, chainId, tokenAddress } = params

    const dispatchPhase = (phase: string, meta?: any) => {
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('peridot:biconomy-phase', { detail: { phase, meta } }))
        }
      } catch {}
    }

    dispatchPhase('compose-start', { operation: 'withdraw-to-signer', smartWalletAddress, signerAddress, chainId })

    // Single compose flow: ERC-20 transfer from smart wallet to EOA.
    // Use runtimeErc20Balance so Biconomy resolves the actual spendable balance at
    // execution time. A hardcoded amountWei causes simulation to fail for counterfactual
    // (not-yet-deployed) Nexus accounts — Biconomy's simulation environment cannot read
    // ERC-20 token balances held by an address whose contract doesn't exist yet.
    const composeFlows = [
      {
        type: '/instructions/build',
        data: {
          functionSignature: 'function transfer(address,uint256)',
          args: [
            signerAddress,
            { type: 'runtimeErc20Balance', tokenAddress, constraints: { gte: '1' } },
          ],
          to: tokenAddress,
          chainId,
          value: '0',
        },
      },
    ]

    // Quote: smart-account mode — Biconomy forbids fundingTokens/feeToken in this mode.
    // sponsorship: true enables gasless execution via Biconomy paymaster.
    const quotePayload = {
      ownerAddress: smartWalletAddress,
      mode: 'smart-account',
      composeFlows,
      sponsorship: true,
    }

    console.log('[BiconomyAdapter] startWithdrawToSigner quote payload', {
      ownerAddress: smartWalletAddress,
      signerAddress,
      chainId,
      tokenAddress,
      amountWei: amountWei.toString(),
    })

    dispatchPhase('quote-start', { operation: 'withdraw-to-signer' })
    let quoteRes = await fetch('/api/biconomy/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quotePayload),
    })
    if (!quoteRes.ok) {
      const errText = await quoteRes.text()
      // Retry once on transient rate-limit / server busy errors
      if (/rate.?limit|server.?busy/i.test(errText)) {
        await new Promise(r => setTimeout(r, 2500))
        quoteRes = await fetch('/api/biconomy/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(quotePayload),
        })
        if (!quoteRes.ok) throw new Error(`Quote failed: ${await quoteRes.text()}`)
      } else {
        throw new Error(`Quote failed: ${errText}`)
      }
    }
    const quote = await quoteRes.json()
    dispatchPhase('quote-ok', { operation: 'withdraw-to-signer' })

    // Extract signable payloads
    const { payloads, rawPayloads } = extractQuotePayloads(quote)
    if (!payloads.length) {
      console.error('[BiconomyAdapter] startWithdrawToSigner: no signable payloads', { rawPayloadCount: rawPayloads.length })
      throw new Error('BICONOMY_MISSING_SIGNABLE_PAYLOADS')
    }

    // Use the provided wagmi/Privy signingClient directly (same pattern as startSupply external client path).
    // Do NOT override `account` when calling sign methods — the WalletClient has a SmartWalletAccount
    // object with Privy's own sign methods; overriding it would bypass EIP-1271 validation.
    const activeWalletClient = signingClient
    const inferPrimaryType = (types: Record<string, any>): string => {
      const keys = Object.keys(types || {}).filter(k => k !== 'EIP712Domain')
      return keys[0] || 'Permit'
    }

    dispatchPhase('sign-start', { operation: 'withdraw-to-signer', payloadCount: payloads.length })
    const signedPayloads = [] as any[]

    for (const pRaw of payloads) {
      const hasWrapperTypeData = pRaw && pRaw.type && pRaw.data
      const hasSignableWrapper = pRaw && pRaw.signablePayload
      const signable = hasWrapperTypeData ? pRaw.data : hasSignableWrapper ? pRaw.signablePayload : pRaw
      const meta = hasSignableWrapper ? pRaw.metadata : undefined
      const p = signable

      // EIP-712 typed data
      const eip712 = p?.eip712 || p
      if (eip712?.domain && eip712?.types && eip712?.message) {
        const primaryType: string = eip712?.primaryType || inferPrimaryType(eip712.types)
        const signature = await activeWalletClient.signTypedData({
          domain: eip712.domain,
          types: eip712.types,
          primaryType,
          message: eip712.message,
        } as any)
        signedPayloads.push(
          hasSignableWrapper
            ? { signablePayload: pRaw.signablePayload, metadata: meta, signature }
            : { message: eip712.message, signature }
        )
        continue
      }

      // Tx-shaped payload — send directly via smart wallet (sponsored)
      if (p?.to && p?.data != null && p?.chainId) {
        const chain = CHAIN_BY_ID[p.chainId] || undefined
        const valueBig = (() => { try { return BigInt(p?.value ?? '0') } catch { return BigInt(0) } })()
        const txHash = await activeWalletClient.sendTransaction({
          chain,
          to: p.to as Address,
          data: p.data as `0x${string}`,
          value: valueBig,
        } as any)
        signedPayloads.push(
          hasSignableWrapper
            ? { signablePayload: pRaw.signablePayload, metadata: meta, signature: txHash }
            : { to: p.to, data: p.data, value: p?.value ?? '0', chainId: p.chainId, signature: txHash }
        )
        continue
      }

      // Simple message payload
      if (p?.message) {
        const signature = await activeWalletClient.signMessage?.({ message: p.message })
        signedPayloads.push({ message: p.message, signature })
        continue
      }

      signedPayloads.push(p)
    }

    // Execute
    dispatchPhase('execute-start', { operation: 'withdraw-to-signer' })
    const innerQuoteForDiag = (quote?.quote || quote?.result?.quote || undefined) as any
    const execRes = await fetch('/api/biconomy/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerAddress: smartWalletAddress,
        fee: quote?.fee,
        quoteType: (quote?.quoteType || quote?.type || '').toString().toLowerCase?.(),
        quote: innerQuoteForDiag || quote,
        payloadToSign: signedPayloads,
      }),
    })
    if (!execRes.ok) throw new Error(`Execute failed: ${await execRes.text()}`)
    const exec = (await execRes.json()) as { hash?: string; trackingUrl?: string }

    const candidateHash = (exec?.hash
      || (innerQuoteForDiag?.hash as string | undefined)
      || ((quote as any)?.quote?.hash as string | undefined)
      || ((quote as any)?.result?.quote?.hash as string | undefined)
    ) as string | undefined
    let meeScanLink: string | undefined
    if (candidateHash && /^0x[a-fA-F0-9]{64}$/.test(candidateHash)) {
      try { meeScanLink = getMeeScanLink(candidateHash as `0x${string}`) } catch {}
    }
    const resolvedHash = exec?.hash || candidateHash || ''
    dispatchPhase('execute-ok', { operation: 'withdraw-to-signer', hash: resolvedHash })

    try {
      fetch('/api/biconomy/sponsored-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: smartWalletAddress, superTxHash: resolvedHash, label: 'smart-wallet_withdraw-to-signer' }),
      }).catch(() => {})
    } catch {}

    return { superTxHash: resolvedHash, meeScanLink }
  }

  async getStatus(params: GetStatusParams): Promise<GetStatusResult> {
    const endpoint = (() => {
      try {
        if (typeof window !== 'undefined') {
          const u = new URL('/api/biconomy/status', window.location.origin)
          u.searchParams.set('hash', params.superTxHash)
          return u.toString()
        }
      } catch {}
      // Fallback relative
      return `/api/biconomy/status?hash=${encodeURIComponent(params.superTxHash)}`
    })()
    const res = await fetch(endpoint, { method: 'GET' })
    if (!res.ok) {
      return { status: 'unknown' }
    }
    const data: any = await res.json()
    const rawStatus: string = (
      data?.transactionStatus ||
      data?.status ||
      data?.txStatus ||
      data?.destinationTxStatus ||
      data?.destinationStatus ||
      data?.meeStatus ||
      data?.executionStatus ||
      data?.state ||
      'PENDING'
    ).toString()
    const statusUC = rawStatus.toUpperCase()
    let mapped: 'pending' | 'executed' | 'failed' | 'unknown' = 'unknown'
    if (/(MINED_SUCCESS|SUCCESS|EXECUTED|COMPLETED)/.test(statusUC)) mapped = 'executed'
    else if (/(FAILED|FAIL|MINED_FAIL|ERROR)/.test(statusUC)) mapped = 'failed'
    else if (/(PENDING|MINING|IN_PROGRESS|PROCESSING|QUEUED)/.test(statusUC)) mapped = 'pending'

    // Explorer responses often return granular userOps status without top-level transactionStatus.
    // Derive status from userOps as a fallback to avoid indefinite "pending" for failed legs.
    const userOps = Array.isArray(data?.userOps) ? data.userOps : []
    if ((mapped === 'unknown' || mapped === 'pending') && userOps.length > 0) {
      const userOpStatuses = userOps
        .map((op: any) => String(op?.status || op?.txStatus || op?.state || '').toUpperCase())
        .filter(Boolean)
      if (userOpStatuses.some((s: string) => /(FAILED|FAIL|MINED_FAIL|ERROR|REVERT)/.test(s))) {
        mapped = 'failed'
      } else if (userOpStatuses.some((s: string) => /(MINED_SUCCESS|SUCCESS|EXECUTED|COMPLETED)/.test(s))) {
        mapped = 'executed'
      } else if (userOpStatuses.some((s: string) => /(PENDING|MINING|IN_PROGRESS|PROCESSING|QUEUED)/.test(s))) {
        mapped = 'pending'
      }
    }

    // Try to extract explorer links from a few possible shapes
    const links: string[] = []
    if (Array.isArray(data?.explorerLinks)) {
      for (const l of data.explorerLinks) if (typeof l === 'string') links.push(l)
    }
    if (typeof data?.explorerUrl === 'string') links.push(data.explorerUrl)
    if (typeof data?.destinationExplorerUrl === 'string') links.push(data.destinationExplorerUrl)
    if (Array.isArray(data?.links)) {
      for (const l of data.links) if (typeof l === 'string') links.push(l)
    }

    // Hash candidates
    const bscTxHash = (data?.bscTxHash || data?.destinationTxHash || data?.dstTxHash || data?.txHash || data?.hash) as `0x${string}` | undefined

    return { status: mapped, bscTxHash, explorerLinks: links.length ? links : undefined }
  }
}

export const biconomyAdapter: CrossChainAdapter = new BiconomyAdapter()
