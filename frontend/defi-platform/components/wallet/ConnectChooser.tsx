"use client"

/**
 * First-step connection chooser for the Expert / Stellar context.
 *
 * Privy's own modal covers email/social + EVM wallets but can NOT list Stellar
 * wallets (Tier-2 = embedded only). So when a not-logged-in user taps "Log in"
 * on a Stellar network, we show this chooser first and branch into the right
 * flow:
 *   - Email/social → Privy `login(SOCIAL_LOGIN)`: email + socials, no wallets
 *   - EVM wallet   → Privy `login(WALLET_LOGIN)`: opens on the wallet list
 *   - Stellar      → Stellar Wallets Kit (`stellarWallet.connect()`)
 *
 * The user already picked a branch here, so the Privy modal that follows only
 * shows that branch instead of asking the same question a second time.
 *
 * It renders above the sheets (z-80/81 in `SheetShell`) — a few surfaces open
 * it *from* a sheet (the deposit pool picker), and while it is open it is
 * always the frontmost thing on screen.
 *
 * Styling follows the house fintech motion language (see `SheetShell`): a light
 * blurred backdrop, a spring-in centered card with big radius, a brand mark, a
 * dominant primary CTA, and staggered option entrance — rather than the stock
 * shadcn dialog's hard overlay + zoom pop.
 */

import * as React from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import { motion, AnimatePresence, type Variants } from "framer-motion"
import { Mail, Wallet, ChevronRight, X } from "lucide-react"
import { useLogin } from "@privy-io/react-auth"
import { toast } from "sonner"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { SOCIAL_LOGIN, WALLET_LOGIN } from "@/config/privyLogin"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { cn } from "@/lib/utils"

// House motion — matches SheetShell so the chooser feels native to the app.
const SPRING = { type: "spring" as const, damping: 32, stiffness: 360, mass: 0.9 }
const EXIT = { duration: 0.2, ease: [0.32, 0, 0.67, 0] as const }

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null)
}

function WalletTile({
  icon,
  title,
  subtitle,
  onClick,
  variants,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  onClick: () => void
  variants?: Variants
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      variants={variants}
      whileTap={{ scale: 0.985 }}
      className={cn(
        "group flex items-center gap-3 w-full rounded-2xl px-4 py-3 text-left",
        "border border-border/50 bg-background/40",
        "hover:bg-background/70 hover:border-emerald-500/30",
        "transition-colors duration-200",
      )}
    >
      <div className="shrink-0 h-10 w-10 rounded-xl bg-muted/50 ring-1 ring-border/40 flex items-center justify-center text-foreground/70 group-hover:text-foreground transition-colors">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground/80 leading-snug mt-0.5 truncate">
          {subtitle}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-emerald-500/70 group-hover:translate-x-0.5 transition-all" />
    </motion.button>
  )
}

