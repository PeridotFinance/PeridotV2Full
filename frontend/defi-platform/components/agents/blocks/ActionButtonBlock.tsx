'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  ArrowRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useAgentExecution, type ExecutionStatus } from '@/hooks/use-agent-execution'
import { useAgentGasEstimate } from '@/hooks/use-agent-gas-estimate'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useAgentProfile } from '@/hooks/use-agent-profile'
import { shouldAutoExecute, type AutoExecuteProfile } from '@/lib/agents/auto-execute-consent'
import { statusLabel as timelineStatusLabel } from '@/lib/agents/action-timeline-labels'
import { cn } from '@/lib/utils'
import type { ActionButtonActionType } from '@/types/agents'

interface ActionButtonBlockProps {
  actionType: ActionButtonActionType
  label: string
  params: {
    assetSymbol: string
    amount: string
    poolId: string
    chainId: number
    targetAddress?: string
  }
  confirmationToken: string
  netAmount?: string
  earnRate?: number
  estimatedSeconds?: number
  /**
   * Fee that will be skimmed from the trigger token (MEE / bridge fee).
   * Populated by `executeCrossChainSupply` from the Biconomy quote so the user
   * sees "You'll deposit $4.92 · Network fee $0.08" before confirming.
   */
  fee?: {
    amount: string
    usdValue?: number
  }
  /**
   * USD value of the transaction. When provided together with an enabled profile,
   * the block can evaluate auto-execute eligibility.
   */
  amountUsd?: number
  /**
   * Server-authoritative auto-execute decision. When present, the client skips
   * its own profile-based evaluation and trusts this verdict — avoiding the
   * React-Query hydration race that used to flip deposit/withdraw blocks onto
   * the manual-button path during the first ~300ms after mount.
   */
  autoExecute?: {
    willFire: boolean
    reason?: string
  }
  /**
   * Consent profile from `/api/agents/profile`. When `autoExecuteEnabled` and
   * wallet is embedded, the block auto-dispatches instead of showing the dialog.
   * Legacy path — new blocks use the server-decided `autoExecute` prop above.
   */
  autoExecuteProfile?: AutoExecuteProfile | null
  /**
   * ISO timestamp of the parent chat message. When the block is rendered from
   * a conversation that was loaded from history (not freshly streamed), the
   * message's createdAt is older than ~30s, and we MUST NOT auto-fire — the
   * server would reject the consumed/expired token and the user would see a
   * phantom "Processing..." for a deleted-past action.
   */
  messageCreatedAt?: string
}

/**
 * Max age of a message (in ms) for auto-execute to still be considered fresh.
 * Any action older than this is treated as "historical" — the inline auto
 * card falls back to the traditional trigger button so the user can see the
 * past action without it re-firing.
 */
const AUTO_EXECUTE_FRESH_WINDOW_MS = 30_000

/** Session-scoped dedup of confirmation tokens that have already auto-fired.
 *  Without this, stream-finalize re-mounts the ActionButtonBlock with a fresh
 *  `autoFiredRef = false`, the 2-second countdown runs again, and we POST
 *  /api/agents/execute a second time — which returns 409 (token consumed)
 *  but after the first success has already happened.
 */
/**
 * Per-token session state for ActionButtonBlock.
 *
 * Bumped from the old string-array schema (v1 tracked only "fired") to v2 so
 * we can also remember the terminal outcome across block re-mounts. Without
 * this, a block that successfully executed would render in a stuck "Working
 * on your withdraw…" busy state after the chat stream finalizes and the
 * component re-mounts with a fresh hook instance. See the plan note in
 * AGENT_ACTION_TIMELINE.md (or the earlier session log).
 *
 * Shape:
 *   { [token]: { fired, terminal?, amount?, pastTense?, errorMessage?, ts } }
 *
 * We keep the 50 most-recently-touched entries to bound size.
 */
const SESSION_STORAGE_KEY = 'peridot:agent:block-state:v2'
const MAX_ENTRIES = 50

interface BlockSessionState {
  fired: boolean
  terminal?: 'success' | 'error'
  /** Amount string to render on the terminal card. */
  amount?: string
  /** Cached past-tense verb ("Deposited", "Withdrawn") for consistency. */
  pastTense?: string
  /** Error message for the terminal=error render. */
  errorMessage?: string
  ts: number
}

type BlockSessionMap = Record<string, BlockSessionState>

function readBlockSession(): BlockSessionMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    // Defensive — old format was a string[]. Ignore it, start fresh.
    return parsed && !Array.isArray(parsed) && typeof parsed === 'object'
      ? (parsed as BlockSessionMap)
      : {}
  } catch {
    return {}
  }
}

