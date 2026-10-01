"use client"

import { useState, useMemo, useEffect } from "react"
import { useAccount, useSwitchChain } from "wagmi"
import { useNetworkContext } from "@/context"
import { networks as ENABLED_NETWORKS } from "@/config"
import { cn } from "@/lib/utils"
import { ChevronDown, Check } from "lucide-react"
import Image from "next/image"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"

export function LightweightNetworkSwitcher() {
  const { chain, isConnected } = useAccount()
  const { switchChain, isPending } = useSwitchChain()
  const { selectedNetworkId, setSelectedNetworkId } = useNetworkContext()
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)

  // Improved mapping for icons based on config/index.tsx
  const NETWORK_ICON_BY_ID: Record<string, string> = {
    monad: "/tokenimages/app/Monad-Logo.svg",
    bnb: "/tokenimages/app/bnb-logo.svg",
    arbitrum: "/tokenimages/app/arbitrum-logo.svg",
    base: "/tokenimages/app/base-logo.svg",
    eth: "/tokenimages/app/ethereum-eth-logo.svg",
    polygon: "/tokenimages/app/polygon-matic-logo.svg",
    avalanche: "/tokenimages/app/avax.png",
    somnia: "/tokenimages/app/somnia_logo_color.jpg",
  }

  function idFromChainId(chainId: number): string | undefined {
    switch (chainId) {
      case 10143: case 143: return "monad"
      case 97: case 56: return "bnb"
      case 1: case 11155111: return "eth"
      case 137: return "polygon"
      case 42161: case 421614: return "arbitrum"
      case 8453: case 84532: return "base"
      case 43114: return "avalanche"
      case 50312: case 1868: return "somnia"
      default: return undefined
    }
  }

  const networkList = useMemo(() => {
    return (ENABLED_NETWORKS as any[]).map((n) => {
      const id = idFromChainId(n.id)
      return {
        id: id || n.id.toString(),
        name: n.name,
        chainId: n.id,
        icon: (id && NETWORK_ICON_BY_ID[id]) || "/tokenimages/app/bnb-logo.svg",
        symbol: n.nativeCurrency?.symbol || "ETH"
      }
    })
  }, [])

  const currentNetwork = useMemo(() => {
    return networkList.find(n => n.chainId === chain?.id) || 
           networkList.find(n => n.id === selectedNetworkId) || 
           networkList[0]
  }, [chain?.id, selectedNetworkId, networkList])

  const handleSwitch = async (n: typeof networkList[0]) => {
    if (!isConnected) {
      setSelectedNetworkId(n.id)
      setIsOpen(false)
      return
    }

    try {
      await switchChain({ chainId: n.chainId })
      setSelectedNetworkId(n.id)
      setIsOpen(false)
    } catch (error) {
      toast({
        title: "Switch failed",
        description: "Please try again in your wallet.",
        variant: "destructive"
      })
    }
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button className={cn(
          "flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full",
          "glass border border-white/20 transition-all active:scale-95",
          "bg-white/5 hover:bg-white/10 hover:border-primary/40 shadow-lg",
          isPending && "animate-pulse opacity-70"
        )}>
          <div className="relative w-5 h-5 flex-shrink-0">
            <Image 
              src={currentNetwork.icon} 
              alt={currentNetwork.name} 
              fill
              className="rounded-full object-contain"
              unoptimized 
            />
          </div>
          <span className="text-[10px] font-black text-white uppercase tracking-wider hidden xs:inline-block">
            {currentNetwork.name}
          </span>
          <ChevronDown className={cn("w-3 h-3 text-white/50 transition-transform duration-300", isOpen && "rotate-180")} />
        </button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent 
        align="end" 
        className="w-56 p-2 rounded-2xl glass-strong border-white/20 shadow-2xl backdrop-blur-2xl"
      >
        <div className="px-3 py-2 mb-1">
          <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Select Network</span>
        </div>
        {networkList.map((n) => {
          const isSelected = n.chainId === chain?.id || (!isConnected && n.id === selectedNetworkId)
          return (
            <DropdownMenuItem
              key={n.chainId}
              onClick={() => handleSwitch(n)}
              className={cn(
                "flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all mb-1",
                isSelected ? "bg-primary/20 text-primary border border-primary/20" : "hover:bg-white/5 text-white/70 hover:text-white"
              )}
            >
              <div className="relative w-6 h-6 flex-shrink-0">
                <Image src={n.icon} alt={n.name} fill className="rounded-full object-contain" unoptimized />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate">{n.name}</div>
                <div className="text-[9px] opacity-50 font-medium">{n.symbol}</div>
              </div>
              {isSelected && <Check className="w-3.5 h-3.5" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}




