'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Banknote, Landmark, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SEPA_ONRAMP_COUNTRY_OPTIONS } from '@/lib/bridge/countries'
import { MIN_CASHOUT, type CashoutRecord, type UseBridgeCashout } from '@/hooks/use-bridge-cashout'
import { BridgeUpgradeNotice } from './BridgeUpgradeNotice'

/**
 * The two screens that make "Add money" run in reverse. Kept in their own file
 * rather than inlined into AddMoneySheet — that file is already long, and these
 * mount only in cash-out mode. The state machine still lives there; these are
 * just the `ready` and `active` branches for `mode="cashout"`.
 *
 * Consumer framing throughout: this is "cash out to your bank", never a memo,
 * a chain, or a transaction hash.
 */

const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/
const BIC_RE = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/

const norm = (s: string) => s.replace(/\s+/g, '').toUpperCase()

/**
 * Bridge sends EUR payouts under the customer's own name since its
 * 2026-09-02 upgrade — before that they originated from Bridge, so the
 * "shows up under your own name" reassurance would have been false.
 * Sep 3 UTC leaves the maintenance window + delay margin behind us.
 */
const PAYOUTS_IN_OWN_NAME = Date.now() >= Date.UTC(2026, 8, 3)

function formatEur(amount: string | number): string {
  const n = typeof amount === 'string' ? Number(amount) : amount
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(n)
}

/** Formats in the bucket's display currency — EURC reads as €, USDC as $. */
function formatMoney(amount: string | number, currency: 'eurc' | 'usdc'): string {
  const n = typeof amount === 'string' ? Number(amount) : amount
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency === 'usdc' ? 'USD' : 'EUR',
  }).format(n)
}

/* ── ready (cash-out): collect the user's own IBAN ─────────────────────────── */

