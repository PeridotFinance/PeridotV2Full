"use client"

import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"

// Remove unused imports
// import { useState } from "react"
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogHeader,
//   DialogTitle,
//   DialogTrigger,
// } from "@/components/ui/dialog"
// import { useWallet } from "@/components/wallet/wallet-provider"
// import { Loader2 } from "lucide-react"
// import Image from "next/image"

// Keep props if needed for styling or layout, otherwise remove
interface ConnectWalletButtonProps {
  // variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive" // Appkit button has its own styling
  // size?: "default" | "sm" | "lg" | "icon" // Appkit button has its own styling
  className?: string // Allow passing a className for the wrapper div
}

export function ConnectWalletButton({ className }: ConnectWalletButtonProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [address, setAddress] = useState<string>("")

  useEffect(() => {
    // Listen for wallet connection changes
    const checkConnection = () => {
      // @ts-ignore - AppKit global object
      if (typeof window !== 'undefined' && window.appkit) {
        // @ts-ignore
        const account = window.appkit.getAccount()
        setIsConnected(!!account?.address)
        setAddress(account?.address || "")
      }
    }

    // Initial check
    checkConnection()

    // Listen for AppKit events
    const interval = setInterval(checkConnection, 1000)
    
    return () => clearInterval(interval)
  }, [])

  const handleClick = () => {
    // @ts-ignore - AppKit global object
    if (typeof window !== 'undefined' && window.appkit) {
      if (isConnected) {
        // @ts-ignore
        window.appkit.open({ view: 'Account' })
      } else {
        // @ts-ignore
        window.appkit.open()
      }
    }
  }

  const getButtonText = () => {
    if (isConnected && address) {
      return `${address.slice(0, 6)}...${address.slice(-4)}`
    }
    return "Connect Wallet"
  }

  return (
    <Button
      onClick={handleClick}
      size="sm"
      className={`bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl h-9 px-3 font-medium text-sm ${className || ''}`}
    >
      {getButtonText()}
    </Button>
  )
}

// Note: Ensure the AppKit setup (createAppKit) has been called
// in your context provider for this component to work.
