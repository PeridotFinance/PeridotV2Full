"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { AlertCircle } from "lucide-react"
import type { WormholeConnectConfig, WormholeConnectTheme } from "@wormhole-foundation/wormhole-connect"
import { DEFAULT_ROUTES } from "@wormhole-foundation/wormhole-connect";

import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

// Import nttRoutes and contract configurations
import { nttRoutes } from "@wormhole-foundation/wormhole-connect"
import { arbitrumSepoliaContracts, baseSepoliaContracts, solanaTestnetContracts } from "@/config/contracts"

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

  // Define the tokensConfig for the <WormholeConnect /> component
  // This provides basic display info and a canonical tokenId.
  const tokensConfig: WormholeConnectConfig['tokensConfig'] = {
    PRDT: { // Key matches the token name used in nttConfigForRoutes
      symbol: "PRDT",
      decimals: 18, // Please verify
      icon: "", // Optional: URL to token icon
      tokenId: { // Canonical identifier for the token
        chain: arbitrumSepoliaContracts.chainNameWormhole as any, // Or SDK Chain type
        address: arbitrumSepoliaContracts.peridotToken
      }
    },
    USDT: { // Key matches the token name used in nttConfigForRoutes
      symbol: "USDT",
      decimals: 6, // Please verify
      icon: "", // Optional
      tokenId: { // Canonical identifier for the token
        chain: arbitrumSepoliaContracts.chainNameWormhole as any, // Or SDK Chain type
        address: arbitrumSepoliaContracts.usdtNtt
      }
    }
  };

  // Define the NTT configuration for nttRoutes helper function
  // This structure should align with NttRoute.Config from your types.ts
  const nttConfigForRoutes = {
    tokens: {
      PRDT: [
        {
          chain: arbitrumSepoliaContracts.chainNameWormhole as any, // SDK Chain type expected. Using string + cast for now.
          token: arbitrumSepoliaContracts.peridotToken, // Actual token contract address
          manager: arbitrumSepoliaContracts.proxyHub,
          transceiver: [
            { type: "wormhole" as "wormhole", address: "PLACEHOLDER_PRDT_TRANSCEIVER_ON_BASE_SEPOLIA" },
            { type: "wormhole" as "wormhole", address: "PLACEHOLDER_PRDT_TRANSCEIVER_ON_SOLANA" }
          ],
          // quoter: "Optional_Quoter_Address_If_Needed_For_PRDT_On_ArbSepolia"
        },
        {
          chain: baseSepoliaContracts.chainNameWormhole as any,
          token: baseSepoliaContracts.peridotToken,
          manager: baseSepoliaContracts.peridotSpokeProxy,
          transceiver: [
            { type: "wormhole" as "wormhole", address: "PLACEHOLDER_PRDT_TRANSCEIVER_ON_ARBITRUM_SEPOLIA" },
            { type: "wormhole" as "wormhole", address: "PLACEHOLDER_PRDT_TRANSCEIVER_ON_SOLANA" }
          ],
        },
        {
          chain: solanaTestnetContracts.chainNameWormhole as any,
          token: solanaTestnetContracts.prdtSplTokenMint, // PRDT SPL Mint on Solana Testnet
          manager: solanaTestnetContracts.prdtNttManagerPda,  // PRDT NTT Manager PDA on Solana Testnet
          transceiver: [
            { type: "wormhole" as "wormhole", address: "PLACEHOLDER_PRDT_TRANSCEIVER_ON_ARBITRUM_SEPOLIA_FROM_SOLANA" },
            { type: "wormhole" as "wormhole", address: "PLACEHOLDER_PRDT_TRANSCEIVER_ON_BASE_SEPOLIA_FROM_SOLANA" }
          ],
        }
      ],
      USDT: [ // Key is "USDT", matching the main tokensConfig
        {
          chain: arbitrumSepoliaContracts.chainNameWormhole as any,
          token: arbitrumSepoliaContracts.usdtNtt,
          manager: arbitrumSepoliaContracts.proxyHub,
          transceiver: [
            { type: "wormhole" as "wormhole", address: "PLACEHOLDER_USDT_TRANSCEIVER_ON_BASE_SEPOLIA" },
            // If USDT NTT to Solana is supported, add transceiver placeholder here
            // { type: "wormhole" as "wormhole", address: "PLACEHOLDER_USDT_TRANSCEIVER_ON_SOLANA" }
          ],
        },
        {
          chain: baseSepoliaContracts.chainNameWormhole as any,
          token: baseSepoliaContracts.usdtNtt,
          manager: baseSepoliaContracts.peridotSpokeProxy,
          transceiver: [
            { type: "wormhole" as "wormhole", address: "PLACEHOLDER_USDT_TRANSCEIVER_ON_ARBITRUM_SEPOLIA" },
            // If USDT NTT to Solana is supported, add transceiver placeholder here
            // { type: "wormhole" as "wormhole", address: "PLACEHOLDER_USDT_TRANSCEIVER_ON_SOLANA" }
          ],
        },
        // If you have USDT on Solana Testnet, add its configuration here similar to PRDT above:
        // {
        //   chain: solanaTestnetContracts.chainNameWormhole as any,
        //   token: solanaTestnetContracts.usdtSplTokenMint!, // Ensure this exists if uncommented
        //   manager: solanaTestnetContracts.usdtNttManagerPda!, // Ensure this exists if uncommented
        //   transceiver: [
        //     { type: "wormhole" as "wormhole", address: "PLACEHOLDER_USDT_TRANSCEIVER_ON_ARBITRUM_SEPOLIA_FROM_SOLANA" },
        //     { type: "wormhole" as "wormhole", address: "PLACEHOLDER_USDT_TRANSCEIVER_ON_BASE_SEPOLIA_FROM_SOLANA" }
        //   ],
        // }
      ]
    }
  };

  // Define the configuration options with proper types
  const config: Partial<WormholeConnectConfig> = {
    network: network,
    chains: ["Ethereum", "Solana", "Avalanche", "Polygon", "PolygonSepolia", "Arbitrum", "Optimism", "Base", "Gnosis", "ArbitrumSepolia", "BaseSepolia"],
    rpcs: {
      // Add RPC endpoints for better reliability
      Solana: solanaTestnetContracts.rpcUrl,
      ArbitrumSepolia: "https://sepolia-rollup.arbitrum.io/rpc",
      BaseSepolia: "https://sepolia.base.org",
    },
    tokensConfig: tokensConfig,
    routes: [
      ...nttRoutes(nttConfigForRoutes)
    ]
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