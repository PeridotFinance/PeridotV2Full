import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  namespacedName,
  parseNamespacedName,
  MCP_TOOL_PREFIX,
} from '@/lib/agents/mcp/types'
import { loadMcpConfig } from '@/lib/agents/mcp/config'

// Mock McpClient so we don't hit the network.
vi.mock('@/lib/agents/mcp/client', () => {
  class FakeMcpClient {
    constructor(public config: { name: string; url: string }) {}
    listTools = vi.fn()
    callTool = vi.fn()
    close = vi.fn(async () => {})
  }
  return { McpClient: FakeMcpClient }
})

import { McpRegistry } from '@/lib/agents/mcp/registry'
import { McpClient } from '@/lib/agents/mcp/client'

describe('MCP namespacing helpers', () => {
  it('roundtrips namespaced names', () => {
    const ns = namespacedName('peridot', 'get_markets')
    expect(ns).toBe(`${MCP_TOOL_PREFIX}peridot__get_markets`)
    expect(parseNamespacedName(ns)).toEqual({
      serverName: 'peridot',
      toolName: 'get_markets',
    })
  })

  it('handles tool names containing underscores', () => {
    const ns = namespacedName('srv', 'get_user__portfolio')
    expect(parseNamespacedName(ns)).toEqual({
      serverName: 'srv',
      toolName: 'get_user__portfolio',
    })
  })

  it('returns null for non-MCP names', () => {
    expect(parseNamespacedName('get_peridot_markets')).toBeNull()
    expect(parseNamespacedName('mcp__onlyprefix')).toBeNull()
  })
})

describe('loadMcpConfig', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns empty array by default', () => {
    vi.stubEnv('MCP_SERVERS', '')
    vi.stubEnv('MCP_PERIDOT_URL', '')
    expect(loadMcpConfig()).toEqual([])
  })

  it('parses MCP_SERVERS JSON', () => {
    vi.stubEnv(
      'MCP_SERVERS',
      JSON.stringify([
        { name: 'peridot', url: 'https://mcp.peridot.finance/mcp' },
        { name: 'other', url: 'https://x.com/mcp', enabled: false },
      ]),
    )
    const cfg = loadMcpConfig()
    expect(cfg).toHaveLength(1)
    expect(cfg[0].name).toBe('peridot')
  })

  it('falls back to MCP_PERIDOT_URL', () => {
    vi.stubEnv('MCP_SERVERS', '')
    vi.stubEnv('MCP_PERIDOT_URL', 'https://mcp.peridot.finance/mcp')
    const cfg = loadMcpConfig()
    expect(cfg).toEqual([
      { name: 'peridot', transport: 'http', url: 'https://mcp.peridot.finance/mcp' },
    ])
  })

  it('ignores invalid JSON without throwing', () => {
    vi.stubEnv('MCP_SERVERS', 'not-json{{{')
    expect(loadMcpConfig()).toEqual([])
  })

  it('parses stdio transport configs', () => {
    vi.stubEnv(
      'MCP_SERVERS',
      JSON.stringify([
        {
          name: 'alchemy',
          transport: 'stdio',
          command: 'node',
          args: ['node_modules/@alchemy/mcp-server/dist/index.js'],
          env: { ALCHEMY_API_KEY: 'test-key' },
        },
      ]),
    )
    const cfg = loadMcpConfig()
    expect(cfg).toHaveLength(1)
    expect(cfg[0]).toMatchObject({
      transport: 'stdio',
      name: 'alchemy',
      command: 'node',
      args: ['node_modules/@alchemy/mcp-server/dist/index.js'],
      env: { ALCHEMY_API_KEY: 'test-key' },
    })
  })

  it('treats legacy { name, url } shape (no transport field) as HTTP', () => {
    vi.stubEnv(
      'MCP_SERVERS',
      JSON.stringify([{ name: 'peridot', url: 'https://x.test/mcp' }]),
    )
    const [cfg] = loadMcpConfig()
    expect(cfg.transport).toBe('http')
    expect(cfg.name).toBe('peridot')
  })

  it('supports both HTTP and stdio side-by-side', () => {
    vi.stubEnv(
      'MCP_SERVERS',
      JSON.stringify([
        { name: 'peridot', transport: 'http', url: 'https://a.test/mcp' },
        { name: 'alchemy', transport: 'stdio', command: 'node', args: ['x.js'] },
      ]),
    )
    const cfg = loadMcpConfig()
    expect(cfg).toHaveLength(2)
    expect(cfg[0].transport).toBe('http')
    expect(cfg[1].transport).toBe('stdio')
  })

  it('rejects stdio configs missing command', () => {
    vi.stubEnv(
      'MCP_SERVERS',
      JSON.stringify([
        { name: 'broken', transport: 'stdio', args: ['x.js'] }, // no command
        { name: 'good', transport: 'http', url: 'https://a.test/mcp' },
      ]),
    )
    const cfg = loadMcpConfig()
    expect(cfg).toHaveLength(1)
    expect(cfg[0].name).toBe('good')
  })

  it('rejects HTTP configs missing url', () => {
    vi.stubEnv(
      'MCP_SERVERS',
      JSON.stringify([
        { name: 'broken' }, // no url, no transport
        { name: 'good', url: 'https://a.test/mcp' },
      ]),
    )
    const cfg = loadMcpConfig()
    expect(cfg).toHaveLength(1)
    expect(cfg[0].name).toBe('good')
  })

  it('honours enabled=false in stdio configs too', () => {
    vi.stubEnv(
      'MCP_SERVERS',
      JSON.stringify([
        { name: 'a', transport: 'stdio', command: 'node', args: ['x'], enabled: false },
        { name: 'b', transport: 'http', url: 'https://x.test/mcp' },
      ]),
    )
    expect(loadMcpConfig().map((c) => c.name)).toEqual(['b'])
  })
})

