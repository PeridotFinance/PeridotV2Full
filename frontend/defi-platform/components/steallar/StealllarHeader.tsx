"use client"

import { useState, useEffect, lazy, Suspense } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, Copy, Trophy, Wallet } from "lucide-react"
import { usePrivy } from "@privy-io/react-auth"
import { useDisconnect } from "wagmi"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useDepositPanel } from "@/context/deposit-panel"
import { useNetworkContext } from "@/context"
import { WalletManagementDialog } from "@/components/ui/WalletManagementDialog"

const ConnectWalletButton = lazy(() =>
  import("@/components/wallet/connect-wallet-button").then((m) => ({
    default: m.ConnectWalletButton,
  }))
)

const MOBILE_NAV_LINKS = [
  { label: "Portfolio", href: "/app/easy" },
]

export function StealllarHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const rawPathname = usePathname()
  // Strip a trailing slash so active-link checks match on `/app/easy` and
  // `/app/easy/` alike.
  const pathname =
    rawPathname && rawPathname !== "/" ? rawPathname.replace(/\/+$/, "") : rawPathname
  const router = useRouter()
  const { authenticated, user, logout } = usePrivy()
  const { disconnect } = useDisconnect()
  const { openPanel } = useDepositPanel()
  const { isWalletManagementOpen, setWalletManagementOpen } = useNetworkContext()

  const walletAddress = user?.wallet?.address ?? ""

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const handleDisconnect = async () => {
    try {
      toast.loading("Disconnecting…", { id: "disconnect" })
      try { disconnect() } catch (err) { console.warn("wagmi disconnect failed:", err) }
      try { await logout() } catch (err) { console.warn("Privy logout failed:", err) }
      // Clear the reconnect hints so an unlocked wallet isn't silently
      // re-attached on the next load, then hard-navigate (a soft refresh keeps
      // the Wagmi/Privy providers alive and they reconnect immediately).
      if (typeof window !== "undefined") {
        try {
          for (const k of Object.keys(localStorage)) {
            if (
              /^wagmi/i.test(k) ||
              /^privy:connections$/i.test(k) ||
              /^privy:.*(active-wallet-connection|recent-login)/i.test(k) ||
              /^@StellarWalletsKit\/(activeAddress|selectedModuleId|usedWalletsIds)/i.test(k)
            ) {
              localStorage.removeItem(k)
            }
          }
        } catch (err) { console.warn("Failed to clear connection hints:", err) }
      }
      toast.success("Disconnected", { id: "disconnect" })
      if (typeof window !== "undefined") window.location.assign("/app")
    } catch (err) {
      console.error("Disconnect failed:", err)
      toast.error("Failed to disconnect", { id: "disconnect" })
    }
  }

  return (
    <>
      <motion.header
        data-testid="steallar-header"
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "fixed top-0 inset-x-0 z-50 h-16 bg-background transition-shadow duration-300",
          scrolled && "shadow-sm border-b border-foreground/[0.06]"
        )}
      >
        <div className="w-full max-w-4xl mx-auto px-6 flex items-center h-full">
        {/* Logo — mirrors LandingHeader (icon + Peridot / FINANCE wordmark) */}
        <Link href="/" className="flex items-end gap-2 shrink-0" aria-label="Peridot Home">
          <div className="relative w-8 h-8 md:w-10 md:h-10">
            <Image
              src="/Peridot-Icon-Only-Mint-Green.svg"
              alt="Peridot"
              width={40}
              height={40}
              className="object-contain"
              priority
            />
          </div>
          <div className="flex flex-col translate-y-[10px] translate-x-[-5px]">
            <span className="font-bold text-xl leading-tight text-foreground">
              Peridot
            </span>
            <span className="text-xs font-normal text-muted-foreground uppercase tracking-wide leading-tight mt-0.5">
              FINANCE
            </span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8 ml-10 text-sm font-medium text-muted-foreground">
          <button
            onClick={() => openPanel()}
            className="hover:text-foreground transition-colors cursor-pointer"
          >
            Earn
          </button>

          <Link
            href="/app/easy"
            className={cn(
              "hover:text-foreground transition-colors",
              pathname === "/app/easy" && "text-foreground font-semibold"
            )}
          >
            Portfolio
          </Link>
        </nav>

        <div className="flex-1" />

        {/* Right side: Expert link + wallet pill (desktop) + hamburger (mobile) */}
        <div className="flex items-center gap-3">
          {/* Desktop: "Expert" — leads to the advanced /app surface, sits next
              to the wallet pill so it reads as an account-level action distinct
              from the in-app Earn/Portfolio nav on the left. */}
          <Link
            href="/app"
            className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Expert
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.2} />
          </Link>

          {/* Leaderboard quick-link — kept one tap away now that the profile
              pill opens the wallet modal directly (it used to host this). */}
          <Link
            href="/app/leaderboard"
            aria-label="Leaderboard"
            title="Leaderboard"
            className="hidden md:inline-flex items-center justify-center w-10 h-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Trophy className="w-[18px] h-[18px]" />
          </Link>

          {/* Desktop: wallet or connect button */}
          <div className="hidden md:flex items-center">
            {authenticated && walletAddress ? (
              // Profile tap opens the wallet modal directly — copy, manage and
              // disconnect all live inside it, so no intermediate dropdown.
              <button
                data-testid="wallet-pill"
                aria-label="Open wallet"
                onClick={() => setWalletManagementOpen(true)}
                className="h-10 px-4 rounded-full bg-muted hover:bg-muted/70 text-foreground/80 text-sm font-medium flex items-center max-w-[180px] truncate outline-none transition-colors cursor-pointer"
              >
                Profile
              </button>
            ) : (
              <Suspense
                fallback={
                  <div className="h-10 w-24 rounded-full bg-emerald-600/70 animate-pulse" />
                }
              >
                <ConnectWalletButton
                  label="Login"
                  className="h-10 px-5 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all border-0"
                />
              </Suspense>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((o) => !o)}
            className="md:hidden flex items-center justify-center w-10 h-10 rounded-full text-foreground/70 hover:bg-muted transition-colors text-lg font-medium"
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
        </div>{/* end max-w-2xl */}
      </motion.header>

      {/* Mobile slide-down menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            key="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-16 inset-x-0 z-40 bg-background border-b border-foreground/[0.06] shadow-md overflow-hidden md:hidden"
          >
            <div className="flex flex-col px-6 py-4 gap-1">
              {/* Earn — opens deposit panel */}
              <button
                onClick={() => { openPanel(); setMenuOpen(false) }}
                className="py-3 px-2 text-base font-medium text-foreground/70 hover:text-foreground rounded-lg hover:bg-muted/40 transition-colors text-left"
              >
                Earn
              </button>
              {MOBILE_NAV_LINKS.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "py-3 px-2 text-base font-medium text-foreground/70 hover:text-foreground rounded-lg hover:bg-muted/40 transition-colors",
                    pathname === link.href && link.href === "/app/easy" && "text-foreground font-semibold"
                  )}
                >
                  {link.label}
                </Link>
              ))}

              {/* Mobile wallet state */}
              <div className="pt-3 mt-1 border-t border-foreground/[0.06]">
                {authenticated && walletAddress ? (
                  <div className="flex flex-col gap-1">
                    <span
                      data-testid="wallet-pill-mobile"
                      className="block px-2 py-2 text-sm font-medium text-foreground/80"
                    >
                      Profile
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(walletAddress)
                        toast.success("Address copied")
                      }}
                      className="flex items-center gap-2 py-2 px-2 text-sm text-foreground/80 hover:text-foreground rounded-lg hover:bg-muted/40 transition-colors text-left"
                    >
                      <Copy className="h-4 w-4" />
                      Copy address
                    </button>
                    <button
                      onClick={() => { setWalletManagementOpen(true); setMenuOpen(false) }}
                      className="flex items-center gap-2 py-2 px-2 text-sm text-foreground/80 hover:text-foreground rounded-lg hover:bg-muted/40 transition-colors text-left"
                    >
                      <Wallet className="h-4 w-4" />
                      Manage Wallets
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); handleDisconnect() }}
                      className="flex items-center justify-center py-2 px-2 mt-1 text-sm font-medium text-red-600 hover:text-red-700 rounded-lg hover:bg-red-500/10 transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <Suspense fallback={<div className="h-10 w-full rounded-full bg-emerald-600/70 animate-pulse" />}>
                    <ConnectWalletButton
                      label="Login"
                      className="w-full h-10 px-5 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all border-0"
                    />
                  </Suspense>
                )}
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      <WalletManagementDialog
        open={isWalletManagementOpen}
        onOpenChange={setWalletManagementOpen}
      />
    </>
  )
}
