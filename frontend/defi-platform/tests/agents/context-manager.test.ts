import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }))
vi.stubGlobal('fetch', mockFetch)

vi.stubEnv('AGENT_MODEL_PROVIDER', 'anthropic')
vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')

import {
  prepareContextMessages,
  generateConversationSummary,
} from '@/lib/agents/context-manager'
import { estimateMessageTokens } from '@/lib/agents/token-estimator'

function makeMessages(count: number, contentSize = 10) {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i + 1} ` + 'x'.repeat(contentSize),
  }))
}

function mockStructuredSummary(payload: {
  overview: string
  keyFacts?: string[]
  userFacts?: Array<{ key: string; value: string }>
  openItems?: string[]
}) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_123',
          name: 'conversation_summary',
          input: {
            overview: payload.overview,
            keyFacts: payload.keyFacts ?? [],
            userFacts: payload.userFacts ?? [],
            openItems: payload.openItems ?? [],
          },
        },
      ],
    }),
  })
}

describe('prepareContextMessages — token budget', () => {
  it('returns all messages when they fit under the budget', async () => {
    const msgs = makeMessages(10)
    const result = await prepareContextMessages(msgs)
    expect(result.messages).toHaveLength(10)
    expect(result.needsSummaryUpdate).toBe(false)
    expect(result.summarySourceCount).toBe(0)
  })

  it('drops oldest messages when budget is exceeded', async () => {
    // Build 40 chunky messages; set a tiny budget so only the recent floor (8)
    // fits (+ whatever else squeezes in up to the budget).
    const msgs = makeMessages(40, 500)
    const result = await prepareContextMessages(msgs, null, { budgetTokens: 500 })
    expect(result.messages.length).toBeLessThan(40)
    // Always keep the floor
    expect(result.messages.length).toBeGreaterThanOrEqual(8)
    expect(result.needsSummaryUpdate).toBe(true)
    expect(result.summarySourceCount).toBeGreaterThan(0)
  })

  it('never drops below the recent-floor even with a ridiculous budget', async () => {
    const msgs = makeMessages(20, 2000)
    const result = await prepareContextMessages(msgs, null, { budgetTokens: 10 })
    expect(result.messages).toHaveLength(8)
    expect(result.summarySourceCount).toBe(12)
  })

  it('always includes the most-recent message', async () => {
    const msgs = makeMessages(50, 100)
    const result = await prepareContextMessages(msgs, null, { budgetTokens: 500 })
    const last = result.messages[result.messages.length - 1]!.content
    expect(last).toContain('Message 50')
  })

  it('prepends an existing summary as a system message', async () => {
    const msgs = makeMessages(30)
    const result = await prepareContextMessages(
      msgs,
      'Previous summary text',
      { budgetTokens: 2000 },
    )
    expect(result.messages[0]!.role).toBe('system')
    expect(result.messages[0]!.content).toContain('Previous summary text')
  })

  it('reports estimatedTokens', async () => {
    const msgs = makeMessages(5)
    const result = await prepareContextMessages(msgs)
    expect(result.estimatedTokens).toBeGreaterThan(0)
    // Upper-bound sanity check — should be well under the default budget
    expect(result.estimatedTokens).toBeLessThan(1000)
  })
})

describe('prepareContextMessages — tool result compression', () => {
  it('collapses older tool results when the same tool is called again', async () => {
    const msgs = [
      { role: 'user', content: 'show pools' },
      { role: 'tool', content: '[tool:get_pools] result A (big payload)' },
      { role: 'assistant', content: 'here are the pools' },
      { role: 'user', content: 'sort by tvl' },
      { role: 'tool', content: '[tool:get_pools] result B (bigger payload)' },
      { role: 'assistant', content: 'sorted by TVL' },
    ]
    const result = await prepareContextMessages(msgs)

    const firstTool = result.messages.find((m) =>
      m.content.startsWith('[tool:get_pools] result A'),
    )
    const firstToolCompressed = result.messages.find((m) =>
      m.content.includes('superseded'),
    )
    const secondTool = result.messages.find((m) =>
      m.content.includes('result B'),
    )

    expect(firstTool).toBeUndefined() // the verbatim old result is gone
    expect(firstToolCompressed).toBeDefined()
    expect(secondTool).toBeDefined() // newest call kept as-is
  })

  it('leaves a single tool call untouched', async () => {
    const msgs = [
      { role: 'user', content: 'q' },
      { role: 'tool', content: '[tool:get_pools] the only result' },
      { role: 'assistant', content: 'a' },
    ]
    const result = await prepareContextMessages(msgs)
    const tool = result.messages.find((m) => m.role === 'tool')!
    expect(tool.content).toContain('the only result')
  })
})

describe('generateConversationSummary — structured with facts', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns rendered text and separated userFacts', async () => {
    mockStructuredSummary({
      overview: 'User explored low-risk stablecoin strategies.',
      keyFacts: ['Prefers USDC', 'Stablecoins only'],
      userFacts: [
        { key: 'risk_tolerance', value: 'low' },
        { key: 'preferred_assets', value: 'USDC, USDT' },
      ],
      openItems: ['Decide between BSC and Monad'],
    })

    const { summary, userFacts } = await generateConversationSummary([
      { role: 'user', content: 'I want a low-risk strategy' },
      { role: 'assistant', content: 'Here is a conservative portfolio...' },
    ])

    expect(summary).toContain('User explored low-risk stablecoin strategies.')
    expect(summary).toContain('Key points')
    expect(summary).toContain('Prefers USDC')
    expect(summary).toContain('Open items')
    expect(userFacts).toHaveLength(2)
    expect(userFacts[0]!.key).toBe('risk_tolerance')
  })

  it('falls back to extractive summary and empty facts on API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, text: async () => 'boom' })

    const result = await generateConversationSummary([
      { role: 'user', content: 'What pools are available?' },
      { role: 'assistant', content: 'Here are the pools...' },
    ])

    expect(result.summary).toContain('2 messages')
    expect(result.userFacts).toEqual([])
  })

  it('omits the "Key points" section when keyFacts is empty', async () => {
    mockStructuredSummary({ overview: 'Brief chat.' })

    const { summary } = await generateConversationSummary([
      { role: 'user', content: 'hello' },
    ])
    expect(summary).not.toContain('Key points')
    expect(summary).toContain('Brief chat.')
  })
})

describe('token-estimator', () => {
  it('estimates roughly 1 token per 3.5 chars', () => {
    expect(estimateMessageTokens({ role: 'user', content: 'hello' })).toBeGreaterThan(0)
    const long = 'x'.repeat(350)
    const tokens = estimateMessageTokens({ role: 'user', content: long })
    // 350/3.5 = 100 plus overhead + "user"
    expect(tokens).toBeGreaterThan(100)
    expect(tokens).toBeLessThan(120)
  })
})
