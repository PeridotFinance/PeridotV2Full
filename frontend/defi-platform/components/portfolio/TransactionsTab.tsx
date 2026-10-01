'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Receipt, 
  ArrowUpRight, 
  ArrowDownRight,
  Copy,
  ExternalLink,
  Info,
  Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAccount } from 'wagmi'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useAuthedFetch } from '@/hooks/use-authed-fetch'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from '@/components/ui/use-toast'
import { getChainConfig } from '@/config/contracts'
import { getActionDisplayName } from '@/hooks/use-stats-data'

interface VerifiedTransaction {
  tx_hash: string
  action_type: 'supply' | 'borrow' | 'repay' | 'redeem' | 'cross-chain_supply' | 'cross-chain_borrow' | 'cross-chain_repay' | 'cross-chain_redeem'
  token_symbol: string
  amount: string
  usd_value: number
  points_awarded?: number
  verified_at: string
  chain_id: number
}

interface TransactionsTabProps {
  hideBalances: boolean
}

const BASE_VISIBLE_TX = 20
const LOAD_MORE_INCREMENT = 20

const getChainName = (chainId: number): string => {
  const config = getChainConfig(chainId)
  return config?.chainNameReadable || `Chain ${chainId}`
}

const getExplorerTxUrl = (chainId: number, txHash: string): string | null => {
  const cfg = getChainConfig(chainId) as any
  const base: string | undefined = cfg?.explorer
  if (!base) return null
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base
  return `${trimmed}/tx/${txHash}`
}

const handleCopy = (text: string) => {
  try {
    navigator.clipboard.writeText(text)
    toast({ title: 'Copied', description: 'Transaction hash copied to clipboard.' })
  } catch {
    toast({ title: 'Copy failed', description: 'Could not copy to clipboard.', variant: 'destructive' as any })
  }
}

interface TxDetailBodyProps {
  tx: VerifiedTransaction
  formatUSD: Intl.NumberFormat
}

const TxDetailBody = React.memo(function TxDetailBody({ tx, formatUSD }: TxDetailBodyProps) {
  const url = getExplorerTxUrl(tx.chain_id, tx.tx_hash)
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-emerald-600 mb-1">{getActionDisplayName(tx.action_type)}</div>
          <div className="text-sm font-semibold">{tx.token_symbol} · {formatUSD.format(Number(tx.usd_value || 0))}</div>
          <div className="text-[11px] text-slate-500">{new Date(tx.verified_at).toLocaleString()}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">{getChainName(tx.chain_id)}</div>
          <div className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate max-w-[18ch]">{tx.tx_hash}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full px-3 hover:bg-emerald-500/10"
          onClick={() => handleCopy(tx.tx_hash)}
          aria-label="Copy transaction hash"
        >
          <Copy className="mr-1 h-4 w-4" /> Copy
        </Button>
        {url ? (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="rounded-full px-3 hover:bg-indigo-500/10"
            aria-label="View on explorer"
          >
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 h-4 w-4" /> Explorer
            </a>
          </Button>
        ) : <div />}
      </div>
    </>
  )
})

TxDetailBody.displayName = 'TxDetailBody'

