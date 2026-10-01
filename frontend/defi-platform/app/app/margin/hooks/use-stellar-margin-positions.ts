'use client'

/**
 * use-stellar-margin-positions
 *
 * On-chain source of truth for the user's margin positions (replaces the EVM
 * DB-backed `/api/margin/positions`). One pass over `get_user_positions` →
 * `get_position`, classifying each id into:
 *   - OPEN positions (status "Open") — with live health factor + current debt
 *   - PENDING opens (status "PendingOpen") — unfinished, need resume/cancel
 *   - PENDING closes (a live `get_pending_perps_close`) — need finish/cancel/expire
 *   - SETTLING (status "Closing" with no pending) — `finish` landed but an
 *     interest residual is still being squared up. Nothing to sign; it exists so
 *     the position doesn't vanish from the list while the contract still holds it
 *
 * Folds in Phase-2.3 (pending-open tracking): both views come from the single id
 * sweep, so we never read the user's position list twice. Pass the hydrated
 * `assets` (from use-stellar-margin-balances) so prices + exchange rates are
 * reused rather than re-read.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  STELLAR_MARGIN_CONFIG as CFG,
  assetByToken,
} from '../config/stellarMarginConfig'
import {
  getUserPositions,
  getPosition,
  getPendingPerpsOpen,
  getPendingPerpsOpenExecution,
  getPendingPerpsClose,
  getHealthFactor,
  vaultGetMarginBorrowBalance,
  ptokensToUnderlying,
  formatUnitsToDecimal,
  type StellarPosition,
} from '@/lib/stellar-margin'
import type {
  StellarMarginAsset,
  StellarMarginPosition,
  StellarPendingOpenView,
  StellarPendingCloseView,
  StellarSettlingView,
  PositionSide,
} from '../types/stellarMargin'

const REFRESH_MS = 15_000

/**
 * Cadence while the tab is hidden AND liquidation alerts are on.
 *
 * The sweep costs ~4 RPC calls per position id, which is why a backgrounded tab
 * normally stops reading entirely. But an alert can only fire on data, and a
 * position that drifts toward liquidation while the trader is in another tab is
 * precisely the case the alerts exist for — so when they have asked to be told,
 * the sweep keeps going at a quarter of the rate rather than stopping.
 */
const HIDDEN_WATCH_MS = 60_000

/**
 * "Re-read the chain now." Broadcast by any margin flow that ended somewhere
 * other than success, so the positions sweep doesn't sit on a stale picture
 * until its next tick. An event rather than a callback because three separate
 * hook instances (panel, page banner, TP/SL monitor) can be the one that failed,
 * and none of them holds a reference to this sweep.
 */
export const MARGIN_REFRESH_EVENT = 'peridot:margin-refresh'

/** Fire-and-forget; safe on the server and in tests without a DOM. */
export function requestMarginRefresh(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(MARGIN_REFRESH_EVENT))
}

interface AssetMeta {
  decimals: number
  priceUsd: number
  exchangeRate: bigint
  /**
   * Consumer-facing name (`label`, e.g. "USDT") — NOT the internal `symbol`
   * ("mock-USDT"), which is a deployment detail. The positions table renders this
   * straight into the Collateral/Debt columns, and it was the one place in the
   * margin UI still leaking the mock- prefix at the user.
   */
  symbol: string
  vault: string
}

function metaFor(token: string, assets: StellarMarginAsset[]): AssetMeta {
  const a = assets.find((x) => x.token === token)
  if (a) {
    return { decimals: a.decimals, priceUsd: a.priceUsd, exchangeRate: a.exchangeRate, symbol: a.label, vault: a.vault }
  }
  // Fallback when balances haven't hydrated yet — 1:1 price, hinted rate (spec §6).
  const cfg = assetByToken(token)
  return {
    decimals: cfg?.decimals ?? 7,
    priceUsd: 1,
    exchangeRate: cfg ? BigInt(cfg.exchangeRateHint) : CFG.constants.EXCHANGE_SCALE,
    symbol: cfg?.label ?? '',
    vault: cfg?.vault ?? '',
  }
}

