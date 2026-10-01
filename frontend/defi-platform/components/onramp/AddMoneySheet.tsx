'use client'

import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLogin, usePrivy } from '@privy-io/react-auth'
import { SOCIAL_LOGIN } from '@/config/privyLogin'
import {
  ArrowRight,
  Banknote,
  Check,
  Copy,
  Clock,
  ExternalLink,
  Landmark,
  Loader2,
  ScrollText,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SEPA_ONRAMP_COUNTRY_OPTIONS } from '@/lib/bridge/countries'
import {
  useBridgeOnramp,
  type OnrampDestinationCurrency,
  type OnrampTransfer,
} from '@/hooks/use-bridge-onramp'
import { useBridgeCashout } from '@/hooks/use-bridge-cashout'
import { OnrampProgress } from './OnrampProgress'
import { CashOutHeader, CashOutScreen, PayoutIbanScreen } from './CashOutScreens'
import { BridgeUpgradeNotice } from './BridgeUpgradeNotice'
import { ArrivalAlertToggle } from './ArrivalAlertToggle'
import { FEATURE_FLAGS } from '@/config/featureFlags'

/**
 * Stablecoin a bank deposit converts to when the caller doesn't specify one.
 *
 * EURC is the better deal (no EUR->USD spread), but Bridge has no
 * `eur -> eurc` route to an external address — so in direct-to-wallet mode
 * asking for EURC is rejected outright and USDC is the only thing that works.
 */
const DEFAULT_DESTINATION_CURRENCY: OnrampDestinationCurrency =
  FEATURE_FLAGS.FIAT_ONRAMP_DIRECT_TO_WALLET ? 'usdc' : 'eurc'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Which direction money is moving. Both share one state machine: the Bridge
 * customer, KYC and `sepa` endorsement are identical either way — Bridge's
 * endorsement covers the rail in both directions, so a verified on-ramp user
 * can cash out without re-verifying.
 */
export type MoneyDirection = 'add' | 'cashout'

/** Plain (Radix-free) header so the body can render outside a Dialog too. */
function OnrampHeader() {
  return (
    <>
      <div className="sm:hidden flex justify-center -mt-1 mb-2" aria-hidden>
        <div className="h-1 w-10 rounded-full bg-foreground/15" />
      </div>
      <div className="flex items-center gap-2.5 pb-3 sm:pb-4">
        <div className="relative p-2.5 rounded-2xl overflow-hidden shrink-0 bg-gradient-to-br from-primary/25 to-primary/5 border border-primary/25">
          <Banknote className="h-5 w-5 text-primary relative z-10" />
        </div>
        <span className="text-lg font-semibold tracking-tight">Add money</span>
      </div>
    </>
  )
}

/**
 * The bank-transfer on-ramp flow without a Dialog shell. Renders entirely from
 * plain markup so it can sit inside any overlay: the "Add money" sheet
 * (`AddMoneyHost`), the deposit sheet's bank step and the wallet dialog's
 * cash-out view.
 *
 * Pass `embedded` when the host overlay already provides a header — the
 * internal header is then skipped to avoid a duplicate title.
 */
