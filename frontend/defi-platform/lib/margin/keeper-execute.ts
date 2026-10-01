/**
 * Server keeper executor for the always-on margin TP/SL (Path A).
 *
 * For each armed row it: fetches the live XLM/USD spot, evaluates the row's TP/SL
 * trigger, and — when it crosses — closes the position for the user with signatures
 * the USER pre-signed (Privy raw-hash + authorizeEntry). The keeper account only
 * signs the tx ENVELOPE (pays fees + is the source); the contract's
 * `require_auth(user)` is satisfied by the pre-signed entries riding in each
 * operation.
 *
 * The close is the V3 split close, driven leg by leg:
 *
 *   prepare_close_position_v3(user, id)       pre-signed (fixed args)
 *   swap_close_position_v3(user, id, min_out) pre-signed LADDER — see below
 *   finish_close_position_v3(id)              permissionless, keeper signs alone
 *
 * The swap leg is why this took a rebuild. `min_out` is only accepted inside
 * [oracle floor, pool output]: one unit below the floor and the contract traps,
 * one percent above the pool quote and it reverts with Error(Contract, #2006).
 * That window is roughly 2% wide and slides with the price, so no single value
 * signed at arm time stays valid. Instead the user signs a ladder of candidates
 * (±6% around the arm-time floor, 1% apart) and the keeper submits the one rung
 * that lands inside the live window. Unused rungs are never submitted and expire
 * with the rest of the arm.
 *
 * Two entry points have been retired underneath this file, and both times the
 * fix was the same: an auth entry authorizes ONE exact call, so an arm holding
 * entries for a call the keeper no longer makes cannot fire, and must be retired
 * loudly rather than left to fail at fire time. First
 * `close_position_v2_repay_only`, which trapped on the V3 controller for every
 * position. Then, in the 2026-08-31 upgrade, the begin+withdraw
 * pair — folded into one `prepare_close_position_v3`, which also removes the
 * ~2-ledger window those two had to share.
 *
 * Server-only. Driven by the token-gated /api/margin/keeper/run route, which the
 * cron polls on an interval.
 */
import * as S from "@stellar/stellar-sdk"
import { STELLAR_MARGIN_CONFIG as CFG, SIDE_MAPPING } from "@/app/app/margin/config/stellarMarginConfig"
import { evaluateTpSlTrigger, executionExitPrice } from "@/app/app/margin/lib/marginMath"
import { formatArmReason } from "@/app/app/margin/lib/keeperArmStatus"
import { recordMarginTrade } from "@/lib/margin-journal"
import {
  listArmedRows,
  expireStaleArms,
  expireArmWithReason,
  markArmFired,
  markArmFailed,
  noteArmBlocked,
  clearArmBlocked,
  readSwapRungs,
  type KeeperArmRow,
} from "./keeper-store"

const RPC = CFG.network.rpcUrl
const PASS = CFG.network.networkPassphrase
const CONTROLLER = CFG.contracts.marginController

function server(): S.rpc.Server {
  return new S.rpc.Server(RPC)
}

/**
 * Contract address a pre-signed auth entry is bound to, or null if undecodable.
 * A pre-signed entry authorizes ONE exact invocation (contract + fn + args), so
 * after a controller migration (V2 → V3 redeploy) every arm signed against the
 * old address is dead weight: submitting it can only fail. We detect and expire
 * those instead of burning attempts on them.
 */
function authEntryContract(signedAuthEntryB64: string): string | null {
  try {
    const entry = S.xdr.SorobanAuthorizationEntry.fromXDR(signedAuthEntryB64, "base64")
    const fn = entry.rootInvocation().function()
    return S.Address.fromScAddress(fn.contractFn().contractAddress()).toString()
  } catch {
    return null
  }
}

/**
 * Current ledger sequence, memoised for a few seconds.
 *
 * The UI needs it to turn `valid_until_ledger` into "your cover lasts another
 * 5 days". Ledgers close every ~5s, so a 15s cache costs at most three ledgers
 * of precision on a multi-day number while keeping the popover from firing an
 * RPC round-trip on every open. Returns null on failure — the caller must then
 * say nothing about expiry rather than guess, because guessing low reads as
 * "your stop-loss is dead".
 */
