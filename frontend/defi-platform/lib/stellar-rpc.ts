/**
 * Soroban RPC with fail-over, back-pressure and a same-origin escape hatch.
 *
 * Every Stellar read in the app used to build `new rpc.Server(rpcUrl)` against
 * one endpoint, and most of them swallow errors into "0". When that endpoint
 * was a rate-capped Alchemy key that hit its monthly limit, a wallet holding
 * 601 USDC showed no USDC at all: the 429 became a zero balance, silently, on
 * every surface at once. This helper hands out a Server-shaped object whose
 * calls move to the next endpoint when one fails at the transport level, and
 * remember a dead endpoint for a while so the next read does not pay for it.
 *
 * Contract-level failures (a simulation that panics, a missing account) are
 * NOT transport failures and are re-thrown unchanged; another endpoint would
 * only repeat them.
 *
 * Three things beyond plain fail-over, each paid for by an outage:
 *
 * 1. **Back-pressure.** The portfolio and market hooks fan out across markets
 *    with `Promise.all`, so a single refresh used to hit the network with
 *    dozens of simultaneous POSTs. Public endpoints answer a burst like that
 *    with 429, and a 429 from Cloudflare carries no `Access-Control-Allow-Origin`
 *    header, so the browser reports it as a CORS error and the read dies with
 *    "Network Error". Calls now queue through a small semaphore instead.
 *
 * 2. **Graded cool-offs.** Being throttled is not being dead. A 429 parks an
 *    endpoint for seconds; a rejected key parks it for minutes. Parking the
 *    primary for five minutes over one burst is what pushed every read onto
 *    the weakest fallback (onfinality allows 1 request/second) and took the
 *    whole app down with it.
 *
 * 3. **A same-origin last resort.** In the browser the list ends with our own
 *    `/api/stellar/rpc`, which proxies to the same public endpoints from the
 *    server. Same-origin means no CORS answer can ever be the thing that
 *    breaks a withdrawal, and the proxy's shared cache lets one upstream read
 *    serve every visitor asking the same question.
 */
import { stellarSorobanMainnetContracts } from "@/config/contracts"

type ServerCtor = new (url: string, opts?: Record<string, unknown>) => any
interface SdkLike {
  rpc: { Server: ServerCtor }
}

/** Same-origin proxy route. Browser-only: on the server it would be itself. */
export const STELLAR_RPC_PROXY_PATH = "/api/stellar/rpc"

/**
 * How long an endpoint stays out of the rotation, by what it did to us.
 * Throttling is transient by definition and must expire fast, or one burst
 * costs the primary for minutes. A rejected credential will not fix itself.
 */
const COOLDOWN_MS = {
  throttled: 20_000,
  unavailable: 60_000,
  rejected: 10 * 60_000,
} as const
type FailureKind = keyof typeof COOLDOWN_MS

const downUntil = new Map<string, number>()

/**
 * Simultaneous requests allowed across all endpoints. The browser value is
 * deliberately low: it is a per-user budget against shared public endpoints,
 * and a queued read is far cheaper than a 429 that a five-minute cool-off
 * turns into a blank portfolio. Server jobs (TVL, keepers, backfills) own the
 * machine's IP and can push harder.
 */
const MAX_IN_FLIGHT = typeof window === "undefined" ? 12 : 4

let inFlight = 0
const waiting: Array<() => void> = []

async function acquireSlot(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight += 1
    return
  }
  // The slot is handed over on release, so `inFlight` already counts us.
  await new Promise<void>((resolve) => waiting.push(resolve))
}

function releaseSlot(): void {
  const next = waiting.shift()
  if (next) next()
  else inFlight -= 1
}

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquireSlot()
  try {
    return await fn()
  } finally {
    releaseSlot()
  }
}

/** Primary first, then the fallbacks, then our own origin. De-duplicated. */
export function stellarRpcUrls(): string[] {
  const c = stellarSorobanMainnetContracts
  const urls = [c.rpcUrl, ...(c.rpcFallbackUrls ?? [])].filter(Boolean)
  // Last, not first: the public endpoints are closer to the user and cost us
  // nothing. The proxy is what is left when they throttle.
  if (typeof window !== "undefined" && window.location?.origin) {
    urls.push(new URL(STELLAR_RPC_PROXY_PATH, window.location.origin).toString())
  }
  return Array.from(new Set(urls))
}

