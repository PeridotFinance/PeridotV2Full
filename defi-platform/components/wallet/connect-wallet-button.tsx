"use client"

// Remove unused imports
// import { useState } from "react"
// import { Button } from "@/components/ui/button"
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

// The AppKit button handles its own state and logic
export function ConnectWalletButton({ className }: ConnectWalletButtonProps) {
  // Wrap the web component in a div to apply className for layout/positioning
  return (
    <div className={className}>
      <appkit-button />
    </div>
  )
}

// Note: Ensure the AppKit setup (createAppKit) has been called
// in your context provider for this component to work.
