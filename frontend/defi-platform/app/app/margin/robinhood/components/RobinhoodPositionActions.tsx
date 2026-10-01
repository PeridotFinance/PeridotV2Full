'use client'

/**
 * Actions under one position card (guide 7, 8 and 9): close all or part,
 * add margin from the free balance, repay from the wallet, and the exit
 * without prices once the debt is gone.
 *
 * The close tab shows the quote the transaction will carry: the fee with its
 * ceiling, the debt it repays, the swap floor and the simulated amount that
 * returns to free margin. Proceeds land in the margin account, not in the
 * wallet; the copy says so because that is the surprise in this product.
 */
import { useEffect, useState } from 'react'
import { formatUnits } from 'viem'
import { ROBINHOOD_DECIMALS } from '@/config/robinhood'
import { underlyingFromShares } from '@/lib/robinhood/units'
import { showRobinhoodMoment } from '@/hooks/use-robinhood-moment'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { RobinhoodAccountState, RobinhoodMarketState, RobinhoodPosition } from '@/lib/robinhood/reads'
import type { RobinhoodCloseQuote } from '@/lib/robinhood/manage'
import { planRobinhoodRepay } from '@/lib/robinhood/manage'
import { robinhoodFlows, useRobinhoodAction, useRobinhoodCloseQuote } from '@/hooks/use-robinhood-margin-manage'
import {
  formatNvda18Display,
  formatSharesAsUsdg,
  formatUsd18Display,
  formatUsdg6Display,
  isSentinel,
  parseUsdgInput,
  sharesForUsdg6,
  usdg6ToInput,
} from '../lib/format'
import { RobinhoodTxSteps } from './RobinhoodTxSteps'
import { RobinhoodErrorCard, Shake } from './moments/RobinhoodErrorCard'

type Tab = 'close' | 'add' | 'repay'

const CLOSE_CHIPS = [2500, 5000, 7500, 10_000]

interface Props {
  p: RobinhoodPosition
  account: RobinhoodAccountState | undefined
  market: RobinhoodMarketState | undefined
}

function Line({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums font-medium">
        {value}
        {sub && <span className="ml-1 text-muted-foreground/60 font-normal">{sub}</span>}
      </span>
    </div>
  )
}

/** Debt-side amounts are USDG for a long and NVDA for a short. */
const debtAsset = (direction: 'long' | 'short', raw: bigint | null | undefined) =>
  direction === 'long' ? formatUsdg6Display(raw) : formatNvda18Display(raw)

function CloseDetails({ q, rate }: { q: RobinhoodCloseQuote; rate: bigint | null }) {
  const long = q.direction === 'long'
  const swapFloor =
    q.minDebtUnderlying > 0n
      ? debtAsset(q.direction, q.minDebtUnderlying)
      : q.minMarginUnderlying > 0n
        ? formatUsdg6Display(q.minMarginUnderlying)
        : null
  return (
    <div className="space-y-1.5 rounded-lg border border-foreground/[0.06] bg-foreground/[0.03] p-3">
      {q.debtToRepay !== null && q.debtToRepay > 0n && (
        <Line
          label="Debt repaid"
          value={debtAsset(q.direction, q.debtToRepay)}
          sub={q.debtSource === 'stored' ? 'may lag' : undefined}
        />
      )}
      {long && q.positionUnderlyingClosed !== null && (
        <Line label="NVDA sold" value={formatNvda18Display(q.positionUnderlyingClosed)} />
      )}
      {swapFloor && <Line label={long ? 'Sale brings at least' : 'Swap brings at least'} value={swapFloor} />}
      {q.minimaSource === 'protocol' && (
        <p className="text-[10px] text-muted-foreground/60">The protocol's own price limit applies to this swap.</p>
      )}
      <Line
        label="Closing fee"
        value={formatUsd18Display(q.closingFeeUsd18)}
        sub={
          q.maxClosingFeePToken !== null && q.maxClosingFeePToken > 0n
            ? `max ${formatSharesAsUsdg(q.maxClosingFeePToken, rate)}`
            : undefined
        }
      />
      <div className="border-t border-foreground/[0.05] pt-1.5">
        <Line label="Back to free margin, about" value={formatUsdg6Display(q.returnedMarginUsdg)} />
      </div>
    </div>
  )
}

