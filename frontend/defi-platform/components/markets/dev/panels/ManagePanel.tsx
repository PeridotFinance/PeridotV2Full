"use client"

/**
 * Withdraw, Repay, and the Collateral toggle.
 *
 * There used to be a single "Manage" tab wrapping all three. It was split:
 * Withdraw and Repay are now top-level tabs of their own (next to Supply
 * and Borrow), and the collateral toggle sits above the tab bar. Reason:
 * Supply/Borrow are verbs, "Manage" was a noun — the two inverse actions
 * users look for most were hidden two clicks deep behind a junk-drawer
 * label, under a second, differently-styled navigation level.
 * This file keeps all three surfaces because they share ActionForm, the
 * collateral view, and the EVM/Stellar branching below.
 *
 * Design decisions:
 * - CollateralToggle above the tab bar, always visible (FastAssetPanel).
 *   Reason: Collateral status affects max borrow on ALL assets.
 *   It's a position setting, not an action — and the user should be able
 *   to read it without first entering an action tab.
 * - Toggle: pill switch (ON/OFF), NOT a checkbox.
 *   Reason: Fintech apps use toggles for binary on/off settings.
 *   Checkbox = form input. Toggle = setting.
 * - Destructive style for "disable" when collateral is currently on.
 *   Reason: Disabling collateral reduces borrow power → could cause
 *   liquidation if user has borrowed. Visual weight = cognitive weight.
 * - Empty state when no position (supply = 0, borrow = 0).
 *   Reason: Showing empty Withdraw/Repay forms is confusing and wasteful.
 *   This is also why the tabs aren't dimmed by balance: NoPosition says
 *   exactly what's missing, and useBorrowBalance is EVM-only, so a
 *   balance-driven dim would read as permanently empty on Stellar.
 *
 * Stellar branching:
 * - The Soroban deployment exposes its own enter/exit market controller
 *   plus user-balance reads, so each section gets a Stellar variant that
 *   uses the matching Freighter-signed hooks. The toggle behaves the same
 *   way conceptually but talks to the Soroban controller.
 */

