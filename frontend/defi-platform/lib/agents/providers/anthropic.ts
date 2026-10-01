/**
 * Anthropic Messages API adapter.
 * Implements streamChat with tool-use loop, plus one-shot text / structured helpers.
 */

import type {
  LLMProvider,
  StreamChatParams,
  ProviderStreamEvent,
  GenerateTextParams,
  GenerateStructuredParams,
  ToolExecutorResult,
} from './types'
import { toAnthropicTool } from './tool-schema'

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
        | { type: 'tool_result'; tool_use_id: string; content: string }
      >
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic' as const

  constructor(
    readonly modelId: string,
    private readonly apiKey: string,
  ) {}

  async *streamChat(params: StreamChatParams): AsyncIterable<ProviderStreamEvent> {
    const maxRounds = params.maxToolRounds ?? 5
    const tools = params.tools?.map(toAnthropicTool)

    // Build initial conversation. System prompts live at the top-level `system` field,
    // so normalize any "system" roles from older callers by merging into user content.
    const messages: AnthropicMessage[] = params.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    for (let round = 0; round < maxRounds; round++) {
      const { events, pendingToolCalls } = await this.streamOneRound({
        systemPrompt: params.systemPrompt,
        messages,
        tools,
        maxTokens: params.maxTokens ?? 4096,
      })

      for (const ev of events) yield ev

      if (pendingToolCalls.length === 0) return

      if (!params.toolExecutor) {
        // Nothing to execute tool calls with — stop.
        return
      }

      // Execute all tool calls and assemble the continuation messages.
      const assistantContent: Exclude<AnthropicMessage['content'], string> = []
      for (const call of pendingToolCalls) {
        assistantContent.push({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: call.input,
        })
      }
      messages.push({ role: 'assistant', content: assistantContent })

      const userContent: Exclude<AnthropicMessage['content'], string> = []
      for (const call of pendingToolCalls) {
        const result: ToolExecutorResult = await params.toolExecutor(call)
        for (const block of result.blocks ?? []) {
          yield { type: 'block', block }
        }
        userContent.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: result.content,
        })
      }
      messages.push({ role: 'user', content: userContent })
    }
  }

  private async streamOneRound(opts: {
    systemPrompt: string
    messages: AnthropicMessage[]
    tools?: ReturnType<typeof toAnthropicTool>[]
    maxTokens: number
  }): Promise<{
    events: ProviderStreamEvent[]
    pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>
  }> {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({
        model: this.modelId,
        max_tokens: opts.maxTokens,
        system: opts.systemPrompt,
        ...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools } : {}),
        messages: opts.messages,
        stream: true,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Anthropic API error ${response.status}: ${body}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('Anthropic: no response body')

    const decoder = new TextDecoder()
    let buffer = ''

    const events: ProviderStreamEvent[] = []
    const pendingToolCalls: Array<{
      id: string
      name: string
      input: Record<string, unknown>
    }> = []

    let currentToolId = ''
    let currentToolName = ''
    let toolInputJson = ''

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

        let event: Record<string, unknown>
        try {
          event = JSON.parse(data)
        } catch {
          continue
        }

        const type = event.type as string

        if (type === 'content_block_start') {
          const block = event.content_block as Record<string, unknown> | undefined
          if (block?.type === 'tool_use') {
            currentToolId = block.id as string
            currentToolName = block.name as string
            toolInputJson = ''
          }
        }

        if (type === 'content_block_delta') {
          const delta = event.delta as Record<string, unknown> | undefined
          if (delta?.type === 'text_delta') {
            events.push({ type: 'text_delta', delta: delta.text as string })
          } else if (delta?.type === 'input_json_delta') {
            toolInputJson += (delta.partial_json as string) ?? ''
          }
        }

        if (type === 'content_block_stop' && currentToolId) {
          let input: Record<string, unknown> = {}
          try {
            input = toolInputJson ? JSON.parse(toolInputJson) : {}
          } catch {
            input = {}
          }
          pendingToolCalls.push({ id: currentToolId, name: currentToolName, input })
          currentToolId = ''
          currentToolName = ''
          toolInputJson = ''
        }
      }
    }

    return { events, pendingToolCalls }
  }

  async generateText(params: GenerateTextParams): Promise<string> {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({
        model: this.modelId,
        max_tokens: params.maxTokens ?? 500,
        ...(params.systemPrompt ? { system: params.systemPrompt } : {}),
        messages: [{ role: 'user', content: params.prompt }],
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic generateText failed: ${response.status}`)
    }

    const data = await response.json()
    const text = data?.content?.[0]?.text
    if (typeof text !== 'string') {
      throw new Error('Anthropic generateText: no text in response')
    }
    return text.trim()
  }

  async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T> {
    // Anthropic has no native json_schema mode — force output via a single tool.
    const toolName = params.schemaName
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({
        model: this.modelId,
        max_tokens: params.maxTokens ?? 1024,
        ...(params.systemPrompt ? { system: params.systemPrompt } : {}),
        tools: [
          {
            name: toolName,
            description: 'Return the structured result.',
            input_schema: params.schema,
          },
        ],
        tool_choice: { type: 'tool', name: toolName },
        messages: [{ role: 'user', content: params.prompt }],
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic generateStructured failed: ${response.status}`)
    }

    const data = await response.json()
    const toolUse = (data?.content ?? []).find(
      (b: { type: string }) => b.type === 'tool_use',
    ) as { input?: unknown } | undefined
    if (!toolUse || toolUse.input == null) {
      throw new Error('Anthropic generateStructured: no tool_use in response')
    }
    return params.validate ? params.validate(toolUse.input) : (toolUse.input as T)
  }
}
