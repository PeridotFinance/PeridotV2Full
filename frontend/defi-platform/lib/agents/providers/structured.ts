/**
 * Structured-output helpers. Wraps `provider.generateStructured` with Zod so
 * callers define a schema once and get a fully-typed, validated result.
 *
 *   const Summary = z.object({ title: z.string(), bullets: z.array(z.string()) })
 *   const result = await generateZodStructured(provider, {
 *     schema: Summary,
 *     schemaName: 'conversation_summary',
 *     prompt: '...',
 *   })
 *   // result.title is typed as string, result.bullets is typed as string[]
 */

import type { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { LLMProvider, JsonSchema } from './types'

export interface ZodStructuredParams<T extends z.ZodTypeAny> {
  schema: T
  schemaName: string
  prompt: string
  systemPrompt?: string
  maxTokens?: number
}

/**
 * Generate a structured, Zod-validated response from any LLM provider.
 * Throws a `ZodError` if the model returns something that doesn't match the schema.
 */
export async function generateZodStructured<T extends z.ZodTypeAny>(
  provider: LLMProvider,
  params: ZodStructuredParams<T>,
): Promise<z.infer<T>> {
  const jsonSchema = zodToJsonSchema(params.schema, {
    name: params.schemaName,
    $refStrategy: 'none',
  }) as JsonSchema

  // zod-to-json-schema wraps the schema under `definitions[name]` — unwrap to a flat object.
  const flatSchema = unwrapDefinitions(jsonSchema, params.schemaName)

  return provider.generateStructured<z.infer<T>>({
    schema: flatSchema,
    schemaName: params.schemaName,
    prompt: params.prompt,
    systemPrompt: params.systemPrompt,
    maxTokens: params.maxTokens,
    validate: (raw) => params.schema.parse(raw),
  })
}

function unwrapDefinitions(schema: JsonSchema, name: string): JsonSchema {
  const defs = schema.definitions as Record<string, JsonSchema> | undefined
  if (defs && defs[name]) {
    return defs[name]
  }
  return schema
}
