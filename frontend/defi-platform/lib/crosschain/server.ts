/**
 * The server half of the cross-chain engine: what the `/api/crosschain/*`
 * routes and the relay cron share.
 *
 *   - `offeredTokens`: SODAX's token list per chain, cached, filtered to what
 *     the app offers (`lib/crosschain/route.ts`).
 *   - `prepareLeg`: validate a requested leg, quote it here (never trusting a
 *     client's minimum), value it in dollars, apply the limits, and build the
 *     intent parameters. The approve route and the intent route both call it, so
 *     the allowance is checked for exactly the transfer that will be built.
 *   - `advanceSodaxTransfer`: move one row as far as SODAX says it can go. The
 *     status route calls it for the tab that is watching, the cron for the tab
 *     that is gone.
 *
 * Signing never happens here. The server holds no key for either chain.
 */
import { getAddress, parseUnits } from "viem"
import {
  sodaxCreateIntent,
  sodaxDeadline,
  sodaxQuote,
  sodaxSubmitTx,
  sodaxSubmitTxStatus,
  sodaxTokens,
  SodaxApiError,
  type CreateIntentParams,
  type SodaxChainKey,
  type SodaxIntent,
  type SodaxToken,
} from "@/lib/crosschain/sodax"
import {
  chooseRail,
  directionOf,
  isOfferedToken,
  isStellar,
  minOutFor,
  sodaxKeyFor,
  XC_DEFAULT_SLIPPAGE_BPS,
  type XcChain,
  type XcDirection,
} from "@/lib/crosschain/route"
import { checkAmountUsd, stableSideUsd } from "@/lib/crosschain/preflight"
import { describeSodaxFailure, xcError, type XcError } from "@/lib/crosschain/errors"
import {
  markExpired,
  markRelaying,
  markSodaxFailed,
  markSolved,
  recordRelayAttempt,
  recordSodaxStatus,
  type SodaxTransfer,
} from "@/lib/cctp/store"

