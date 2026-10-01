/**
 * Read client for Robinhood Chain (4663).
 *
 * One memoised viem public client per process, with Multicall3 batching on
 * (the canonical Multicall3 is deployed there; the chain definition names it).
 * Every read in lib/robinhood/reads.ts takes a client argument, so a test can
 * hand in a stub and the server crons can build their own; this module is the
 * default the hooks use.
 *
 * Transport order in the browser: the configured RPC first (a paid endpoint
 * via NEXT_PUBLIC_RPC_ROBINHOOD_MAINNET, else the public one), then the
 * same-origin proxy last. The proxy exists for the same reason the Stellar
 * one does: nginx's CSP has to list every upstream, and a throttled public
 * endpoint answers 429 without CORS headers, which the browser reports as a
 * network error. Our own origin cannot fail either way. On the server the
 * proxy is left out; it would only call itself.
 */
import { createPublicClient, fallback, http, type Chain, type PublicClient } from "viem"
import { getRobinhoodRpcUrls, ROBINHOOD_RPC_PROXY_PATH, robinhoodMainnet } from "@/config/robinhood"

export type RobinhoodReadClient = PublicClient

let cached: RobinhoodReadClient | null = null

function transportUrls(): string[] {
  const urls = getRobinhoodRpcUrls()
  if (typeof window !== "undefined") urls.push(ROBINHOOD_RPC_PROXY_PATH)
  return urls
}

export function getRobinhoodPublicClient(): RobinhoodReadClient {
  if (cached) return cached
  const transports = transportUrls().map((url) =>
    http(url, { batch: { batchSize: 50, wait: 16 }, timeout: 15_000, retryCount: 1 }),
  )
  // The `as const` chain literal sends viem's generics into a type-depth
  // error; the runtime shape is the same as any other Chain.
  const chain = robinhoodMainnet as unknown as Chain
  const params: Parameters<typeof createPublicClient>[0] = {
    chain,
    transport: transports.length === 1 ? transports[0] : fallback(transports, { rank: false }),
    batch: { multicall: { batchSize: 2_048, wait: 16 } },
  }
  cached = createPublicClient(params) as unknown as RobinhoodReadClient
  return cached
}

/** Tests and hot-reload only. */
export function resetRobinhoodPublicClient(): void {
  cached = null
}