function writeBlockSession(map: BlockSessionMap): void {
  if (typeof window === 'undefined') return
  try {
    // Trim to the 50 most-recent entries by ts so storage doesn't grow
    // unbounded across long sessions.
    const entries = Object.entries(map)
    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => (b[1].ts ?? 0) - (a[1].ts ?? 0))
      const trimmed: BlockSessionMap = {}
      for (const [k, v] of entries.slice(0, MAX_ENTRIES)) trimmed[k] = v
      map = trimmed
    }
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // sessionStorage may be disabled (private mode, etc). The in-component
    // refs still dedup within the block's lifetime; cross-remount recovery
    // degrades gracefully to the server fallback.
  }
}

function getBlockSessionState(token: string): BlockSessionState | null {
  return readBlockSession()[token] ?? null
}

function hasAutoFired(token: string): boolean {
  return getBlockSessionState(token)?.fired === true
}

function markAutoFired(token: string) {
  const map = readBlockSession()
  const existing = map[token] ?? { fired: false, ts: Date.now() }
  map[token] = { ...existing, fired: true, ts: Date.now() }
  writeBlockSession(map)
}

/** Persist the terminal outcome so a re-mount can skip the stuck busy state. */
function markBlockTerminal(
  token: string,
  outcome: 'success' | 'error',
  extras: { amount?: string; pastTense?: string; errorMessage?: string } = {},
): void {
  const map = readBlockSession()
  const existing = map[token] ?? { fired: true, ts: Date.now() }
  map[token] = {
    ...existing,
    fired: true,
    terminal: outcome,
    amount: extras.amount ?? existing.amount,
    pastTense: extras.pastTense ?? existing.pastTense,
    errorMessage: extras.errorMessage ?? existing.errorMessage,
    ts: Date.now(),
  }
  writeBlockSession(map)
}

// Map legacy/DeFi action types to fintech vocabulary
const ACTION_TYPE_MAP: Record<ActionButtonActionType, {
  verb: string         // "Deposit"
  pastTense: string    // "Deposited"
  confirmLabel: string // "Confirm Deposit"
}> = {
  deposit:           { verb: 'Deposit',  pastTense: 'Deposited', confirmLabel: 'Confirm Deposit' },
  withdraw:          { verb: 'Withdraw', pastTense: 'Withdrawn', confirmLabel: 'Confirm Withdrawal' },
  borrow:            { verb: 'Borrow',   pastTense: 'Borrowed',  confirmLabel: 'Confirm Borrow' },
  pay_back:          { verb: 'Pay back', pastTense: 'Paid back', confirmLabel: 'Confirm Payment' },
  convert:           { verb: 'Convert',  pastTense: 'Converted', confirmLabel: 'Confirm Conversion' },
  adjust_strategy:   { verb: 'Adjust strategy', pastTense: 'Strategy adjusted', confirmLabel: 'Confirm Adjustment' },
  // Legacy mappings
  supply:              { verb: 'Deposit',  pastTense: 'Deposited', confirmLabel: 'Confirm Deposit' },
  repay:               { verb: 'Pay back', pastTense: 'Paid back', confirmLabel: 'Confirm Payment' },
  swap:                { verb: 'Convert',  pastTense: 'Converted', confirmLabel: 'Confirm Conversion' },
  rebalance:           { verb: 'Adjust strategy', pastTense: 'Strategy adjusted', confirmLabel: 'Confirm Adjustment' },
  'cross-chain_supply': { verb: 'Deposit',  pastTense: 'Deposited', confirmLabel: 'Confirm Deposit' },
}

// Normalize to gas-estimate action category (used by useAgentGasEstimate for gas limits)
const GAS_CATEGORY_MAP: Record<ActionButtonActionType, string> = {
  deposit: 'supply', supply: 'supply', 'cross-chain_supply': 'supply',
  withdraw: 'withdraw',
  borrow: 'borrow',
  pay_back: 'repay', repay: 'repay',
  convert: 'swap', swap: 'swap',
  adjust_strategy: 'rebalance', rebalance: 'rebalance',
}

const STATUS_CONFIG: Record<
  ExecutionStatus,
  { text: string; color: string }
> = {
  idle:       { text: '', color: '' },
  fetching:   { text: 'Preparing...', color: 'text-primary' },
  signing:    { text: 'Confirm in your wallet', color: 'text-primary' },
  confirming: { text: 'Processing...', color: 'text-primary' },
  verifying:  { text: 'Almost done...', color: 'text-primary' },
  success:    { text: 'Done', color: 'text-green-500' },
  error:      { text: 'Something went wrong', color: 'text-destructive' },
}

/**
 * Peridot / Compound Comptroller rejection custom-error signatures. The
 * selector is the first 4 bytes of keccak256("RejectionName(uint256)");
 * the argument is the numeric error code. We match both the selector and
 * the code so we can surface a specific fintech message.
 *
 * Selectors (computed from the on-chain contract):
 *   0xb7abef56 = RedeemComptrollerRejection(uint256)
 *   0x8da5cb5b = MintComptrollerRejection(uint256)
 *   0x8cd22d19 = BorrowComptrollerRejection(uint256)
 *
 * Common Comptroller rejection codes from Compound V2:
 *   0x04 = INSUFFICIENT_LIQUIDITY (would break the user's collateral ratio)
 *   0x09 = MARKET_NOT_LISTED
 *   0x0a = MARKET_NOT_ENTERED
 *   0x06 = PRICE_ERROR (oracle stale)
 *   0x07 = REJECTION (generic)
 */
