/**
 * Thin client for the SODAX Swaps HTTP API (https://api.sodax.com/v1/swaps).
 *
 * Server side only. The browser reaches SODAX through `/api/crosschain/*`,
 * which keeps api.sodax.com out of the CSP, gives us one place for logging, rate
 * limits and an API key once SODAX enforces one, and lets the relay cron keep a
 * transfer moving after the tab is gone (`lib/crosschain/poller.ts`).
 *
 * Deliberately not `@sodax/sdk`: the SDK pulls in the wallet stacks of every
 * chain SODAX serves (Injective, NEAR, Sui, PancakeSwap, a second
 * stellar-sdk …) and we only need five calls. The API builds the source-chain
 * transaction for us (EVM calldata, or a Soroban-prepared XDR when Stellar is
 * the source), so signing stays on the wallets we already have: wagmi for EVM,
 * `signStellarXdr` for Stellar.
 *
 * Flow: quote → deadline → (allowance/approve) → intents → sign + broadcast on
 * the source chain → wait for the receipt → submit-tx → poll submit-tx/status
 * until `solved` or `failed`.
 *
 * All amounts on the wire are decimal strings in the token's smallest unit.
 */

export const SODAX_API_BASE = "https://api.sodax.com/v1/swaps"

/** SODAX chain keys for the spokes this app can sign on. */
export const SODAX_CHAIN_KEYS = {
  stellar: "stellar",
  bsc: "0x38.bsc",
  base: "0x2105.base",
  arbitrum: "0xa4b1.arbitrum",
  ethereum: "ethereum",
  polygon: "0x89.polygon",
  avalanche: "0xa86a.avax",
  robinhood: "robinhood",
} as const

export type SodaxChainKey = (typeof SODAX_CHAIN_KEYS)[keyof typeof SODAX_CHAIN_KEYS]

/** EVM chain id → SODAX chain key, for the EVM spokes above. */
export const EVM_CHAIN_ID_TO_SODAX_KEY: Record<number, SodaxChainKey> = {
  56: SODAX_CHAIN_KEYS.bsc,
  8453: SODAX_CHAIN_KEYS.base,
  42161: SODAX_CHAIN_KEYS.arbitrum,
  1: SODAX_CHAIN_KEYS.ethereum,
  137: SODAX_CHAIN_KEYS.polygon,
  43114: SODAX_CHAIN_KEYS.avalanche,
  4663: SODAX_CHAIN_KEYS.robinhood,
}

export const SODAX_NATIVE_EVM_TOKEN = "0x0000000000000000000000000000000000000000"

export interface SodaxToken {
  symbol: string
  name?: string
  decimals: number
  address: string
}

export interface SodaxIntent {
  intentId: string
  creator: string
  inputToken: string
  outputToken: string
  inputAmount: string
  minOutputAmount: string
  deadline: string
  allowPartialFill: boolean
  srcChain: string
  dstChain: string
  srcAddress: string
  dstAddress: string
  solver: string
  data: string
}

/**
 * Unsigned source-chain transaction. For EVM `data` is calldata; for Stellar it
 * is the full prepared transaction envelope as base64 XDR (`to` is the SODAX
 * asset manager, `value` the amount).
 */
export interface SodaxRawTx {
  from: string
  to: string
  value: string
  data: string
}

export interface CreateIntentParams {
  srcChainKey: SodaxChainKey
  dstChainKey: SodaxChainKey
  inputToken: string
  outputToken: string
  inputAmount: string
  minOutputAmount: string
  deadline: string
  allowPartialFill: boolean
  srcAddress: string
  dstAddress: string
  partnerFee?: { address: string; percentage: number } | { address: string; amount: string }
}

export interface CreateIntentResponse {
  tx: SodaxRawTx
  intent: SodaxIntent
  relayData: { address: string; payload: string }
}

