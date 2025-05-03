"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Check, Info } from "lucide-react"
import Image from "next/image"
import { useWallet } from "@/components/wallet/wallet-provider"
import { useRouter } from "next/navigation"

export default function ConnectPage() {
  const { isConnected, connectMetaMask, connectPhantom, connectSolflare, isConnecting } = useWallet()
  const router = useRouter()

  // Redirect to app if already connected
  useEffect(() => {
    if (isConnected) {
      router.push("/app")
    }
  }, [isConnected, router])

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
            <CardContent className="space-y-4">
              <Button
                variant="outline"
                className="w-full flex justify-start items-center h-16"
                onClick={connectMetaMask}
                disabled={isConnecting}
              >
                <div className="w-10 h-10 mr-4 flex items-center justify-center">
                  <Image
                    src="/placeholder.svg?height=40&width=40&query=metamask"
                    alt="MetaMask"
                    width={40}
                    height={40}
                  />
                </div>
                <div className="text-left">
                  <div className="font-medium">MetaMask</div>
                  <div className="text-xs text-text/60">Connect to Ethereum, Polygon, Avalanche, BSC</div>
                </div>
                {isConnecting && <span className="ml-auto animate-spin">⟳</span>}
              </Button>

              <Button
                variant="outline"
                className="w-full flex justify-start items-center h-16"
                onClick={connectPhantom}
                disabled={isConnecting}
              >
                <div className="w-10 h-10 mr-4 flex items-center justify-center">
                  <Image src="/placeholder.svg?height=40&width=40&query=phantom" alt="Phantom" width={40} height={40} />
                </div>
                <div className="text-left">
                  <div className="font-medium">Phantom</div>
                  <div className="text-xs text-text/60">Connect to Solana</div>
                </div>
                {isConnecting && <span className="ml-auto animate-spin">⟳</span>}
              </Button>

              <Button
                variant="outline"
                className="w-full flex justify-start items-center h-16"
                onClick={connectSolflare}
                disabled={isConnecting}
              >
                <div className="w-10 h-10 mr-4 flex items-center justify-center">
                  <Image
                    src="/placeholder.svg?height=40&width=40&query=solflare"
                    alt="Solflare"
                    width={40}
                    height={40}
                  />
                </div>
                <div className="text-left">
                  <div className="font-medium">Solflare</div>
                  <div className="text-xs text-text/60">Connect to Solana</div>
                </div>
                {isConnecting && <span className="ml-auto animate-spin">⟳</span>}
              </Button>
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
