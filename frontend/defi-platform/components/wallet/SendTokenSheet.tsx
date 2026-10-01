'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Check,
  AlertTriangle,
  Loader2,
  Send,
  Sparkles,
  Plus,
  ExternalLink,
} from 'lucide-react'
import { type Address } from 'viem'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  formatSendAmount,
  isValidRecipient,
  MEMO_TEXT_MAX_BYTES,
  memoByteLength,
  shortenAddress,
  validateMemo,
  validateSendAmount,
  type MemoType,
} from '@/lib/send/validation'
import {
  useMultiChainTokenBalances,
  type PreselectedSendToken,
} from '@/hooks/use-multi-chain-token-balances'
import { useSendTokenEvm } from '@/hooks/use-send-token-evm'
import { useSendTokenStellar } from '@/hooks/use-send-token-stellar'
import { useStellarSendBalances } from '@/hooks/use-stellar-send-balances'
import { useRecipientCheck } from '@/hooks/use-recipient-check'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { getChainConfig } from '@/config/contracts'

/** Builds a block-explorer URL for a confirmed transfer, or null when unknown. */
function explorerTxUrl(token: SendableToken, hash: string | null | undefined): string | null {
  if (!hash) return null
  if (token.kind === 'stellar') {
    return `https://stellar.expert/explorer/public/tx/${hash}`
  }
  try {
    const cfg = getChainConfig(token.chainId as number) as { explorer?: string } | null
    const base = cfg?.explorer
    if (!base) return null
    return `${base.replace(/\/$/, '')}/tx/${hash}`
  } catch {
    return null
  }
}

interface SendTokenSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** EVM wallet address whose balances can be sent. */
  address: string | null | undefined
  /**
   * When set, the sheet opens straight on the recipient step with this asset
   * already chosen (e.g. tapping the send button on an asset row).
   */
  preselect?: PreselectedSendToken | null
}

type Step = 'select' | 'recipient' | 'amount' | 'review' | 'result'

const STELLAR_NETWORK_LOGO = '/tokenimages/app/stellar.svg'

/**
 * A single sendable asset — either an EVM token or a Stellar asset.
 * `balanceRaw` / `balanceFormatted` already represent the *sendable* amount
 * (for XLM the on-ledger reserve is excluded upstream).
 */
interface SendableToken {
  kind: 'evm' | 'stellar'
  id: string
  symbol: string
  logoUrl: string
  networkName: string
  networkLogoUrl: string
  decimals: number
  balanceRaw: bigint
  balanceFormatted: string
  // evm-only
  chainId?: number
  evmTokenAddress?: Address | null
  // stellar-only
  stellarContractId?: string
}

/** Maps a preselected on-chain asset onto the sheet's unified token shape. */
function preselectToSendable(p: PreselectedSendToken): SendableToken {
  const t = p.token
  return {
    kind: 'evm',
    id: `evm-${p.chainId}-${t.symbol}`,
    symbol: t.displaySymbol,
    logoUrl: t.logoUrl,
    networkName: p.chainName,
    networkLogoUrl: p.chainLogoUrl,
    decimals: t.decimals,
    balanceRaw: t.balance,
    balanceFormatted: t.balanceFormatted,
    chainId: p.chainId,
    evmTokenAddress: t.address,
  }
}

/**
 * Send-tokens flow. The dialog shell is always mounted (cheap), but every data
 * hook lives in `SendTokenSheetBody`, which Radix only mounts while the sheet is
 * open — so balance fetching and Freighter polling never run in the background.
 */
