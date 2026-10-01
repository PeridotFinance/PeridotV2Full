"use client"

/**
 * BorrowPanel — Borrow form with health bar + market capacity check.
 *
 * Design decisions:
 * - HealthBar shows LIVE hypothetical utilization as user types.
 *   Reason: Preview impact before confirm = Trade Republic pattern.
 *   User sees consequence, not surprise.
 * - "Market at capacity" replaces form when marketLiquidity = 0.
 *   Reason: Showing a broken form (max = 0, button disabled) is confusing.
 *   Explicit state: "Market is at capacity. Try again later."
 * - `getMaxBorrowAmount(assetId)` from useBorrowingPower.
 *   Reason: Respects BOTH user's borrow power AND market liquidity cap.
 *   Our previous `availableUsd / price` only respected user power.
 * - CTA shows hypothetical utilization in parentheses.
 *   Reason: Second confirmation of consequence before tap. Fintech pattern.
 *
 * Stellar branching:
 * - Soroban assets use `stellarPreviewBorrowMax` (controller call) for max
 *   and `useStellarBorrowTransaction` (Freighter) for the action. The EVM
 *   borrowing-power model doesn't apply to the Stellar deployment, so we
 *   render a simplified header in place of the EVM health bar.
 */

import { useState, useMemo } from 'react'
import { Asset } from '@/types/markets'
import { useBorrowTransaction } from '@/hooks/use-borrow-transaction'
import { useStellarBorrowTransaction } from '@/hooks/use-stellar-borrow-transaction'
import { useBorrowingPower } from '@/hooks/use-borrowing-power'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'
import { useQuery } from '@tanstack/react-query'
import {
  STELLAR_MAX_ENTERED_MARKETS_FOR_BORROW,
  getStellarVaultConfig,
  stellarGetUserMarkets,
  stellarPreviewBorrowMax,
} from '@/lib/stellar-soroban-lending'
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import AmountInput from '../ui/AmountInput'
import { motion, AnimatePresence } from 'framer-motion'
import { useTxBusyPhase } from '@/hooks/use-tx-busy-phase'
import { ButtonProgress } from '@/components/easy/ButtonProgress'
import ConnectPrompt from '../ui/ConnectPrompt'
import HealthBar from '../ui/HealthBar'
import { InfoTooltip } from '@/components/ui/info-tooltip'

interface BorrowPanelProps {
  asset: Asset
  borrowApy: number
  priceUsd: number
}

export default function BorrowPanel(props: BorrowPanelProps) {
  const isStellar = getStellarVaultConfig(props.asset.id) !== null
  if (isStellar) return <BorrowPanelStellarOuter {...props} />
  return <BorrowPanelEvmOuter {...props} />
}

// ── EVM ─────────────────────────────────────────────────────────────────
function BorrowPanelEvmOuter({ asset, borrowApy, priceUsd }: BorrowPanelProps) {
  const { isConnected } = useActiveWallet()

  if (!isConnected) return <ConnectPrompt action="borrow" />

  return <BorrowPanelInner asset={asset} borrowApy={borrowApy} priceUsd={priceUsd} />
}