function toHuman(raw: bigint, decimals: number): number {
  const n = parseFloat(formatUnitsToDecimal(raw, decimals))
  return Number.isFinite(n) ? n : 0
}

async function buildOpenPosition(positionId: bigint, pos: StellarPosition, assets: StellarMarginAsset[]): Promise<StellarMarginPosition | null> {
  const collMeta = metaFor(pos.collateralAsset, assets)
  const debtMeta = metaFor(pos.debtAsset, assets)

  const [hfRaw, debtRaw] = await Promise.all([
    getHealthFactor(positionId),
    debtMeta.vault ? vaultGetMarginBorrowBalance(debtMeta.vault, positionId) : Promise.resolve(BigInt(0)),
  ])

  const collateralUnderlyingRaw = ptokensToUnderlying(pos.collateralPtokens, collMeta.exchangeRate)
  const collateralAmount = toHuman(collateralUnderlyingRaw, collMeta.decimals)
  const debtAmount = toHuman(debtRaw, debtMeta.decimals)

  const collateralUsd = collateralAmount * collMeta.priceUsd
  const debtUsd = debtAmount * debtMeta.priceUsd
  const equity = collateralUsd - debtUsd
  const leverage = equity > 0 ? collateralUsd / equity : 0

  return {
    id: positionId.toString(),
    positionId,
    side: pos.side,
    collateralToken: pos.collateralAsset,
    debtToken: pos.debtAsset,
    collateralSymbol: collMeta.symbol,
    debtSymbol: debtMeta.symbol,
    collateralPtokens: pos.collateralPtokens,
    collateralAmount,
    debtAmount,
    collateralUsd,
    debtUsd,
    leverage,
    entryPriceScaled: pos.entryPriceScaled,
    // null = the chain didn't answer with a number (the read traps when the
    // oracle can't price the pair). A real 0 still means a position with nothing
    // left and must keep alarming — so the two are kept apart here rather than
    // downstream, where only the value survives.
    healthFactor: hfRaw == null ? 0 : Number(hfRaw) / Number(CFG.constants.HF_SCALE),
    healthUnknown: hfRaw == null,
    openedAt: new Date(Number(pos.openedAt) * 1000),
  }
}

async function buildPendingOpen(
  positionId: bigint,
  assets: StellarMarginAsset[],
  nowMs: number,
): Promise<StellarPendingOpenView | null> {
  // V3: the pending struct + whether the on-chain swap already ran. The
  // execution state decides the recovery UX — swapped pendings can only be
  // activated (even past expiry), un-swapped ones can be resumed or cancelled.
  const [pending, execution] = await Promise.all([
    getPendingPerpsOpen(positionId),
    getPendingPerpsOpenExecution(positionId),
  ])
  if (!pending) return null

  const debtMeta = metaFor(pending.debtAsset, assets)
  const expiresAtMs = Number(pending.expiresAt) * 1000

  return {
    id: positionId.toString(),
    positionId,
    // V3 stores the side on the pending itself (debt/position derive from it).
    side: pending.side,
    collateralToken: pending.collateralAsset,
    debtToken: pending.debtAsset,
    positionToken: pending.positionAsset,
    collateralVault: pending.collateralVault,
    debtVault: pending.debtVault,
    positionVault: pending.positionVault,
    collateralPtokens: pending.collateralPtokens,
    openFeePtokens: pending.openFeePtokens,
    borrowAmount: toHuman(pending.borrowAmount, debtMeta.decimals),
    borrowAmountRaw: pending.borrowAmount,
    marginAmountRaw: pending.marginAmount > BigInt(0) ? pending.marginAmount : null,
    minPositionAmountRaw: pending.minPositionAmount,
    expiresAt: new Date(expiresAtMs),
    isExpired: nowMs >= expiresAtMs,
    hasExecution: execution != null,
    executionPositionAmountRaw: execution?.positionAmount ?? null,
  }
}

/** Build a pending-CLOSE view from `get_pending_perps_close`. Returns null unless
 *  the struct carries real data (guards against a contract that decodes an empty
 *  struct rather than null when no close is in flight). */
