"use client"

/**
 * SupplyPanel — Supply form with glass CTA.
 *
 * Design decisions:
 * - CTA button: full width, rounded-2xl, solid bg-primary, no gradient.
 *   Reason: Single clear action. Gradient = decoration. Solid = action.
 * - active:scale-[0.97]: CSS tactile feedback on button press.
 *   Reason: Mobile users expect press feedback. 3% scale = subtle but real.
 * - Loading: spinner + truncated label (not full text shift).
 *   Reason: Layout stability — button doesn't resize when loading.
 * - Success state: green + checkmark. Tap to reset.
 *   Reason: Fintech pattern — confirm the action completed before any auto-reset.
 *
 * Stellar branching:
 * - Soroban assets (xlm/usdc/eurc-stellar) use the Stellar supply hook +
 *   Freighter wallet check. Branched at the very top so each variant has
 *   its own outer/inner split with a stable hook stack.
 */

import { useState, lazy, Suspense } from 'react'
import { Asset } from '@/types/markets'
import { usePTokenBalance } from '@/hooks/use-ptoken-balance'
import { useWalletBalance } from '@/hooks/use-wallet-balance'
import { useSupplyTransaction } from '@/hooks/use-supply-transaction'
import { useStellarSupplyTransaction } from '@/hooks/use-stellar-supply-transaction'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'
import { getStellarVaultConfig } from '@/lib/stellar-soroban-lending'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import AmountInput from '../ui/AmountInput'
import { supplyMaxAmount } from '@/lib/supply-max'

// Lazy — ManagePanel carries the withdraw/repay stack too, and the Supply tab
// should not pull it in until a position actually exists.
const CollateralControl = lazy(() =>
  import('./ManagePanel').then(m => ({ default: m.CollateralControl }))
)
import ConnectPrompt from '../ui/ConnectPrompt'
import { useTxBusyPhase } from '@/hooks/use-tx-busy-phase'
import { ButtonProgress } from '@/components/easy/ButtonProgress'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { CrossChainSupplySection } from '@/components/funding/CrossChainSupplySection'

interface SupplyPanelProps {
  asset: Asset
  supplyApy: number
  priceUsd: number
}

export default function SupplyPanel(props: SupplyPanelProps) {
  // Stable: asset.id never changes for the lifetime of an opened panel,
  // so this branch picks one component subtree with no hook-count risk.
  const isStellar = getStellarVaultConfig(props.asset.id) !== null
  if (isStellar) return <SupplyPanelStellarOuter {...props} />
  return <SupplyPanelEvmOuter {...props} />
}

// ── EVM ─────────────────────────────────────────────────────────────────
function SupplyPanelEvmOuter({ asset, supplyApy, priceUsd }: SupplyPanelProps) {
  const { isConnected } = useActiveWallet()

  if (!isConnected) return <ConnectPrompt action="supply" />

  return <SupplyPanelInner asset={asset} supplyApy={supplyApy} priceUsd={priceUsd} />
}

// Split so hooks only init when connected — and so the hook count never shifts
// between renders (rule of hooks). Without this split, a Stellar/Freighter
// connect/disconnect that toggles isConnected mid-mount would change the
// number of hooks called and trigger React error #310.
function SupplyPanelInner({ asset, supplyApy, priceUsd }: SupplyPanelProps) {
  const [amount, setAmount] = useState('')

  // numericBalance, never formattedBalance — the formatted one is locale
  // grouped ("9.959,66") and parsing it back scaled deposits down 1000×.
  const { numericBalance, decimals } = useWalletBalance({ assetId: asset.id })
  const walletBalance = (numericBalance as number | undefined) ?? 0
  const tokenDecimals = typeof decimals === 'number' ? decimals : undefined

  // ── Calculation ─────────────────────────────────────────────────────
  const amountNum = parseFloat(amount) || 0
  const annualEarn = (amountNum * (supplyApy / 100)) * priceUsd
  const dailyEarn = annualEarn / 365
  const monthlyEarn = annualEarn / 12

  const {
    executeSupply,
    step,
    isLoading,
    error,
    needsApproval,
    statusMessage,
    reset,
  } = useSupplyTransaction({
    assetId: asset.id,
    amount,
    onSuccess: () => {
      setAmount('')
      toast.success(`Supplied ${asset.symbol}`, {
        description: 'Your position is now earning yield',
        duration: 4000,
      })
    },
  })

  return (
    <SupplyForm
      asset={asset}
      supplyApy={supplyApy}
      priceUsd={priceUsd}
      amount={amount}
      setAmount={setAmount}
      walletBalance={walletBalance}
      decimals={tokenDecimals}
      amountNum={amountNum}
      annualEarn={annualEarn}
      dailyEarn={dailyEarn}
      monthlyEarn={monthlyEarn}
      step={step}
      isLoading={isLoading}
      error={error}
      needsApproval={needsApproval}
      statusMessage={statusMessage}
      reset={reset}
      execute={executeSupply}
    />
  )
}

