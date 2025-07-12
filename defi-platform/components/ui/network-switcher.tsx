"use client"

import * as React from "react"
import { useState } from "react"
import { ChevronDown, Check, AlertCircle } from "lucide-react"
import { useTheme } from "next-themes"
import { useAccount, useSwitchChain } from "wagmi"
import { monadTestnet, bscTestnet } from "@reown/appkit/networks"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import Image from "next/image"

interface Network {
  id: string
  name: string
  symbol: string
  icon: string
  chainId: number
  wagmiChain: any // wagmi chain object
}

export type { Network }

const networks: Network[] = [
  {
    id: "monad",
    name: "Monad",
    symbol: "MON",
    icon: "/tokenimages/app/Monad-Logo.svg",
    chainId: monadTestnet.id,
    wagmiChain: monadTestnet,
  },
  {
    id: "bnb",
    name: "BSC",
    symbol: "BNB",
    icon: "/tokenimages/app/bnb-logo.svg",
    chainId: bscTestnet.id,
    wagmiChain: bscTestnet,
  },
]

interface NetworkSwitcherProps {
  selectedNetwork?: string
  onNetworkChange?: (network: Network) => void
  className?: string
}

export function NetworkSwitcher({
  selectedNetwork = "monad",
  onNetworkChange,
  className,
}: NetworkSwitcherProps) {
  const { theme } = useTheme()
  const { toast } = useToast()
  const [isMounted, setIsMounted] = useState(false)
  const { chain, isConnected } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  // Determine current network based on connected chain
  const currentNetwork = React.useMemo(() => {
    if (!chain) {
      console.log('NetworkSwitcher - No chain connected, using selectedNetwork:', selectedNetwork)
      return selectedNetwork
    }
    const networkData = networks.find(network => network.chainId === chain.id)
    const result = networkData?.id || selectedNetwork
    console.log('NetworkSwitcher - Network detection:', {
      chainId: chain.id,
      foundNetwork: networkData?.name,
      resultId: result
    })
    return result
  }, [chain, selectedNetwork])

  // Debug logging for network detection
  React.useEffect(() => {
    if (chain) {
      console.log('NetworkSwitcher - Chain changed:', {
        chainId: chain.id,
        chainName: chain.name,
        detectedNetwork: networks.find(network => network.chainId === chain.id)?.name || 'Unknown',
        currentNetwork,
        selectedNetwork
      })
    }
  }, [chain, currentNetwork, selectedNetwork])

  const selectedNetworkData = networks.find(network => network.id === currentNetwork) || networks[0]

  const handleNetworkChange = async (network: Network) => {
    if (!isConnected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet first to switch networks.",
        variant: "destructive",
      })
      return
    }

    if (chain?.id === network.chainId) {
      toast({
        title: "Already connected",
        description: `You're already connected to ${network.name}.`,
      })
      return
    }

    try {
      console.log(`Attempting to switch to ${network.name} (Chain ID: ${network.chainId})`)
      await switchChain({ chainId: network.chainId })
      onNetworkChange?.(network)
      toast({
        title: "Network switched",
        description: `Successfully switched to ${network.name}.`,
      })
    } catch (error) {
      console.error('Network switch failed:', error)
      console.error('Error details:', {
        targetNetwork: network.name,
        targetChainId: network.chainId,
        currentChain: chain?.id,
        error: error
      })
      toast({
        title: "Network switch failed",
        description: `Failed to switch to ${network.name}. Please try again.`,
        variant: "destructive",
      })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          className={cn(
            "h-8 px-3 gap-2 transition-all duration-300 ease-out group relative overflow-hidden",
            // Liquid glass effect
            "backdrop-blur-xl border border-white/20 shadow-lg",
            "bg-gradient-to-br transition-all duration-300",
            // Theme-specific styling
            isMounted && theme === "light" 
              ? "from-white/40 via-white/20 to-white/10 shadow-green-500/20 hover:from-white/50 hover:via-white/30 hover:to-white/20 hover:shadow-green-500/30 hover:border-white/30" 
              : "from-white/10 via-white/5 to-transparent shadow-green-500/20 hover:from-white/15 hover:via-white/10 hover:to-white/5 hover:shadow-green-500/40 hover:border-white/30",
            // Green accent glow on hover
            "hover:shadow-lg hover:scale-105 active:scale-95",
            // Connection status styling
            isConnected && chain?.id === selectedNetworkData.chainId && "border-green-400/50 shadow-green-400/20",
            !isConnected && "opacity-70",
            isPending && "opacity-50 cursor-not-allowed",
            className
          )}
        >
          {/* Background glow effect */}
          <div className={cn(
            "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300",
            "bg-gradient-to-r from-green-400/10 via-green-500/20 to-green-600/10"
          )} />
          
          {/* Network icon */}
          <div className="relative z-10 flex items-center gap-2">
            {isPending ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
            ) : (
              <div className="relative">
                <Image
                  src={selectedNetworkData.icon}
                  alt={selectedNetworkData.name}
                  width={16}
                  height={16}
                  className="rounded-full flex-shrink-0"
                  onError={(e) => {
                    console.warn(`Failed to load network icon: ${selectedNetworkData.icon}`)
                    // Hide the image on error
                    e.currentTarget.style.display = 'none'
                  }}
                  unoptimized={true}
                  priority={true}
                />
                {/* Connection status indicator */}
                {isConnected && chain?.id === selectedNetworkData.chainId && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 border border-background rounded-full" />
                )}
                {!isConnected && (
                  <AlertCircle className="absolute -top-1 -right-1 w-2 h-2 text-orange-400" />
                )}
              </div>
            )}
            
            {/* Network name - responsive display */}
            <span className="text-xs font-medium whitespace-nowrap">
              {isPending ? (
                <span className="hidden sm:inline">Switching...</span>
              ) : (
                <>
                  <span className="hidden sm:inline">{selectedNetworkData.name}</span>
                  <span className="sm:hidden">{selectedNetworkData.symbol}</span>
                </>
              )}
            </span>
            
            <ChevronDown className={cn(
              "h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180",
              isPending && "animate-pulse"
            )} />
          </div>
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent
        align="center"
        className={cn(
          "min-w-[160px] p-2 mt-2",
          // Liquid glass effect for dropdown
          "backdrop-blur-xl border border-white/20 shadow-2xl",
          "bg-gradient-to-br",
          isMounted && theme === "light"
            ? "from-white/80 via-white/60 to-white/40 shadow-green-500/20"
            : "from-black/60 via-black/40 to-black/20 shadow-green-500/30"
        )}
      >
        {networks.map((network) => {
          const isCurrentNetwork = currentNetwork === network.id
          const isConnectedToThisNetwork = isConnected && chain?.id === network.chainId
          
          return (
            <DropdownMenuItem
              key={network.id}
              onClick={() => handleNetworkChange(network)}
              disabled={isPending || isConnectedToThisNetwork}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200",
                "hover:bg-gradient-to-r hover:from-green-400/20 hover:via-green-500/10 hover:to-green-600/20",
                isCurrentNetwork && "bg-green-500/10 border border-green-400/30",
                isConnectedToThisNetwork && "bg-green-500/20 border border-green-400/50",
                isPending && "opacity-50 cursor-not-allowed",
                "disabled:hover:bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              <div className="relative">
                <Image
                  src={network.icon}
                  alt={network.name}
                  width={20}
                  height={20}
                  className="rounded-full flex-shrink-0"
                  onError={(e) => {
                    console.warn(`Failed to load network icon: ${network.icon}`)
                    // Hide the image on error
                    e.currentTarget.style.display = 'none'
                  }}
                  unoptimized={true}
                  priority={true}
                />
                {/* Connection status indicator */}
                {isConnectedToThisNetwork && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 border border-background rounded-full" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{network.name} Testnet</div>
                <div className="text-xs text-muted-foreground">
                  {network.symbol}
                  {isConnectedToThisNetwork && " • Connected"}
                </div>
              </div>
              
              {isConnectedToThisNetwork && (
                <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 