/** Endpoints ordered by health: cooled-down ones last, never dropped. */
export function orderedStellarRpcUrls(): string[] {
  const now = Date.now()
  const urls = stellarRpcUrls()
  const up = urls.filter((u) => (downUntil.get(u) ?? 0) <= now)
  const down = urls.filter((u) => (downUntil.get(u) ?? 0) > now)
  return [...up, ...down]
}

export function markStellarRpcDown(url: string, reason?: string, kind: FailureKind = "unavailable"): void {
  const ms = COOLDOWN_MS[kind]
  downUntil.set(url, Date.now() + ms)
  console.warn(`[stellar-rpc] ${url} ${kind}, out for ${ms / 1000}s${reason ? `: ${reason.slice(0, 160)}` : ""}`)
}

function statusOf(err: unknown): number | undefined {
  const s =
    (err as { response?: { status?: number } })?.response?.status ??
    (err as { status?: number })?.status
  return typeof s === "number" ? s : undefined
}

/**
 * How the endpoint failed us, or null when it did not, meaning the network
 * answered a question we asked and we did not like the answer.
 */
export function classifyStellarRpcFailure(err: unknown): FailureKind | null {
  const status = statusOf(err)
  if (status === 429) return "throttled"
  if (status === 401 || status === 403) return "rejected"
  if (typeof status === "number" && status >= 500) return "unavailable"

  const msg = err instanceof Error ? err.message : String(err ?? "")
  if (/\b429\b|rate.?limit|too many requests|capacity/i.test(msg)) return "throttled"
  if (/\b(401|403)\b/.test(msg)) return "rejected"
  if (
    /\b5\d\d\b|failed to fetch|fetch failed|network ?error|ECONN|ETIMEDOUT|ENOTFOUND|timed? ?out|bad gateway|service unavailable|unexpected token|not valid json/i.test(
      msg,
    )
  ) {
    return "unavailable"
  }
  return null
}

/**
 * Transport-level failure: the endpoint itself is unavailable, capped or
 * broken. Anything else is the network answering a question we asked.
 */
export function isStellarRpcEndpointFailure(err: unknown): boolean {
  return classifyStellarRpcFailure(err) !== null
}

const servers = new WeakMap<SdkLike, Map<string, any>>()

function serverFor(S: SdkLike, url: string): any {
  let byUrl = servers.get(S)
  if (!byUrl) {
    byUrl = new Map()
    servers.set(S, byUrl)
  }
  let s = byUrl.get(url)
  if (!s) {
    // The SDK refuses a plain-http endpoint unless told otherwise, which the
    // same-origin proxy is on a local dev server.
    s = new S.rpc.Server(url, { allowHttp: url.startsWith("http://") })
    byUrl.set(url, s)
  }
  return s
}

/**
 * A `rpc.Server` stand-in. Method calls run against the healthiest endpoint
 * and fail over on transport errors; non-function properties (`serverURL`)
 * come from the primary.
 */
export function getStellarRpcServer(S: SdkLike): any {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        const primary = serverFor(S, stellarRpcUrls()[0])
        const value = primary[prop as string]
        if (typeof value !== "function") return value
        return async (...args: unknown[]) => {
          let lastError: unknown
          for (const url of orderedStellarRpcUrls()) {
            const server = serverFor(S, url)
            try {
              return await withSlot(() => server[prop as string](...args))
            } catch (err) {
              const kind = classifyStellarRpcFailure(err)
              if (!kind) throw err
              lastError = err
              markStellarRpcDown(url, err instanceof Error ? err.message : String(err), kind)
            }
          }
          throw lastError ?? new Error("No Stellar RPC endpoint reachable")
        }
      },
    },
  )
}

/**
 * Raw JSON-RPC POST with the same fail-over, for callers that speak to the
 * endpoint without the SDK.
 */
export async function stellarRpcFetch(body: unknown, init?: RequestInit): Promise<Response> {
  let lastError: unknown
  for (const url of orderedStellarRpcUrls()) {
    try {
      const res = await withSlot(() =>
        fetch(url, {
          method: "POST",
          ...init,
          headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
          body: JSON.stringify(body),
        }),
      )
      const kind = classifyStellarRpcFailure({ status: res.status })
      if (kind) {
        markStellarRpcDown(url, `HTTP ${res.status}`, kind)
        lastError = new Error(`Stellar RPC ${url} answered ${res.status}`)
        continue
      }
      return res
    } catch (err) {
      lastError = err
      markStellarRpcDown(url, err instanceof Error ? err.message : String(err), classifyStellarRpcFailure(err) ?? "unavailable")
    }
  }
  throw lastError ?? new Error("No Stellar RPC endpoint reachable")
}
