'use client'

import React, { useMemo } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import { Coins, RefreshCw, Sparkles, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useMultiChainTokenBalances,
  type ChainAssets,
  type TokenBalance,
  type PreselectedSendToken,
} from '@/hooks/use-multi-chain-token-balances'

interface AssetsAcrossChainsProps {
  address: string | null | undefined
  /** Called when the user taps the send button on an asset row. */
  onSend?: (selection: PreselectedSendToken) => void
  /**
   * Render the chain cards only — no "Assets" header/count and no empty state.
   * Used when a parent (`WalletAssetsSection`) owns the unified summary across
   * EVM *and* Stellar so the count isn't EVM-only.
   */
  hideHeader?: boolean
}

function formatTokenAmount(value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return '0'
  if (n < 0.0001) return '<0.0001'
  if (n >= 1_000_000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (n >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

function hasPositiveBalance(tokens: TokenBalance[]): boolean {
  return tokens.some((t) => t.balance > BigInt(0))
}

function SkeletonChainCard({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={cn(
        'rounded-2xl border border-border/40 bg-card/30 backdrop-blur-sm p-4',
        'relative overflow-hidden'
      )}
    >
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-muted/60 animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-28 rounded bg-muted/60 animate-pulse" />
          <div className="h-3 w-20 rounded bg-muted/40 animate-pulse" />
        </div>
      </div>
      <div
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/[0.04] to-transparent"
        style={{ animation: 'shimmer 1.8s ease-in-out infinite' }}
      />
      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </motion.div>
  )
}

function TokenRow({
  token,
  index,
  onSend,
}: {
  token: TokenBalance
  index: number
  onSend?: () => void
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.25, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'flex items-center justify-between rounded-xl px-3 py-2.5',
        'bg-background/40 border border-border/30',
        'hover:bg-background/70 hover:border-border/60 transition-colors duration-200'
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="relative h-7 w-7 shrink-0 rounded-full bg-muted/40 ring-1 ring-border/40 overflow-hidden">
          <Image
            src={token.logoUrl}
            alt={token.displaySymbol}
            width={28}
            height={28}
            className="object-cover"
            unoptimized
          />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground leading-tight">
            {token.displaySymbol}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {token.isNative ? 'Native' : 'Token'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 pl-3">
        <div className="text-right">
          <div className="font-mono text-sm font-semibold text-foreground tabular-nums">
            {formatTokenAmount(token.balanceFormatted)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {token.displaySymbol}
          </div>
        </div>
        {onSend && (
          <button
            onClick={onSend}
            className={cn(
              'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
              'border border-border/40 bg-background/60 text-muted-foreground',
              'hover:bg-primary hover:text-primary-foreground hover:border-primary',
              'focus-visible:bg-primary focus-visible:text-primary-foreground',
              'transition-colors duration-200'
            )}
            title={`Send ${token.displaySymbol}`}
            aria-label={`Send ${token.displaySymbol}`}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  )
}

function ChainCard({
  chain,
  index,
  onSend,
}: {
  chain: ChainAssets
  index: number
  onSend?: (selection: PreselectedSendToken) => void
}) {
  const nonZero = useMemo(() => chain.tokens.filter((t) => t.balance > BigInt(0)), [chain.tokens])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{
        duration: 0.4,
        delay: index * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(
        'group relative rounded-2xl overflow-hidden',
        'border border-border/50 bg-gradient-to-br from-card/90 to-card/60',
        'backdrop-blur-sm shadow-sm',
        'hover:shadow-md hover:border-primary/30 transition-all duration-300'
      )}
    >
      {/* subtle glow edge on hover */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100',
          'bg-[radial-gradient(circle_at_top_left,theme(colors.primary/0.08),transparent_60%)]',
          'transition-opacity duration-500'
        )}
      />

      <div className="relative p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                'relative h-9 w-9 shrink-0 rounded-full overflow-hidden',
                'ring-1 ring-border/50 bg-muted/40',
                'shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
              )}
            >
              <Image
                src={chain.chainLogoUrl}
                alt={chain.chainName}
                width={36}
                height={36}
                className="object-cover"
                unoptimized
              />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">
                {chain.chainName}
              </div>
              <div className="text-[11px] text-muted-foreground/80">
                {nonZero.length} {nonZero.length === 1 ? 'asset' : 'assets'}
              </div>
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.06 + 0.15, duration: 0.3 }}
            className={cn(
              'rounded-full px-2.5 py-1 text-[10px] uppercase tracking-widest font-semibold',
              'bg-primary/10 text-primary border border-primary/20'
            )}
          >
            Chain
          </motion.div>
        </div>

        <LayoutGroup>
          <motion.div layout className="space-y-1.5">
            <AnimatePresence>
              {nonZero.map((token, i) => (
                <TokenRow
                  key={`${chain.chainId}-${token.symbol}`}
                  token={token}
                  index={i}
                  onSend={
                    onSend
                      ? () =>
                          onSend({
                            chainId: chain.chainId,
                            chainName: chain.chainName,
                            chainLogoUrl: chain.chainLogoUrl,
                            token,
                          })
                      : undefined
                  }
                />
              ))}
            </AnimatePresence>
          </motion.div>
        </LayoutGroup>
      </div>
    </motion.div>
  )
}

export function AssetsAcrossChains({ address, onSend, hideHeader = false }: AssetsAcrossChainsProps) {
  const { chains, isLoading, hasAnyLoaded, refetch } = useMultiChainTokenBalances(address)
  const [isRefreshing, setIsRefreshing] = React.useState(false)

  const visibleChains = useMemo(
    () => chains.filter((c) => c.isLoading || hasPositiveBalance(c.tokens)),
    [chains]
  )

  const assetCount = useMemo(
    () => visibleChains.reduce((acc, c) => acc + c.tokens.filter((t) => t.balance > BigInt(0)).length, 0),
    [visibleChains]
  )

  const handleRefresh = async () => {
    setIsRefreshing(true)
    refetch()
    setTimeout(() => setIsRefreshing(false), 600)
  }

  const showSkeletons = isLoading && !hasAnyLoaded
  const showEmpty = hasAnyLoaded && visibleChains.length === 0

  return (
    <div className="space-y-3">
      {!hideHeader && (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'p-1.5 rounded-lg',
              'bg-gradient-to-br from-primary/20 to-primary/10',
              'border border-primary/20'
            )}
          >
            <Coins className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground leading-none">Assets</h4>
            <AnimatePresence mode="wait">
              {hasAnyLoaded && (
                <motion.p
                  key={`${assetCount}-${visibleChains.length}`}
                  initial={{ opacity: 0, y: 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -2 }}
                  transition={{ duration: 0.2 }}
                  className="text-[11px] text-muted-foreground mt-1"
                >
                  {assetCount > 0
                    ? `${assetCount} ${assetCount === 1 ? 'balance' : 'balances'} across ${visibleChains.length} ${visibleChains.length === 1 ? 'chain' : 'chains'}`
                    : 'No balances detected'}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className={cn(
            'flex items-center justify-center h-8 w-8 rounded-xl',
            'border border-border/40 bg-background/40',
            'hover:bg-background/70 hover:border-primary/30 hover:text-primary',
            'transition-all duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          title="Refresh balances"
          aria-label="Refresh balances"
        >
          <RefreshCw
            className={cn(
              'h-3.5 w-3.5 transition-transform duration-500',
              (isLoading || isRefreshing) && 'animate-spin'
            )}
          />
        </button>
      </div>
      )}

      <LayoutGroup>
        <div className="space-y-2.5">
          <AnimatePresence mode="popLayout">
            {showSkeletons
              ? Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonChainCard key={`skeleton-${i}`} index={i} />
                ))
              : visibleChains.map((chain, i) => (
                  <ChainCard key={chain.chainId} chain={chain} index={i} onSend={onSend} />
                ))}
          </AnimatePresence>

          <AnimatePresence>
            {showEmpty && !hideHeader && (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  'rounded-2xl border border-dashed border-border/50 bg-muted/20',
                  'px-5 py-8 text-center'
                )}
              >
                <div
                  className={cn(
                    'mx-auto h-11 w-11 rounded-2xl flex items-center justify-center mb-3',
                    'bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20'
                  )}
                >
                  <Sparkles className="h-5 w-5 text-primary/80" />
                </div>
                <p className="text-sm font-medium text-foreground">No balances yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Fund your account to get started
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </LayoutGroup>
    </div>
  )
}
