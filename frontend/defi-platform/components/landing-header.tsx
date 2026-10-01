"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { useReducedMotion } from "@/lib/use-reduced-motion"
import { Menu, X, ArrowRight } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { useTheme } from "next-themes"
import { CSSProperties } from "react"
import { defaultTheme } from "@/config/chain-themes"
import { SoundToggle } from "@/components/sound-toggle"
import { usePathname } from "next/navigation"
import dynamic from "next/dynamic"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { TABS } from "@/components/easy/dev/DevNav"

// Heavy (Privy/Wagmi) — lazy-loaded so the marketing landing page (which also
// renders LandingHeader) doesn't pay for it. Only mounted on the Easy routes.
const ConnectWalletButtonLazy = dynamic(
  () => import("./wallet/connect-wallet-button").then((m) => m.ConnectWalletButton),
  { ssr: false, loading: () => <div className="h-9 w-28 rounded-md bg-foreground/10 mr-2 animate-pulse" /> }
)

export function LandingHeader() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const { isLowPerfDevice } = useReducedMotion()
  const { theme, resolvedTheme } = useTheme()
  const isDarkMode = (resolvedTheme || theme) === "dark"
  const pathname = usePathname()

  const isEasyDev = pathname?.startsWith("/app/easy") ?? false

  // Mirror DevNav's active-tab logic: Home (`/app`) is matched exactly, the
  // deep Easy routes (`/app/easy/portfolio` etc.) are matched by prefix.
  const activeTabIndex = isEasyDev
    ? TABS.findIndex((t) =>
        t.href === "/app" ? pathname === "/app" : pathname?.startsWith(t.href)
      )
    : -1

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Close mobile menu on resize
  useEffect(() => {
    const handleResize = () => setIsMenuOpen(false)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen)

  // Default theme colors for landing page
  const peridotPrimary = isDarkMode ? defaultTheme.darkColors.primary : defaultTheme.colors.primary

  // Header Styles
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
  }

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
  }

  const NavLinks = ({ mobile = false }) => (
    <>
      <Link
        href="/app"
        className={`text-text/80 hover:text-primary transition-colors ${mobile ? 'py-2 px-3 rounded-lg hover:bg-background/50' : ''}`}
        onClick={() => mobile && setIsMenuOpen(false)}
      >
        App
      </Link>
      <Link
        href="/app/margin"
        className={`text-text/80 hover:text-primary transition-colors ${mobile ? 'py-2 px-3 rounded-lg hover:bg-background/50' : ''}`}
        onClick={() => mobile && setIsMenuOpen(false)}
      >
        Margin
      </Link>
      <Link
        href="/app/leaderboard"
        className={`text-text/80 hover:text-primary transition-colors ${mobile ? 'py-2 px-3 rounded-lg hover:bg-background/50' : ''}`}
        onClick={() => mobile && setIsMenuOpen(false)}
      >
        Leaderboard
      </Link>
      <Link
        href="/how-it-works"
        className={`text-text/80 hover:text-primary transition-colors ${mobile ? 'py-2 px-3 rounded-lg hover:bg-background/50' : ''}`}
        onClick={() => mobile && setIsMenuOpen(false)}
      >
        How It Works
      </Link>
      <Link
        href="/docs"
        className={`text-text/80 hover:text-primary transition-colors ${mobile ? 'py-2 px-3 rounded-lg hover:bg-background/50' : ''}`}
        onClick={() => mobile && setIsMenuOpen(false)}
      >
        Docs
      </Link>
      <Link
        href="/blog"
        className={`text-text/80 hover:text-primary transition-colors ${mobile ? 'py-2 px-3 rounded-lg hover:bg-background/50' : ''}`}
        onClick={() => mobile && setIsMenuOpen(false)}
      >
        DeFi
      </Link>
      <Link
        href="/agents"
        className={`text-text/80 hover:text-primary transition-colors ${mobile ? 'py-2 px-3 rounded-lg hover:bg-background/50' : ''}`}
        onClick={() => mobile && setIsMenuOpen(false)}
      >
        AI Agent
      </Link>
    </>
  )

  return (
    <header
      ref={headerRef}
      className={`fixed top-0 z-[100] transition-all duration-300 
        max-w-[96%] w-[96%] mx-auto left-[2%] right-[2%] mt-2 md:mt-3 lg:mt-4 
        rounded-xl md:rounded-2xl
        ${!isLowPerfDevice ? 'header-entrance' : ''}
        ${isMenuOpen ? 'mobile-menu-open' : ''}
        ${isScrolled 
          ? isDarkMode 
            ? "bg-transparent backdrop-blur-md" 
            : "bg-background/85 backdrop-blur-md" 
          : isDarkMode 
            ? "bg-transparent backdrop-blur-md" 
            : "bg-background/70 backdrop-blur-md"}`}
      style={headerStyle}
      suppressHydrationWarning={true}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          <div className={`flex items-center ${!isLowPerfDevice ? 'logo-float' : ''} pb-3`}>
            <Link href="/" className="flex items-end space-x-2">
              <div className="relative w-8 h-8 md:w-10 md:h-10">
                <Image src="/Peridot-Icon-Only-Mint-Green.svg" alt="Peridot Logo" width={40} height={40} className="object-contain" />
              </div>
              <div className="flex flex-col translate-y-[10px] md:translate-y-[10px] translate-x-[-5px]">
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
          <nav className="hidden md:flex items-center space-x-6 text-sm">
            {isEasyDev ? (
              <div className="flex items-center gap-1">
                {TABS.map((tab, i) => {
                  const isActive = i === activeTabIndex
                  const Icon = tab.icon
                  return (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      className={cn(
                        "relative flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold transition-colors duration-200",
                        isActive
                          ? "text-emerald-500"
                          : "text-muted-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.04]"
                      )}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="header-easynav-bg"
                          className="absolute inset-0 rounded-full bg-emerald-500/10"
                          transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        />
                      )}
                      <Icon className="w-4 h-4 relative" strokeWidth={isActive ? 2.2 : 1.8} />
                      <span className="relative">{tab.label}</span>
                    </Link>
                  )
                })}
              </div>
            ) : (
              <NavLinks />
            )}
          </nav>

          {/* Desktop Controls */}
          <div className="hidden md:flex items-center gap-2">
            {isEasyDev ? (
              <Link
                href="/app"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold text-muted-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-colors duration-150"
              >
                <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                Expert
              </Link>
            ) : (
              <Button asChild size="sm" className="rounded-2xl">
                <Link href="/app" className="flex items-center gap-2">
                  Launch App <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            )}
            <SoundToggle />
            <ThemeToggle />
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center">
            {isEasyDev ? (
              // On the Easy subroutes (Portfolio / Activity / Profile) the
              // SiteHeader is suppressed, so surface the same Log in / Profile
              // pill here — mirrors Home (`/app`) for a consistent header.
              // The ≤360px shrink matches site-header so the logo never wraps.
              <ConnectWalletButtonLazy className="mr-2 max-[360px]:[&_button]:min-w-0 max-[360px]:[&_button]:px-2.5" />
            ) : (
              <Button asChild size="sm" className="mr-2 rounded-2xl">
                <Link href="/app">App</Link>
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={toggleMenu} className="ml-2 hamburger-button">
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div
          className={`md:hidden backdrop-blur-md rounded-xl mx-1 mt-1 bg-background/95 dark:bg-background/90 dark:border dark:border-white/10 p-4 ${!isLowPerfDevice ? 'mobile-menu-enter' : ''}`}
          style={mobileMenuStyle}
        >
          <div className="flex flex-col space-y-2">
            <NavLinks mobile />
            <div className="border-t border-white/10 mt-6 pt-6">
              <div className="space-y-4">
                <div className="w-full flex items-center gap-2">
                  <SoundToggle />
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

