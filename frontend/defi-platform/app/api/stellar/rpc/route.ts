/**
 * Same-origin Soroban RPC proxy.
 *
 * `lib/stellar-rpc.ts` puts this last in the browser's endpoint list. It earns
 * that place twice over:
 *
 * - **A throttled public endpoint stops being fatal.** A 429 from Cloudflare
 *   carries no `Access-Control-Allow-Origin` header, so the browser does not
 *   report a rate limit, it reports a CORS violation and hands the SDK a bare
 *   "Network Error". Reads fell to zero and a withdrawal could not be built.
 *   Our own origin cannot fail that way.
 *
 * - **One read serves everybody.** Exchange rates, oracle prices, pool
 *   liquidity and total borrows are the same question for every visitor, and
 *   until now every visitor asked it separately. Identical simulations are
 *   coalesced and briefly cached here, so a hundred people cost one request.
 *
 * It is also where a paid endpoint can be pointed without a rebuild:
 * `NEXT_PUBLIC_STELLAR_MAINNET_RPC_URL` is inlined at build time, while the
 * upstream list this route uses is read on the server at request time.
 */
import { NextRequest, NextResponse } from "next/server"
import { stellarRpcFetch } from "@/lib/stellar-rpc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * What the browser is allowed to ask through us. The app's own reads and its
 * transaction submissions, and nothing else: this route speaks with the
 * server's IP and its rate-limit budget, so it is not a general relay.
 */
const ALLOWED_METHODS = new Set([
  "getHealth",
  "getNetwork",
  "getVersionInfo",
  "getLatestLedger",
  "getFeeStats",
  "getLedgerEntries",
  "getEvents",
  "simulateTransaction",
  "sendTransaction",
  "getTransaction",
  "getTransactions",
])

/**
 * Only simulations are cached, and only for a few seconds.
 *
 * Everything else is excluded on purpose. `getLedgerEntries` backs
 * `getAccount`, and a stale sequence number builds a transaction the network
 * rejects. `getTransaction` is polled in a loop while waiting for a hash to
 * confirm, and `getLatestLedger` is polled to watch the ledger advance: a
 * cached answer to either is a poll that can never observe the thing it is
 * waiting for.
 *
 * A simulation is a pure function of ledger state, so within one window the
 * same request genuinely has the same answer.
 */
const CACHE_TTL_MS = 4_000
const CACHE_MAX_ENTRIES = 500

type CacheEntry = { at: number; body: string; status: number }
const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<{ body: string; status: number }>>()

function cacheKey(method: string, params: unknown): string {
  return `${method}:${JSON.stringify(params ?? null)}`
}

function readCache(key: string): CacheEntry | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return hit
}

function writeCache(key: string, entry: CacheEntry): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Oldest insertion first (Map preserves it), and every entry expires in
    // seconds anyway, so evicting the front is enough to bound the memory.
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  cache.set(key, entry)
}

async function forward(payload: unknown): Promise<{ body: string; status: number }> {
  const upstream = await stellarRpcFetch(payload)
  return { body: await upstream.text(), status: upstream.status }
}

export async function POST(request: NextRequest) {
  let payload: any
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // The SDK sends one request object; batches are not part of how we call it.
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Expected a single JSON-RPC request" }, { status: 400 })
  }

  const method = String(payload.method ?? "")
  if (!ALLOWED_METHODS.has(method)) {
    return NextResponse.json({ error: `Method not proxied: ${method || "(none)"}` }, { status: 400 })
  }

  const cacheable = method === "simulateTransaction"
  const key = cacheable ? cacheKey(method, payload.params) : ""

  try {
    if (cacheable) {
      const hit = readCache(key)
      if (hit) {
        return new NextResponse(hit.body, {
          status: hit.status,
          headers: { "content-type": "application/json", "x-peridot-rpc-cache": "hit" },
        })
      }
      // Coalesce the stampede a shared refresh window produces: the same
      // simulation asked by many visitors at once becomes one upstream call.
      let run = inFlight.get(key)
      if (!run) {
        run = forward(payload).finally(() => inFlight.delete(key))
        inFlight.set(key, run)
      }
      const result = await run
      if (result.status === 200) writeCache(key, { ...result, at: Date.now() })
      return new NextResponse(result.body, {
        status: result.status,
        headers: { "content-type": "application/json", "x-peridot-rpc-cache": "miss" },
      })
    }

    const result = await forward(payload)
    return new NextResponse(result.body, {
      status: result.status,
      headers: { "content-type": "application/json" },
    })
  } catch (err) {
    // Every upstream endpoint refused. Answer with a status the client's
    // fail-over reads as "this endpoint is unavailable" rather than as a
    // contract error, so it does not mistake an outage for an on-chain answer.
    console.error("[stellar-rpc-proxy] all endpoints failed:", err)
    return NextResponse.json(
      { error: "No Stellar RPC endpoint reachable" },
      { status: 503 },
    )
  }
}