// Split so hooks only init when connected
function BorrowPanelInner({ asset, borrowApy, priceUsd }: BorrowPanelProps) {
  const [amount, setAmount] = useState('')

  // ── Calculation ─────────────────────────────────────────────────────
  const amountNum = parseFloat(amount) || 0
  const annualCost = (amountNum * (borrowApy / 100)) * priceUsd
  const dailyCost = annualCost / 365
  const monthlyCost = annualCost / 12

  const {
    borrowingPower,
    getMaxBorrowAmount,
    getHypotheticalBorrowUtilization,
    isLoading: powerLoading,
  } = useBorrowingPower()

  // ── Market capacity & max ───────────────────────────────────────────
  const maxBorrow = getMaxBorrowAmount(asset.id)
  const maxBorrowStr = maxBorrow > 0 ? maxBorrow.toFixed(6) : '0'

  // Market is at capacity = user has borrow power but market has no liquidity.
  // (maxBorrow = 0 BUT user has borrowingPower)
  const isAtCapacity = !powerLoading
    && borrowingPower.availableBorrowingPowerUSD > 1
    && maxBorrow < 0.000001

  // ── Health / utilization ────────────────────────────────────────────
  const hypotheticalPct = useMemo(() => {
    const n = parseFloat(amount)
    if (!n || n <= 0) return undefined
    return getHypotheticalBorrowUtilization(asset.id, n)
  }, [amount, asset.id, getHypotheticalBorrowUtilization])

  // ── Transaction ─────────────────────────────────────────────────────
  const {
    executeBorrow,
    step,
    isLoading,
    error,
    statusMessage,
    reset,
  } = useBorrowTransaction({
    assetId: asset.id,
    amount,
    onSuccess: () => {
      setAmount('')
      toast.success(`Borrowed ${asset.symbol}`, {
        description: 'Remember to monitor your health factor',
        duration: 5000,
      })
    },
  })

  const isSuccess = step === 'success'
  const isError = step === 'error'
  const isEmpty = !amount || parseFloat(amount) <= 0
  const canAct = !isLoading && (isError || isSuccess || (!isEmpty && !isAtCapacity))

  function handleAction() {
    if (isError || isSuccess) { reset(); setAmount(''); return }
    executeBorrow()
  }

  // ── At capacity state ───────────────────────────────────────────────
  if (isAtCapacity) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="w-10 h-10 rounded-2xl glass flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Market at capacity</p>
          <p className="text-xs text-muted-foreground max-w-[220px]">
            No liquidity available right now. Your collateral is unaffected. Try again later or borrow a different asset.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <AmountInput
        value={amount}
        onChange={setAmount}
        maxAmount={maxBorrow}
        maxLabel="Available"
        symbol={asset.symbol}
        disabled={isLoading || isSuccess}
      />

      {/* Potential Cost Preview */}
      {amountNum > 0 && !isSuccess && !isAtCapacity && (
        <CostPreview
          dailyCost={dailyCost}
          monthlyCost={monthlyCost}
          annualCost={annualCost}
          borrowApy={borrowApy}
        />
      )}

      {/* Health bar — live hypothetical preview */}
      <HealthBar
        utilizationPct={borrowingPower.collateralUtilization}
        hypotheticalPct={hypotheticalPct}
        liquidationRisk={borrowingPower.liquidationRisk}
      />

      {/* Status */}
      {statusMessage && !isError && (
        <p className="text-xs text-muted-foreground/70 px-1">{statusMessage}</p>
      )}
      {isError && error && (
        <p className="text-xs text-destructive px-1">
          {typeof error === 'string' ? error : 'Transaction failed'}
        </p>
      )}

      <BorrowCta
        asset={asset}
        isLoading={isLoading}
        isSuccess={isSuccess}
        isError={isError}
        canAct={canAct}
        hypotheticalPct={hypotheticalPct}
        onClick={handleAction}
        step={step}
        statusMessage={statusMessage}
      />
    </div>
  )
}

// ── Stellar ─────────────────────────────────────────────────────────────
function BorrowPanelStellarOuter({ asset, borrowApy, priceUsd }: BorrowPanelProps) {
  const { isConnected } = useStellarWallet()

  if (!isConnected) return <ConnectPrompt action="borrow" />

  return <BorrowPanelStellarInner asset={asset} borrowApy={borrowApy} priceUsd={priceUsd} />
}

