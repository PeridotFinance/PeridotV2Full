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
import type { SwapChain } from '@/lib/swap/chains'
import { ChevronDown, Search, Zap } from 'lucide-react'

interface ChainSelectorProps {
  chains: SwapChain[]
  selected: SwapChain | null
  onSelect: (chain: SwapChain) => void
  isLoading?: boolean
  label?: string
}

export function ChainSelector({
  chains,
  selected,
  onSelect,
  isLoading,
  label = 'Chain',
}: ChainSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return chains
    const q = search.toLowerCase()
    return chains.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.nativeSymbol.toLowerCase().includes(q),
    )
  }, [chains, search])

  const handleSelect = (chain: SwapChain) => {
    onSelect(chain)
    setOpen(false)
    setSearch('')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch('') }}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
        >
          {selected ? (
            <>
              {selected.icon ? (
                <Image src={selected.icon} alt={selected.name} width={16} height={16} className="rounded-full" unoptimized />
              ) : (
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-muted-foreground/20 text-[8px] font-bold">
                  {selected.nativeSymbol.slice(0, 2)}
                </div>
              )}
              <span>{selected.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{label}</span>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[80vh] sm:max-w-md flex flex-col" style={{ display: 'flex', flexDirection: 'column' }}>
        <DialogHeader>
          <DialogTitle>Select Chain</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search chain..."
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
            {filtered.map((chain) => (
              <button
                key={chain.chainId}
                type="button"
                onClick={() => handleSelect(chain)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/80 ${
                  selected?.chainId === chain.chainId ? 'bg-muted/60' : ''
                }`}
              >
                {chain.icon ? (
                  <Image src={chain.icon} alt={chain.name} width={24} height={24} className="rounded-full" unoptimized />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                    {chain.nativeSymbol.slice(0, 2)}
                  </div>
                )}
                <span className="flex-1 font-medium">{chain.name}</span>
                {chain.bitgetSupported && (
                  <span className="flex items-center gap-0.5 rounded-md bg-[#33C47C]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#33C47C]">
                    <Zap className="h-2.5 w-2.5" />
                    Best Fee
                  </span>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No chains found</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
