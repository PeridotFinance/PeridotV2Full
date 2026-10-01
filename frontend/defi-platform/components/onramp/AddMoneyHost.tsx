'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, CreditCard, Landmark, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useStellarOnly } from '@/config/stellarOnly'
import { useMeldOnramp } from '@/hooks/use-meld-onramp'
import { useConsumeOnrampReturn } from '@/hooks/use-consume-onramp-return'
import { hasCompletedFirstRunIntro } from '@/components/easy/FirstRunIntro'
import { meldFundMode, type MeldFundMode } from '@/lib/onramp/meld'
import { ADD_MONEY_EVENT, openAddMoney, type AddMoneyRequest, type AddMoneyView } from '@/lib/onramp/add-money'
import { SheetShell } from '@/components/steallar/sheets/SheetShell'
import { AddMoneyBody } from './AddMoneySheet'
import { BridgeFundingStatus } from './BridgeFundingStatus'

function normalizeAmount(v: string): string {
  return v.replace(/,/g, '.').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
}

/**
 * The one "Add money" sheet: bank transfer and card, the same on every screen
 * size (bottom sheet on phones, right drawer above `md`). Mounted once for all
 * app routes; opened through `openAddMoney()` from `lib/onramp/add-money`.
 *
 * It replaces the old `AddMoneyDialog` (Easy home card) and the funding tab of
 * the wallet dialog, which offered the same two methods with different copy
 * and different destinations.
 */
export function AddMoneyHost() {
  // The last request outlives `open` so the sheet can animate out with its
  // content; `nonce` remounts the flow on every open, so it starts fresh.
  const [state, setState] = useState<{ request: AddMoneyRequest; open: boolean; nonce: number } | null>(null)

  useEffect(() => {
    const onOpen = (e: Event) =>
      setState((prev) => ({
        request: (e as CustomEvent<AddMoneyRequest>).detail ?? {},
        open: true,
        nonce: (prev?.nonce ?? 0) + 1,
      }))
    window.addEventListener(ADD_MONEY_EVENT, onOpen)
    return () => window.removeEventListener(ADD_MONEY_EVENT, onOpen)
  }, [])

  const close = useCallback(() => setState((prev) => (prev ? { ...prev, open: false } : prev)), [])

  // Bridge sends the hosted-KYC tab back with `?onramp=kyc_complete`: pick up
  // the bank transfer where the user left it, on any screen. Except on a phone
  // whose first-run Welcome is still due; that screen owns the first visit.
  const onKycReturn = useCallback(() => {
    const phone = window.matchMedia('(max-width: 767px)').matches
    if (phone && !hasCompletedFirstRunIntro()) return
    openAddMoney({ view: 'bank' })
  }, [])
  useConsumeOnrampReturn(onKycReturn)

  if (!state) return null
  return <AddMoneyFlow key={state.nonce} request={state.request} open={state.open} onClose={close} />
}

const SUBTITLE: Record<AddMoneyView, string> = {
  choose: 'Choose how to pay',
  card: 'By card',
  bank: 'By bank transfer',
}

function AddMoneyFlow({
  request,
  open,
  onClose,
}: {
  request: AddMoneyRequest
  open: boolean
  onClose: () => void
}) {
  const { defaultAmount, defaultAmountCurrency = 'eur' } = request
  const stellarOnly = useStellarOnly()
  const meld = useMeldOnramp()
  const queryClient = useQueryClient()
  const router = useRouter()

  // Where the money is meant to go. A surface with no pool in mind (wallet
  // dialog, toast) on the Stellar-only host means Stellar: a card purchase
  // there would land on BSC, which that host never shows.
  const assetId = request.assetId ?? (stellarOnly ? 'usdc-stellar' : undefined)
  const showCard = !!meld.destinationFor(assetId)
  const fundMode = meldFundMode(assetId)

  // With only one method on offer the chooser is a tap that decides nothing.
  const landing = (view: AddMoneyView | undefined): AddMoneyView => {
    if (!showCard) return 'bank'
    return view ?? 'choose'
  }
  const [view, setView] = useState<AddMoneyView>(() => landing(request.view))
  const canGoBack = showCard

  // Live EUR/USD rate for a USD-typed prefill. No rate → seed 1:1; editable.
  const fxQ = useQuery({
    queryKey: ['onramp-fx-eurusd'],
    enabled: showCard && defaultAmountCurrency === 'usd',
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const res = await fetch('/api/onramp/fx')
      const json = await res.json().catch(() => null)
      const rate = Number(json?.eurUsd)
      return Number.isFinite(rate) && rate > 0 ? rate : null
    },
  })

  // Seed the card amount from the caller. Re-runs when the FX rate lands a
  // beat later, but never overwrites what the user already typed.
  const [cardAmount, setCardAmount] = useState('')
  const lastSeedRef = useRef('')
  useEffect(() => {
    const raw = defaultAmount != null ? Number(normalizeAmount(String(defaultAmount))) : NaN
    let seed = ''
    if (Number.isFinite(raw) && raw > 0) {
      const eur = defaultAmountCurrency === 'usd' && fxQ.data ? raw / fxQ.data : raw
      // Whole euros read cleaner for a prefill; the user can still fine-tune.
      seed = String(Math.max(1, Math.round(eur)))
    }
    setCardAmount((prev) => {
      if (prev !== '' && prev !== lastSeedRef.current) return prev
      lastSeedRef.current = seed
      return seed
    })
  }, [defaultAmount, defaultAmountCurrency, fxQ.data])

  const [cardLoading, setCardLoading] = useState(false)
  const launchCard = async () => {
    const parsed = Number(cardAmount)
    const amount = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
    setCardLoading(true)
    try {
      const outcome = await meld.fundWithMeld({ assetId, amount })
      if (outcome.status === 'confirmed') {
        onClose()
        queryClient.invalidateQueries({ queryKey: ['multi-chain-token-balances'] })
        if (request.assetId) {
          // A deposit was in progress: the funded page waits for the money to
          // land and then resumes that deposit, prefilled.
          const q = new URLSearchParams({ asset: request.assetId, via: 'card' })
          const usd = Number(defaultAmount)
          if (defaultAmountCurrency === 'usd' && Number.isFinite(usd) && usd > 0) q.set('amount', String(usd))
          router.push(`/app/funded?${q.toString()}`)
        } else {
          toast.success('Payment confirmed. Your money is on the way.')
        }
      } else if (outcome.status === 'submitted') {
        // Closed the checkout before paying: leave quietly.
        onClose()
      } else {
        toast.error('Card checkout could not be opened. Please try again.')
      }
    } finally {
      setCardLoading(false)
    }
  }

  const back = (
    <button
      type="button"
      onClick={() => setView('choose')}
      data-testid="add-money-back"
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground/80 hover:text-foreground/80 transition-colors mb-3"
    >
      <ChevronLeft size={14} />
      Payment methods
    </button>
  )

  return (
    <SheetShell
      open={open}
      onClose={onClose}
      title="Add money"
      subtitle={SUBTITLE[view]}
      testId="add-money-sheet"
    >
    <div className="pt-1">
      <AnimatePresence mode="wait" initial={false}>
        {view === 'choose' ? (
          <motion.div key="choose" {...STEP}>
            <ChooseView
              onCard={() => setView('card')}
              onBank={() => setView('bank')}
            />
          </motion.div>
        ) : view === 'card' ? (
          <motion.div key="card" {...STEP}>
            {canGoBack && back}
            <CardView
              amount={cardAmount}
              onAmountChange={(v) => setCardAmount(normalizeAmount(v))}
              loading={cardLoading}
              fundMode={fundMode}
              onContinue={launchCard}
            />
          </motion.div>
        ) : (
          <motion.div key="bank" {...STEP}>
            {canGoBack && back}
            <AddMoneyBody embedded />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </SheetShell>
  )
}

const STEP = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.16 },
}

