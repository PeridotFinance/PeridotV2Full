'use client'

/**
 * StellarFundingDialog — the big, prominent "charge up your test wallet" popup.
 *
 * Auto-opens the first time a connected real-mode wallet has no tradeable funds,
 * so the user can't land on a page full of disabled buttons. One tap runs the
 * existing onboarding flow: Friendbot activates + funds the account with XLM (for
 * network fees), then the wallet mints itself test USDT to trade with — both
 * signed by the same embedded Privy wallet the trades use.
 *
 * Dismissible: closing it falls back to the inline StellarOnboardingCard, which
 * stays put until funds arrive. We never re-nag with the modal once dismissed.
 */
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Zap, Coins, Fuel, Check, Rocket, AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { OnboardingStep } from '../../hooks/use-stellar-margin-onboarding'
import { STELLAR_MARGIN_CONFIG as CFG } from '../../config/stellarMarginConfig'

interface Props {
  /** True when the connected real-mode wallet has no tradeable funds yet. */
  needsSetup: boolean
  step: OnboardingStep
  isBusy: boolean
  /** Why the last attempt failed. This modal covers the whole page while setup
   *  runs, so a failure has to be readable *here* — see the note at the error box. */
  error?: string | null
  onSetup: () => void
}

/** How long the finished state stays up before the modal gets out of the way. */
const DONE_LINGER_MS = 2_200

export function StellarFundingDialog({ needsSetup, step, isBusy, error, onSetup }: Props) {
  const [open, setOpen] = useState(false)
  // Only ever auto-open once per "needs funds" episode — don't nag after dismiss.
  const autoOpenedRef = useRef(false)

  const done = step === 'done'

  useEffect(() => {
    if (needsSetup && !autoOpenedRef.current) {
      autoOpenedRef.current = true
      setOpen(true)
    }
    // When funds finally arrive, reset so a future drain re-arms the auto-open.
    //
    // But do NOT close on `done`: `needsSetup` carries `step !== 'done'`, so it
    // flips false in the very render that lands on success — this branch used to
    // slam the modal shut before its finished state could paint, making the whole
    // payoff moment of onboarding unreachable. The timer below handles that exit.
    if (!needsSetup) {
      autoOpenedRef.current = false
      if (!done) setOpen(false)
    }
  }, [needsSetup, done])

  // Let the success state be seen, then leave.
  useEffect(() => {
    if (!done || !open) return
    const t = setTimeout(() => setOpen(false), DONE_LINGER_MS)
    return () => clearTimeout(t)
  }, [done, open])

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isBusy) setOpen(o) }}>
      {/* `max-h` + scroll, not just `overflow-hidden`: the dialog is ~540px of
          hero + three rows + CTA, and a centred fixed box taller than the viewport
          has no way to reach its own button. On a short window (phone in landscape,
          a small laptop with the browser chrome) the CTA sat off-screen. */}
      <DialogContent
        data-testid="margin-funding-dialog"
        closeDisabled={isBusy}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto overflow-x-hidden border-white/10 bg-background/95 p-0 backdrop-blur-xl"
      >
        {/* Hero band */}
        {/* One green, the brand one. The band used to fade primary → emerald,
            which mixes two hues into a muddy olive across the widest surface in
            the dialog. */}
        <div className="relative isolate bg-gradient-to-br from-primary/20 via-primary/10 to-transparent px-6 pt-8 pb-6">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/20 ring-1 ring-primary/30"
          >
            <Zap className="h-8 w-8 text-primary" />
          </motion.div>
          {/* A real `DialogTitle`, not a bare <h2>: Radix names the dialog from it.
              Without one this modal — the one that opens unasked — was announced
              to screen readers as an unnamed dialog, and Radix logged an error. */}
          <DialogTitle className="mt-4 text-center text-xl font-extrabold tracking-tight text-foreground">
            Set up your trading account
          </DialogTitle>
          <p className="mx-auto mt-1.5 max-w-sm text-center text-sm text-muted-foreground">
            We’ll fund your account with free test money so you can start trading right away — no real money, zero risk.
          </p>
        </div>

        {/* What happens — one tap runs all three; the third drops the funds
            straight into the margin (trading) account so there's no separate
            "add collateral" step to discover later. */}
        <div className="space-y-2.5 px-6">
          <FundRow
            icon={<Fuel className="h-4 w-4 text-amber-400" />}
            title="Activate your account"
            sub="Covers network fees — handled for you"
            active={step === 'activating'}
            complete={step === 'minting' || step === 'funding' || done}
          />
          <FundRow
            icon={<Coins className="h-4 w-4 text-primary" />}
            title={`${CFG.constants.FAUCET_GRANT_USDT} test USDT`}
            sub="Your one-time free starting balance"
            active={step === 'minting'}
            complete={step === 'funding' || done}
          />
          <FundRow
            icon={<Rocket className="h-4 w-4 text-primary" />}
            title="Ready in your trading account"
            sub="Funds land where you trade — open a position instantly"
            active={step === 'funding'}
            complete={done}
          />
        </div>

        {/* Why it didn't work. The toast this used to rely on is fired from a
            hook while this modal covers the page — and even now that toasts
            render above dialogs, an error about the button you just pressed
            belongs next to that button, not in the corner. Without it the CTA
            simply sprang back to its idle label and the run looked ignored. */}
        {error && !isBusy && (
          <div className="mx-6 mt-4 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-red-400" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-red-300">Setup didn’t finish</p>
              <p className="mt-0.5 text-[11px] leading-snug text-red-300/80">{error}</p>
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="px-6 pb-6 pt-5">
          <Button
            data-testid="margin-funding-cta"
            onClick={onSetup}
            disabled={isBusy || done}
            className="h-14 w-full rounded-2xl text-base font-extrabold shadow-lg shadow-primary/20"
          >
            {isBusy ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" />{
                step === 'activating' ? 'Activating account…'
                : step === 'minting' ? 'Adding test funds…'
                : 'Funding your trading account…'
              }</>
            ) : done ? (
              <><Check className="mr-2 h-5 w-5" />Ready to trade</>
            ) : error ? (
              <><Zap className="mr-2 h-5 w-5" />Try again</>
            ) : (
              <><Zap className="mr-2 h-5 w-5" />Fund my trading account</>
            )}
          </Button>
          {!isBusy && !done && (
            <button
              onClick={() => setOpen(false)}
              className="mx-auto mt-3 block text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Maybe later
            </button>
          )}
          <p className="mt-3 text-center text-[10px] text-muted-foreground/70">
            Funded via Stellar Friendbot on testnet. Takes a few seconds.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FundRow({
  icon, title, sub, active, complete,
}: { icon: React.ReactNode; title: string; sub: string; active: boolean; complete: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
      </div>
      <div className="shrink-0">
        {complete ? (
          <Check className="h-4 w-4 text-primary" />
        ) : active ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : null}
      </div>
    </div>
  )
}
