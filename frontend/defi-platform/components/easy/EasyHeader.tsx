"use client"

import { useProtocolTVL } from "@/hooks/use-protocol-tvl"
import { AnimatedCounter } from "@/components/ui/animated-components"
import { Wallet } from "lucide-react"
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button"

export function EasyHeader() {
  const { totalMarketSize } = useProtocolTVL()

  return (
    <header className="flex items-center justify-between px-6 py-4 fixed top-0 w-full z-50 bg-background/5 backdrop-blur-md border-b border-white/5">
      <div className="flex items-center gap-3">
        <div className="font-bold text-xl tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-400">
          Peridot
        </div>
        <div className="h-4 w-[1px] bg-white/10 mx-1" />
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">TVL</span>
          <div className="text-sm font-mono font-bold text-primary">
            <AnimatedCounter value={totalMarketSize} prefix="$" duration={1} />
          </div>
        </div>
      </div>
      
      <div>
        <ConnectWalletButton className="h-9 px-4 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all font-medium text-xs backdrop-blur-md" />
      </div>
    </header>
  )
}

