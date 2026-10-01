/**
 * Wallet-injection covers two failure modes the agent has historically hit:
 *   1. The LLM forgets the address argument → server should silently inject the
 *      connected wallet so the call doesn't 400.
 *   2. The LLM PASSES an explicit address (e.g. for a different wallet the user
 *      asked about) → server must NOT overwrite it.
 *
 * Plus the multi-field cases that come from Alchemy's tool surface (some tools
 * use `addresses: string[]`, others `fromAddress`/`toAddress`, others `owner`).
 */

import { describe, it, expect } from 'vitest'

import {
  injectWalletAddress,
  WALLET_AWARE_TOOL_NAMES,
} from '@/lib/agents/mcp/wallet-injection'

const WALLET = '0x1111111111111111111111111111111111111111'
const OTHER = '0x2222222222222222222222222222222222222222'

describe('injectWalletAddress — Peridot tools (single string)', () => {
  it('injects when address is missing', () => {
    const out = injectWalletAddress(
      'mcp__peridot__get_peridot_wallet_summary',
      {},
      WALLET,
    )
    expect(out).toEqual({ address: WALLET })
  })

  it('respects an existing valid address', () => {
    const out = injectWalletAddress(
      'mcp__peridot__get_peridot_wallet_summary',
      { address: OTHER },
      WALLET,
    )
    expect(out.address).toBe(OTHER)
  })

  it('overrides an obviously invalid address', () => {
    const out = injectWalletAddress(
      'mcp__peridot__get_peridot_wallet_summary',
      { address: 'not-an-address' },
      WALLET,
    )
    expect(out.address).toBe(WALLET)
  })

  it('injects for both history + summary tools', () => {
    expect(
      injectWalletAddress('mcp__peridot__get_peridot_wallet_history', {}, WALLET),
    ).toEqual({ address: WALLET })
    expect(
      injectWalletAddress('mcp__peridot__get_peridot_wallet_summary', {}, WALLET),
    ).toEqual({ address: WALLET })
  })

  it('does NOT inject for get_user_portfolio (not exposed by Peridot MCP)', () => {
    const input = { foo: 'bar' }
    expect(
      injectWalletAddress('mcp__peridot__get_user_portfolio', input, WALLET),
    ).toBe(input)
  })
})