let ledgerCache: { seq: number; at: number } | null = null
export async function getLatestLedgerCached(maxAgeMs = 15_000): Promise<number | null> {
  if (ledgerCache && Date.now() - ledgerCache.at < maxAgeMs) return ledgerCache.seq
  try {
    const { sequence } = await server().getLatestLedger()
    ledgerCache = { seq: sequence, at: Date.now() }
    return sequence
  } catch {
    return ledgerCache?.seq ?? null
  }
}

/** The keeper signing account, or null when unconfigured (feature fails closed). */
export function getKeeperKeypair(): S.Keypair | null {
  const secret = process.env.STELLAR_KEEPER_SECRET?.trim()
  if (!secret || !/^S[A-Z2-7]{55}$/.test(secret)) return null
  try {
    return S.Keypair.fromSecret(secret)
  } catch {
    return null
  }
}

/** Public G-address of the keeper — the client simulates the close against this. */
export function getKeeperPublicKey(): string | null {
  return getKeeperKeypair()?.publicKey() ?? null
}

export function isKeeperConfigured(): boolean {
  return getKeeperKeypair() !== null
}

/** Live XLM/USD spot (Binance → CoinGecko fallback). Mirrors the chart's feed. */
export async function getXlmSpotUsd(): Promise<number | null> {
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=XLMUSDT", {
      signal: AbortSignal.timeout(6000),
    })
    if (r.ok) {
      const j = (await r.json()) as { price?: string }
      const p = Number(j.price)
      if (Number.isFinite(p) && p > 0) return p
    }
  } catch {
    /* fall through to coingecko */
  }
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd", {
      signal: AbortSignal.timeout(6000),
    })
    if (r.ok) {
      const j = (await r.json()) as { stellar?: { usd?: number } }
      const p = Number(j.stellar?.usd)
      if (Number.isFinite(p) && p > 0) return p
    }
  } catch {
    /* give up */
  }
  return null
}

/**
 * Submit the pre-signed repay-only close for one armed row. The user's auth entry
 * authorizes the contract; the keeper signs the envelope and pays the fee.
 * Returns the tx hash on success, throws on failure.
 *
 * Exported for the pending-close sweeper (`close-sweeper.ts`), which submits the
 * permissionless legs (`signedEntryB64: null`) with the same keeper account.
 */
export async function submitLeg(
  keeper: S.Keypair,
  fnName: string,
  args: S.xdr.ScVal[],
  signedEntryB64: string | null,
  label: string,
): Promise<{ hash: string; ledger: number }> {
  const rpc = server()
  const call = new S.Contract(CONTROLLER).call(fnName, ...args)
  const fn = call.body().invokeHostFunctionOp().hostFunction()
  // The entry MUST be attached BEFORE simulating: the simulation derives the
  // resource footprint, and the pre-signed entry's nonce ledger key only lands in
  // that footprint when the entry is present at sim time. (Simulating the bare op
  // then attaching the entry traps on-ledger with "nonce outside of footprint".)
  const auth = signedEntryB64 ? [S.xdr.SorobanAuthorizationEntry.fromXDR(signedEntryB64, "base64")] : []
  const op = S.Operation.invokeHostFunction({ func: fn, auth })

  const src = await rpc.getAccount(keeper.publicKey())
  let tx = new S.TransactionBuilder(src, { fee: "10000000", networkPassphrase: PASS })
    .addOperation(op)
    .setTimeout(180)
    .build()
  const sim = await rpc.simulateTransaction(tx)
  if (S.rpc.Api.isSimulationError(sim)) {
    throw new Error(`${label} sim: ${String(sim.error).split("\n")[0]}`)
  }
  // Assemble with the sim's footprint/fees and sign only the envelope as the keeper.
  tx = S.rpc.assembleTransaction(tx, sim).build()
  tx.sign(keeper)

  const send = await rpc.sendTransaction(tx)
  if (send.status === "ERROR") {
    throw new Error(`${label} rejected: ${JSON.stringify(send.errorResult ?? "").slice(0, 200)}`)
  }
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    let res: S.rpc.Api.GetTransactionResponse
    try {
      res = await rpc.getTransaction(send.hash)
    } catch {
      continue
    }
    if (res.status === "SUCCESS") return { hash: send.hash, ledger: Number(res.ledger ?? 0) }
    if (res.status === "FAILED") throw new Error(`${label} reverted on ledger (hash ${send.hash})`)
  }
  throw new Error(`${label} not confirmed within 45s (hash ${send.hash})`)
}

