"use client"

import { useEffect, useState } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2 } from "lucide-react"
import Image from "next/image"
import { DevNav } from "@/components/easy/dev/DevNav"
import { StellarSheetsProvider } from "@/context/stellar-sheets"
import { StellarSheets } from "@/components/steallar/sheets/StellarSheets"
import { LandingHeader } from "@/components/landing-header"
import { LandingFooter } from "@/components/landing-footer"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { useDemoMode } from "@/context/demo-mode"
import { useDevice } from "@/context/device"
import { StealllarDesktopShell } from "@/components/steallar/StealllarDesktopShell"
import { ConnectChooser } from "@/components/wallet/ConnectChooser"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"

// ─── Login card ───────────────────────────────────────────────────────────────

export function LoginCard({ onLogin, onDemo }: { onLogin: () => void; onDemo: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.97 }}
      transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="w-full max-w-sm mx-auto px-4"
    >
      <div className="relative rounded-[2rem] overflow-hidden bg-background border border-foreground/[0.09] shadow-2xl p-8 flex flex-col items-center text-center gap-7">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-emerald-500/5 pointer-events-none" />

        <Image
          src="/Peridot-Icon-Only-Mint-Green.svg"
          alt="Peridot"
          width={40}
          height={40}
          className="relative"
        />

        <div className="space-y-3 relative">
          <h1 className="text-[2.1rem] font-black tracking-tight leading-[1.1]">
            Your money,<br />
            <span className="text-emerald-500">Your earnings.</span>
          </h1>
        </div>

        <div className="w-full flex flex-col gap-3 relative">
          <button
            onClick={onLogin}
            className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-base shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all active:scale-[0.98] cursor-pointer"
          >
            Sign in to get started
          </button>
          <button
            onClick={onDemo}
            className="w-full h-11 rounded-2xl border border-foreground/[0.12] hover:border-foreground/[0.22] hover:bg-foreground/[0.03] text-muted-foreground/60 hover:text-muted-foreground font-semibold text-[14px] transition-all active:scale-[0.98] cursor-pointer"
          >
            Continue Without Wallet
          </button>
        </div>

        <p className="text-[10px] text-muted-foreground/40 relative">
          Non-custodial · Your keys, your money
        </p>
      </div>
    </motion.div>
  )
}

// ─── Inner layout — inside DemoModeContext and DeviceContext ──────────────────

function EasyLayoutInner({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy()
  const { isDemoMode, setDemoMode } = useDemoMode()
  const { isDesktop } = useDevice()
  const stellarWallet = useStellarWallet()
  const [mounted, setMounted] = useState(false)
  // "Sign in" on the gate opens the custom "Welcome to Peridot" chooser
  // (email/social + EVM + Stellar) — never Privy's raw modal directly.
  const [chooserOpen, setChooserOpen] = useState(false)

  useEffect(() => setMounted(true), [])

  // `?e2e=1` is now folded into `useDemoMode()` itself (ephemeral, see
  // `context/demo-mode.tsx`). That means a single demo flag drives the
  // whole tree — no useEffect side-step here, no sticky sessionStorage.
  const isReady = isDemoMode || (mounted && ready)
  // Stellar wallets connect independently of Privy — treat their connected
  // state as a valid auth signal so Stellar-only users see live positions
  // instead of the sign-in screen.
  const isAuthed = isDemoMode || (isReady && authenticated) || stellarWallet.isConnected

  return (
    <ErrorBoundary>
      <div className="fixed inset-0 text-foreground font-sans selection:bg-primary/30 overflow-hidden bg-background">

        {/* Ambient background — mobile only; desktop shell has its own white canvas */}
        {!isDesktop && (
          <>
            <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
              <div
                className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-primary/5 blur-[120px] animate-pulse"
                style={{ animationDuration: "8s" }}
              />
              <div
                className="absolute bottom-[-10%] right-[-10%] w-[55%] h-[55%] rounded-full bg-emerald-500/5 blur-[120px] animate-pulse"
                style={{ animationDuration: "10s" }}
              />
            </div>
            <div
              // `pointer-events-none` is required: this fixed overlay sits
              // on top of the entire viewport. Without it, mouse-wheel
              // events on the side gutters of centered content (every
              // `/app/easy/*` route) are swallowed and desktop scroll
              // only works over the main column.
              className="fixed inset-0 bg-[url('/grid.svg')] bg-center z-0 pointer-events-none"
              aria-hidden
              style={{ maskImage: "linear-gradient(180deg,white,rgba(255,255,255,0))" }}
            />
          </>
        )}

        <AnimatePresence mode="wait">
          {!isReady && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-10 flex items-center justify-center"
            >
              <Loader2 className="w-5 h-5 text-muted-foreground/40 animate-spin" />
            </motion.div>
          )}

          {isReady && !isAuthed && (
            <motion.div
              key="login"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-10 flex items-center justify-center"
            >
              {isDesktop && <LandingHeader />}
              <LoginCard onLogin={() => setChooserOpen(true)} onDemo={() => setDemoMode(true)} />
            </motion.div>
          )}

          {isReady && isAuthed && (
            isDesktop ? (
              <StealllarDesktopShell key="shell-desktop">{children}</StealllarDesktopShell>
            ) : (
              <motion.div
                key="shell-mobile"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 z-10 flex flex-col"
              >
                <LandingHeader />
                <div
                  data-easy-scroll
                  className="flex-1 overflow-y-auto pt-[4.5rem] md:pt-20"
                >
                  {/* `min-h-full` parks the footer just below the first fold
                      regardless of how tall the page content is — short pages
                      (like an empty Profile) don't accidentally reveal the
                      footer on initial paint and trigger the nav-lift too
                      early. Reaching the footer always requires an explicit
                      end-of-content scroll. */}
                  <div className="min-h-full flex flex-col">
                    <div className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-6">
                      {children}
                    </div>
                  </div>
                  <LandingFooter />
                </div>
                <DevNav />
                {/* Same sheets as the desktop shell, so a position's Withdraw
                    or Repay on mobile runs the one flow desktop runs. */}
                <StellarSheets />
              </motion.div>
            )
          )}
        </AnimatePresence>

        <ConnectChooser open={chooserOpen} onOpenChange={setChooserOpen} />
      </div>
    </ErrorBoundary>
  )
}

// ─── Client shell (re-exported for use from the server layout) ────────────────

export function EasyLayoutShell({ children }: { children: React.ReactNode }) {
  // One sheets provider above the desktop/mobile split. The device is a server
  // guess corrected on the client, so the shell can switch branch right after
  // mount; a provider per branch lost whatever sheet had just opened (e.g. a
  // `?deposit=` resume) when that happened.
  return (
    <StellarSheetsProvider>
      <EasyLayoutInner>{children}</EasyLayoutInner>
    </StellarSheetsProvider>
  )
}
