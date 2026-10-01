'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import type { TokenInfo } from '@/lib/swap/types'
import type { SwapToken } from '@/lib/swap/chains'
import { ChevronDown, Search } from 'lucide-react'
import {
  useSwapTokenBalances,
  swapTokenBalanceKey,
} from '@/hooks/use-swap-token-balances'

interface TokenSelectorProps {
  /** Tokens available for the currently selected chain */
  tokens: SwapToken[]
  selected: TokenInfo | null
  chainId: number | null
  onSelect: (token: TokenInfo) => void
  isLoading?: boolean
  label?: string
  /** User address used to fetch wallet balances for the token list */
  userAddress?: string
}

const formatUsd = (value: number) => {
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (value >= 0.01) return value.toFixed(2)
  return '<0.01'
}

const formatBalance = (value: number) => {
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
  if (value >= 0.0001) return value.toFixed(4)
  return value.toExponential(2)
}

export function TokenSelector({
  tokens,
  selected,
  chainId,
  onSelect,
  isLoading,
  label = 'Token',
  userAddress,
}: TokenSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const { balances } = useSwapTokenBalances({
    tokens,
    chainId,
    userAddress,
    enabled: open,
  })

  const filtered = useMemo(() => {
    const sorted = [...tokens].sort((a, b) => {
      const va = balances.get(swapTokenBalanceKey(a.address))?.usdValue ?? 0
      const vb = balances.get(swapTokenBalanceKey(b.address))?.usdValue ?? 0
      if (va !== vb) return vb - va
      return 0
    })
    const list = sorted.slice(0, 100)
    if (!search) return list
    const q = search.toLowerCase()
    return list.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q),
    )
  }, [tokens, search, balances])

  const handleSelect = (token: SwapToken) => {
    onSelect({
      address: token.address,
      symbol: token.symbol,
      decimals: token.decimals,
      chainId: chainId ?? Number(token.chainId),
      icon: token.logoURI,
    })
    setOpen(false)
    setSearch('')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch('') }}>
      <DialogTrigger asChild>
        <button
          type="button"
          disabled={!chainId}
          className="flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-40"
        >
          {selected ? (
            <>
              {selected.icon ? (
                <Image src={selected.icon} alt={selected.symbol} width={16} height={16} className="rounded-full" unoptimized />
              ) : (
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-muted-foreground/20 text-[8px] font-bold">
                  {selected.symbol.slice(0, 2)}
                </div>
              )}
              <span>{selected.symbol}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{chainId ? label : 'Select chain first'}</span>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[80vh] sm:max-w-md flex flex-col" style={{ display: 'flex', flexDirection: 'column' }}>
        <DialogHeader>
          <DialogTitle>Select Token</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search token name or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
          />
        </div>

        {isLoading ? (
          <div className="space-y-2 pt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto space-y-0.5 pt-1">
            {filtered.map((token) => {
              const held = balances.get(swapTokenBalanceKey(token.address))
              return (
                <button
                  key={`${token.chainId}-${token.address}`}
                  type="button"
                  onClick={() => handleSelect(token)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/80 ${
                    selected?.address?.toLowerCase() === token.address.toLowerCase() ? 'bg-muted/60' : ''
                  }`}
                >
                  {token.logoURI ? (
                    <Image src={token.logoURI} alt={token.symbol} width={28} height={28} className="rounded-full" unoptimized />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold">
                      {token.symbol.slice(0, 2)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{token.symbol}</div>
                    <div className="text-xs text-muted-foreground truncate">{token.name}</div>
                  </div>
                  {held && held.balance > 0 && (
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-sm font-medium">
                        {formatBalance(held.balance)}
                      </span>
                      {held.usdValue > 0 && (
                        <span className="text-xs text-muted-foreground">
                          ${formatUsd(held.usdValue)}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {tokens.length === 0 ? 'No tokens available for this chain' : 'No tokens found'}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
