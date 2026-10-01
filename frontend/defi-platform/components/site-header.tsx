"use client"

import { useState, useEffect, useRef, Component, type ReactNode } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useReducedMotion } from "@/lib/use-reduced-motion"
import { Menu, X, RefreshCw } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { useTheme } from "next-themes"
import { CSSProperties } from "react"
import dynamic from "next/dynamic"

// Minimal error boundary — swallows crashes in header sub-components so a
// single failure (LevelPill API error, wallet SDK crash, etc.) cannot take
// down the entire header or make nav links unclickable.
class HeaderItemBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() {
    if (this.state.error) return this.props.fallback ?? null
    return this.props.children
  }
}

// Lazy-load the heavy wallet connect button to avoid blocking header paint
const ConnectWalletButtonLazy = dynamic(
  () => import("./wallet/connect-wallet-button").then(m => m.ConnectWalletButton),
  {
    ssr: false,
    loading: () => <div className="h-9 w-28 rounded-md bg-foreground/10 animate-pulse pointer-events-none" />
  }
)
import { useNetworkContext } from "@/context"
import { useChainTheme } from "@/components/providers/ChainThemeProvider"
import { defaultTheme } from "@/config/chain-themes"
import { useAccount } from "wagmi"
import { SoundToggle } from "@/components/sound-toggle"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { ViewModeToggle } from "@/components/app/ViewModeToggle"
import { useViewMode } from "@/context/view-mode"
import { WalletManagementDialog } from "@/components/ui/WalletManagementDialog"
import { ChallengeHeaderPill } from "@/components/challenge/ChallengeHeaderPill"

const LevelPill = dynamic(
  () => import("@/components/leaderboard/LevelPill"),
  {
    ssr: false,
    loading: () => (
      <div className="inline-flex items-center px-3 py-1.5 h-8 w-32 rounded-full border border-white/10 bg-foreground/10 animate-pulse pointer-events-none" />
    )
  }
)

// Helper function to check if click is within a Radix dropdown menu
// This prevents the mobile menu from closing when interacting with dropdowns
// that are rendered in portals (outside the header DOM tree)
const isClickInRadixDropdown = (target: Node | null): boolean => {
  if (!target) return false
  const element = target as HTMLElement
  // Check if the click target or any of its ancestors is a Radix dropdown menu
  // Radix UI dropdown menus have role="menu" attribute
  return !!element.closest('[role="menu"]')
}