/** A request the engine refuses, with the copy to show. */
export class XcRequestError extends Error {
  constructor(readonly error: XcError, readonly httpStatus = 400) {
    super(error.message)
    this.name = "XcRequestError"
  }
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

const TOKEN_TTL_MS = 10 * 60_000
const tokenCache = new Map<SodaxChainKey, { at: number; tokens: SodaxToken[] }>()

/** SODAX's tokens for `chain` that the app offers. Cached per process for 10 minutes. */
export async function offeredTokens(chain: XcChain): Promise<SodaxToken[]> {
  const key = sodaxKeyFor(chain)
  if (!key) return []
  const hit = tokenCache.get(key)
  if (hit && Date.now() - hit.at < TOKEN_TTL_MS) return hit.tokens
  try {
    const tokens = (await sodaxTokens(key)).filter((t) => isOfferedToken(chain, t))
    tokenCache.set(key, { at: Date.now(), tokens })
    return tokens
  } catch (e) {
    // A stale list beats none: token addresses do not change between calls.
    if (hit) return hit.tokens
    throw e
  }
}

export async function findOfferedToken(chain: XcChain, address: string): Promise<SodaxToken | null> {
  const tokens = await offeredTokens(chain)
  const want = isStellar(chain) ? address : address.toLowerCase()
  return tokens.find((t) => (isStellar(chain) ? t.address : t.address.toLowerCase()) === want) ?? null
}

// ─── Prices ──────────────────────────────────────────────────────────────────

/**
 * Units of a token quoted to price it. One ETH, BNB or AVAX clears SODAX's $5
 * floor; one POL does not.
 */
const PRICE_PROBE_UNITS: Record<string, number> = { POL: 100, XLM: 100 }
const PRICE_TTL_MS = 5 * 60_000
const priceCache = new Map<string, { at: number; usd: number }>()

/**
 * A reference USDC on the far side of Stellar, to price anything through the
 * route that would actually carry it: Stellar USDC for EVM tokens, Base USDC
 * for Stellar tokens.
 */
async function referenceUsdc(from: XcChain): Promise<{ chain: XcChain; token: SodaxToken } | null> {
  const chain: XcChain = isStellar(from) ? 8453 : "stellar"
  const token = (await offeredTokens(chain)).find((t) => t.symbol === "USDC")
  return token ? { chain, token } : null
}

/** Dollar price of one whole `token`, as SODAX would pay it out in USDC. Null when unknown. */
export async function usdPrice(chain: XcChain, token: SodaxToken): Promise<number | null> {
  const cacheKey = `${String(chain)}:${token.address}`
  const hit = priceCache.get(cacheKey)
  if (hit && Date.now() - hit.at < PRICE_TTL_MS) return hit.usd
  const ref = await referenceUsdc(chain)
  const srcKey = sodaxKeyFor(chain)
  const dstKey = ref && sodaxKeyFor(ref.chain)
  if (!ref || !srcKey || !dstKey) return null
  const units = PRICE_PROBE_UNITS[token.symbol] ?? 1
  try {
    const out = await sodaxQuote({
      tokenSrc: token.address,
      tokenSrcChainKey: srcKey,
      tokenDst: ref.token.address,
      tokenDstChainKey: dstKey,
      amount: parseUnits(String(units), token.decimals).toString(),
    })
    const usd = Number(out) / 10 ** ref.token.decimals / units
    priceCache.set(cacheKey, { at: Date.now(), usd })
    return usd
  } catch {
    return hit?.usd ?? null
  }
}

function toWhole(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals
}

// ─── Legs ────────────────────────────────────────────────────────────────────

export interface QuoteRequest {
  src: XcChain
  dst: XcChain
  srcToken: string
  dstToken: string
  /** Smallest unit of the source token, as a decimal string. */
  amount: string
  slippageBps?: number
}

export interface LegRequest extends QuoteRequest {
  stellarAddress: string
  /** The EVM wallet: source for "in", recipient for "out". */
  evmAddress: string
}

export interface QuotedLeg {
  direction: XcDirection
  srcToken: SodaxToken
  dstToken: SodaxToken
  srcAmount: bigint
  quotedOut: bigint
  minOut: bigint
  /** Dollar value of the transfer; null when nothing could price it. */
  usd: number | null
  /** The cap this breaks, if any. The quote still answers so the UI can say so. */
  limit: XcError | null
}

export interface PreparedLeg extends QuotedLeg {
  params: CreateIntentParams
  deadlineAt: Date | null
}

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

/**
 * Validate a leg and quote it. Throws `XcRequestError` for a leg the app does
 * not offer; lets SODAX errors through for the caller to classify ("Input
 * amount too low" and "No path was found" arrive from the quote).
 */
export async function quoteLeg(req: QuoteRequest): Promise<QuotedLeg> {
  const direction = directionOf(req.src, req.dst)
  const srcKey = sodaxKeyFor(req.src)
  const dstKey = sodaxKeyFor(req.dst)
  if (!direction || !srcKey || !dstKey) throw new XcRequestError(xcError("unsupported"))
  let srcAmount: bigint
  try {
    srcAmount = BigInt(req.amount)
  } catch {
    throw new XcRequestError(xcError("unsupported", "The amount is not a number."))
  }
  if (srcAmount <= BigInt(0)) throw new XcRequestError(xcError("unsupported", "The amount has to be above zero."))

  const [srcToken, dstToken] = await Promise.all([
    findOfferedToken(req.src, req.srcToken),
    findOfferedToken(req.dst, req.dstToken),
  ])
  if (!srcToken || !dstToken) throw new XcRequestError(xcError("unsupported"))
  const rail = chooseRail({ src: req.src, dst: req.dst, srcSymbol: srcToken.symbol, dstSymbol: dstToken.symbol })
  if (rail.rail !== "sodax") throw new XcRequestError(xcError("unsupported", rail.reason))

  const quotedOut = await sodaxQuote({
    tokenSrc: srcToken.address,
    tokenSrcChainKey: srcKey,
    tokenDst: dstToken.address,
    tokenDstChainKey: dstKey,
    amount: srcAmount.toString(),
  })
  const minOut = minOutFor(quotedOut, req.slippageBps ?? XC_DEFAULT_SLIPPAGE_BPS)

  let usd = stableSideUsd({
    srcSymbol: srcToken.symbol,
    srcAmount: toWhole(srcAmount, srcToken.decimals),
    dstSymbol: dstToken.symbol,
    quotedOut: toWhole(quotedOut, dstToken.decimals),
  })
  if (usd == null) {
    const price = await usdPrice(req.src, srcToken)
    usd = price == null ? null : price * toWhole(srcAmount, srcToken.decimals)
  }
  // Only the cap comes from our own valuation: the floor is SODAX's, and it
  // already refused the quote above if the amount was under it.
  const limit = checkAmountUsd(usd)
  return { direction, srcToken, dstToken, srcAmount, quotedOut, minOut, usd, limit: limit?.code === "over_cap" ? limit : null }
}

/** `quoteLeg` plus the intent parameters. Refuses a leg over the cap. */
export async function prepareLeg(req: LegRequest): Promise<PreparedLeg> {
  if (!STELLAR_ADDRESS_RE.test(req.stellarAddress) || !EVM_ADDRESS_RE.test(req.evmAddress)) {
    throw new XcRequestError(xcError("unsupported", "A wallet address is missing or malformed."))
  }
  const quoted = await quoteLeg(req)
  if (quoted.limit) throw new XcRequestError(quoted.limit)

  const evm = getAddress(req.evmAddress)
  const deadline = await sodaxDeadline()
  const params: CreateIntentParams = {
    srcChainKey: sodaxKeyFor(req.src)!,
    dstChainKey: sodaxKeyFor(req.dst)!,
    inputToken: quoted.srcToken.address,
    outputToken: quoted.dstToken.address,
    inputAmount: quoted.srcAmount.toString(),
    minOutputAmount: quoted.minOut.toString(),
    deadline,
    allowPartialFill: false,
    srcAddress: quoted.direction === "in" ? evm : req.stellarAddress,
    dstAddress: quoted.direction === "in" ? req.stellarAddress : evm,
  }
  const deadlineSec = Number(deadline)
  return { ...quoted, params, deadlineAt: deadlineSec > 0 ? new Date(deadlineSec * 1000) : null }
}

export async function createIntent(leg: PreparedLeg) {
  return sodaxCreateIntent(leg.params)
}

// ─── Advancing a row ─────────────────────────────────────────────────────────

/** A created row with no hash this long after its deadline has expired. */
const EXPIRE_GRACE_MS = 15 * 60_000
/** Without a confirmation from the tab, the cron hands a hash to the relay after this. */
const HANDOVER_AFTER_MS = 60_000
/** A hash the relay would not take for this long is given up on. */
const HANDOVER_GIVE_UP_MS = 24 * 60 * 60_000
/** A relayed transfer not settled after this is failed for a human to look at. */
const SETTLE_GIVE_UP_MS = 3 * 24 * 60 * 60_000

function chainOf(row: Pick<SodaxTransfer, "src_chain">): XcChain {
  return row.src_chain === "stellar" ? "stellar" : Number(row.src_chain)
}

function srcKeyOf(row: SodaxTransfer): SodaxChainKey {
  const key = sodaxKeyFor(chainOf(row))
  if (!key) throw new Error(`transfer ${row.id}: no SODAX key for chain ${row.src_chain}`)
  return key
}

function walletOf(row: SodaxTransfer): string {
  return row.direction === "in" ? getAddress(row.evm_address) : row.stellar_address
}

/** Where the money sits when SODAX cancels an intent: the wallet it came from. */
function sourceWalletLabel(row: SodaxTransfer): string {
  return row.direction === "in" ? "your wallet on the network you sent from" : "your Stellar wallet"
}

/**
 * Hand the source tx to SODAX's relay. Idempotent on SODAX's side
 * (`inserted` or `duplicate`), so the tab and the cron may both do it.
 */
export async function handToRelay(row: SodaxTransfer): Promise<SodaxTransfer> {
  if (row.status !== "submitted" || !row.src_tx_hash) return row
  try {
    await sodaxSubmitTx({
      txHash: row.src_tx_hash,
      srcChainKey: srcKeyOf(row),
      walletAddress: walletOf(row),
      intent: row.sodax_intent as unknown as SodaxIntent,
      relayData: row.sodax_relay_data,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await recordRelayAttempt(row.id, message)
    if (Date.now() - new Date(row.created_at).getTime() > HANDOVER_GIVE_UP_MS) {
      return (
        (await markSodaxFailed(
          row.id,
          "The relay never accepted this transaction. If it left your wallet, support can recover it.",
        )) ?? row
      )
    }
    return row
  }
  return (await markRelaying(row.id, "pending")) ?? row
}

export interface AdvanceOptions {
  /** The tab saw the source tx confirmed: hand it over now instead of waiting. */
  confirmed?: boolean
  now?: number
}

/**
 * One step for one row, as far as SODAX says it can go. Never throws for a
 * SODAX hiccup: the row stays where it is and the next call tries again.
 */
export async function advanceSodaxTransfer(row: SodaxTransfer, opts: AdvanceOptions = {}): Promise<SodaxTransfer> {
  const now = opts.now ?? Date.now()

  if (row.status === "created") {
    const deadline = row.deadline_at ? new Date(row.deadline_at).getTime() : null
    if (!row.src_tx_hash && deadline != null && now > deadline + EXPIRE_GRACE_MS) {
      return (await markExpired(row.id)) ?? row
    }
    return row
  }

  if (row.status === "submitted") {
    const waited = now - new Date(row.updated_at).getTime()
    if (!opts.confirmed && waited < HANDOVER_AFTER_MS) return row
    return handToRelay(row)
  }

  if (row.status !== "relaying" || !row.src_tx_hash) return row

  let s
  try {
    s = await sodaxSubmitTxStatus(row.src_tx_hash, srcKeyOf(row))
  } catch (e) {
    // SODAX lost track of it (or never stored it): hand it over again, which
    // is idempotent, rather than wait on a row it does not know.
    if (e instanceof SodaxApiError && e.status === 404) {
      await sodaxSubmitTx({
        txHash: row.src_tx_hash,
        srcChainKey: srcKeyOf(row),
        walletAddress: walletOf(row),
        intent: row.sodax_intent as unknown as SodaxIntent,
        relayData: row.sodax_relay_data,
      }).catch(() => null)
    }
    return row
  }

  if (s.status === "solved") {
    return (
      (await markSolved(row.id, {
        fillTxHash: s.result?.fillTxHash ?? null,
        intentHash: s.result?.intent_hash ?? s.result?.dstIntentTxHash ?? null,
      })) ?? row
    )
  }
  if (s.status === "failed") {
    return (
      (await markSodaxFailed(row.id, describeSodaxFailure(s, sourceWalletLabel(row)), s.intentCancelled ?? null)) ??
      row
    )
  }
  if (now - new Date(row.created_at).getTime() > SETTLE_GIVE_UP_MS) {
    return (
      (await markSodaxFailed(
        row.id,
        `Not settled after 3 days (last step: ${s.status}). Support has the details.`,
      )) ?? row
    )
  }
  return (await recordSodaxStatus(row.id, s.status, s.result?.intent_hash ?? s.result?.dstIntentTxHash ?? null)) ?? row
}
