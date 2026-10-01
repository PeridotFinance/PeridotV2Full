'use client'

/**
 * The path to a first trade, as four steps read from the real state: logged
 * in, margin in the account, a position opened, a position closed (which is
 * where the holding points are paid). One slim row: the current step is the
 * only one in full colour and the only one with a button, so a newcomer
 * always sees exactly one thing to do next. Once all four are done the row
 * steps aside for good.
 *
 * Nothing here is stored: a returning trader with an open position simply
 * lands on step four.
 */
import { Check, ChevronRight } from 'lucide-react'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import { requestRobinhoodPanel, focusRobinhoodPosition } from '@/hooks/use-robinhood-moment'

const ConnectWalletButton = dynamic(
  () => import('@/components/wallet/connect-wallet-button').then((m) => m.ConnectWalletButton),
  { ssr: false },
)

export interface JourneyState {
  connected: boolean
  /** Free or locked margin above zero; null while unread. */
  funded: boolean | null
  opened: boolean
  closed: boolean
}

interface Step {
  key: string
  title: string
  hint: string
  done: boolean
  action?: { label: string; run: () => void }
}

export function journeyComplete(s: JourneyState): boolean {
  return s.connected && s.funded === true && s.opened && s.closed
}

export function RobinhoodJourney({ state, className }: { state: JourneyState; className?: string }) {
  const steps: Step[] = [
    { key: 'login', title: 'Log in', hint: 'Any wallet or e-mail address works.', done: state.connected },
    {
      key: 'fund',
      title: 'Add margin',
      hint: 'A few USDG, plus a little ETH for network fees.',
      done: state.funded === true || state.opened,
      action: { label: 'Add margin', run: () => requestRobinhoodPanel('deposit') },
    },
    {
      key: 'open',
      title: 'Make your call',
      hint: 'Up or down, and how much boost.',
      done: state.opened || state.closed,
      action: { label: 'Start a trade', run: () => requestRobinhoodPanel('trade') },
    },
    {
      key: 'close',
      title: 'Cash in',
      hint: 'Close the trade and collect your points.',
      done: state.closed,
      action: { label: 'See my position', run: () => focusRobinhoodPosition({ tab: 'open' }) },
    },
  ]
  const current = steps.findIndex((s) => !s.done)
  if (current === -1) return null
  const active = steps[current]

  return (
    <section
      aria-label="Your first trade"
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5',
        className,
      )}
    >
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {steps.map((s, i) => {
          const isActive = i === current
          return (
            <li key={s.key} className="flex items-center gap-1.5">
              <span
                className={cn(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums',
                  s.done
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : isActive
                      ? 'bg-foreground text-background'
                      : 'border border-foreground/[0.12] text-muted-foreground/70',
                )}
                aria-hidden
              >
                {s.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cn(
                  'text-sm',
                  isActive ? 'font-semibold text-foreground' : s.done ? 'text-muted-foreground' : 'text-muted-foreground/60',
                )}
              >
                {s.title}
                {s.done && <span className="sr-only"> (done)</span>}
                {isActive && <span className="sr-only"> (current step)</span>}
              </span>
              {i < steps.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30" aria-hidden />}
            </li>
          )
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:justify-end">
        <span className="text-xs text-muted-foreground">{active.hint}</span>
        {active.key === 'login' ? (
          <ConnectWalletButton />
        ) : active.action ? (
          <button
            type="button"
            onClick={active.action.run}
            className="shrink-0 rounded-full bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            {active.action.label}
          </button>
        ) : null}
      </div>
    </section>
  )
}
