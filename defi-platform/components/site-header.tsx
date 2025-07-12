"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { useReducedMotion } from "@/lib/use-reduced-motion"
import { Menu, X, RefreshCw } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { useTheme } from "next-themes"
import { CSSProperties } from "react"
import { ConnectWalletButton } from "./wallet/connect-wallet-button"
import { NetworkSwitcher } from "./ui/network-switcher"

export function SiteHeader() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { isLowPerfDevice } = useReducedMotion()
  const { theme } = useTheme()
  const isDarkMode = theme === "dark"
  const pathname = usePathname()
  const isAppRoute = pathname === "/app" || pathname.startsWith("/app/")
  const isBridgePage = pathname === "/app/bridge"

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10)
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const handleRefresh = () => {
    window.dispatchEvent(new CustomEvent('custom:refresh'));
  };

  // Remove animation initially for better iOS compatibility
  const headerVariants = {
    initial: { opacity: 1, y: 0 },
    animate: { 
      opacity: 1, 
      y: 0, 
      transition: { duration: 0.5 } 
    },
  }

  const floatingAnimation = !isLowPerfDevice ? {
    y: [0, -5, 0],
    transition: {
      duration: 6,
      repeat: Infinity,
      repeatType: "reverse" as const,
      ease: "easeInOut",
    }
  } : {}

  const logoVariants = {
    initial: { opacity: 1, scale: 1 },
    animate: { opacity: 1, scale: 1, transition: { duration: 0.5 } },
  }

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
    background: 'linear-gradient(to bottom, rgba(10, 10, 10, 0.4), rgba(25, 25, 25, 0.6))',
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
    background: 'linear-gradient(to bottom, rgba(10, 10, 10, 0.5), rgba(25, 25, 25, 0.7))',
    backdropFilter: 'blur(12px)'
  } : {
    boxShadow: '0 8px 32px -4px rgba(0, 0, 0, 0.1), 0 4px 16px -2px rgba(0, 0, 0, 0.06)',
  };

  // App navigation links vs standard links
  const renderNavLinks = () => {
    if (isAppRoute) {
      return (
        <>
          <Link 
            href="/app/bridge" 
            className={`transition-colors ${
              pathname === "/app/bridge" 
                ? "text-primary font-medium" 
                : "text-text/80 hover:text-primary"
            }`}
          >
            Bridge
          </Link>
          <Link 
            href="/app" 
            className={`transition-colors ${
              pathname === "/app" 
                ? "text-primary font-medium" 
                : "text-text/80 hover:text-primary"
            }`}
          >
            App
          </Link>
          <Link 
            href="/app/leaderboard" 
            className={`transition-colors ${
              pathname === "/app/leaderboard" 
                ? "text-primary font-medium" 
                : "text-text/80 hover:text-primary"
            }`}
          >
            Leaderboard
          </Link>
        </>
      )
    } else {
      return (
        <>
          <Link href="/app" className="text-text/80 hover:text-primary transition-colors">
            App
          </Link>
          <Link href="/how-it-works" className="text-text/80 hover:text-primary transition-colors">
            How It Works
          </Link>


          <Link href="/blog" className="text-text/80 hover:text-primary transition-colors">
            Blog
          </Link>
          <Link href="/faq" className="text-text/80 hover:text-primary transition-colors">
            FAQ
          </Link>
          <Link href="/join" className="text-text/80 hover:text-primary transition-colors">
            Join Waitlist
          </Link>
        </>
      )
    }
  }

  // App mobile navigation vs standard mobile navigation
  const renderMobileNavLinks = () => {
    if (isAppRoute) {
      return (
        <>
          <Link
            href="/app"
            className={`transition-colors py-2 px-3 rounded-lg hover:bg-background/50 ${
              pathname === "/app" 
                ? "text-primary font-medium bg-primary/10" 
                : "text-text/80 hover:text-primary"
            }`}
            onClick={() => setIsMenuOpen(false)}
          >
            Home
          </Link>
          <Link
            href="/app/bridge"
            className={`transition-colors py-2 px-3 rounded-lg hover:bg-background/50 ${
              pathname === "/app/bridge" 
                ? "text-primary font-medium bg-primary/10" 
                : "text-text/80 hover:text-primary"
            }`}
            onClick={() => setIsMenuOpen(false)}
          >
            Bridge
          </Link>
          <Link
            href="/app/leaderboard"
            className={`transition-colors py-2 px-3 rounded-lg hover:bg-background/50 ${
              pathname === "/app/leaderboard" 
                ? "text-primary font-medium bg-primary/10" 
                : "text-text/80 hover:text-primary"
            }`}
            onClick={() => setIsMenuOpen(false)}
          >
            Leaderboard
          </Link>
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
          <Link
            href="/faq"
            className="text-text/80 hover:text-primary transition-colors py-2 px-3 rounded-lg hover:bg-background/50"
            onClick={() => setIsMenuOpen(false)}
          >
            FAQ
          </Link>
          <Link
            href="/join"
            className="text-text/80 hover:text-primary transition-colors py-2 px-3 rounded-lg hover:bg-background/50"
            onClick={() => setIsMenuOpen(false)}
          >
            Join Waitlist
          </Link>
        </>
      )
    }
  }

  return (
    <motion.header
      className={`fixed top-0 z-[100] transition-all duration-300 
        max-w-[96%] w-[96%] mx-auto left-[2%] right-[2%] mt-2 md:mt-3 lg:mt-4 
        rounded-xl md:rounded-2xl
        ${isScrolled 
          ? isDarkMode 
            ? "bg-transparent backdrop-blur-md" 
            : "bg-background/85 backdrop-blur-md" 
          : isDarkMode 
            ? "bg-transparent backdrop-blur-md" 
            : "bg-background/70 backdrop-blur-md"}`}
      initial="initial"
      animate="animate"
      variants={isLowPerfDevice ? {} : headerVariants}
      {...floatingAnimation}
      style={headerStyle}
      suppressHydrationWarning={true}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          <motion.div className="flex items-center" variants={isLowPerfDevice ? {} : logoVariants}>
            <Link href="/" className="flex items-center space-x-2">
              <div className="relative w-8 h-8 md:w-10 md:h-10">
                <Image src="/logo.svg" alt="Peridot Logo" width={40} height={40} className="object-contain" />
              </div>
              <span className="text-xl md:text-2xl font-bold gradient-text">Peridot</span>
            </Link>
          </motion.div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6 text-sm">
            {renderNavLinks()}
          </nav>

          {/* Desktop Controls */}
          <div className="hidden md:flex items-center space-x-4">
            {isAppRoute && (
              <>
                <Button variant="outline" size="sm" onClick={handleRefresh} className="h-9 px-3">
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> 
                  <span className="text-xs">Refresh</span>
                </Button>
                <NetworkSwitcher onNetworkChange={() => {}} />
                <ConnectWalletButton />
              </>
            )}
            {!isAppRoute && (
              <Link href="/app">
                <Button>Launch App</Button>
              </Link>
            )}
            <ThemeToggle />
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMenu}
              aria-label="Toggle Menu"
              className="ml-2"
            >
              {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <motion.div
          className={`md:hidden backdrop-blur-md rounded-xl mx-1 mt-1 ${
            isDarkMode 
              ? "bg-background/95 dark:bg-background/90 dark:border dark:border-white/10" 
              : "bg-background/95"
          }`}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
          style={mobileMenuStyle}
        >
          <div className="flex flex-col space-y-4 pt-4">
            {renderMobileNavLinks()}
          </div>
          <div className="border-t border-white/10 mt-6 pt-6">
            {isAppRoute ? (
              <div className="space-y-4">
                <ConnectWalletButton className="w-full" />
                <div className="flex items-center gap-4">
                  <Button variant="outline" size="sm" onClick={handleRefresh} className="h-9 px-3 flex-1">
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> 
                    <span className="text-xs">Refresh</span>
                  </Button>
                  <NetworkSwitcher onNetworkChange={() => {}} />
                </div>
              </div>
            ) : (
              <Link href="/app" className="w-full">
                <Button className="w-full">Launch App</Button>
              </Link>
            )}
          </div>
        </motion.div>
      )}
    </motion.header>
  )
}
