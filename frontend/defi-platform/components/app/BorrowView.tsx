"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2, PiggyBank, HandCoins, RotateCcw } from "lucide-react"
import { usePrivy } from "@privy-io/react-auth"
import { useDevice } from "@/context/device"
import { useViewMode } from "@/context/view-mode"
import { useDemoMode } from "@/context/demo-mode"
import { StellarSheetsProvider } from "@/context/stellar-sheets"
import { StellarSheets } from "@/components/steallar/sheets/StellarSheets"
import { BorrowSection, useBorrowData } from "@/components/steallar/BorrowSection"
import { useStealllarAuthState } from "@/hooks/use-steallar-auth-state"
import { LoginCard } from "@/app/app/easy/EasyLayoutShell"
import { ConnectChooser } from "@/components/wallet/ConnectChooser"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { DevNav } from "@/components/easy/dev/DevNav"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { cn } from "@/lib/utils"

// Plain-English copy for crypto-distant users — same voice as BorrowSection
// and PortfolioHero.
const AVAILABLE_TOOLTIP =
  "How much you can still borrow right now. It grows when you deposit more and shrinks while loans are open."
const DEPOSITS_TOOLTIP =
  "The total value of everything you've deposited. Your deposits act as a security backing for your loans."
const BORROWED_TOOLTIP = "The total value of your open loans."
const LIMIT_USED_TOOLTIP =
  "How much of your borrow limit is in use. Keeping this low keeps your deposits safe if prices move."

const STAT_LABEL_CLASSES =
  "text-[10px] font-medium text-muted-foreground/80 uppercase tracking-wider mb-0.5 border-b border-dotted border-border/60 leading-tight"

