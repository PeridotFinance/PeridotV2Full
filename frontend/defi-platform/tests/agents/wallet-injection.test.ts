import { describe, it, expect } from 'vitest'
import { injectWalletAddress } from '@/lib/agents/mcp/wallet-injection'

const WALLET = '0x' + 'a'.repeat(40)
const OTHER_WALLET = '0x' + 'b'.repeat(40)

describe('injectWalletAddress', () => {
  it('injects the connected wallet when the tool is wallet-aware and address is missing', () => {
    const out = injectWalletAddress('mcp__peridot__get_user_portfolio', {}, WALLET)
    expect(out.address).toBe(WALLET)
  })

  it('injects when the provided address is not a valid EVM address', () => {
    const out = injectWalletAddress(
      'mcp__peridot__get_user_portfolio',
      { address: 'not-an-address' },
      WALLET,
    )
    expect(out.address).toBe(WALLET)
  })

  it('preserves a valid address provided by the LLM', () => {
    const out = injectWalletAddress(
      'mcp__peridot__get_user_portfolio',
      { address: OTHER_WALLET },
      WALLET,
    )
    expect(out.address).toBe(OTHER_WALLET)
  })

  it('does nothing when no wallet is connected', () => {
    const input = {}
    const out = injectWalletAddress(
      'mcp__peridot__get_user_portfolio',
      input,
      undefined,
    )
    expect(out.address).toBeUndefined()
  })

  it('does nothing for tools that are not wallet-aware', () => {
    const out = injectWalletAddress(
      'mcp__peridot__get_live_apys',
      { topN: 5 },
      WALLET,
    )
    expect(out.address).toBeUndefined()
    expect(out.topN).toBe(5)
  })

  it('does not mutate the original input object', () => {
    const input = { chainId: 56 }
    injectWalletAddress('mcp__peridot__get_user_portfolio', input, WALLET)
    expect(input).toEqual({ chainId: 56 })
  })

  it('preserves other input fields when injecting', () => {
    const out = injectWalletAddress(
      'mcp__peridot__get_user_portfolio',
      { chainId: 143 },
      WALLET,
    )
    expect(out).toEqual({ chainId: 143, address: WALLET })
  })
})
