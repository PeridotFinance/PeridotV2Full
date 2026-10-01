"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Check, Info } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import dynamic from "next/dynamic"

export default function ConnectPage() {
  const router = useRouter()
  const [isConnected, setIsConnected] = useState(false)

  // Check if wallet is connected
  useEffect(() => {
    if (FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT) {
      // With Privy + wagmi, rely on wagmi connection events where possible
      const handler = () => {
        try {
          if (typeof window !== 'undefined') {
            const connected = Boolean((window as any).ethereum || (window as any).__wagmi || (window as any).__privy)
            if (connected) setIsConnected(true)
          }
        } catch {}
      }
      window.addEventListener('custom:refresh', handler)
      handler()
      return () => {
        window.removeEventListener('custom:refresh', handler)
      }
    }

    // AppKit exposes connection state on the window
    const checkConnection = () => {
      if (typeof window !== 'undefined' && (window as any).reown?.state?.isConnected) {
        setIsConnected(true)
      }
    }

    // Check on load
    checkConnection()

    // Listen for connection changes
    window.addEventListener('reown:accountsChanged', checkConnection)
    
    return () => {
      window.removeEventListener('reown:accountsChanged', checkConnection)
    }
  }, [])

  // Redirect to app if already connected
  useEffect(() => {
    if (isConnected) {
      router.push("/app")
    }
  }, [isConnected, router])

  const ConnectWalletButtonLazy = dynamic(
    () => import("@/components/wallet/connect-wallet-button").then(m => m.ConnectWalletButton),
    { ssr: false, loading: () => <div className="h-9 w-28 rounded-md bg-foreground/10 animate-pulse" /> }
  )

  return (
    <div className="flex flex-col min-h-screen">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Connect Your Wallet</h1>
            <p className="text-text/70">
              Connect your wallet to start using Peridot's cross-chain lending and borrowing platform.
            </p>
          </div>

          <Card className="bg-card border-border/50 mb-6">
            <CardHeader>
              <CardTitle>Choose a Wallet</CardTitle>
              <CardDescription>Select a wallet to connect to Peridot</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex justify-center">
              {FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT ? (
                <ConnectWalletButtonLazy className="h-9" />
              ) : (
                // AppKit Web Component handles all wallet connections
                <appkit-button />
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border/50">
            <CardContent className="p-4">
              <div className="flex items-start">
                <Info className="h-5 w-5 text-primary mr-3 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-text/70">
                  <p className="mb-2">
                    By connecting your wallet, you agree to our Terms of Service and Privacy Policy.
                  </p>
                  <p>Peridot is a non-custodial protocol. We never have access to your funds or private keys.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-4">Why Connect a Wallet?</h2>
            <ul className="space-y-3">
              <li className="flex items-start">
                <div className="mr-3 mt-0.5">
                  <Check className="h-5 w-5 text-primary" />
                </div>
                <span className="text-sm text-text/80">Access cross-chain lending and borrowing markets</span>
              </li>
              <li className="flex items-start">
                <div className="mr-3 mt-0.5">
                  <Check className="h-5 w-5 text-primary" />
                </div>
                <span className="text-sm text-text/80">Supply assets to earn interest across multiple blockchains</span>
              </li>
              <li className="flex items-start">
                <div className="mr-3 mt-0.5">
                  <Check className="h-5 w-5 text-primary" />
                </div>
                <span className="text-sm text-text/80">Borrow against your collateral with competitive rates</span>
              </li>
              <li className="flex items-start">
                <div className="mr-3 mt-0.5">
                  <Check className="h-5 w-5 text-primary" />
                </div>
                <span className="text-sm text-text/80">
                  Participate in governance and shape the future of the protocol
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
