"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Network, ChevronDown, Check, ArrowRight } from "lucide-react"
import { useTreasurySelection } from "@/hooks/use-treasury-selection"
import { getChainConfig } from "@/config/contracts"
import { cn } from "@/lib/utils"
import Image from "next/image"

// Network icon mapping (reuse from network-switcher)
const NETWORK_ICON_BY_ID: Record<number, string> = {
  56: "/tokenimages/app/bnb-logo.svg", // BSC Mainnet
  97: "/tokenimages/app/bnb-logo.svg", // BSC Testnet
  143: "/tokenimages/app/Monad-Logo.svg", // Monad Mainnet
  10143: "/tokenimages/app/Monad-Logo.svg", // Monad Testnet
  50312: "/tokenimages/app/somnia_logo_color.jpg", // Somnia Testnet
}

export function TreasuryChainSelector() {
  const {
    selectedHubChainId,
    availableHubChains,
    setSelectedHubChain,
    isAutoRouting,
    routingInfo,
  } = useTreasurySelection()

  const [isOpen, setIsOpen] = useState(false)

  const selectedChain = availableHubChains.find(
    hc => hc.chainId === selectedHubChainId
  )

  const selectedChainConfig = selectedHubChainId
    ? getChainConfig(selectedHubChainId)
    : null

  const chainIcon = selectedHubChainId
    ? NETWORK_ICON_BY_ID[selectedHubChainId] || "/tokenimages/app/bnb-logo.svg"
    : "/tokenimages/app/bnb-logo.svg"

  const chainName = selectedChainConfig
    ? (selectedChainConfig as any)?.chainNameReadable || `Chain ${selectedHubChainId}`
    : "Select Chain"

  return (
    <div className="flex items-center gap-2">
      {/* Minimal auto-routing indicator */}
      {isAutoRouting && routingInfo && (
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {routingInfo.from} →
        </span>
      )}

      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 px-3 gap-1.5 rounded-lg",
              "hover:bg-muted transition-all"
            )}
          >
            <Image
              src={chainIcon}
              alt={chainName}
              width={16}
              height={16}
              className="rounded-full"
              onError={(e) => {
                e.currentTarget.style.display = "none"
              }}
              unoptimized={true}
              priority={true}
            />
            <span className="text-xs font-medium">{chainName}</span>
            <ChevronDown className="w-3 h-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="w-56 rounded-2xl border-2 bg-background/95 backdrop-blur-sm"
        >
          <div className="p-2">
            {availableHubChains.map((hubChain) => {
              const isSelected = hubChain.chainId === selectedHubChainId
              const chainConfig = getChainConfig(hubChain.chainId)
              const displayName = (chainConfig as any)?.chainNameReadable || hubChain.name
              const icon = NETWORK_ICON_BY_ID[hubChain.chainId] || "/tokenimages/app/bnb-logo.svg"

              return (
                <DropdownMenuItem
                  key={hubChain.chainId}
                  onClick={() => {
                    setSelectedHubChain(hubChain.chainId)
                    setIsOpen(false)
                  }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer",
                    "hover:bg-muted/50 transition-all",
                    isSelected && "bg-primary/10 border border-primary/20"
                  )}
                >
                  <div className="relative">
                    <Image
                      src={icon}
                      alt={displayName}
                      width={20}
                      height={20}
                      className="rounded-full"
                      onError={(e) => {
                        e.currentTarget.style.display = "none"
                      }}
                      unoptimized={true}
                      priority={true}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={cn(
                      "text-sm font-medium",
                      isSelected && "text-primary"
                    )}>
                      {displayName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {hubChain.isTestnet ? "Testnet" : "Mainnet"}
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  )}
                </DropdownMenuItem>
              )
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

