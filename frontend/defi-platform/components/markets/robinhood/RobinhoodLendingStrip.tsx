"use client"

/**
 * Account summary above the Robinhood lending table, in place of the EVM
 * PortfolioStrip (which only knows hub chains). Supplied, borrowed, borrow
 * limit, net APY and how much of the limit is in use, all reference-priced.
 *
 * It also carries the one Robinhood-specific requirement nothing else on the
 * page implies: network fees are paid in ETH, so a wallet holding only USDG
 * cannot sign anything.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useAccount } from 'wagmi'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { ConnectChooser } from '@/components/wallet/ConnectChooser'
import { robinhoodGasStatus } from '@/lib/robinhood/gas'
import { robinhoodUsd18ToNumber, summarizeRobinhoodLending } from '@/lib/robinhood/lending'
import { useRobinhoodLendingAccount, useRobinhoodLendingMarkets } from '@/hooks/use-robinhood-lending'
import { fmtPct, fmtUsd } from './format'

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/60">{label}</span>
      <span className={cn('text-sm sm:text-base font-bold font-mono tabular-nums truncate', className)}>{value}</span>
    </div>
  )
}

export function RobinhoodLendingStrip() {
  const { address } = useAccount()
  const markets = useRobinhoodLendingMarkets()
  const account = useRobinhoodLendingAccount()
  const [chooserOpen, setChooserOpen] = useState(false)

  const summary = useMemo(() => summarizeRobinhoodLending(markets.data, account.data), [markets.data, account.data])
  const gas = useMemo(
    () =>
      robinhoodGasStatus({
        balanceWei: account.data?.nativeBalanceWei ?? null,
        gasPriceWei: account.data?.gasPriceWei ?? null,
      }),
    [account.data?.nativeBalanceWei, account.data?.gasPriceWei],
  )

  const hasPosition = (summary.suppliedUsd18 ?? 0n) > 0n || (summary.borrowedUsd18 ?? 0n) > 0n

  if (!address) {
    return (
      <>
        <motion.button
          type="button"
          data-testid="robinhood-lending-strip"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => setChooserOpen(true)}
          className="w-full flex items-center justify-between py-3 px-5 rounded-xl border border-border/40 bg-background shadow-sm group hover:border-primary/30 transition-all text-left"
        >
          <div className="flex items-center gap-3">
            <Image src="/tokenimages/robinhood/robinhood-chain.png" alt="" width={32} height={32} className="rounded-full" />
            <div className="flex flex-col">
              <span className="text-[11px] font-bold uppercase tracking-widest text-foreground/80">Lend and borrow on Robinhood Chain</span>
              <span className="text-[10px] text-muted-foreground/60">USDG and tokenized NVDA. Connect an EVM wallet to start.</span>
            </div>
          </div>
          <span className="flex items-center gap-1 text-[10px] font-bold text-primary uppercase tracking-tighter group-hover:translate-x-0.5 transition-transform">
            Connect <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </motion.button>
        <ConnectChooser open={chooserOpen} onOpenChange={setChooserOpen} />
      </>
    )
  }

  if (account.isLoading && !account.data) {
    return <div className="h-[62px] rounded-xl border border-border/20 bg-background/50 animate-pulse" />
  }

  const limitLeft =
    summary.borrowLimitUsd18 !== null && summary.borrowedUsd18 !== null
      ? robinhoodUsd18ToNumber(summary.borrowLimitUsd18 > summary.borrowedUsd18 ? summary.borrowLimitUsd18 - summary.borrowedUsd18 : 0n)
      : null
  const used = summary.limitUsedPct
  const usedClass = used === null ? 'bg-muted' : used >= 85 ? 'bg-red-500' : used >= 65 ? 'bg-amber-400' : 'bg-emerald-400'

  return (
    <motion.div
      data-testid="robinhood-lending-strip"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/40 bg-background shadow-sm px-4 sm:px-5 py-3 space-y-2.5"
    >
      {hasPosition ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Supplied" value={fmtUsd(summary.suppliedUsd18 !== null ? robinhoodUsd18ToNumber(summary.suppliedUsd18) : null)} />
            <Stat
              label="Borrowed"
              value={fmtUsd(summary.borrowedUsd18 !== null ? robinhoodUsd18ToNumber(summary.borrowedUsd18) : null)}
              className="text-amber-400"
            />
            <Stat label="Borrow limit left" value={fmtUsd(limitLeft)} />
            <Stat
              label="Net APY"
              value={fmtPct(summary.netApy)}
              className={(summary.netApy ?? 0) >= 0 ? 'text-emerald-400' : 'text-amber-400'}
            />
          </div>
          {(summary.borrowedUsd18 ?? 0n) > 0n && used !== null && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground/70 uppercase tracking-wide font-medium">
                <span>Borrow limit used</span>
                <span className="font-mono">{used.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-500', usedClass)} style={{ width: `${Math.min(100, used)}%` }} />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center gap-3">
          <Image src="/tokenimages/robinhood/robinhood-chain.png" alt="" width={28} height={28} className="rounded-full" />
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-widest text-foreground/80">No positions on Robinhood Chain yet</span>
            <span className="text-[10px] text-muted-foreground/60">Open a market below to supply USDG or NVDA.</span>
          </div>
        </div>
      )}

      {summary.liquidatable && (
        <p className="flex items-center gap-1.5 text-[11px] text-red-500 dark:text-red-400">
          <AlertTriangle className="w-3.5 h-3.5" /> This account is below its collateral requirement and can be liquidated. Repay or add collateral.
        </p>
      )}
      {gas.blocks && gas.message && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" /> {gas.message}
        </p>
      )}
    </motion.div>
  )
}