// ── Stellar ─────────────────────────────────────────────────────────────
function SupplyPanelStellarOuter({ asset, supplyApy, priceUsd }: SupplyPanelProps) {
  const { isConnected } = useStellarWallet()

  if (!isConnected) return <ConnectPrompt action="supply" />

  return <SupplyPanelStellarInner asset={asset} supplyApy={supplyApy} priceUsd={priceUsd} />
}

function SupplyPanelStellarInner({ asset, supplyApy, priceUsd }: SupplyPanelProps) {
  const [amount, setAmount] = useState('')

  // useWalletBalance keys the Stellar path off the Soroban asset id alone —
  // the Stellar-only host hides the chain picker, so the selected network is
  // never Stellar and must not gate this.
  // numericBalance, never formattedBalance — the formatted one is locale
  // grouped ("9.959,66") and parsing it back scaled deposits down 1000×.
  const { numericBalance, decimals } = useWalletBalance({ assetId: asset.id })
  const walletBalance = (numericBalance as number | undefined) ?? 0
  const tokenDecimals = typeof decimals === 'number' ? decimals : undefined

  const amountNum = parseFloat(amount) || 0
  const annualEarn = (amountNum * (supplyApy / 100)) * priceUsd
  const dailyEarn = annualEarn / 365
  const monthlyEarn = annualEarn / 12

  const {
    executeSupply,
    step,
    isLoading,
    error,
    needsApproval,
    statusMessage,
    reset,
  } = useStellarSupplyTransaction({
    assetId: asset.id,
    amount,
    onSuccess: () => {
      setAmount('')
      toast.success(`Supplied ${asset.symbol}`, {
        description: 'Your position is now earning yield on Stellar',
        duration: 4000,
      })
    },
  })

  const form = (
    <SupplyForm
      asset={asset}
      supplyApy={supplyApy}
      priceUsd={priceUsd}
      amount={amount}
      setAmount={setAmount}
      walletBalance={walletBalance}
      decimals={tokenDecimals}
      amountNum={amountNum}
      annualEarn={annualEarn}
      dailyEarn={dailyEarn}
      monthlyEarn={monthlyEarn}
      step={step}
      isLoading={isLoading}
      error={error}
      needsApproval={needsApproval}
      statusMessage={statusMessage}
      reset={reset}
      execute={executeSupply}
    />
  )

  // "Pay with" another network (stage X3). Outside the Expert view's
  // CrossChainFlowProvider, or for a market with no route, it renders the
  // form above unchanged.
  return (
    <CrossChainSupplySection
      asset={asset}
      supplyApy={supplyApy}
      priceUsd={priceUsd}
      stellarBalance={walletBalance}
      stellarForm={form}
      stellarBusy={isLoading}
    />
  )
}

// ── Shared form (presentation only — no transaction hooks) ──────────────
interface SupplyFormProps {
  asset: Asset
  supplyApy: number
  priceUsd: number
  amount: string
  setAmount: (v: string) => void
  /** Spendable balance as a number — see AmountInput.maxAmount. */
  walletBalance: number
  decimals?: number
  amountNum: number
  annualEarn: number
  dailyEarn: number
  monthlyEarn: number
  step: string
  isLoading: boolean
  error: string | null | undefined
  needsApproval: boolean
  statusMessage: string
  reset: () => void
  execute: () => void
}

