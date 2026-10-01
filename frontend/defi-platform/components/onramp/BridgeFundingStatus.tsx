'use client'

import { Banknote, Loader2, ChevronRight, ArrowUpRight, AlertTriangle } from 'lucide-react'
import { usePrivy } from '@privy-io/react-auth'
import { cn } from '@/lib/utils'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { useBridgeOnramp } from '@/hooks/use-bridge-onramp'
import { useBridgeBalance } from '@/hooks/use-bridge-balance'
import { useBridgePayout } from '@/hooks/use-bridge-payout'
import { useBridgePayoutAddress } from '@/hooks/use-bridge-payout-address'
import { OnrampProgress } from './OnrampProgress'
import { isBridgeUpgradeMaintenance } from './BridgeUpgradeNotice'

/**
 * Persistent, always-reachable view of the user's bank-transfer (Bridge) state.
 *
 * Answers, in one compact card, the question a returning SEPA user actually has
 * — "where's my money and what do I do next?" — across the whole lifecycle:
 * verification in progress, money on the way, money landed (with a one-tap
 * "move to my wallet"), and the custody-stranded case. Mounted in the two
 * places a user goes to add money: the manage-wallet modal's funding section
 * and the Easy "Add money" flow.
 *
 * Adaptive by design: renders `null` when there is genuinely nothing to show
 * (brand-new user, no transfer started, no balance) so it never collides with
 * or clutters the host surface.
 */