export function TransactionsTab({ hideBalances }: TransactionsTabProps) {
  const { address } = useActiveWallet()
  const { authedFetch, authReady } = useAuthedFetch()
  const [transactions, setTransactions] = useState<VerifiedTransaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visibleTransactions, setVisibleTransactions] = useState<number>(BASE_VISIBLE_TX)

  const formatUSD = useMemo(() => new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD', 
    maximumFractionDigits: 2 
  }), [])

  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }, [])

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'supply':
      case 'cross-chain_supply':
        return 'bg-green-500/10 text-green-600 border-green-500/30'
      case 'borrow':
      case 'cross-chain_borrow':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/30'
      case 'repay':
      case 'cross-chain_repay':
        return 'bg-purple-500/10 text-purple-600 border-purple-500/30'
      case 'redeem':
      case 'cross-chain_redeem':
        return 'bg-orange-500/10 text-orange-600 border-orange-500/30'
      default:
        return 'bg-muted text-muted-foreground border-border'
    }
  }

  const getActionIcon = (actionType: string) => {
    if (actionType.includes('supply') || actionType.includes('redeem')) {
      return ArrowUpRight
    }
    return ArrowDownRight
  }

  // Fetch transactions - use a dedicated endpoint or fetch all at once
  useEffect(() => {
    if (!address) {
      setTransactions([])
      return
    }
    if (!authReady) {
      setLoading(true)
      return
    }

    const fetchTransactions = async () => {
      setLoading(true)
      setError(null)
      try {
        // Fetch transactions from dedicated endpoint (more efficient, supports higher limits)
        const res = await authedFetch(`/api/user/transactions?address=${address}&limit=200`, { cache: 'no-store' })
        const data = await res.json()
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to load transactions')
        }
        
        setTransactions(data.transactions || [])
      } catch (err) {
        console.error('Error fetching transactions:', err)
        setError(err instanceof Error ? err.message : 'Failed to load transactions')
      } finally {
        setLoading(false)
      }
    }

    fetchTransactions()
  }, [address, authReady, authedFetch])

  // Memoize displayed transactions for performance
  const displayedTransactions = useMemo(() => {
    return transactions.slice(0, visibleTransactions)
  }, [transactions, visibleTransactions])

  // Group transactions by date for better organization
  const groupedTransactions = useMemo(() => {
    const groups: Record<string, VerifiedTransaction[]> = {}
    displayedTransactions.forEach(tx => {
      const date = new Date(tx.verified_at).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
      if (!groups[date]) groups[date] = []
      groups[date].push(tx)
    })
    return groups
  }, [displayedTransactions])

  if (!address) {
    return (
      <Card className="bg-card/60 border border-border/50 rounded-2xl">
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Connect your wallet to view transactions</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border border-border/50 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" />
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {loading ? 'Loading...' : `${transactions.length} total transactions`}
              </p>
            </div>
            {transactions.length > BASE_VISIBLE_TX && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleTransactions(v => 
                  v > BASE_VISIBLE_TX 
                    ? BASE_VISIBLE_TX 
                    : Math.min(transactions.length, v + LOAD_MORE_INCREMENT)
                )}
                className="rounded-full"
              >
                {visibleTransactions > BASE_VISIBLE_TX ? 'Show Less' : 'Show More'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transactions List */}
      {loading ? (
        <Card className="bg-card/60 border border-border/50 rounded-2xl">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Loading transactions...</p>
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="bg-card/60 border border-border/50 rounded-2xl">
          <CardContent className="p-8 text-center">
            <p className="text-red-500">{error}</p>
          </CardContent>
        </Card>
      ) : displayedTransactions.length === 0 ? (
        <Card className="bg-card/60 border border-border/50 rounded-2xl">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No transactions found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedTransactions).map(([date, txs]) => (
            <Card key={date} className="bg-card/60 border border-border/50 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">{date}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {txs.map((tx) => {
                    const ActionIcon = getActionIcon(tx.action_type)
                    return (
                      <HoverCard key={tx.tx_hash} openDelay={80} closeDelay={80}>
                        <HoverCardTrigger asChild>
                          <div className="flex items-center justify-between p-3 rounded-xl bg-white/70 dark:bg-white/5 backdrop-blur-md border border-slate-200/70 dark:border-white/10 hover:border-emerald-400/40 hover:bg-white/80 dark:hover:bg-white/10 transition-all duration-200 cursor-pointer"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className={cn(
                                "p-2 rounded-lg",
                                getActionColor(tx.action_type)
                              )}>
                                <ActionIcon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge 
                                    variant="outline" 
                                    className={cn("text-xs", getActionColor(tx.action_type))}
                                  >
                                    {getActionDisplayName(tx.action_type)}
                                  </Badge>
                                  <span className="text-sm font-semibold">{tx.token_symbol}</span>
                                </div>
                                <p className="text-xs text-muted-foreground truncate max-w-[40ch]">
                                  {tx.tx_hash}
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {formatDate(tx.verified_at)} · {getChainName(tx.chain_id)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="text-sm font-bold">
                                  {hideBalances ? '•••' : formatUSD.format(Number(tx.usd_value || 0))}
                                </p>
                                {tx.points_awarded && (
                                  <p className="text-xs text-emerald-600">
                                    +{tx.points_awarded} pts
                                  </p>
                                )}
                              </div>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="rounded-full"
                                    aria-label="Show details"
                                  >
                                    <Info className="h-4 w-4" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 rounded-2xl border-white/20 bg-white/80 dark:bg-black/30 backdrop-blur-xl shadow-lg">
                                  <TxDetailBody tx={tx} formatUSD={formatUSD} />
                                </PopoverContent>
                              </Popover>
                            </div>
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-80 rounded-2xl border-white/20 bg-white/70 dark:bg-black/30 backdrop-blur-xl shadow-lg">
                          <TxDetailBody tx={tx} formatUSD={formatUSD} />
                        </HoverCardContent>
                      </HoverCard>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Load More Button */}
      {transactions.length > visibleTransactions && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => setVisibleTransactions(v => Math.min(transactions.length, v + LOAD_MORE_INCREMENT))}
            className="rounded-full"
          >
            Load More ({transactions.length - visibleTransactions} remaining)
          </Button>
        </div>
      )}
    </div>
  )
}

