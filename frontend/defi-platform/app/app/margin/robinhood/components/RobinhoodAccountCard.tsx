'use client'

/**
 * Wallet and margin footing, the deposit form (guide 6A) and the way back
 * out (guide 8): withdraw free margin to the wallet and convert it to USDG,
 * plus collecting fee rewards into free margin (guide 7).
 *
 * A deposit is up to four signatures: allow USDG, supply it, allow the vault,
 * move the shares in. The steps list shows each one. Shares that were
 * supplied but never reached the vault (a rejected or failed last step) stay
 * in the wallet; the card offers to move exactly those, which resumes at the
 * vault approval instead of supplying twice.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { formatUnits } from 'viem'
import { Wallet, ArrowDownToLine, ArrowUpFromLine, Fuel, Gift } from 'lucide-react'
import { ROBINHOOD_DECIMALS } from '@/config/robinhood'
import { useRobinhoodPanelRequest } from '@/hooks/use-robinhood-moment'
import { AnimatedNumber } from '@/app/app/margin/components/stellar/AnimatedNumber'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { planRobinhoodSupply } from '@/lib/robinhood/deposit'
import type { RobinhoodAccountState, RobinhoodMarketState } from '@/lib/robinhood/reads'
import { useRobinhoodMarginDeposit } from '@/hooks/use-robinhood-margin-deposit'
import { robinhoodFlows, useRobinhoodAction } from '@/hooks/use-robinhood-margin-manage'
import { robinhoodGasStatus } from '@/lib/robinhood/gas'
import {
  formatEthDisplay,
  formatSharesAsUsdg,
  formatUsdg6Display,
  parseUsdgInput,
  sharesForUsdg6,
  usdg6ToInput,
} from '../lib/format'
import { underlyingFromShares } from '@/lib/robinhood/units'
import { RobinhoodTxSteps } from './RobinhoodTxSteps'
import { RobinhoodErrorCard, Shake } from './moments/RobinhoodErrorCard'

interface Props {
  account: RobinhoodAccountState | undefined
  market: RobinhoodMarketState | undefined
  connected: boolean
  className?: string
}

function MiniStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-lg border px-2.5 py-1.5',
        warn ? 'border-red-500/30 bg-red-500/10' : 'border-foreground/[0.06] bg-background',
      )}
    >
      <div className={cn('truncate text-xs font-semibold tabular-nums', warn && 'text-red-600 dark:text-red-400')}>{value}</div>
      <div className="truncate text-[10px] text-muted-foreground/70">{label}</div>
    </div>
  )
}

function AmountInput({
  id,
  value,
  onChange,
  disabled,
  onMax,
  maxDisabled,
  label,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
  onMax: () => void
  maxDisabled: boolean
  label: string
}) {
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input
          id={id}
          aria-label={label}
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="pr-16 tabular-nums"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">USDG</span>
      </div>
      <Button variant="outline" size="sm" className="h-10" disabled={maxDisabled} onClick={onMax}>
        Max
      </Button>
    </div>
  )
}

export function RobinhoodAccountCard({ account, market, connected, className }: Props) {
  const [amountText, setAmountText] = useState('')
  const flow = useRobinhoodMarginDeposit()
  const rate = market?.markets.pUSDG.exchangeRate ?? null
  const amount = parseUsdgInput(amountText)

  // The gas token is the one balance no other number on this page implies:
  // a wallet full of USDG still cannot sign. It gates every write here.
  const gas = useMemo(() => robinhoodGasStatus(account?.gas), [account?.gas])

  const blockers = useMemo(() => {
    if (!account || amount === null) return []
    const plan = planRobinhoodSupply(account, amount)
    const out = [...plan.blockers]
    if (gas.blocks && gas.message) out.unshift(gas.message)
    if (market?.marginAccepted === false) out.push('The margin vault is not accepting deposits right now.')
    return out
  }, [account, amount, gas, market?.marginAccepted])

  const [withdrawText, setWithdrawText] = useState('')
  const [withdrawMax, setWithdrawMax] = useState<bigint | null>(null)
  const [convert, setConvert] = useState(true)
  const withdraw = useRobinhoodAction<Awaited<ReturnType<ReturnType<typeof robinhoodFlows.withdraw>>>>()
  const redeem = useRobinhoodAction<Awaited<ReturnType<ReturnType<typeof robinhoodFlows.redeem>>>>()
  const settle = useRobinhoodAction<Awaited<ReturnType<ReturnType<typeof robinhoodFlows.settle>>>>()
  const busy = flow.isRunning || withdraw.isRunning || redeem.isRunning || settle.isRunning

  const free = account?.vault.freeShares ?? null
  const withdrawAmount = parseUsdgInput(withdrawText)
  const withdrawShares = withdrawMax ?? (withdrawAmount !== null && rate ? sharesForUsdg6(withdrawAmount, rate) : null)
  const setDepositToMax = () => {
    if (account?.wallet.usdg) setAmountText(usdg6ToInput(account.wallet.usdg))
  }
  const setWithdrawToMax = () => {
    if (!free || !rate) return
    setWithdrawText(usdg6ToInput(underlyingFromShares(free, rate)))
    setWithdrawMax(free)
  }
  const withdrawBlocker =
    gas.blocks && withdrawShares !== null
      ? gas.message
      : withdrawShares === null
        ? null
        : free === null
          ? 'The free margin balance could not be read.'
          : withdrawShares > free
            ? 'That is more than your free margin.'
            : null
  const pendingRewards = account?.vault.pendingRewardShares ?? 0n

  const strandedShares = account?.wallet.pUSDG ?? 0n
  const canDeposit = connected && !!account && amount !== null && blockers.length === 0 && !busy

  const submit = async () => {
    if (amount === null) return
    const res = await flow.deposit({ usdgAmount6: amount })
    if (res) setAmountText('')
  }

  const [tab, setTab] = useState<'add' | 'withdraw'>('add')
  const rootRef = useRef<HTMLDivElement>(null)
  // The progress path and the empty ticket ask for the deposit tab here.
  useRobinhoodPanelRequest(
    useCallback((panel) => {
      if (panel !== 'deposit' && panel !== 'withdraw') return
      setTab(panel === 'deposit' ? 'add' : 'withdraw')
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(
        () => document.getElementById(panel === 'deposit' ? 'rh-deposit' : 'rh-withdraw')?.focus({ preventScroll: true }),
        350,
      )
    }, []),
  )

  const freeUsd = free !== null && rate ? Number(formatUnits(underlyingFromShares(free, rate), ROBINHOOD_DECIMALS.USDG)) : null

  return (
    <div
      ref={rootRef}
      className={cn('scroll-mt-24 space-y-4 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.03] p-4', className)}
    >
      <div className="flex items-center gap-2">
        <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground">Margin account</span>
      </div>

      {!connected ? (
        <p className="text-sm text-muted-foreground">Log in to see your balances.</p>
      ) : !account ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-5 rounded bg-foreground/[0.04] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-[11px] text-muted-foreground">Ready to trade</div>
            <div className="text-3xl font-semibold tabular-nums tracking-tight">
              {freeUsd !== null ? (
                <AnimatedNumber value={freeUsd} decimals={freeUsd >= 0.01 || freeUsd === 0 ? 2 : 4} prefix="$" />
              ) : (
                'n/a'
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="In positions" value={formatSharesAsUsdg(account.vault.lockedShares, rate)} />
            <MiniStat label="USDG in wallet" value={formatUsdg6Display(account.wallet.usdg)} />
            <MiniStat label="ETH for fees" value={formatEthDisplay(account.gas.balanceWei)} warn={gas.blocks} />
          </div>
          {gas.message && (
            <div
              className={cn(
                'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
                gas.blocks
                  ? 'border-red-500/20 bg-red-500/10 text-red-800 dark:text-red-300'
                  : 'border-yellow-500/20 bg-yellow-500/10 text-yellow-800 dark:text-yellow-200',
              )}
            >
              <Fuel className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{gas.message}</span>
            </div>
          )}
          {pendingRewards > 0n && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-sm">
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <Gift className="h-4 w-4" />
                Rewards waiting
                <span className="tabular-nums font-bold">{formatSharesAsUsdg(pendingRewards, rate)}</span>
              </span>
              <Button
                size="sm"
                className="h-7 bg-amber-400 px-3 text-[11px] font-bold text-amber-950 hover:bg-amber-300"
                disabled={busy || gas.blocks}
                onClick={() => settle.run(robinhoodFlows.settle())}
              >
                {settle.isRunning ? 'Collecting' : 'Collect'}
              </Button>
            </div>
          )}
          <RobinhoodTxSteps steps={settle.status === 'success' ? [] : settle.steps} />
          <RobinhoodErrorCard error={settle.status === 'error' ? settle.error : null} onRetry={settle.reset} />
          {settle.status === 'success' && settle.result && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Collected {formatSharesAsUsdg(settle.result.amount, rate)} into free margin.
            </p>
          )}
        </div>
      )}

      {strandedShares > 0n && !busy && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs space-y-2">
          <p className="text-yellow-800 dark:text-yellow-200">
            {formatSharesAsUsdg(strandedShares, rate)} sits in your wallet as pUSDG, outside the margin account. Move it in to
            trade with it, or convert it to USDG.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => flow.deposit({ shares: strandedShares })}
              disabled={market?.marginAccepted === false || gas.blocks}
            >
              Move to margin
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={gas.blocks}
              onClick={() => redeem.run(robinhoodFlows.redeem(strandedShares))}
            >
              Convert to USDG
            </Button>
          </div>
        </div>
      )}
      <RobinhoodTxSteps steps={redeem.steps} />
      <RobinhoodErrorCard error={redeem.status === 'error' ? redeem.error : null} onRetry={redeem.reset} />
      {redeem.status === 'success' && redeem.result && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          Converted. {formatUsdg6Display(redeem.result.redeemAmount)} USDG is in your wallet.
        </p>
      )}

      <div className="space-y-3 border-t border-foreground/[0.05] pt-4">
        <div
          className="grid grid-cols-2 gap-1 rounded-xl border border-foreground/[0.06] bg-background p-1"
          role="tablist"
          aria-label="Move money"
        >
          {(
            [
              { id: 'add', label: 'Add', icon: ArrowDownToLine },
              { id: 'withdraw', label: 'Withdraw', icon: ArrowUpFromLine },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors',
                tab === t.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'add' ? (
          <div className="space-y-2">
            <AmountInput
              id="rh-deposit"
              value={amountText}
              onChange={setAmountText}
              disabled={!connected || busy}
              onMax={setDepositToMax}
              maxDisabled={!account?.wallet.usdg || busy}
              label="Amount to add"
            />
            {blockers.length > 0 && <p className="text-xs text-muted-foreground">{blockers[0]}</p>}
            <Shake trigger={flow.status === 'error' && flow.error?.kind !== 'rejected' ? flow.error : null}>
              <Button className="w-full gap-2" disabled={!canDeposit} onClick={submit}>
                <ArrowDownToLine className="w-4 h-4" />
                {flow.isRunning ? 'Depositing' : 'Deposit'}
              </Button>
            </Shake>
            <p className="text-[11px] text-muted-foreground/60">
              Up to four confirmations the first time: two approvals, the supply and the move into your margin account.
            </p>
            <RobinhoodTxSteps steps={flow.steps} />
            <RobinhoodErrorCard
              error={flow.status === 'error' ? flow.error : null}
              onRetry={flow.reset}
              remedies={{ max: setDepositToMax }}
            />
            {flow.status === 'success' && flow.result && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Deposited. You have {formatSharesAsUsdg(flow.result.freeSharesAfter, rate)} ready to trade.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <AmountInput
              id="rh-withdraw"
              value={withdrawText}
              onChange={(v) => {
                setWithdrawText(v)
                setWithdrawMax(null)
              }}
              disabled={!connected || busy}
              onMax={setWithdrawToMax}
              maxDisabled={!free || !rate || busy}
              label="Amount to withdraw"
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={convert} onChange={(e) => setConvert(e.target.checked)} disabled={busy} />
              Convert to USDG in the same go
            </label>
            {withdrawBlocker && <p className="text-xs text-muted-foreground">{withdrawBlocker}</p>}
            <Shake trigger={withdraw.status === 'error' && withdraw.error?.kind !== 'rejected' ? withdraw.error : null}>
              <Button
                variant="outline"
                className="w-full gap-2"
                disabled={!connected || !withdrawShares || withdrawShares <= 0n || !!withdrawBlocker || gas.blocks || busy}
                onClick={async () => {
                  const res = await withdraw.run(robinhoodFlows.withdraw(withdrawShares!, convert))
                  if (res) {
                    setWithdrawText('')
                    setWithdrawMax(null)
                  }
                }}
              >
                <ArrowUpFromLine className="w-4 h-4" />
                {withdraw.isRunning ? 'Withdrawing' : 'Withdraw'}
              </Button>
            </Shake>
            <p className="text-[11px] text-muted-foreground/60">
              Only what is ready to trade can be withdrawn. Close a position first to free what it holds.
            </p>
            <RobinhoodTxSteps steps={withdraw.steps} />
            <RobinhoodErrorCard
              error={withdraw.status === 'error' ? withdraw.error : null}
              onRetry={withdraw.reset}
              remedies={{ max: setWithdrawToMax }}
            />
            {withdraw.status === 'success' &&
              withdraw.result &&
              (withdraw.result.redeemError ? (
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  Withdrawn to your wallet as pUSDG. The conversion to USDG did not go through:{' '}
                  {withdraw.result.redeemError.message} You can convert it later from this card.
                </p>
              ) : withdraw.result.redeem ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  Withdrawn. {formatUsdg6Display(withdraw.result.redeem.redeemAmount)} USDG is in your wallet.
                </p>
              ) : (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Withdrawn to your wallet as pUSDG.</p>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
