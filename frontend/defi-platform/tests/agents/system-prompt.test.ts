import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '@/lib/agents/system-prompt'
import type { AgentProfileContext } from '@/lib/agents/system-prompt'

describe('buildSystemPrompt', () => {
  it('includes base prompt without context', () => {
    const prompt = buildSystemPrompt({})
    expect(prompt).toContain('You are Perry')
    expect(prompt).toContain('Peridot First')
  })

  it('includes user address and chain', () => {
    const prompt = buildSystemPrompt({
      userAddress: '0xabc',
      chainId: 56,
    })
    expect(prompt).toContain('Wallet: 0xabc')
    expect(prompt).toContain('Connected Chain ID: 56')
  })

  it('injects completed profile data', () => {
    const profile: AgentProfileContext = {
      riskLevel: 'low',
      investmentGoal: 'passive income',
      timeHorizon: 'long',
      capitalUsd: 25000,
      preferredAssets: ['USDC', 'ETH'],
      preferredChains: [56, 10143],
      onboardingComplete: true,
    }

    const prompt = buildSystemPrompt({ profile })

    expect(prompt).toContain('## User Profile')
    expect(prompt).toContain('Risk Profile: low')
    expect(prompt).toContain('Investment Goal: passive income')
    expect(prompt).toContain('Time Horizon: long')
    expect(prompt).toContain('Approximate Capital: $25,000')
    expect(prompt).toContain('Preferred Assets: USDC, ETH')
    expect(prompt).toContain('Preferred Chains: 56, 10143')
    expect(prompt).toContain('tailor your recommendations')
    expect(prompt).not.toContain('Onboarding Required')
  })

  it('includes passive onboarding guidance when profile is not complete', () => {
    const profile: AgentProfileContext = {
      riskLevel: 'medium',
      investmentGoal: null,
      timeHorizon: null,
      capitalUsd: null,
      preferredAssets: [],
      preferredChains: [],
      onboardingComplete: false,
    }

    const prompt = buildSystemPrompt({ profile })

    // Passive onboarding: we still acknowledge the user isn't onboarded but
    // we DON'T block concrete action requests with mandatory profile questions.
    // The prompt must instruct Perry to act immediately when the user's intent
    // is clear, not blanket-demand a risk/goal/capital interview.
    expect(prompt).toMatch(/Onboarding/i)
    expect(prompt).toMatch(/do not block/i)
    expect(prompt).toMatch(/risk|investment|goal/i)
    expect(prompt).not.toContain('## User Profile')
  })

  it('omits empty optional fields from profile', () => {
    const profile: AgentProfileContext = {
      riskLevel: 'high',
      investmentGoal: null,
      timeHorizon: null,
      capitalUsd: null,
      preferredAssets: [],
      preferredChains: [],
      onboardingComplete: true,
    }

    const prompt = buildSystemPrompt({ profile })

    expect(prompt).toContain('Risk Profile: high')
    expect(prompt).not.toContain('Investment Goal:')
    expect(prompt).not.toContain('Time Horizon:')
    expect(prompt).not.toContain('Approximate Capital:')
    expect(prompt).not.toContain('Preferred Assets:')
    expect(prompt).not.toContain('Preferred Chains:')
  })

  it('falls back to riskLevel context when no profile', () => {
    const prompt = buildSystemPrompt({ riskLevel: 'high' })
    expect(prompt).toContain('Risk Profile: high')
    expect(prompt).not.toContain('## User Profile')
    expect(prompt).not.toContain('Onboarding Required')
  })

  it('includes portfolio summary when provided', () => {
    const prompt = buildSystemPrompt({
      portfolioSummary: 'Total Supplied: $5000 | Total Borrowed: $1000',
    })
    expect(prompt).toContain('## Current Portfolio')
    expect(prompt).toContain('Total Supplied: $5000')
  })

  it('renders an execute-capable Stellar block with balances and position', () => {
    const prompt = buildSystemPrompt({
      userAddress: '0xabc',
      walletSnapshot: {
        hubBalances: [],
        spokeBalances: [],
        readMs: 12,
        stellar: {
          address: 'GAWZ6KO4DKF4XWY2OS3TM5YWWP4AHRCZCI2VALR7M3PLRLU63WZXMFFC',
          idleBalances: [{ assetSymbol: 'USDC', amount: '100', amountUsd: 100 }],
          position: { collateralUsd: 250.5, borrowUsd: 30 },
          readMs: 8,
        },
      },
    })
    expect(prompt).toContain('## Stellar Wallet')
    expect(prompt).toContain('GAWZ6KO4DKF4XWY2OS3TM5YWWP4AHRCZCI2VALR7M3PLRLU63WZXMFFC')
    expect(prompt).toContain('100 USDC')
    expect(prompt).toContain('$250.50 supplied')
    // Stufe 2: Perry can now execute on Stellar via the dedicated tools.
    expect(prompt).toMatch(/You CAN act on Stellar/i)
    expect(prompt).toContain('execute_stellar_deposit')
    expect(prompt).toContain('execute_stellar_withdraw')
    // And must keep EVM/Stellar tools from crossing wires.
    expect(prompt).toMatch(/NEVER use the EVM execute tools .* for a Stellar asset/i)
    // EVM-empty message must defer to the Stellar section instead of "no funds at all".
    expect(prompt).toContain('check the Stellar')
  })

  it('frames a Stellar-only user (G-address, no EVM) and routes to Stellar tools', () => {
    const G = 'GAWZ6KO4DKF4XWY2OS3TM5YWWP4AHRCZCI2VALR7M3PLRLU63WZXMFFC'
    const prompt = buildSystemPrompt({
      userAddress: G,
      evmAddress: null,
      walletSnapshot: {
        hubBalances: [],
        spokeBalances: [],
        readMs: 0,
        stellar: { address: G, idleBalances: [], readMs: 4 },
      },
    })
    expect(prompt).toContain('Stellar-only')
    expect(prompt).toMatch(/Do NOT call any EVM tool/i)
    // Stufe 2: route Stellar-only users to the Stellar execute tools.
    expect(prompt).toContain('execute_stellar_deposit')
    // Must not present the Stellar address as the EVM wallet to use for tools.
    expect(prompt).not.toContain(`Wallet: ${G} (connected`)
  })

  it('uses the explicit EVM wallet address when provided', () => {
    const prompt = buildSystemPrompt({
      userAddress: '0x1111111111111111111111111111111111111111',
      evmAddress: '0x1111111111111111111111111111111111111111',
    })
    expect(prompt).toContain('Wallet: 0x1111111111111111111111111111111111111111 (connected')
    expect(prompt).not.toContain('Stellar-only')
  })

  it('omits the Stellar block for EVM-only users', () => {
    const prompt = buildSystemPrompt({
      userAddress: '0xabc',
      walletSnapshot: { hubBalances: [], spokeBalances: [], readMs: 5 },
    })
    expect(prompt).not.toContain('## Stellar Wallet')
    expect(prompt).toContain('no stablecoins to supply')
  })

  it('support mode: renders a READ-ONLY Stellar block (no execute tools)', () => {
    const G = 'GDDCFOMQWZCAJVJQEGOS5TA7VLWYXG6DTEIMH2IOVYBVZSGJ536RWSAN'
    const prompt = buildSystemPrompt({
      mode: 'support',
      userAddress: '0xabc',
      walletSnapshot: {
        hubBalances: [],
        spokeBalances: [],
        readMs: 0,
        stellar: {
          address: G,
          idleBalances: [{ assetSymbol: 'XLM', amount: '3.6089621', amountUsd: 0.58 }],
          position: { collateralUsd: 0, borrowUsd: 0 },
          readMs: 9,
        },
      },
    })
    expect(prompt).toContain('## Stellar Wallet')
    expect(prompt).toContain(G)
    expect(prompt).toContain('3.6089621 XLM')
    // Support must call the read-only portfolio tool and include Stellar…
    expect(prompt).toContain('get_user_portfolio')
    // …but must NOT expose Stellar execute capability from the support modal.
    expect(prompt).not.toMatch(/You CAN act on Stellar/i)
    expect(prompt).not.toContain('execute_stellar_deposit')
    expect(prompt).toMatch(/CANNOT execute Stellar transactions/i)
  })

  it('support mode: omits the Stellar block when no Stellar wallet', () => {
    const prompt = buildSystemPrompt({
      mode: 'support',
      userAddress: '0xabc',
    })
    expect(prompt).not.toContain('## Stellar Wallet')
  })
})
