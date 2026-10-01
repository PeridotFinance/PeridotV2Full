/**
 * Tool-schema helpers.
 * AGENT_TOOLS is currently written in Anthropic's shape (name/description/input_schema).
 * These helpers convert to a provider-neutral form and then to each provider's API shape.
 */

import type { ProviderToolDefinition, JsonSchema } from './types'

interface AnthropicShapedTool {
  name: string
  description: string
  input_schema: JsonSchema
}

/** Convert the legacy Anthropic-shaped AGENT_TOOLS array to the provider-neutral shape. */
export function toProviderTools(tools: readonly AnthropicShapedTool[]): ProviderToolDefinition[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    schema: t.input_schema,
  }))
}

/** Anthropic Messages API tool shape. */
export interface AnthropicToolWire {
  name: string
  description: string
  input_schema: JsonSchema
}

export function toAnthropicTool(tool: ProviderToolDefinition): AnthropicToolWire {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.schema,
  }
}

/** OpenAI Chat Completions tool shape (function tools). */
export interface OpenAIToolWire {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JsonSchema
    /** When true, enforces strict schema adherence (OpenAI structured outputs). */
    strict?: boolean
  }
}

export function toOpenAITool(tool: ProviderToolDefinition, strict = false): OpenAIToolWire {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
      ...(strict ? { strict: true } : {}),
    },
  }
}
