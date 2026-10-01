import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }))
vi.stubGlobal('fetch', mockFetch)

import {
  getProvider,
  getSmallProvider,
  toProviderTools,
  toAnthropicTool,
  toOpenAITool,
  generateZodStructured,
} from '@/lib/agents/providers'

const AGENT_TOOLS_SAMPLE = [
  {
    name: 'get_foo',
    description: 'Get foo',
    input_schema: {
      type: 'object',
      properties: { x: { type: 'number' } },
      required: [],
    },
  },
] as const

beforeEach(() => {
  mockFetch.mockReset()
  vi.unstubAllEnvs()
})

describe('tool-schema converters', () => {
  it('converts the Anthropic-shaped AGENT_TOOLS to the provider-neutral shape', () => {
    const neutral = toProviderTools(AGENT_TOOLS_SAMPLE)
    expect(neutral).toHaveLength(1)
    expect(neutral[0]).toEqual({
      name: 'get_foo',
      description: 'Get foo',
      schema: { type: 'object', properties: { x: { type: 'number' } }, required: [] },
    })
  })

  it('toAnthropicTool mirrors input_schema', () => {
    const neutral = toProviderTools(AGENT_TOOLS_SAMPLE)[0]
    const wire = toAnthropicTool(neutral)
    expect(wire.input_schema).toEqual(neutral.schema)
    expect(wire.name).toBe('get_foo')
  })

  it('toOpenAITool wraps as function tool', () => {
    const neutral = toProviderTools(AGENT_TOOLS_SAMPLE)[0]
    const wire = toOpenAITool(neutral)
    expect(wire.type).toBe('function')
    expect(wire.function.name).toBe('get_foo')
    expect(wire.function.parameters).toEqual(neutral.schema)
  })

  it('toOpenAITool sets strict when requested', () => {
    const neutral = toProviderTools(AGENT_TOOLS_SAMPLE)[0]
    expect(toOpenAITool(neutral, true).function.strict).toBe(true)
    expect(toOpenAITool(neutral, false).function.strict).toBeUndefined()
  })
})

describe('provider registry', () => {
  it('defaults to openai with gpt-5.4-mini', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    const p = getProvider()
    expect(p.name).toBe('openai')
    expect(p.modelId).toBe('gpt-5.4-mini')
  })

  it('respects AGENT_MODEL_PROVIDER=anthropic', () => {
    vi.stubEnv('AGENT_MODEL_PROVIDER', 'anthropic')
    vi.stubEnv('ANTHROPIC_API_KEY', 'a-test')
    const p = getProvider()
    expect(p.name).toBe('anthropic')
  })

  it('respects AGENT_MODEL_ID override', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    vi.stubEnv('AGENT_MODEL_ID', 'gpt-4o-custom')
    expect(getProvider().modelId).toBe('gpt-4o-custom')
  })

  it('getSmallProvider uses small-model default', () => {
    vi.stubEnv('AGENT_MODEL_PROVIDER', 'anthropic')
    vi.stubEnv('ANTHROPIC_API_KEY', 'a-test')
    // AGENT_MODEL_ID should NOT affect the small provider
    vi.stubEnv('AGENT_MODEL_ID', 'claude-sonnet-huge')
    const p = getSmallProvider()
    expect(p.modelId).toBe('claude-haiku-4-5-20251001')
  })

  it('throws when the selected provider has no API key', () => {
    vi.stubEnv('AGENT_MODEL_PROVIDER', 'anthropic')
    // no ANTHROPIC_API_KEY
    expect(() => getProvider()).toThrow(/ANTHROPIC_API_KEY/)
  })
})