import React, { useState, useMemo, useEffect } from 'react'
import { Asset } from '@/types/markets'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'
import { useQuery } from '@tanstack/react-query'
import { usePTokenBalance } from '@/hooks/use-ptoken-balance'
import { useBorrowBalance } from '@/hooks/use-borrow-balance'
import { useRedeemTransaction } from '@/hooks/use-redeem-transaction'
import { useStellarRedeemTransaction } from '@/hooks/use-stellar-redeem-transaction'
import { CrossChainWithdrawSection } from '@/components/funding/CrossChainWithdrawSection'
import { useRepayTransaction } from '@/hooks/use-repay-transaction'
import { useStellarRepayTransaction } from '@/hooks/use-stellar-repay-transaction'
import { useBorrowingPower } from '@/hooks/use-borrowing-power'
import useEnableCollateralTransaction from '@/hooks/use-enable-collateral-transaction'
import { useExitMarket } from '@/hooks/use-exit-market'
import {
  getStellarVaultConfig,
  stellarEnterMarket,
  stellarExitMarket,
  stellarGetUserMarkets,
  stellarGetBorrowBalance,
} from '@/lib/stellar-soroban-lending'
import { Loader2, CheckCircle2, ShieldCheck, ShieldOff, TrendingDown, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import AmountInput from '../ui/AmountInput'
import ConnectPrompt from '../ui/ConnectPrompt'
import { motion, AnimatePresence } from 'framer-motion'
import { useTxBusyPhase } from '@/hooks/use-tx-busy-phase'
import { ButtonProgress } from '@/components/easy/ButtonProgress'

// ── EVM Collateral Toggle ────────────────────────────────────────────
/**
 * Full enable/disable collateral toggle.
 *
 * UX: 2-step confirm for disable.
 *   Step 1: Tap toggle when ON → inline warning appears (not a modal)
 *   Step 2: Tap "Disable collateral" → executeExitMarket()
 *   Cancel: dismisses warning, toggle stays ON.
 *
 * Why 2-step:
 *   Disabling collateral reduces borrowing power. If user has loans, this
 *   can push them toward liquidation. One-tap disable on a toggle = too easy.
 *   But we let the contract be the final arbiter — exitMarket reverts if
 *   debt > 0, hook surfaces error cleanly.
 *
 * Why not a modal:
 *   Inline warning = no z-index issues on mobile, no focus trap complexity,
 *   faster dismiss. The confirm is serious but not irreversible.
 */
function CollateralToggle({ asset }: { asset: Asset }) {
  const [confirmingDisable, setConfirmingDisable] = useState(false)

  const { borrowingPower, isLoading: powerLoading } = useBorrowingPower()

  // Enable hook
  const {
    executeEnableCollateral,
    step: enableStep,
    error: enableError,
    reset: resetEnable,
  } = useEnableCollateralTransaction({ assetId: asset.id })

  // Disable hook
  const {
    executeExitMarket,
    step: exitStep,
    error: exitError,
    isLoading: exitLoading,
    reset: resetExit,
  } = useExitMarket({
    assetId: asset.id,
    onSuccess: () => {
      setConfirmingDisable(false)
      toast.success(`${asset.symbol} removed from collateral`, {
        description: 'Your borrowing power has been updated',
        duration: 4000,
      })
    },
    onError: (err) => {
      setConfirmingDisable(false)
      toast.error('Disable collateral failed', {
        description: err.message.includes('exitMarket')
          ? 'You may still have an active borrow using this collateral'
          : err.message,
        duration: 5000,
      })
    },
  })

  const isEnabled = borrowingPower.collateralAssets.some(ca => ca.assetId === asset.id)
  const enableLoading = enableStep === 'entering'
  const isLoading = enableLoading || exitLoading
  const isEnableError = enableStep === 'error'

  // Toast on enable success/error
  const prevEnableStep = React.useRef(enableStep)
  React.useEffect(() => {
    if (prevEnableStep.current === enableStep) return
    prevEnableStep.current = enableStep
    if (enableStep === 'success') {
      toast.success(`${asset.symbol} enabled as collateral`, {
        description: 'Your borrowing power has increased',
        duration: 4000,
      })
    }
    if (enableStep === 'error' && enableError) {
      toast.error('Collateral enable failed', {
        description: typeof enableError === 'string' ? enableError : 'Transaction rejected',
        duration: 5000,
      })
    }
  }, [enableStep, enableError, asset.symbol])

  function handleToggleTap() {
    if (isLoading) return
    if (isEnableError) { resetEnable(); return }
    if (exitStep === 'error') { resetExit(); return }
    if (isEnabled) {
      setConfirmingDisable(true) // show inline confirm
    } else {
      executeEnableCollateral()
    }
  }

  if (powerLoading) {
    return <div className="h-[62px] glass rounded-2xl animate-pulse" />
  }

  return (
    <CollateralToggleView
      symbol={asset.symbol}
      isEnabled={isEnabled}
      isLoading={isLoading}
      hasError={isEnableError || exitStep === 'error'}
      isDisabling={exitLoading}
      confirmingDisable={confirmingDisable}
      onToggleTap={handleToggleTap}
      onCancelDisable={() => setConfirmingDisable(false)}
      onConfirmDisable={() => executeExitMarket()}
    />
  )
}

// ── Stellar Collateral Toggle ────────────────────────────────────────
function CollateralToggleStellar({ asset }: { asset: Asset }) {
  const config = getStellarVaultConfig(asset.id)!
  const { address } = useStellarWallet()
  const [confirmingDisable, setConfirmingDisable] = useState(false)
  const [busy, setBusy] = useState<null | 'enabling' | 'disabling'>(null)
  const [hasError, setHasError] = useState(false)

  // Read user-entered markets (collateral state).
  const {
    data: userMarkets,
    isLoading: marketsLoading,
    refetch: refetchMarkets,
  } = useQuery({
    queryKey: ['stellar-user-markets', address],
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: () => stellarGetUserMarkets(address!),
  })

  const isEnabled = useMemo(() => {
    if (!userMarkets) return false
    return userMarkets.some((id) => id === config.vaultId)
  }, [userMarkets, config.vaultId])

  async function executeEnable() {
    if (!address || busy) return
    setHasError(false)
    setBusy('enabling')
    try {
      await stellarEnterMarket(address, config.vaultId)
      await refetchMarkets()
      toast.success(`${asset.symbol} enabled as collateral`, {
        description: 'Your borrowing power has increased',
        duration: 4000,
      })
    } catch (e) {
      setHasError(true)
      toast.error('Collateral enable failed', {
        description: e instanceof Error ? e.message : 'Transaction rejected',
        duration: 5000,
      })
    } finally {
      setBusy(null)
    }
  }

  async function executeDisable() {
    if (!address || busy) return
    setHasError(false)
    setBusy('disabling')
    try {
      await stellarExitMarket(address, config.vaultId)
      await refetchMarkets()
      setConfirmingDisable(false)
      toast.success(`${asset.symbol} removed from collateral`, {
        description: 'Your borrowing power has been updated',
        duration: 4000,
      })
    } catch (e) {
      setHasError(true)
      setConfirmingDisable(false)
      const msg = e instanceof Error ? e.message : 'Transaction rejected'
      toast.error('Disable collateral failed', {
        description: /borrow|debt|liquid/i.test(msg)
          ? 'You may still have an active borrow using this collateral'
          : msg,
        duration: 5000,
      })
    } finally {
      setBusy(null)
    }
  }

  function handleToggleTap() {
    if (busy) return
    if (hasError) { setHasError(false); return }
    if (isEnabled) {
      setConfirmingDisable(true)
    } else {
      executeEnable()
    }
  }

  if (marketsLoading && !userMarkets) {
    return <div className="h-[62px] glass rounded-2xl animate-pulse" />
  }

  return (
    <CollateralToggleView
      symbol={asset.symbol}
      isEnabled={isEnabled}
      isLoading={!!busy}
      hasError={hasError}
      isDisabling={busy === 'disabling'}
      confirmingDisable={confirmingDisable}
      onToggleTap={handleToggleTap}
      onCancelDisable={() => setConfirmingDisable(false)}
      onConfirmDisable={() => executeDisable()}
    />
  )
}

// ── Shared collateral toggle view ───────────────────────────────────
function CollateralToggleView({
  symbol,
  isEnabled,
  isLoading,
  hasError,
  isDisabling,
  confirmingDisable,
  onToggleTap,
  onCancelDisable,
  onConfirmDisable,
}: {
  symbol: string
  isEnabled: boolean
  isLoading: boolean
  hasError: boolean
  isDisabling: boolean
  confirmingDisable: boolean
  onToggleTap: () => void
  onCancelDisable: () => void
  onConfirmDisable: () => void
}) {
  return (
    <div className={cn(
      "rounded-2xl border transition-all duration-200",
      isEnabled
        ? "glass border-emerald-500/20 bg-emerald-500/[0.04]"
        : hasError
        ? "glass border-destructive/30 bg-destructive/[0.03]"
        : "glass border-[var(--border-cyber)]"
    )}>

      {/* ── Main row ── */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            "w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0",
            isEnabled ? "bg-emerald-500/15" : "bg-white/[0.05]"
          )}>
            {isEnabled
              ? <ShieldCheck className="w-4 h-4 text-emerald-400" />
              : <ShieldOff className="w-4 h-4 text-muted-foreground/50" />
            }
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">
              {isEnabled ? 'Collateral enabled' : 'Use as collateral'}
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">
              {hasError
                ? <span className="text-destructive/80">Failed — tap to retry</span>
                : isDisabling
                ? <span className="text-amber-400/80 animate-pulse">Disabling...</span>
                : isEnabled
                ? <span className="text-emerald-400/60">Tap toggle to disable</span>
                : `Enable to use ${symbol} as collateral`
              }
            </p>
          </div>
        </div>

        {/* Toggle pill */}
        <button
          onClick={onToggleTap}
          disabled={isLoading}
          aria-label={isEnabled ? 'Disable collateral' : 'Enable collateral'}
          className={cn(
            "relative ml-3 w-11 h-6 rounded-full transition-all duration-300",
            "flex-shrink-0 focus:outline-none",
            isLoading ? "cursor-wait" : "cursor-pointer",
            isEnabled
              ? "bg-emerald-500/80 shadow-[0_0_10px_rgba(16,185,129,0.2)] hover:bg-emerald-500/60"
              : hasError
              ? "bg-destructive/50 hover:bg-destructive/60"
              : "bg-white/[0.10] hover:bg-white/[0.15]"
          )}
        >
          <span className={cn(
            "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm",
            "transition-all duration-300",
            isEnabled ? "left-[calc(100%-1.375rem)]" : "left-0.5"
          )} />
          {isLoading && (
            <Loader2 className="absolute inset-0 m-auto w-3 h-3 animate-spin text-white/80" />
          )}
        </button>
      </div>

      {/* ── Inline confirm-disable panel ── */}
      <div
        className="grid transition-[grid-template-rows] duration-200"
        style={{ gridTemplateRows: confirmingDisable ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden min-h-0">
          <div className="px-4 pb-4 space-y-3">
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-400/[0.06] border border-amber-400/15">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-400/80 leading-relaxed">
                Disabling collateral reduces your borrowing power. If you have active loans,
                this may move your account toward liquidation. The transaction will revert
                automatically if your debt prevents it.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onCancelDisable}
                className="h-9 rounded-xl text-sm font-medium glass border border-[var(--border-cyber)] text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirmDisable}
                className="h-9 rounded-xl text-sm font-semibold bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 transition-colors active:scale-[0.97]"
              >
                Disable collateral
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}

// ── EVM Withdraw ─────────────────────────────────────────────────────
function WithdrawSection({ asset }: { asset: Asset }) {
  const [amount, setAmount] = useState('')
  // numericBalance — formattedBalance is locale-grouped and parsing it back
  // truncates the amount (see AmountInput.maxAmount).
  const { numericBalance, decimals } = usePTokenBalance({ assetId: asset.id })
  const maxWithdraw = numericBalance ?? 0
  const hasPosition = (numericBalance ?? 0) > 0.000001

  const { executeRedeem, isLoading, step, error, reset, statusMessage } = useRedeemTransaction({
    assetId: asset.id,
    amount,
    redeemType: 'underlying',
    onSuccess: () => {
      setAmount('')
      toast.success(`Withdrew ${asset.symbol}`, { duration: 4000 })
    },
  })

  if (!hasPosition) {
    return <NoPosition message={`No supplied ${asset.symbol} to withdraw`} icon="trending-down" />
  }

  return (
    <ActionForm
      asset={asset}
      amount={amount}
      setAmount={setAmount}
      maxAmount={maxWithdraw}
      maxLabel="Supplied"
      decimals={decimals}
      isLoading={isLoading}
      step={step}
      error={error}
      statusMessage={statusMessage}
      reset={reset}
      execute={executeRedeem}
      verb="Withdraw"
      verbActive="Withdrawing"
      verbDone="Withdrawn"
      variant="withdraw"
    />
  )
}

// ── Stellar Withdraw ─────────────────────────────────────────────────
function WithdrawSectionStellar({ asset }: { asset: Asset }) {
  const [amount, setAmount] = useState('')
  // usePTokenBalance keys the Stellar path off the Soroban asset id alone.
  // It used to gate on the selected network, which the Stellar-only host can
  // never satisfy — so this read came back empty and Withdraw claimed there
  // was nothing supplied right after a successful deposit.
  // numericBalance — formattedBalance is locale-grouped and parsing it back
  // truncates the amount (see AmountInput.maxAmount).
  const { numericBalance, decimals } = usePTokenBalance({ assetId: asset.id })
  const maxWithdraw = numericBalance ?? 0
  const hasPosition = (numericBalance ?? 0) > 0.000001

  // Treat an effectively-full withdraw as a FULL withdraw so the Stellar path redeems
  // the exact pToken balance instead of an underlying-denominated amount. The latter
  // rounds down and leaves pToken "dust", which blocks exiting the market and keeps it
  // in the borrow liquidity loop (→ borrow traps / "No borrowing power"). 1% tolerance
  // absorbs Max-button rounding; stellarWithdrawAll redeems the exact balance regardless.
  const isFull = useMemo(() => {
    const supplied = numericBalance ?? 0
    if (supplied <= 0) return false
    const requested = parseFloat(amount)
    if (!Number.isFinite(requested) || requested <= 0) return false
    return requested >= supplied * 0.99
  }, [amount, numericBalance])

  const { executeRedeem, isLoading, step, error, reset, statusMessage } = useStellarRedeemTransaction({
    assetId: asset.id,
    amount,
    fullWithdraw: isFull,
    onSuccess: () => {
      setAmount('')
      toast.success(`Withdrew ${asset.symbol}`, { duration: 4000 })
    },
  })

  const form = hasPosition ? (
    <ActionForm
      asset={asset}
      amount={amount}
      setAmount={setAmount}
      maxAmount={maxWithdraw}
      maxLabel="Supplied"
      decimals={decimals}
      isLoading={isLoading}
      step={step}
      error={error}
      statusMessage={statusMessage}
      reset={reset}
      execute={executeRedeem}
      verb="Withdraw"
      verbActive="Withdrawing"
      verbDone="Withdrawn"
      variant="withdraw"
    />
  ) : (
    <NoPosition message={`No supplied ${asset.symbol} to withdraw`} icon="trending-down" />
  )

  // "Receive on" another network (stage X4). Outside the Expert view's
  // CrossChainFlowProvider, or for a market with no route, it renders the form
  // above unchanged. It also keeps a running withdrawal's steps on screen after
  // the position went to zero.
  return (
    <CrossChainWithdrawSection
      asset={asset}
      supplied={maxWithdraw}
      hasPosition={hasPosition}
      stellarForm={form}
      stellarBusy={isLoading}
    />
  )
}

// ── EVM Repay ────────────────────────────────────────────────────────
function RepaySection({ asset }: { asset: Asset }) {
  const [amount, setAmount] = useState('')
  const { numericBalance, decimals } = useBorrowBalance({ assetId: asset.id })
  const maxRepay = numericBalance ?? 0
  const hasDebt = (numericBalance ?? 0) > 0.000001

  const { executeRepay, isLoading, step, error, reset, needsApproval, statusMessage } = useRepayTransaction({
    assetId: asset.id,
    amount,
    onSuccess: () => {
      setAmount('')
      toast.success(`Repaid ${asset.symbol}`, {
        description: 'Your debt has been reduced',
        duration: 4000,
      })
    },
  })

  if (!hasDebt) {
    return <NoPosition message={`No ${asset.symbol} debt to repay`} icon="check" />
  }

  return (
    <ActionForm
      asset={asset}
      amount={amount}
      setAmount={setAmount}
      maxAmount={maxRepay}
      maxLabel="Borrowed"
      decimals={decimals}
      isLoading={isLoading}
      step={step}
      error={error}
      statusMessage={statusMessage}
      reset={reset}
      execute={executeRepay}
      verb={needsApproval ? `Approve ${asset.symbol}` : 'Repay'}
      verbActive={needsApproval ? 'Approving' : 'Repaying'}
      verbDone="Repaid"
      variant="repay"
    />
  )
}

// ── Stellar Repay ────────────────────────────────────────────────────
function RepaySectionStellar({ asset }: { asset: Asset }) {
  const [amount, setAmount] = useState('')
  const config = getStellarVaultConfig(asset.id)!
  const { address } = useStellarWallet()

  // Borrow balance: useBorrowBalance is EVM-only, so pull from the Soroban
  // vault directly. Refetch on tx-success keeps the form in sync after
  // partial repays.
  const {
    data: borrowedNumeric,
    isLoading: borrowLoading,
    refetch: refetchBorrow,
  } = useQuery({
    queryKey: ['stellar-borrow-balance', config.vaultId, address],
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const raw = await stellarGetBorrowBalance(config.vaultId, address!)
      try {
        return Number(BigInt(raw)) / Math.pow(10, config.decimals)
      } catch {
        return 0
      }
    },
  })

  useEffect(() => {
    const handler = () => { try { refetchBorrow() } catch {} }
    window.addEventListener('peridot:tx-success' as any, handler)
    return () => window.removeEventListener('peridot:tx-success' as any, handler)
  }, [refetchBorrow])

  const owed = borrowedNumeric ?? 0
  const hasDebt = owed > 0.000001
  const maxRepay = hasDebt ? owed : 0
  const decimals = config.decimals

  const { executeRepay, isLoading, step, error, reset, statusMessage } = useStellarRepayTransaction({
    assetId: asset.id,
    amount,
    onSuccess: () => {
      setAmount('')
      refetchBorrow()
      toast.success(`Repaid ${asset.symbol}`, {
        description: 'Your debt has been reduced',
        duration: 4000,
      })
    },
  })

  if (borrowLoading && borrowedNumeric == null) {
    return <div className="h-32 glass rounded-2xl animate-pulse" />
  }

  if (!hasDebt) {
    return <NoPosition message={`No ${asset.symbol} debt to repay`} icon="check" />
  }

  return (
    <ActionForm
      asset={asset}
      amount={amount}
      setAmount={setAmount}
      maxAmount={maxRepay}
      maxLabel="Borrowed"
      decimals={decimals}
      isLoading={isLoading}
      step={step}
      error={error}
      statusMessage={statusMessage}
      reset={reset}
      execute={executeRepay}
      verb="Repay"
      verbActive="Repaying"
      verbDone="Repaid"
      variant="repay"
    />
  )
}

// ── Shared sub-components ───────────────────────────────────────────
function NoPosition({ message, icon }: { message: string; icon: 'trending-down' | 'check' }) {
  const Icon = icon === 'trending-down' ? TrendingDown : CheckCircle2
  return (
    <div className="flex flex-col items-center gap-2 py-5 text-center">
      <Icon className="w-6 h-6 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function ActionForm({
  asset,
  amount,
  setAmount,
  maxAmount,
  maxLabel,
  decimals,
  isLoading,
  step,
  error,
  statusMessage,
  reset,
  execute,
  verb,
  verbActive,
  verbDone,
  variant,
}: {
  asset: Asset
  amount: string
  setAmount: (v: string) => void
  /** Number, not a formatted balance string — see AmountInput.maxAmount. */
  maxAmount: number
  maxLabel: string
  decimals?: number
  isLoading: boolean
  step: string
  error: string | null | undefined
  statusMessage: string
  reset: () => void
  execute: () => void
  verb: string
  verbActive: string
  verbDone: string
  variant: 'withdraw' | 'repay'
}) {
  const isSuccess = step === 'success'
  const isError = step === 'error'
  const isEmpty = !amount || parseFloat(amount) <= 0
  const canAct = !isLoading && (isError || isSuccess || !isEmpty)

  // Same narration the Supply panel and the Easy-mode surfaces use: the button
  // says which stage we're on rather than one frozen verb. Matters most when a
  // wallet pop-up is waiting and nothing else on screen says so.
  const busyPhase = useTxBusyPhase({
    active: isLoading,
    action: variant === 'withdraw' ? 'withdraw' : 'repay',
    step,
    statusMessage,
  })

  function handleAction() {
    if (isError || isSuccess) { reset(); setAmount(''); return }
    execute()
  }

  return (
    <div className="space-y-4">
      <AmountInput
        value={amount}
        onChange={setAmount}
        maxAmount={maxAmount}
        maxLabel={maxLabel}
        symbol={asset.symbol}
        decimals={decimals}
        disabled={isLoading || isSuccess}
      />
      {statusMessage && !isError && (
        <p className="text-xs text-muted-foreground/70 px-1">{statusMessage}</p>
      )}
      {isError && error && (
        <p className="text-xs text-destructive px-1">
          {typeof error === 'string' ? error : 'Transaction failed'}
        </p>
      )}
      <button
        onClick={handleAction}
        disabled={!canAct}
        className={cn(
          "relative w-full h-12 rounded-2xl font-semibold text-sm",
          "transition-all duration-200 active:scale-[0.97]",
          // An in-flight button is the thing doing the narrating — it must not
          // read as greyed-out/dead while it works.
          "disabled:cursor-not-allowed",
          isLoading ? "opacity-100" : "disabled:opacity-40",
          isSuccess
            ? "bg-emerald-500/80 text-white"
            : isError
            ? "bg-destructive/80 text-white hover:bg-destructive"
            : variant === 'withdraw'
            ? "glass border border-[var(--border-cyber-hover)] text-foreground hover:bg-white/[0.08]"
            : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_16px_var(--glow-primary)]"
        )}
      >
        {isLoading
          ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={busyPhase.label}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                >
                  {busyPhase.label}
                </motion.span>
              </AnimatePresence>
            </span>
          )
          : isSuccess
          ? <span className="flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" />{verbDone} — tap to reset</span>
          : isError ? 'Try again'
          : `${verb}${verb.startsWith('Approve') ? '' : ` ${asset.symbol}`}`}
        {isLoading && <ButtonProgress progress={busyPhase.progress} />}
      </button>
    </div>
  )
}

