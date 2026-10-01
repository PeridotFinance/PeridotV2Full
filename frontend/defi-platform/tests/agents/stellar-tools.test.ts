import { describe, it, expect } from 'vitest'
import { AGENT_TOOLS } from '@/lib/agents/tool-definitions'

// Stufe 2: the agent must expose Stellar execute tools, and they must NOT
// carry a chainId param (Stellar is a single network, addressed by assetSymbol).
describe('Stellar execute tool definitions', () => {
  const names = AGENT_TOOLS.map((t) => t.name)

  it('registers the three Stellar execute tools', () => {
    expect(names).toContain('execute_stellar_deposit')
    expect(names).toContain('execute_stellar_withdraw')
    expect(names).toContain('execute_stellar_pay_back')
  })

  it('requires assetSymbol + amount and no chainId', () => {
    for (const name of [
      'execute_stellar_deposit',
      'execute_stellar_withdraw',
      'execute_stellar_pay_back',
    ]) {
      const tool = AGENT_TOOLS.find((t) => t.name === name)!
      expect(tool).toBeDefined()
      const props = tool.input_schema.properties as Record<string, unknown>
      expect(props.assetSymbol).toBeDefined()
      expect(props.amount).toBeDefined()
      expect(props.chainId).toBeUndefined()
      expect(tool.input_schema.required).toEqual(['assetSymbol', 'amount'])
    }
  })
})
