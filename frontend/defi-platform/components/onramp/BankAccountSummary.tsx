'use client'

import { useState } from 'react'
import { Banknote, Check, Copy, ChevronRight } from 'lucide-react'
import { usePrivy } from '@privy-io/react-auth'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { useBridgeOnramp } from '@/hooks/use-bridge-onramp'
import type { OnrampBankAccount } from '@/hooks/use-bridge-onramp'

/**
 * The user's own bank details (IBAN), shown as a standing part of their
 * account rather than a screen buried in the "add money" flow.
 *
 * Until now the IBAN only existed inside the funding sheet, two taps deep and
 * only while a transfer was in flight — so a freshly provisioned account was
 * effectively invisible. It is a permanent property of the account, like the
 * e-mail it is signed in with, and belongs beside it.
 *
 * Renders `null` whenever there is no account to show (flag off, signed out,
 * verification not finished). Never renders a placeholder: an empty bank card
 * in the profile reads like something is broken.
 */
export function BankAccountSummary({
  onOpenDetails,
  className,
}: {
  /** Opens the full bank flow (deposit instructions + transfer history). */
  onOpenDetails?: () => void
  className?: string
}) {
  const { authenticated } = usePrivy()
  const enabled = FEATURE_FLAGS.FIAT_ONRAMP_BRIDGE && authenticated
  const onramp = useBridgeOnramp(enabled)

  if (!enabled) return null

  // Prefer the account the user is most likely to use; there is exactly one in
  // practice today, and the ordering from the API already puts EURC first.
  const account: OnrampBankAccount | null =
    onramp.bankAccounts[0] ?? onramp.bankAccount ?? null
  if (!account?.iban) return null

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/40 bg-background/40 overflow-hidden',
        className,
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="h-9 w-9 shrink-0 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <Banknote className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/70">
            Your bank account
          </p>
          <p className="text-sm font-semibold text-foreground truncate">
            {account.holderName || 'Ready for transfers'}
          </p>
        </div>
        {onOpenDetails && (
          <button
            type="button"
            onClick={onOpenDetails}
            className="shrink-0 flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors"
          >
            Details
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="border-t border-border/40 divide-y divide-border/30">
        <Field label="IBAN" value={account.iban} />
        {account.bic && <Field label="BIC" value={account.bic} />}
      </div>

      <p className="px-4 py-2.5 text-[11px] text-muted-foreground leading-relaxed border-t border-border/40">
        Send euros here from your own bank to top up. Usually arrives within one
        business day.
      </p>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(`${label} copied`)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy')
    }
  }
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 w-12 shrink-0">
        {label}
      </span>
      <span className="flex-1 min-w-0 font-mono text-[13px] text-foreground truncate">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={copy}
        className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-background/60 transition-colors shrink-0"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  )
}