function BorrowPanelStellarInner({ asset, borrowApy, priceUsd }: BorrowPanelProps) {
  const [amount, setAmount] = useState('')
  const { address } = useStellarWallet()
  const config = getStellarVaultConfig(asset.id)!

  // Pull max-borrow from the Soroban controller. Refetch on tx-success so the
  // form's "Available" and CTA disable state reflect the latest position.
  const {
    data: maxBorrowRaw,
    isLoading: maxLoading,
    refetch: refetchMax,
  } = useQuery({
    queryKey: ['stellar-preview-borrow-max', address, config.vaultId],
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: () => stellarPreviewBorrowMax(address!, config.vaultId),
  })

  // null = the controller could not compute the limit at all (see
  // STELLAR_MAX_ENTERED_MARKETS_FOR_BORROW). Kept distinct from a real zero.
  const maxBorrowUnknown = maxBorrowRaw === null
  const maxBorrow = useMemo(() => {
    if (!maxBorrowRaw) return 0
    try {
      const raw = BigInt(maxBorrowRaw)
      return Number(raw) / Math.pow(10, config.decimals)
    } catch {
      return 0
    }
  }, [maxBorrowRaw, config.decimals])

  const maxBorrowStr = maxBorrow > 0 ? maxBorrow.toFixed(6) : '0'
  const maxBorrowUsd = maxBorrow * priceUsd

  const amountNum = parseFloat(amount) || 0
  const annualCost = (amountNum * (borrowApy / 100)) * priceUsd
  const dailyCost = annualCost / 365
  const monthlyCost = annualCost / 12

  const noBorrowPower = !maxLoading && maxBorrow < 0.000001

  // When borrow power reads 0 it can mean two very different things:
  //  (a) genuinely no collateral supplied yet, or
  //  (b) the borrow-power computation hit the Soroban compute-budget limit because the
  //      user holds a balance in too many markets at once (preview_borrow_max traps and
  //      our lib returns 0). In case (b) the borrow tx would also trap, so the fix is to
  //      fully withdraw from the markets they're not borrowing against. Detect via the
  //      cheap funded-market read so we show the right guidance instead of "supply first".
  // Keyed on ENTERED markets, not funded ones: the controller iterates whatever
  // the user has entered, and a market emptied but never left still costs its
  // full pass. Counting funded markets meant this branch never fired for the
  // accounts that were actually stuck.
  const { data: enteredVaultIds } = useQuery({
    queryKey: ['stellar-entered-markets', address],
    enabled: !!address && (noBorrowPower || maxBorrowUnknown),
    staleTime: 30_000,
    queryFn: () => stellarGetUserMarkets(address!),
  })
  const tooManyMarkets =
    (noBorrowPower || maxBorrowUnknown) &&
    (enteredVaultIds ?? []).length > STELLAR_MAX_ENTERED_MARKETS_FOR_BORROW

  const {
    executeBorrow,
    step,
    isLoading,
    error,
    statusMessage,
    reset,
  } = useStellarBorrowTransaction({
    assetId: asset.id,
    amount,
    onSuccess: () => {
      setAmount('')
      refetchMax()
      toast.success(`Borrowed ${asset.symbol}`, {
        description: 'Borrowed from your Stellar collateral',
        duration: 5000,
      })
    },
  })

  const isSuccess = step === 'success'
  const isError = step === 'error'
  const isEmpty = !amount || parseFloat(amount) <= 0
  const canAct = !isLoading && (isError || isSuccess || (!isEmpty && !noBorrowPower))

  function handleAction() {
    if (isError || isSuccess) { reset(); setAmount(''); return }
    executeBorrow()
  }

  // Too many entered markets, so the borrow-power read trapped. Blocked until the
  // user leaves the markets they no longer hold anything in (empty them first if
  // they still carry a balance).
  if (tooManyMarkets) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="w-10 h-10 rounded-2xl glass flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Too many active markets</p>
          <p className="text-xs text-muted-foreground max-w-[260px]">
            The controller cannot price an account that is entered in more than{' '}
            {STELLAR_MAX_ENTERED_MARKETS_FOR_BORROW} Stellar markets, so borrowing is blocked.
            Use Manage to leave the markets you are not using (Withdraw Max first if one still
            holds a balance), then return here.
          </p>
        </div>
      </div>
    )
  }

  // No collateral → user hasn't supplied anything to back a borrow yet.
  if (noBorrowPower) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="w-10 h-10 rounded-2xl glass flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">No borrowing power</p>
          <p className="text-xs text-muted-foreground max-w-[240px]">
            Supply an asset on Stellar first to use it as collateral, then return here to borrow.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <AmountInput
        value={amount}
        onChange={setAmount}
        maxAmount={maxBorrow}
        maxLabel="Available"
        symbol={asset.symbol}
        decimals={config.decimals}
        disabled={isLoading || isSuccess}
      />

      {/* Stellar borrow capacity header — replaces the EVM HealthBar. */}
      <div className="rounded-xl glass border border-[var(--border-cyber)] px-4 py-3 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-mono">
            Borrow capacity
          </span>
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {maxLoading
              ? '…'
              : `${maxBorrowStr} ${asset.symbol}`}
          </span>
        </div>
        <span className="text-xs font-mono text-muted-foreground/70 tabular-nums">
          ≈ ${maxBorrowUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </div>

      {amountNum > 0 && !isSuccess && (
        <CostPreview
          dailyCost={dailyCost}
          monthlyCost={monthlyCost}
          annualCost={annualCost}
          borrowApy={borrowApy}
        />
      )}

      {statusMessage && !isError && (
        <p className="text-xs text-muted-foreground/70 px-1">{statusMessage}</p>
      )}
      {isError && error && (
        <p className="text-xs text-destructive px-1">
          {typeof error === 'string' ? error : 'Transaction failed'}
        </p>
      )}

      <BorrowCta
        asset={asset}
        isLoading={isLoading}
        isSuccess={isSuccess}
        isError={isError}
        canAct={canAct}
        hypotheticalPct={undefined}
        onClick={handleAction}
        step={step}
        statusMessage={statusMessage}
      />
    </div>
  )
}