describe('injectWalletAddress — Alchemy multichain tools (object array)', () => {
  // These tools' schemas look like:
  //   addresses: [{ address: "0x...", networks: ["eth-mainnet", ...] }]
  // Injecting a plain string[] here (the old bug) causes the LLM call to fail
  // with a "Tool format error" because the shape doesn't match the schema.

  it('injects only ETH + Base for fetchAddressTransactionHistory (Portfolio API Beta limitation)', () => {
    // The tx-history endpoint rejects any other chain with 400 "Unsupported network".
    // Sending arb/bnb/polygon here is the bug that caused Perry's "Tool format error"
    // in production. This test is the regression guard.
    const out = injectWalletAddress(
      'mcp__alchemy__fetchAddressTransactionHistory',
      { limit: 25 },
      WALLET,
    )
    expect(out.limit).toBe(25)
    expect(Array.isArray(out.addresses)).toBe(true)
    const arr = out.addresses as Array<{ address: string; networks: string[] }>
    expect(arr).toHaveLength(1)
    expect(arr[0].address).toBe(WALLET)
    expect(arr[0].networks).toEqual(['eth-mainnet', 'base-mainnet'])
    // Must NOT include unsupported chains.
    expect(arr[0].networks).not.toContain('arb-mainnet')
    expect(arr[0].networks).not.toContain('bnb-mainnet')
    expect(arr[0].networks).not.toContain('polygon-mainnet')
  })

  it('injects the full Peridot-relevant network set for fetchTokensOwnedByMultichainAddresses', () => {
    const out = injectWalletAddress(
      'mcp__alchemy__fetchTokensOwnedByMultichainAddresses',
      {},
      WALLET,
    )
    const arr = out.addresses as Array<{ address: string; networks: string[] }>
    expect(arr[0].address).toBe(WALLET)
    // The Peridot-relevant chains: Ethereum, Arbitrum, Base, BSC, Polygon, Avalanche, Optimism.
    expect(arr[0].networks).toContain('eth-mainnet')
    expect(arr[0].networks).toContain('arb-mainnet')
    expect(arr[0].networks).toContain('bnb-mainnet')
    expect(arr[0].networks).toContain('base-mainnet')
    expect(arr[0].networks).toContain('polygon-mainnet')
    expect(arr[0].networks).toContain('avax-mainnet')
    expect(arr[0].networks).toContain('opt-mainnet')
  })

  it('injects for fetchNftsOwnedByMultichainAddresses', () => {
    const out = injectWalletAddress(
      'mcp__alchemy__fetchNftsOwnedByMultichainAddresses',
      {},
      WALLET,
    )
    const arr = out.addresses as Array<{ address: string }>
    expect(arr).toHaveLength(1)
    expect(arr[0].address).toBe(WALLET)
  })

  it('respects an existing, well-formed addresses array (LLM chose chains)', () => {
    const llmProvided = [
      { address: OTHER, networks: ['eth-mainnet'] },
      { address: WALLET, networks: ['base-mainnet'] },
    ]
    const out = injectWalletAddress(
      'mcp__alchemy__fetchAddressTransactionHistory',
      { addresses: llmProvided },
      WALLET,
    )
    expect(out.addresses).toEqual(llmProvided)
  })

  it('rejects empty arrays as missing and injects', () => {
    const out = injectWalletAddress(
      'mcp__alchemy__fetchTokensOwnedByMultichainAddresses',
      { addresses: [] },
      WALLET,
    )
    const arr = out.addresses as Array<{ address: string; networks: string[] }>
    expect(arr).toHaveLength(1)
    expect(arr[0].address).toBe(WALLET)
  })

  it('rejects arrays containing plain strings as malformed and replaces with object shape', () => {
    // If some earlier version of Perry passed addresses as a plain string[],
    // we recognize that as not-our-schema and overwrite with the correct shape.
    const out = injectWalletAddress(
      'mcp__alchemy__fetchNftsOwnedByMultichainAddresses',
      { addresses: [WALLET] },
      WALLET,
    )
    const arr = out.addresses as Array<{ address: string }>
    expect(arr).toHaveLength(1)
    expect(arr[0].address).toBe(WALLET)
  })

  it('rejects objects missing the address field', () => {
    const out = injectWalletAddress(
      'mcp__alchemy__fetchAddressTransactionHistory',
      { addresses: [{ networks: ['eth-mainnet'] }] },
      WALLET,
    )
    const arr = out.addresses as Array<{ address: string }>
    expect(arr[0].address).toBe(WALLET)
  })

  it('rejects objects with malformed address strings', () => {
    const out = injectWalletAddress(
      'mcp__alchemy__fetchAddressTransactionHistory',
      { addresses: [{ address: 'not-an-address', networks: ['eth-mainnet'] }] },
      WALLET,
    )
    const arr = out.addresses as Array<{ address: string }>
    expect(arr[0].address).toBe(WALLET)
  })
})

describe('injectWalletAddress — Alchemy fetchTransfers (multi-field)', () => {
  it('injects fromAddress when neither from nor to are set', () => {
    const out = injectWalletAddress(
      'mcp__alchemy__fetchTransfers',
      { network: 'eth-mainnet' },
      WALLET,
    )
    expect(out.fromAddress).toBe(WALLET)
    expect(out.toAddress).toBeUndefined()
  })

  it('does NOT inject if the LLM already supplied toAddress (incoming-only query)', () => {
    const out = injectWalletAddress(
      'mcp__alchemy__fetchTransfers',
      { toAddress: WALLET },
      WALLET,
    )
    expect(out.fromAddress).toBeUndefined()
    expect(out.toAddress).toBe(WALLET)
  })

  it('does NOT inject if fromAddress is already set', () => {
    const out = injectWalletAddress(
      'mcp__alchemy__fetchTransfers',
      { fromAddress: OTHER },
      WALLET,
    )
    expect(out.fromAddress).toBe(OTHER)
  })
})

