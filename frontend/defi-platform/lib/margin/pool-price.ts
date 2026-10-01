/**
 * The XLM/USD price the margin desk actually TRADES at, read off the Aquarius
 * pool rather than a price feed.
 *
 * Every entry price in the journal is the price a swap filled at. Scoring those
 * entries against the Binance feed measures the gap between two markets instead
 * of what the trader did: on testnet the pool has sat ~9% away from spot
 * (scripts/margin-probe-execution-domain.mjs), and 9% of notional dwarfs the PnL
 * these positions are being ranked by. Worse, it is signed — it flatters every
 * Long and punishes every Short, or the reverse, depending on which way the pool
 * is leaning that day.
 *
 * ONE price, not one per position. A pool quote depends on size, so quoting each
 * position separately would score two traders holding identical positions
 * against different prices — the exact thing the challenge's shared mark exists
 * to prevent. So we quote a small reference size in both directions and take the
 * midpoint: the pool's price with its size impact deliberately left out, which
 * matches what the scorer already documents about itself (it ignores borrow
 * interest and the closing swap's slippage too).
 *
 * Server-only — simulates against the Soroban RPC.
 */
import * as S from "@stellar/stellar-sdk"
import { STELLAR_MARGIN_CONFIG as CFG } from "@/app/app/margin/config/stellarMarginConfig"

/** Reference size for the mid quote: 10 USDT, and its XLM leg at that quote.
 *  Built by multiplication rather than `**` — bigint exponentiation needs a
 *  higher tsconfig target than this project sets. */
const REFERENCE_USDT = BigInt(Math.round(10 * 10 ** CFG.assets.MOCK_USDT.decimals))

const XLM_IDX = CFG.aquarius.tokenOrder.indexOf("XLM")
const USDT_IDX = CFG.aquarius.tokenOrder.indexOf("MOCK_USDT")

/**
 * Local read-only simulation rather than the keeper's `simulateRead`: importing
 * that pulls in the keeper store and therefore a DB connection, which a price
 * quote has no business requiring (and which throws outright when DATABASE_URL
 * is unset).
 */
async function quote(inIdx: number, outIdx: number, amountIn: bigint): Promise<bigint> {
  const rpc = new S.rpc.Server(CFG.network.rpcUrl)
  const dummy = new S.Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0")
  const tx = new S.TransactionBuilder(dummy, { fee: "10000", networkPassphrase: CFG.network.networkPassphrase })
    .addOperation(
      new S.Contract(CFG.contracts.swapAdapter).call(
        "estimate_pool_swap",
        S.Address.fromString(CFG.aquarius.pool).toScVal(),
        S.xdr.ScVal.scvU32(inIdx),
        S.xdr.ScVal.scvU32(outIdx),
        S.nativeToScVal(String(amountIn), { type: "u128" }),
      ),
    )
    .setTimeout(120)
    .build()
  const sim = await rpc.simulateTransaction(await rpc.prepareTransaction(tx))
  if (!S.rpc.Api.isSimulationSuccess(sim)) throw new Error("estimate_pool_swap failed")
  return BigInt(String(S.scValToNative(sim.result!.retval)))
}

/**
 * Mid price of the pool in USD per XLM, or null when the pool can't be read.
 *
 * Null is a real answer: the caller (challenge scoring) treats a missing mark as
 * "no unrealized PnL this pass", which is better than substituting a feed price
 * that would silently reintroduce the very gap this exists to remove.
 */
export async function fetchXlmPoolMid(): Promise<number | null> {
  try {
    const usdtDec = 10 ** CFG.assets.MOCK_USDT.decimals
    const xlmDec = 10 ** CFG.assets.XLM.decimals

    // Ask: what 10 USDT buys in XLM. Bid: selling that XLM straight back.
    const xlmOut = await quote(USDT_IDX, XLM_IDX, REFERENCE_USDT)
    if (xlmOut <= BigInt(0)) return null
    const usdtBack = await quote(XLM_IDX, USDT_IDX, xlmOut)
    if (usdtBack <= BigInt(0)) return null

    const ask = Number(REFERENCE_USDT) / usdtDec / (Number(xlmOut) / xlmDec)
    const bid = Number(usdtBack) / usdtDec / (Number(xlmOut) / xlmDec)
    const mid = (ask + bid) / 2
    return Number.isFinite(mid) && mid > 0 ? mid : null
  } catch {
    return null
  }
}
