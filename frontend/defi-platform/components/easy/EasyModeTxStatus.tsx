'use client'

import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, CheckCircle2, AlertCircle, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isInsufficientFunds, isAmountTooLow, shortfallHint } from '@/lib/tx/txCopy'

interface EasyModeTxStatusProps {
  className?: string
  /** Consumer-friendly mode: hides all DeFi/cross-chain language */
  consumerMode?: boolean
  /** Called when the user taps "Add funds" in an insufficient-balance error */
  onAddFunds?: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────
//
// TERMINAL-ONLY. In-flight feedback now lives on the action button itself
// (`ButtonProgress` + `useTxBusyPhase`), so this overlay no longer renders a
// loading/spinner state — it only shows the celebratory success card (with the
// owl + confetti) and the error card. That keeps a single source of in-flight
// feedback (the button) and reserves this full-card moment for the payoff.

/** Format USD for the success card — no trailing zeros for whole-dollar deposits. */
function formatUSD(usd: number): string {
  if (!isFinite(usd) || usd <= 0) return ''
  if (Math.abs(usd - Math.round(usd)) < 0.005) return `$${Math.round(usd)}`
  return `$${usd.toFixed(2)}`
}

export function EasyModeTxStatus({ className, consumerMode = false, onAddFunds }: EasyModeTxStatusProps) {
  // `active` is true ONLY for terminal states (success / error). A running tx
  // no longer activates this overlay.
  const [active, setActive] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  // Deposit metadata for the success card — populated by EasyCardDev right
  // before the supply hook clears the input, so the celebration can reference
  // the actual amount + APY the user just locked in.
  const [depositMeta, setDepositMeta] = useState<{ usd: number; apy: number; symbol: string } | null>(null)

  const isSuccessRef = useRef(isSuccess)
  const isErrorRef   = useRef(isError)
  useEffect(() => { isSuccessRef.current = isSuccess }, [isSuccess])
  useEffect(() => { isErrorRef.current   = isError   }, [isError])

  // Auto-dismiss success overlay after 3 seconds. Errors persist until dismissed.
  useEffect(() => {
    if (!isSuccess) return
    const timer = window.setTimeout(() => setActive(false), 3000)
    return () => window.clearTimeout(timer)
  }, [isSuccess])

  useEffect(() => {
    // A fresh tx starts — hide any lingering terminal card and reset flags.
    // We do NOT activate the overlay here; the button carries the in-flight UI.
    const onTxActive = () => {
      setActive(false)
      setIsError(false)
      setIsSuccess(false)
      setStep(null)
      setStatusMessage(null)
      setTrackingUrl(null)
    }

    const onTxIdle = () => {
      if (!isSuccessRef.current && !isErrorRef.current) setActive(false)
    }

    // Capture the live stream so the error card has copy to work with, but only
    // *show* the overlay when the stream turns terminal (error).
    const onTxUpdate = (ev: any) => {
      const detail = ev.detail || {}
      if (detail.step) setStep(detail.step)
      if (detail.statusMessage) setStatusMessage(detail.statusMessage)
      if (detail.trackingUrl) setTrackingUrl(detail.trackingUrl)

      const rawText = `${detail.step ?? ''} ${detail.statusMessage ?? ''}`
      if (/error|failed|reverted/i.test(rawText)) {
        setIsError(true)
        setIsSuccess(false)
        setActive(true)
      }
    }

    const onTxSuccess = (ev: any) => {
      // Direct token transfers ("send") confirm in their own wallet-sheet UI and
      // only emit this event to refresh balances — don't show the deposit card.
      const detail = ev?.detail || {}
      if (detail.type === 'send' || detail.silent) return
      setActive(true)
      setIsSuccess(true)
      setIsError(false)
      setStep('success')
      setStatusMessage('Transaction confirmed!')
    }

    // Optional enrichment from EasyCardDev — carries the USD amount + APY the
    // user just deposited so the success card can name the number out loud.
    const onDepositMeta = (ev: any) => {
      const d = ev.detail || {}
      const usd = typeof d.usd === 'number' ? d.usd : 0
      const apy = typeof d.apy === 'number' ? d.apy : 0
      const symbol = typeof d.symbol === 'string' ? d.symbol : ''
      if (usd > 0) setDepositMeta({ usd, apy, symbol })
    }

    window.addEventListener('peridot:tx-active', onTxActive)
    window.addEventListener('peridot:tx-idle',   onTxIdle)
    window.addEventListener('peridot:tx-update',  onTxUpdate  as any)
    window.addEventListener('peridot:tx-success', onTxSuccess as any)
    window.addEventListener('peridot:tx-deposit-meta', onDepositMeta as any)

    return () => {
      window.removeEventListener('peridot:tx-active', onTxActive)
      window.removeEventListener('peridot:tx-idle',   onTxIdle)
      window.removeEventListener('peridot:tx-update',  onTxUpdate  as any)
      window.removeEventListener('peridot:tx-success', onTxSuccess as any)
      window.removeEventListener('peridot:tx-deposit-meta', onDepositMeta as any)
    }
  }, [])

  // Clear the deposit meta when the overlay dismisses, so the next deposit
  // doesn't briefly inherit the previous run's numbers before its own meta
  // event arrives.
  useEffect(() => {
    if (!active) setDepositMeta(null)
  }, [active])

  // ── Derived consumer-mode error classification ──────────────────────────────
  const rawErrorText = `${step ?? ''} ${statusMessage ?? ''}`
  const errorIsInsufficientFunds = isError && isInsufficientFunds(rawErrorText)
  const errorIsAmountTooLow = isError && isAmountTooLow(rawErrorText)
  const errorIsGeneric = isError && !errorIsInsufficientFunds

  // Shortfall hint — e.g. "reduce by 0.012 BNB"
  const shortfall = shortfallHint(statusMessage)

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="tx-status"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className={cn(
            "absolute inset-0 z-50 rounded-3xl backdrop-blur-md flex flex-col items-center justify-center p-6 text-center transition-colors duration-500",
            isSuccess ? "bg-emerald-900/80" : isError ? "bg-red-950/85" : "bg-black/75",
            className
          )}
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="space-y-4 w-full"
          >
            {/* ── Icon ── */}
            <div className="flex justify-center">
              {isSuccess ? (
                <div className="relative">
                  {/* Confetti burst — fires once on mount via Framer's initial→animate. */}
                  {consumerMode && <ConfettiBurst />}
                  {consumerMode ? (
                    // Subtle, elegant owl payoff — no glass dialog, no hash, no badge.
                    <motion.img
                      src="/Owl Mascot - Mint Green.svg"
                      alt=""
                      aria-hidden
                      width={44}
                      height={44}
                      initial={{ scale: 0.5, opacity: 0, y: 6 }}
                      animate={{ scale: [0.5, 1.12, 1], opacity: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                      className="drop-shadow"
                    />
                  ) : (
                    <motion.div
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: [0.6, 1.18, 1], opacity: 1 }}
                      transition={{ duration: 0.55, ease: [0.22, 0, 0.36, 1] }}
                      className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center"
                    >
                      <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                    </motion.div>
                  )}
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                </div>
              )}
            </div>

            {/* ── Heading ── */}
            <div className="space-y-1">
              <h4 className="text-lg font-black tracking-tight text-white">
                {consumerMode ? (
                  isSuccess
                    ? (depositMeta && depositMeta.usd > 0
                        ? `Done — ${formatUSD(depositMeta.usd)} is earning now 💚`
                        : 'Done — your savings are growing 💚')
                    : (errorIsAmountTooLow ? 'Amount too low' : errorIsInsufficientFunds ? 'Not enough balance' : 'That didn’t quite work')
                ) : (
                  isSuccess ? 'Success!' : 'Action Required'
                )}
              </h4>

              {/* ── Body text ── */}
              <div className="text-xs text-white/90 max-w-[240px] mx-auto leading-tight">
                {consumerMode ? (
                  <>
                    {isSuccess && (
                      <motion.p
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.15 }}
                        className="text-emerald-300"
                      >
                        {depositMeta && depositMeta.usd > 0 && depositMeta.apy > 0
                          ? `${formatUSD(depositMeta.usd)} at ~${depositMeta.apy.toFixed(1)}% a year — interest lands every day, automatically.`
                          : "You're earning interest now — it lands every day, automatically."}
                      </motion.p>
                    )}

                    {errorIsAmountTooLow && (
                      <div className="space-y-3 mt-1">
                        <p className="text-red-300">
                          The amount you entered is too small to process. Try a larger amount.
                        </p>
                      </div>
                    )}

                    {errorIsInsufficientFunds && !errorIsAmountTooLow && (
                      <div className="space-y-3 mt-1">
                        <p className="text-red-300">
                          You don't have enough funds for this deposit.
                          {shortfall && (
                            <> Try reducing by <span className="text-white font-semibold">{shortfall}</span> or top up first.</>
                          )}
                        </p>
                        <button
                          type="button"
                          onClick={() => { setActive(false); onAddFunds?.() }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-[11px] font-bold transition-colors"
                        >
                          <Zap className="w-3 h-3" />
                          Add funds
                        </button>
                      </div>
                    )}

                    {errorIsGeneric && (
                      <p className="text-red-300">
                        That didn’t go through. Mind giving it another go?
                      </p>
                    )}
                  </>
                ) : (
                  /* ── DeFi mode ── */
                  (() => {
                    if (isError && statusMessage?.toLowerCase().includes('insufficient balance')) {
                      return (
                        <div className="space-y-2 mt-1">
                          <p className="text-red-400 font-bold">Insufficient funds for fees.</p>
                          {shortfall && (
                            <p className="bg-white/10 p-2 rounded-lg border border-white/10">
                              💡 Suggestion: Reduce amount by <span className="text-emerald-400 font-bold">{shortfall}</span>
                            </p>
                          )}
                        </div>
                      )
                    }
                    return statusMessage
                  })()
                )}
              </div>
            </div>