async function buildPendingClose(
  positionId: bigint,
  nowMs: number,
): Promise<StellarPendingCloseView | null> {
  const pc = await getPendingPerpsClose(positionId)
  if (!pc) return null
  const meaningful = pc.owner !== '' || pc.collateralUnderlying > BigInt(0) || pc.expiresAt > BigInt(0) || pc.debtAmount > BigInt(0)
  if (!meaningful) return null
  const expiresAtMs = Number(pc.expiresAt) * 1000
  return {
    id: positionId.toString(),
    positionId,
    side: pc.side,
    positionToken: pc.positionAsset,
    debtToken: pc.debtAsset,
    collateralUnderlyingRaw: pc.collateralUnderlying,
    debtAmountRaw: pc.debtAmount,
    expiresAt: new Date(expiresAtMs),
    isExpired: pc.expiresAt > BigInt(0) && nowMs >= expiresAtMs,
    hasSwapped: pc.hasSwapped,
    receivedDebtAssetRaw: pc.receivedDebtAsset,
  }
}

export interface UseStellarMarginPositionsResult {
  positions: StellarMarginPosition[]
  pending: StellarPendingOpenView[]
  /** Positions with an in-flight / stranded split close (needs finish / cancel /
   *  expire). Detected in the same id sweep. */
  pendingCloses: StellarPendingCloseView[]
  /** Positions the contract has settled but is still holding while an interest
   *  residual clears (`Closing`, no pending). Informational — no user action. */
  settling: StellarSettlingView[]
  isLoading: boolean
  /** True once a sweep has completed for this wallet — see `hasLoaded` below. */
  hasLoaded: boolean
  /**
   * Why the last sweep produced nothing, when it failed outright.
   *
   * A read error used to be logged to the console and nowhere else, so the UI
   * fell back to its empty state: "No open positions" — for a trader who has
   * five, or worse, for one whose collateral is sitting in a pending close. An
   * RPC hiccup and an empty account looked exactly alike. Anything that renders
   * "you have nothing" must consult this first and say "we couldn't read your
   * positions" instead.
   */
  error: string | null
  refetch: () => void
}