export function PayoutIbanScreen({ cashout }: { cashout: UseBridgeCashout }) {
  const [holderName, setHolderName] = useState('')
  const [iban, setIban] = useState('')
  const [bic, setBic] = useState('')
  const [country, setCountry] = useState('')
  const [touched, setTouched] = useState(false)

  const ibanValid = IBAN_RE.test(norm(iban))
  // SEPA is IBAN-only, so an empty BIC is fine — but a typed one has to be
  // real, because a wrong BIC is worse than none.
  const bicValid = norm(bic) === '' || BIC_RE.test(norm(bic))
  // Bridge needs first/last name separately for an individual account owner.
  // Splitting on the last space is a pragmatic guess, so we only accept a name
  // that actually has two parts rather than sending a blank surname.
  const nameParts = holderName.trim().split(/\s+/)
  const nameValid = nameParts.length >= 2
  const canSubmit =
    nameValid && ibanValid && bicValid && country.length === 3 && !cashout.isRegistering

  const submit = () => {
    setTouched(true)
    if (!canSubmit) return
    void cashout.registerBank({
      iban: norm(iban),
      bic: norm(bic) || undefined,
      country,
      holderName: holderName.trim(),
      firstName: nameParts.slice(0, -1).join(' '),
      lastName: nameParts[nameParts.length - 1],
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Add the bank account you want your money sent to. We only need this once.
      </p>

      <div className="flex flex-col gap-3">
        <Field label="Account holder">
          <input
            value={holderName}
            onChange={(e) => setHolderName(e.target.value)}
            placeholder="Ada Lovelace"
            autoComplete="name"
            className={inputCls(touched && !nameValid)}
          />
          {touched && !nameValid && (
            <FieldHint>Enter the full name on the account.</FieldHint>
          )}
        </Field>

        <Field label="IBAN">
          <input
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="DE89 3704 0044 0532 0130 00"
            autoComplete="off"
            spellCheck={false}
            className={cn(inputCls(touched && !ibanValid), 'font-mono text-[13px]')}
          />
          {touched && !ibanValid && <FieldHint>That doesn&apos;t look like an IBAN.</FieldHint>}
        </Field>

        <Field label="BIC (optional)">
          <input
            value={bic}
            onChange={(e) => setBic(e.target.value)}
            placeholder="COBADEFFXXX"
            autoComplete="off"
            spellCheck={false}
            className={cn(inputCls(touched && !bicValid), 'font-mono text-[13px]')}
          />
          {touched && !bicValid && <FieldHint>That doesn&apos;t look like a BIC.</FieldHint>}
        </Field>

        <Field label="Country">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={inputCls(touched && country.length !== 3)}
          >
            <option value="">Select a country</option>
            {SEPA_ONRAMP_COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex items-start gap-2.5 rounded-2xl p-3 border border-amber-500/30 bg-amber-500/[0.07]">
        <TriangleAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          The account must be in your own name. Payouts to someone else&apos;s
          account will be returned.
        </p>
      </div>

      <Button
        onClick={submit}
        disabled={cashout.isRegistering}
        className="h-12 rounded-xl font-semibold w-full"
      >
        {cashout.isRegistering ? (
          <>
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            Adding…
          </>
        ) : (
          'Add bank account'
        )}
      </Button>
    </div>
  )
}

/* ── active (cash-out): amount → review → send ─────────────────────────────── */

export function CashOutScreen({ cashout }: { cashout: UseBridgeCashout }) {
  const [amount, setAmount] = useState('')
  const [confirming, setConfirming] = useState(false)

  const dest = cashout.destination
  // Which bucket is being drained. EURC reads as €, 1:1 into EUR; USDC reads
  // as $ and is converted by Bridge on the way out — hence the rate note.
  const cur = cashout.balanceCurrency
  const inDollars = cur === 'usdc'
  const fmt = (v: string | number) => formatMoney(v, cur)
  const available = Number(cashout.balance)
  const parsed = Number(amount)
  // Below Bridge's minimum the funds are neither paid out nor returned, so an
  // under-minimum amount is invalid, not merely inadvisable.
  const minimum = MIN_CASHOUT[cur]
  const amountValid =
    /^\d+(\.\d{1,7})?$/.test(amount) && parsed >= minimum && parsed <= available

  // Rough EUR arrival for USDC cash-outs, so "converted at the current rate"
  // has a number next to it. ECB reference rate (same query key as the
  // Add-money dialog, so the two surfaces share one fetch); Bridge applies its
  // own spread on top, hence "about". Null rate → the plain note stands alone.
  const fxQ = useQuery({
    queryKey: ['onramp-fx-eurusd'],
    enabled: inDollars,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const res = await fetch('/api/onramp/fx')
      const json = await res.json().catch(() => null)
      const rate = Number(json?.eurUsd)
      return Number.isFinite(rate) && rate > 0 ? rate : null
    },
  })
  const eurEstimate =
    inDollars && fxQ.data && parsed > 0 ? parsed / fxQ.data : null
  // "No fees" would be a lie — Bridge prices the FX spread into its rate. What
  // we can vouch for is our own side: no developer fee is configured, so
  // Peridot takes nothing.
  const estimateNote = (
    <p className="text-xs text-muted-foreground leading-relaxed px-1">
      {eurEstimate != null ? (
        <>
          You&apos;ll receive about {formatMoney(eurEstimate, 'eurc')} — your
          dollars are converted to euros at the current exchange rate.
        </>
      ) : (
        <>Your dollars arrive as euros, converted at the current exchange rate.</>
      )}{' '}
      Peridot adds no fee of its own.
    </p>
  )
  const feeNote = (
    <p className="text-xs text-muted-foreground leading-relaxed px-1">
      Peridot adds no fee of its own — your euros go straight to your bank.
    </p>
  )
  // Money waiting behind the bucket flip should be announced, not hidden.
  const otherHeld = Number(cashout.otherBalance)
  const otherWord = cashout.otherCurrency === 'usdc' ? 'dollars' : 'euros'

  if (!dest) return <PayoutIbanScreen cashout={cashout} />

  const setMax = () => {
    // Round DOWN at Stellar's 7dp precision — rounding up would build a payment
    // the ledger rejects as underfunded.
    setAmount((Math.floor(available * 1e7) / 1e7).toString())
  }

  const send = async () => {
    const ok = await cashout.cashOut(amount)
    if (ok) {
      setAmount('')
      setConfirming(false)
    }
  }

  if (confirming && amountValid) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-1 py-2 text-center">
          <span className="text-xs text-muted-foreground">You&apos;re cashing out</span>
          <span className="text-3xl font-semibold tracking-tight">{fmt(amount)}</span>
        </div>

        <div className="rounded-2xl border border-border/50 bg-background/40 divide-y divide-border/40">
          <ReviewRow label="To" value={dest.bank.holderName ?? 'Your account'} />
          <ReviewRow
            label="Account"
            value={dest.bank.ibanLast4 ? `•••• ${dest.bank.ibanLast4}` : '—'}
            mono
          />
          {dest.bank.bankName && <ReviewRow label="Bank" value={dest.bank.bankName} />}
          {eurEstimate != null && (
            <ReviewRow
              label="You receive"
              value={`\u2248 ${formatMoney(eurEstimate, 'eurc')}`}
            />
          )}
          <ReviewRow label="Arrives" value="Usually within 1 business day" />
        </div>

        {inDollars ? estimateNote : feeNote}

        {PAYOUTS_IN_OWN_NAME && (
          <p className="text-xs text-muted-foreground leading-relaxed px-1">
            On your bank statement this shows up under your own name — like a
            transfer from yourself.
          </p>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setConfirming(false)}
            disabled={cashout.isSending}
            className="h-12 rounded-xl font-semibold flex-1"
          >
            Back
          </Button>
          <Button
            onClick={send}
            disabled={cashout.isSending}
            className="h-12 rounded-xl font-semibold flex-1"
          >
            {cashout.isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Sending…
              </>
            ) : (
              'Confirm'
            )}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <BridgeUpgradeNotice />

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Amount</span>
          <button
            onClick={setMax}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {cashout.isLoadingBalance ? 'Loading…' : `${fmt(available)} available`}
          </button>
        </div>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
            {inDollars ? '$' : '€'}
          </span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(',', '.'))}
            placeholder="0.00"
            inputMode="decimal"
            autoComplete="off"
            className={cn(
              'w-full h-12 pl-7 pr-3 rounded-xl bg-background/60 border text-base',
              'outline-none transition-colors',
              amount && !amountValid
                ? 'border-destructive/50'
                : 'border-border/60 focus:border-primary/50',
            )}
          />
        </div>
        {amount && parsed > available && (
          <FieldHint>That&apos;s more than you have available.</FieldHint>
        )}
        {amount && parsed > 0 && parsed < minimum && (
          <FieldHint>The minimum is {fmt(minimum)}.</FieldHint>
        )}
        {!amount && available > 0 && available < minimum && (
          <FieldHint>
            Cash-outs start at {fmt(minimum)} — you have {fmt(available)}.
          </FieldHint>
        )}
        {otherHeld > 0 && (
          <FieldHint>
            Plus {formatMoney(otherHeld, cashout.otherCurrency)} in {otherWord} —
            those come next, after this cash-out.
          </FieldHint>
        )}
      </div>

      <div className="rounded-2xl border border-border/50 bg-background/40 divide-y divide-border/40">
        <ReviewRow label="To" value={dest.bank.holderName ?? 'Your account'} />
        <ReviewRow
          label="Account"
          value={dest.bank.ibanLast4 ? `•••• ${dest.bank.ibanLast4}` : '—'}
          mono
        />
      </div>

      {inDollars ? estimateNote : feeNote}

      <Button
        onClick={() => setConfirming(true)}
        disabled={!amountValid}
        className="h-12 rounded-xl font-semibold w-full"
      >
        Review
      </Button>

      <CashoutHistory cashouts={cashout.cashouts} pending={cashout.hasPending} />
    </div>
  )
}

