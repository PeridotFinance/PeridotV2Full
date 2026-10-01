import { describe, it, expect } from 'vitest'
import {
  MessageBlockAccumulator,
  parseSSELine,
  formatSSEEvent,
} from '@/lib/agents/message-parser'
import type { ContentBlock, StreamEvent } from '@/types/agents'

describe('MessageBlockAccumulator', () => {
  it('accumulates text into a single TextBlock', () => {
    const acc = new MessageBlockAccumulator()
    acc.appendText('Hello ')
    acc.appendText('world')
    const blocks = acc.finalize()

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toEqual({ type: 'text', content: 'Hello world' })
  })

  it('interleaves text and blocks correctly', () => {
    const acc = new MessageBlockAccumulator()
    acc.appendText('Here are the pools:')

    const poolBlock: ContentBlock = {
      type: 'pool_table',
      pools: [
        {
          id: '1',
          protocol: 'peridot',
          poolName: 'USDC Pool',
          assetSymbol: 'USDC',
          chainId: 56,
          riskTier: 'low',
          isPeridot: true,
          isActive: true,
        },
      ],
      title: 'Peridot Pools',
    }
    acc.addBlock(poolBlock)
    acc.appendText('Based on these pools, I recommend...')

    const blocks = acc.finalize()
    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toEqual({ type: 'text', content: 'Here are the pools:' })
    expect(blocks[1]).toEqual(poolBlock)
    expect(blocks[2]).toEqual({
      type: 'text',
      content: 'Based on these pools, I recommend...',
    })
  })

  it('handles empty text correctly', () => {
    const acc = new MessageBlockAccumulator()
    acc.appendText('   ')
    const blocks = acc.finalize()
    expect(blocks).toHaveLength(0)
  })

  it('handles block-only (no text) correctly', () => {
    const acc = new MessageBlockAccumulator()
    const block: ContentBlock = {
      type: 'allocation',
      allocations: [],
      blendedApy: 5.5,
      riskLevel: 'low',
      reasoning: 'Test',
    }
    acc.addBlock(block)
    const blocks = acc.finalize()
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toEqual(block)
  })

  it('getPlainContent returns all text segments', () => {
    const acc = new MessageBlockAccumulator()
    acc.appendText('Part 1')
    acc.addBlock({ type: 'pool_table', pools: [], title: 'Test' })
    acc.appendText('Part 2')

    const content = acc.getPlainContent()
    expect(content).toBe('Part 1\n\nPart 2')
  })
})

describe('parseSSELine', () => {
  it('parses text_delta events', () => {
    const result = parseSSELine('{"type":"text_delta","delta":"Hello"}')
    expect(result).toEqual({ type: 'text_delta', delta: 'Hello' })
  })

  it('parses block events', () => {
    const block = { type: 'pool_table', pools: [], title: 'Test' }
    const result = parseSSELine(JSON.stringify({ type: 'block', block }))
    expect(result).toEqual({ type: 'block', block })
  })

  it('parses done events', () => {
    const result = parseSSELine('{"type":"done","messageId":"abc-123"}')
    expect(result).toEqual({ type: 'done', messageId: 'abc-123' })
  })

  it('parses error events', () => {
    const result = parseSSELine('{"type":"error","message":"Something failed"}')
    expect(result).toEqual({ type: 'error', message: 'Something failed' })
  })

  it('returns null for empty lines', () => {
    expect(parseSSELine('')).toBeNull()
    expect(parseSSELine('   ')).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    expect(parseSSELine('not json')).toBeNull()
  })

  it('returns null for unknown event types', () => {
    expect(parseSSELine('{"type":"unknown"}')).toBeNull()
  })
})

describe('formatSSEEvent', () => {
  it('formats a text_delta event', () => {
    const event: StreamEvent = { type: 'text_delta', delta: 'Hi' }
    const result = formatSSEEvent(event)
    expect(result).toBe('data: {"type":"text_delta","delta":"Hi"}\n\n')
  })

  it('formats a done event', () => {
    const event: StreamEvent = { type: 'done', messageId: 'x' }
    const result = formatSSEEvent(event)
    expect(result).toBe('data: {"type":"done","messageId":"x"}\n\n')
  })

  it('ends with double newline', () => {
    const event: StreamEvent = { type: 'error', message: 'fail' }
    expect(formatSSEEvent(event)).toMatch(/\n\n$/)
  })
})
