"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, useMotionValue } from "framer-motion"
import { useEffect, useRef } from "react"
import { Home, PieChart, Clock, User } from "lucide-react"
import { cn } from "@/lib/utils"

export const TABS = [
  { label: "Home",      href: "/app",                icon: Home     },
  { label: "Portfolio", href: "/app/easy/portfolio", icon: PieChart },
  { label: "Activity",  href: "/app/easy/activity",  icon: Clock    },
  { label: "Profile",   href: "/app/easy/account",   icon: User     },
] as const

export function DevNav() {
  const pathname = usePathname()

  // Home is now `/app` (Easy view rendered in-place via the toggle). We must
  // match it exactly — `startsWith("/app")` would steal the active state
  // away from every deep Easy subroute (`/app/easy/portfolio` etc.).
  const activeIndex = TABS.findIndex((t) =>
    t.href === "/app" ? pathname === "/app" : pathname.startsWith(t.href)
  )

  // Dock-on-footer behaviour (mobile only).
  //
  // The bar is normally pinned to the bottom of its containing viewport. When
  // the page footer scrolls into view, we lift the bar by exactly the amount of
  // footer that has entered the viewport, so the bar docks onto the footer's
  // top edge instead of covering it.
  //
  // Two scroll sources exist:
  //   • `/app` — the window scrolls; viewport bottom = visualViewport.height
  //     (NOT innerHeight: on iOS Safari, innerHeight jumps when the URL bar
  //     collapses/expands mid-scroll, which is the source of the jitter).
  //   • `/app/easy/*` — EasyLayoutShell uses `fixed inset-0 + overflow-hidden`
  //     with an internal `[data-easy-scroll]` container. Window scroll never
  //     fires there; we measure against the container's own rect.bottom.
  //
  // Critically, both rects (container/footer) are read in the same layout
  // pass, so their delta stays jitter-free even while iOS shifts the layout
  // viewport around.
  const y = useMotionValue(0)
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    let raf = 0

    const measure = () => {
      raf = 0
      if (!mq.matches) {
        y.set(0)
        return
      }
      const footer = document.querySelector<HTMLElement>("footer[data-site-footer]")
      if (!footer) {
        y.set(0)
        return
      }
      const container = document.querySelector<HTMLElement>("[data-easy-scroll]")
      const viewportBottom = container
        ? container.getBoundingClientRect().bottom
        : (window.visualViewport?.height ?? window.innerHeight)
      const rawLift = Math.max(0, viewportBottom - footer.getBoundingClientRect().top)
      // Clamp so the nav can never lift off the top of the viewport. The
      // marketing footer is taller than a phone screen, so once it's fully
      // scrolled in, `footer.top` goes negative and the raw lift exceeds the
      // viewport height — translating the nav entirely off-screen and leaving
      // the user unable to switch tabs. Capping the lift at
      // `viewportBottom - navHeight` keeps the nav docked on the footer while
      // it fits, then parks it just below the top edge once it doesn't.
      const navHeight = navRef.current?.offsetHeight ?? 72
      const maxLift = Math.max(0, viewportBottom - navHeight)
      y.set(-Math.min(rawLift, maxLift))
    }

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }

    schedule()
    // Listen on whichever element actually scrolls. DevNav mounts inside the
    // same shell as `[data-easy-scroll]`, so the container is already in the
    // DOM here; a pathname change re-runs this effect and re-resolves it.
    const container = document.querySelector<HTMLElement>("[data-easy-scroll]")
    if (container) {
      container.addEventListener("scroll", schedule, { passive: true })
    } else {
      window.addEventListener("scroll", schedule, { passive: true })
    }
    window.addEventListener("resize", schedule)
    // visualViewport tracks the iOS URL bar; without this the bar wouldn't
    // re-measure when Safari grows/shrinks the visible area.
    window.visualViewport?.addEventListener("resize", schedule)
    window.visualViewport?.addEventListener("scroll", schedule)
    // Re-measure when the footer mounts (it's behind a dynamic import) or its
    // own height shifts (lazy children, email-subscription field hydrating).
    // Body is observed too because the footer node isn't there yet on first
    // run; measure() is idempotent so this can't fight the scroll handler.
    const ro = new ResizeObserver(schedule)
    ro.observe(document.body)

    return () => {
      container?.removeEventListener("scroll", schedule)
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      window.visualViewport?.removeEventListener("resize", schedule)
      window.visualViewport?.removeEventListener("scroll", schedule)
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [y, pathname])

  return (
    <motion.nav
      ref={navRef}
      data-testid="bottom-nav"
      style={{ y }}
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 will-change-transform",
        "md:hidden",
        "bg-background/90 backdrop-blur-md",
        "border-t border-foreground/[0.07]",
        "pb-[env(safe-area-inset-bottom,0px)]"
      )}
      aria-label="Main navigation"
    >
      <div className="grid grid-cols-4 h-[4.5rem] max-w-lg mx-auto">
        {TABS.map((tab, i) => {
          const isActive = i === activeIndex
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              data-testid={`nav-tab-${tab.label.toLowerCase()}`}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 pt-1 transition-colors duration-150",
                isActive
                  ? "text-emerald-500"
                  : "text-muted-foreground/50 hover:text-muted-foreground active:text-foreground/80"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute top-0 inset-x-0 mx-auto w-8 h-[2px] rounded-full bg-emerald-500"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}

              <motion.div
                animate={{ scale: isActive ? 1.1 : 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              >
                <Icon
                  className={cn(
                    "transition-all duration-150",
                    isActive ? "w-[22px] h-[22px]" : "w-5 h-5"
                  )}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
              </motion.div>

              <span className={cn(
                "text-[10px] font-semibold tracking-wide transition-all duration-150",
                isActive ? "opacity-100" : "opacity-60"
              )}>
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </motion.nav>
  )
}