export function AddMoneyBody({
  embedded = false,
  destinationCurrency = DEFAULT_DESTINATION_CURRENCY,
  mode = 'add',
}: {
  embedded?: boolean
  /**
   * Stablecoin the deposit will convert to. Defaults to EURC (zero FX) — or to
   * USDC in direct-to-wallet mode, where Bridge does not support an EUR->EURC
   * route to an external address. See {@link DEFAULT_DESTINATION_CURRENCY}.
   */
  destinationCurrency?: OnrampDestinationCurrency
  /** Direction of travel. Only the `ready`/`active` screens differ. */
  mode?: MoneyDirection
}) {
  const { user, authenticated, ready } = usePrivy()
  const onramp = useBridgeOnramp(true)
  // Only fetches in cash-out mode — the hook self-gates on the off-ramp flag.
  const cashout = useBridgeCashout(mode === 'cashout')

  // Stellar-only users land here without a Privy session — the on-ramp API
  // would 401 every call. Show a friendly sign-in gate before anything that
  // depends on `authenticated` so they don't sit in "Checking your account…"
  // forever, only to fail silently at KYC submit. We don't force a login on
  // page load (per project memory: don't gate Stellar-only users), only at
  // this point where SEPA truly needs a verified identity.
  const Header = mode === 'cashout' ? CashOutHeader : OnrampHeader

  if (ready && !authenticated) {
    return (
      <div className="flex flex-col gap-4">
        {!embedded && <Header />}
        <SignInGate />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {!embedded && <Header />}

      {/* Persistent progress + live "what's happening" caption. */}
      <OnrampProgress state={onramp.state} isFetching={onramp.isFetching} />

      {onramp.isLoading ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
          <p className="text-sm text-muted-foreground">Checking your account…</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={onramp.state}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            <StateScreen
              onramp={onramp}
              cashout={cashout}
              mode={mode}
              defaultEmail={user?.email?.address ?? ''}
              destinationCurrency={destinationCurrency}
            />
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}

/**
 * Sign-in step for users that reached the bank-transfer flow without a Privy
 * session — typically Stellar-only users who connected via Freighter/xBull.
 *
 * Bridge KYC is person-bound (one human = one Bridge customer keyed by Privy
 * DID), so we MUST anchor on a Privy identity before the KYC link can be
 * minted. We open Privy's full login picker (wallet / social / email) so the
 * user keeps the same choice they get everywhere else — a wallet-only sign-in
 * simply means they'll type their email at the KYC step, while social/email
 * sign-ins pre-fill it. Once authenticated, the parent re-renders into the
 * normal `StartScreen` and KYC continues.
 */
function SignInGate() {
  const { login } = useLogin()

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border/60 bg-muted/30 px-4 py-3.5 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <ShieldCheck className="h-4 w-4 text-primary" />
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Bank transfers need a verified identity. Sign in with a wallet, a
          social account or your email to continue. Funds you receive are sent
          straight to your own wallet.
        </p>
      </div>

      <Button
        type="button"
        size="lg"
        className="h-12 rounded-2xl text-base font-semibold"
        onClick={() => login(SOCIAL_LOGIN)}
        data-testid="onramp-signin-gate"
      >
        Sign in
        <ArrowRight className="h-4 w-4 ml-1.5" />
      </Button>

      <p className="text-[11px] text-muted-foreground text-center">
        Your connected wallet stays connected. Signing in only links an identity
        for compliance.
      </p>
    </div>
  )
}

type Onramp = ReturnType<typeof useBridgeOnramp>

function StateScreen({
  onramp,
  cashout,
  mode,
  defaultEmail,
  destinationCurrency,
}: {
  onramp: Onramp
  cashout: ReturnType<typeof useBridgeCashout>
  mode: MoneyDirection
  defaultEmail: string
  destinationCurrency: OnrampDestinationCurrency
}) {
  // Every verification step below is shared — only the two terminal screens
  // differ by direction. `ready` and `active` are on-ramp vocabulary ("has a
  // virtual account"), which says nothing about cash-out readiness, so the
  // cash-out branch keys off whether a payout destination exists instead. A
  // user who only ever cashes out would otherwise sit at `ready` forever.
  if (mode === 'cashout') {
    switch (onramp.state) {
      case 'active':
      case 'ready':
        if (cashout.isLoadingDestination) {
          return (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">Checking your account…</p>
            </div>
          )
        }
        return cashout.destination ? (
          <CashOutScreen cashout={cashout} />
        ) : (
          <PayoutIbanScreen cashout={cashout} />
        )
      default:
        break // fall through to the shared verification screens
    }
  }

  // BankAccountScreen + ReadyScreen need the destination so they can show /
  // provision the right IBAN. Other states are independent of it.
  switch (onramp.state) {
    case 'active':
      return <BankAccountScreen onramp={onramp} destinationCurrency={destinationCurrency} />
    case 'ready':
      return <ReadyScreen onramp={onramp} destinationCurrency={destinationCurrency} />
    case 'kyc_rejected':
      return <RejectedScreen onramp={onramp} />
    case 'tos_pending':
      return <TermsScreen onramp={onramp} />
    case 'kyc_in_progress':
      return <VerifyingScreen onramp={onramp} />
    case 'sepa_pending':
      return (
        <WaitingScreen
          title="Almost there"
          message="We're enabling bank transfers on your account. This is usually quick — you can close this and check back shortly."
        />
      )
    default:
      return <StartScreen onramp={onramp} defaultEmail={defaultEmail} />
  }
}

/* ── not_started: collect email + country, open hosted KYC ─────────────────── */

function StartScreen({ onramp, defaultEmail }: { onramp: Onramp; defaultEmail: string }) {
  const [email, setEmail] = useState(defaultEmail)
  const [country, setCountry] = useState('')
  const [touched, setTouched] = useState(false)

  const emailValid = EMAIL_RE.test(email.trim())
  const canSubmit = emailValid && country.length === 3 && !onramp.requestKycLink.isPending

  // Just create the Bridge customer. We deliberately do NOT open any hosted
  // page here: the old flow pre-opened a popup and navigated it async, which
  // is unreliable on mobile / in-app browsers. Once the customer exists the
  // state advances to `tos_pending`, and `TermsScreen` / `VerifyingScreen`
  // render real tap-to-open links (Terms first, then KYC).
  const submit = () => {
    setTouched(true)
    if (!canSubmit) return
    onramp.requestKycLink.mutate({ email: email.trim(), country })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Add money straight from your bank account by transfer. First, a one-time
        identity check — it usually takes about a minute.
      </p>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground" htmlFor="onramp-email">
          Email
        </label>
        <input
          id="onramp-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={cn(
            'w-full h-11 px-3.5 rounded-xl text-sm bg-background/50',
            'border border-border/50 focus:border-primary/50 focus:outline-none',
            touched && !emailValid && 'border-destructive/60',
          )}
        />
        {/* Wallet sign-ins carry no email — make it clear why we ask. Social /
            email sign-ins arrive pre-filled, so we stay quiet there. */}
        {!defaultEmail && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            We need an email for transfer confirmations and the one-time identity
            check.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground" htmlFor="onramp-country">
          Country of residence
        </label>
        <select
          id="onramp-country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className={cn(
            'w-full h-11 px-3 rounded-xl text-sm bg-background/50',
            'border border-border/50 focus:border-primary/50 focus:outline-none',
            touched && country.length !== 3 && 'border-destructive/60',
          )}
        >
          <option value="">Select a country…</option>
          {SEPA_ONRAMP_COUNTRY_OPTIONS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {onramp.requestKycLink.isError && (
        <ErrorNote message={onramp.requestKycLink.error?.message ?? 'Something went wrong'} />
      )}

      <Button
        onClick={submit}
        disabled={!canSubmit}
        className="h-11 rounded-xl font-semibold w-full"
      >
        {onramp.requestKycLink.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            Starting…
          </>
        ) : (
          <>
            Continue
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </>
        )}
      </Button>

      <p className="text-[11px] text-muted-foreground text-center">
        Next, you’ll accept our payment partner’s terms and complete a one-time
        identity check — handled by our regulated payments partner.
      </p>
    </div>
  )
}