export function SiteHeader({ initialPathname }: { initialPathname?: string | null }) {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const { isLowPerfDevice } = useReducedMotion()
  const { theme, resolvedTheme } = useTheme()
  const { isConnected } = useAccount()
  const { currentChainTheme, isChainThemeActive } = useChainTheme()
  const isDarkMode = (resolvedTheme || theme) === "dark"
  const pathname = usePathname()
  // Use the prop if available, otherwise fall back to hook. Normalize a trailing
  // slash so every route check below matches on both `/app` and `/app/` (Next
  // serves both and usePathname returns them verbatim). Root "/" is preserved.
  const rawPathname = initialPathname ?? pathname
  const currentPathname =
    rawPathname && rawPathname !== "/" ? rawPathname.replace(/\/+$/, "") : rawPathname
  const { isWalletManagementOpen, setWalletManagementOpen } = useNetworkContext()
  // Borrow is an Easy-mode concept: Expert users borrow per-market inside the
  // markets table, so the Borrow tab only renders in Easy mode and the Earn
  // tab relabels to "Markets" for Expert. The toggle itself shows on both
  // mode-aware routes (`/app` and `/app/borrow`).
  const { mode: viewMode } = useViewMode()
  const isAppRoute = currentPathname === "/app" || currentPathname?.startsWith("/app/")
  // The challenge pill lives only where the challenge does.
  const isMarginRoute = currentPathname?.startsWith("/app/margin") ?? false
  const showViewModeToggle =
    currentPathname === "/app" || currentPathname === "/app/borrow"
  const isBridgePage = currentPathname === "/app/bridge"
  // Routes that render the B/W fintech aesthetic on a flat, theme-aware
  // canvas (`bg-background text-foreground`). On these pages the floating-pill
  // header reads as a separate elevated surface — visually noisy against the
  // flat page below. We render flat: no margin top, full width, no hairline,
  // a translucent `bg-background` strip that follows light/dark so it blends
  // into the page surface in either theme.
  const isBwFlatRoute =
    currentPathname === "/app/leaderboard" ||
    currentPathname === "/app/stats"

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10)
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Add click outside effect to close mobile menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      
      // Don't close if click is within a Radix dropdown menu (e.g., NetworkSwitcher)
      if (isClickInRadixDropdown(target)) {
        return
      }
      
      if (headerRef.current && !headerRef.current.contains(target)) {
        setIsMenuOpen(false)
      }
    }

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMenuOpen])

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const handleRefresh = () => {
    window.dispatchEvent(new CustomEvent('custom:refresh'));
  };


  const peridotPrimary = isDarkMode ? defaultTheme.darkColors.primary : defaultTheme.colors.primary;
  const activeChainPrimary = isDarkMode ? currentChainTheme.darkColors.primary : currentChainTheme.colors.primary;

  const logoTextStyle: CSSProperties = isConnected
    ? {
        backgroundImage: `linear-gradient(to right, hsl(${peridotPrimary}), hsl(${activeChainPrimary}))`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }
    : {
        color: `hsl(${peridotPrimary})`,
      };

  // Shadow style based on theme
  const headerStyle: CSSProperties = isDarkMode ? {
    WebkitTransform: 'translateZ(0)',
    WebkitBackfaceVisibility: 'hidden',
    boxShadow: `
      0 8px 32px -4px rgba(0, 0, 0, 0.4), 
      0 4px 16px -2px rgba(0, 0, 0, 0.2),
      0 0 8px 2px rgba(var(--primary-rgb), 0.15),
      inset 0 1px 2px rgba(255, 255, 255, 0.1),
      inset 0 -2px 8px rgba(0, 0, 0, 0.4)
    `,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'linear-gradient(to bottom, rgba(10, 10, 10, 0.3), rgba(25, 25, 25, 0.3))',
    backdropFilter: 'blur(12px)'
  } : {
    WebkitTransform: 'translateZ(0)',
    WebkitBackfaceVisibility: 'hidden',
    boxShadow: '0 8px 32px -4px rgba(0, 0, 0, 0.1), 0 4px 16px -2px rgba(0, 0, 0, 0.06)',
  };

  const mobileMenuStyle: CSSProperties = isDarkMode ? {
    boxShadow: `
      0 8px 32px -4px rgba(0, 0, 0, 0.3), 
      0 4px 16px -2px rgba(0, 0, 0, 0.2),
      inset 0 1px 2px rgba(255, 255, 255, 0.1),
      inset 0 -2px 8px rgba(0, 0, 0, 0.4)
    `,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'linear-gradient(to bottom, rgba(10, 10, 10, 0.3), rgba(25, 25, 25, 0.3))',
    backdropFilter: 'blur(12px)'
  } : {
    boxShadow: '0 8px 32px -4px rgba(0, 0, 0, 0.1), 0 4px 16px -2px rgba(0, 0, 0, 0.06)',
  };

  // App navigation primary links (Earn, Borrow, Portfolio, Swap)
  const renderAppPrimaryLinks = () => (
    <>
      <Link
        href="/app"
        className={`transition-colors ${
          currentPathname === "/app"
            ? "text-primary font-medium"
            : "text-text/80 hover:text-primary"
        }`}
      >
        {viewMode === "easy" ? "Earn" : "Lending Markets"}
      </Link>
      {viewMode === "easy" && (
        <Link
          href="/app/borrow"
          className={`transition-colors ${
            currentPathname === "/app/borrow"
              ? "text-primary font-medium"
              : "text-text/80 hover:text-primary"
          }`}
        >
          Borrow
        </Link>
      )}
      <Link
        href="/app/margin"
        className={`transition-colors ${
          currentPathname?.startsWith("/app/margin")
            ? "text-primary font-medium"
            : "text-text/80 hover:text-primary"
        }`}
      >
        Margin
      </Link>
      <Link
        href="/app/portfolio"
        className={`transition-colors ${
          currentPathname === "/app/portfolio"
            ? "text-primary font-medium"
            : "text-text/80 hover:text-primary"
        }`}
      >
        Portfolio
      </Link>
      <Link 
        href="/app/bridge" 
        className={`transition-colors ${
          currentPathname === "/app/bridge" 
            ? "text-primary font-medium" 
            : "text-text/80 hover:text-primary"
        }`}
      >
        Swap
      </Link>
    </>
  )

  // App navigation secondary links (Stats + view-mode toggle)
  const renderAppSecondaryLinks = () => (
    <>
      <Link
        href="/app/stats"
        prefetch={true}
        className={`transition-colors flex items-center gap-2 ${
          currentPathname === "/app/stats"
            ? "text-primary font-medium"
            : "text-text/80 hover:text-primary"
        }`}
      >
        Stats
      </Link>
      {showViewModeToggle && <ViewModeToggle />}
    </>
  )

  // Standard navigation links (non-app routes)
  const renderStandardNavLinks = () => (
    <>
      <Link 
        href="/app" 
        className="text-text/80 hover:text-primary transition-colors"
      >
        App
      </Link>
      <Link href="/how-it-works" className="text-text/80 hover:text-primary transition-colors">
        How It Works
      </Link>

      <Link href="/blog" className="text-text/80 hover:text-primary transition-colors">
        Blog
      </Link>
    </>
  )

  // App mobile navigation vs standard mobile navigation
  const renderMobileNavLinks = () => {
    if (isAppRoute) {
      return (
        <>
          {/* Primary navigation group. A wrapping row: on the narrowest
              phones five pills do not fit one line, and the last one used
              to run out of the menu instead of dropping down. */}
          <div className="flex flex-wrap gap-1">
            <Link
              href="/app"
              data-testid="nav-app"
              className={`transition-colors py-2 px-3 rounded-lg whitespace-nowrap hover:bg-background/50 ${
                currentPathname === "/app"
                  ? "text-primary font-medium bg-primary/10"
                  : "text-text/80 hover:text-primary"
              }`}
              onClick={() => setIsMenuOpen(false)}
            >
              {viewMode === "easy" ? "Earn" : "Lending Markets"}
            </Link>

            {viewMode === "easy" && (
              <Link
                href="/app/borrow"
                data-testid="nav-borrow"
                className={`transition-colors py-2 px-3 rounded-lg whitespace-nowrap hover:bg-background/50 ${
                  currentPathname === "/app/borrow"
                    ? "text-primary font-medium bg-primary/10"
                    : "text-text/80 hover:text-primary"
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                Borrow
              </Link>
            )}

            <Link
              href="/app/margin"
              data-testid="nav-margin"
              className={`transition-colors py-2 px-3 rounded-lg whitespace-nowrap hover:bg-background/50 ${
                currentPathname?.startsWith("/app/margin")
                  ? "text-primary font-medium bg-primary/10"
                  : "text-text/80 hover:text-primary"
              }`}
              onClick={() => setIsMenuOpen(false)}
            >
              Margin
            </Link>

            <Link
              href="/app/portfolio"
              data-testid="nav-portfolio"
              className={`transition-colors py-2 px-3 rounded-lg whitespace-nowrap hover:bg-background/50 ${
                currentPathname === "/app/portfolio"
                  ? "text-primary font-medium bg-primary/10"
                  : "text-text/80 hover:text-primary"
              }`}
              onClick={() => setIsMenuOpen(false)}
            >
              Portfolio
            </Link>

            <Link
              href="/app/bridge"
              className={`transition-colors py-2 px-3 rounded-lg whitespace-nowrap hover:bg-background/50 ${
                currentPathname === "/app/bridge" 
                  ? "text-primary font-medium bg-primary/10" 
                  : "text-text/80 hover:text-primary"
              }`}
              onClick={() => setIsMenuOpen(false)}
            >
              Swap
            </Link>
          </div>

          {/* Visual separator */}
          <div className="border-t border-border/40 my-2" />

          {/* Secondary navigation group */}
          <div className="space-y-2">
            <Link
              href="/app/howto"
              className={`transition-colors py-2 px-3 rounded-lg hover:bg-background/50 ${
                currentPathname === "/app/how-it-works"
                  ? "text-primary font-medium bg-primary/10"
                  : "text-text/80 hover:text-primary"
              }`}
              onClick={() => setIsMenuOpen(false)}
            >
              How To
            </Link>
            <Link
              href="/app/stats"
              prefetch={true}
              className={`transition-colors flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-background/50 ${
                currentPathname === "/app/stats"
                  ? "text-primary font-medium"
                  : "text-text/80 hover:text-primary"
              }`}
            >
              Stats
            </Link>
            {showViewModeToggle && (
              <div className="py-2 px-3" data-testid="nav-view-mode">
                <ViewModeToggle />
              </div>
            )}
          </div>
        </>
      )
    } else {
      return (
        <>
          <Link 
            href="/app" 
            className="text-text/80 hover:text-primary transition-colors py-2 px-3 rounded-lg hover:bg-background/50"
            onClick={() => setIsMenuOpen(false)}
          >
            App
          </Link>
          <Link
            href="/how-it-works"
            className="text-text/80 hover:text-primary transition-colors py-2 px-3 rounded-lg hover:bg-background/50"
            onClick={() => setIsMenuOpen(false)}
          >
            How It Works
          </Link>
          <Link
            href="/blog"
            className="text-text/80 hover:text-primary transition-colors py-2 px-3 rounded-lg hover:bg-background/50"
            onClick={() => setIsMenuOpen(false)}
          >
            Blog
          </Link>
        </>
      )
    }
  }

  return (
    <>
    <header
      ref={headerRef}
      className={`fixed top-0 z-[100] transition-all duration-300
        ${isBwFlatRoute
          // Flush header for the B/W routes. No border, no hairline —
          // the header background is slightly translucent over a
          // backdrop blur so it blends seamlessly into the page surface
          // when the user scrolls content beneath it. The page itself
          // is `bg-background`, so above the fold this reads as one
          // continuous surface in both light and dark; once the user
          // scrolls, content fades softly under the frosted strip
          // rather than meeting a hard line.
          ? 'w-full max-w-full left-0 right-0 mt-0 rounded-none ' +
            'bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70'
          // Default: floating pill for the rest of the app.
          : 'max-w-[96%] w-[96%] mx-auto left-[2%] right-[2%] mt-2 min-[1191px]:mt-3 lg:mt-4 ' +
            'rounded-xl min-[1191px]:rounded-2xl ' +
            (isScrolled
              ? isDarkMode
                ? 'bg-transparent backdrop-blur-md'
                : 'bg-background/85 backdrop-blur-md'
              : isDarkMode
                ? 'bg-transparent backdrop-blur-md'
                : 'bg-background/70 backdrop-blur-md')
        }
        ${!isLowPerfDevice && !isBwFlatRoute ? 'header-entrance' : ''}
        ${isMenuOpen ? 'mobile-menu-open' : ''}
        site-header-anchor`}
      style={isBwFlatRoute ? undefined : headerStyle}
      suppressHydrationWarning={true}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 min-[1191px]:h-20">
          <div className={`flex items-center ${!isLowPerfDevice ? 'logo-float' : ''} pb-3`}>
            <Link href="/" className="flex items-end space-x-2">
              <div className="relative w-8 h-8 min-[1191px]:w-10 min-[1191px]:h-10">
                <Image src="/Peridot-Icon-Only-Mint-Green.svg" alt="Peridot Logo" width={40} height={40} className="object-contain" />
              </div>
              <div className="flex flex-col translate-y-[10px] min-[1191px]:translate-y-[10px] translate-x-[-5px]">
                <span className="font-bold text-xl leading-tight" >
                  Peri<span className="relative inline-block">
                  </span>dot
                </span>
                <span className="text-xs font-normal text-text/60 dark:text-text/50 uppercase tracking-wide leading-tight mt-0.5">
                  FINANCE
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden min-[1191px]:flex items-center flex-1 text-sm">
            {isAppRoute ? (
              <>
                {/* Primary navigation group - with left margin to keep original position */}
                <div className="flex items-center space-x-6 mx-auto">
                  {renderAppPrimaryLinks()}
                </div>
                {/* Secondary navigation group - pushed to the right */}
                <div className="flex items-center space-x-6 ml-auto">
                  {/* Visual separator */}
                  <div className="h-6 w-px bg-border/40 mx-4" />
                  {renderAppSecondaryLinks()}
                  <div className="h-6 w-px bg-border/40 mx-4" />
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-6">
                {renderStandardNavLinks()}
              </div>
            )}
          </nav>

          {/* Desktop Controls */}
          <div className="hidden min-[1191px]:flex items-center gap-2">
            {isMarginRoute && (
              <HeaderItemBoundary>
                {/* Trading-challenge pill — appears once the margin page's promo
                    banner is dismissed (it "flies" up here and docks). Also hosts
                    the invisible anchor that fly-out animation aims for. Margin
                    routes only (incl. /app/margin/challenge) — elsewhere in the
                    app it read as unexplained header clutter. */}
                <ChallengeHeaderPill />
              </HeaderItemBoundary>
            )}
            {isAppRoute && FEATURE_FLAGS.HEADER_LEVEL_PILL && (
              <HeaderItemBoundary>
                <LevelPill />
              </HeaderItemBoundary>
            )}
            <HeaderItemBoundary fallback={<div className="h-9 w-28 rounded-md bg-foreground/10" />}>
              <ConnectWalletButtonLazy id="tour-step-0-wallet-connect" />
            </HeaderItemBoundary>
            <SoundToggle />
            <ThemeToggle />
          </div>

          {/* Mobile Menu Button */}
          <div className="min-[1191px]:hidden flex items-center">
            {isMarginRoute && (
              <HeaderItemBoundary>
                {/* Icon-only challenge pill (the desktop instance owns the anchor). */}
                <ChallengeHeaderPill withAnchor={false} compact className="mr-2" />
              </HeaderItemBoundary>
            )}
            <HeaderItemBoundary fallback={<div className="h-9 w-28 rounded-md bg-foreground/10 mr-2" />}>
              {/* On very small phones (≤360px) the wallet pill's fixed
                  min-w-[8rem] floor squeezes the logo column enough that the
                  "Peridot" wordmark wraps. Only there, let the pill size to its
                  (short) label and trim padding so the logo keeps one line.
                  No effect at any width above 360px. */}
              <ConnectWalletButtonLazy className="mr-2 max-[360px]:[&_button]:min-w-0 max-[360px]:[&_button]:px-2.5" />
            </HeaderItemBoundary>
            <Button variant="ghost" size="icon" onClick={toggleMenu} className="ml-2 hamburger-button" data-testid="header-menu">
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div
          className={`min-[1191px]:hidden backdrop-blur-md rounded-xl mx-1 mt-1 bg-background/95 dark:bg-background/90 dark:border dark:border-white/10 p-4 ${!isLowPerfDevice ? 'mobile-menu-enter' : ''}`}
          style={mobileMenuStyle}
        >
          <div className="flex flex-col">
            {renderMobileNavLinks()}

                <div className="border-t border-white/10 mt-6 pt-6">
              <div className="space-y-4">
                <div className="w-full flex items-center gap-2">
                  <SoundToggle />
                  <ThemeToggle />
                  {isAppRoute && (
                    <Button variant="ghost" size="icon" onClick={handleRefresh} className="rounded-full bg-background/70">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  {isAppRoute && FEATURE_FLAGS.HEADER_LEVEL_PILL && (
                    <div className="grow flex justify-start">
                      <HeaderItemBoundary>
                        <LevelPill />
                      </HeaderItemBoundary>
                    </div>
                  )}
                  {isAppRoute && (
                    <div className="grow flex justify-end">
                      <HeaderItemBoundary>
                        <ConnectWalletButtonLazy />
                      </HeaderItemBoundary>
                    </div>
                  )}

                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </header>

      {/* Wallet Management Dialog — rendered outside <header> so its full-screen
          backdrop portal cannot interfere with the header stacking context or
          accidentally swallow pointer events on nav links. */}
      <WalletManagementDialog
        open={isWalletManagementOpen}
        onOpenChange={setWalletManagementOpen}
      />
    </>
  )
}
