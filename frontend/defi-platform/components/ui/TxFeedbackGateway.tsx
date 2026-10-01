'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { TxFeedbackDialog } from './TxFeedbackDialog'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { VIEW_MODE_COOKIE } from '@/context/view-mode'
import { isRateLimit, isArithmeticUnderOverflow, isTimeoutError, isJsonRpcError, isContractExecutionError } from '@/lib/txFeedback'
import { isTransactionDismissed, markTransactionDismissed, clearTransactionDismissed } from '@/lib/dismissedTransactionTracker'

type ActionKind =
  | 'supply' | 'borrow' | 'repay' | 'withdraw' | 'redeem'
  | 'margin-enable' | 'margin-deposit' | 'margin-withdraw'
  | 'margin-borrow' | 'margin-repay' | 'margin-trade'
  | 'margin-open' | 'margin-close'

// A lightweight event-driven gateway that listens for global tx lifecycle signals
// and presents the dialog. We avoid invasive refactors by using CustomEvents
// that are already partially emitted by existing hooks.
// The owl dialog is the legacy DeFi-flavoured feedback. It must never appear on
// the consumer (Easy / Stellar) surfaces, which carry their own button-progress
// + terminal cards. We detect "consumer" at call time (not via closure) from the
// live pathname plus the view-mode cookie — the cookie matters because `/app` is
// shared between Easy and Expert and is rendered above the ViewModeProvider here.
//
// `/app/margin` is suppressed for a different reason: it is not a consumer
// surface, but it already owns every beat of its own feedback — ButtonProgress
// while a leg is in flight, a toast on each success and each failure, and a
// terminal modal of its own (StellarOpenCelebration / StellarCloseResult). All
// five margin hooks emit `peridot:tx-update`, so this gateway opened a SECOND
// modal on top of those — and only when the view-mode cookie happened to say
// "expert", which made the stacking look random. One flow, one dialog.
function isConsumerSurface(): boolean {
  if (typeof window === 'undefined') return false
  if (window.location.pathname.includes('/app/easy')) return true
  if (window.location.pathname.includes('/app/margin')) return true
  try {
    // Mirror the SERVER default (app/layout.tsx): the view is Easy unless the
    // cookie is explicitly "expert". Critically, a brand-new user (or anyone
    // who never toggled) has NO `peridot_view_mode` cookie yet still renders
    // the Easy view at `/app`. The old `cookie === easy` check missed that
    // default state, so the legacy DeFi dialog leaked onto the consumer
    // surface and its modal overlay hard-locked the page
    // (`body { pointer-events: none }`). Suppress unless we're truly in Expert.
    const isExpert = document.cookie
      .split('; ')
      .some((c) => c === `${VIEW_MODE_COOKIE}=expert`)
    return !isExpert
  } catch {
    // Default surface is Easy — fail safe toward suppressing the legacy dialog.
    return true
  }
}

