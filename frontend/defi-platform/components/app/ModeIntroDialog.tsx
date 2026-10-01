"use client"

import { useEffect, useRef, useState } from "react"
import { Leaf, CandlestickChart } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useDemoMode } from "@/context/demo-mode"
import { useViewMode, type ViewMode } from "@/context/view-mode"
import { acquireOnboardingOverlay } from "@/lib/onboarding-overlays"

// Shown once per browser. Bump the version to re-show after a major change
// to what the two modes mean.
const SEEN_KEY = "peridot.modeIntro.v1.seen"

function hasSeenModeIntro(): boolean {
  if (typeof window === "undefined") return true
  try {
    return Boolean(window.localStorage.getItem(SEEN_KEY))
  } catch {
    return true
  }
}

function markModeIntroSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, new Date().toISOString())
  } catch {
    /* ignore */
  }
}

/**
 * One-time explainer for the Easy/Expert toggle. New visitors have no way to
 * know what the header toggle does or what Expert hides, so this dialog names
 * both views once and then stays out of the way forever.
 */
// Marks the view the visitor is in. A wallet sign-in opens Expert by default,
// so "which one am I in" is no longer always the first card.
function CurrentBadge({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span
      data-testid="mode-intro-current"
      className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
    >
      You are here
    </span>
  )
}

function cardClass(active: boolean) {
  return `flex items-start gap-3 rounded-xl border p-3.5 ${
    active ? "border-primary/50 bg-primary/5" : "border-border/40 bg-muted/30"
  }`
}

export function ModeIntroDialog() {
  const [open, setOpen] = useState(false)
  const { mode } = useViewMode()
  const is = (m: ViewMode) => mode === m
  const { isDemoMode } = useDemoMode()
  // Held while the dialog is on screen so the Stellar login sheet waits its
  // turn instead of sliding in underneath this modal.
  const releaseLane = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (isDemoMode || hasSeenModeIntro()) return
    // Claim the lane the moment we know we'll show, not when we become
    // visible: during the 900 ms wait below the Stellar sheet would otherwise
    // see an empty lane and open into the gap.
    releaseLane.current = acquireOnboardingOverlay()
    // Small delay so the page paints first and the dialog reads as a hint,
    // not a gate.
    const t = setTimeout(() => setOpen(true), 900)
    return () => clearTimeout(t)
  }, [isDemoMode])

  // Unmounting while open (route change) must not leave the lane blocked.
  useEffect(() => () => releaseLane.current?.(), [])

  const dismiss = () => {
    markModeIntroSeen()
    setOpen(false)
    releaseLane.current?.()
    releaseLane.current = null
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : dismiss())}>
      <DialogContent data-testid="mode-intro-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>Two ways to use Peridot</DialogTitle>
          <DialogDescription>
            Pick the view that fits you. Switch anytime with the Easy / Expert
            toggle at the top of the page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div data-testid="mode-intro-easy" className={cardClass(is("easy"))}>
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
              <Leaf className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Easy
                <CurrentBadge show={is("easy")} />
              </p>
              <p className="text-sm text-muted-foreground leading-snug">
                The simple view. See your balance, deposit, and watch it grow,
                while everything else stays out of the way.
              </p>
            </div>
          </div>

          <div data-testid="mode-intro-expert" className={cardClass(is("expert"))}>
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <CandlestickChart className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Expert
                <CurrentBadge show={is("expert")} />
              </p>
              <p className="text-sm text-muted-foreground leading-snug">
                The full market view. Every asset with live rates and the tools
                to supply, borrow, and manage your positions in detail.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            data-testid="mode-intro-dismiss"
            onClick={dismiss}
            className="w-full"
          >
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
