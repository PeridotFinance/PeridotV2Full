/**
 * MCP (Model Context Protocol) types for the agent integration layer.
 */

import type { ProviderToolDefinition } from '@/lib/agents/providers'

/** Streamable HTTP MCP server (e.g. mcp.peridot.finance). */
export interface HttpMcpServerConfig {
  transport?: 'http'
  /** Stable identifier used as a tool prefix (lowercase, snake_case recommended). */
  name: string
  /** Base URL for the streamable HTTP MCP endpoint, e.g. "https://mcp.peridot.finance/mcp". */
  url: string
  /** Optional static headers applied to every request (e.g. auth tokens). */
  headers?: Record<string, string>
  /** Disable this server without removing it from config. */
  enabled?: boolean
}

/** Stdio MCP server (spawned as subprocess, e.g. @alchemy/mcp-server). */
export interface StdioMcpServerConfig {
  transport: 'stdio'
  /** Stable identifier used as a tool prefix. */
  name: string
  /** Executable to run (e.g. "node", "npx"). */
  command: string
  /** Args passed to the command. */
  args?: string[]
  /** Extra env vars merged into the child process env (process.env is also passed through). */
  env?: Record<string, string>
  /** Disable this server without removing it from config. */
  enabled?: boolean
}

export type McpServerConfig = HttpMcpServerConfig | StdioMcpServerConfig

export function isStdioConfig(c: McpServerConfig): c is StdioMcpServerConfig {
  return c.transport === 'stdio'
}

/** Result of calling an MCP tool — mirrored from the MCP `content` array. */
export interface McpToolCallResult {
  /** Concatenated textual content suitable for feeding back to the LLM. */
  text: string
  /**
   * Structured payload extracted from the MCP `structuredContent` field.
   * Lets us convert tool results into rich UI blocks without re-parsing the
   * text. Shape is tool-specific; downstream code narrows by tool name.
   */
  data?: Record<string, unknown>
  /** True if the tool reported an error (isError flag on the MCP response). */
  isError?: boolean
}

/** Tool definition discovered from an MCP server, after namespacing. */
export interface McpDiscoveredTool extends ProviderToolDefinition {
  serverName: string
  /** The tool name as the MCP server exposes it (without the prefix). */
  remoteName: string
}

/** Namespacing helpers — keep the prefix choice in one place. */
export const MCP_TOOL_PREFIX = 'mcp__'

export function namespacedName(serverName: string, toolName: string): string {
  return `${MCP_TOOL_PREFIX}${serverName}__${toolName}`
}

export function parseNamespacedName(
  name: string,
): { serverName: string; toolName: string } | null {
  if (!name.startsWith(MCP_TOOL_PREFIX)) return null
  const rest = name.slice(MCP_TOOL_PREFIX.length)
  const idx = rest.indexOf('__')
  if (idx === -1) return null
  return { serverName: rest.slice(0, idx), toolName: rest.slice(idx + 2) }
}