/* ── history ──────────────────────────────────────────────────────────────── */

const CASHOUT_STATUS_META: Record<string, { label: string; className: string }> = {
  submitted: { label: 'Sending', className: 'text-amber-500 bg-amber-500/10' },
  funds_received: { label: 'Processing', className: 'text-amber-500 bg-amber-500/10' },
  payment_submitted: { label: 'On its way', className: 'text-amber-500 bg-amber-500/10' },
  completed: { label: 'Paid out', className: 'text-emerald-500 bg-emerald-500/10' },
  returned: { label: 'Returned', className: 'text-muted-foreground bg-muted/50' },
  refunded: { label: 'Refunded', className: 'text-muted-foreground bg-muted/50' },
  failed: { label: 'Failed', className: 'text-destructive bg-destructive/10' },
}

function CashoutHistory({
  cashouts,
  pending,
}: {
  cashouts: CashoutRecord[]
  pending: boolean
}) {
  if (cashouts.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-border/40 bg-muted/30 px-3.5 py-3">
        <Landmark className="h-4 w-4 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground">
          No cash-outs yet — they&apos;ll appear here once you make one.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground">
        Recent cash-outs{pending && ' · updating…'}
      </p>
      <div className="rounded-2xl border border-border/40 bg-background/40 divide-y divide-border/40">
        {cashouts.map((c) => {
          const meta = CASHOUT_STATUS_META[c.status] ?? {
            label: c.status,
            className: 'text-muted-foreground bg-muted/50',
          }
          return (
            <div key={c.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="flex-1 text-sm text-foreground">
                {/* fiatAmount is what actually landed, always EUR; before the
                    drain settles all we know is what was sent, in its own
                    currency — a USDC row must not masquerade as euros. */}
                {c.fiatAmount
                  ? formatEur(c.fiatAmount)
                  : formatMoney(c.amount, c.currency === 'usdc' ? 'usdc' : 'eurc')}
              </span>
              <span
                className={cn(
                  'text-[11px] font-semibold px-2 py-0.5 rounded-md',
                  meta.className,
                )}
              >
                {meta.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── shared leaves ────────────────────────────────────────────────────────── */

function inputCls(invalid?: boolean): string {
  return cn(
    'w-full h-11 px-3.5 rounded-xl bg-background/60 border text-sm',
    'outline-none transition-colors',
    invalid ? 'border-destructive/50' : 'border-border/60 focus:border-primary/50',
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] text-destructive">{children}</span>
}

function ReviewRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      <span
        className={cn(
          'flex-1 min-w-0 text-sm text-foreground break-all',
          mono && 'font-mono text-[13px]',
        )}
      >
        {value}
      </span>
    </div>
  )
}

/** Shown while the user is verified but has no cash-out address provisioned. */
export function CashOutHeader() {
  return (
    <div className="flex items-center gap-2.5 pb-3 sm:pb-4">
      <div className="relative p-2.5 rounded-2xl overflow-hidden shrink-0 bg-gradient-to-br from-primary/25 to-primary/5 border border-primary/25">
        <Banknote className="h-5 w-5 text-primary relative z-10" />
      </div>
      <span className="text-lg font-semibold tracking-tight">Cash out</span>
    </div>
  )
}

/** Verified, but the wallet holds nothing to cash out yet. */
export function NothingToCashOutScreen() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center">
        <ShieldCheck className="h-5 w-5 text-primary" />
      </div>
      <p className="text-sm font-semibold text-foreground">Nothing to cash out</p>
      <p className="text-xs text-muted-foreground max-w-[18rem]">
        Once you have money in your account, you can send it back to your bank
        from here.
      </p>
    </div>
  )
}