export function SendTokenSheet({
  open,
  onOpenChange,
  address,
  preselect,
}: SendTokenSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'wallet-dialog-sheet',
          'sm:max-w-md sm:max-h-[90vh] sm:rounded-3xl sm:p-6 p-4',
          'overflow-y-auto custom-scrollbar',
          'bg-background/95 backdrop-blur-xl border border-border/50',
          'shadow-2xl shadow-black/10 dark:shadow-black/40',
        )}
      >
        <SendTokenSheetBody
          address={address}
          preselect={preselect ?? null}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function SendTokenSheetBody({
  address,
  preselect,
  onClose,
}: {
  address: string | null | undefined
  preselect: PreselectedSendToken | null
  onClose: () => void
}) {
  const evmBalances = useMultiChainTokenBalances(address)
  const stellar = useStellarSendBalances()
  const { isEmbeddedWallet } = useActiveWallet()

  const evmSend = useSendTokenEvm()
  const stellarSend = useSendTokenStellar()

  // When an asset is preselected the sheet opens straight on the recipient step.
  const [step, setStep] = useState<Step>(preselect ? 'recipient' : 'select')
  const [selected, setSelected] = useState<SendableToken | null>(
    preselect ? preselectToSendable(preselect) : null,
  )
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  // Stellar only. Exchanges share one deposit account across all customers and
  // use the memo to tell them apart, so a send without it can go uncredited.
  const [memo, setMemo] = useState('')
  const [memoType, setMemoType] = useState<MemoType>('text')
  const [connectingStellar, setConnectingStellar] = useState(false)
  const [stellarConnectAttempted, setStellarConnectAttempted] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)

  const activeSend = selected?.kind === 'stellar' ? stellarSend : evmSend

  // Notify the rest of the app once a transfer confirms, so balances refresh.
  // Tagged `type: 'send'` so the global supply/borrow feedback dialog and toast
  // ignore it — this flow renders its own confirmation below.
  useEffect(() => {
    if (activeSend.status === 'success') {
      window.dispatchEvent(
        new CustomEvent('peridot:tx-success', { detail: { type: 'send', silent: true } }),
      )
    }
  }, [activeSend.status])

  // Merge EVM + Stellar balances into one selectable list.
  const sendable = useMemo<SendableToken[]>(() => {
    const out: SendableToken[] = []
    for (const c of evmBalances.chains) {
      for (const t of c.tokens) {
        if (t.balance > BigInt(0)) {
          out.push({
            kind: 'evm',
            id: `evm-${c.chainId}-${t.symbol}`,
            symbol: t.displaySymbol,
            logoUrl: t.logoUrl,
            networkName: c.chainName,
            networkLogoUrl: c.chainLogoUrl,
            decimals: t.decimals,
            balanceRaw: t.balance,
            balanceFormatted: t.balanceFormatted,
            chainId: c.chainId,
            evmTokenAddress: t.address,
          })
        }
      }
    }
    for (const st of stellar.tokens) {
      if (st.sendableRaw > BigInt(0)) {
        out.push({
          kind: 'stellar',
          id: `stellar-${st.symbol}`,
          symbol: st.symbol,
          logoUrl: st.logoUrl,
          networkName: 'Stellar',
          networkLogoUrl: STELLAR_NETWORK_LOGO,
          decimals: st.decimals,
          // Sendable, not held: for XLM the account reserve and fee buffer are
          // excluded, so Max can't build a transaction the ledger will reject.
          balanceRaw: st.sendableRaw,
          balanceFormatted: st.sendableFormatted,
          stellarContractId: st.contractId,
        })
      }
    }
    return out
  }, [evmBalances.chains, stellar.tokens])

  // Keep the selected token's balance fresh — important when it was preselected
  // from a snapshot, or when balances refresh after a transaction elsewhere.
  useEffect(() => {
    setSelected((prev) => {
      if (!prev) return prev
      const fresh = sendable.find((s) => s.id === prev.id)
      return fresh ?? prev
    })
  }, [sendable])

  const isLoadingAny =
    (!!address && evmBalances.isLoading) || (stellar.isConnected && stellar.isLoading)
  const showSkeletons = isLoadingAny && sendable.length === 0
  const showEmpty = !isLoadingAny && sendable.length === 0

  const handleConnectStellar = async () => {
    setConnectingStellar(true)
    setStellarConnectAttempted(true)
    try {
      await stellar.connect()
    } finally {
      setConnectingStellar(false)
    }
  }

  // ---- Validation -----------------------------------------------------------
  const ownAddress = selected?.kind === 'stellar' ? stellar.address : address
  const recipientValid = selected ? isValidRecipient(selected.kind, recipient) : false
  const isSelfSend =
    recipientValid &&
    !!ownAddress &&
    recipient.trim().toLowerCase() === ownAddress.toLowerCase()

  const recipientCheck = useRecipientCheck({
    kind: selected?.kind,
    recipient,
    chainId: selected?.kind === 'evm' ? selected.chainId : undefined,
    stellarSymbol: selected?.kind === 'stellar' ? selected.symbol : undefined,
  })
  const recipientBlocked =
    recipientCheck.status === 'checking' || recipientCheck.status === 'error'

  const memoSupported = selected?.kind === 'stellar'
  // Validate what will actually be sent — the hook trims before signing.
  const memoCheck = memoSupported
    ? validateMemo(memoType, memo.trim())
    : { valid: true, error: null }
  // SEP-29: the destination declares that payments without a memo are rejected
  // or lost. Don't let the user find that out the expensive way.
  const memoMissing = !!recipientCheck.memoRequired && memo.trim() === ''
  const memoBlocked = memoSupported && (!memoCheck.valid || memoMissing)

  const amountCheck = selected
    ? validateSendAmount(amount, selected.decimals, selected.balanceRaw)
    : { valid: false, error: null }

  // ---- Actions --------------------------------------------------------------
  const handlePickToken = (t: SendableToken) => {
    setSelected(t)
    setRecipient('')
    setAmount('')
    setMemo('')
    setMemoType('text')
    setStep('recipient')
  }

  const handleSetMax = () => {
    if (selected) setAmount(selected.balanceFormatted)
  }

  const handleConfirmSend = async () => {
    if (!selected) return
    setStep('result')
    if (selected.kind === 'stellar') {
      if (!stellar.address || !selected.stellarContractId) return
      await stellarSend.send({
        senderAddress: stellar.address,
        symbol: selected.symbol,
        tokenContractId: selected.stellarContractId,
        decimals: selected.decimals,
        amount: amount.trim(),
        recipient: recipient.trim(),
        memo: memo.trim() || null,
        memoType,
      })
    } else {
      await evmSend.send({
        chainId: selected.chainId!,
        tokenAddress: selected.evmTokenAddress ?? null,
        decimals: selected.decimals,
        amount: amount.trim(),
        recipient: recipient.trim(),
      })
    }
  }

  // ---- Step header ----------------------------------------------------------
  const stepTitle: Record<Step, string> = {
    select: 'What do you want to send?',
    recipient: 'Recipient',
    amount: 'Amount',
    review: 'Review & send',
    result: 'Transfer',
  }

  const backTarget: Partial<Record<Step, Step>> = {
    recipient: 'select',
    amount: 'recipient',
    review: 'amount',
  }
  const canGoBack = step in backTarget

  const feeIsSponsored = selected?.kind === 'evm' && isEmbeddedWallet
  const feeLabel =
    selected?.kind === 'stellar'
      ? 'From your XLM balance'
      : isEmbeddedWallet
        ? 'Covered'
        : 'From your balance'

  return (
    <>
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center -mt-1 mb-2" aria-hidden>
        <div className="h-1 w-10 rounded-full bg-foreground/15" />
      </div>

      <DialogHeader className="pb-3 sm:pb-4">
        <DialogTitle className="flex items-center gap-2.5 text-lg font-semibold">
          {canGoBack ? (
            <button
              onClick={() => setStep(backTarget[step]!)}
              className={cn(
                'h-9 w-9 -ml-1 rounded-xl flex items-center justify-center shrink-0',
                'border border-border/40 bg-background/40',
                'hover:bg-background/70 hover:border-primary/30 hover:text-primary',
                'transition-all duration-200',
              )}
              aria-label="Back"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : (
            <div
              className={cn(
                'relative p-2.5 rounded-2xl overflow-hidden shrink-0',
                'bg-gradient-to-br from-primary/25 to-primary/5 border border-primary/25',
              )}
            >
              <Send className="h-5 w-5 text-primary relative z-10" />
            </div>
          )}
          <span className="tracking-tight">{stepTitle[step]}</span>
        </DialogTitle>
      </DialogHeader>

      <AnimatePresence mode="wait">
        {/* ============ STEP: SELECT TOKEN ============ */}
        {step === 'select' && (
          <motion.div
            key="select"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            {showSkeletons &&
              Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 rounded-xl bg-muted/40 animate-pulse border border-border/30"
                />
              ))}

            {sendable.map((s) => (
              <button
                key={s.id}
                onClick={() => handlePickToken(s)}
                className={cn(
                  'group w-full flex items-center justify-between rounded-xl px-3 py-3',
                  'bg-background/40 border border-border/30 text-left',
                  'hover:bg-background/70 hover:border-primary/40',
                  'transition-colors duration-200',
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TokenBadge logoUrl={s.logoUrl} networkLogoUrl={s.networkLogoUrl} symbol={s.symbol} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground leading-tight">
                      {s.symbol}
                    </div>
                    <div className="text-[11px] text-muted-foreground/80 truncate">
                      {s.networkName}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 pl-3">
                  <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
                    {formatSendAmount(s.balanceFormatted)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                </div>
              </button>
            ))}

            {showEmpty && <EmptyHint text="You don't have any balance to send right now." />}

            {/* Connect Freighter to surface Stellar balances */}
            {!stellar.isConnected && (
              <div className="pt-1 space-y-1.5">
                <button
                  onClick={handleConnectStellar}
                  disabled={connectingStellar}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-xl px-3 py-3',
                    'border border-dashed border-border/50 bg-muted/20 text-left',
                    'hover:bg-muted/40 hover:border-primary/40 transition-colors duration-200',
                    'disabled:opacity-60 disabled:cursor-not-allowed',
                  )}
                >
                  <div className="h-9 w-9 rounded-full overflow-hidden ring-1 ring-border/40 bg-muted/40 shrink-0">
                    <Image
                      src={STELLAR_NETWORK_LOGO}
                      alt="Stellar"
                      width={36}
                      height={36}
                      unoptimized
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground leading-tight">
                      Connect Stellar wallet
                    </div>
                    <div className="text-[11px] text-muted-foreground/80">
                      Send XLM, USDC &amp; EURC
                    </div>
                  </div>
                  {connectingStellar ? (
                    <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 text-muted-foreground/60" />
                  )}
                </button>
                {stellarConnectAttempted && stellar.walletError && (
                  <p className="text-[11px] text-amber-500 px-1">
                    {/not installed/i.test(stellar.walletError)
                      ? 'Freighter wallet not found. Install the browser extension to send Stellar balances.'
                      : stellar.walletError}
                  </p>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ============ STEP: RECIPIENT ============ */}
        {step === 'recipient' && selected && (
          <motion.div
            key="recipient"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <SelectedTokenChip selected={selected} />

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground px-0.5">
                Recipient address
              </label>
              <Input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder={selected.kind === 'stellar' ? 'G…' : '0x…'}
                spellCheck={false}
                autoComplete="off"
                className="h-12 font-mono text-sm rounded-xl"
              />
              {recipient.trim() !== '' && !recipientValid && (
                <p className="text-xs text-destructive px-0.5">
                  That&apos;s not a valid address.
                </p>
              )}
              {isSelfSend && (
                <p className="text-xs text-amber-500 px-0.5">That&apos;s your own address.</p>
              )}
              {recipientValid && recipientCheck.status === 'checking' && (
                <p className="text-xs text-muted-foreground px-0.5 flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Checking address…
                </p>
              )}
              {recipientCheck.status === 'warning' && recipientCheck.message && (
                <p className="text-xs text-amber-500 px-0.5">{recipientCheck.message}</p>
              )}
              {recipientCheck.status === 'error' && recipientCheck.message && (
                <p className="text-xs text-destructive px-0.5">{recipientCheck.message}</p>
              )}
            </div>

            {/* Memo — Stellar only. Optional for a personal wallet, and the
                thing that makes an exchange deposit arrive in the right place. */}
            {memoSupported && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-0.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Memo{' '}
                    <span className="text-muted-foreground/60">
                      {recipientCheck.memoRequired ? '(required)' : '(optional)'}
                    </span>
                  </label>
                  <div className="flex items-center gap-0.5 rounded-lg border border-border/40 bg-background/40 p-0.5">
                    {(['text', 'id'] as MemoType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setMemoType(t)}
                        className={cn(
                          'px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors',
                          memoType === t
                            ? 'bg-primary/15 text-primary'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {t === 'text' ? 'Text' : 'ID'}
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder={memoType === 'id' ? '123456789' : 'e.g. your exchange memo'}
                  spellCheck={false}
                  autoComplete="off"
                  inputMode={memoType === 'id' ? 'numeric' : 'text'}
                  className="h-12 font-mono text-sm rounded-xl"
                />
                {memoCheck.error ? (
                  <p className="text-xs text-destructive px-0.5">{memoCheck.error}</p>
                ) : memoMissing ? (
                  <p className="text-xs text-amber-500 px-0.5">
                    This address only accepts transfers with a memo. Copy it from where you
                    got the address.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground/70 px-0.5">
                    {memoType === 'text'
                      ? `Sending to an exchange? Paste the memo they show with the deposit address. ${memoByteLength(memo)}/${MEMO_TEXT_MAX_BYTES}`
                      : 'Use ID only when the exchange calls it a memo ID or destination tag.'}
                  </p>
                )}
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-muted-foreground/80 px-0.5">
              {selected.kind === 'stellar' ? (
                <>
                  Send only to a Stellar address (G…). The recipient must be able to
                  accept <span className="font-medium text-foreground">{selected.symbol}</span>.
                  Transfers cannot be undone.
                </>
              ) : (
                <>
                  The address must belong to the{' '}
                  <span className="font-medium text-foreground">{selected.networkName}</span>{' '}
                  network. Transfers to the wrong network cannot be recovered.
                </>
              )}
            </p>

            <Button
              onClick={() => setStep('amount')}
              disabled={!recipientValid || recipientBlocked || memoBlocked}
              className="w-full h-12 rounded-xl font-semibold"
            >
              Continue
            </Button>
          </motion.div>
        )}

        {/* ============ STEP: AMOUNT ============ */}
        {step === 'amount' && selected && (
          <motion.div
            key="amount"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <SelectedTokenChip selected={selected} />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-0.5">
                <label className="text-xs font-medium text-muted-foreground">Amount</label>
                <button
                  onClick={handleSetMax}
                  className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  Max
                </button>
              </div>
              <div className="relative">
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                  autoComplete="off"
                  className="h-14 text-lg font-semibold rounded-xl pr-20 tabular-nums"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                  {selected.symbol}
                </span>
              </div>
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[11px] text-muted-foreground">
                  Available: {formatSendAmount(selected.balanceFormatted)} {selected.symbol}
                </span>
                {amountCheck.error && (
                  <span className="text-[11px] text-destructive">{amountCheck.error}</span>
                )}
              </div>
            </div>

            <Button
              onClick={() => setStep('review')}
              disabled={!amountCheck.valid}
              className="w-full h-12 rounded-xl font-semibold"
            >
              Continue
            </Button>
          </motion.div>
        )}

        {/* ============ STEP: REVIEW ============ */}
        {step === 'review' && selected && (
          <motion.div
            key="review"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <div className="rounded-2xl border border-border/50 bg-card/60 p-4 text-center">
              <div className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground/70">
                You&apos;re sending
              </div>
              <div className="mt-1 flex items-center justify-center gap-2">
                <div className="h-7 w-7 rounded-full overflow-hidden ring-1 ring-border/40 bg-muted/40">
                  <Image
                    src={selected.logoUrl}
                    alt={selected.symbol}
                    width={28}
                    height={28}
                    unoptimized
                  />
                </div>
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {formatSendAmount(amount)}
                </span>
                <span className="text-lg font-semibold text-muted-foreground">
                  {selected.symbol}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-border/40 bg-background/40 divide-y divide-border/30">
              <ReviewRow label="To" value={shortenAddress(recipient.trim())} mono />
              {memoSupported && memo.trim() !== '' && (
                <ReviewRow
                  label={memoType === 'id' ? 'Memo (ID)' : 'Memo'}
                  value={memo.trim()}
                  mono
                />
              )}
              <ReviewRow label="Network" value={selected.networkName} />
              <ReviewRow
                label="Network fee"
                value={feeLabel}
                valueClassName={feeIsSponsored ? 'text-emerald-500' : undefined}
              />
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                Transfers are final and cannot be undone. Double-check the recipient and
                network.
              </p>
            </div>

            <Button
              onClick={handleConfirmSend}
              className="w-full h-12 rounded-xl font-semibold"
            >
              <Send className="h-4 w-4 mr-2" />
              Send now
            </Button>
          </motion.div>
        )}

        {/* ============ STEP: RESULT ============ */}
        {step === 'result' && selected && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="py-6 text-center space-y-4"
          >
            {activeSend.isPending && (
              <>
                <div className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center bg-primary/10 border border-primary/20">
                  <Loader2 className="h-7 w-7 text-primary animate-spin" />
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">
                    {activeSend.status === 'switching'
                      ? `Switching to ${selected.networkName}…`
                      : activeSend.status === 'confirming'
                        ? 'Confirming on-chain…'
                        : 'Sending transfer…'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    This will only take a moment.
                  </p>
                </div>
              </>
            )}

            {activeSend.status === 'success' && (
              <div className="flex flex-col items-center">
                {/* Confirmation mark — settles in with a soft spring and a single ring pulse. */}
                <div className="relative mx-auto mb-5 h-16 w-16">
                  <motion.div
                    initial={{ scale: 0.7, opacity: 0.5 }}
                    animate={{ scale: 1.6, opacity: 0 }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                    className="absolute inset-0 rounded-full bg-emerald-500/25"
                  />
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 340, damping: 17 }}
                    className="relative h-16 w-16 rounded-full flex items-center justify-center bg-emerald-500/12 border border-emerald-500/30"
                  >
                    <Check className="h-8 w-8 text-emerald-500" strokeWidth={2.5} />
                  </motion.div>
                </div>

                {/* Amount is the hero; recipient sits quietly underneath. */}
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12, duration: 0.3 }}
                  className="text-2xl font-semibold tracking-tight text-foreground"
                >
                  {formatSendAmount(amount)} {selected.symbol}
                </motion.p>
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18, duration: 0.3 }}
                  className="text-sm text-muted-foreground mt-1"
                >
                  sent to <span className="font-mono">{shortenAddress(recipient.trim())}</span>
                </motion.p>

                {/* Opt-in receipt — keeps the moment calm while power users can dig in. */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.24, duration: 0.3 }}
                  className="w-full mt-5"
                >
                  <button
                    type="button"
                    onClick={() => setShowReceipt((s) => !s)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground/80 hover:text-foreground/90 transition-colors"
                  >
                    <ChevronRight
                      size={13}
                      className={cn('transition-transform duration-200', showReceipt && 'rotate-90')}
                    />
                    {showReceipt ? 'Hide details' : 'Details'}
                  </button>

                  <AnimatePresence initial={false}>
                    {showReceipt && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 rounded-2xl border border-border/40 bg-background/40 divide-y divide-border/30 text-left">
                          <ReviewRow label="To" value={shortenAddress(recipient.trim())} mono />
                          {memoSupported && memo.trim() !== '' && (
                            <ReviewRow
                              label={memoType === 'id' ? 'Memo (ID)' : 'Memo'}
                              value={memo.trim()}
                              mono
                            />
                          )}
                          <ReviewRow label="Network" value={selected.networkName} />
                          {(() => {
                            const url = explorerTxUrl(selected, activeSend.txHash)
                            return (
                              <div className="flex items-center justify-between px-4 py-3">
                                <span className="text-xs text-muted-foreground">Status</span>
                                {url ? (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                                  >
                                    Confirmed
                                    <ExternalLink size={12} />
                                  </a>
                                ) : (
                                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                    Confirmed
                                  </span>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                <Button onClick={onClose} className="w-full h-12 rounded-xl font-semibold mt-5">
                  Done
                </Button>
              </div>
            )}

            {activeSend.status === 'error' && (
              <>
                <div className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center bg-destructive/15 border border-destructive/30">
                  <AlertTriangle className="h-7 w-7 text-destructive" />
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">Transfer failed</p>
                  <p className="text-xs text-muted-foreground mt-1 break-words px-2">
                    {activeSend.error || 'An unknown error occurred.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={onClose}
                    className="flex-1 h-12 rounded-xl font-semibold"
                  >
                    Close
                  </Button>
                  <Button
                    onClick={() => setStep('review')}
                    className="flex-1 h-12 rounded-xl font-semibold"
                  >
                    Try again
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function TokenBadge({
  logoUrl,
  networkLogoUrl,
  symbol,
}: {
  logoUrl: string
  networkLogoUrl: string
  symbol: string
}) {
  return (
    <div className="relative h-9 w-9 shrink-0">
      <div className="h-9 w-9 rounded-full overflow-hidden ring-1 ring-border/40 bg-muted/40">
        <Image src={logoUrl} alt={symbol} width={36} height={36} unoptimized />
      </div>
      <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full overflow-hidden ring-2 ring-background bg-muted">
        <Image src={networkLogoUrl} alt="" width={16} height={16} unoptimized />
      </div>
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/50 bg-muted/20 px-5 py-10 text-center">
      <div className="mx-auto h-11 w-11 rounded-2xl flex items-center justify-center mb-3 bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20">
        <Sparkles className="h-5 w-5 text-primary/80" />
      </div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

function SelectedTokenChip({ selected }: { selected: SendableToken }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/30 bg-background/40 px-3 py-2.5">
      <TokenBadge
        logoUrl={selected.logoUrl}
        networkLogoUrl={selected.networkLogoUrl}
        symbol={selected.symbol}
      />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground leading-tight">
          {selected.symbol}
        </div>
        <div className="text-[11px] text-muted-foreground/80">{selected.networkName}</div>
      </div>
    </div>
  )
}

function ReviewRow({
  label,
  value,
  mono,
  valueClassName,
}: {
  label: string
  value: string
  mono?: boolean
  valueClassName?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-3">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span
        className={cn(
          'text-sm font-medium text-foreground min-w-0 text-right break-all',
          mono && 'font-mono',
          valueClassName,
        )}
      >
        {value}
      </span>
    </div>
  )
}
