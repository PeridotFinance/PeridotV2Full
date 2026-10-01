"use client"

/**
 * ConnectPrompt — shown inside panels when wallet not connected.
 *
 * Design: centered, minimal, glass chip for CTA.
 * Reason: Panels have complex forms — no point rendering them before wallet is there.
 * The prompt makes the requirement clear without being aggressive.
 */

import { Wallet } from 'lucide-react'
import { ConnectWalletButton } from '@/components/wallet/connect-wallet-button'

interface ConnectPromptProps {
  action?: string   // e.g. "supply", "borrow", "manage positions"
}

export default function ConnectPrompt({ action = 'interact' }: ConnectPromptProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="w-10 h-10 rounded-2xl glass flex items-center justify-center">
        <Wallet className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-foreground">Connect your wallet</p>
        <p className="text-xs text-muted-foreground">
          Connect to {action} this asset
        </p>
      </div>
      <ConnectWalletButton className="h-10 px-6 rounded-xl text-sm" />
    </div>
  )
}
