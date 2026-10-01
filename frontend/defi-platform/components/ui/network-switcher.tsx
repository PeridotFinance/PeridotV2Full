"use client"

import * as React from "react"
import { useState, useRef, useCallback } from "react"
import { ChevronDown, Check, AlertCircle } from "lucide-react"
import { useTheme } from "next-themes"
import { useAccount, useSwitchChain } from "wagmi"
import { usePathname } from "next/navigation"
import { networks as ENABLED_NETWORKS } from "@/config"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { HeaderPill } from "@/components/ui/header-pill"
import { useToast } from "@/hooks/use-toast"
import Image from "next/image"
import { clearPreMarginChain } from "@/lib/marginChainRestore"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { ROBINHOOD_CHAIN_ID, robinhoodMainnet } from "@/config/robinhood"
interface Network {
  id: string
  name: string
  symbol: string
  icon: string
  chainId: number
  wagmiChain: any // wagmi chain object
  // Non‑EVM / Soroban networks can opt out of wagmi behaviors
  isStellar?: boolean
  /** Second line in the list, in place of the symbol (e.g. the markets a chain offers). */
  tagline?: string
}

export type { Network }


const NETWORK_ICON_BY_ID: Record<string, string> = {
  monad: "/tokenimages/app/Monad-Logo.svg",
  bnb: "/tokenimages/app/bnb-logo.svg",
  arbitrum: "/tokenimages/app/arbitrum-logo.svg",
  base: "/tokenimages/app/base-logo.svg",
  eth: "/tokenimages/app/ethereum-eth-logo.svg",
  polygon: "/tokenimages/app/polygon-matic-logo.svg",
  avalanche: "/tokenimages/app/avax.png",
  somnia: "/tokenimages/app/somnia_logo_color.jpg", // Using proper Somnia logo
   "stellar-soroban-mainnet": "/tokenimages/app/stellar.svg",
  robinhood: "/tokenimages/robinhood/robinhood-chain.png",
}

const STELLAR_NETWORK_ID = "stellar-soroban-mainnet" as const

const NON_WAGMI_NETWORK_IDS = new Set<string>([STELLAR_NETWORK_ID])

export const ROBINHOOD_NETWORK_ID = "robinhood" as const

// Selections the wallet's chain must never overwrite. Stellar has no wagmi
// chain; Robinhood Chain is where the wallet goes to sign lending and margin
// steps, and following it back would move the user between surfaces.
const NO_AUTO_SYNC_NETWORK_IDS = new Set<string>([STELLAR_NETWORK_ID, ROBINHOOD_NETWORK_ID])

// Robinhood Chain is offered only by a caller that renders its markets (the
// Expert view), so it is kept out of the shared list below.
const ROBINHOOD_NETWORK: Network = {
  id: ROBINHOOD_NETWORK_ID,
  name: "Robinhood Chain",
  symbol: "Robinhood",
  icon: NETWORK_ICON_BY_ID[ROBINHOOD_NETWORK_ID],
  chainId: ROBINHOOD_CHAIN_ID,
  wagmiChain: robinhoodMainnet,
  tagline: "USDG · NVDA",
}

const HUB_NETWORKS = ['bnb', 'monad', 'somnia'] as const

const HUB_STYLES: Record<string, { base: string, hover: string, active: string, border: string, text: string, pillGlow: string }> = {
  bnb: {
    base: "from-yellow-500/5 via-transparent to-yellow-500/5",
    hover: "hover:from-yellow-400/20 hover:via-yellow-500/10 hover:to-yellow-600/20",
    active: "bg-yellow-500/10",
    border: "border-yellow-400/30",
    text: "text-yellow-600 dark:text-yellow-400",
    pillGlow: "bg-gradient-to-r from-yellow-400/20 via-yellow-500/10 to-yellow-600/20"
  },
  monad: {
    base: "from-purple-500/5 via-transparent to-purple-500/5",
    hover: "hover:from-purple-400/20 hover:via-purple-500/10 hover:to-purple-600/20",
    active: "bg-purple-500/10",
    border: "border-purple-400/30",
    text: "text-purple-600 dark:text-purple-400",
    pillGlow: "bg-gradient-to-r from-purple-400/20 via-purple-500/10 to-purple-600/20"
  },
  somnia: {
    base: "from-indigo-500/5 via-transparent to-indigo-500/5",
    hover: "hover:from-indigo-400/20 hover:via-indigo-500/10 hover:to-indigo-600/20",
    active: "bg-indigo-500/10",
    border: "border-indigo-400/30",
    text: "text-indigo-600 dark:text-indigo-400",
    pillGlow: "bg-gradient-to-r from-indigo-400/20 via-indigo-500/10 to-indigo-600/20"
  }
}