const REDEEM_REJECTION = /0xb7abef56[0-9a-f]{0,56}0{0,64}([0-9a-f]{1,4})(?:[^0-9a-f]|$)/i
const MINT_REJECTION = /0x8da5cb5b[0-9a-f]{0,56}0{0,64}([0-9a-f]{1,4})(?:[^0-9a-f]|$)/i
const BORROW_REJECTION = /0x8cd22d19[0-9a-f]{0,56}0{0,64}([0-9a-f]{1,4})(?:[^0-9a-f]|$)/i

/** Sanitize blockchain error messages for consumer display. */
function friendlyError(raw: string | null): string {
  if (!raw) return 'Something went wrong. Please try again.'

  // 1. Comptroller custom-error signatures — check BEFORE generic substrings
  //    so "0xb7abef56…0004" becomes "withdrawal would break your loan ratio"
  //    instead of the generic "Something went wrong".
  const redeemMatch = raw.match(REDEEM_REJECTION)
  if (redeemMatch && parseInt(redeemMatch[1], 16) === 4) {
    return 'Withdrawing this much would put your open loan at risk. Pay back some of your loan first, or withdraw a smaller amount.'
  }
  const borrowMatch = raw.match(BORROW_REJECTION)
  if (borrowMatch && parseInt(borrowMatch[1], 16) === 4) {
    return 'Borrowing more would exceed your safe limit. Deposit additional collateral first.'
  }
  const mintMatch = raw.match(MINT_REJECTION)
  if (mintMatch) {
    return 'This pool is not accepting deposits right now. Try another pool.'
  }

  const lower = raw.toLowerCase()
  if (lower.includes('insufficient') && (lower.includes('balance') || lower.includes('fund'))) {
    return 'Insufficient balance for this action.'
  }
  if (lower.includes('rejected') || lower.includes('user denied')) {
    return 'Cancelled. No funds moved.'
  }
  if (lower.includes('liquidity')) {
    return 'Withdrawing this much would put your open loan at risk. Pay back some of your loan first, or withdraw a smaller amount.'
  }
  if (lower.includes('allowance')) {
    return 'Authorization needed. Please try again.'
  }
  return 'Something went wrong. Please try again.'
}

