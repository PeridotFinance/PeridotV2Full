'use client'

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Copy, Loader2, QrCode, ShieldAlert, Wallet } from 'lucide-react'
import QRCode from 'qrcode/lib/browser'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'

type Network = 'evm' | 'stellar'

interface ReceiveSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** EVM address — the same address receives on every EVM chain. */
  evmAddress: string | null | undefined
}

const NETWORK_META: Record<Network, { label: string; scope: string }> = {
  evm: { label: 'EVM', scope: 'Ethereum, Base, Arbitrum, Optimism & Polygon' },
  stellar: { label: 'Stellar', scope: 'the Stellar network' },
}

/**
 * Receive-funds flow. The shell is always cheap to mount; the body — which
 * polls Freighter and generates a QR — only mounts while Radix renders the
 * open dialog, so nothing runs in the background.
 */
export function ReceiveSheet({ open, onOpenChange, evmAddress }: ReceiveSheetProps) {
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
        <ReceiveSheetBody evmAddress={evmAddress} />
      </DialogContent>
    </Dialog>
  )
}

function ReceiveSheetBody({ evmAddress }: { evmAddress: string | null | undefined }) {
  const stellar = useStellarWallet()

  const [network, setNetwork] = useState<Network>(evmAddress ? 'evm' : 'stellar')
  const [copied, setCopied] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrError, setQrError] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const address = network === 'evm' ? evmAddress ?? null : stellar.address ?? null
  const meta = NETWORK_META[network]

  // Regenerate the QR whenever the displayed address changes. Rendered dark
  // modules on a white field so it scans regardless of the app theme.
  useEffect(() => {
    if (!address) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    setQrDataUrl(null)
    setQrError(false)
    QRCode.toDataURL(address, {
      width: 440, // 2x the display size for crisp rendering on retina screens
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrError(true)
      })
    return () => {
      cancelled = true
    }
  }, [address])

  // Drop the "copied" confirmation when switching network.
  useEffect(() => {
    setCopied(false)
  }, [network])

  const handleCopy = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable — the address is still visible to copy by hand */
    }
  }

  const handleConnectStellar = async () => {
    setConnecting(true)
    try {
      await stellar.connect()
    } finally {
      setConnecting(false)
    }
  }

  const needsStellarConnect = network === 'stellar' && !address
  const needsEvmWallet = network === 'evm' && !address

  return (
    <>
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center -mt-1 mb-2" aria-hidden>
        <div className="h-1 w-10 rounded-full bg-foreground/15" />
      </div>

      <DialogHeader className="pb-3 sm:pb-4">
        <DialogTitle className="flex items-center gap-2.5 text-lg font-semibold">
          <div
            className={cn(
              'relative p-2.5 rounded-2xl overflow-hidden shrink-0',
              'bg-gradient-to-br from-primary/25 to-primary/5 border border-primary/25',
            )}
          >
            <QrCode className="h-5 w-5 text-primary relative z-10" />
          </div>
          <span className="tracking-tight">Receive</span>
        </DialogTitle>
      </DialogHeader>

      {/* Network segmented control */}
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-muted/40 border border-border/40">
        {(['evm', 'stellar'] as Network[]).map((n) => (
          <button
            key={n}
            onClick={() => setNetwork(n)}
            className={cn(
              'relative h-9 rounded-xl text-sm font-semibold transition-colors duration-200',
              network === n
                ? 'text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {network === n && (
              <motion.div
                layoutId="receive-network-pill"
                className="absolute inset-0 rounded-xl bg-primary shadow-sm shadow-primary/30"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10">{NETWORK_META[n].label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={network}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className="mt-4 flex flex-col items-center gap-4"
        >
          {needsStellarConnect ? (
            <div className="w-full flex flex-col items-center gap-3 py-8 text-center">
              <div className="h-12 w-12 rounded-2xl bg-muted/50 border border-border/40 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Connect a Stellar wallet</p>
                <p className="text-xs text-muted-foreground max-w-[16rem]">
                  Connect your Stellar wallet to show its receiving address.
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleConnectStellar}
                disabled={connecting}
                className="h-10 px-5 rounded-xl font-semibold"
              >
                {connecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  'Connect a Stellar wallet'
                )}
              </Button>
              {stellar.error && (
                <p className="text-xs text-destructive max-w-[16rem]">{stellar.error}</p>
              )}
            </div>
          ) : needsEvmWallet ? (
            <div className="w-full flex flex-col items-center gap-3 py-10 text-center">
              <div className="h-12 w-12 rounded-2xl bg-muted/50 border border-border/40 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">No EVM wallet connected</p>
              <p className="text-xs text-muted-foreground max-w-[16rem]">
                Connect or sign in with a wallet to get a receiving address.
              </p>
            </div>
          ) : (
            <>
              {/* QR code card */}
              <div className="rounded-3xl bg-white p-4 border border-border/40 shadow-sm">
                <div className="h-[220px] w-[220px] flex items-center justify-center">
                  {qrError ? (
                    <span className="text-xs text-destructive text-center px-4">
                      Couldn&apos;t render QR code
                    </span>
                  ) : qrDataUrl ? (
                    <motion.img
                      key={qrDataUrl}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      src={qrDataUrl}
                      alt={`${meta.label} receiving address QR code`}
                      width={220}
                      height={220}
                      className="h-[220px] w-[220px]"
                    />
                  ) : (
                    <Loader2 className="h-6 w-6 text-slate-300 animate-spin" />
                  )}
                </div>
              </div>

              {/* Address + copy */}
              <button
                onClick={handleCopy}
                className={cn(
                  'group w-full rounded-2xl p-3.5 text-left',
                  'border border-border/50 bg-background/40',
                  'hover:bg-background/70 hover:border-primary/30',
                  'transition-all duration-200',
                )}
                title="Copy address"
                aria-label="Copy address"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex-1 min-w-0 text-xs font-mono text-foreground break-all leading-relaxed">
                    {address}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 h-8 w-8 rounded-lg flex items-center justify-center',
                      'border border-border/40 bg-background/60',
                      'group-hover:border-primary/30 group-hover:text-primary',
                      'transition-colors duration-150',
                    )}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </span>
                </div>
              </button>

              {/* Network-scope warning */}
              <div
                className={cn(
                  'w-full flex items-start gap-2.5 rounded-2xl p-3',
                  'border border-amber-500/30 bg-amber-500/[0.07]',
                )}
              >
                <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Only send assets on{' '}
                  <span className="font-semibold text-foreground">{meta.scope}</span> to this
                  address. Sending assets from other networks may cause permanent loss.
                </p>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </>
  )
}
