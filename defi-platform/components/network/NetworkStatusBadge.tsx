"use client"

import { useAccount } from "wagmi"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AlertTriangle, Check, Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import { getNetworkDisplayInfo, isSupportedNetwork } from "../../config/networks"

interface NetworkStatusBadgeProps {
  className?: string
  showTooltip?: boolean
}

export function NetworkStatusBadge({ className, showTooltip = true }: NetworkStatusBadgeProps) {
  const { chain, isConnected } = useAccount()

  if (!isConnected) {
    return (
      <Badge variant="outline" className={cn("text-xs", className)}>
        <Globe className="h-3 w-3 mr-1" />
        Not Connected
      </Badge>
    )
  }

  const currentChainId = chain?.id
  const isCurrentNetworkSupported = currentChainId ? isSupportedNetwork(currentChainId) : false
  const networkInfo = currentChainId ? getNetworkDisplayInfo(currentChainId) : null

  const badgeContent = (
    <Badge 
      variant={isCurrentNetworkSupported ? "default" : "destructive"} 
      className={cn("text-xs", className)}
    >
      {isCurrentNetworkSupported ? (
        <Check className="h-3 w-3 mr-1" />
      ) : (
        <AlertTriangle className="h-3 w-3 mr-1" />
      )}
      {networkInfo?.name || "Unknown"}
      {networkInfo?.isTestnet && " (Testnet)"}
    </Badge>
  )

  if (!showTooltip) {
    return badgeContent
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badgeContent}
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1">
            <p><strong>Network:</strong> {networkInfo?.readable || "Unknown"}</p>
            <p><strong>Status:</strong> {isCurrentNetworkSupported ? "Supported" : "Unsupported"}</p>
            {networkInfo?.isTestnet && <p><strong>Type:</strong> Testnet</p>}
            {chain?.id && <p><strong>Chain ID:</strong> {chain.id}</p>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
} 