function idFromChainId(chainId: number): string | undefined {
  switch (chainId) {
    case 10143:
      return "monad"
    case 143:
      return "monad"
    case 97:
    case 56:
      return "bnb"
    case 1:
      return "eth"
    case 137:
      return "polygon"
    case 42161:
      return "arbitrum"
    case 421614:
      return "arbitrum"
    case 8453:
    case 84532:
      return "base"
    case 11155111:
      return "eth"
    case 43114:
      return "avalanche"
    case 50312:
      return "somnia"
    default:
      return undefined
  }
}

const networks: Network[] = ENABLED_NETWORKS
  .map((chain: any) => {
    const id = idFromChainId(chain.id)
    if (!id) return undefined
    const symbolById: Record<string, string> = {
      monad: "MON",
      somnia: "SOMI",
      bnb: "BNB",
      arbitrum: "ARB",
      base: "BASE",
      eth: "ETH",
      polygon: "MATIC",
      avalanche: "AVAX",
    }
    return {
      id,
      name: chain.name,
      symbol: symbolById[id],
      icon: NETWORK_ICON_BY_ID[id],
      chainId: chain.id,
      wagmiChain: chain,
      testnet: !!(chain as any).testnet,
    } as any
  })
  .filter(Boolean) as unknown as Network[]

// Append a non‑EVM Stellar Soroban entry so the UI can treat Stellar
// as a first‑class selectable network without going through wagmi.
networks.push({
  id: STELLAR_NETWORK_ID,
  name: "Stellar",
  symbol: "XLM",
  icon: NETWORK_ICON_BY_ID[STELLAR_NETWORK_ID],
  // Sentinel chainId (never used for wagmi; guarded by isStellar flag)
  chainId: 0,
  wagmiChain: null,
  isStellar: true,
} as any)

// Sort networks to prioritize Hubs: BNB -> Monad -> Somnia -> Others
networks.sort((a, b) => {
  const priority = ['bnb', 'monad', 'somnia']
  const aIndex = priority.indexOf(a.id)
  const bIndex = priority.indexOf(b.id)
  
  if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
  if (aIndex !== -1) return -1
  if (bIndex !== -1) return 1
  return 0
})

// Curated display names to ensure consistent casing and branding
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  bnb: 'BNB',
  eth: 'Ethereum',
  arbitrum: 'Arbitrum',
  base: 'Base',
  monad: 'Monad',
  polygon: 'Polygon',
  avalanche: 'Avalanche',
  Somnia: 'Somnia',
  [STELLAR_NETWORK_ID]: 'Stellar',
  [ROBINHOOD_NETWORK_ID]: 'Robinhood Chain',
}

function getDisplayName(n: Network): string {
  return DISPLAY_NAME_OVERRIDES[n.id] || n.name
}

interface NetworkSwitcherProps {
  selectedNetworkId: string
  setSelectedNetworkId: (networkId: string) => void
  className?: string
  /** Offer Robinhood Chain (lending markets). Only for callers that render them. */
  includeRobinhood?: boolean
  /** Show only these network ids (e.g. Stellar + Robinhood on the Stellar-only host). */
  onlyNetworkIds?: string[]
}

