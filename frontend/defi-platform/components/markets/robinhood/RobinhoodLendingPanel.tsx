"use client"

/**
 * Expanded row of the Robinhood lending table: market facts, then one tab per
 * action (Supply, Withdraw, Borrow, Repay), each a form over the shared
 * flow runner in lib/robinhood/lending-flows.ts.
 *
 * Mirrors FastAssetPanel's shape (grid-rows height animation, tabs mounted on
 * first open and kept alive), so the two tables feel like one product.
 *
 * Every maximum comes from robinhoodLendingLimit, which offers what the
 * controller would accept. Values and the capacity bar use the reference
 * price; see lib/robinhood/lending.ts for why the two can differ.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAccount } from 'wagmi'
import { AlertTriangle, CheckCircle2, Info, Loader2, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { Switch } from '@/components/ui/switch'
import AmountInput from '@/components/markets/dev/ui/AmountInput'
import HealthBar from '@/components/markets/dev/ui/HealthBar'
import { ButtonProgress } from '@/components/easy/ButtonProgress'
import { ConnectChooser } from '@/components/wallet/ConnectChooser'
import { RobinhoodFlowError, RobinhoodTxSteps } from '@/app/app/margin/robinhood/components/RobinhoodTxSteps'
import { toBaseUnits, fromBaseUnits } from '@/lib/token-units'
import { robinhoodGasStatus } from '@/lib/robinhood/gas'
import {
  projectedLimitUsedPct,
  robinhoodAmountToNumber,
  robinhoodLendingLimit,
  robinhoodUsd18ToNumber,
  summarizeRobinhoodLending,
  usd18,
  type RobinhoodLendingAccount,
  type RobinhoodLendingAction,
  type RobinhoodLendingMarketId,
  type RobinhoodLendingMarkets,
  type RobinhoodLendingMarketState,
} from '@/lib/robinhood/lending'
import { useRobinhoodLendingAction } from '@/hooks/use-robinhood-lending'
import { boostedHint, fmtAmount, fmtPct, fmtPrice, fmtUsd, isBoostedShare } from './format'

type Tab = RobinhoodLendingAction

const TABS: { key: Tab; label: string; color: string }[] = [
  { key: 'supply', label: 'Supply', color: 'text-emerald-400' },
  { key: 'withdraw', label: 'Withdraw', color: 'text-emerald-300' },
  { key: 'borrow', label: 'Borrow', color: 'text-amber-400' },
  { key: 'repay', label: 'Repay', color: 'text-amber-300' },
]

interface PanelProps {
  marketId: RobinhoodLendingMarketId
  isExpanded: boolean
  markets: RobinhoodLendingMarkets | undefined
  account: RobinhoodLendingAccount | undefined
  accountLoading: boolean
}

function RobinhoodLendingPanelInner({ marketId, isExpanded, markets, account, accountLoading }: PanelProps) {
  const [tab, setTab] = useState<Tab>('supply')
  const [opened, setOpened] = useState(false)
  const [mounted, setMounted] = useState<Set<Tab>>(new Set(['supply']))
  const ref = useRef<HTMLDivElement>(null)
  const state = markets?.markets.find((m) => m.market.id === marketId)

  useEffect(() => {
    if (isExpanded && !opened) setOpened(true)
  }, [isExpanded, opened])

  useEffect(() => {
    if (!isExpanded) return
    const t = setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80)
    return () => clearTimeout(t)
  }, [isExpanded])

  const selectTab = (next: Tab) => {
    setTab(next)
    setMounted((prev) => (prev.has(next) ? prev : new Set([...prev, next])))
  }

  return (
    <div
      ref={ref}
      className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
    >
      <div className="overflow-hidden min-h-0">
        {opened && (
          <div className="dev-panel-content">
            <div className="bg-muted/5 dark:bg-black/10 border-t border-border/40">
              {state ? <MarketFacts state={state} /> : <FactsSkeleton />}

              <div className="relative flex border-b border-border/40">
                {TABS.map(({ key, label, color }) => (
                  <button
                    key={key}
                    onClick={() => selectTab(key)}
                    className={cn(
                      'flex-1 sm:flex-none relative px-1.5 py-3 text-xs whitespace-nowrap sm:px-5 sm:text-sm font-semibold',
                      'transition-all duration-200 min-h-[44px]',
                      tab === key
                        ? cn(
                            'text-foreground after:absolute after:bottom-0 after:left-1.5 after:right-1.5 sm:after:left-3 sm:after:right-3 after:h-[2px] after:rounded-full after:bg-primary',
                            color,
                          )
                        : 'text-muted-foreground hover:text-foreground/80',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="px-4 py-4 sm:px-5 sm:py-5">
                {TABS.map(({ key }) => (
                  <div key={key} className={tab === key ? 'block' : 'hidden'}>
                    {mounted.has(key) && (
                      <ActionGate
                        action={key}
                        marketId={marketId}
                        markets={markets}
                        account={account}
                        accountLoading={accountLoading}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const RobinhoodLendingPanel = React.memo(RobinhoodLendingPanelInner)
export default RobinhoodLendingPanel

// ---------------------------------------------------------------------------
// Market facts
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  tooltip,
  valueClass,
  badge,
}: {
  label: string
  value: string
  tooltip: string
  valueClass?: string
  badge?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/40 px-3 py-2.5">
      <InfoTooltip title={label} content={tooltip}>
        <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/70">{label}</span>
      </InfoTooltip>
      <div className={cn('mt-1 flex items-center gap-1.5 text-base sm:text-lg font-bold font-mono tabular-nums', valueClass)}>
        {value}
        {badge}
      </div>
    </div>
  )
}

function MarketFacts({ state }: { state: RobinhoodLendingMarketState }) {
  const { market } = state
  const cashUsd =
    state.cash !== null && state.referencePriceUsd18
      ? robinhoodUsd18ToNumber(usd18(state.cash, state.referencePriceUsd18, market.decimals))
      : null
  const cf = state.collateralFactor !== null ? Number(state.collateralFactor) / 1e16 : null
  const capUsed =
    state.borrowCap && state.borrowCap > 0n && state.totalBorrows !== null
      ? (Number(state.totalBorrows) / Number(state.borrowCap)) * 100
      : null
  // Undervalued by the controller: supplied here earns but backs nothing.
  const undervalued =
    state.mispriced === true &&
    state.controllerPrice !== null &&
    state.referencePriceUsd18 !== null &&
    state.controllerPrice * 10n ** BigInt(market.decimals) < state.referencePriceUsd18 * 10n ** 18n

  return (
    <div className="p-3 sm:p-4 space-y-2.5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricCard
          label="Utilization"
          value={fmtPct(state.utilizationPct)}
          valueClass={(state.utilizationPct ?? 0) > 80 ? 'text-amber-400' : 'text-foreground'}
          tooltip="Share of the market currently borrowed. High utilization raises rates and leaves less to withdraw or borrow."
        />
        <MetricCard
          label="TVL"
          value={fmtUsd(state.tvlUsd)}
          tooltip="Everything supplied to this market, including the part working in the paired liquidity vault."
        />
        <MetricCard
          label="Available"
          value={fmtUsd(cashUsd)}
          valueClass="text-emerald-400/90"
          tooltip="What the market can pay out or lend right now. Withdrawals above this wait for repayments or for the paired vault to return funds."
        />
        <MetricCard
          label={`${market.symbol} price`}
          value={fmtPrice(state.priceUsd)}
          badge={state.priceable ? <span className="live-dot w-1.5 h-1.5 rounded-full bg-emerald-400" /> : undefined}
          tooltip="Live price from the Robinhood Chain oracle, used to value collateral and loans on this page."
        />
      </div>

      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {cf !== null && <Chip>Collateral factor {cf.toFixed(0)}%</Chip>}
        {state.borrowCap !== null && state.borrowCap > 0n && (
          <Chip>
            Borrow cap {fmtAmount(state.borrowCap, market.decimals, market.symbol)}
            {capUsed !== null && ` · ${capUsed.toFixed(capUsed < 1 ? 1 : 0)}% used`}
          </Chip>
        )}
        {isBoostedShare(state.vaultShare) && (
          <Chip tooltip={boostedHint(state.vaultShare, state.vaultPaused)}>
            Boosted · {(state.vaultShare * 100).toFixed(0)}% in paired vault
          </Chip>
        )}
        <Chip tooltip="Network fees on Robinhood Chain are paid in ETH.">Fees in ETH</Chip>
      </div>

      {state.priceable === false && (
        <Notice tone="warn">
          The {market.symbol} price is unavailable right now. Borrowing waits for a fresh price; supplying, repaying and
          withdrawing collateral that backs no loan still work.
        </Notice>
      )}
      {(state.mintPaused || state.borrowPaused) && (
        <Notice tone="warn">
          {state.mintPaused && state.borrowPaused
            ? 'Supplying and borrowing are paused in this market.'
            : state.mintPaused
              ? 'Supplying is paused in this market.'
              : 'Borrowing is paused in this market.'}
        </Notice>
      )}
      {undervalued && (
        <Notice tone="info">
          {market.symbol} supplied here earns interest but does not raise your borrow limit right now. Borrowing{' '}
          {market.symbol} is limited to what your other collateral covers.
        </Notice>
      )}
    </div>
  )
}

function Chip({ children, tooltip }: { children: React.ReactNode; tooltip?: string }) {
  const body = (
    <span className="inline-flex items-center rounded-full border border-border/40 bg-background/40 px-2.5 py-1 font-medium text-muted-foreground">
      {children}
    </span>
  )
  if (!tooltip) return body
  return (
    <InfoTooltip content={tooltip}>
      {body}
    </InfoTooltip>
  )
}

function Notice({ tone, children }: { tone: 'warn' | 'info'; children: React.ReactNode }) {
  const Icon = tone === 'warn' ? AlertTriangle : Info
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed',
        tone === 'warn'
          ? 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200'
          : 'border-sky-500/20 bg-sky-500/[0.07] text-sky-900 dark:text-sky-200',
      )}
    >
      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

function FactsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 sm:p-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[62px] rounded-xl bg-white/[0.05] animate-pulse" />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

interface ActionProps {
  action: RobinhoodLendingAction
  marketId: RobinhoodLendingMarketId
  markets: RobinhoodLendingMarkets | undefined
  account: RobinhoodLendingAccount | undefined
  accountLoading: boolean
}

function ActionGate(props: ActionProps) {
  const { address } = useAccount()
  const [chooserOpen, setChooserOpen] = useState(false)
  if (!address) {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="w-10 h-10 rounded-2xl glass flex items-center justify-center">
          <Wallet className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="text-center space-y-1 max-w-xs">
          <p className="text-sm font-medium text-foreground">Connect an EVM wallet</p>
          <p className="text-xs text-muted-foreground">
            Robinhood Chain markets use an EVM wallet. Signing in with email creates one for you.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setChooserOpen(true)}
          className="h-10 px-6 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition"
        >
          Connect
        </button>
        <ConnectChooser open={chooserOpen} onOpenChange={setChooserOpen} />
      </div>
    )
  }
  if (!props.markets || (!props.account && props.accountLoading)) {
    return (
      <div className="space-y-3 py-2">
        <div className="h-14 rounded-2xl bg-white/[0.05] animate-pulse" />
        <div className="h-8 rounded-lg bg-white/[0.04] animate-pulse" />
        <div className="h-12 rounded-2xl bg-white/[0.05] animate-pulse" />
      </div>
    )
  }
  return <ActionForm {...props} />
}

const VERB: Record<RobinhoodLendingAction, string> = {
  supply: 'Supply',
  withdraw: 'Withdraw',
  borrow: 'Borrow',
  repay: 'Repay',
}

const PAST: Record<RobinhoodLendingAction, string> = {
  supply: 'Supplied',
  withdraw: 'Withdrew',
  borrow: 'Borrowed',
  repay: 'Repaid',
}

const MAX_LABEL: Record<RobinhoodLendingAction, string> = {
  supply: 'Wallet',
  withdraw: 'Supplied',
  borrow: 'Available',
  repay: 'Borrowed',
}

function parseAmount(value: string, decimals: number): bigint {
  try {
    return toBaseUnits(value, decimals)
  } catch {
    return 0n
  }
}

function ActionForm({ action, marketId, markets, account }: ActionProps) {
  const state = markets!.markets.find((m) => m.market.id === marketId)!
  const { market } = state
  const pos = account?.positions.find((p) => p.market.id === marketId)
  const [amount, setAmount] = useState('')
  const [useAsCollateral, setUseAsCollateral] = useState(true)
  const [done, setDone] = useState<string | null>(null)
  const tx = useRobinhoodLendingAction()

  const limit = useMemo(() => robinhoodLendingLimit(action, marketId, markets, account), [action, marketId, markets, account])
  const summary = useMemo(() => summarizeRobinhoodLending(markets, account), [markets, account])
  const gas = useMemo(
    () => robinhoodGasStatus({ balanceWei: account?.nativeBalanceWei ?? null, gasPriceWei: account?.gasPriceWei ?? null }),
    [account?.nativeBalanceWei, account?.gasPriceWei],
  )

  const raw = parseAmount(amount, market.decimals)
  const maxNumber = Number(fromBaseUnits(limit.max, market.decimals))
  // "Everything" uses redeem(all shares) / repayBorrow(max), so no dust stays behind.
  const all =
    limit.max > 0n &&
    raw >= limit.max &&
    ((action === 'withdraw' && limit.boundBy === 'supplied') || (action === 'repay' && limit.boundBy === 'debt'))
  const over = raw > limit.max && !all

  const projected = projectedLimitUsedPct(action, marketId, raw, markets, account)
  const hasDebt = (summary.borrowedUsd18 ?? 0n) > 0n
  const showCapacity =
    summary.borrowLimitUsd18 !== null &&
    (action === 'borrow' || hasDebt) &&
    (summary.borrowLimitUsd18 > 0n || hasDebt)

  const blocker =
    (limit.blocked && limit.reason) ||
    (gas.blocks && gas.message) ||
    (over ? `The most you can ${VERB[action].toLowerCase()} right now is ${fmtAmount(limit.max, market.decimals, market.symbol)}.` : null)

  const disabled = tx.isRunning || raw <= 0n || !!blocker

  const submit = async () => {
    setDone(null)
    const res = await tx.run(action, {
      market,
      amount: raw,
      all,
      enableCollateral: action === 'supply' ? useAsCollateral : undefined,
    })
    if (res) {
      setDone(`${PAST[action]} ${all ? 'everything' : fmtAmount(raw, market.decimals, market.symbol)}.`)
      setAmount('')
    }
  }

  const apy = action === 'supply' || action === 'withdraw' ? state.supplyApy : state.borrowApy
  const priceUsd = state.priceUsd ?? 0
  const valueUsd = priceUsd > 0 && raw > 0n ? robinhoodAmountToNumber(raw, market.decimals) * priceUsd : null

  return (
    <div className="space-y-4">
      <AmountInput
        value={amount}
        onChange={(v) => {
          setAmount(v)
          if (done) setDone(null)
          if (tx.status === 'error') tx.reset()
        }}
        maxAmount={maxNumber}
        maxLabel={MAX_LABEL[action]}
        symbol={market.symbol}
        decimals={market.decimals}
        disabled={tx.isRunning || limit.blocked}
      />

      <div className="rounded-xl border border-border/40 bg-background/40 divide-y divide-border/30 text-xs">
        <Row label={action === 'supply' || action === 'withdraw' ? 'Supply APY' : 'Borrow APY'}>
          <span className={action === 'supply' || action === 'withdraw' ? 'text-emerald-400' : 'text-amber-400'}>
            {fmtPct(apy)}
          </span>
        </Row>
        {valueUsd !== null && <Row label="Value">{fmtUsd(valueUsd)}</Row>}
        {action === 'supply' && <Row label="In wallet">{fmtAmount(pos?.walletBalance, market.decimals, market.symbol)}</Row>}
        {(action === 'supply' || action === 'withdraw') && (
          <Row label="Supplied">{fmtAmount(pos?.supplied, market.decimals, market.symbol)}</Row>
        )}
        {(action === 'borrow' || action === 'repay') && (
          <Row label="Borrowed">{fmtAmount(pos?.borrowed, market.decimals, market.symbol)}</Row>
        )}
        {action === 'repay' && <Row label="In wallet">{fmtAmount(pos?.walletBalance, market.decimals, market.symbol)}</Row>}
        {action === 'borrow' && (
          <Row label="Borrow limit left">
            {summary.borrowLimitUsd18 !== null && summary.borrowedUsd18 !== null
              ? fmtUsd(
                  robinhoodUsd18ToNumber(
                    summary.borrowLimitUsd18 > summary.borrowedUsd18 ? summary.borrowLimitUsd18 - summary.borrowedUsd18 : 0n,
                  ),
                )
              : '--'}
          </Row>
        )}
      </div>

      {showCapacity && (
        <HealthBar
          utilizationPct={summary.limitUsedPct ?? 0}
          hypotheticalPct={projected ?? undefined}
          liquidationRisk="safe"
        />
      )}

      {action === 'supply' && pos && !pos.isCollateral && (
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5 text-xs cursor-pointer">
          <span className="flex flex-col">
            <span className="font-medium text-foreground">Use as collateral</span>
            <span className="text-muted-foreground">Lets this supply back a loan. One extra signature.</span>
          </span>
          <Switch checked={useAsCollateral} onCheckedChange={setUseAsCollateral} disabled={tx.isRunning} />
        </label>
      )}

      {limit.reason && !limit.blocked && !over && (
        <p className="text-[11px] text-muted-foreground px-0.5">{limit.reason}</p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        className={cn(
          'relative w-full h-12 rounded-2xl text-sm font-semibold transition active:scale-[0.97]',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
          action === 'supply' || action === 'withdraw'
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-amber-400 text-black hover:bg-amber-300',
        )}
      >
        {tx.isRunning ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {runningLabel(tx.steps)}
          </span>
        ) : (
          `${VERB[action]} ${all ? `all ${market.symbol}` : market.symbol}`
        )}
        {tx.isRunning && <ButtonProgress progress={null} />}
      </button>

      {blocker && raw > 0n && !tx.isRunning && <p className="text-[11px] text-amber-600 dark:text-amber-300 px-0.5">{blocker}</p>}
      {limit.blocked && raw === 0n && limit.reason && (
        <p className="text-[11px] text-muted-foreground px-0.5">{limit.reason}</p>
      )}

      <RobinhoodTxSteps steps={tx.steps} />
      <RobinhoodFlowError message={tx.status === 'error' ? tx.error?.message : null} />

      <AnimatePresence>
        {done && tx.status === 'success' && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {done}
          </motion.div>
        )}
      </AnimatePresence>

      {action === 'supply' && pos && (pos.supplied ?? 0n) > 0n && <CollateralControl state={state} account={account!} />}
    </div>
  )
}

function runningLabel(steps: { phase: string; label: string }[]): string {
  const active = [...steps].reverse().find((s) => s.phase !== 'confirmed' && s.phase !== 'failed')
  if (!active) return 'Preparing'
  if (active.phase === 'signing') return 'Confirm in wallet'
  if (active.phase === 'switching') return 'Switching network'
  if (active.phase === 'submitted') return `${active.label}...`
  return 'Checking'
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums font-medium text-foreground">{children}</span>
    </div>
  )
}

/** The collateral switch, once something is supplied. Its own flow, so its steps never mix with the form's. */
function CollateralControl({ state, account }: { state: RobinhoodLendingMarketState; account: RobinhoodLendingAccount }) {
  const { market } = state
  const pos = account.positions.find((p) => p.market.id === market.id)
  const tx = useRobinhoodLendingAction()
  const on = !!pos?.isCollateral
  const hasDebtHere = (pos?.borrowed ?? 0n) > 0n

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5 text-xs">
        <span className="flex flex-col">
          <span className="font-medium text-foreground">Collateral</span>
          <span className="text-muted-foreground">
            {on
              ? `Your ${market.symbol} supply backs loans in both markets.`
              : `Your ${market.symbol} supply earns interest but backs no loan.`}
          </span>
        </span>
        <div className="flex items-center gap-2">
          {tx.isRunning && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          <Switch
            checked={on}
            disabled={tx.isRunning || (on && hasDebtHere)}
            onCheckedChange={(next) => tx.run(next ? 'collateral-on' : 'collateral-off', { market })}
            aria-label={`Use ${market.symbol} as collateral`}
          />
        </div>
      </div>
      {on && hasDebtHere && (
        <p className="text-[11px] text-muted-foreground px-0.5">Repay the {market.symbol} debt before turning this off.</p>
      )}
      <RobinhoodTxSteps steps={tx.status === 'running' || tx.status === 'error' ? tx.steps : []} />
      <RobinhoodFlowError message={tx.status === 'error' ? tx.error?.message : null} />
    </div>
  )
}
