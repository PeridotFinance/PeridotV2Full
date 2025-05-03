"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Menu, X, Wallet } from "lucide-react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button"
import { useWallet } from "@/components/wallet/wallet-provider"
import { ThemeToggle } from "@/components/theme-toggle"

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const pathname = usePathname()
  const { isConnected } = useWallet()

  const navigation = [
    { name: "Home", href: "/" },
    { name: "About", href: "/about" },
    { name: "How It Works", href: "/how-it-works" },
    { name: "Blog", href: "/blog" },
    { name: "FAQ", href: "/faq" },
  ]

  return (
    <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <span className="text-2xl font-bold gradient-text">Peridot</span>
            </Link>
          </div>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-primary",
                  pathname === item.href ? "text-primary" : "text-text/80",
                )}
              >
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center space-x-4">
            <ThemeToggle />
            <Button asChild variant="ghost" className="text-text hover:text-primary hover:bg-secondary/20">
              <Link href="/app">
                <Wallet className="mr-2 h-4 w-4" />
                Launch App
              </Link>
            </Button>
            <ConnectWalletButton className="bg-primary text-background hover:bg-primary/90" />
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden">
            <button type="button" className="text-text hover:text-primary" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              <span className="sr-only">Open main menu</span>
              {isMenuOpen ? (
                <X className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden">
          <div className="space-y-1 px-4 pb-3 pt-2">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "block py-2 text-base font-medium",
                  pathname === item.href ? "text-primary" : "text-text/80",
                )}
                onClick={() => setIsMenuOpen(false)}
              >
                {item.name}
              </Link>
            ))}
            <div className="pt-4 flex flex-col space-y-3">
              <div className="flex justify-center mb-2">
                <ThemeToggle />
              </div>
              <Button asChild variant="outline" className="w-full justify-center">
                <Link href="/app" onClick={() => setIsMenuOpen(false)}>
                  <Wallet className="mr-2 h-4 w-4" />
                  Launch App
                </Link>
              </Button>
              <ConnectWalletButton className="w-full justify-center" />
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