function Title({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold tracking-tight text-foreground mb-1">{children}</h3>
}

function ChooseView({ onCard, onBank }: { onCard: () => void; onBank: () => void }) {
  return (
    <>
      {/* A bank transfer already on its way, or money waiting: say so first. */}
      <BridgeFundingStatus className="mb-4" onOpenDetails={onBank} />

      <div className="flex flex-col gap-2.5">
        <MethodOption
          icon={<CreditCard className="h-5 w-5 text-primary" />}
          title="Card"
          subtitle="Card, Apple Pay or Google Pay. Ready in minutes."
          onClick={onCard}
          testId="add-money-card"
        />
        <MethodOption
          icon={<Landmark className="h-5 w-5 text-primary" />}
          title="Bank transfer"
          subtitle="Pay in euros from your bank, no card fee. Arrives within a day."
          onClick={onBank}
          testId="add-money-bank"
        />
      </div>
    </>
  )
}

function CardView({
  amount,
  onAmountChange,
  loading,
  fundMode,
  onContinue,
}: {
  amount: string
  onAmountChange: (v: string) => void
  loading: boolean
  fundMode: MeldFundMode
  onContinue: () => void
}) {
  const numeric = Number(amount)
  const canContinue = !loading && Number.isFinite(numeric) && numeric > 0

  return (
    <>
      <Title>How much would you like to add?</Title>
      <p className="text-xs text-muted-foreground">
        {fundMode === 'cash'
          ? 'Pay by card, Apple Pay or Google Pay. It arrives as dollars, ready to put to work.'
          : 'Pay by card, Apple Pay or Google Pay. Ready in minutes.'}
      </p>

      <div
        className={cn(
          'mt-4 flex items-center gap-2 rounded-2xl px-4 py-3.5',
          'border border-border/50 bg-background/40 focus-within:border-primary/40',
          'transition-colors duration-200',
        )}
      >
        <span className="text-2xl font-semibold text-muted-foreground/80 select-none">€</span>
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          placeholder="50"
          aria-label="Amount in euros"
          data-testid="add-money-card-amount"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canContinue) onContinue()
          }}
          className="flex-1 min-w-0 bg-transparent text-2xl font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
        />
      </div>

      <div className="mt-2 flex gap-1.5">
        {['50', '100', '250'].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onAmountChange(preset)}
            className={cn(
              'flex-1 rounded-lg py-2 text-xs font-semibold transition-colors',
              amount === preset
                ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                : 'bg-background/40 text-muted-foreground hover:text-foreground border border-border/50',
            )}
          >
            €{preset}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        data-testid="add-money-card-continue"
        className={cn(
          'mt-4 h-14 w-full flex items-center justify-center gap-2 rounded-2xl',
          'bg-emerald-600 text-white font-bold text-base',
          'hover:bg-emerald-500 active:scale-[0.99] transition-all',
          'disabled:opacity-50 disabled:pointer-events-none',
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <CreditCard className="h-4 w-4" />
            Continue to payment
          </>
        )}
      </button>
    </>
  )
}

function MethodOption({
  icon,
  title,
  subtitle,
  onClick,
  testId,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  onClick: () => void
  testId: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'group w-full flex items-center gap-3.5 rounded-2xl p-3.5 text-left',
        'border border-border/50 bg-background/40',
        'hover:bg-background/70 hover:border-primary/30 transition-all duration-200',
      )}
    >
      <div className="shrink-0 h-11 w-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
    </button>
  )
}