/** Progress indicator that fills based on elapsed time — honest, not tied to phase events. */
function TimedProgress({ estimatedSeconds, isActive }: { estimatedSeconds: number; isActive: boolean }) {
  const [percent, setPercent] = useState(10)

  useEffect(() => {
    if (!isActive) return
    const start = Date.now()
    const max = 90
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000
      const progress = Math.min(10 + (elapsed / estimatedSeconds) * (max - 10), max)
      setPercent(progress)
    }, 250)
    return () => clearInterval(interval)
  }, [isActive, estimatedSeconds])

  return (
    <div className="h-1 bg-muted/60 rounded-full overflow-hidden">
      <div
        className="h-full bg-primary transition-all duration-300 rounded-full"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

export function ActionButtonBlock({
  actionType,
  label,
  params,
  confirmationToken,
  fee,
  netAmount,
  earnRate,
  estimatedSeconds,
  amountUsd,
  autoExecute,
  autoExecuteProfile,
  messageCreatedAt,
}: ActionButtonBlockProps) {
  const [showDialog, setShowDialog] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const { status, error, pointsAwarded, execute, reset } = useAgentExecution()
  const { canAutoSign } = useActiveWallet()

  // Pull the profile here so every ActionButtonBlock can self-decide whether
  // auto-execute is allowed without requiring callers to thread the prop.
  // When the profile isn't loaded yet OR the user said no, `autoDecision.allowed`
  // stays false and we render the traditional dialog.
  const { profile } = useAgentProfile()
  // Prop wins (needed for tests that explicitly pass a profile shape); the
  // hook-fetched profile is the production fallback so callers don't need to
  // thread it through the message stream.
  const effectiveProfile: AutoExecuteProfile | null =
    autoExecuteProfile !== undefined
      ? autoExecuteProfile
      : profile
        ? {
            auto_execute_enabled: profile.autoExecuteEnabled,
            auto_execute_limit_usd: profile.autoExecuteLimitUsd,
            auto_execute_actions: profile.autoExecuteActions,
          }
        : null

  const gasCategory = GAS_CATEGORY_MAP[actionType] ?? 'supply'
  const gasEstimate = useAgentGasEstimate(gasCategory, params.chainId, showDialog)

  const mapping = ACTION_TYPE_MAP[actionType] ?? ACTION_TYPE_MAP.deposit
  const defaultSeconds = actionType === 'cross-chain_supply' ? 30 : 5
  const seconds = estimatedSeconds ?? defaultSeconds

  // ── Auto-execute evaluation ──────────────────────────────────────
  // Wallet-level gate (`canAutoSign`) comes from `useActiveWallet`.
  // Consent + limit + action-allow-list gate comes from `shouldAutoExecute`.
  // We use whichever fintech action type is provided; the consent gate has its
  // own allow-list of fintech verbs (deposit/withdraw/pay_back).
  // Only freshly-streamed action blocks are eligible for auto-execute.
  // Anything with a messageCreatedAt older than the fresh-window (default 30s)
  // is from a rehydrated conversation history and would try to redeem a token
  // that's already consumed or expired — see re-load bug. We compute this once
  // per render; no timer needed because the block won't become "stale" during
  // its own lifetime.
  const isFreshMessage =
    !messageCreatedAt ||
    (() => {
      const t = Date.parse(messageCreatedAt)
      if (!Number.isFinite(t)) return false
      return Date.now() - t < AUTO_EXECUTE_FRESH_WINDOW_MS
    })()

  const autoDecision = useMemo(() => {
    // Runtime-only gates the server can't know: wallet supports silent-sign,
    // and the message is freshly streamed (not rehydrated from history).
    if (!canAutoSign || !isFreshMessage) {
      return { allowed: false as const }
    }
    // Server-authoritative path. When the tool-executor attached a decision
    // we trust it — the server already ran `shouldAutoExecute` against the
    // user's profile with the canonical amountUsd. This skips the client-side
    // re-evaluation which races React-Query's profile fetch on fresh mounts.
    if (autoExecute) {
      return autoExecute.willFire
        ? { allowed: true as const }
        : { allowed: false as const }
    }
    // Legacy fallback — older blocks without the `autoExecute` field fall
    // back to the client-side profile check. Same race as before; kept for
    // backward-compat with persisted blocks already in the DB.
    if (!effectiveProfile) {
      return { allowed: false as const }
    }
    const symbol = (params.assetSymbol ?? '').toUpperCase()
    const isStable = symbol === 'USDC' || symbol === 'USDT' || symbol === 'AUSD'
    const amt =
      typeof amountUsd === 'number' && Number.isFinite(amountUsd)
        ? amountUsd
        : isStable
          ? Number(params.amount)
          : NaN
    return shouldAutoExecute(effectiveProfile, {
      actionType,
      amountUsd: amt,
    })
  }, [canAutoSign, effectiveProfile, actionType, amountUsd, params.amount, params.assetSymbol, isFreshMessage, autoExecute])

  const isAutoExecuteEligible = autoDecision.allowed === true

  // Fire-once guard — we don't want the auto-dispatch effect to re-fire when
  // React re-renders the component while the tx is still in flight. Seeded
  // from sessionStorage so re-mounts (e.g. when the streamed message is
  // finalised and the assistant message re-renders) don't re-dispatch.
  const autoFiredRef = useRef(hasAutoFired(confirmationToken))
  const [autoCancelled, setAutoCancelled] = useState(false)
  const [autoCountdown, setAutoCountdown] = useState(0)

  // 2-second "undo" window, then dispatch.
  useEffect(() => {
    if (!isAutoExecuteEligible || autoFiredRef.current || autoCancelled) return
    setAutoCountdown(2)
    const tick = setInterval(() => {
      setAutoCountdown((v) => (v > 0 ? v - 1 : 0))
    }, 1000)
    const timeout = setTimeout(() => {
      if (autoCancelled || autoFiredRef.current) return
      autoFiredRef.current = true
      markAutoFired(confirmationToken)
      execute(confirmationToken, { useEmbeddedSponsor: true }).catch(() => {
        // Error surfaces through the hook's `error` state
      })
    }, 2000)
    return () => {
      clearInterval(tick)
      clearTimeout(timeout)
    }
  }, [isAutoExecuteEligible, autoCancelled, confirmationToken, execute])

  const handleConfirm = async () => {
    await execute(confirmationToken)
  }

  const handleRetry = () => {
    reset()
    handleConfirm()
  }

  // Listen to Biconomy phase events so cross-chain ops surface forward motion
  // between tap-Confirm and the wallet popup opening. Without this, the UI
  // would be stuck on "Processing…" for ~5–10s while the quote is fetched,
  // and users assume it's broken and cancel.
  const [phaseMessage, setPhaseMessage] = useState<string | null>(null)
  useEffect(() => {
    if (actionType !== 'cross-chain_supply') return
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent).detail
      const phase: string = detail?.phase ?? ''
      switch (phase) {
        case 'compose-ok':
        case 'quote-start':
          setPhaseMessage('Getting the best rate for your deposit…')
          break
        case 'quote-ok':
          setPhaseMessage('Opening your wallet — tap Confirm when it appears')
          break
        case 'sign-start':
          setPhaseMessage('Opening your wallet — tap Confirm when it appears')
          break
        case 'execute-start':
          setPhaseMessage('Sending your funds — usually takes ~30 seconds')
          break
        case 'execute-ok':
          setPhaseMessage('Funds are on their way — almost there…')
          break
      }
    }
    window.addEventListener('peridot:biconomy-phase', handler)
    return () => window.removeEventListener('peridot:biconomy-phase', handler)
  }, [actionType])

  // Clear phase message when status resets (new run, retry, success/error)
  useEffect(() => {
    if (status === 'idle' || status === 'success' || status === 'error') {
      setPhaseMessage(null)
    }
  }, [status])

  // ── Live Action Timeline updates (P4 SSE) ──────────────────────────
  //
  // Subscribe to the global action-timeline event stream and filter on our
  // confirmation token. Any status transition written by the client or by
  // the poller lands here within ~2s and we can update the inline label.
  //
  // On mount we also seed this from two places so the block survives a
  // re-mount after the chat stream finalizes (the originally reported
  // "stuck on Working on your withdraw…" bug):
  //   1. sessionStorage — instant, scoped to the tab
  //   2. /api/agents/timeline/action?token=… — authoritative fallback
  const [timelineStatus, setTimelineStatus] = useState<{
    status: string
    label: string
  } | null>(() => {
    // Synchronous hydrate from sessionStorage so the very first paint is
    // already on the correct card (no busy-state flicker).
    if (!confirmationToken) return null
    const cached = getBlockSessionState(confirmationToken)
    if (cached?.terminal === 'success') {
      return { status: 'succeeded', label: timelineStatusLabel('succeeded') }
    }
    if (cached?.terminal === 'error') {
      return { status: 'failed', label: timelineStatusLabel('failed') }
    }
    return null
  })

  // Server-side fallback: if sessionStorage had nothing (private mode, cross-
  // tab), ask the Timeline endpoint for the action's current status. Runs
  // only when we don't already have a terminal state cached.
  useEffect(() => {
    if (!confirmationToken) return
    const cached = getBlockSessionState(confirmationToken)
    if (cached?.terminal) return
    if (timelineStatus && (timelineStatus.status === 'succeeded' || timelineStatus.status === 'failed')) {
      return
    }
    let cancelled = false
    const abort = new AbortController()
    ;(async () => {
      try {
        // Best-effort — no need to authenticate here because the endpoint
        // itself does auth. Fetch uses the session cookie + Privy provider
        // automatically; if it 401s, we just leave timelineStatus null and
        // the block behaves exactly like today.
        const { getAccessToken } = await import('@privy-io/react-auth').then(
          (m) => m.getAccessToken
            ? { getAccessToken: m.getAccessToken }
            : { getAccessToken: async () => null },
        )
        const token = typeof getAccessToken === 'function' ? await getAccessToken() : null
        if (!token) return
        const res = await fetch(
          `/api/agents/timeline/action?token=${encodeURIComponent(confirmationToken)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: abort.signal,
          },
        )
        if (!res.ok) return
        const data = (await res.json()) as {
          status: string
          statusLabel: string
          terminal: boolean
          amount?: string
        }
        if (cancelled) return
        setTimelineStatus({ status: data.status, label: data.statusLabel })
        if (data.terminal) {
          const outcome = data.status === 'succeeded' ? 'success' : 'error'
          markBlockTerminal(confirmationToken, outcome, { amount: data.amount })
        }
      } catch {
        // Non-fatal — leave timelineStatus null, fall back to the hook
        // status and the busy-state label.
      }
    })()
    return () => {
      cancelled = true
      abort.abort()
    }
  }, [confirmationToken, timelineStatus])

  useEffect(() => {
    if (!confirmationToken) return
    const handleSnapshot = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as { actions: any[] } | undefined
      const mine = detail?.actions?.find(
        (a) => a?.confirmationToken === confirmationToken,
      )
      if (mine) {
        setTimelineStatus({ status: mine.status, label: mine.statusLabel })
      }
    }
    const handleEvent = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as {
        actionId: string
        toStatus: string | null
        payload?: Record<string, unknown>
      } | undefined
      if (!detail || detail.eventType !== undefined === false) return
      // The event stream emits by actionId. We don't carry actionId on the
      // block, only confirmationToken — but the snapshot above tags us and
      // then the ledger row id is stable. To keep this simple we just
      // surface any phase/status label arriving for a token we track by
      // matching through the `payload.confirmationToken` when present.
      const payloadToken = (detail.payload as any)?.confirmationToken
      if (payloadToken && payloadToken !== confirmationToken) return
      if (detail.toStatus) {
        setTimelineStatus({
          status: detail.toStatus,
          label: timelineStatusLabel(detail.toStatus),
        })
      }
    }
    window.addEventListener('peridot:action-snapshot', handleSnapshot)
    window.addEventListener('peridot:action-event', handleEvent)
    return () => {
      window.removeEventListener('peridot:action-snapshot', handleSnapshot)
      window.removeEventListener('peridot:action-event', handleEvent)
    }
  }, [confirmationToken])

  // Persist terminal outcomes so remount hydration skips the busy-fallback.
  useEffect(() => {
    if (!confirmationToken) return
    if (status === 'success') {
      markBlockTerminal(confirmationToken, 'success', {
        amount: params.amount,
        pastTense: ACTION_TYPE_MAP[actionType]?.pastTense,
      })
    } else if (status === 'error') {
      markBlockTerminal(confirmationToken, 'error', { errorMessage: error ?? undefined })
    }
  }, [status, confirmationToken, params.amount, actionType, error])

  // Effective status = live hook state OR recovered timeline state. A block
  // that re-mounts after success has hook status='idle' but timelineStatus
  // will be 'succeeded' (hydrated from sessionStorage or the /timeline/action
  // endpoint). Without this unification the render tree falls through to the
  // busy fallback and sticks on "Working on your withdraw…" forever.
  const timelineIsSucceeded = timelineStatus?.status === 'succeeded'
  const timelineIsFailed =
    timelineStatus?.status === 'failed'
    || timelineStatus?.status === 'cancelled'
    || timelineStatus?.status === 'timeout'

  const isComplete = status === 'success' || timelineIsSucceeded
  const hasErrored = status === 'error' || timelineIsFailed
  const isBusy =
    !isComplete
    && !hasErrored
    && (status === 'fetching' || status === 'signing' || status === 'confirming' || status === 'verifying')
  const statusText = STATUS_CONFIG[status].text
  const statusColor = STATUS_CONFIG[status].color

  // Watchdog: if the busy state lingers too long, surface a stall warning.
  // Real cross-chain flows take ~30s, same-chain <15s. Anything beyond 60s is
  // almost certainly a stuck popup or dead listener — the user deserves to
  // know rather than stare at a spinner forever.
  const [isStalled, setIsStalled] = useState(false)
  useEffect(() => {
    if (!isBusy) {
      setIsStalled(false)
      return
    }
    const timer = setTimeout(() => setIsStalled(true), 60_000)
    return () => clearTimeout(timer)
  }, [isBusy])

  // Header amount: prefer netAmount when completed, otherwise the gross amount
  const displayAmount = useMemo(() => {
    const n = Number(params.amount)
    if (!isNaN(n)) {
      return n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `$${n.toFixed(2)}`
    }
    return `$${params.amount}`
  }, [params.amount])

  // ── Auto-execute inline card ─────────────────────────────────────
  if (isAutoExecuteEligible && !autoCancelled) {
    return (
      <div
        data-testid="action-button-block-auto"
        className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2"
      >
        {isComplete ? (
          // Short-circuit to the success card — covers both the live-success
          // path and the remount-hydration path (timelineStatus.succeeded).
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-green-500">
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-medium">
                {mapping.pastTense} {netAmount ?? displayAmount}
              </span>
            </div>
            {earnRate !== undefined && earnRate > 0 && actionType !== 'withdraw' && (
              <p className="text-xs text-muted-foreground">
                Earning {earnRate.toFixed(2)}% annually
              </p>
            )}
            {pointsAwarded && pointsAwarded > 0 ? (
              <p className="text-xs text-yellow-600 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                You earned {pointsAwarded} points
              </p>
            ) : null}
          </div>
        ) : hasErrored ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <XCircle className="w-4 h-4" />
              <span className="font-medium">{friendlyError(error)}</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  reset()
                  autoFiredRef.current = true
                  setAutoCancelled(true)
                  handleConfirm()
                }}
              >
                Confirm manually
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  reset()
                  autoFiredRef.current = false
                  setAutoCancelled(false)
                }}
              >
                Try again
              </Button>
            </div>
          </div>
        ) : status === 'idle' && !autoFiredRef.current ? (
          // Pre-dispatch countdown: user can still cancel.
          <>
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="font-medium">
                {mapping.verb} {displayAmount}
              </span>
            </div>
            {(netAmount || fee) && (
              <div className="text-xs text-muted-foreground space-y-0.5 pl-6">
                {netAmount && (
                  <div>
                    <span className="text-foreground/70">You'll deposit: </span>
                    <span className="font-mono font-medium text-foreground">{netAmount}</span>
                  </div>
                )}
                {fee && (
                  <div>
                    <span>Network fee: </span>
                    <span className="font-mono">
                      {fee.usdValue != null
                        ? `$${fee.usdValue.toFixed(2)}`
                        : `${fee.amount} ${params.assetSymbol}`}
                    </span>
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Starting in {autoCountdown}s… Perry will handle this automatically.
            </p>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => {
                autoFiredRef.current = true
                setAutoCancelled(true)
              }}
            >
              Cancel — I'll confirm it myself
            </button>
          </>
        ) : status === 'success' ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-green-500">
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-medium">
                {mapping.pastTense} {netAmount ?? displayAmount}
              </span>
            </div>
            {earnRate !== undefined && earnRate > 0 && actionType !== 'withdraw' && (
              <p className="text-xs text-muted-foreground">
                Earning {earnRate.toFixed(2)}% annually
              </p>
            )}
            {pointsAwarded && pointsAwarded > 0 ? (
              <p className="text-xs text-yellow-600 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                You earned {pointsAwarded} points
              </p>
            ) : null}
          </div>
        ) : status === 'error' ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <XCircle className="w-4 h-4" />
              <span className="font-medium">{friendlyError(error)}</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  reset()
                  autoFiredRef.current = true
                  setAutoCancelled(true)
                  handleConfirm()
                }}
              >
                Confirm manually
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  reset()
                  autoFiredRef.current = false
                  setAutoCancelled(false)
                }}
              >
                Try again
              </Button>
            </div>
          </div>
        ) : (
          // Busy states: 'fetching' | 'signing' | 'confirming' | 'verifying'
          // Show progressive copy matched to the actual state so the user sees
          // forward motion. After 60s the watchdog surfaces a "taking longer
          // than expected" hint with an opt-out.
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="font-medium">
                {phaseMessage
                  ? phaseMessage
                  : status === 'fetching'
                    ? `Preparing your ${mapping.verb.toLowerCase()}…`
                    : status === 'signing'
                      ? `Signing your ${mapping.verb.toLowerCase()}…`
                      : status === 'confirming'
                        ? `Processing your ${mapping.verb.toLowerCase()}…`
                        : status === 'verifying'
                          ? `Almost done — checking the result…`
                          : `Working on your ${mapping.verb.toLowerCase()}…`}
              </span>
            </div>
            {isStalled && (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  This is taking longer than usual. The network might be slow,
                  or something got stuck.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      reset()
                      autoFiredRef.current = true
                      setAutoCancelled(true)
                    }}
                  >
                    Cancel and try again
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Inline busy/success/error card (manual-path) ──────────────
  // When status leaves 'idle' through the direct-fire button path, render an
  // inline card instead of opening a modal. Removes the double-click friction
  // (tap chat button → tap modal Confirm button) the user complained about:
  // now a single tap on the chat button goes straight to the wallet popup,
  // and the inline card shows progress without blocking the rest of the chat.
  if (isBusy || isComplete || hasErrored) {
    return (
      <div
        data-testid="action-button-block-inline"
        className={cn(
          'rounded-xl border p-4 space-y-2',
          isComplete
            ? 'border-green-500/30 bg-green-500/5'
            : hasErrored
              ? 'border-destructive/30 bg-destructive/5'
              : 'border-primary/30 bg-primary/5',
        )}
      >
        {isBusy && (
          <>
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="font-medium">
                {/* Priority: live timeline (SSE) > client phase event > status default.
                    Timeline wins because it reflects server-authoritative state even
                    after poller transitions (bridging → executing → succeeded). */}
                {timelineStatus?.label && timelineStatus.status !== 'proposed'
                  ? timelineStatus.label + '…'
                  : phaseMessage
                    ? phaseMessage
                    : status === 'fetching'
                      ? `Preparing your ${mapping.verb.toLowerCase()}…`
                      : status === 'signing'
                        ? `Opening your wallet — tap Confirm when it appears`
                        : status === 'confirming'
                          ? `Processing your ${mapping.verb.toLowerCase()}…`
                          : `Almost done — checking the result…`}
              </span>
            </div>
            <TimedProgress estimatedSeconds={seconds} isActive={isBusy} />
            {seconds > 10 && (
              <p className="text-xs text-muted-foreground">
                Usually takes ~{seconds} seconds
              </p>
            )}
            {isStalled && (
              <div className="text-xs text-muted-foreground pt-1 border-t border-border/40">
                <p className="mb-2">
                  Taking longer than usual. Tap to cancel and try again.
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    reset()
                    autoFiredRef.current = false
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </>
        )}

        {isComplete && (
          <>
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-medium">
                {mapping.pastTense} {netAmount ?? displayAmount}
              </span>
            </div>
            {earnRate !== undefined && earnRate > 0 && actionType !== 'withdraw' && (
              <p className="text-xs text-muted-foreground pl-6">
                Earning {earnRate.toFixed(2)}% annually
              </p>
            )}
            {pointsAwarded && pointsAwarded > 0 && (
              <p className="text-xs text-yellow-600 flex items-center gap-1.5 pl-6">
                <Sparkles className="w-3 h-3" />
                You earned {pointsAwarded} points
              </p>
            )}
          </>
        )}

        {hasErrored && (
          <>
            <div className="flex items-center gap-2 text-sm text-destructive">
              <XCircle className="w-4 h-4" />
              <span className="font-medium">{friendlyError(error)}</span>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  reset()
                  autoFiredRef.current = false
                }}
              >
                Dismiss
              </Button>
              <Button size="sm" onClick={handleRetry}>
                Try again
              </Button>
            </div>
            {error && (
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
              >
                {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Details
              </button>
            )}
            {showDetails && error && (
              <div className="px-3 py-2 bg-muted/40 rounded text-xs font-mono text-muted-foreground break-words">
                {error}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Idle trigger button — direct-fire (no confirmation modal).
          The wallet popup is the real confirmation step; adding an in-chat
          "Are you sure?" modal just doubled the clicks without adding safety. */}
      <Button
        onClick={() => {
          if (isComplete) return
          reset()
          handleConfirm()
        }}
        disabled={isComplete}
        data-testid="action-button-trigger"
        data-action-type={actionType}
        data-action-status={isComplete ? 'complete' : 'idle'}
        className={cn(
          'rounded-xl gap-2 border transition-all',
          isComplete
            ? 'bg-green-500/10 text-green-500 border-green-500/30 cursor-default'
            : 'bg-primary/10 text-primary hover:bg-primary/20 border-primary/30',
        )}
        variant="ghost"
      >
        {isComplete ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : (
          <ArrowRight className="w-4 h-4" />
        )}
        {isComplete ? mapping.pastTense : label}
      </Button>

      {/* Legacy dialog retained only for auto-execute-cancelled path tests —
          non-auto users no longer open it. Render only when status !== 'idle'
          in the manual flow (i.e. never, since the inline card handles those). */}
      <Dialog open={showDialog} onOpenChange={(open) => !isBusy && setShowDialog(open)}>
        <DialogContent className="sm:max-w-md">
          {/* ── Idle state: confirmation ─────────────────────────── */}
          {status === 'idle' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-baseline gap-2">
                  <span>{mapping.verb}</span>
                  <span className="text-primary">{displayAmount}</span>
                </DialogTitle>
                {earnRate !== undefined && earnRate > 0 && (
                  <DialogDescription>
                    You'll earn ~{earnRate.toFixed(2)}% annually
                  </DialogDescription>
                )}
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Net amount — the single, prominent number */}
                {netAmount && (
                  <div className="flex justify-between items-baseline px-4 py-3 bg-muted/40 rounded-lg">
                    <span className="text-sm text-muted-foreground">You'll receive</span>
                    <span className="text-lg font-semibold font-mono">{netAmount}</span>
                  </div>
                )}

                {/* Estimated time */}
                {seconds > 10 && (
                  <div className="text-center text-xs text-muted-foreground">
                    Usually takes ~{seconds} seconds
                  </div>
                )}

                {/* Details (collapsible) */}
                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  Details
                </button>

                {showDetails && (
                  <div className="space-y-1.5 text-xs pl-4 border-l border-border/40">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Asset</span>
                      <span className="font-mono">{params.assetSymbol}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-mono">{displayAmount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Network fee</span>
                      {gasEstimate.isLoading ? (
                        <span className="text-muted-foreground/60">Estimating...</span>
                      ) : gasEstimate.feeUsd !== null ? (
                        <span className="font-mono">
                          ~${gasEstimate.feeUsd < 0.01 ? '<0.01' : gasEstimate.feeUsd.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleConfirm} className="gap-2">
                  {mapping.confirmLabel}
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ── Busy state: generic progress ─────────────────────── */}
          {isBusy && (
            <>
              <DialogHeader>
                <DialogTitle>Processing your {mapping.verb.toLowerCase()}...</DialogTitle>
                <DialogDescription>{statusText}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-6">
                <div className="flex items-center justify-center">
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                </div>
                <TimedProgress estimatedSeconds={seconds} isActive={isBusy} />
                <p className="text-center text-xs text-muted-foreground">
                  Usually takes ~{seconds} seconds
                </p>
              </div>
            </>
          )}

          {/* ── Success state ────────────────────────────────────── */}
          {status === 'success' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-green-500">
                  <CheckCircle2 className="w-5 h-5" />
                  {mapping.pastTense}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3 py-4">
                <div className="text-center">
                  <div className="text-2xl font-semibold font-mono">
                    {netAmount ?? displayAmount}
                  </div>
                  {earnRate !== undefined && earnRate > 0 && actionType !== 'withdraw' && (
                    <div className="text-sm text-muted-foreground mt-1">
                      Earning {earnRate.toFixed(2)}% annually
                    </div>
                  )}
                </div>

                {pointsAwarded && pointsAwarded > 0 && (
                  <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <Sparkles className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm text-yellow-600 font-medium">
                      You earned {pointsAwarded} points
                    </span>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button onClick={() => setShowDialog(false)} className="w-full">
                  Done
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ── Error state ──────────────────────────────────────── */}
          {status === 'error' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <XCircle className="w-5 h-5" />
                  {statusText}
                </DialogTitle>
                <DialogDescription>{friendlyError(error)}</DialogDescription>
              </DialogHeader>

              <div className="py-2">
                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  Details
                </button>
                {showDetails && error && (
                  <div className="mt-2 px-3 py-2 bg-muted/40 rounded text-xs font-mono text-muted-foreground break-words">
                    {error}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => {
                    reset()
                    setShowDialog(false)
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleRetry}>Try again</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
