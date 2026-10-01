"use client"

import { useState, useMemo } from "react"
import { useAccount, useSwitchChain } from "wagmi"
import { useNetworkContext } from "@/context"
import { networks as ENABLED_NETWORKS } from "@/config"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"
import Image from "next/image"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"

interface Network {
  id: string
  name: string
  chainId: number
  icon: string
  wagmiChain: any
}

const NETWORK_ICON_BY_ID: Record<string, string> = {
  bnb: "/tokenimages/app/bnb-logo.svg",
  monad: "/tokenimages/app/Monad-Logo.svg",
  somnia: "/tokenimages/app/somnia-logo.svg",
  arbitrum: "/tokenimages/app/arbitrum-logo.svg",
  base: "/tokenimages/app/base-logo.svg",
  polygon: "/tokenimages/app/polygon-logo.svg",
  avalanche: "/tokenimages/app/avax-logo.svg",
}

function idFromChainId(chainId: number): string | undefined {
  const mapping: Record<number, string> = {
    56: "bnb",
    97: "bnb",
    143: "monad",
    10143: "monad",
    1868: "somnia",
    50312: "somnia",
    42161: "arbitrum",
    8453: "base",
    137: "polygon",
    43114: "avalanche",
  }
  return mapping[chainId]
}

const networks: Network[] = ENABLED_NETWORKS
  .map((chain: any) => {
    const id = idFromChainId(chain.id)
    if (!id) return undefined
    return {
      id,
      name: chain.name,
      icon: NETWORK_ICON_BY_ID[id] || "/tokenimages/app/bnb-logo.svg",
      chainId: chain.id,
      wagmiChain: chain,
    }
  })
  .filter(Boolean) as Network[]

// Sort networks to prioritize Hubs
networks.sort((a, b) => {
  const priority = ['bnb', 'monad', 'somnia']
  const aIndex = priority.indexOf(a.id)
  const bIndex = priority.indexOf(b.id)
  if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
  if (aIndex !== -1) return -1
  if (bIndex !== -1) return 1
  return 0
})

interface LightweightNetworkSwitcherProps {
  selectedChainId?: number
  onChainChange?: (chainId: number) => void
  className?: string
}

export function LightweightNetworkSwitcher({
  selectedChainId,
  onChainChange,
  className
}: LightweightNetworkSwitcherProps) {
  const { chain, isConnected } = useAccount()
  const { switchChain, isPending } = useSwitchChain()
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)

  const currentNetwork = useMemo(() => {
    const chainId = selectedChainId || chain?.id
    return networks.find(n => n.chainId === chainId) || networks[0]
  }, [selectedChainId, chain?.id])

  const handleNetworkChange = async (network: Network) => {
    if (currentNetwork.chainId === network.chainId) {
      setIsOpen(false)
      return
    }

    if (!isConnected) {
      onChainChange?.(network.chainId)
      setIsOpen(false)
      return
    }

    try {
      await switchChain({ chainId: network.chainId })
      onChainChange?.(network.chainId)
      setIsOpen(false)
    } catch (error) {
      console.error('Network switch failed:', error)
      toast({
        title: "Network switch failed",
        description: `Failed to switch to ${network.name}. Please try again.`,
        variant: "destructive",
      })
    }
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-xl",
            "glass border border-border/30",
            "hover:border-primary/50 transition-all duration-200",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            className
          )}
          disabled={isPending}
        >
          <Image
            src={currentNetwork.icon}
            alt={currentNetwork.name}
            width={20}
            height={20}
            className="rounded-full"
            unoptimized
          />
          <span className="text-sm font-medium">{currentNetwork.name}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 rounded-2xl border-2 bg-background/95 backdrop-blur-sm glass-strong"
      >
        <div className="p-2">
          {networks.map((network) => {
            const isSelected = network.chainId === currentNetwork.chainId
            return (
              <DropdownMenuItem
                key={network.chainId}
                onClick={() => handleNetworkChange(network)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer",
                  "hover:bg-muted/50 transition-all",
                  isSelected && "bg-primary/10 border border-primary/20"
                )}
              >
                <Image
                  src={network.icon}
                  alt={network.name}
                  width={20}
                  height={20}
                  className="rounded-full"
                  unoptimized
                />
                <span className="flex-1 text-sm font-medium">{network.name}</span>
                {isSelected && (
                  <div className="w-2 h-2 rounded-full bg-primary" />
                )}
              </DropdownMenuItem>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}