export function ConnectChooser({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { login } = useLogin()
  const stellar = useStellarWallet()
  const reduced = useReducedMotion()
  const panelRef = React.useRef<HTMLDivElement>(null)
  const prevFocusRef = React.useRef<HTMLElement | null>(null)

  const close = React.useCallback(() => onOpenChange(false), [onOpenChange])

  const handleSocial = () => {
    close()
    login(SOCIAL_LOGIN)
  }

  const handleBrowserWallet = () => {
    close()
    login(WALLET_LOGIN)
  }

  const handleStellar = async () => {
    close()
    const ok = await stellar.connect()
    if (!ok && stellar.error) toast.error(stellar.error)
  }

  // Body scroll lock while open.
  React.useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Focus trap + escape + restore focus — parity with SheetShell.
  React.useEffect(() => {
    if (!open) return
    prevFocusRef.current = (document.activeElement as HTMLElement) ?? null
    const frame = requestAnimationFrame(() => {
      const root = panelRef.current
      if (!root) return
      ;(getFocusable(root)[0] ?? root).focus()
    })

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        close()
        return
      }
      if (e.key !== "Tab") return
      const root = panelRef.current
      if (!root) return
      const f = getFocusable(root)
      if (f.length === 0) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("keydown", onKeyDown)
      prevFocusRef.current?.focus?.()
    }
  }, [open, close])

  if (typeof document === "undefined") return null

  const panelMotion = reduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: 0.12 } },
        exit: { opacity: 0, transition: { duration: 0.1 } },
      }
    : {
        initial: { opacity: 0, y: 14, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: 1, transition: SPRING },
        exit: { opacity: 0, y: 12, scale: 0.98, transition: EXIT },
      }

  // Staggered option entrance — disabled under reduced motion.
  const list: Variants = reduced
    ? {}
    : { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } } }
  const item: Variants = reduced
    ? {}
    : {
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
      }

  const node = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — airy blur instead of the stock hard black/80. */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
            className="fixed inset-0 z-[95] bg-black/40 backdrop-blur-sm"
            data-testid="connect-chooser-backdrop"
          />

          {/* Centered card. `inset-0 m-auto h-fit` centers on both axes without
              a CSS translate, so framer's y/scale transforms don't fight it
              (and AnimatePresence exit works — the panel is a direct child). */}
          <motion.div
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="connect-chooser-title"
            data-testid="connect-chooser"
            tabIndex={-1}
            {...panelMotion}
            className={cn(
              "fixed inset-0 z-[96] m-auto h-fit outline-none",
              "w-[calc(100%-2rem)] max-w-sm max-h-[calc(100vh-2rem)] overflow-y-auto",
              "rounded-[1.75rem] border border-border/50 bg-background",
              "shadow-2xl shadow-black/20 dark:shadow-black/50",
              "p-6",
            )}
          >
              {/* Close */}
              <button
                type="button"
                aria-label="Close"
                onClick={close}
                data-testid="connect-chooser-close"
                className="absolute right-4 top-4 w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors"
              >
                <X size={18} />
              </button>

              {/* Brand + heading */}
              <div className="flex flex-col items-center text-center pt-1 pb-5">
                <div className="relative h-14 w-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 ring-1 ring-emerald-500/20">
                  <div
                    aria-hidden
                    className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_30%_20%,theme(colors.emerald.500/0.25),transparent_70%)]"
                  />
                  <Image
                    src="/Peridot-Icon-Only-Mint-Green.svg"
                    alt="Peridot"
                    width={30}
                    height={30}
                    className="relative"
                  />
                </div>
                <h2
                  id="connect-chooser-title"
                  className="mt-4 text-lg font-bold tracking-tight text-foreground"
                >
                  Welcome to Peridot
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sign in to start earning — or connect your own wallet.
                </p>
              </div>

              <motion.div
                variants={list}
                initial={reduced ? undefined : "hidden"}
                animate={reduced ? undefined : "show"}
                className="flex flex-col gap-2.5"
              >
                {/* Primary path — visually dominant. */}
                <motion.button
                  type="button"
                  variants={item}
                  onClick={handleSocial}
                  whileTap={{ scale: 0.985 }}
                  data-testid="connect-chooser-privy"
                  className={cn(
                    "group flex items-center gap-3 w-full rounded-2xl px-4 py-3.5 text-left",
                    "bg-emerald-600 text-white shadow-sm shadow-emerald-500/25",
                    "hover:bg-emerald-500 transition-colors duration-200",
                  )}
                >
                  <div className="shrink-0 h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">Continue with email or social</p>
                    <p className="text-[11px] text-white/80 leading-snug mt-0.5">
                      We set up your wallet automatically — no extension needed
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-white/70 group-hover:translate-x-0.5 transition-transform" />
                </motion.button>

                {/* Divider */}
                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-border/60" />
                  <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/60">
                    or connect a wallet
                  </span>
                  <div className="h-px flex-1 bg-border/60" />
                </div>

                <WalletTile
                  variants={item}
                  icon={<Wallet className="h-5 w-5" />}
                  title="Browser wallet"
                  subtitle="MetaMask, Coinbase, Rabby, WalletConnect…"
                  onClick={handleBrowserWallet}
                />
                <WalletTile
                  variants={item}
                  icon={
                    <Image src="/tokenimages/app/stellar.svg" alt="Stellar" width={20} height={20} />
                  }
                  title="Stellar wallet"
                  subtitle="Freighter, xBull, Albedo, Lobstr"
                  onClick={handleStellar}
                />
              </motion.div>

              <p className="mt-5 text-center text-[11px] text-muted-foreground/70">
                Non-custodial · you stay in control of your funds
              </p>
            </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(node, document.body)
}