// ── Public roots ─────────────────────────────────────────────────────
/**
 * Three exports, one per surface in FastAssetPanel:
 *   CollateralControl — above the tab bar (a setting, not an action)
 *   WithdrawPanel     — own top-level tab, next to Supply
 *   RepayPanel        — own top-level tab, next to Borrow
 *
 * Each dispatches EVM vs Stellar and gates on the matching wallet. The
 * connect gate has to sit in its own component (not an early return in
 * the dispatcher) so the chain-specific hooks below it never run
 * conditionally.
 */

// ── Collateral ───────────────────────────────────────────────────────
export function CollateralControl({ asset }: { asset: Asset }) {
  const isStellar = getStellarVaultConfig(asset.id) !== null
  if (isStellar) return <CollateralStellarGate asset={asset} />
  return <CollateralEvmGate asset={asset} />
}

// Renders nothing when disconnected — a ConnectPrompt above the tab bar
// would push the actions down for every visitor who hasn't connected yet.
// The action tabs carry their own prompt.
function CollateralEvmGate({ asset }: { asset: Asset }) {
  const { isConnected } = useActiveWallet()
  if (!isConnected) return null
  return <CollateralToggle asset={asset} />
}

function CollateralStellarGate({ asset }: { asset: Asset }) {
  const { isConnected } = useStellarWallet()
  if (!isConnected) return null
  return <CollateralToggleStellar asset={asset} />
}

