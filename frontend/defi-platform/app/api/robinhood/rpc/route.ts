/**
 * Same-origin JSON-RPC proxy for Robinhood Chain (4663).
 *
 * `lib/robinhood/client.ts` puts this last in the browser's transport list,
 * for the reasons the Stellar proxy exists: nginx's CSP has to name every
 * upstream the browser talks to, and a throttled public endpoint answers 429
 * without CORS headers, which the browser reports as a bare network error.
 * Our own origin cannot fail either way, so a read degrades to a slower read
 * instead of no read.
 *
 * Read methods only. Transactions go through the wallet's own provider, and
 * a relay that signs nothing has no business forwarding `eth_sendRawTransaction`
 * with the server's IP and rate budget. Batches are accepted because viem's
 * http transport sends them; every element is checked against the allow list.
 */
import { NextRequest, NextResponse } from "next/server"
import { getRobinhoodRpcUrls } from "@/config/robinhood"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALLOWED_METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_getLogs",
  "eth_getCode",
  "eth_getBalance",
  "eth_getBlockByNumber",
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
])

const MAX_BATCH = 64
const UPSTREAM_TIMEOUT_MS = 15_000

function methodOf(entry: unknown): string {
  return entry && typeof entry === "object" ? String((entry as { method?: unknown }).method ?? "") : ""
}

async function forward(payload: unknown): Promise<Response> {
  let lastError: unknown = null
  for (const url of getRobinhoodRpcUrls()) {
    try {
      const upstream = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        cache: "no-store",
      })
      // A 429 or 5xx here means "try the next upstream"; a 200 with a
      // JSON-RPC error inside is a real answer and goes back as is.
      if (upstream.status === 429 || upstream.status >= 500) {
        lastError = new Error(`${url} answered ${upstream.status}`)
        continue
      }
      return upstream
    } catch (err) {
      lastError = err
    }
  }
  throw lastError ?? new Error("no upstream")
}

export async function POST(request: NextRequest) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const entries = Array.isArray(payload) ? payload : [payload]
  if (entries.length === 0 || entries.length > MAX_BATCH) {
    return NextResponse.json({ error: `Batch size must be 1..${MAX_BATCH}` }, { status: 400 })
  }
  for (const entry of entries) {
    const method = methodOf(entry)
    if (!ALLOWED_METHODS.has(method)) {
      return NextResponse.json({ error: `Method not proxied: ${method || "(none)"}` }, { status: 400 })
    }
  }

  try {
    const upstream = await forward(payload)
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    })
  } catch (err) {
    console.error("[robinhood-rpc-proxy] all endpoints failed:", err)
    return NextResponse.json({ error: "No Robinhood RPC endpoint reachable" }, { status: 503 })
  }
}