export function NetworkSwitcher({
  selectedNetworkId,
  setSelectedNetworkId,
  className,
  includeRobinhood = false,
  onlyNetworkIds,
}: NetworkSwitcherProps) {
  // Every network this switcher knows about, and the subset it lists.
  const knownNetworks = React.useMemo(
    () => (includeRobinhood ? [...networks, ROBINHOOD_NETWORK] : networks),
    [includeRobinhood],
  )
  const listedNetworks = React.useMemo(
    () => (onlyNetworkIds ? knownNetworks.filter((n) => onlyNetworkIds.includes(n.id)) : knownNetworks),
    [knownNetworks, onlyNetworkIds],
  )
  const { theme, resolvedTheme } = useTheme()
  const effectiveTheme = resolvedTheme || theme || "dark"
  const { toast } = useToast()
  const [isMounted, setIsMounted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const listScrollRef = useRef<HTMLDivElement>(null)

  const checkScrollIndicators = useCallback(() => {
    const el = listScrollRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    setCanScrollUp(scrollTop > 4)
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 4)
  }, [])

  React.useEffect(() => {
    if (!menuOpen) {
      setCanScrollUp(false)
      setCanScrollDown(false)
      return
    }
    const t = setTimeout(checkScrollIndicators, 80)
    return () => clearTimeout(t)
  }, [menuOpen, listedNetworks.length, checkScrollIndicators])

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  const { chain, isConnected } = useAccount()
  const { isConnected: stellarConnected } = useStellarWallet()
  const { switchChain, isPending } = useSwitchChain()
  const pathname = usePathname()
  const isMarginPage = pathname?.startsWith('/app/margin') ?? false

  // The explicit selection (selectedNetworkId) is the single source of truth for
  // what the picker shows as active. In a Privy multi‑VM session the wagmi
  // connector chain is NOT a reliable indicator of "where the user is": the
  // embedded EVM/smart account defaults to BSC (chainId 56) even while the user
  // is on Stellar, so letting it drive the display made the picker mark BSC as
  // active over the user's real Stellar selection. The wagmi chain is still used
  // purely to *sync* selectedNetworkId for EVM wallets (effect below) — it never
  // overrides the displayed selection.
  const currentNetwork = selectedNetworkId

  // Fail-safe: Ensure selectedNetworkId is always valid
  // If the app loads with an invalid/stale network ID (not in the list), auto-select the first valid one.
  React.useEffect(() => {
    const isValid = knownNetworks.some(n => n.id === selectedNetworkId)
    if (!isValid && listedNetworks.length > 0) {
      const defaultNetwork = listedNetworks[0]
      console.warn(`NetworkSwitcher - Invalid network ID '${selectedNetworkId}' detected. Auto-switching to '${defaultNetwork.id}'`)
      setSelectedNetworkId(defaultNetwork.id)
    }
  }, [selectedNetworkId, setSelectedNetworkId, knownNetworks, listedNetworks])

  // Update context when wallet connects to a different network (avoid setState during render)
  React.useEffect(() => {
    // Do not override explicit selection for non‑wagmi networks like Stellar,
    // nor for Robinhood Chain (see NO_AUTO_SYNC_NETWORK_IDS).
    if (NO_AUTO_SYNC_NETWORK_IDS.has(selectedNetworkId)) return

    if (!chain) return
    const networkData = networks.find(network => network.chainId === chain.id)
    if (!networkData?.id || networkData.id === selectedNetworkId) return

    // 'somnia' is a margin-only chain.  Outside the margin page the wallet can
    // end up on Somnia as a side-effect of margin trading.  Do NOT auto-sync
    // selectedNetworkId to 'somnia' in that case it would cause the /app page
    // to show Somnia markets (0 APY) and apply the purple theme, even though the
    // user's selected network is still BNB/Monad/etc.
    // The useRestorePreMarginChain hook handles switching the wallet back.
    if (networkData.id === 'somnia' && !isMarginPage) return

    setSelectedNetworkId(networkData.id)
  }, [chain, selectedNetworkId, setSelectedNetworkId, isMarginPage])

  // Debug logging for network detection
  React.useEffect(() => {
    if (chain) {
      console.log('NetworkSwitcher - Chain changed:', {
        chainId: chain.id,
        chainName: chain.name,
        detectedNetwork: networks.find(network => network.chainId === chain.id)?.name || 'Unknown',
        currentNetwork,
        selectedNetworkId
      })
    }
  }, [chain, currentNetwork, selectedNetworkId])

  const selectedNetworkData = knownNetworks.find(network => network.id === currentNetwork) || listedNetworks[0] || networks[0]
  const currentHubStyle = HUB_STYLES[selectedNetworkData.id]

  // Attempt to auto-switch from unsupported networks; notify on failure
  const attemptedUnsupportedChainRef = React.useRef<number | null>(null)

  // Reset the one-shot guard on every route change.  The NetworkSwitcher lives in
  // the layout and never remounts, so without this reset the guard would permanently
  // block retries after a single failed switch attempt in a session.
  React.useEffect(() => {
    attemptedUnsupportedChainRef.current = null
  }, [pathname])

  React.useEffect(() => {
    if (!isConnected || !chain?.id || isPending) return
    // Robinhood Chain is where lending and margin steps sign; switching the
    // wallet away from it here would pull it out from under a running flow.
    const isSupported = networks.some(n => n.chainId === chain.id) || chain.id === ROBINHOOD_CHAIN_ID
    if (isSupported) return
    if (attemptedUnsupportedChainRef.current === chain.id) return
    attemptedUnsupportedChainRef.current = chain.id

    const target = knownNetworks.find(n => n.id === selectedNetworkId) || networks[0]
    // A wallet cannot be switched to Stellar (no wagmi chain); asking would
    // only fail and raise an error toast about a network nobody is using.
    if (target.isStellar || !target.chainId) return

    const timer = setTimeout(async () => {
      try {
        await switchChain({ chainId: target.chainId })
        setSelectedNetworkId(target.id)
        toast({
          title: "Network switched",
          description: `Switched to ${target.name} for app compatibility.`,
        })
      } catch (error) {
        toast({
          title: "Unsupported network detected",
          description: `Your wallet is on an unsupported network. Please switch to ${target.name} to continue.`,
          variant: "destructive",
        })
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [isConnected, chain?.id, selectedNetworkId, isPending, switchChain, setSelectedNetworkId, toast, knownNetworks])

  const handleNetworkChange = async (network: Network) => {
    await executeNetworkChange(network)
  }

  const executeNetworkChange = async (network: Network) => {
    // User is making an explicit selection cancel any pending margin-exit restoration
    // so we don't override their choice.
    clearPreMarginChain()

    // Soroban / Stellar network: do not call wagmi.switchChain.
    if (network.isStellar || !network.chainId) {
      setSelectedNetworkId(network.id)
      toast({
        title: "Stellar selected",
        description: "Showing the Stellar markets. Use your Stellar wallet in the header to interact.",
      })
      return
    }

    // Robinhood Chain: selecting it only changes the markets shown. The
    // wallet moves to the chain when a transaction there is signed, so a
    // declined switch prompt never blocks browsing.
    if (network.id === ROBINHOOD_NETWORK_ID) {
      setSelectedNetworkId(network.id)
      return
    }

    if (!isConnected) {
      // Update context network selection for non-connected users
      setSelectedNetworkId(network.id)
      toast({
        title: "Network selected",
        description: `Switched to ${network.name} for data display. Connect wallet to interact.`,
      })
      return
    }

    if (chain?.id === network.chainId) {
      // The wallet connector is already on this chain, but the explicit selection
      // may differ (e.g. switching back from Stellar to BSC, where the embedded
      // EVM account already sits on BSC). Update the selection so the picker
      // reflects the choice instead of silently no‑op'ing.
      setSelectedNetworkId(network.id)
      return
    }

    try {
      console.log(`Attempting to switch to ${network.name} (Chain ID: ${network.chainId})`)
      await switchChain({ chainId: network.chainId })
      setSelectedNetworkId(network.id) // Update context
      toast({
        title: "Network switched",
        description: `Successfully switched to ${network.name}.`,
      })
    } catch (error) {
      console.error('Network switch failed:', error)
      console.error('Error details:', {
        targetNetwork: network.name,
        targetChainId: network.chainId,
        currentChain: chain?.id,
        error: error
      })
      toast({
        title: "Network switch failed",
        description: `Failed to switch to ${network.name}. Please try again.`,
        variant: "destructive",
      })
    }
  }

  // Avoid any rendering until mounted to reduce early effects/logs
  if (!isMounted) return null

  return (
    <>
      <DropdownMenu modal={false} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <HeaderPill
          variant="network"
          disabled={isPending}
          isPending={isPending}
          className={className}
          glowClassName={currentHubStyle?.pillGlow}
          data-testid="network-switcher"
        >
          {/* Network icon */}
          {isPending ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
          ) : (
            <div className="relative">
              <Image
                src={selectedNetworkData.icon}
                alt={selectedNetworkData.name}
                width={16}
                height={16}
                className="rounded-full flex-shrink-0"
                onError={(e) => {
                  console.warn(`Failed to load network icon: ${selectedNetworkData.icon}`)
                  // Hide the image on error
                  e.currentTarget.style.display = 'none'
                }}
                unoptimized={true}
                priority={true}
              />
              {/* Connection status indicator */}
              {isConnected && chain?.id === selectedNetworkData.chainId && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 border border-background rounded-full" />
              )}
            </div>
          )}
          
          {/* Network name - responsive display */}
          <span className="text-xs font-semibold whitespace-nowrap">
            {isPending ? (
              <span className="hidden sm:inline">Switching...</span>
            ) : (
              <>
                <span className="hidden sm:inline">{getDisplayName(selectedNetworkData)}</span>
                <span className="sm:hidden">{selectedNetworkData.symbol}</span>
              </>
            )}
          </span>
          
          <ChevronDown className={cn(
            "h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180",
            isPending && "animate-pulse"
          )} />
        </HeaderPill>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent
        align="center"
        side="bottom"
        sideOffset={12}
        collisionPadding={20}
        avoidCollisions={true}
        style={{ maxHeight: "min(70vh, var(--radix-dropdown-menu-content-available-height, 420px))" }}
        className={cn(
          "flex flex-col sm:w-64",
          "w-[calc(100vw-2rem)] max-w-none",
          "p-2 mt-1 sm:mt-2 overflow-hidden",
          "backdrop-blur-xl border border-white/20 shadow-2xl",
          "bg-gradient-to-br",
          isMounted && effectiveTheme === "light"
            ? "from-white/80 via-white/60 to-white/40 shadow-green-500/20"
            : "from-black/60 via-black/40 to-black/20 shadow-green-500/30"
        )}
      >
        <div className="flex flex-col w-full">
          {/* External  slink to Testnet app - On mobile we make it part of the flow if needed, 
              but for now keeping it as a header or first item */}

          <div className="my-1 -mx-2 h-px bg-white/20 sm:block hidden" />

          {/* Network list: scrollable with fade indicators on desktop */}
          <div className="relative flex-1 min-h-0 sm:min-h-[120px]">
            {/* Top scroll indicator - desktop vertical scroll */}
            {canScrollUp && (
              <div
                className={cn(
                  "absolute top-0 left-1 right-1 h-5 z-10 pointer-events-none rounded-t-lg transition-opacity",
                  "sm:block hidden",
                  effectiveTheme === "light"
                    ? "bg-gradient-to-b from-white via-white/80 to-transparent"
                    : "bg-gradient-to-b from-black/90 via-black/70 to-transparent"
                )}
              />
            )}
            {/* Bottom scroll indicator */}
            {canScrollDown && (
              <div
                className={cn(
                  "absolute bottom-0 left-1 right-1 h-5 z-10 pointer-events-none rounded-b-lg transition-opacity",
                  "sm:block hidden",
                  effectiveTheme === "light"
                    ? "bg-gradient-to-t from-white via-white/80 to-transparent"
                    : "bg-gradient-to-t from-black/90 via-black/70 to-transparent"
                )}
              />
            )}
            <div
              ref={listScrollRef}
              onScroll={checkScrollIndicators}
              className={cn(
                "flex gap-2 pr-1 sm:custom-scrollbar",
                "sm:flex-col sm:max-h-[min(300px,50vh)] sm:overflow-y-auto sm:overflow-x-hidden",
                "flex-row overflow-x-auto overflow-y-hidden pb-1 scrollbar-hide snap-x snap-mandatory"
              )}
            >
            {listedNetworks.map((network) => {
              const isCurrentNetwork = currentNetwork === network.id
              // Stellar is a non‑wagmi network (chainId 0), so the wagmi chain
              // check never matches it — use the Stellar wallet connection so the
              // Stellar row reflects "Connected" too, instead of BNB being the
              // only entry that ever shows as connected in a multi‑VM session.
              const isConnectedToThisNetwork = network.isStellar
                ? stellarConnected
                : (isConnected && chain?.id === network.chainId)
              const hubStyle = HUB_STYLES[network.id]
              
              return (
                <DropdownMenuItem
                  key={network.id}
                  onClick={() => handleNetworkChange(network)}
                  // Disable only the network that is *currently selected* (re-selecting
                  // is a no-op). Do NOT disable based on wallet connection: in a Privy
                  // multi-VM session both the embedded EVM and Stellar wallets report as
                  // connected, which previously locked those rows ("Connected" + greyed
                  // out) so the user could never switch the displayed markets — most
                  // visibly leaving Stellar un-selectable while it showed as connected.
                  disabled={isPending || isCurrentNetwork}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-300 ease-out",
                    "snap-center shrink-0", // Snap behavior for mobile
                    "min-w-[140px] sm:min-w-0", // Fixed width on mobile for better swiping
                    
                    // Base styles
                    hubStyle ? [
                       "bg-gradient-to-r",
                       hubStyle.base,
                       hubStyle.hover
                    ] : "hover:bg-gradient-to-r hover:from-green-400/20 hover:via-green-500/10 hover:to-green-600/20",
                    
                    // Active/Selected state
                    isCurrentNetwork && (
                      hubStyle 
                        ? [hubStyle.active, "border", hubStyle.border]
                        : "bg-green-500/10 border border-green-400/30"
                    ),
                    
                    // Connected state
                    isConnectedToThisNetwork && (
                      hubStyle
                        ? [hubStyle.active, "border", hubStyle.border]
                        : "bg-green-500/20 border border-green-400/50"
                    ),
                    
                    isPending && "opacity-50 cursor-not-allowed",
                    "disabled:hover:bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  <div className="relative">
                    <Image
                      src={network.icon}
                      alt={network.name}
                      width={20}
                      height={20}
                      className="rounded-full flex-shrink-0"
                      onError={(e) => {
                        console.warn(`Failed to load network icon: ${network.icon}`)
                        e.currentTarget.style.display = 'none'
                      }}
                      unoptimized={true}
                      priority={true}
                    />
                    {isConnectedToThisNetwork && (
                      <div className={cn(
                        "absolute -top-1 -right-1 w-2 h-2 border border-background rounded-full",
                        hubStyle ? "bg-current" : "bg-green-400"
                      )} />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className={cn("text-sm font-medium", hubStyle && isCurrentNetwork && hubStyle.text)}>
                      {(network as any).testnet ? `${getDisplayName(network)} Testnet` : getDisplayName(network)}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {network.tagline ?? network.symbol}
                      {isConnectedToThisNetwork && " • Connected"}
                    </div>
                  </div>
                  
                  {isConnectedToThisNetwork && (
                    <Check className={cn(
                      "h-4 w-4 flex-shrink-0",
                      hubStyle ? hubStyle.text : "text-green-500"
                    )} />
                  )}
                </DropdownMenuItem>
              )
            })}
            </div>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  )
} 