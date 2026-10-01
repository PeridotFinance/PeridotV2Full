"use client"

import { useNetworkContext, getNetworkIdFromChainId } from "@/context/index"
import { useAccount, useSwitchChain } from "wagmi"
import { networks as ENABLED_NETWORKS } from "@/config"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useState, useEffect, useMemo } from "react"

// Network icon mapping - same as in network-switcher.tsx
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

interface NetworkWithIcon {
  id: string
  name: string
  icon: string
  chainId: number
}

interface LightNetworkSwitcherProps {
  onSelect?: () => void
}

export function LightNetworkSwitcher({ onSelect }: LightNetworkSwitcherProps) {
  const { selectedNetworkId, setSelectedNetworkId } = useNetworkContext()
  const { chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Map networks to include icons
  const networksWithIcons = useMemo<NetworkWithIcon[]>(() => {
    return ENABLED_NETWORKS
      .map((chain: any) => {
        const id = getNetworkIdFromChainId(chain.id)
        if (!id) return null
        return {
          id,
          name: chain.name,
          icon: NETWORK_ICON_BY_ID[id] || "/tokenimages/app/ethereum-eth-logo.svg", // fallback
          chainId: chain.id,
        }
      })
      .filter(Boolean) as NetworkWithIcon[]
  }, [])

  const currentNetwork = networksWithIcons.find(n => n.id === selectedNetworkId) || networksWithIcons[0]

  const handleSwitch = async (networkId: string, chainId: number) => {
    try {
      if (onSelect) onSelect()
      if (chain?.id !== chainId) {
        await switchChain({ chainId })
      }
      setSelectedNetworkId(networkId)
    } catch (e) {
      console.error("Failed to switch network", e)
    }
  }

  if (!mounted || !currentNetwork) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 transition-all group backdrop-blur-sm">
          <div className="relative w-5 h-5">
            {currentNetwork.icon && (
              <Image 
                src={currentNetwork.icon} 
                alt={currentNetwork.name} 
                fill 
                className="rounded-full object-contain"
                unoptimized={currentNetwork.icon.endsWith('.svg')}
              />
            )}
          </div>
          <span className="text-xs font-semibold text-foreground/80 group-hover:text-foreground transition-colors">
            {currentNetwork.name}
          </span>
          <ChevronDown className="w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 bg-black/40 backdrop-blur-xl border-white/10 text-white">
        {networksWithIcons.map((net) => (
          <DropdownMenuItem
            key={net.id}
            onClick={() => handleSwitch(net.id, net.chainId)}
            className="flex items-center gap-3 py-2 px-3 focus:bg-white/10 cursor-pointer"
          >
             <div className="relative w-5 h-5">
                {net.icon && (
                  <Image 
                    src={net.icon} 
                    alt={net.name} 
                    fill 
                    className="rounded-full object-contain"
                    unoptimized={net.icon.endsWith('.svg')}
                  />
                )}
             </div>
             <span className="text-xs font-medium">{net.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

