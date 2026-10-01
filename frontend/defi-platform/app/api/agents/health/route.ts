import { NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { getProvider, getSmallProvider } from '@/lib/agents/providers'
import { getMcpRegistry } from '@/lib/agents/mcp'

/**
 * GET /api/agents/health
 *
 * End-to-end readiness check for the agent chat stack. Hit this when the chat
 * is silent or erroring — it tells you at a glance which dependency is broken.
 *
 * Not authenticated (intentionally — meant for ops/debug). Returns 200 even
 * if some checks fail so the response body can be inspected.
 */

type CheckResult =
  | { ok: true; detail?: string }
  | { ok: false; error: string }

async function check(name: string, fn: () => Promise<CheckResult>): Promise<[string, CheckResult]> {
  try {
    return [name, await fn()]
  } catch (err) {
    return [name, { ok: false, error: err instanceof Error ? err.message : String(err) }]
  }
}

export async function GET() {
  const results = Object.fromEntries(
    await Promise.all([
      // 1. Primary LLM provider reachable with a tiny request.
      check('provider_primary', async () => {
        const provider = getProvider()
        const text = await provider.generateText({
          prompt: 'Reply with the single word "ok".',
          maxTokens: 10,
        })
        return { ok: true, detail: `${provider.name}:${provider.modelId} → "${text.slice(0, 30)}"` }
      }),

      // 2. Small model provider (titles, summaries)
      check('provider_small', async () => {
        const provider = getSmallProvider()
        const text = await provider.generateText({
          prompt: 'Reply with the single word "ok".',
          maxTokens: 10,
        })
        return { ok: true, detail: `${provider.name}:${provider.modelId} → "${text.slice(0, 30)}"` }
      }),

      // 3. Database reachable.
      check('database', async () => {
        const rows = await sql`SELECT 1 AS ok`
        return rows[0]?.ok === 1
          ? { ok: true }
          : { ok: false, error: 'unexpected row shape' }
      }),

      // 4. MCP registry reachable (if configured).
      check('mcp_registry', async () => {
        const registry = getMcpRegistry()
        if (!registry.enabled) {
          return { ok: true, detail: 'no MCP servers configured (set MCP_PERIDOT_URL or MCP_SERVERS)' }
        }
        const tools = await registry.listTools({ forceRefresh: true })
        return { ok: true, detail: `${tools.length} tools: ${tools.map((t) => t.name).join(', ')}` }
      }),

      // 5. Required env vars present.
      check('env', async () => {
        const required = ['NEXT_PUBLIC_PRIVY_APP_ID', 'PRIVY_APP_SECRET', 'DATABASE_URL']
        const missing = required.filter((k) => !process.env[k])
        if (missing.length) return { ok: false, error: `missing: ${missing.join(', ')}` }
        return { ok: true }
      }),
    ]),
  )

  const anyFailed = Object.values(results).some((r) => !r.ok)
  return NextResponse.json(
    {
      ok: !anyFailed,
      timestamp: new Date().toISOString(),
      checks: results,
    },
    { status: 200 },
  )
}
