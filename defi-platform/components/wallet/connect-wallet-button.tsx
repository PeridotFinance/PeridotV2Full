"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useWallet } from "@/components/wallet/wallet-provider"
import { Loader2 } from "lucide-react"
import Image from "next/image"

interface ConnectWalletButtonProps {
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive"
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
}

export function ConnectWalletButton({ variant = "default", size = "default", className }: ConnectWalletButtonProps) {
  const [open, setOpen] = useState(false)
  const {
    isConnected,
    isConnecting,
    address,
    walletType,
    connectMetaMask,
    connectPhantom,
    connectSolflare,
    connectWalletConnect,
    disconnect,
  } = useWallet()

  const handleConnect = async (walletConnector: () => Promise<void>) => {
    await walletConnector()
    setOpen(false)
  }

  if (isConnected && address) {
    return (
      <Button variant="outline" size={size} className={className} onClick={disconnect}>
        {walletType === "metamask" && (
          <Image src="/metamask-fox-interface.png" alt="MetaMask" width={20} height={20} className="mr-2" />
        )}
        {walletType === "phantom" && (
          <Image src="/spectral-figure.png" alt="Phantom" width={20} height={20} className="mr-2" />
        )}
        {walletType === "solflare" && (
          <Image src="/solflare-abstract.png" alt="Solflare" width={20} height={20} className="mr-2" />
        )}
        {walletType === "walletconnect" && (
          <Image src="/walletconnect-logo.png" alt="WalletConnect" width={20} height={20} className="mr-2" />
        )}
        {address.substring(0, 6)}...{address.substring(address.length - 4)}
      </Button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className} disabled={isConnecting}>
          {isConnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Connect Wallet
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
          <DialogDescription>Choose a wallet to connect to CrossLend</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Button
            variant="outline"
            className="flex justify-start items-center h-16"
            onClick={() => handleConnect(connectMetaMask)}
            disabled={isConnecting}
          >
            <div className="w-10 h-10 mr-4 flex items-center justify-center">
              <Image src="/metamask-fox-interface.png" alt="MetaMask" width={40} height={40} />
            </div>
            <div className="text-left">
              <div className="font-medium">MetaMask</div>
              <div className="text-xs text-text/60">Connect to Ethereum, Polygon, Avalanche, BSC</div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="flex justify-start items-center h-16"
            onClick={() => handleConnect(connectPhantom)}
            disabled={isConnecting}
          >
            <div className="w-10 h-10 mr-4 flex items-center justify-center">
              <Image src="/spectral-figure.png" alt="Phantom" width={40} height={40} />
            </div>
            <div className="text-left">
              <div className="font-medium">Phantom</div>
              <div className="text-xs text-text/60">Connect to Solana</div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="flex justify-start items-center h-16"
            onClick={() => handleConnect(connectSolflare)}
            disabled={isConnecting}
          >
            <div className="w-10 h-10 mr-4 flex items-center justify-center">
              <Image src="/placeholder.svg?height=40&width=40&query=solflare" alt="Solflare" width={40} height={40} />
            </div>
            <div className="text-left">
              <div className="font-medium">Solflare</div>
              <div className="text-xs text-text/60">Connect to Solana</div>
            </div>
          </Button>
          
          <Button
            variant="outline"
            className="flex justify-start items-center h-16"
            onClick={() => handleConnect(connectWalletConnect)}
            disabled={isConnecting}
          >
            <div className="w-10 h-10 mr-4 flex items-center justify-center">
              <Image src="/placeholder.svg?height=40&width=40&query=walletconnect" alt="WalletConnect" width={40} height={40} />
            </div>
            <div className="text-left">
              <div className="font-medium">WalletConnect</div>
              <div className="text-xs text-text/60">Connect to multiple chains via QR code</div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