export function useStellarMarginPositions(
  userAddress: string | null,
  assets: StellarMarginAsset[],
  /** Keep reading (slowly) while the tab is hidden — see HIDDEN_WATCH_MS. */
  watchWhileHidden = false,
): UseStellarMarginPositionsResult {
  const [positions, setPositions] = useState<StellarMarginPosition[]>([])
  const [pending, setPending] = useState<StellarPendingOpenView[]>([])
  const [pendingCloses, setPendingCloses] = useState<StellarPendingCloseView[]>([])
  const [settling, setSettling] = useState<StellarSettlingView[]>([])
  const [isLoading, setIsLoading] = useState(false)
  /**
   * Has a sweep completed at least once for this wallet?
   *
   * `isLoading` can't answer that: it starts false, and the effect below bails
   * out entirely until `assets` hydrate — so "not loading" covers both "nothing
   * to show" and "haven't looked yet". Any UI that states the user has no
   * positions has to wait for this, or it says so while five are open.
   */
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const refetch = useCallback(() => setTick((t) => t + 1), [])

  // Latest assets in a ref so the interval reuses fresh prices/rates without
  // re-subscribing every time balances refresh.
  const assetsRef = useRef(assets)
  assetsRef.current = assets

  useEffect(() => {
    if (!userAddress) {
      setPositions([])
      setPending([])
      setPendingCloses([])
      setSettling([])
      setHasLoaded(false)
      setError(null)
      return
    }
    // Wait for prices/exchange rates before deriving anything from them. `metaFor`
    // falls back to a flat $1 when an asset isn't hydrated yet, which silently
    // mis-states collateralUsd/debtUsd and therefore leverage — a 3× position
    // rendered as 1.0× for the frame between the two hooks landing. Positions are
    // worth showing a beat later rather than showing wrong.
    if (!assetsRef.current.length) return

    let cancelled = false
    setIsLoading(true)

    const run = async () => {
      try {
        const ids = await getUserPositions(userAddress)
        const nowMs = Date.now()
        const built = await Promise.all(
          ids.map(async (id) => {
            // get_position tells us which bucket the id falls in (spec §7). A
            // split close in flight is probed in parallel — if present it takes
            // over the id's classification (the position is mid-close, so it
            // shows as a recovery banner, not a normal closeable row).
            const [pos, pendingClose] = await Promise.all([
              getPosition(id),
              buildPendingClose(id, nowMs),
            ])
            if (pendingClose) {
              return { kind: 'close' as const, value: pendingClose }
            }
            if (pos?.status === 'Open') {
              return { kind: 'open' as const, value: await buildOpenPosition(id, pos, assetsRef.current) }
            }
            if (pos?.status === 'PendingOpen') {
              return { kind: 'pending' as const, value: await buildPendingOpen(id, assetsRef.current, nowMs) }
            }
            // `Closing` with no pending close behind it: the swap and the finish
            // both landed, and a residual is all that keeps the contract holding
            // the position. Returning null here (which is what this did) deleted
            // the row from the trader's screen while the protocol still had it.
            if (pos?.status === 'Closing') {
              return {
                kind: 'settling' as const,
                value: {
                  id: id.toString(),
                  positionId: id,
                  side: pos.side,
                  positionToken: pos.collateralAsset,
                  debtToken: pos.debtAsset,
                } satisfies StellarSettlingView,
              }
            }
            return null
          }),
        )
        if (cancelled) return
        const open: StellarMarginPosition[] = []
        const pend: StellarPendingOpenView[] = []
        const closes: StellarPendingCloseView[] = []
        const settlingRows: StellarSettlingView[] = []
        for (const r of built) {
          if (!r || !r.value) continue
          if (r.kind === 'open') open.push(r.value as StellarMarginPosition)
          else if (r.kind === 'pending') pend.push(r.value as StellarPendingOpenView)
          else if (r.kind === 'settling') settlingRows.push(r.value as StellarSettlingView)
          else closes.push(r.value as StellarPendingCloseView)
        }
        setPositions(open)
        setPending(pend)
        setPendingCloses(closes)
        setSettling(settlingRows)
        setHasLoaded(true)
        setError(null)
      } catch (e) {
        if (!cancelled) {
          console.error('[useStellarMarginPositions]', e)
          // Keep whatever was last read on screen — a stale row beats a row that
          // vanished — but record WHY it may be stale, and mark the sweep as
          // having run so the UI stops claiming it is still loading forever.
          setError(e instanceof Error ? e.message : String(e))
          setHasLoaded(true)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()
    // Skip the sweep while the tab is backgrounded (it costs 4 RPC calls per
    // position id), and take one immediately on return — unless the trader has
    // asked to be warned about liquidation, in which case a hidden tab is the
    // situation the warning is for and the sweep drops to HIDDEN_WATCH_MS
    // instead of stopping.
    let lastHiddenRun = 0
    const tickRun = () => {
      if (!document.hidden) { void run(); return }
      if (!watchWhileHidden) return
      const now = Date.now()
      if (now - lastHiddenRun < HIDDEN_WATCH_MS) return
      lastHiddenRun = now
      void run()
    }
    const onVisible = () => { if (!document.hidden) void run() }
    // A flow that just failed has almost certainly changed what's on chain — a
    // close that died after `begin` leaves a PendingClose the user needs the
    // recovery banner for. Nothing used to announce that, so the banner appeared
    // whenever the next 15s tick happened to come round: up to a quarter minute
    // of a position looking normal, or missing, right after the moment the user
    // was told something went wrong. The failing hooks post this instead.
    const onFlowFailed = () => void run()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(MARGIN_REFRESH_EVENT, onFlowFailed)
    const id = setInterval(tickRun, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(MARGIN_REFRESH_EVENT, onFlowFailed)
    }
  }, [userAddress, tick, assets.length, watchWhileHidden])

  return { positions, pending, pendingCloses, settling, isLoading, hasLoaded, error, refetch }
}