describe('OpenAI provider — streamChat', () => {
  beforeEach(() => {
    vi.stubEnv('AGENT_MODEL_PROVIDER', 'openai')
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
  })

  function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
    const enc = new TextEncoder()
    let i = 0
    return new ReadableStream({
      pull(ctrl) {
        if (i >= chunks.length) {
          ctrl.close()
          return
        }
        ctrl.enqueue(enc.encode(`data: ${chunks[i++]}\n\n`))
      },
    })
  }

  it('emits text_delta events from streamed content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: sseStream([
        JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] }),
        JSON.stringify({ choices: [{ delta: { content: ' world' } }] }),
        '[DONE]',
      ]),
    })

    const p = getProvider()
    const events = []
    for await (const ev of p.streamChat({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      events.push(ev)
    }

    expect(events.filter((e) => e.type === 'text_delta').map((e) => (e as { delta: string }).delta).join('')).toBe(
      'Hello world',
    )
  })

  it('accumulates tool_calls across chunks and invokes toolExecutor', async () => {
    // Round 1: tool call streamed in two argument chunks
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: sseStream([
        JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: 'call_1', function: { name: 'get_foo', arguments: '{"x":' } },
                ],
              },
            },
          ],
        }),
        JSON.stringify({
          choices: [
            { delta: { tool_calls: [{ index: 0, function: { arguments: '42}' } }] } },
          ],
        }),
        '[DONE]',
      ]),
    })
    // Round 2: normal text reply
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: sseStream([
        JSON.stringify({ choices: [{ delta: { content: 'done' } }] }),
        '[DONE]',
      ]),
    })

    const p = getProvider()
    const executor = vi.fn(async (call: { name: string; input: Record<string, unknown> }) => {
      expect(call.name).toBe('get_foo')
      expect(call.input).toEqual({ x: 42 })
      return { content: 'foo=42', blocks: [{ type: 'text' as const, content: 'emitted' }] }
    })

    const events = []
    for await (const ev of p.streamChat({
      systemPrompt: 's',
      messages: [{ role: 'user', content: 'q' }],
      tools: toProviderTools(AGENT_TOOLS_SAMPLE),
      toolExecutor: executor,
    })) {
      events.push(ev)
    }

    expect(executor).toHaveBeenCalledOnce()
    expect(events.some((e) => e.type === 'block')).toBe(true)
    expect(events.some((e) => e.type === 'text_delta' && e.delta === 'done')).toBe(true)
    // Two rounds = two fetch calls
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})

describe('OpenAI provider — structured outputs', () => {
  beforeEach(() => {
    vi.stubEnv('AGENT_MODEL_PROVIDER', 'openai')
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
  })

  it('parses JSON content and validates via Zod', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: JSON.stringify({ name: 'Bob', age: 30 }) } },
        ],
      }),
    })

    const schema = z.object({ name: z.string(), age: z.number() })
    const result = await generateZodStructured(getProvider(), {
      schema,
      schemaName: 'person',
      prompt: 'give me a person',
    })

    expect(result).toEqual({ name: 'Bob', age: 30 })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.response_format.type).toBe('json_schema')
    expect(body.response_format.json_schema.name).toBe('person')
    expect(body.response_format.json_schema.strict).toBe(true)
  })

  it('throws when Zod validation fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ name: 'Bob' }) } }],
      }),
    })

    const schema = z.object({ name: z.string(), age: z.number() })
    await expect(
      generateZodStructured(getProvider(), {
        schema,
        schemaName: 'person',
        prompt: 'p',
      }),
    ).rejects.toThrow()
  })
})

describe('Anthropic provider — structured outputs', () => {
  beforeEach(() => {
    vi.stubEnv('AGENT_MODEL_PROVIDER', 'anthropic')
    vi.stubEnv('ANTHROPIC_API_KEY', 'a-test')
  })

  it('uses a forced tool_choice and returns the tool_use input', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          { type: 'tool_use', id: 't_1', name: 'person', input: { name: 'Ada', age: 42 } },
        ],
      }),
    })

    const schema = z.object({ name: z.string(), age: z.number() })
    const result = await generateZodStructured(getProvider(), {
      schema,
      schemaName: 'person',
      prompt: 'p',
    })

    expect(result).toEqual({ name: 'Ada', age: 42 })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'person' })
    expect(body.tools[0].name).toBe('person')
  })
})