/* ── generic waiting screen (sepa_pending) ─────────────────────────────────── */

function WaitingScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center">
        <Loader2 className="h-5 w-5 text-primary animate-spin" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground max-w-[18rem]">{message}</p>
      </div>
    </div>
  )
}

/* ── hosted-link step (Terms / KYC) ────────────────────────────────────────── */

/**
 * Renders a single hosted-page step (Bridge Terms of Service or Persona KYC)
 * as a real tap-to-open link.
 *
 * Why a real `<a target="_blank">` and not `window.open`: the previous flow
 * pre-opened a blank popup and navigated it inside an async callback, which
 * mobile and in-app browsers block — users ended up with a dead blank tab and
 * no way forward. A genuine anchor the user taps is a first-class user gesture
 * that every browser honours.
 *
 * The hosted URL isn't known until Bridge mints the link. For a customer that
 * already exists the `requestKycLink` mutation is idempotent and returns both
 * links, so we read them from `requestKycLink.data` when present and otherwise
 * fetch once on mount. Both `tos_link` and `kyc_link` come back in the same
 * response, so a single fetch covers both steps.
 *
 * There is no return-redirect to rely on (ToS has none; KYC's redirect lands
 * in the new tab). Instead this tab keeps polling the on-ramp state and
 * refetches on window focus, so it advances on its own the moment the user
 * comes back from the hosted page.
 */
