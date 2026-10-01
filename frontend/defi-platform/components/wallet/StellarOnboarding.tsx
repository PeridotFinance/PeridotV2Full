"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { toast } from "sonner"
import { useLogin } from "@privy-io/react-auth"
import { SOCIAL_LOGIN } from "@/config/privyLogin"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { ConnectChooser } from "@/components/wallet/ConnectChooser"
import {
  acquireOnboardingOverlay,
  isOnboardingOverlayOpen,
  subscribeOnboardingOverlay,
} from "@/lib/onboarding-overlays"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"

const INTRO_SEEN_KEY = "peridot.stellar.intro.seen"

/** Treat an unreadable localStorage as "seen" — better silent than repeating. */
function hasSeenStellarIntro(): boolean {
  try {
    return Boolean(window.localStorage.getItem(INTRO_SEEN_KEY))
  } catch {
    return true
  }
}

// Persistent inline banner. Shows whenever the Stellar network is selected
// and no Stellar wallet is connected. Disappears once `useStellarWallet()`
// reports a connected address.
export function StellarConnectBanner() {
  const stellar = useStellarWallet()
  const [chooserOpen, setChooserOpen] = useState(false)
  if (stellar.isConnected) return null

  return (
    <>
    <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3 sm:p-4 flex items-center gap-3">
      <div className="shrink-0 h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center">
        <Image
          src="/tokenimages/app/stellar.svg"
          alt="Stellar"
          width={20}
          height={20}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold leading-tight">
          Log in to start earning
        </p>
        <p className="text-[11px] text-muted-foreground/80 leading-snug mt-0.5">
          Sign in with email or Google, and your Stellar wallet is set up for you.
        </p>
      </div>
      {/* The chooser, not Privy's modal: Privy cannot list Stellar wallets, so
          a Freighter user tapping "Log in" here used to land on a screen with
          no path in — and the wallet he was being asked for was MetaMask. */}
      <button
        type="button"
        onClick={() => setChooserOpen(true)}
        className="shrink-0 h-8 px-3 rounded-full bg-primary text-primary-foreground text-[12px] font-semibold hover:bg-primary/90 transition-colors"
      >
        Log in
      </button>
    </div>
    <ConnectChooser open={chooserOpen} onOpenChange={setChooserOpen} />
    </>
  )
}

// First-time bottom sheet that auto-opens the first time the user switches to
// Stellar and isn't already connected. Persists a "seen" flag in localStorage
// so it never reappears once dismissed or used.
//
// It queues behind any other first-visit overlay (see lib/onboarding-overlays):
// on a first visit to Expert mode this used to slide in underneath the
// Easy/Expert explainer, so a newcomer had to clear two things before reaching
// the markets. Now the explainer goes first and this follows once it's gone —
// answering "what am I looking at" before "log in".
//
// `active` should be true when the surrounding page is currently on the
// Stellar network — the parent toggles it on/off as the user changes chains.
export function StellarFirstTimeSheet({ active }: { active: boolean }) {
  const stellar = useStellarWallet()
  const { login } = useLogin()
  const [open, setOpen] = useState(false)
  const releaseLane = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!active) return
    if (stellar.isConnected) return
    if (hasSeenStellarIntro()) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const openWhenClear = () => {
      // Re-read the seen flag on every wake-up. Dismissing releases the lane,
      // which notifies this very listener — without this check the sheet would
      // answer its own release by reopening, forever.
      if (cancelled || hasSeenStellarIntro() || isOnboardingOverlayOpen()) return
      // Let the previous overlay finish animating out before sliding in, so
      // the two never overlap on screen.
      timer = setTimeout(() => {
        if (cancelled || hasSeenStellarIntro() || isOnboardingOverlayOpen()) return
        releaseLane.current = acquireOnboardingOverlay()
        setOpen(true)
      }, 450)
    }

    const unsubscribe = subscribeOnboardingOverlay(openWhenClear)
    openWhenClear()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [active, stellar.isConnected])

  // Unmounting while open (chain switch, route change) must not block the lane.
  useEffect(() => () => releaseLane.current?.(), [])

  const dismiss = () => {
    try {
      window.localStorage.setItem(INTRO_SEEN_KEY, "1")
    } catch {}
    setOpen(false)
    releaseLane.current?.()
    releaseLane.current = null
  }

  // "Use my own Stellar wallet" is the wallet branch, so this one is
  // email/social only.
  const handleLogin = () => {
    dismiss()
    login(SOCIAL_LOGIN)
  }

  const handleConnectOwn = async () => {
    dismiss()
    const ok = await stellar.connect()
    if (!ok && stellar.error) toast.error(stellar.error)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) dismiss()
      }}
    >
      <SheetContent
        side="bottom"
        className="rounded-t-2xl border-t-0 sm:max-w-md sm:mx-auto sm:left-0 sm:right-0"
      >
        <div className="space-y-5 pt-2 pb-2">
          <div className="flex items-center justify-center">
            <div className="h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center">
              <Image
                src="/tokenimages/app/stellar.svg"
                alt="Stellar"
                width={32}
                height={32}
              />
            </div>
          </div>
          <div className="text-center space-y-2">
            <SheetTitle className="text-xl">Start earning on Stellar</SheetTitle>
            <SheetDescription className="text-sm leading-relaxed">
              Just log in with email or Google and we&rsquo;ll set up your Stellar
              wallet automatically. No browser extension needed. Already have your
              own Stellar wallet? You can connect that instead.
            </SheetDescription>
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={handleLogin}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              Log in to get started
            </button>
            <button
              type="button"
              onClick={handleConnectOwn}
              disabled={stellar.isLoading}
              className="w-full h-11 rounded-2xl border border-border/60 text-foreground/80 font-medium text-sm hover:bg-foreground/[0.04] transition-colors disabled:opacity-50"
            >
              {stellar.isLoading ? "Connecting…" : "Use my own Stellar wallet"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="w-full h-9 rounded-2xl text-muted-foreground font-medium text-sm hover:text-foreground transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