function CloseTab({ p, market }: { p: RobinhoodPosition; market: RobinhoodMarketState | undefined }) {
  const [closeBps, setCloseBps] = useState(10_000)
  const flow = useRobinhoodAction<Awaited<ReturnType<ReturnType<typeof robinhoodFlows.close>>>>()
  const { quote, isPlaceholder, isFetching } = useRobinhoodCloseQuote(p, closeBps, {
    enabled: !flow.isRunning && flow.status !== 'requote',
  })
  const rate = market?.markets.pUSDG.exchangeRate ?? null
  const shown = flow.status === 'requote' ? flow.closeRequote : quote
  const fresh = !!quote && !isPlaceholder && quote.closeBps === closeBps
  const canClose = fresh && !!quote?.params && !flow.isRunning && flow.status !== 'requote'

  // A full close is the payoff: the page's moment host shows it, because this
  // card disappears with the position on the next refresh.
  const done = flow.status === 'success' ? flow.result : null
  useEffect(() => {
    if (!done || !done.event.fullyClosed) return
    showRobinhoodMoment({
      kind: 'closed',
      positionId: p.id.toString(),
      direction: p.direction,
      returnedUsd: rate
        ? Number(formatUnits(underlyingFromShares(done.event.returnedMarginShares, rate), ROBINHOOD_DECIMALS.USDG))
        : null,
      hash: done.hash,
      via: 'close',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  if (flow.status === 'success' && flow.result) {
    const e = flow.result.event
    return (
      <div className="space-y-2">
        <RobinhoodTxSteps steps={flow.steps} />
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          {e.fullyClosed ? 'Position closed.' : 'Part of the position closed.'} {formatSharesAsUsdg(e.returnedMarginShares, rate)}{' '}
          is back in your free margin
          {e.closingFeeShares > 0n ? ` after a ${formatSharesAsUsdg(e.closingFeeShares, rate)} fee` : ''}. Withdraw it from the
          margin account when you want it in your wallet.
        </p>
        <Button size="sm" variant="outline" className="h-7" onClick={flow.reset}>
          Done
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {CLOSE_CHIPS.map((bps) => (
          <button
            key={bps}
            type="button"
            onClick={() => {
              setCloseBps(bps)
              if (flow.status !== 'running') flow.reset()
            }}
            disabled={flow.isRunning}
            className={cn(
              'flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold tabular-nums transition-colors',
              closeBps === bps
                ? 'border-primary/50 bg-primary/15 text-foreground'
                : 'border-foreground/[0.08] text-muted-foreground hover:bg-foreground/[0.04]',
            )}
          >
            {bps / 100}%
          </button>
        ))}
      </div>

      {shown && shown.params ? (
        <CloseDetails q={shown} rate={rate} />
      ) : shown && shown.issues.length > 0 && !isPlaceholder ? (
        <p className="text-xs text-muted-foreground">{shown.issues[0].message}</p>
      ) : (
        <div className="h-24 rounded-lg bg-foreground/[0.04] animate-pulse" />
      )}

      {flow.status === 'requote' && flow.closeRequote && (
        <div className="space-y-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs">
          <p className="text-yellow-800 dark:text-yellow-200">{flow.error?.message}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7"
              disabled={!flow.closeRequote.params}
              onClick={() => flow.run(robinhoodFlows.close(p, flow.closeRequote!))}
            >
              Accept new quote
            </Button>
            <Button size="sm" variant="outline" className="h-7" onClick={flow.reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {flow.status !== 'requote' && (
        <Shake trigger={flow.status === 'error' && flow.error?.kind !== 'rejected' ? flow.error : null}>
          <Button
            className="h-11 w-full sm:h-10"
            disabled={!canClose}
            onClick={() => quote && flow.run(robinhoodFlows.close(p, quote))}
          >
            {flow.isRunning
              ? 'Closing'
              : isFetching && !fresh
                ? 'Getting quote'
                : closeBps === 10_000
                  ? 'Close position'
                  : `Close ${closeBps / 100}%`}
          </Button>
        </Shake>
      )}
      <p className="text-[11px] text-muted-foreground/60">
        What comes back goes to your free margin, not straight to your wallet.
      </p>
      <RobinhoodTxSteps steps={flow.steps} />
      <RobinhoodErrorCard error={flow.status === 'error' ? flow.error : null} onRetry={flow.reset} />
    </div>
  )
}

function AddTab({ p, account, market }: Props) {
  const [text, setText] = useState('')
  const [maxShares, setMaxShares] = useState<bigint | null>(null)
  const flow = useRobinhoodAction<Awaited<ReturnType<ReturnType<typeof robinhoodFlows.addCollateral>>>>()
  const rate = market?.markets.pUSDG.exchangeRate ?? null
  const free = account?.vault.freeShares ?? null
  const amount = parseUsdgInput(text)
  const shares = maxShares ?? (amount !== null && rate ? sharesForUsdg6(amount, rate) : null)
  const setToMax = () => {
    if (!free || !rate) return
    setText(usdg6ToInput((free * rate) / 10n ** 18n))
    setMaxShares(free)
  }
  const blocker =
    shares === null
      ? null
      : free === null
        ? 'The free margin balance could not be read.'
        : shares > free
          ? 'That is more than your free margin.'
          : null

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Moves margin from your free balance into this position. Free margin now {formatSharesAsUsdg(free, rate)}.
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setMaxShares(null)
            }}
            disabled={flow.isRunning}
            className="pr-16 tabular-nums"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">USDG</span>
        </div>
        <Button variant="outline" size="sm" className="h-10" disabled={!free || !rate || flow.isRunning} onClick={setToMax}>
          Max
        </Button>
      </div>
      {blocker && <p className="text-xs text-muted-foreground">{blocker}</p>}
      {p.riskUnavailable && (
        <p className="text-xs text-muted-foreground">
          Prices are unavailable, so adding margin may be refused until they return.
        </p>
      )}
      <Shake trigger={flow.status === 'error' && flow.error?.kind !== 'rejected' ? flow.error : null}>
        <Button
          className="w-full"
          disabled={!shares || shares <= 0n || !!blocker || flow.isRunning}
          onClick={async () => {
            const res = await flow.run(robinhoodFlows.addCollateral(p.id, shares!))
            if (res) {
              setText('')
              setMaxShares(null)
            }
          }}
        >
          {flow.isRunning ? 'Adding' : 'Add margin to position'}
        </Button>
      </Shake>
      <RobinhoodTxSteps steps={flow.steps} />
      <RobinhoodErrorCard error={flow.status === 'error' ? flow.error : null} onRetry={flow.reset} remedies={{ max: setToMax }} />
      {flow.status === 'success' && flow.result && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          Added {formatSharesAsUsdg(flow.result.shares, rate)}. Health is now{' '}
          {isSentinel(flow.result.healthFactorBps) ? 'without risk' : (Number(flow.result.healthFactorBps) / 10_000).toFixed(2)}.
        </p>
      )}
    </div>
  )
}

function RepayTab({ p, account }: Props) {
  const flow = useRobinhoodAction<Awaited<ReturnType<ReturnType<typeof robinhoodFlows.repay>>>>()
  const exit = useRobinhoodAction<Awaited<ReturnType<ReturnType<typeof robinhoodFlows.exit>>>>()
  const exited = exit.status === 'success' ? exit.result : null
  const exitHash = exit.steps.find((s) => s.callId === 'exit-debt-free')?.hash ?? null
  useEffect(() => {
    if (!exited || !exitHash) return
    // Part of what comes back is pNVDA in the wallet, so there is no single
    // "back in your account" figure; the ledger's P&L carries the result.
    showRobinhoodMoment({
      kind: 'closed',
      positionId: p.id.toString(),
      direction: p.direction,
      returnedUsd: null,
      hash: exitHash,
      via: 'exit',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exited])
  const long = p.direction === 'long'
  const wallet = long ? (account?.wallet.usdg ?? null) : (account?.wallet.nvda ?? null)
  // The stored debt is enough to plan the button; the flow simulates the accrued one before signing.
  const plan = planRobinhoodRepay(p.direction, p.debtStored, wallet)
  const debtFree = p.debtStored === 0n || flow.result?.event.remainingDebt === 0n

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 rounded-lg border border-foreground/[0.06] bg-foreground/[0.03] p-3">
        <Line label="Debt" value={debtAsset(p.direction, p.debtStored)} sub="grows with interest" />
        <Line label={`${plan.symbol} in wallet`} value={debtAsset(p.direction, wallet)} />
      </div>
      {!debtFree && (
        <>
          {plan.blockers.length > 0 ? (
            <p className="text-xs text-muted-foreground">{plan.blockers[0]}</p>
          ) : !plan.full ? (
            <p className="text-xs text-muted-foreground">
              Your wallet covers part of the debt. This repays {debtAsset(p.direction, plan.maxAmount)}.
            </p>
          ) : null}
          <Shake trigger={flow.status === 'error' && flow.error?.kind !== 'rejected' ? flow.error : null}>
            <Button
              className="w-full"
              disabled={plan.blockers.length > 0 || flow.isRunning || exit.isRunning}
              onClick={() => flow.run(robinhoodFlows.repay(p))}
            >
              {flow.isRunning ? 'Repaying' : plan.full ? 'Repay all debt' : 'Repay what the wallet holds'}
            </Button>
          </Shake>
          <p className="text-[11px] text-muted-foreground/60">
            Repaying lowers the risk but keeps the position open. Two confirmations: an approval for the exact amount and the
            repayment.
          </p>
        </>
      )}
      <RobinhoodTxSteps steps={flow.steps} />
      <RobinhoodErrorCard error={flow.status === 'error' ? flow.error : null} onRetry={flow.reset} />
      {flow.status === 'success' && flow.result && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          Repaid {debtAsset(p.direction, flow.result.event.repaid)}.{' '}
          {flow.result.event.remainingDebt === 0n
            ? 'No debt left.'
            : `Still owed ${debtAsset(p.direction, flow.result.event.remainingDebt)}.`}
        </p>
      )}

      {debtFree && (
        <div className="space-y-2 border-t border-foreground/[0.05] pt-3">
          <p className="text-xs font-semibold text-foreground/70">Exit without prices</p>
          <p className="text-xs text-muted-foreground">
            With no debt left, the position can be unwound without a price or a swap. Your USDG share returns to free margin
            {long ? ' and the NVDA share arrives in your wallet as pNVDA' : ''}, minus the closing fee in each. Use this when the
            normal close is unavailable.
          </p>
          <Shake trigger={exit.status === 'error' && exit.error?.kind !== 'rejected' ? exit.error : null}>
            <Button
              variant="outline"
              className="w-full"
              disabled={exit.isRunning || flow.isRunning}
              onClick={() => exit.run(robinhoodFlows.exit(p))}
            >
              {exit.isRunning ? 'Exiting' : 'Exit without prices'}
            </Button>
          </Shake>
          <RobinhoodTxSteps steps={exit.steps} />
          <RobinhoodErrorCard error={exit.status === 'error' ? exit.error : null} onRetry={exit.reset} />
          {exit.status === 'success' && exit.result && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Position exited. The returned balances are shown in your margin account and wallet.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function RobinhoodPositionActions({ p, account, market }: Props) {
  const [tab, setTab] = useState<Tab | null>(null)
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'close', label: 'Close' },
    { id: 'add', label: 'Add margin' },
    { id: 'repay', label: p.riskUnavailable ? 'Repay or exit' : 'Repay' },
  ]
  if (!p.isActive) return null

  return (
    <div className="space-y-3 border-t border-foreground/[0.05] pt-3">
      <div className="flex gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(tab === t.id ? null : t.id)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
              tab === t.id
                ? 'border-primary/50 bg-primary/15 text-foreground'
                : 'border-foreground/[0.08] text-muted-foreground hover:bg-foreground/[0.04]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'close' && <CloseTab p={p} market={market} />}
      {tab === 'add' && <AddTab p={p} account={account} market={market} />}
      {tab === 'repay' && <RepayTab p={p} account={account} market={market} />}
    </div>
  )
}