// ── Withdraw ─────────────────────────────────────────────────────────
export function WithdrawPanel({ asset }: { asset: Asset }) {
  const isStellar = getStellarVaultConfig(asset.id) !== null
  if (isStellar) return <WithdrawStellarGate asset={asset} />
  return <WithdrawEvmGate asset={asset} />
}

function WithdrawEvmGate({ asset }: { asset: Asset }) {
  const { isConnected } = useActiveWallet()
  if (!isConnected) return <ConnectPrompt action="withdraw" />
  return <WithdrawSection asset={asset} />
}

function WithdrawStellarGate({ asset }: { asset: Asset }) {
  const { isConnected } = useStellarWallet()
  if (!isConnected) return <ConnectPrompt action="withdraw" />
  return <WithdrawSectionStellar asset={asset} />
}

// ── Repay ────────────────────────────────────────────────────────────
export function RepayPanel({ asset }: { asset: Asset }) {
  const isStellar = getStellarVaultConfig(asset.id) !== null
  if (isStellar) return <RepayStellarGate asset={asset} />
  return <RepayEvmGate asset={asset} />
}

function RepayEvmGate({ asset }: { asset: Asset }) {
  const { isConnected } = useActiveWallet()
  if (!isConnected) return <ConnectPrompt action="repay" />
  return <RepaySection asset={asset} />
}

function RepayStellarGate({ asset }: { asset: Asset }) {
  const { isConnected } = useStellarWallet()
  if (!isConnected) return <ConnectPrompt action="repay" />
  return <RepaySectionStellar asset={asset} />
}
