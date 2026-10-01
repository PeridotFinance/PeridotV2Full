/**
 * MCP registry — aggregates tools across multiple MCP servers, namespaces them,
 * and routes tool calls back to the right server.
 *
 * A process-wide singleton (`getMcpRegistry`) keeps connections warm between
 * chat requests. Discovery is cached with a short TTL so the first call on each
 * request doesn't pay the listTools round-trip.
 */

import type { ProviderToolDefinition } from '@/lib/agents/providers'
import { McpClient } from './client'
import { loadMcpConfig } from './config'
import {
  namespacedName,
  parseNamespacedName,
  MCP_TOOL_PREFIX,
  type McpDiscoveredTool,
  type McpServerConfig,
} from './types'

const DISCOVERY_TTL_MS = 5 * 60 * 1000 // 5 minutes

export class McpRegistry {
  private clients = new Map<string, McpClient>()
  private toolsCache: McpDiscoveredTool[] | null = null
  private cacheExpiresAt = 0

  constructor(configs: McpServerConfig[]) {
    for (const cfg of configs) {
      this.clients.set(cfg.name, new McpClient(cfg))
    }
  }

  /** True if at least one MCP server is configured. */
  get enabled(): boolean {
    return this.clients.size > 0
  }

  /**
   * Discover tools across all configured servers. Failures on one server don't
   * block others — unreachable servers just contribute zero tools.
   */
  async listTools(opts?: { forceRefresh?: boolean }): Promise<McpDiscoveredTool[]> {
    if (!opts?.forceRefresh && this.toolsCache && Date.now() < this.cacheExpiresAt) {
      return this.toolsCache
    }

    const results = await Promise.all(
      Array.from(this.clients.entries()).map(async ([name, client]) => {
        try {
          const tools = await client.listTools()
          return tools.map<McpDiscoveredTool>((t) => ({
            name: namespacedName(name, t.name),
            description: t.description || `Tool ${t.name} from ${name} MCP server`,
            schema: t.schema,
            serverName: name,
            remoteName: t.name,
          }))
        } catch (err) {
          console.warn(`[mcp] listTools failed for "${name}":`, err)
          return []
        }
      }),
    )

    const tools = results.flat()
    this.toolsCache = tools
    this.cacheExpiresAt = Date.now() + DISCOVERY_TTL_MS
    return tools
  }

  /** True when the given tool name is served by this registry. */
  handles(toolName: string): boolean {
    return toolName.startsWith(MCP_TOOL_PREFIX)
  }

  /**
   * Execute a namespaced MCP tool call. Returns the text payload the LLM sees.
   * Errors are captured into the text so the model can react — never throws.
   */
  async executeTool(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<{ content: string; data?: Record<string, unknown>; isError: boolean }> {
    const parsed = parseNamespacedName(toolName)
    if (!parsed) {
      return { content: `MCP: unrecognized tool name "${toolName}"`, isError: true }
    }
    const client = this.clients.get(parsed.serverName)
    if (!client) {
      return {
        content: `MCP: unknown server "${parsed.serverName}" for tool "${parsed.toolName}"`,
        isError: true,
      }
    }

    try {
      const result = await client.callTool(parsed.toolName, input)
      return {
        content: result.text || '(empty result)',
        data: result.data,
        isError: Boolean(result.isError),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `MCP: tool "${toolName}" failed: ${msg}`, isError: true }
    }
  }

  /** Return as provider-neutral tool definitions for passing to `provider.streamChat`. */
  async asProviderTools(): Promise<ProviderToolDefinition[]> {
    const tools = await this.listTools()
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      schema: t.schema,
    }))
  }

  async close(): Promise<void> {
    await Promise.all(Array.from(this.clients.values()).map((c) => c.close()))
    this.clients.clear()
    this.toolsCache = null
  }
}

// ── Process-wide singleton ──────────────────────────────────────────

let singleton: McpRegistry | null = null

export function getMcpRegistry(): McpRegistry {
  if (!singleton) singleton = new McpRegistry(loadMcpConfig())
  return singleton
}

/** Tests / config reloads — drop the singleton so the next call rebuilds it. */
export function resetMcpRegistry(): void {
  singleton?.close().catch(() => {})
  singleton = null
}
