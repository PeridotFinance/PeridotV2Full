"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { AlertCircle } from "lucide-react"
import type { WormholeConnectConfig, WormholeConnectTheme } from "@wormhole-foundation/wormhole-connect"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

// Dynamically import WormholeConnect to prevent SSR errors
const WormholeConnect = dynamic(
  () => import("@wormhole-foundation/wormhole-connect").then(m => m.default),
  { ssr: false }
)

type BridgeComponentProps = {
  className?: string
}

const BridgeComponent = ({ className }: BridgeComponentProps) => {
  // Add a state to ensure the component only renders on client side
  const [isMounted, setIsMounted] = useState(false)
  const { theme, resolvedTheme } = useTheme()
  const isDarkMode = theme === "dark" || resolvedTheme === "dark"
  const network = "Testnet"

  // Set mounted state to true after component mounts on client
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Define the configuration options with proper types
  const config: Partial<WormholeConnectConfig> = {
    // network: "Mainnet",
    network: network,
    chains: ["Ethereum", "Solana", "Avalanche", "Polygon", "Bsc", "Terra", "Oasis", "Algorand", "Aurora", "Fantom", "Karura", "Acala", "Klaytn", "Celo", "Near", "Moonbeam", "Neon", "PolygonSepolia", "Arbitrum", "Optimism", "Base", "Scroll", "Gnosis", "ArbitrumSepolia", "OptimismSepolia", "BaseSepolia"],
    rpcs: {
      // Optional: provide your own RPC endpoints for better reliability
      // Ethereum: "https://rpc.ankr.com/eth/your-key-here",
      // Solana: "https://api.mainnet-beta.solana.com",
    }
  }

  // Define the dark theme with proper hex colors
  const darkTheme: Partial<WormholeConnectTheme> = {
    mode: 'dark',
    primary: '#22c55e',         // Green color 
    secondary: '#6366f1',       // Indigo color
    text: '#ffffff',            // White
    textSecondary: '#94a3b8',   // Gray color
    error: '#ef4444',           // Red color
    success: '#10b981',         // Green color
    font: 'system-ui, sans-serif'
  }

  // Define the light theme with proper hex colors
  const lightTheme: Partial<WormholeConnectTheme> = {
    mode: 'light',
    primary: '#16a34a',         // Green color (darker for better contrast on light)
    secondary: '#4f46e5',       // Indigo color
    text: '#171717',            // Near black
    textSecondary: '#525252',   // Gray color
    error: '#dc2626',           // Red color
    success: '#059669',         // Green color
    font: 'system-ui, sans-serif'
  }

  // Use theme based on current app theme
  const bridgeTheme = isDarkMode ? darkTheme : lightTheme

  return (
    <Card className={cn(
      "w-full overflow-hidden border shadow-md",
      isDarkMode ? "bg-card/95 border-border/30" : "bg-card border-border/20",
      className
    )}>
      <CardHeader className={cn(
        "border-b py-3", 
        isDarkMode ? "bg-muted/30 border-border/30" : "bg-muted/10 border-border/10"
      )}>
        <CardTitle className="text-xl md:text-2xl flex flex-col md:flex-row md:items-center gap-2">
          <span>Cross-Chain Bridge</span>
          <p className="text-sm font-normal text-muted-foreground flex items-center gap-1 md:ml-2">
            <AlertCircle className="h-4 w-4" /> 
            <span>{network}</span>
          </p>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className={cn(
          "px-6 py-4",
          isDarkMode ? "bg-background/20" : "bg-background"
        )}>
          <p className="text-sm text-muted-foreground mb-3">
            Transfer tokens between different blockchains seamlessly. Select your source and 
            destination chains, connect your wallets, and transfer tokens in a few clicks.
          </p>
          <Separator className={cn(
            "my-3",
            isDarkMode ? "bg-border/30" : "bg-border/20"
          )} />
          <div className="w-full min-h-[580px]">
            {isMounted && (
              <WormholeConnect 
                config={config}
                theme={bridgeTheme}
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default BridgeComponent 