export default function TxFeedbackGateway() {
  const enabled = FEATURE_FLAGS.INTERACTIVE_TX_DIALOG
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState<ActionKind>('supply')
  const [step, setStep] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null)
  const [lastUpdateAt, setLastUpdateAt] = useState<number>(() => Date.now())
  const [watchdogHint, setWatchdogHint] = useState<string | null>(null)
  // Cross-chain specific state
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null)
  const [biconomyFee, setBiconomyFee] = useState<any>(null)
  const [biconomyFeeDetails, setBiconomyFeeDetails] = useState<any>(null)
  const [meeScanLink, setMeeScanLink] = useState<string | null>(null)
  const [isCrossChain, setIsCrossChain] = useState<boolean>(false)
  const [crossChainStatus, setCrossChainStatus] = useState<string | null>(null)
  const [isMagma, setIsMagma] = useState<boolean>(false)
  const [useNative, setUseNative] = useState<boolean>(false)
  const dismissedCurrentFlowRef = useRef(false)
  const pathname = usePathname()

  // The gateway lives in the root layout, so a dialog opened on one surface
  // would otherwise stay mounted across SPA navigation — its full-screen Radix
  // overlay + body scroll-lock then trap the next page (notably the Easy-mode
  // surfaces, which suppress this dialog and have no way to close it). Close it
  // on every route change so feedback stays tied to the page that triggered it.
  useEffect(() => {
    setOpen(false)
    dismissedCurrentFlowRef.current = false
  }, [pathname])

  useEffect(() => {
    if (!enabled) return

    // Moonpay Return Sniffer
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      const transactionId = url.searchParams.get('transactionId')
      const transactionStatus = url.searchParams.get('transactionStatus') // Moonpay sometimes adds this

      if (transactionId && !isConsumerSurface()) {
        // We detected a return from Moonpay
        setOpen(true)
        setAction('supply') // Treat as a supply action
        setStep('success') // Or a specific 'processing' step if status is pending
        setTxHash(transactionId) // Store ID for reference
        setStatusMessage(
           transactionStatus === 'failed' 
            ? 'Moonpay transaction failed or was cancelled.'
            : 'Moonpay purchase detected! Waiting for funds to arrive on-chain.'
        )
        setWatchdogHint('This usually takes 2-5 minutes depending on the network.')
        
        // Clean URL to prevent re-triggering on reload
        window.history.replaceState({}, '', window.location.pathname)
      }
    }

    const onAnyActive = (ev: Event) => {
      if (isConsumerSurface()) return
      // Open proactively when a tx starts if not already visible. Adopt the
      // action carried by the event so the very first frame shows the correct
      // verb (e.g. "Withdraw") instead of the 'supply' default — otherwise the
      // dialog title is wrong until the first tx-update arrives, and for flows
      // that emit no updates (boosted withdraw) it stays wrong the whole time.
      try {
        const detail = (ev as CustomEvent)?.detail || {}
        if (typeof detail?.action === 'string' && detail.action.length > 0) {
          setAction(mapType(detail.action))
        }
      } catch {}
      dismissedCurrentFlowRef.current = false
      setOpen(true)
      setLastUpdateAt(Date.now())
      setWatchdogHint(null)
    }

    const onTxIdle = () => {
      // Close dialog and reset state when transaction becomes idle (e.g., user rejection)
      dismissedCurrentFlowRef.current = false
      setOpen(false)
      setStep(null)
      setStatusMessage(null)
      setTxHash(null)
      setExplorerUrl(null)
      setTrackingUrl(null)
      setBiconomyFee(null)
      setBiconomyFeeDetails(null)
      setMeeScanLink(null)
      setIsCrossChain(false)
      setCrossChainStatus('idle')
      setIsMagma(false)
      setUseNative(false)
      setWatchdogHint(null)
    }

    const onTxSuccess = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent)?.detail || {}
        // Direct token transfers ("send") carry their own confirmation UI inside
        // the wallet sheet and only emit this event to refresh balances. They are
        // not a lending action, so never surface the supply/borrow dialog for them.
        if (detail?.type === 'send' || detail?.silent) return
        const hash = detail?.txHash ? String(detail.txHash) : undefined
        if ((dismissedCurrentFlowRef.current && !hash) || (hash && isTransactionDismissed(hash))) {
          return
        }
        if (detail?.type) setAction(mapType(detail.type))
        setStep('success')
        if (hash) setTxHash(hash)
        
        // Handle cross-chain success props
        if (detail?.isCrossChain) setIsCrossChain(true)
        if (detail?.trackingUrl) setTrackingUrl(String(detail.trackingUrl))
        if (detail?.biconomyFee) setBiconomyFee(detail.biconomyFee)
        if (detail?.biconomyFeeDetails) setBiconomyFeeDetails(detail.biconomyFeeDetails)
        if (detail?.meeScanLink) setMeeScanLink(String(detail.meeScanLink))
        if (detail?.crossChainStatus) setCrossChainStatus(String(detail.crossChainStatus))
        
        // Magma
        if (detail?.isMagma) setIsMagma(true)
        if (detail?.useNative) setUseNative(true)

        setStatusMessage('')
        if (!isConsumerSurface()) setOpen(true)
        setLastUpdateAt(Date.now())
        setWatchdogHint(null)
      } catch {}
    }

    // Removed onBiconomyPhase - now using unified tx-update events

    const onTxUpdate = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent)?.detail || {}
        const providedAction = detail?.action
        const nextStep = String(detail?.step || '')
        const msg = typeof detail?.statusMessage === 'string' ? detail.statusMessage : undefined
        const hash = typeof detail?.txHash === 'string' ? detail.txHash : undefined
        const explorer = typeof detail?.explorerUrl === 'string' ? detail.explorerUrl : undefined

        // Cross-chain specific props
        const crossChain = Boolean(detail?.isCrossChain)
        const tracking = typeof detail?.trackingUrl === 'string' ? detail.trackingUrl : undefined
        const fee = detail?.biconomyFee
        const feeDetails = detail?.biconomyFeeDetails
        const meeLink = typeof detail?.meeScanLink === 'string' ? detail.meeScanLink : undefined
        const ccStatus = typeof detail?.crossChainStatus === 'string' ? detail.crossChainStatus : undefined
        
        // Magma
        const magma = Boolean(detail?.isMagma)
        const native = Boolean(detail?.useNative)

        if (dismissedCurrentFlowRef.current && !hash) {
          return
        }

        // Don't auto-open dialog if this transaction was dismissed by user
        if (hash && isTransactionDismissed(hash)) {
          return
        }
        
        if (typeof providedAction === 'string' && providedAction.length > 0) {
          setAction(mapType(providedAction))
        }
        if (nextStep) setStep(nextStep)
        if (msg !== undefined) setStatusMessage(msg)
        if (hash) setTxHash(hash)
        if (explorer) setExplorerUrl(explorer)
        if (crossChain) setIsCrossChain(true)
        if (tracking) setTrackingUrl(tracking)
        if (fee !== undefined) setBiconomyFee(fee)
        if (feeDetails !== undefined) setBiconomyFeeDetails(feeDetails)
        if (meeLink) setMeeScanLink(meeLink)
        if (ccStatus) setCrossChainStatus(ccStatus)
        
        if (magma) setIsMagma(true)
        if (native) setUseNative(true)

        // Avoid auto-opening a fresh error dialog for transient errors; keep closed unless already open
        // BUT: Always open for insufficient balance errors so user can see fee + error details
        const isErrorStep = /error|failed|reverted/i.test(nextStep)
        const isInsufficientBalance = msg && /insufficient balance/i.test(msg)
        if (!open && isErrorStep && msg && !isInsufficientBalance && (isRateLimit(msg) || isArithmeticUnderOverflow(msg) || isTimeoutError(msg) || isJsonRpcError(msg) || isContractExecutionError(msg))) {
          setLastUpdateAt(Date.now())
          setWatchdogHint(null)
          return
        }
        // Always open dialog for cross-chain transactions (to show fee) or insufficient balance errors
        if (!isConsumerSurface() && (crossChain || isInsufficientBalance || !isErrorStep)) {
          setOpen(true)
        }
        setLastUpdateAt(Date.now())
        setWatchdogHint(null)
      } catch {}
    }

    // Removed onCcDialogOpen - now using unified tx-update events

    try {
      window.addEventListener('peridot:tx-active', onAnyActive as any)
      window.addEventListener('peridot:tx-idle', onTxIdle as any)
      window.addEventListener('peridot:tx-success', onTxSuccess as any)
      window.addEventListener('peridot:tx-update', onTxUpdate as any)
    } catch {}

    return () => {
      try {
        window.removeEventListener('peridot:tx-active', onAnyActive as any)
        window.removeEventListener('peridot:tx-idle', onTxIdle as any)
        window.removeEventListener('peridot:tx-success', onTxSuccess as any)
        window.removeEventListener('peridot:tx-update', onTxUpdate as any)
      } catch {}
    }
  }, [enabled])

  // Watchdog: surface guidance when a phase takes too long
  useEffect(() => {
    if (!enabled || !open) return
    const i = setInterval(() => {
      const now = Date.now()
      const elapsed = now - lastUpdateAt
      // Do not show watchdog hints in terminal states (error/success). `settling`
      // is terminal too: the margin close has finished signing and is waiting on
      // the contract to square up an interest residual — nudging the user to
      // "confirm in your wallet" there is advice for a wallet that isn't open.
      const terminal = /error|failed|reverted|success|settling/i.test(String(step || ''))
      if (terminal) return
      if (elapsed > 45000) {
        // 45s: escalate guidance
        if (!watchdogHint) setWatchdogHint('Taking longer than expected. You can retry or try again later.')
      } else if (elapsed > 15000) {
        if (!watchdogHint) setWatchdogHint('Still waiting… make sure to confirm in your wallet.')
      } else {
        if (watchdogHint) setWatchdogHint(null)
      }
    }, 3000)
    return () => clearInterval(i)
  }, [enabled, open, lastUpdateAt, watchdogHint, step])

  const currentStatus = useMemo(() => statusMessage, [statusMessage])

  if (!enabled) return null
  return (
    <TxFeedbackDialog
      open={open}
      onOpenChange={(newOpen) => {
        setOpen(newOpen)
        // When user closes dialog, mark transaction as dismissed
        if (!newOpen) {
          dismissedCurrentFlowRef.current = true
          if (txHash) {
            markTransactionDismissed(txHash)
          }
        }
      }}
      action={action}
      step={step}
      statusMessage={watchdogHint || currentStatus}
      txHash={txHash || undefined as any}
      explorerUrl={explorerUrl || undefined as any}
      trackingUrl={trackingUrl || undefined as any}
      biconomyFee={biconomyFee}
      biconomyFeeDetails={biconomyFeeDetails}
      meeScanLink={meeScanLink || undefined as any}
      isCrossChain={isCrossChain}
      crossChainStatus={crossChainStatus as any}
      isMagma={isMagma}
      useNative={useNative}
      onRetry={() => {
        try {
          dismissedCurrentFlowRef.current = false
          // Clear dismissed state when user retries
          if (txHash) {
            clearTransactionDismissed(txHash)
          }
          // fire a semantic retry hint; hooks can listen to tailor behavior if needed
          window.dispatchEvent(new CustomEvent('peridot:tx-retry', { detail: { action, step } }))
        } catch {}
      }}
      onCheckStatus={() => {
        try { window.dispatchEvent(new CustomEvent('peridot:tx-check-status', { detail: { action, step, txHash } })) } catch {}
      }}
    />
  )
}

function mapType(type: string): ActionKind {
  switch (String(type)) {
    case 'supply': return 'supply'
    case 'borrow': return 'borrow'
    case 'repay': return 'repay'
    case 'withdraw': return 'withdraw'
    case 'redeem': return 'withdraw'
    case 'margin-enable': return 'margin-enable'
    case 'margin-deposit': return 'margin-deposit'
    case 'margin-withdraw': return 'margin-withdraw'
    case 'margin-borrow': return 'margin-borrow'
    case 'margin-repay': return 'margin-repay'
    case 'margin-trade': return 'margin-trade'
    case 'margin-open-position': return 'margin-open'
    case 'margin-close-position': return 'margin-close'
    default: return 'supply'
  }
}

// Removed resolvePhaseMessage - now using unified tx-update events