function HostedLinkStep({
  onramp,
  kind,
  icon,
  title,
  body,
  cta,
}: {
  onramp: Onramp
  kind: 'tos' | 'kyc'
  icon: React.ReactNode
  title: string
  body: string
  cta: string
}) {
  const data = onramp.requestKycLink.data
  const link = kind === 'tos' ? data?.tosLink : data?.kycLink
  const fetchedRef = useRef(false)

  // Fetch the hosted links once if we don't already have them (e.g. the user
  // returned to a fresh page where the mutation result is gone). Email/country
  // are ignored server-side once the customer exists.
  useEffect(() => {
    if (link || fetchedRef.current || onramp.requestKycLink.isPending) return
    fetchedRef.current = true
    onramp.requestKycLink.mutate({ email: 'placeholder@noop.invalid', country: 'DEU' })
  }, [link, onramp.requestKycLink])

  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground max-w-[18rem]">{body}</p>
      </div>

      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'h-11 rounded-xl font-semibold w-full inline-flex items-center justify-center gap-1.5',
            'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
          )}
        >
          {cta}
          <ExternalLink className="h-4 w-4" />
        </a>
      ) : (
        <Button disabled className="h-11 rounded-xl font-semibold w-full">
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          Preparing…
        </Button>
      )}

      {onramp.requestKycLink.isError && (
        <ErrorNote message={onramp.requestKycLink.error?.message ?? 'Something went wrong'} />
      )}

      <p className="text-[11px] text-muted-foreground max-w-[18rem]">
        Opens in a new tab. This page updates automatically once you’re done —
        you can close the tab and come back here.
      </p>
    </div>
  )
}

/* ── tos_pending ───────────────────────────────────────────────────────────── */

function TermsScreen({ onramp }: { onramp: Onramp }) {
  return (
    <HostedLinkStep
      onramp={onramp}
      kind="tos"
      icon={<ScrollText className="h-5 w-5 text-primary" />}
      title="Accept the terms"
      body="A one-time agreement with our regulated payments partner. Required before we can set up bank transfers."
      cta="Review & accept terms"
    />
  )
}

/* ── kyc_in_progress ───────────────────────────────────────────────────────── */

function VerifyingScreen({ onramp }: { onramp: Onramp }) {
  // KYC approved server-side but still waiting on Bridge review → the link is
  // done, just show the waiting state instead of re-offering it.
  if (onramp.customer?.kycStatus === 'approved') {
    return (
      <WaitingScreen
        title="Verifying your identity"
        message="Your details are with our payments partner. This usually takes a minute or two — this page updates on its own."
      />
    )
  }
  return (
    <HostedLinkStep
      onramp={onramp}
      kind="kyc"
      icon={<ShieldCheck className="h-5 w-5 text-primary" />}
      title="Verify your identity"
      body="A quick one-time identity check with our payments partner. Usually takes about a minute."
      cta="Start verification"
    />
  )
}

/* ── kyc_rejected ──────────────────────────────────────────────────────────── */

