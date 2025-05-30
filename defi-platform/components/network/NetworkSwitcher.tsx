"use client"

import { useState } from "react"
import { useAccount, useSwitchChain } from "wagmi"
import { ChevronDown, Check, AlertTriangle, Globe, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { 
  supportedNetworks, 
  getNetworkDisplayInfo, 
  isSupportedNetwork,
  networkContracts 
} from "../../config/networks"

interface NetworkSwitcherProps {
  className?: string
  variant?: "default" | "compact"
}

export function NetworkSwitcher({ className, variant = "default" }: NetworkSwitcherProps) {
  const { chain, isConnected } = useAccount()
  const { switchChain, isPending } = useSwitchChain()
  const [isOpen, setIsOpen] = useState(false)

  const currentChainId = chain?.id
  const isCurrentNetworkSupported = currentChainId ? isSupportedNetwork(currentChainId) : false
  const currentNetworkInfo = currentChainId ? getNetworkDisplayInfo(currentChainId) : null

  const handleNetworkSwitch = async (chainId: number) => {
    try {
      await switchChain({ chainId })
      setIsOpen(false)
    } catch (error) {
      console.error('Failed to switch network:', error)
    }
  }

  if (!isConnected) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Globe className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Connect wallet</span>
      </div>
    )
  }

  const renderNetworkBadge = (chainId: number, networkName: string, isCurrentNetwork: boolean = false) => {
    const networkInfo = getNetworkDisplayInfo(chainId)
    const isSupported = networkInfo.isSupported
    
    return (
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2 h-2 rounded-full",
            isSupported ? "bg-green-500" : "bg-red-500"
          )} />
          <span className="font-medium">{networkName}</span>
          {networkInfo.isTestnet && (
            <Badge variant="outline" className="text-xs px-1 py-0">
              Testnet
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isSupported && (
            <AlertTriangle className="h-3 w-3 text-amber-500" />
          )}
          {isCurrentNetwork && (
            <Check className="h-4 w-4 text-green-500" />
          )}
        </div>
      </div>
    )
  }

  if (variant === "compact") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 px-2 gap-1",
                !isCurrentNetworkSupported && "border-amber-500 bg-amber-50 dark:bg-amber-950/20",
                className
              )}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  isCurrentNetworkSupported ? "bg-green-500" : "bg-red-500"
                )} />
              )}
              <span className="text-xs font-medium max-w-[60px] truncate">
                {currentNetworkInfo?.name || "Unknown"}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              Current: {currentNetworkInfo?.readable || "Unknown Network"}
              {!isCurrentNetworkSupported && " (Unsupported)"}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 justify-between gap-2 min-w-[180px]",
            !isCurrentNetworkSupported && "border-amber-500 bg-amber-50 dark:bg-amber-950/20",
            className
          )}
          disabled={isPending}
        >
          <div className="flex items-center gap-2">
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <div className={cn(
                "w-2 h-2 rounded-full",
                isCurrentNetworkSupported ? "bg-green-500" : "bg-red-500"
              )} />
            )}
            <span className="font-medium">
              {currentNetworkInfo?.name || "Unknown Network"}
            </span>
            {!isCurrentNetworkSupported && (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
          </div>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Switch Network
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {/* Current Network */}
        {currentNetworkInfo && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Current Network
            </DropdownMenuLabel>
            <DropdownMenuItem className="cursor-default focus:bg-transparent">
              {renderNetworkBadge(currentChainId!, currentNetworkInfo.name, true)}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        
        {/* Supported Networks */}
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Supported Networks
        </DropdownMenuLabel>
        {supportedNetworks.map((network) => {
          const isCurrentNetwork = currentChainId === network.id
          const networkConfig = networkContracts[network.id]
          
          return (
            <DropdownMenuItem
              key={network.id}
              onClick={() => !isCurrentNetwork && handleNetworkSwitch(network.id)}
              disabled={isCurrentNetwork || isPending}
              className={cn(
                "cursor-pointer",
                isCurrentNetwork && "opacity-50 cursor-default"
              )}
            >
              {renderNetworkBadge(network.id, network.name, isCurrentNetwork)}
            </DropdownMenuItem>
          )
        })}
        
        {/* Current Network if Unsupported */}
        {currentNetworkInfo && !isCurrentNetworkSupported && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Current Network (Unsupported)
            </DropdownMenuLabel>
            <DropdownMenuItem className="cursor-default focus:bg-transparent">
              {renderNetworkBadge(currentChainId!, currentNetworkInfo.name, true)}
            </DropdownMenuItem>
          </>
        )}
        
        {/* Network Status Info */}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex items-center justify-between">
              <span>Status:</span>
              <span className={cn(
                "font-medium",
                isCurrentNetworkSupported ? "text-green-600" : "text-amber-600"
              )}>
                {isCurrentNetworkSupported ? "Supported" : "Unsupported"}
              </span>
            </div>
            {currentNetworkInfo?.isTestnet && (
              <div className="flex items-center justify-between">
                <span>Type:</span>
                <span className="font-medium text-blue-600">Testnet</span>
              </div>
            )}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 