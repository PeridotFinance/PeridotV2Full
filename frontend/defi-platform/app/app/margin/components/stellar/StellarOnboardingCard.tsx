'use client'

/**
 * Testnet onboarding card — shown when a connected wallet has no tradeable USDT
 * AND still has its one-time grant. One tap activates the account (Friendbot XLM)
 * and mints test USDT, signed by the same embedded Privy wallet the trades use.
 * Keeps the page from ever being an empty, dead-button state.
 */
import { motion } from 'framer-motion'
import { Loader2, Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OnboardingStep } from '../../hooks/use-stellar-margin-onboarding'
import { STELLAR_MARGIN_CONFIG as CFG } from '../../config/stellarMarginConfig'

interface Props {
  step: OnboardingStep
  statusMessage: string
  isBusy: boolean
  onSetup: () => void
}

export function StellarOnboardingCard({ step, statusMessage, isBusy, onSetup }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mb-5 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-emerald-500/5 backdrop-blur-xl p-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Gift className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Set up your trading account</h3>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
              {isBusy
                ? statusMessage
                : `Get ${CFG.constants.FAUCET_GRANT_USDT} USDT of free test money — delivered straight into your trading account, ready to use. One per account, no real money, no risk.`}
            </p>
          </div>
        </div>
        <Button
          onClick={onSetup}
          disabled={isBusy}
          className="rounded-full h-10 px-5 font-bold shrink-0"
        >
          {isBusy ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />{
              step === 'activating' ? 'Activating…' : step === 'funding' ? 'Funding account…' : 'Adding funds…'
            }</>
          ) : (
            'Set up account'
          )}
        </Button>
      </div>
    </motion.div>
  )
}
