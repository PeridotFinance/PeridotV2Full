/**
 * Server-safe Stellar price reads.
 *
 * Extracted from `lib/stellar-soroban-lending.ts` so server routes
 * (verify endpoints, stats aggregations, backfill scripts) can resolve
 * an underlying-asset USD price without dragging in `@stellar/freighter-api`,
 * which is browser-only.
 *
 * The lending lib re-exports `stellarFetchPriceForSymbol` under the
 * existing name `stellarFetchPrice` for backwards compatibility with
 * client callers — see lib/stellar-soroban-lending.ts.
 */

import { getStellarRpcServer } from '@/lib/stellar-rpc'
import { stellarSorobanMainnetContracts } from '@/config/contracts'

/** Map our internal Stellar assetId conventions to oracle symbols. */
export function stellarAssetIdToOracleSymbol(assetId: string): string | null {
  if (assetId === 'xlm-stellar') return 'XLM'
  if (assetId === 'usdc-stellar') return 'USDC'
  if (assetId === 'eurc-stellar') return 'EURC'
  return null
}

/** Map an uppercase token symbol (XLM/USDC/EURC) to oracle symbol. */
export function stellarSymbolToOracleSymbol(symbol: string): string | null {
  const s = symbol?.toUpperCase()
  if (s === 'XLM' || s === 'USDC' || s === 'EURC') return s
  return null
}

function pow10(exp: number): bigint {
  let result = BigInt(1)
  for (let i = 0; i < Math.max(0, exp); i += 1) result *= BigInt(10)
  return result
}

/**
 * Price reads in flight, keyed by oracle symbol. The portfolio table, the
 * market metrics and the asset rows all ask for the same three prices at the
 * same moment; without this they were three separate simulations of the same
 * question. Dropped as soon as it settles, so it never serves a stale price.
 */
const priceReadsInFlight = new Map<string, Promise<number | null>>()

/**
 * The oracle's `decimals()` is contract metadata: it is the same on every call
 * and for every asset. It used to be read again on every single price lookup,
 * which doubled the price traffic for a constant.
 */
let oracleDecimals: Promise<number> | null = null

async function readOracleDecimals(
  StellarSdk: typeof import('@stellar/stellar-sdk'),
  rpc: any,
  contract: any,
  dummy: any,
): Promise<number> {
  try {
    const decTx = new StellarSdk.TransactionBuilder(dummy, {
      fee: '10000',
      networkPassphrase: stellarSorobanMainnetContracts.networkPassphrase,
    })
      .addOperation(contract.call('decimals'))
      .setTimeout(120)
      .build()
    const decSim = await rpc.simulateTransaction(decTx)
    if (StellarSdk.rpc.Api.isSimulationSuccess(decSim) && decSim.result?.retval) {
      const d = StellarSdk.scValToNative(decSim.result.retval)
      const n = typeof d === 'number' ? d : Number(d ?? 6)
      if (Number.isFinite(n) && n >= 0 && n <= 38) return n
    }
  } catch {
    /* fall through to the SEP-40 default */
  }
  // Don't pin a guess for the life of the process. Let the next price read
  // try again rather than living with a default we never confirmed.
  oracleDecimals = null
  return 6
}

/**
 * Read the current oracle price for an asset symbol via Soroban
 * `lastprice(Asset::Other(SYMBOL))`. Returns the price in USD per unit
 * (whole token, not stroops), or null if the read failed.
 *
 * This is identical in shape to the original `stellarFetchPrice` in
 * `stellar-soroban-lending.ts`, just driven by an oracle symbol instead
 * of our internal assetId. Safe to call from server routes.
 */
export async function stellarFetchPriceForSymbol(symbol: string): Promise<number | null> {
  const oracleSymbol = stellarSymbolToOracleSymbol(symbol)
  if (!oracleSymbol) return null
  const pending = priceReadsInFlight.get(oracleSymbol)
  if (pending) return pending
  const run = fetchPriceUncoalesced(oracleSymbol)
  priceReadsInFlight.set(oracleSymbol, run)
  try {
    return await run
  } finally {
    priceReadsInFlight.delete(oracleSymbol)
  }
}

async function fetchPriceUncoalesced(oracleSymbol: string): Promise<number | null> {
  try {
    const StellarSdk = await import('@stellar/stellar-sdk')
    const rpc = getStellarRpcServer(StellarSdk)
    const oracleId = stellarSorobanMainnetContracts.oracle
    // Dummy account is fine — simulate-only, never submitted.
    const dummy = new StellarSdk.Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0')
    const contract = new StellarSdk.Contract(oracleId)
    const assetScVal = StellarSdk.xdr.ScVal.scvVec([
      StellarSdk.xdr.ScVal.scvSymbol('Other'),
      StellarSdk.xdr.ScVal.scvSymbol(oracleSymbol),
    ])
    const op = contract.call('lastprice', assetScVal)
    const tx = new StellarSdk.TransactionBuilder(dummy, {
      fee: '10000',
      networkPassphrase: stellarSorobanMainnetContracts.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(120)
      .build()
    // One simulation, not a prepare (which simulates) plus a simulation of
    // what it assembled. The first response already carries the return value.
    const sim = await rpc.simulateTransaction(tx)
    if (!StellarSdk.rpc.Api.isSimulationSuccess(sim)) return null
    const retval = sim.result?.retval
    if (!retval) return null
    const native = StellarSdk.scValToNative(retval)
    if (!native || typeof native !== 'object' || !('price' in native)) return null
    const raw = (native as { price: bigint | number }).price
    const priceBig = typeof raw === 'bigint' ? raw : BigInt(String(raw ?? '0'))

    // Read once per process, not once per price. Default 6 (Reflector/SEP-40).
    if (!oracleDecimals) oracleDecimals = readOracleDecimals(StellarSdk, rpc, contract, dummy)
    const decimals = await oracleDecimals

    const scale = pow10(decimals)
    const integerPart = priceBig / scale
    const fractionalPart = priceBig % scale
    const price = Number(integerPart) + Number(fractionalPart) / Math.pow(10, decimals)
    return Number.isFinite(price) && price > 0 ? price : null
  } catch {
    return null
  }
}
