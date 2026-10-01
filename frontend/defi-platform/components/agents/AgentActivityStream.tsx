'use client'

/**
 * AgentActivityStream
 *
 * Mount-once adapter: starts the SSE subscription (via `useAgentActivityStream`)
 * so every open chat surface sees the same live lifecycle events without
 * needing to wire up the stream itself. Renders nothing.
 *
 * Separate file so it can be mounted alongside AgentCrossChainListener
 * (both are side-effect-only components under RootProviders).
 */

import { useAgentActivityStream } from '@/hooks/use-agent-activity-stream'

export function AgentActivityStream() {
  useAgentActivityStream()
  return null
}