describe('McpRegistry', () => {
  it('aggregates tools across servers with namespacing', async () => {
    const registry = new McpRegistry([
      { name: 'peridot', url: 'https://a.test/mcp' },
      { name: 'other', url: 'https://b.test/mcp' },
    ])

    // Grab the mocked clients and wire their listTools responses
    const clients = (registry as unknown as { clients: Map<string, InstanceType<typeof McpClient>> }).clients
    clients.get('peridot')!.listTools = vi.fn(async () => [
      { name: 'get_markets', description: 'Get markets', schema: { type: 'object' } },
      { name: 'get_pool', description: 'Get pool', schema: { type: 'object' } },
    ])
    clients.get('other')!.listTools = vi.fn(async () => [
      { name: 'ping', description: 'Ping', schema: { type: 'object' } },
    ])

    const tools = await registry.listTools()

    expect(tools).toHaveLength(3)
    expect(tools.map((t) => t.name).sort()).toEqual([
      'mcp__other__ping',
      'mcp__peridot__get_markets',
      'mcp__peridot__get_pool',
    ])
  })

  it('reports enabled=false when no servers configured', () => {
    const r = new McpRegistry([])
    expect(r.enabled).toBe(false)
  })

  it('skips unreachable servers without failing the others', async () => {
    const registry = new McpRegistry([
      { name: 'ok', url: 'https://a.test/mcp' },
      { name: 'bad', url: 'https://b.test/mcp' },
    ])
    const clients = (registry as unknown as { clients: Map<string, InstanceType<typeof McpClient>> }).clients
    clients.get('ok')!.listTools = vi.fn(async () => [
      { name: 'x', description: 'x', schema: { type: 'object' } },
    ])
    clients.get('bad')!.listTools = vi.fn(async () => {
      throw new Error('connect refused')
    })

    // console.warn is expected here — silence it for the test
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tools = await registry.listTools()
    warnSpy.mockRestore()

    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('mcp__ok__x')
  })

  it('caches discovery within the TTL', async () => {
    const registry = new McpRegistry([{ name: 's', url: 'https://a.test/mcp' }])
    const clients = (registry as unknown as { clients: Map<string, InstanceType<typeof McpClient>> }).clients
    const listTools = vi.fn(async () => [
      { name: 'x', description: 'x', schema: { type: 'object' } },
    ])
    clients.get('s')!.listTools = listTools

    await registry.listTools()
    await registry.listTools()
    await registry.listTools()

    expect(listTools).toHaveBeenCalledTimes(1)
  })

  it('routes tool calls to the right server', async () => {
    const registry = new McpRegistry([{ name: 'peridot', url: 'https://a.test/mcp' }])
    const clients = (registry as unknown as { clients: Map<string, InstanceType<typeof McpClient>> }).clients
    clients.get('peridot')!.callTool = vi.fn(async () => ({
      text: 'hello from peridot',
      isError: false,
    }))

    const result = await registry.executeTool('mcp__peridot__get_markets', { x: 1 })
    expect(result.content).toBe('hello from peridot')
    expect(result.isError).toBe(false)
    expect(clients.get('peridot')!.callTool).toHaveBeenCalledWith('get_markets', { x: 1 })
  })

  it('returns an error payload for unknown servers (does not throw)', async () => {
    const registry = new McpRegistry([{ name: 'only', url: 'https://a.test/mcp' }])
    const result = await registry.executeTool('mcp__missing__x', {})
    expect(result.isError).toBe(true)
    expect(result.content).toContain('unknown server')
  })

  it('captures callTool errors without throwing', async () => {
    const registry = new McpRegistry([{ name: 's', url: 'https://a.test/mcp' }])
    const clients = (registry as unknown as { clients: Map<string, InstanceType<typeof McpClient>> }).clients
    clients.get('s')!.callTool = vi.fn(async () => {
      throw new Error('network down')
    })

    const result = await registry.executeTool('mcp__s__foo', {})
    expect(result.isError).toBe(true)
    expect(result.content).toContain('network down')
  })

  it('handles() recognizes MCP-prefixed names only', () => {
    const r = new McpRegistry([])
    expect(r.handles('mcp__x__y')).toBe(true)
    expect(r.handles('get_peridot_markets')).toBe(false)
  })
})