export type SubmitTxPipelineStatus =
  | "pending"
  | "relaying"
  | "relayed"
  | "posting_execution"
  | "posted_execution"
  | "solved"
  | "failed"

export interface SubmitTxStatus {
  txHash: string
  srcChainKey: string
  status: SubmitTxPipelineStatus
  failedAtStep?: string
  failureReason?: string
  processingAttempts: number
  abandonedAt?: string
  userMessage?: string
  intentCancelled?: boolean
  result?: {
    dstIntentTxHash: string
    intent_hash?: string
    fillTxHash?: string
  }
}

export class SodaxApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message)
    this.name = "SodaxApiError"
  }
}

/** A SODAX call that hangs must not hold a route handler or a cron pass open. */
const SODAX_TIMEOUT_MS = 15_000

async function call<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<T> {
  const res = await fetch(`${SODAX_API_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(SODAX_TIMEOUT_MS),
  })
  const text = await res.text()
  let body: unknown = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    /* keep the raw text */
  }
  if (!res.ok) {
    const msg =
      (body && typeof body === "object" && "message" in body && String((body as { message: unknown }).message)) ||
      `${res.status} ${res.statusText}`
    throw new SodaxApiError(`SODAX ${path}: ${msg}`, res.status, body)
  }
  return body as T
}

export function sodaxTokens(chainKey: SodaxChainKey): Promise<SodaxToken[]> {
  return call<SodaxToken[]>(`/tokens/${encodeURIComponent(chainKey)}`)
}

export async function sodaxQuote(req: {
  tokenSrc: string
  tokenSrcChainKey: SodaxChainKey
  tokenDst: string
  tokenDstChainKey: SodaxChainKey
  amount: string
}): Promise<bigint> {
  const res = await call<{ quotedAmount: string }>("/quote", {
    method: "POST",
    body: { ...req, quoteType: "exact_input" },
  })
  return BigInt(res.quotedAmount)
}

export async function sodaxDeadline(): Promise<string> {
  return (await call<{ deadline: string }>("/deadline")).deadline
}

export async function sodaxAllowanceValid(params: CreateIntentParams): Promise<boolean> {
  return (await call<{ valid: boolean }>("/allowance/check", { method: "POST", body: params })).valid
}

export function sodaxApprove(params: CreateIntentParams): Promise<{ tx: SodaxRawTx; resetTx?: SodaxRawTx }> {
  return call("/approve", { method: "POST", body: params })
}

export function sodaxCreateIntent(params: CreateIntentParams): Promise<CreateIntentResponse> {
  return call("/intents", { method: "POST", body: params })
}

/**
 * Hand the broadcast source tx to SODAX's relay pipeline. Idempotent on
 * `(txHash, srcChainKey)`, so retrying after a network blip is safe. The
 * Stellar tx hash goes in as plain hex (no 0x), which is what the SDK sends.
 */
export function sodaxSubmitTx(body: {
  txHash: string
  srcChainKey: SodaxChainKey
  walletAddress: string
  intent: SodaxIntent
  relayData: string
}): Promise<{ success: boolean; data: { status: "inserted" | "duplicate"; message: string } }> {
  return call("/submit-tx", { method: "POST", body })
}

export async function sodaxSubmitTxStatus(txHash: string, srcChainKey: SodaxChainKey): Promise<SubmitTxStatus> {
  const q = new URLSearchParams({ txHash, srcChainKey })
  return (await call<{ success: boolean; data: SubmitTxStatus }>(`/submit-tx/status?${q}`)).data
}

/** Solver status by hub intent tx hash: -1 not found · 1 not started · 2 in progress · 3 solved · 4 failed. */
export function sodaxIntentStatus(intentTxHash: string): Promise<{ status: -1 | 1 | 2 | 3 | 4; fillTxHash?: string }> {
  return call("/intents/status", { method: "POST", body: { intentTxHash } })
}

export const SODAX_SCAN_URL = "https://sodaxscan.com"