export function BridgeFundingStatus({
  onOpenDetails,
  className,
  showSetupWhenEmpty = false,
  showIdleActive = true,
}: {
  /** Opens the full bank flow (IBAN + transfer history) in the host. */
  onOpenDetails?: () => void
  className?: string
  /**
   * When the user never started a bank transfer, render an inviting setup row
   * instead of nothing. Used where the bank method must stay discoverable
   * (manage-wallet funding tab); the default `null` keeps status-only hosts
   * (overview, Add-money chooser) clean.
   */
  showSetupWhenEmpty?: boolean
  /**
   * Whether to render the "bank transfer ready" card when the account exists
   * but nothing is moving. Hosts that already show the account itself (the
   * funding tab, which mounts `BankAccountSummary` above this) pass `false`
   * rather than repeating the same message twice in a row.
   */
  showIdleActive?: boolean
}) {
  const { authenticated } = usePrivy()
  const enabled = FEATURE_FLAGS.FIAT_ONRAMP_BRIDGE && authenticated

  const onramp = useBridgeOnramp(enabled)
  const balance = useBridgeBalance(enabled)
  const payout = useBridgePayout()
  const payoutAddress = useBridgePayoutAddress(enabled)

  if (!enabled) return null

  const state = onramp.state
  const available = balance.eurc.available + balance.usdc.available
  const pending = balance.eurc.pending + balance.usdc.pending
  const hasMoney = available > 0 || pending > 0
  const inProgress =
    state === 'tos_pending' ||
    state === 'kyc_in_progress' ||
    state === 'sepa_pending' ||
    state === 'ready' ||
    state === 'kyc_rejected'

  // Nothing in flight and no balance → render nothing (status-only hosts) or
  // an inviting setup row (hosts where the method must stay discoverable).
  if (!hasMoney && !inProgress && state !== 'active') {
    if (!showSetupWhenEmpty || !onOpenDetails) return null
    return (
      <button
        type="button"
        onClick={onOpenDetails}
        className={cn(
          'group w-full flex items-center gap-3.5 rounded-2xl p-3.5 text-left',
          'border border-border/50 bg-gradient-to-br from-card/90 to-card/60',
          'hover:border-primary/30 transition-all duration-200',
          className,
        )}
      >
        <div className="shrink-0 h-10 w-10 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
          <Banknote className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Set up bank transfers</p>
          <p className="text-xs text-muted-foreground">
            One-time verification, then send euros from your bank anytime.
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
      </button>
    )
  }

  const hasPayoutAddress = Boolean(payoutAddress.address)
  const custodyStranded = available > 0 && !hasPayoutAddress
  // Withdraw the bucket that actually holds settled funds.
  const withdrawCurrency = balance.eurc.available > 0 ? 'eurc' : 'usdc'
  const withdrawFiat = withdrawCurrency === 'eurc' ? 'EUR' : 'USD'

  const fmtEur = (n: number) =>
    n.toLocaleString(undefined, { style: 'currency', currency: 'EUR' })

  const cardBase = cn(
    'rounded-2xl border px-4 py-3.5',
    'bg-gradient-to-br from-card/90 to-card/60',
    className,
  )

  // ── Money present (landed and/or on the way) ──────────────────────────────
  if (hasMoney) {
    return (
      <div className={cn(cardBase, 'border-emerald-500/25')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-emerald-700/70 dark:text-emerald-400/70">
              Your balance
            </p>
            <p className="text-2xl font-black tabular-nums text-emerald-700 dark:text-emerald-400">
              {fmtEur(available)}
            </p>
            {pending > 0 && (
              <p className="text-xs text-emerald-700/70 dark:text-emerald-400/70 mt-0.5">
                +{fmtEur(pending)} on the way
              </p>
            )}
          </div>
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/15 ring-1 ring-emerald-500/25">
            <Banknote className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>

        {/* During the Sep 2026 partner upgrade a pending transfer really can
            sit for hours — say so here, where the user watches it, instead of
            letting "on the way" quietly look stuck. */}
        {pending > 0 && isBridgeUpgradeMaintenance() && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
            We&apos;re upgrading bank transfers today — money on the way may take
            a few hours longer than usual.
          </p>
        )}

        {custodyStranded ? (
          <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                Your {fmtEur(available)} is waiting. Link your wallet to move it across.
              </p>
            </div>
            {onOpenDetails && (
              <button
                type="button"
                onClick={onOpenDetails}
                className="mt-2 w-full h-9 rounded-lg text-xs font-semibold text-amber-800 dark:text-amber-300 bg-background/60 border border-amber-400/40 hover:bg-amber-400/15 transition-colors"
              >
                Set up my wallet
              </button>
            )}
          </div>
        ) : (
          available > 0 && (
            <button
              type="button"
              onClick={() => payout.withdraw({ currency: withdrawCurrency })}
              disabled={payout.isPending}
              className="mt-3 w-full h-10 rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-background/60 border border-emerald-500/30 hover:bg-emerald-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {payout.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ArrowUpRight className="h-4 w-4" />
                  Move to my Stellar wallet
                </>
              )}
            </button>
          )
        )}

        {onOpenDetails && (
          <button
            type="button"
            onClick={onOpenDetails}
            className="mt-2 w-full flex items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Bank details &amp; history
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
    )
  }

  // ── Verification / setup in progress (no money yet) ───────────────────────
  if (inProgress) {
    return (
      <div className={cn(cardBase, 'border-border/50')}>
        <OnrampProgress state={state} isFetching={onramp.isFetching} />
        {onOpenDetails && (
          <button
            type="button"
            onClick={onOpenDetails}
            className="mt-3 w-full h-10 rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 border border-primary/25 hover:bg-primary/15 transition-colors"
          >
            {state === 'kyc_rejected' ? 'See what went wrong' : 'Continue setup'}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    )
  }

  // ── Active, bank set up, no money yet ─────────────────────────────────────
  if (!showIdleActive) return null
  return (
    <div className={cn(cardBase, 'border-border/50')}>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 ring-1 ring-primary/20">
          <Banknote className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Bank transfer ready</p>
          <p className="text-xs text-muted-foreground">Send euros from your bank anytime.</p>
        </div>
      </div>
      {onOpenDetails && (
        <button
          type="button"
          onClick={onOpenDetails}
          className="mt-3 w-full flex items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          View bank details
          <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