/**
 * Let the RPC's simulation snapshot catch up past `ledger` before building the
 * next leg off the state this one wrote. Without it the next simulation runs
 * against the pre-leg world and traps — the same N25 lag the interactive close
 * hook waits out between its own steps.
 */
async function waitPastLedger(ledger: number, timeoutMs = 60_000): Promise<void> {
  if (!ledger) return
  const rpc = server()
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await rpc.getLatestLedger()).sequence > ledger) return
    } catch {
      /* transient — retry */
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
}

/** Read-only contract call via simulation. Exported for the pending-close sweeper. */
export async function simulateRead(contractId: string, method: string, args: S.xdr.ScVal[]): Promise<unknown> {
  const rpc = server()
  const dummy = new S.Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0")
  const tx = new S.TransactionBuilder(dummy, { fee: "10000", networkPassphrase: PASS })
    .addOperation(new S.Contract(contractId).call(method, ...args))
    .setTimeout(120)
    .build()
  const sim = await rpc.simulateTransaction(await rpc.prepareTransaction(tx))
  if (!S.rpc.Api.isSimulationSuccess(sim)) throw new Error(`read ${method} failed`)
  return S.scValToNative(sim.result!.retval)
}

const ceilDiv = (a: bigint, b: bigint) => (a + b - BigInt(1)) / b

/**
 * Pick the pre-signed swap rung that lands inside the live [floor, poolOut] window.
 *
 * Lowest qualifying rung wins: it clears the contract's floor by the smallest
 * margin, which leaves the most room for the pool to move between this read and
 * the swap actually applying.
 */
async function swapWindow(row: KeeperArmRow, collateral: bigint): Promise<{ floor: bigint; poolOut: bigint }> {
  const addr = (a: string) => S.Address.fromString(a).toScVal()
  const map = SIDE_MAPPING[row.side]
  const positionAsset = CFG.assets[map.positionAsset]
  const debtAsset = CFG.assets[map.debtAsset]

  const [pNum, pDen] = (
    (await simulateRead(CFG.contracts.simplePeridottroller, "get_price_usd", [addr(positionAsset.token)])) as unknown[]
  ).map((v) => BigInt(String(v)))
  const [dNum, dDen] = (
    (await simulateRead(CFG.contracts.simplePeridottroller, "get_price_usd", [addr(debtAsset.token)])) as unknown[]
  ).map((v) => BigInt(String(v)))

  const SCALE = CFG.constants.EXCHANGE_SCALE
  const floor = ceilDiv(collateral * pNum * dDen * (SCALE - CFG.constants.MAX_SLIPPAGE_SCALED), pDen * dNum * SCALE)
  const poolOut = BigInt(
    String(
      await simulateRead(CFG.contracts.swapAdapter, "estimate_pool_swap", [
        addr(CFG.aquarius.pool),
        S.nativeToScVal(map.swapOutIdx, { type: "u32" }),
        S.nativeToScVal(map.swapInIdx, { type: "u32" }),
        S.nativeToScVal(String(collateral), { type: "u128" }),
      ]),
    ),
  )
  return { floor, poolOut }
}