describe('injectWalletAddress — Alchemy single-chain owner tools', () => {
  it('injects owner for getNFTsForOwner', () => {
    const out = injectWalletAddress('mcp__alchemy__getNFTsForOwner', {}, WALLET)
    expect(out.owner).toBe(WALLET)
  })

  it('injects address for getTokenBalances', () => {
    const out = injectWalletAddress('mcp__alchemy__getTokenBalances', {}, WALLET)
    expect(out.address).toBe(WALLET)
  })

  it('injects owner for getContractsForOwner / getCollectionsForOwner', () => {
    expect(
      injectWalletAddress('mcp__alchemy__getContractsForOwner', {}, WALLET).owner,
    ).toBe(WALLET)
    expect(
      injectWalletAddress('mcp__alchemy__getCollectionsForOwner', {}, WALLET).owner,
    ).toBe(WALLET)
  })
})

describe('injectWalletAddress — safety / no-ops', () => {
  it('is a no-op when no wallet is connected', () => {
    const input = { foo: 'bar' }
    expect(
      injectWalletAddress('mcp__peridot__get_peridot_wallet_summary', input, undefined),
    ).toBe(input)
    expect(
      injectWalletAddress('mcp__peridot__get_peridot_wallet_summary', input, null),
    ).toBe(input)
  })

  it('is a no-op when the connected address itself is malformed (defense in depth)', () => {
    const input = { foo: 'bar' }
    const out = injectWalletAddress(
      'mcp__peridot__get_peridot_wallet_summary',
      input,
      'not-an-address',
    )
    expect(out).toBe(input)
  })

  it('is a no-op for tools NOT in the wallet-aware list', () => {
    const out = injectWalletAddress(
      'mcp__peridot__get_market_metrics',
      { network: 'eth-mainnet' },
      WALLET,
    )
    expect(out).toEqual({ network: 'eth-mainnet' })
  })

  it('does NOT inject for write-side tools (sendTransaction, swap)', () => {
    // Sanity: these MUST not appear in the registered set — write ops require
    // explicit AGENT_WALLET_SERVER + signer + SCA address combinations that the
    // injection layer cannot fabricate.
    expect(WALLET_AWARE_TOOL_NAMES).not.toContain('mcp__alchemy__sendTransaction')
    expect(WALLET_AWARE_TOOL_NAMES).not.toContain('mcp__alchemy__swap')
    expect(WALLET_AWARE_TOOL_NAMES).not.toContain('mcp__alchemy__reportSpam')
  })

  it('does NOT inject for filter-style tools where address is a search criterion', () => {
    // getTokenAllowance.owner is a filter, not the user's identity.
    expect(WALLET_AWARE_TOOL_NAMES).not.toContain('mcp__alchemy__getTokenAllowance')
    // getNFTSales buyer/seller are search filters.
    expect(WALLET_AWARE_TOOL_NAMES).not.toContain('mcp__alchemy__getNFTSales')
    // traceFilter from/to are search filters.
    expect(WALLET_AWARE_TOOL_NAMES).not.toContain('mcp__alchemy__traceFilter')
  })

  it('does NOT inject for Solana tools (EVM address into Solana field would silently corrupt the call)', () => {
    expect(WALLET_AWARE_TOOL_NAMES.filter((n) => n.includes('__solana'))).toEqual([])
  })

  it('exports a non-empty WALLET_AWARE_TOOL_NAMES list (sanity)', () => {
    expect(WALLET_AWARE_TOOL_NAMES.length).toBeGreaterThanOrEqual(10)
    expect(WALLET_AWARE_TOOL_NAMES).toContain('mcp__peridot__get_peridot_wallet_summary')
    expect(WALLET_AWARE_TOOL_NAMES).toContain('mcp__alchemy__fetchAddressTransactionHistory')
  })
})
