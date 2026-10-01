/**
 * Provider-agnostic LLM interface.
 * Concrete adapters live in ./anthropic.ts and ./openai.ts and are picked by ./index.ts.
 */

import type { ContentBlock } from '@/types/agents'

export type ProviderName = 'anthropic' | 'openai'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** JSON Schema object (draft-07-ish). Kept loose to accept whatever providers need. */
export type JsonSchema = Record<string, unknown>

/** Provider-neutral tool definition. Converted per-provider at call time. */
export interface ProviderToolDefinition {
  name: string
  description: string
  schema: JsonSchema
}

/** Result of executing a tool. */
export interface ToolExecutorResult {
  /** Plain-text payload fed back to the LLM as the tool result. */
  content: string
  /** Optional structured blocks to stream to the UI. */
  blocks?: ContentBlock[]
}

/** Callback invoked by the provider when the model makes a tool call. */
export type ToolExecutor = (call: {
  id: string
  name: string
  input: Record<string, unknown>
}) => Promise<ToolExecutorResult>

export type ProviderStreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'block'; block: ContentBlock }

export interface StreamChatParams {
  systemPrompt: string
  messages: ChatMessage[]
  tools?: ProviderToolDefinition[]
  toolExecutor?: ToolExecutor
  maxTokens?: number
  /** Hard cap on tool-call rounds to avoid runaway loops. Default 5. */
  maxToolRounds?: number
}

export interface GenerateTextParams {
  systemPrompt?: string
  prompt: string
  maxTokens?: number
}

export interface GenerateStructuredParams<T> {
  systemPrompt?: string
  prompt: string
  /** JSON schema describing the expected output. */
  schema: JsonSchema
  /** Name used by providers that require a tool/schema name. */
  schemaName: string
  /** Optional runtime validator — throws if the parsed object doesn't match. */
  validate?: (raw: unknown) => T
  maxTokens?: number
}

export interface LLMProvider {
  readonly name: ProviderName
  readonly modelId: string

  streamChat(params: StreamChatParams): AsyncIterable<ProviderStreamEvent>
  generateText(params: GenerateTextParams): Promise<string>
  generateStructured<T = unknown>(params: GenerateStructuredParams<T>): Promise<T>
}
