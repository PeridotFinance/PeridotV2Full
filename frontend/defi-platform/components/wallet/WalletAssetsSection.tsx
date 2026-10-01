'use client'

/**
 * Unified "Assets" section for the wallet dialog's Assets subtab.
 *
 * Owns the single source of truth for the holdings summary across *all* chains
 * — EVM (via `useMultiChainTokenBalances`) and Stellar (via
 * `useStellarSendBalances`) — and renders one header + count above the two
 * lists. The child lists (`AssetsAcrossChains`, `StellarAssetsList`) render in
 * `hideHeader` mode so they contribute rows but never their own count, which
 * previously made the subline EVM-only ("4 balances across 2 chains" while
 * Stellar holdings sat below, uncounted).
 *
 * Both hooks share React Query keys with the child lists, so calling them here
 * deduplicates against the children — no extra network requests.
 */

import React, { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Coins, RefreshCw, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useMultiChainTokenBalances,
  type PreselectedSendToken,
} from '@/hooks/use-multi-chain-token-balances'
import { useStellarSendBalances } from '@/hooks/use-stellar-send-balances'
import { AssetsAcrossChains } from './AssetsAcrossChains'
import { StellarAssetsList } from './StellarAssetsList'
import { StellarReceiveAssets } from './StellarReceiveAssets'

interface WalletAssetsSectionProps {
  address: string | null | undefined
  onSend?: (selection: PreselectedSendToken) => void
}

const ZERO = BigInt(0)

export function WalletAssetsSection({ address, onSend }: WalletAssetsSectionProps) {
  const evm = useMultiChainTokenBalances(address)
  const stellar = useStellarSendBalances()
  const [isRefreshing, setIsRefreshing] = React.useState(false)

  // EVM contribution — count chains/tokens the same way the EVM list renders
  // them (positive balance only; loading chains stay visible as skeletons).
  const evmVisibleChains = useMemo(
    () => evm.chains.filter((c) => c.isLoading || c.tokens.some((t) => t.balance > ZERO)),
    [evm.chains],
  )
  const evmAssetCount = useMemo(
    () => evmVisibleChains.reduce((acc, c) => acc + c.tokens.filter((t) => t.balance > ZERO).length, 0),
    [evmVisibleChains],
  )

  // Stellar contribution — positive balances only, matching the EVM semantics
  // and what `StellarAssetsList` renders in hideHeader mode.
  const stellarAssetCount = useMemo(
    () => stellar.tokens.filter((t) => t.balanceRaw > ZERO).length,
    [stellar.tokens],
  )
  const stellarHasAssets = stellar.isConnected && stellarAssetCount > 0

  const assetCount = evmAssetCount + stellarAssetCount
  const chainCount = evmVisibleChains.length + (stellarHasAssets ? 1 : 0)

  // Settled = both sources have resolved (Stellar counts as settled when it's
  // not connected — there's simply nothing to wait for).
  const stellarSettled = !stellar.isConnected || !stellar.isLoading
  const hasAnyLoaded = evm.hasAnyLoaded || (stellar.isConnected && !stellar.isLoading)
  const showEmpty = hasAnyLoaded && evm.hasAnyLoaded && stellarSettled && assetCount === 0
  const isBusy = evm.isLoading || (stellar.isConnected && stellar.isLoading)

  const handleRefresh = () => {
    setIsRefreshing(true)
    evm.refetch()
    if (stellar.isConnected) stellar.refetch()
    setTimeout(() => setIsRefreshing(false), 600)
  }

  return (
    <div className="space-y-3">
      {/* Unified header — one total across every chain */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'p-1.5 rounded-lg',
              'bg-gradient-to-br from-primary/20 to-primary/10',
              'border border-primary/20',
            )}
          >
            <Coins className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground leading-none">Assets</h4>
            <AnimatePresence mode="wait">
              {hasAnyLoaded && (
                <motion.p
                  key={`${assetCount}-${chainCount}`}
                  initial={{ opacity: 0, y: 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -2 }}
                  transition={{ duration: 0.2 }}
                  className="text-[11px] text-muted-foreground mt-1"
                >
                  {assetCount > 0
                    ? `${assetCount} ${assetCount === 1 ? 'balance' : 'balances'} across ${chainCount} ${chainCount === 1 ? 'chain' : 'chains'}`
                    : 'No balances detected'}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isBusy}
          className={cn(
            'flex items-center justify-center h-8 w-8 rounded-xl',
            'border border-border/40 bg-background/40',
            'hover:bg-background/70 hover:border-primary/30 hover:text-primary',
            'transition-all duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          title="Refresh balances"
          aria-label="Refresh balances"
        >
          <RefreshCw
            className={cn(
              'h-3.5 w-3.5 transition-transform duration-500',
              (isBusy || isRefreshing) && 'animate-spin',
            )}
          />
        </button>
      </div>

      {/* Per-chain holdings — children render rows only, no header/count/empty */}
      <AssetsAcrossChains address={address} onSend={onSend} hideHeader />
      <StellarAssetsList hideHeader />
      <StellarReceiveAssets />

      {/* Unified empty state — shown only when every source is settled & empty */}
      <AnimatePresence>
        {showEmpty && (
          <motion.div
            key="assets-empty"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'rounded-2xl border border-dashed border-border/50 bg-muted/20',
              'px-5 py-8 text-center',
            )}
          >
            <div
              className={cn(
                'mx-auto h-11 w-11 rounded-2xl flex items-center justify-center mb-3',
                'bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20',
              )}
            >
              <Sparkles className="h-5 w-5 text-primary/80" />
            </div>
            <p className="text-sm font-medium text-foreground">No balances yet</p>
            <p className="text-xs text-muted-foreground mt-1">Fund your account to get started</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