function SupplyForm({
  asset,
  supplyApy,
  amount,
  setAmount,
  walletBalance,
  decimals,
  amountNum,
  annualEarn,
  dailyEarn,
  monthlyEarn,
  step,
  isLoading,
  error,
  needsApproval,
  statusMessage,
  reset,
  execute,
}: SupplyFormProps) {
  const isSuccess = step === 'success'
  const isError = step === 'error'
  const isEmpty = !amount || parseFloat(amount) <= 0
  const canAct = !isLoading && (isError || isSuccess || !isEmpty)

  // The button carries the narration: a morphing phase label plus a progress
  // hairline. A Stellar deposit is up to three wallet pop-ups deep, so a static
  // "Supplying…" reads as frozen exactly when the user needs to be told to go
  // confirm something. Same hook the Easy-mode surfaces use, so both modes
  // speak the same language.
  const busyPhase = useTxBusyPhase({
    active: isLoading,
    action: 'supply',
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
        // Stablecoins fill 100%; native XLM keeps a reserve back (see supplyMaxAmount).
        maxAmount={supplyMaxAmount(walletBalance, asset.id)}
        balanceAmount={walletBalance}
        maxLabel="Wallet"
        symbol={asset.symbol}
        decimals={decimals}
        disabled={isLoading || isSuccess}
      />

      {/* Potential Earnings Preview */}
      {amountNum > 0 && !isSuccess && (
        <div className="bg-emerald-500/[0.03] dark:bg-emerald-500/[0.05] border border-emerald-500/10 rounded-xl p-3 sm:p-4 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between">
            <InfoTooltip
              title="Potential Yield"
              content="Estimated earnings based on the current APY. These values will change as market rates fluctuate over time."
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/60 font-mono">
                Potential Yield
              </span>
            </InfoTooltip>
            <span className="text-[10px] font-mono text-muted-foreground/50">
              APY: {supplyApy.toFixed(2)}%
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground/60 font-medium">Daily</span>
              <span className="text-sm font-bold font-mono text-emerald-400">
                +${dailyEarn.toFixed(dailyEarn < 0.01 ? 4 : 2)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground/60 font-medium">Monthly</span>
              <span className="text-sm font-bold font-mono text-emerald-400">
                +${monthlyEarn.toFixed(monthlyEarn < 0.1 ? 2 : 2)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground/60 font-medium">Yearly</span>
              <span className="text-sm font-bold font-mono text-emerald-400">
                +${annualEarn.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Status feedback — quiet, the button spinner does the activity signal */}
      {statusMessage && !isError && (
        <p className="text-xs text-muted-foreground/70 px-1">
          {statusMessage}
        </p>
      )}
      {isError && error && (
        <p className="text-xs text-destructive px-1">
          {typeof error === 'string' ? error : 'Transaction failed'}
        </p>
      )}

      {/* CTA */}
      <button
        onClick={handleAction}
        disabled={!canAct}
        className={cn(
          "relative w-full h-12 rounded-2xl font-semibold text-sm",
          "transition-all duration-200",
          "active:scale-[0.97]",
          // Keep the in-flight button at full contrast — it's the only thing
          // narrating a 30s multi-signature flow, so it must not read as
          // greyed-out/dead while it works.
          "disabled:cursor-not-allowed",
          isLoading ? "opacity-100" : "disabled:opacity-40",
          isSuccess
            ? "bg-emerald-500/80 text-white shadow-[0_0_20px_rgba(16,185,129,0.2)]"
            : isError
            ? "bg-destructive/80 text-white hover:bg-destructive"
            : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_16px_var(--glow-primary)]"
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
            <CheckCircle2 className="w-4 h-4" />
            Supplied — tap to reset
          </span>
        ) : isError ? (
          'Try again'
        ) : needsApproval ? (
          `Approve ${asset.symbol}`
        ) : (
          `Supply ${asset.symbol}`
        )}
        {isLoading && <ButtonProgress progress={busyPhase.progress} />}
      </button>

      {/* Collateral — below the CTA, and only once this market is funded. */}
      <SuppliedCollateralSection asset={asset} />
    </div>
  )
}

/**
 * Collateral toggle for a funded market.
 *
 * It used to sit above the tab bar, where it was the first thing every visitor
 * saw — including everyone with nothing supplied, for whom the switch does
 * nothing. Collateral only becomes a decision once there is a position, so it
 * follows the supply action instead: no position ⇒ nothing rendered.
 *
 * `usePTokenBalance` covers both chains (the Stellar path keys off the Soroban
 * asset id), so one check gates the EVM and Stellar forms alike. Loading reads
 * as "no position" — the toggle appears when the balance resolves rather than
 * reserving space for something that may never show.
 */
function SuppliedCollateralSection({ asset }: { asset: Asset }) {
  const { numericBalance } = usePTokenBalance({ assetId: asset.id })
  if ((numericBalance ?? 0) <= 0.000001) return null

  return (
    <Suspense fallback={null}>
      <CollateralControl asset={asset} />
    </Suspense>
  )
}
