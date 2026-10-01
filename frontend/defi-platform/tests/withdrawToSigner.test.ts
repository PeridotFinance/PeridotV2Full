import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BiconomyAdapter } from '@/lib/biconomyAdapter'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@biconomy/abstractjs', () => ({
  getMeeScanLink: (hash: string) => `https://meescan.biconomy.io/details/${hash}`,
}))

// biconomyAdapter imports CHAIN_BY_ID from ./biconomy/wallet and uses it only for
// tx-shaped payloads. Keep real module but provide a minimal shim so jsdom doesn't
// choke on any Node-only deps inside the wallet utils.
vi.mock('@/lib/biconomy/wallet', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/biconomy/wallet')>()
  return {
    ...real,
    selectInjectedProvider: vi.fn(),
    createWalletClientForProvider: vi.fn(),
    describeProviders: vi.fn(() => []),
    isPrivyProvider: vi.fn(() => false),
  }
})

// ── Constants ─────────────────────────────────────────────────────────────────

const SMART_WALLET = '0x9b2A2E41170d2E87aC9bDf7e4aFdcc3EA02ac18a' as `0x${string}`
const SIGNER      = '0x1234567890123456789012345678901234567890' as `0x${string}`
const USDC_ARB    = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`
const ARB_CHAIN   = 42161
const AMOUNT_WEI  = 4_500_000n // 4.5 USDC (6 decimals)
const EXEC_HASH   = ('0x' + 'ab'.repeat(32)) as `0x${string}`

// ── Shared mock factories ─────────────────────────────────────────────────────

function makeTypedDataPayload() {
  return {
    payloadToSign: [
      {
        domain:      { name: 'USDC', version: '2', chainId: ARB_CHAIN },
        types:       { Transfer: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }] },
        primaryType: 'Transfer',
        message:     { to: SIGNER, amount: AMOUNT_WEI.toString() },
      },
    ],
  }
}

function makeTxPayload() {
  return {
    payloadToSign: [
      {
        to:      USDC_ARB,
        data:    '0xa9059cbb' + '00'.repeat(60),
        chainId: ARB_CHAIN,
        value:   '0',
      },
    ],
  }
}

function makeSigningClient(overrides?: Partial<{
  signTypedData: () => Promise<string>
  sendTransaction: () => Promise<string>
  signMessage: () => Promise<string>
}>) {
  return {
    signTypedData:   vi.fn().mockResolvedValue('0xsig_typed'),
    sendTransaction: vi.fn().mockResolvedValue(EXEC_HASH),
    signMessage:     vi.fn().mockResolvedValue('0xsig_msg'),
    ...overrides,
  }
}

function mockFetch(responses: Array<{ ok: boolean; body: any; status?: number }>) {
  let call = 0
  return vi.fn().mockImplementation(() => {
    const r = responses[call++] ?? responses[responses.length - 1]
    return Promise.resolve({
      ok:     r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      text:   () => Promise.resolve(typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
      json:   () => Promise.resolve(r.body),
    })
  })
}

function makeParams(overrides: Partial<Parameters<BiconomyAdapter['startWithdrawToSigner']>[0]> = {}) {
  return {
    smartWalletAddress: SMART_WALLET,
    signerAddress:      SIGNER,
    signingClient:      makeSigningClient(),
    amountWei:          AMOUNT_WEI,
    chainId:            ARB_CHAIN,
    tokenAddress:       USDC_ARB,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BiconomyAdapter.startWithdrawToSigner', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // ── Quote payload shape ─────────────────────────────────────────────────────

  it('sends smart-account mode with sponsorship and no fundingTokens', async () => {
    const quoteBody = makeTypedDataPayload()
    const fetch = mockFetch([
      { ok: true, body: quoteBody },                    // quote
      { ok: true, body: { hash: EXEC_HASH } },          // execute
      { ok: true, body: {} },                           // sponsored-usage (fire-and-forget)
    ])
    vi.stubGlobal('fetch', fetch)

    await new BiconomyAdapter().startWithdrawToSigner(makeParams())

    const [quoteUrl, quoteInit] = fetch.mock.calls[0]
    expect(quoteUrl).toBe('/api/biconomy/quote')
    const body = JSON.parse(quoteInit.body as string)
    expect(body.mode).toBe('smart-account')
    expect(body.sponsorship).toBe(true)
    expect(body.ownerAddress).toBe(SMART_WALLET)
    expect(body.fundingTokens).toBeUndefined()
    expect(body.feeToken).toBeUndefined()
  })

  it('composeFlow uses runtimeErc20Balance, not a hardcoded amount', async () => {
    const fetch = mockFetch([
      { ok: true, body: makeTypedDataPayload() },
      { ok: true, body: { hash: EXEC_HASH } },
      { ok: true, body: {} },
    ])
    vi.stubGlobal('fetch', fetch)

    await new BiconomyAdapter().startWithdrawToSigner(makeParams())

    const body = JSON.parse(fetch.mock.calls[0][1].body as string)
    const flow = body.composeFlows[0]
    expect(flow.type).toBe('/instructions/build')
    expect(flow.data.functionSignature).toBe('function transfer(address,uint256)')
    expect(flow.data.to).toBe(USDC_ARB)
    expect(flow.data.chainId).toBe(ARB_CHAIN)

    const amountArg = flow.data.args[1]
    expect(typeof amountArg).toBe('object')
    expect(amountArg.type).toBe('runtimeErc20Balance')
    expect(amountArg.tokenAddress).toBe(USDC_ARB)
    expect(amountArg.constraints.gte).toBe('1')
    // Must NOT be a plain number/string — that causes simulation failures for
    // counterfactual Nexus accounts
    expect(typeof amountArg).not.toBe('string')
  })

  it('composeFlow recipient is the signer address', async () => {
    const fetch = mockFetch([
      { ok: true, body: makeTypedDataPayload() },
      { ok: true, body: { hash: EXEC_HASH } },
      { ok: true, body: {} },
    ])
    vi.stubGlobal('fetch', fetch)

    await new BiconomyAdapter().startWithdrawToSigner(makeParams())

    const body = JSON.parse(fetch.mock.calls[0][1].body as string)
    expect(body.composeFlows[0].data.args[0]).toBe(SIGNER)
  })

  // ── Signing paths ───────────────────────────────────────────────────────────

  it('signs EIP-712 typed data without passing an account override', async () => {
    const signingClient = makeSigningClient()
    const fetch = mockFetch([
      { ok: true, body: makeTypedDataPayload() },
      { ok: true, body: { hash: EXEC_HASH } },
      { ok: true, body: {} },
    ])
    vi.stubGlobal('fetch', fetch)

    await new BiconomyAdapter().startWithdrawToSigner(makeParams({ signingClient }))

    expect(signingClient.signTypedData).toHaveBeenCalledOnce()
    const callArg = signingClient.signTypedData.mock.calls[0][0]
    // Must NOT set account — Privy SmartWalletAccount handles it internally
    expect(callArg.account).toBeUndefined()
    expect(callArg.domain).toBeDefined()
    expect(callArg.types).toBeDefined()
    expect(callArg.message).toBeDefined()
  })

  it('sends tx-shaped payload directly via sendTransaction without account override', async () => {
    const signingClient = makeSigningClient()
    const fetch = mockFetch([
      { ok: true, body: makeTxPayload() },
      { ok: true, body: { hash: EXEC_HASH } },
      { ok: true, body: {} },
    ])
    vi.stubGlobal('fetch', fetch)

    await new BiconomyAdapter().startWithdrawToSigner(makeParams({ signingClient }))

    expect(signingClient.sendTransaction).toHaveBeenCalledOnce()
    const callArg = signingClient.sendTransaction.mock.calls[0][0]
    expect(callArg.account).toBeUndefined()
    expect(callArg.to).toBe(USDC_ARB)
  })

  // ── Execute call ────────────────────────────────────────────────────────────

  it('posts execute with ownerAddress = smartWalletAddress', async () => {
    const fetch = mockFetch([
      { ok: true, body: makeTypedDataPayload() },
      { ok: true, body: { hash: EXEC_HASH } },
      { ok: true, body: {} },
    ])
    vi.stubGlobal('fetch', fetch)

    await new BiconomyAdapter().startWithdrawToSigner(makeParams())

    const [execUrl, execInit] = fetch.mock.calls[1]
    expect(execUrl).toBe('/api/biconomy/execute')
    const body = JSON.parse(execInit.body as string)
    expect(body.ownerAddress).toBe(SMART_WALLET)
    expect(Array.isArray(body.payloadToSign)).toBe(true)
    expect(body.payloadToSign.length).toBeGreaterThan(0)
  })

  // ── Return values ───────────────────────────────────────────────────────────

  it('returns superTxHash from execute response', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { ok: true, body: makeTypedDataPayload() },
      { ok: true, body: { hash: EXEC_HASH } },
      { ok: true, body: {} },
    ]))

    const result = await new BiconomyAdapter().startWithdrawToSigner(makeParams())
    expect(result.superTxHash).toBe(EXEC_HASH)
  })

  it('returns a meeScanLink for a valid 32-byte hash', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { ok: true, body: makeTypedDataPayload() },
      { ok: true, body: { hash: EXEC_HASH } },
      { ok: true, body: {} },
    ]))

    const result = await new BiconomyAdapter().startWithdrawToSigner(makeParams())
    expect(result.meeScanLink).toContain(EXEC_HASH)
  })

  it('omits meeScanLink when execute returns no hash', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { ok: true, body: makeTypedDataPayload() },
      { ok: true, body: {} },           // no hash field
      { ok: true, body: {} },
    ]))

    const result = await new BiconomyAdapter().startWithdrawToSigner(makeParams())
    expect(result.meeScanLink).toBeUndefined()
  })

  // ── Error paths ─────────────────────────────────────────────────────────────

  it('retries quote once on rate-limit 500 and succeeds', async () => {
    vi.useFakeTimers()
    const fetch = mockFetch([
      { ok: false, status: 500, body: 'rate limit exceeded' },    // first quote → rate limit
      { ok: true,  body: makeTypedDataPayload() },                // retry quote → ok
      { ok: true,  body: { hash: EXEC_HASH } },                   // execute
      { ok: true,  body: {} },
    ])
    vi.stubGlobal('fetch', fetch)

    const promise = new BiconomyAdapter().startWithdrawToSigner(makeParams())
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.superTxHash).toBe(EXEC_HASH)
    // quote was called twice (initial + retry)
    const quoteCalls = fetch.mock.calls.filter(([url]) => url === '/api/biconomy/quote')
    expect(quoteCalls).toHaveLength(2)
    vi.useRealTimers()
  })

  it('throws on non-retryable quote failure', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { ok: false, status: 500, body: 'Failed to generate quote: UserOp [1] simulation failed. Revert reason: ERC20: transfer amount exceeds balance' },
    ]))

    await expect(
      new BiconomyAdapter().startWithdrawToSigner(makeParams())
    ).rejects.toThrow(/Quote failed/)
  })

  it('throws BICONOMY_MISSING_SIGNABLE_PAYLOADS when quote returns no signable payloads', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { ok: true, body: { payloadToSign: [] } },
    ]))

    await expect(
      new BiconomyAdapter().startWithdrawToSigner(makeParams())
    ).rejects.toThrow('BICONOMY_MISSING_SIGNABLE_PAYLOADS')
  })

  it('throws on execute failure', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { ok: true,  body: makeTypedDataPayload() },
      { ok: false, status: 500, body: 'execute error' },
    ]))

    await expect(
      new BiconomyAdapter().startWithdrawToSigner(makeParams())
    ).rejects.toThrow(/Execute failed/)
  })

  it('throws when signingClient.signTypedData rejects', async () => {
    const signingClient = makeSigningClient({
      signTypedData: () => Promise.reject(new Error('user rejected signing')),
    })
    vi.stubGlobal('fetch', mockFetch([
      { ok: true, body: makeTypedDataPayload() },
    ]))

    await expect(
      new BiconomyAdapter().startWithdrawToSigner(makeParams({ signingClient }))
    ).rejects.toThrow('user rejected signing')
  })
})
