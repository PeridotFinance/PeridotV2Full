/**
 * MCP server configuration loader.
 *
 * Reads from `MCP_SERVERS` (JSON array, recommended) or falls back to the
 * Peridot hosted server when `MCP_PERIDOT_URL` is set.
 *
 * Supports two transports:
 *
 *   HTTP:
 *     {"name":"peridot","transport":"http","url":"https://mcp.peridot.finance/mcp"}
 *     // legacy short form (no `transport` field) is treated as HTTP
 *     {"name":"peridot","url":"https://mcp.peridot.finance/mcp"}
 *
 *   Stdio (spawned subprocess):
 *     {"name":"alchemy","transport":"stdio","command":"node",
 *      "args":["node_modules/@alchemy/mcp-server/dist/index.js"],
 *      "env":{"ALCHEMY_API_KEY":"..."}}
 *
 * Servers can be disabled in-place via `enabled: false`.
 */

import type { McpServerConfig } from './types'

export function loadMcpConfig(): McpServerConfig[] {
  const raw = process.env.MCP_SERVERS?.trim()
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
        .map(normalizeConfig)
        .filter((c): c is McpServerConfig => c !== null)
        .filter((s) => s.enabled !== false)
    } catch {
      console.warn('[mcp] MCP_SERVERS is not valid JSON, ignoring')
      return []
    }
  }

  // Convenience fallback so the hosted Peridot MCP can be enabled with one env var.
  const peridotUrl = process.env.MCP_PERIDOT_URL?.trim()
  if (peridotUrl) {
    return [{ name: 'peridot', transport: 'http', url: peridotUrl }]
  }

  return []
}

function normalizeConfig(v: unknown): McpServerConfig | null {
  if (!v || typeof v !== 'object') return null
  const c = v as Record<string, unknown>
  if (typeof c.name !== 'string' || c.name.length === 0) return null

  const transport = c.transport === 'stdio' ? 'stdio' : 'http'

  if (transport === 'stdio') {
    if (typeof c.command !== 'string' || c.command.length === 0) return null
    return {
      transport: 'stdio',
      name: c.name,
      command: c.command,
      args: Array.isArray(c.args) ? c.args.filter((a) => typeof a === 'string') : [],
      env: isStringRecord(c.env) ? c.env : undefined,
      enabled: typeof c.enabled === 'boolean' ? c.enabled : true,
    }
  }

  if (typeof c.url !== 'string' || c.url.length === 0) return null
  return {
    transport: 'http',
    name: c.name,
    url: c.url,
    headers: isStringRecord(c.headers) ? c.headers : undefined,
    enabled: typeof c.enabled === 'boolean' ? c.enabled : true,
  }
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (!v || typeof v !== 'object') return false
  return Object.values(v as Record<string, unknown>).every((x) => typeof x === 'string')
}