function chooseRung(
  rungs: ReturnType<typeof readSwapRungs>,
  floor: bigint,
  poolOut: bigint,
): { minOut: string; entry: string; bp: number } | null {
  const inWindow = rungs
    .filter((r) => BigInt(r.min_out) >= floor && BigInt(r.min_out) <= poolOut)
    .sort((a, b) => (BigInt(a.min_out) < BigInt(b.min_out) ? -1 : 1))
  const pick = inWindow[0]
  return pick ? { minOut: pick.min_out, entry: pick.entry, bp: pick.bp } : null
}

/**
 * Can this close actually complete right now? Checked BEFORE the first leg.
 *
 * begin + withdraw move the collateral out of the position into a pending close.
 * If the swap then has no usable rung, the position is stranded there until its
 * pending expires — the keeper can't cancel without the user, and a stop-loss that
 * strands a position is worse than one that waits. So the window is evaluated
 * against the position's own collateral first, and a fire that can't finish is
 * simply not started.
 *
 * The window can still collapse between here and the swap (the pool moves); that
 * residual case unwinds with the pre-signed cancel entry.
 *
 * Returns null when the close can proceed, else the reason it can't.
 */
async function precheckClosable(row: KeeperArmRow): Promise<string | null> {
  const rungs = readSwapRungs(row.swap_rungs)
  if (!rungs.length) return formatArmReason("no_rungs", "arm carries no swap rungs — re-arm required")

  const map = SIDE_MAPPING[row.side]
  const positionAsset = CFG.assets[map.positionAsset]
  const position = (await simulateRead(CONTROLLER, "get_position", [
    S.nativeToScVal(String(row.position_id), { type: "u64" }),
  ])) as Record<string, unknown> | null
  if (!position) return formatArmReason("position_missing", "position not found")

  const ptokens = BigInt(String(position.collateral_ptokens ?? 0))
  const rate = BigInt(String(await simulateRead(positionAsset.vault, "get_exchange_rate", [])))
  const collateral = (ptokens * rate) / CFG.constants.EXCHANGE_SCALE
  if (collateral <= BigInt(0)) return formatArmReason("no_collateral", "position has no collateral")

  const { floor, poolOut } = await swapWindow(row, collateral)
  // Order matters: an empty window (floor above pool output) also has no usable
  // rung, so testing the ladder first would report "re-arm required" for a
  // liquidity condition re-arming cannot fix. That mislabel is exactly what the
  // live arm on #33 carried.
  if (poolOut < floor) {
    return formatArmReason(
      "window_empty",
      `pool pays ${poolOut} against an oracle floor of ${floor} — no close is possible at this depth yet`,
    )
  }
  if (!chooseRung(rungs, floor, poolOut)) {
    return formatArmReason(
      "no_rung_in_window",
      `no pre-signed rung in window [${floor}, ${poolOut}] (ladder ${rungs[0]?.min_out}…${rungs[rungs.length - 1]?.min_out}) — re-arm required`,
    )
  }
  return null
}

/** Pick the rung for the live window, once the collateral is actually withdrawn. */
async function pickSwapRung(
  row: KeeperArmRow,
): Promise<{ minOut: string; entry: string; bp: number; collateral: bigint; poolOut: bigint }> {
  const rungs = readSwapRungs(row.swap_rungs)
  if (!rungs.length) throw new Error("arm carries no swap rungs")

  const pending = (await simulateRead(CONTROLLER, "get_pending_perps_close", [
    S.nativeToScVal(String(row.position_id), { type: "u64" }),
  ])) as Record<string, unknown> | null
  const collateral = BigInt(
    String((pending?.collateral_underlying ?? (pending as Record<string, unknown>)?.collateralUnderlying) ?? 0),
  )
  if (collateral <= BigInt(0)) throw new Error("pending close reports no collateral")

  const { floor, poolOut } = await swapWindow(row, collateral)
  const pick = chooseRung(rungs, floor, poolOut)
  if (!pick) {
    throw new Error(
      `no pre-signed rung in window [${floor}, ${poolOut}] (rungs ${rungs[0]?.min_out}…${rungs[rungs.length - 1]?.min_out})`,
    )
  }
  // The rung is what gets signed; the pair (collateral in, poolOut) is what the
  // swap is actually worth, and it rides back out so the journal can stamp the
  // keeper's close in the same price domain as the trader's own closes.
  return { ...pick, collateral, poolOut }
}