function formatValue(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)
    return `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  return `$${v.toFixed(2)}`
}

// ─── Hero stats strip (mirrors PortfolioHero's StatsStrip) ────────────────────

function BorrowStatsStrip({
  totalCollateral,
  totalBorrowed,
  limitUsedPct,
  variant,
}: {
  totalCollateral: number
  totalBorrowed: number
  limitUsedPct: number
  variant: "live" | "placeholder"
}) {
  const isPlaceholder = variant === "placeholder"
  const pct = Math.min(limitUsedPct, 100)
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
      className="flex items-stretch gap-0 mt-4 rounded-xl border border-foreground/[0.06] overflow-hidden"
    >
      <div className="flex-1 flex flex-col items-center justify-center px-3 py-2.5">
        <InfoTooltip title="Deposits" content={DEPOSITS_TOOLTIP} className={STAT_LABEL_CLASSES}>
          Deposits
        </InfoTooltip>
        <span
          data-testid="borrow-stats-deposits"
          className={cn(
            "text-sm font-bold tabular-nums",
            isPlaceholder ? "text-muted-foreground/60" : "text-foreground"
          )}
        >
          {isPlaceholder ? "—" : formatValue(totalCollateral)}
        </span>
      </div>

      <div className="w-px bg-foreground/[0.06]" />

      <div className="flex-1 flex flex-col items-center justify-center px-3 py-2.5">
        <InfoTooltip title="Borrowed" content={BORROWED_TOOLTIP} className={STAT_LABEL_CLASSES}>
          Borrowed
        </InfoTooltip>
        <span
          data-testid="borrow-stats-borrowed"
          className={cn(
            "text-sm font-bold tabular-nums",
            isPlaceholder ? "text-muted-foreground/60" : "text-foreground"
          )}
        >
          {isPlaceholder ? "—" : formatValue(totalBorrowed)}
        </span>
      </div>

      <div className="w-px bg-foreground/[0.06]" />

      <div className="flex-1 flex flex-col items-center justify-center px-3 py-2.5">
        <InfoTooltip title="Limit used" content={LIMIT_USED_TOOLTIP} className={STAT_LABEL_CLASSES}>
          Limit used
        </InfoTooltip>
        <span
          data-testid="borrow-stats-limit-used"
          className={cn(
            "text-sm font-bold tabular-nums",
            isPlaceholder
              ? "text-muted-foreground/60"
              : pct > 80
                ? "text-rose-500"
                : "text-emerald-500"
          )}
        >
          {isPlaceholder ? "—" : `${pct.toFixed(0)}%`}
        </span>
      </div>
    </motion.div>
  )
}

// ─── "How it works" explainer ─────────────────────────────────────────────────
// Fills the hero's right column the way the chart does on the Earn page, and
// doubles as onboarding for users who've never taken a loan against deposits.

const HOW_IT_WORKS = [
  {
    icon: PiggyBank,
    title: "Deposit first",
    body: "Your savings stay yours and keep earning — they simply back your loan.",
  },
  {
    icon: HandCoins,
    title: "Borrow instantly",
    body: "Take out dollars against your deposits. No credit checks, no paperwork.",
  },
  {
    icon: RotateCcw,
    title: "Repay anytime",
    body: "No fixed schedule. Interest only accrues while the loan is open.",
  },
] as const

function HowItWorks() {
  return (
    <div className="w-full md:flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-3">
      {HOW_IT_WORKS.map((step, i) => (
        <motion.div
          key={step.title}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 + i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] p-5 flex flex-col gap-3"
        >
          <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <step.icon className="text-emerald-500" size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground/90">{step.title}</p>
            <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">{step.body}</p>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function BorrowHero({ isConnected }: { isConnected: boolean }) {
  const { totalCollateral, totalBorrowed, available, borrowLimitUsed } =
    useBorrowData(isConnected)

  return (
    <section
      data-testid="borrow-hero"
      className="flex flex-col md:flex-row items-start gap-6 md:gap-10 py-10 md:py-16 px-6 md:px-10"
    >
      {/* ── Left: value panel ── */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="shrink-0 md:w-64"
      >
        <h1 className="text-xl font-bold text-foreground/90 mb-3">Borrow</h1>

        <div className="space-y-3">
          <p
            data-testid="borrow-available"
            className={cn(
              "text-5xl font-black tracking-tight tabular-nums",
              isConnected ? "text-foreground" : "text-muted-foreground/50"
            )}
          >
            {/* A logged-out visitor used to get "$—" over "Connect your wallet to
                see how much you can borrow" — a page that asks for a login before
                it answers anything. It is also where the homepage's "See what you
                can borrow" now lands, so the question has to be answered before
                the ask, not after it. 90% is the collateral factor on USDC and
                EURC; the per-asset numbers are in the table below. */}
            {isConnected ? formatValue(available) : "up to 90%"}
          </p>

          {isConnected ? (
            <InfoTooltip
              title="Available to borrow"
              content={AVAILABLE_TOOLTIP}
              className="text-sm font-semibold text-muted-foreground/80 border-b border-dotted border-border/60 leading-tight"
            >
              Available to borrow
            </InfoTooltip>
          ) : (
            <p className="text-sm text-muted-foreground/80 max-w-[200px] leading-snug">
              of what you deposit, available to borrow — sign in to see it against
              your own balance
            </p>
          )}

          <BorrowStatsStrip
            totalCollateral={totalCollateral}
            totalBorrowed={totalBorrowed}
            limitUsedPct={borrowLimitUsed}
            variant={isConnected ? "live" : "placeholder"}
          />
        </div>
      </motion.div>

      {/* ── Right: explainer ── */}
      <HowItWorks />
    </section>
  )
}

// ─── Desktop layout (mirrors StealllarDesktopApp's canvas) ────────────────────

function BorrowDesktop() {
  const { isConnected } = useStealllarAuthState()

  return (
    <motion.main
      data-testid="borrow-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-full bg-transparent"
    >
      <div className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto">
        <BorrowHero isConnected={isConnected} />
      </div>

      <div className="w-full max-w-3xl xl:max-w-5xl 2xl:max-w-[75vw] mx-auto">
        <div className="mx-6 border-t border-foreground/[0.06]" />
        <BorrowSection isConnected={isConnected} className="px-6 py-8 pb-16" />
      </div>
    </motion.main>
  )
}

// ─── Mobile card (LoginCard / EasyCardDev aesthetic) ──────────────────────────

function BorrowCardMobile({ isConnected }: { isConnected: boolean }) {
  const { available } = useBorrowData(isConnected)

  return (
    <div className="w-full max-w-md mx-auto relative z-10">
      <div className="relative rounded-[2rem] overflow-hidden bg-background border border-foreground/[0.09] shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-emerald-500/5 pointer-events-none" />

        {/* Balance hero */}
        <div className="relative px-6 pt-7 text-center space-y-0.5">
          {/* Signed out, `available` is 0, so this card told a first-time visitor
              on their phone that they can borrow "$0.00" — a flat no in the exact
              spot the desktop hero now answers the question. Nearly half the
              traffic is mobile, so this is the version most newcomers see. */}
          <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
            {isConnected ? "Available to borrow" : "You can borrow"}
          </p>
          <p
            data-testid="borrow-available"
            className="text-[2.5rem] font-black tracking-tighter tabular-nums leading-none"
          >
            {isConnected ? formatValue(available) : "up to 90%"}
          </p>
          {!isConnected && (
            <p className="pt-1 text-xs text-muted-foreground/70">of what you deposit</p>
          )}
        </div>

        {/* Capacity bar + active loans + Start Borrowing CTA */}
        <BorrowSection isConnected={isConnected} className="relative px-6 pb-7 pt-2" />
      </div>
    </div>
  )
}

/**
 * Body content of the standalone Borrow page (`/app/borrow`).
 *
 * Structural sibling of `EasyView`: same device split, same mobile auth gate,
 * same desktop canvas — but centered on the borrow flow instead of deposits.
 * The actual borrow/repay transactions run through the shared Stellar sheets
 * (`BorrowSheet` / `RepaySheet`), so we mount `StellarSheetsProvider` + the
 * `StellarSheets` host locally, exactly like `EasyView` does on desktop.
 */
export default function BorrowView() {
  const { isDesktop } = useDevice()
  const { ready, authenticated } = usePrivy()
  const { isDemoMode, setDemoMode } = useDemoMode()
  const stellarWallet = useStellarWallet()
  // "Sign in" on the gate opens the custom "Welcome to Peridot" chooser
  // (email/social + EVM + Stellar) — never Privy's raw modal directly.
  const [chooserOpen, setChooserOpen] = useState(false)

  // Borrow is an Easy-mode concept — Expert users borrow per-market in the
  // markets table. Flipping the header toggle to Expert while here (or
  // deep-linking with an expert cookie) lands on `/app` instead of leaving
  // an orphaned Easy-styled page under an Expert header.
  const { mode } = useViewMode()
  const router = useRouter()
  useEffect(() => {
    if (mode === "expert") router.replace("/app")
  }, [mode, router])

  if (mode === "expert") return null

  if (isDesktop) {
    return (
      <StellarSheetsProvider>
        {/* Same solid canvas trick as EasyView: cancel the global <main> top
            padding so the background reaches up under the fixed header. */}
        <div className="min-h-screen bg-background -mt-24 md:-mt-28 lg:-mt-32 pt-24 md:pt-28 lg:pt-32">
          <BorrowDesktop />
        </div>
        <StellarSheets />
      </StellarSheetsProvider>
    )
  }

  // Mobile gate — mirrors EasyView: spinner until Privy resolves, then the
  // LoginCard until the user signs in, connects a Stellar wallet, or opts
  // into demo mode.
  const isAuthed = isDemoMode || (ready && authenticated) || stellarWallet.isConnected

  return (
    <StellarSheetsProvider>
      <AnimatePresence mode="wait" initial={false}>
        {!ready && !isDemoMode ? (
          <motion.div
            key="bv-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="min-h-[60vh] flex items-center justify-center"
          >
            <Loader2 className="w-5 h-5 text-muted-foreground/40 animate-spin" />
          </motion.div>
        ) : !isAuthed ? (
          <motion.div
            key="bv-login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="min-h-[70vh] flex items-center justify-center px-4 pt-2 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px)+1rem)]"
          >
            <LoginCard onLogin={() => setChooserOpen(true)} onDemo={() => setDemoMode(true)} />
          </motion.div>
        ) : (
          <motion.div
            key="bv-card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            // Bottom padding reserves space for the fixed DevNav (4.5rem) plus
            // the iOS home-indicator inset so the card never sits underneath it.
            className="min-h-[100svh] flex flex-col items-center justify-start pt-3 md:pt-6 md:pb-10 px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px)+1rem)]"
          >
            <BorrowCardMobile isConnected={isAuthed} />
          </motion.div>
        )}
      </AnimatePresence>
      <StellarSheets />
      <DevNav />
      <ConnectChooser open={chooserOpen} onOpenChange={setChooserOpen} />
    </StellarSheetsProvider>
  )
}