            {/* ── Actions ── */}
            <div className="flex justify-center gap-2 pt-2">
              <button
                onClick={() => setActive(false)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[10px] font-black tracking-widest uppercase transition-all"
              >
                Close
              </button>
              {/* Show tracking link only in DeFi mode */}
              {!consumerMode && trackingUrl && (
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-black tracking-widest uppercase transition-all flex items-center gap-1"
                >
                  Track <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Confetti burst ──────────────────────────────────────────────────────────
// Twelve dots radiating from the owl on a successful deposit. Pure Framer
// Motion — no extra runtime dep — and one-shot via initial→animate so it never
// loops or fights with the overlay's exit animation.
const CONFETTI_DOTS = Array.from({ length: 12 }, (_, i) => {
  const angle    = (i / 12) * Math.PI * 2
  const distance = 36 + ((i * 7) % 18) // deterministic spread, no random hydration drift
  const rotate   = (i * 137) % 360
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    rotate,
    isAmber: i % 3 === 0,
    delay: 0.05 + (i % 6) * 0.02,
  }
})

function ConfettiBurst() {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      {CONFETTI_DOTS.map((dot, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0, rotate: 0 }}
          animate={{
            opacity: [0, 1, 0],
            x: dot.x,
            y: dot.y,
            scale: [0, 1, 0.6],
            rotate: dot.rotate,
          }}
          transition={{ duration: 0.85, delay: dot.delay, ease: [0.22, 0, 0.36, 1] }}
          className={cn(
            "absolute w-1.5 h-1.5 rounded-full",
            dot.isAmber ? "bg-amber-400" : "bg-emerald-400",
          )}
        />
      ))}
    </div>
  )
}
