/**
 * OpenAI Chat Completions API adapter.
 * Uses the v1/chat/completions endpoint with streaming + function tools.
 * Structured outputs use response_format: { type: 'json_schema', ... }.
 */

import type {
  LLMProvider,
  StreamChatParams,
  ProviderStreamEvent,
  GenerateTextParams,
  GenerateStructuredParams,
  ToolExecutorResult,
} from './types'
import { toOpenAITool } from './tool-schema'

const API_URL = 'https://api.openai.com/v1/chat/completions'

/**
 * OpenAI's Chat Completions API hard-rejects requests carrying more than 128
 * function tools (`array_above_max_length`). Our own AGENT_TOOLS plus a busy
 * MCP server can exceed that, so we cap here. Callers pass tools in priority
 * order (native PROVIDER_TOOLS first, MCP tools after), so keeping the leading
 * slice preserves Perry's core capabilities and only trims overflow MCP tools.
 */
const MAX_OPENAI_TOOLS = 128

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai' as const

  constructor(
    readonly modelId: string,
    private readonly apiKey: string,
    private readonly baseUrl = API_URL,
  ) {}

  async *streamChat(params: StreamChatParams): AsyncIterable<ProviderStreamEvent> {
    const maxRounds = params.maxToolRounds ?? 5
    let providerTools = params.tools
    if (providerTools && providerTools.length > MAX_OPENAI_TOOLS) {
      console.warn(
        `[openai] ${providerTools.length} tools exceeds OpenAI's ${MAX_OPENAI_TOOLS} limit; ` +
          `keeping the first ${MAX_OPENAI_TOOLS} and dropping ${providerTools.length - MAX_OPENAI_TOOLS} ` +
          `(trailing MCP tools).`,
      )
      providerTools = providerTools.slice(0, MAX_OPENAI_TOOLS)
    }
    const tools = providerTools?.map((t) => toOpenAITool(t))

    const messages: OpenAIMessage[] = [
      { role: 'system', content: params.systemPrompt },
      ...params.messages.map((m) => ({ role: m.role, content: m.content })),
    ]

    for (let round = 0; round < maxRounds; round++) {
      const { events, pendingToolCalls } = await this.streamOneRound({
        messages,
        tools,
        maxTokens: params.maxTokens ?? 4096,
      })

      for (const ev of events) yield ev

      if (pendingToolCalls.length === 0) return
      if (!params.toolExecutor) return

      // Append assistant message with tool_calls, then each tool_result.
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: pendingToolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.input) },
        })),
      })

      for (const call of pendingToolCalls) {
        const result: ToolExecutorResult = await params.toolExecutor(call)
        for (const block of result.blocks ?? []) {
          yield { type: 'block', block }
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result.content,
        })
      }
    }
  }

  private async streamOneRound(opts: {
    messages: OpenAIMessage[]
    tools?: ReturnType<typeof toOpenAITool>[]
    maxTokens: number
  }): Promise<{
    events: ProviderStreamEvent[]
    pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>
  }> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelId,
        max_completion_tokens: opts.maxTokens,
        messages: opts.messages,
        ...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools } : {}),
        stream: true,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`OpenAI API error ${response.status}: ${body}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('OpenAI: no response body')

    const decoder = new TextDecoder()
    let buffer = ''

    const events: ProviderStreamEvent[] = []
    // tool_calls arrive incrementally, indexed. Accumulate per index.
    const toolAcc: Array<{ id: string; name: string; args: string }> = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (!data || data === '[DONE]') continue

        let chunk: {
          choices?: Array<{
            delta?: {
              content?: string | null
              tool_calls?: Array<{
                index: number
                id?: string
                function?: { name?: string; arguments?: string }
              }>
            }
            finish_reason?: string | null
          }>
        }
        try {
          chunk = JSON.parse(data)
        } catch {
          continue
        }

        const delta = chunk.choices?.[0]?.delta
        if (!delta) continue

        if (typeof delta.content === 'string' && delta.content.length > 0) {
          events.push({ type: 'text_delta', delta: delta.content })
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const slot = toolAcc[tc.index] ?? { id: '', name: '', args: '' }
            if (tc.id) slot.id = tc.id
            if (tc.function?.name) slot.name = tc.function.name
            if (tc.function?.arguments) slot.args += tc.function.arguments
            toolAcc[tc.index] = slot
          }
        }
      }
    }

    const pendingToolCalls = toolAcc
      .filter((t) => t && t.name)
      .map((t) => {
        let input: Record<string, unknown> = {}
        try {
          input = t.args ? JSON.parse(t.args) : {}
        } catch {
          input = {}
        }
        return { id: t.id, name: t.name, input }
      })

    return { events, pendingToolCalls }
  }

  async generateText(params: GenerateTextParams): Promise<string> {
    const messages: OpenAIMessage[] = []
    if (params.systemPrompt) messages.push({ role: 'system', content: params.systemPrompt })
    messages.push({ role: 'user', content: params.prompt })

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelId,
        max_completion_tokens: params.maxTokens ?? 500,
        messages,
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`OpenAI generateText failed: ${response.status}: ${body.slice(0, 200)}`)
    }

    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string') {
      throw new Error('OpenAI generateText: no content in response')
    }
    return text.trim()
  }

  async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T> {
    const messages: OpenAIMessage[] = []
    if (params.systemPrompt) messages.push({ role: 'system', content: params.systemPrompt })
    messages.push({ role: 'user', content: params.prompt })

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelId,
        max_completion_tokens: params.maxTokens ?? 1024,
        messages,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: params.schemaName,
            strict: true,
            schema: params.schema,
          },
        },
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`OpenAI generateStructured failed: ${response.status}: ${body}`)
    }

    const data = await response.json()
    const raw = data?.choices?.[0]?.message?.content
    if (typeof raw !== 'string') {
      throw new Error('OpenAI generateStructured: no content in response')
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('OpenAI generateStructured: response was not valid JSON')
    }
    return params.validate ? params.validate(parsed) : (parsed as T)
  }
}
