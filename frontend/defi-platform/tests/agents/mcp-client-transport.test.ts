/**
 * Make sure the McpClient picks the correct transport for each config shape
 * and passes the right options into the SDK constructors. We mock both
 * transport classes so no subprocess is spawned and no network is hit.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks so the imports inside `client.ts` see them. ───────
const httpCtor = vi.fn()
const stdioCtor = vi.fn()
const clientConnect = vi.fn(async () => {})
const clientListTools = vi.fn(async () => ({ tools: [] }))
const clientCallTool = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] }))

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation((url, opts) => {
    httpCtor(url, opts)
    return { close: vi.fn(async () => {}) }
  }),
}))

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation((opts) => {
    stdioCtor(opts)
    return { close: vi.fn(async () => {}) }
  }),
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: clientConnect,
    listTools: clientListTools,
    callTool: clientCallTool,
  })),
}))

import { McpClient } from '@/lib/agents/mcp/client'

describe('McpClient transport selection', () => {
  beforeEach(() => {
    httpCtor.mockClear()
    stdioCtor.mockClear()
    clientConnect.mockClear()
    clientListTools.mockClear()
    clientCallTool.mockClear()
  })

  it('uses StreamableHTTPClientTransport for http configs', async () => {
    const c = new McpClient({
      transport: 'http',
      name: 'peridot',
      url: 'https://mcp.peridot.finance/mcp',
      headers: { 'x-trace': 'unit' },
    })
    await c.listTools()
    expect(httpCtor).toHaveBeenCalledTimes(1)
    expect(stdioCtor).not.toHaveBeenCalled()
    const [url, opts] = httpCtor.mock.calls[0]
    expect(String(url)).toBe('https://mcp.peridot.finance/mcp')
    expect(opts.requestInit.headers).toEqual({ 'x-trace': 'unit' })
  })

  it('uses StdioClientTransport for stdio configs and merges process.env', async () => {
    const c = new McpClient({
      transport: 'stdio',
      name: 'alchemy',
      command: 'node',
      args: ['x.js'],
      env: { ALCHEMY_API_KEY: 'inject-me' },
    })
    await c.listTools()
    expect(stdioCtor).toHaveBeenCalledTimes(1)
    expect(httpCtor).not.toHaveBeenCalled()
    const [opts] = stdioCtor.mock.calls[0]
    expect(opts.command).toBe('node')
    expect(opts.args).toEqual(['x.js'])
    // The override should be present
    expect(opts.env.ALCHEMY_API_KEY).toBe('inject-me')
    // process.env should also be passed through (PATH should exist on this machine)
    expect(opts.env.PATH).toBeDefined()
    // Subprocess stderr should be inherited so Alchemy logs end up in our stream
    expect(opts.stderr).toBe('inherit')
  })

  it('reuses the same Client across calls (no reconnect per call)', async () => {
    const c = new McpClient({
      transport: 'http',
      name: 'peridot',
      url: 'https://x.test/mcp',
    })
    await c.listTools()
    await c.callTool('foo', {})
    await c.callTool('bar', {})
    expect(clientConnect).toHaveBeenCalledTimes(1)
  })

  it('forces a reconnect after a failed listTools (transport reset)', async () => {
    const c = new McpClient({
      transport: 'http',
      name: 'peridot',
      url: 'https://x.test/mcp',
    })

    clientListTools
      .mockImplementationOnce(async () => {
        throw new Error('disconnected')
      })
      .mockImplementationOnce(async () => ({ tools: [] }))

    await expect(c.listTools()).rejects.toThrow('disconnected')
    await c.listTools()

    // Two distinct connect calls means the transport was reset and rebuilt.
    expect(clientConnect).toHaveBeenCalledTimes(2)
  })
})