/**
 * Return a half-started close to the position it came from.
 *
 * Best-effort by design: this runs on a path that has already failed, and the
 * pending close expires on its own if the cancel doesn't land. Never throws —
 * the caller is on its way to reporting the original error, which is the one
 * worth surfacing.
 */
async function unwindPendingClose(row: KeeperArmRow, keeper: S.Keypair): Promise<void> {
  if (!row.cancel_auth_entry) return
  try {
    await submitLeg(
      keeper,
      "cancel_close_position_v3",
      [S.Address.fromString(row.user_address).toScVal(), S.nativeToScVal(String(row.position_id), { type: "u64" })],
      row.cancel_auth_entry,
      "cancel_close",
    )
  } catch (e) {
    console.error(`[margin/keeper] unwind failed for position ${row.position_id}:`, e)
  }
}

/**
 * Close one armed position with the user's pre-signed authorizations.
 * Returns the hash of the leg that completed the close (`finish`).
 */
async function submitKeeperClose(
  row: KeeperArmRow,
  keeper: S.Keypair,
): Promise<{ hash: string; exitPriceUsd?: number }> {
  const user = S.Address.fromString(row.user_address).toScVal()
  const posId = S.nativeToScVal(String(row.position_id), { type: "u64" })

  if (row.arm_version < 4 || !row.prepare_auth_entry) {
    throw new Error("arm predates the one-transaction prepare_close — needs re-arming")
  }

  const prepared = await submitLeg(
    keeper,
    "prepare_close_position_v3",
    [user, posId],
    row.prepare_auth_entry,
    "prepare_close",
  )
  await waitPastLedger(prepared.ledger)

  // Only now is the collateral out of the position and the swap window knowable.
  // If it has collapsed since the pre-check, put the position back rather than
  // leaving it parked in a pending close the user has to notice and undo.
  let rung: Awaited<ReturnType<typeof pickSwapRung>>
  try {
    rung = await pickSwapRung(row)
  } catch (e) {
    await unwindPendingClose(row, keeper)
    throw e
  }
  const swapped = await submitLeg(
    keeper,
    "swap_close_position_v3",
    [user, posId, S.nativeToScVal(rung.minOut, { type: "u128" })],
    rung.entry,
    `swap_close(${rung.bp >= 0 ? "+" : ""}${rung.bp}bp)`,
  )
  await waitPastLedger(swapped.ledger)

  // finish is permissionless — the keeper signs this one on its own behalf.
  const finished = await submitLeg(keeper, "finish_close_position_v3", [posId], null, "finish_close")
  // A stop-loss that fires while the trader is asleep has to book the same way a
  // manual close does: entry came from the opening swap, so the exit comes from
  // the closing one. Stamping spot here would have left keeper-closed trades as
  // the last place the two price domains still met.
  const exitPriceUsd =
    executionExitPrice({
      side: row.side,
      positionUnderlying: rung.collateral,
      proceeds: rung.poolOut,
      usdtDecimals: CFG.assets.MOCK_USDT.decimals,
      xlmDecimals: CFG.assets.XLM.decimals,
    }) ?? undefined
  return { hash: finished.hash, exitPriceUsd }
}

export interface KeeperRunSummary {
  enabled: boolean
  scanned: number
  expired: number
  fired: number
  failed: number
  price: number | null
  details: Array<{ positionId: string; action: string; hash?: string; error?: string }>
}

/**
 * One keeper pass over all armed rows. Idempotent and safe to call repeatedly.
 * `priceOverride` (ops/test only — the caller is already run-token-gated) forces
 * the evaluated price so a fire can be triggered deterministically.
 */