// ── Shared sub-components ───────────────────────────────────────────────
function CostPreview({
  dailyCost,
  monthlyCost,
  annualCost,
  borrowApy,
}: {
  dailyCost: number
  monthlyCost: number
  annualCost: number
  borrowApy: number
}) {
  return (
    <div className="bg-amber-500/[0.03] dark:bg-amber-500/[0.05] border border-amber-500/10 rounded-xl p-3 sm:p-4 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="flex items-center justify-between">
        <InfoTooltip
          title="Interest Cost"
          content="Estimated cost of borrowing this amount based on the current APY. Interest is added to your debt over time."
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500/60 font-mono">
            Interest Cost
          </span>
        </InfoTooltip>
        <span className="text-[10px] font-mono text-muted-foreground/50">
          {borrowApy > 0
            ? `APY: ${borrowApy < 0.005 ? '<0.01' : borrowApy.toFixed(2)}%`
            : 'APY: set by utilization'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground/60 font-medium">Daily</span>
          <span className="text-sm font-bold font-mono text-amber-500/80">
            ${dailyCost.toFixed(dailyCost < 0.01 ? 4 : 2)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground/60 font-medium">Monthly</span>
          <span className="text-sm font-bold font-mono text-amber-500/80">
            ${monthlyCost.toFixed(monthlyCost < 0.1 ? 2 : 2)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground/60 font-medium">Yearly</span>
          <span className="text-sm font-bold font-mono text-amber-500/80">
            ${annualCost.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  )
}

function BorrowCta({
  asset,
  isLoading,
  isSuccess,
  isError,
  canAct,
  hypotheticalPct,
  onClick,
  step,
  statusMessage,
}: {
  asset: Asset
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  canAct: boolean
  hypotheticalPct: number | undefined
  onClick: () => void
  step?: string
  statusMessage?: string
}) {
  // A borrow can carry an enter-market signature before the borrow itself, so
  // the button narrates the stage rather than sitting on one frozen verb.
  const busyPhase = useTxBusyPhase({
    active: isLoading,
    action: 'borrow',
    step,
    statusMessage,
  })

  return (
    <button
      onClick={onClick}
      disabled={!canAct}
      className={cn(
        "relative w-full h-12 rounded-2xl font-semibold text-sm",
        "transition-all duration-200 active:scale-[0.97]",
        // The in-flight button is the thing doing the narrating — keep it at
        // full contrast instead of dimming it to 40%.
        "disabled:cursor-not-allowed",
        isLoading ? "opacity-100" : "disabled:opacity-40",
        isSuccess
          ? "bg-emerald-500/80 text-white"
          : isError
          ? "bg-destructive/80 text-white hover:bg-destructive"
          : "bg-amber-500/90 text-black hover:bg-amber-500 shadow-[0_0_16px_rgba(245,158,11,0.15)]"
      )}
    >
      {isLoading ? (
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
      ) : isSuccess ? (
        <span className="flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4" />Borrowed — tap to reset
        </span>
      ) : isError ? 'Try again'
        : hypotheticalPct != null
        ? `Borrow ${asset.symbol} · ${hypotheticalPct.toFixed(0)}% used`
        : `Borrow ${asset.symbol}`}
      {isLoading && <ButtonProgress progress={busyPhase.progress} />}
    </button>
  )
}