function RejectedScreen({ onramp }: { onramp: Onramp }) {
  const reasons = Array.isArray(onramp.customer?.rejectionReasons)
    ? (onramp.customer?.rejectionReasons as { reason?: string }[])
    : []
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="h-12 w-12 rounded-2xl bg-destructive/10 border border-destructive/25 flex items-center justify-center">
        <TriangleAlert className="h-5 w-5 text-destructive" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">
          Verification couldn&apos;t be completed
        </p>
        <p className="text-xs text-muted-foreground max-w-[18rem]">
          We weren&apos;t able to verify your identity. Please contact support if
          you think this is a mistake.
        </p>
      </div>
      {reasons.length > 0 && (
        <ul className="w-full space-y-1.5 text-left">
          {reasons.map((r, i) => (
            <li
              key={i}
              className="text-xs text-muted-foreground rounded-lg bg-muted/40 border border-border/40 px-3 py-2"
            >
              {r.reason ?? 'Unspecified'}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ── ready: provision the bank account ─────────────────────────────────────── */

function ReadyScreen({
  onramp,
  destinationCurrency,
}: {
  onramp: Onramp
  destinationCurrency: OnrampDestinationCurrency
}) {
  const existing = onramp.bankAccounts.find(
    (a) => a.destinationCurrency === destinationCurrency,
  )
  // If the IBAN for THIS destination is already provisioned we shouldn't be
  // on the Ready screen — the parent's state machine will switch to 'active'
  // on the next refetch. Render a brief settling state.
  if (existing) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
        <p className="text-sm text-muted-foreground">Loading your bank account…</p>
      </div>
    )
  }

  const isUsdc = destinationCurrency === 'usdc'
  // Our Bridge account is not yet entitled to provision the wallet behind the
  // IBAN. Nothing the user can do, and no retry will help — see
  // isWalletNotEnabledError in lib/bridge/client.
  const blockedOnUs =
    (onramp.createBankAccount.error as (Error & { code?: string }) | null)?.code ===
    'wallet_not_enabled'

  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center">
        <ShieldCheck className="h-5 w-5 text-emerald-500" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">You&apos;re verified</p>
        <p className="text-xs text-muted-foreground max-w-[18rem]">
          {isUsdc
            ? "We'll set up a EUR bank account in your name. Deposits convert to dollars (USDC) — up to 1% FX applies."
            : "We'll set up a EUR bank account in your name so you can add money by transfer."}
        </p>
      </div>

      {onramp.createBankAccount.isError && (
        <ErrorNote
          message={onramp.createBankAccount.error?.message ?? 'Something went wrong'}
          tone={blockedOnUs ? 'pending' : 'error'}
        />
      )}

      {/* Blocked on an approval our payment partner has to grant us — retrying
          can never succeed, so don't offer a button the user will keep tapping. */}
      {!blockedOnUs && (
        <Button
          onClick={() => onramp.createBankAccount.mutate({ destinationCurrency })}
          disabled={onramp.createBankAccount.isPending}
          className="h-11 rounded-xl font-semibold w-full"
        >
          {onramp.createBankAccount.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Setting up…
            </>
          ) : (
            'Set up my account'
          )}
        </Button>
      )}
    </div>
  )
}

/* ── active: show IBAN + top-up history ────────────────────────────────────── */

function BankAccountScreen({
  onramp,
  destinationCurrency,
}: {
  onramp: Onramp
  destinationCurrency: OnrampDestinationCurrency
}) {
  // Prefer the IBAN that matches the selected destination; fall back to the
  // legacy single-account field so callers that don't pass a destination
  // keep their existing behavior. If no IBAN for this destination is
  // provisioned yet, the user is effectively "ready" — provision it inline.
  const acct =
    onramp.bankAccounts.find((a) => a.destinationCurrency === destinationCurrency) ??
    (destinationCurrency === 'eurc' ? onramp.bankAccount : null)
  if (!acct) {
    return <ReadyScreen onramp={onramp} destinationCurrency={destinationCurrency} />
  }
  // Since Bridge's September 2026 upgrade the account is held in the user's
  // own name — a trust signal worth stating. Until the rename propagates (or
  // while our cache is stale) the holder can still read as Bridge; only make
  // the "your name" claim once it no longer does, and keep the plain warning
  // otherwise.
  const holderIsUser = Boolean(acct.holderName) && !/bridge/i.test(acct.holderName!)
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Transfer money from your bank to the account below. It usually arrives
        within one business day and tops up your balance automatically.
      </p>

      {/* Sits above the details on purpose: "address it to your name" has to
          land before the user copies the recipient into their banking app. */}
      <BridgeUpgradeNotice />

      <div className="rounded-2xl border border-border/50 bg-background/40 divide-y divide-border/40">
        <DetailRow label="Account holder" value={acct.holderName} />
        <DetailRow label="IBAN" value={acct.iban} mono copyable />
        <DetailRow label="BIC" value={acct.bic} mono copyable />
        {acct.bankName && <DetailRow label="Bank" value={acct.bankName} />}
      </div>

      {holderIsUser ? (
        <div className="flex items-start gap-2.5 rounded-2xl p-3 border border-emerald-500/30 bg-emerald-500/[0.07]">
          <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            This account is in your own name — topping up is simply a transfer
            between your accounts. Send {acct.currency.toUpperCase()} from a bank
            account that&apos;s also in your name; other transfers may be delayed
            or returned.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-2xl p-3 border border-amber-500/30 bg-amber-500/[0.07]">
          <TriangleAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Only send {acct.currency.toUpperCase()} from a bank account in your own
            name. Other transfers may be delayed or returned.
          </p>
        </div>
      )}

      {/* The transfer the user is about to make takes hours — offer the ping
          right where they're copying the IBAN, before the tab closes. */}
      <ArrivalAlertToggle />

      <TransferHistory transfers={onramp.transfers} pending={onramp.hasPendingTransfer} />
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono,
  copyable,
}: {
  label: string
  value: string | null
  mono?: boolean
  copyable?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      <span
        className={cn(
          'flex-1 min-w-0 text-sm text-foreground break-all',
          mono && 'font-mono text-[13px]',
        )}
      >
        {value ?? '—'}
      </span>
      {copyable && value && (
        <button
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center border border-border/40 bg-background/60 hover:border-primary/30 hover:text-primary transition-colors"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      )}
    </div>
  )
}

const TRANSFER_STATUS_META: Record<
  OnrampTransfer['status'],
  { label: string; className: string }
> = {
  processing: { label: 'Processing', className: 'text-amber-500 bg-amber-500/10' },
  in_review: { label: 'In review', className: 'text-amber-500 bg-amber-500/10' },
  completed: { label: 'Added', className: 'text-emerald-500 bg-emerald-500/10' },
  refunded: { label: 'Returned', className: 'text-muted-foreground bg-muted/50' },
}

function TransferHistory({
  transfers,
  pending,
}: {
  transfers: OnrampTransfer[]
  pending: boolean
}) {
  if (transfers.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-border/40 bg-muted/30 px-3.5 py-3">
        <Landmark className="h-4 w-4 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground">
          No top-ups yet — they&apos;ll appear here once your transfer arrives.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground">
        Recent top-ups{pending && ' · updating…'}
      </p>
      <div className="rounded-2xl border border-border/40 bg-background/40 divide-y divide-border/40">
        {transfers.map((tx) => {
          const meta = TRANSFER_STATUS_META[tx.status]
          return (
            <div key={tx.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="flex-1 text-sm text-foreground">
                {tx.amount != null
                  ? new Intl.NumberFormat(undefined, {
                      style: 'currency',
                      currency: tx.currency || 'EUR',
                    }).format(tx.amount)
                  : '—'}
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

/* ── shared ────────────────────────────────────────────────────────────────── */

/**
 * `tone="pending"` is for conditions the user cannot act on and that no retry
 * will clear — something is queued on our side. Styling it as a red error
 * reads as "you did something wrong" and pushes people to keep tapping, so it
 * gets a calm, neutral treatment instead.
 */
function ErrorNote({
  message,
  tone = 'error',
}: {
  message: string
  tone?: 'error' | 'pending'
}) {
  const pending = tone === 'pending'
  const Icon = pending ? Clock : TriangleAlert
  return (
    <div
      className={cn(
        'w-full flex items-start gap-2.5 rounded-xl p-3 border',
        pending
          ? 'border-border/50 bg-muted/40'
          : 'border-destructive/30 bg-destructive/[0.07]',
      )}
    >
      <Icon
        className={cn(
          'h-4 w-4 shrink-0 mt-0.5',
          pending ? 'text-muted-foreground' : 'text-destructive',
        )}
      />
      <p className="text-xs text-muted-foreground leading-relaxed">{message}</p>
    </div>
  )
}