export async function runKeeperOnce(priceOverride?: number): Promise<KeeperRunSummary> {
  const keeper = getKeeperKeypair()
  if (!keeper) {
    return { enabled: false, scanned: 0, expired: 0, fired: 0, failed: 0, price: null, details: [] }
  }
  const rpc = server()
  const latest = await rpc.getLatestLedger()
  const expired = await expireStaleArms(latest.sequence)

  // Drop arms that can never succeed, with a reason, so the user sees "re-arm
  // required" instead of a silent non-close at fire time. Two kinds:
  //   - anything older than the one-transaction prepare (arm_version < 4): the
  //     V2 repay-only shape, and the begin+withdraw split whose entries authorize
  //     calls this keeper no longer submits
  //   - entries signed for a superseded controller address
  const allArmed = await listArmedRows()
  const rows: KeeperArmRow[] = []
  let migrated = 0
  for (const row of allArmed) {
    if (row.arm_version < 4 || !row.prepare_auth_entry) {
      await expireArmWithReason(row.id, formatArmReason("stale_arm", "the close now prepares in one transaction — re-arm required"))
      migrated++
      continue
    }
    const target = authEntryContract(row.prepare_auth_entry)
    if (target && target !== CONTROLLER) {
      await expireArmWithReason(row.id, formatArmReason("stale_arm", `stale auth entry: signed for ${target.slice(0, 8)}…, controller is now ${CONTROLLER.slice(0, 8)}… — re-arm required`))
      migrated++
      continue
    }
    rows.push(row)
  }

  const price = priceOverride && priceOverride > 0 ? priceOverride : await getXlmSpotUsd()
  const summary: KeeperRunSummary = {
    enabled: true,
    scanned: allArmed.length,
    expired: expired + migrated,
    fired: 0,
    failed: 0,
    price,
    details: migrated > 0 ? [{ positionId: "-", action: `expired ${migrated} unusable arm(s) — re-arm required` }] : [],
  }
  if (!price || rows.length === 0) return summary

  for (const row of rows) {
    const hit = evaluateTpSlTrigger({
      side: row.side,
      takeProfit: row.take_profit_usd,
      stopLoss: row.stop_loss_usd,
      price,
    })
    if (!hit) {
      // Trigger no longer crossed → whatever blocked the last pass is history.
      if (row.last_error) await clearArmBlocked(row.id).catch(() => {})
      continue
    }

    // A trigger crossing is not on its own a reason to touch the position. If the
    // close can't complete right now — the pool below the oracle floor, a ladder
    // the price has outrun — starting it would only park the collateral in a
    // pending close. Leave the arm armed and try again next pass; the condition
    // is usually transient, and a waiting stop-loss beats a stranded one.
    const blocked = await precheckClosable(row).catch((e) =>
      formatArmReason("close_failed", e instanceof Error ? e.message : String(e)),
    )
    if (blocked) {
      // Persist it: a deferral the trader can't see is indistinguishable from a
      // stop-loss that quietly did nothing, which is the failure this whole
      // feature exists to prevent. Status stays `armed` and attempts stay put —
      // we didn't try, we declined to start.
      await noteArmBlocked(row.id, blocked).catch(() => {})
      summary.details.push({ positionId: row.position_id, action: "deferred", error: blocked })
      continue
    }

    try {
      const { hash, exitPriceUsd } = await submitKeeperClose(row, keeper)
      await markArmFired(row.id, hit, hash)
      // Journal the close so PnL / history update (exit price is the swap's own
      // fill; the server only falls back to spot if it is missing).
      // Awaited: the close already succeeded on-chain, so this is the only
      // remaining chance to persist it — fire-and-forget risked losing the row
      // if the run's HTTP response completed before the write landed.
      await recordMarginTrade({
        userAddress: row.user_address,
        positionId: row.position_id,
        eventType: "close",
        side: row.side,
        txHash: hash,
        exitPriceUsd,
        network: "testnet",
      }).catch(() => {})
      summary.fired++
      summary.details.push({ positionId: row.position_id, action: `closed (${hit})`, hash })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await markArmFailed(row.id, formatArmReason("close_failed", msg))
      summary.failed++
      summary.details.push({ positionId: row.position_id, action: "close_failed", error: msg })
    }
  }
  return summary
}
