"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2 } from "lucide-react"
import { usePrivy } from "@privy-io/react-auth"
import { EasyCardDev } from "@/components/easy/EasyCardDev"
import { DevNav } from "@/components/easy/dev/DevNav"
import { useDevice } from "@/context/device"
import { useDemoMode } from "@/context/demo-mode"
import { StellarSheetsProvider, useStellarSheets } from "@/context/stellar-sheets"
import { ArrivedNotInvestedBanner } from "@/components/cctp/ArrivedNotInvestedBanner"
import { StellarSheets } from "@/components/steallar/sheets/StellarSheets"
import { LoginCard } from "@/app/app/easy/EasyLayoutShell"
import { ConnectChooser } from "@/components/wallet/ConnectChooser"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"

// StealllarDesktopApp pulls in the full Stellar stack (Portfolio hero, asset
// table, borrow section, tx strip). Lazy-load it so the default Expert view
// doesn't ship those bytes upfront. SSR off — the desktop app reads viewport
// and wallet state that aren't available at server-render time anyway.
const StealllarDesktopApp = dynamic(
  () => import("@/components/steallar/StealllarDesktopApp").then(m => m.StealllarDesktopApp),
  { ssr: false }
)

/**
 * Body content of the Easy (V2) experience when rendered inline under `/app`.
 *
 * This is the trimmed-down sibling of `/app/easy`'s full-screen shell: no
 * private chrome (the SiteHeader provides it), no login gate (handled by the
 * connect flow in SiteHeader), just the card / desktop app body. The deep
 * Easy subroutes (`/app/easy/portfolio`, `/activity`, …) keep their original
 * full-screen shell for now.
 *
 * The desktop variant uses `useStellarSheets()` (deposit/borrow/repay/withdraw
 * sheets); the provider plus the modal host normally live in
 * `StealllarDesktopShell`, but we don't mount that here (it brings its own
 * page chrome). Wrap them locally so the hooks resolve and the sheets render.
 */
export default function EasyView() {
  // One sheets provider above the desktop/mobile split: the device is a server
  // guess corrected on the client, and a provider per branch lost an open
  // sheet (e.g. a `?deposit=` resume) when the branch switched after mount.
  return (
    <StellarSheetsProvider>
      <EasyViewBody />
    </StellarSheetsProvider>
  )
}

function EasyViewBody() {
  const { isDesktop } = useDevice()
  const { ready, authenticated } = usePrivy()
  const { isDemoMode, setDemoMode } = useDemoMode()
  const stellarWallet = useStellarWallet()
  // "Sign in" on the gate opens the custom "Welcome to Peridot" chooser
  // (email/social + EVM + Stellar) — never Privy's raw modal directly.
  const [chooserOpen, setChooserOpen] = useState(false)

  if (isDesktop) {
    return (
      <>
        {/* Solid, single-colour canvas on desktop (white in light, near-black
            in dark). The negative top margin cancels the global <main> top
            padding so the background reaches up under the fixed header, then
            re-adds it as padding — covering the page's green app-gradient
            edge-to-edge. Mobile keeps the transparent gradient look below. */}
        <div className="min-h-screen bg-background -mt-24 md:-mt-28 lg:-mt-32 pt-24 md:pt-28 lg:pt-32">
          {/* Money that arrived from another network and is still sitting in
              the wallet, waiting on the user's answer. Mounted here rather than
              inside the shell so the shell keeps working without the sheets
              provider; this branch is always inside it. Renders nothing in the
              normal case. */}
          <ArrivedFromAnotherNetwork className="w-full max-w-3xl xl:max-w-5xl 2xl:max-w-[75vw] mx-auto px-6" />
          <StealllarDesktopApp />
        </div>
        <StellarSheets />
      </>
    )
  }

  // Mobile gate. Mirrors `/app/easy`'s shell: spinner until Privy resolves,
  // then a LoginCard with sign-in + "continue without wallet" until the user
  // commits to one of the two paths. `/app/easy` enforces this through its
  // own layout shell; without this branch the in-place `/app` toggle would
  // drop unauthenticated visitors directly onto the deposit card with no
  // context — exactly what users have been reporting as missing.
  // Stellar-only users (Freighter / xBull connected without a Privy session)
  // should land on the portfolio just like Privy-authed users. The Stellar
  // wallet stack is independent of Privy, so its `isConnected` is a valid auth
  // signal on its own — otherwise the portfolio gate hides live Stellar
  // positions behind a sign-in screen.
  const isAuthed = isDemoMode || (ready && authenticated) || stellarWallet.isConnected

  // Mobile runs on the same sheets as desktop: the card collects the amount and
  // hands it to the deposit sheet, so both surfaces share one deposit flow.
  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        {!ready && !isDemoMode ? (
          <motion.div
            key="ev-loading"
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
            key="ev-login"
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
            key="ev-card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            // Bottom padding reserves space for the fixed DevNav (4.5rem) plus
            // the iOS home-indicator inset so the card never sits underneath it.
            // `min-h-[100svh]` keeps the footer parked below the first fold on
            // short pages so the DevNav stays rigid until the user actually
            // scrolls past the content end.
            className="min-h-[100svh] flex flex-col items-center justify-start pt-3 md:pt-6 md:pb-10 px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px)+1rem)]"
          >
            <ArrivedFromAnotherNetwork className="w-full max-w-md mb-3" />
            <EasyCardDev />
          </motion.div>
        )}
      </AnimatePresence>
      <DevNav />
      <ConnectChooser open={chooserOpen} onOpenChange={setChooserOpen} />
      {/* Only once signed in, like the desktop shell: the sheets also consume
          a `?deposit=` resume intent, which must not open over the login card. */}
      {isAuthed && <StellarSheets />}
    </>
  )
}

/**
 * The cross-chain arrival banner, wired to the deposit sheet.
 *
 * A separate component only because `useStellarSheets` must be called under the
 * provider that `EasyView` itself renders — a hook in the parent would run one
 * level too high.
 */
function ArrivedFromAnotherNetwork({ className }: { className: string }) {
  const { openDeposit } = useStellarSheets()
  return (
    <div className={`${className} empty:hidden`}>
      <ArrivedNotInvestedBanner onInvest={() => openDeposit({ assetId: "usdc-stellar" })} />
    </div>
  )
}
