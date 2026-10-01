/**
 * Provider registry. Env vars control the default provider + model IDs.
 *
 *   AGENT_MODEL_PROVIDER     — 'openai' | 'anthropic'  (default: 'openai')
 *   AGENT_MODEL_ID           — primary model  (default: 'gpt-5.4-mini')
 *   AGENT_SMALL_MODEL_ID     — cheap model for titles/summaries
 *                              (defaults: 'gpt-5.4-nano' for openai, 'claude-haiku-4-5-20251001' for anthropic)
 *   OPENAI_API_KEY           — required for openai
 *   ANTHROPIC_API_KEY        — required for anthropic
 */

import { AnthropicProvider } from './anthropic'
import { OpenAIProvider } from './openai'
import type { LLMProvider, ProviderName } from './types'

export * from './types'
export * from './tool-schema'
export * from './structured'

const DEFAULT_MODELS: Record<ProviderName, { primary: string; small: string }> = {
  openai: { primary: 'gpt-5.4-mini', small: 'gpt-5.4-nano' },
  anthropic: { primary: 'claude-sonnet-4-6-20250514', small: 'claude-haiku-4-5-20251001' },
}

export interface ProviderOptions {
  /** Override the provider selection (otherwise: env). */
  provider?: ProviderName
  /** Override the model ID. */
  modelId?: string
  /** Use the "small" model for this provider (titles/summaries). Ignored if modelId is set. */
  small?: boolean
}

function resolveProviderName(opts?: ProviderOptions): ProviderName {
  if (opts?.provider) return opts.provider
  const env = process.env.AGENT_MODEL_PROVIDER?.toLowerCase()
  if (env === 'anthropic' || env === 'openai') return env
  return 'openai'
}

function resolveModelId(provider: ProviderName, opts?: ProviderOptions): string {
  if (opts?.modelId) return opts.modelId
  if (opts?.small) {
    return process.env.AGENT_SMALL_MODEL_ID ?? DEFAULT_MODELS[provider].small
  }
  return process.env.AGENT_MODEL_ID ?? DEFAULT_MODELS[provider].primary
}

/**
 * Build a configured LLMProvider.
 * Throws if the required API key is missing — caller decides whether to fall back.
 */
export function getProvider(opts?: ProviderOptions): LLMProvider {
  const name = resolveProviderName(opts)
  const modelId = resolveModelId(name, opts)

  if (name === 'openai') {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new Error('OPENAI_API_KEY is not set')
    return new OpenAIProvider(modelId, key)
  }

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set')
  return new AnthropicProvider(modelId, key)
}

/** Shorthand for the cheap model (titles, summaries). */
export function getSmallProvider(opts?: Omit<ProviderOptions, 'small'>): LLMProvider {
  return getProvider({ ...opts, small: true })
}
