/**
 * Thin wrapper around a single MCP server connection.
 *
 * Supports two transports:
 *   - HTTP    (StreamableHTTPClientTransport) — for hosted MCP servers
 *   - stdio   (StdioClientTransport)          — for spawned subprocess servers
 *
 * Handles lazy connection + reconnect on failure. Tool discovery and tool calls
 * are exposed as plain async methods so the registry can keep the rest of the
 * codebase free of SDK types.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { isStdioConfig, type McpServerConfig, type McpToolCallResult } from './types'

export interface DiscoveredRemoteTool {
  name: string
  description: string
  schema: Record<string, unknown>
}

interface ContentItem {
  type: string
  text?: string
}

const CLIENT_INFO = { name: 'peridot-agent', version: '1.0.0' }
const CLIENT_OPTIONS = { capabilities: {} }

/** Per-call timeout for tools/list and tools/call — keeps the agent stream from hanging. */
const REQUEST_TIMEOUT_MS = 30_000

export class McpClient {
  private client: Client | null = null
  private transport: Transport | null = null
  private connectPromise: Promise<Client> | null = null

  constructor(readonly config: McpServerConfig) {}

  /**
   * Connect (lazy, cached). Concurrent callers get the same in-flight promise.
   */
  private async connect(): Promise<Client> {
    if (this.client) return this.client
    if (this.connectPromise) return this.connectPromise

    this.connectPromise = (async () => {
      const transport = createTransport(this.config)
      const client = new Client(CLIENT_INFO, CLIENT_OPTIONS)
      await client.connect(transport)
      this.client = client
      this.transport = transport
      return client
    })().catch((err) => {
      this.connectPromise = null
      throw err
    })

    return this.connectPromise
  }

  /** Force reconnect on the next call (used after a transport error). */
  private async reset(): Promise<void> {
    this.client = null
    this.connectPromise = null
    if (this.transport) {
      try {
        await this.transport.close()
      } catch {
        // ignore — best-effort
      }
      this.transport = null
    }
  }

  /** Discover tools this server exposes. */
  async listTools(): Promise<DiscoveredRemoteTool[]> {
    try {
      const client = await this.connect()
      const { tools } = await client.listTools({}, { timeout: REQUEST_TIMEOUT_MS })
      return tools.map((t) => ({
        name: t.name,
        description: t.description ?? '',
        schema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
      }))
    } catch (err) {
      await this.reset()
      throw err
    }
  }

  /** Invoke a tool and return its flattened text content. */
  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    try {
      const client = await this.connect()
      const result = await client.callTool(
        { name, arguments: args },
        undefined,
        { timeout: REQUEST_TIMEOUT_MS },
      )
      const content = Array.isArray(result.content) ? (result.content as ContentItem[]) : []
      const text = content
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('\n')
      // MCP servers can return typed payloads alongside the text. When present,
      // surface it so callers can build visual blocks without re-parsing text.
      const structured = (result as { structuredContent?: unknown }).structuredContent
      const data =
        structured && typeof structured === 'object' && !Array.isArray(structured)
          ? (structured as Record<string, unknown>)
          : undefined
      return { text, data, isError: Boolean(result.isError) }
    } catch (err) {
      await this.reset()
      throw err
    }
  }

  async close(): Promise<void> {
    await this.reset()
  }
}

/**
 * Build a transport for the given config.
 *
 * Stdio servers spawn a child process — its stderr is inherited by the parent
 * so MCP server log output shows up in our logs (helpful for debugging).
 */
function createTransport(config: McpServerConfig): Transport {
  if (isStdioConfig(config)) {
    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      // Pass through process.env so PATH, NODE_PATH, etc. work; merge in extras.
      env: {
        ...(process.env as Record<string, string>),
        ...(config.env ?? {}),
      },
      stderr: 'inherit',
    })
  }

  const url = new URL(config.url)
  return new StreamableHTTPClientTransport(url, {
    requestInit: config.headers ? { headers: config.headers } : undefined,
  })
}
