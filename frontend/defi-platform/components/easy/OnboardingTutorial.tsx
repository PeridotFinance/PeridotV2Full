"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowDownUp,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ShieldAlert,
  TrendingUp,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "peridot_onboarded_v1"

export function hasCompletedOnboarding(): boolean {
  return false // TODO: re-enable before production:
  // if (typeof window === "undefined") return false
  // return localStorage.getItem(STORAGE_KEY) === "true"
}

function markOnboardingComplete(): void {
  // TODO: re-enable before production:
  // localStorage.setItem(STORAGE_KEY, "true")
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnboardingTutorialProps {
  onComplete: () => void
}

// ─── Step transition variants ─────────────────────────────────────────────────

const EASE_SHARP = [0.32, 0.72, 0, 1] as const

const stepVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 48 : -48,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.32, ease: EASE_SHARP },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -48 : 48,
    opacity: 0,
    transition: { duration: 0.22, ease: EASE_SHARP },
  }),
}

const TOTAL_STEPS = 4

// ─── Root component ───────────────────────────────────────────────────────────

export function OnboardingTutorial({ onComplete }: OnboardingTutorialProps) {
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [disclaimerScrolled, setDisclaimerScrolled] = useState(false)
  const [checked1, setChecked1] = useState(false)
  const [checked2, setChecked2] = useState(false)

  // Mobile only — lock body scroll while overlay is open, restore on exit.
  //
  // iOS Safari ignores `overflow:hidden` on <body>/<html> and lets the page
  // scroll underneath fixed overlays.  The reliable fix is to switch <body> to
  // `position:fixed` (which freezes the layout) while capturing the current
  // scrollY so we can restore the exact position on close.
  useEffect(() => {
    if (window.innerWidth >= 768) return // desktop uses OnboardingCard in the card stack

    const scrollY = window.scrollY

    // Freeze body in place at the current scroll offset
    document.body.style.position = "fixed"
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = "0"
    document.body.style.right = "0"
    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"

    return () => {
      // Unfreeze before scrolling — order matters
      document.body.style.position = ""
      document.body.style.top = ""
      document.body.style.left = ""
      document.body.style.right = ""
      document.body.style.overflow = ""
      document.documentElement.style.overflow = ""

      // Restore exact pre-lock scroll position (suppress smooth-scroll during restore)
      document.documentElement.style.scrollBehavior = "auto"
      window.scrollTo(0, scrollY)
      requestAnimationFrame(() => {
        document.documentElement.style.scrollBehavior = ""
      })
    }
  }, [])

  const canProceed =
    step === 0 ||
    step === 1 ||
    (step === 2 && disclaimerScrolled) ||
    (step === 3 && checked1 && checked2)

  const goNext = () => {
    if (step === TOTAL_STEPS - 1) {
      markOnboardingComplete()
      onComplete()
      return
    }
    setDirection(1)
    setStep(s => s + 1)
  }

  const goBack = () => {
    if (step === 0) return
    setDirection(-1)
    setStep(s => s - 1)
  }

  const buttonLabel = () => {
    if (step === 3) return checked1 && checked2 ? "Get started →" : "Accept to continue"
    if (step === 2 && !disclaimerScrolled) return "Read to continue"
    return "Continue →"
  }

  // ── Inner panel — shared between mobile and desktop ─────────────────────────
  const panel = (
    <>
      {/* Header: back + progress */}
      <div
        className="flex items-center gap-3 px-5 pb-3 shrink-0"
        style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
      >
        <button
          onClick={goBack}
          aria-label="Back"
          className={cn(
            "w-9 h-9 rounded-full bg-foreground/5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors",
            step === 0 && "opacity-0 pointer-events-none"
          )}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex-1 flex items-center gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <motion.div
              key={i}
              animate={{
                width: i === step ? 28 : 6,
                opacity: i < step ? 0.4 : i === step ? 1 : 0.18,
                backgroundColor: i <= step ? "#10b981" : "#6b7280",
              }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="h-1.5 rounded-full"
            />
          ))}
        </div>

        <span className="text-[11px] font-bold text-muted-foreground/40 tabular-nums w-9 text-right">
          {step + 1}/{TOTAL_STEPS}
        </span>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-hidden relative min-h-0" style={{ overscrollBehavior: "none" } as React.CSSProperties}>
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={step}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="absolute inset-0 flex flex-col"
          >
            {step === 0 && <StepWelcome />}
            {step === 1 && <StepHowItWorks />}
            {step === 2 && (
              <StepDisclaimer
                hasScrolled={disclaimerScrolled}
                onScrolled={() => setDisclaimerScrolled(true)}
              />
            )}
            {step === 3 && (
              <StepAccept
                checked1={checked1}
                checked2={checked2}
                onCheck1={() => setChecked1(c => !c)}
                onCheck2={() => setChecked2(c => !c)}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* CTA */}
      <div
        className="px-5 pt-3 shrink-0"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <motion.div
          animate={{ opacity: canProceed ? 1 : 0.4, scale: canProceed ? 1 : 0.985 }}
          transition={{ duration: 0.2 }}
        >
          <Button
            onClick={goNext}
            disabled={!canProceed}
            className="w-full h-14 rounded-2xl font-bold text-base bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all disabled:pointer-events-none"
          >
            {buttonLabel()}
          </Button>
        </motion.div>
      </div>
    </>
  )

  // Mobile only — desktop is handled by OnboardingCard in EasyPage's card stack
  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%", transition: { duration: 0.28, ease: [0.32, 0.72, 0, 1] } }}
      transition={{ type: "spring", damping: 30, stiffness: 260 }}
      className="fixed inset-0 z-50 bg-background flex flex-col md:hidden overflow-hidden"
      style={{ overscrollBehavior: "none" } as React.CSSProperties}
    >
      {panel}
    </motion.div>
  )
}

// ─── Step 1 — Welcome ─────────────────────────────────────────────────────────

function StepWelcome() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-9">
      {/* Icon with breathing rings */}
      <div className="relative flex items-center justify-center">
        <motion.div
          animate={{ scale: [1, 1.18, 1], opacity: [0.12, 0.04, 0.12] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute w-40 h-40 rounded-full bg-emerald-500"
        />
        <motion.div
          animate={{ scale: [1, 1.22, 1], opacity: [0.08, 0.02, 0.08] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          className="absolute w-56 h-56 rounded-full bg-emerald-500"
        />
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: "backOut" }}
          className="relative w-24 h-24 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center"
        >
          <TrendingUp className="w-11 h-11 text-emerald-500" />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="space-y-3 max-w-xs"
      >
        <h1 className="text-[2.2rem] font-black tracking-tight leading-[1.1]">
          Your money,{" "}
          <span className="text-emerald-500">always earning.</span>
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Peridot automatically puts your crypto to work across multiple networks
          — earning you yield without any manual effort.
        </p>
      </motion.div>
    </div>
  )
}

// ─── Step 2 — How it works ────────────────────────────────────────────────────

const HOW_IT_WORKS = [
  {
    icon: ArrowDownUp,
    color: "text-sky-400",
    bg: "bg-sky-500/10 border-sky-500/15",
    title: "Deposit once",
    desc: "Send USDC, ETH, or other supported assets to your Peridot deposit address.",
  },
  {
    icon: Zap,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/15",
    title: "Auto-managed",
    desc: "Peridot finds the best lending rates across chains and rebalances automatically.",
  },
  {
    icon: TrendingUp,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/15",
    title: "Withdraw anytime",
    desc: "No lock-up periods. Take your funds and all accrued interest back whenever you want.",
  },
]

function StepHowItWorks() {
  return (
    <div className="flex-1 flex flex-col px-5 pt-4 pb-2">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-7 px-1"
      >
        <h1 className="text-[2rem] font-black tracking-tight leading-tight">How it works</h1>
        <p className="text-sm text-muted-foreground mt-1.5">Simple, automatic, transparent.</p>
      </motion.div>

      <div className="space-y-3">
        {HOW_IT_WORKS.map(({ icon: Icon, color, bg, title, desc }, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.11, duration: 0.36, ease: "easeOut" }}
            className={cn(
              "flex items-start gap-4 p-4 rounded-2xl border bg-foreground/[0.02]",
              "border-foreground/[0.07]"
            )}
          >
            <div className={cn("w-10 h-10 rounded-xl border flex items-center justify-center shrink-0", bg)}>
              <Icon className={cn("w-5 h-5", color)} />
            </div>
            <div className="pt-0.5">
              <div className="text-sm font-bold">{title}</div>
              <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// ─── Step 3 — Risk Disclaimer ─────────────────────────────────────────────────

const DISCLAIMER_SECTIONS = [
  {
    title: "Capital at Risk",
    body: "Supplying assets to Peridot involves significant financial risk. The value of your deposited assets may decrease, and you may lose part or all of your principal. Do not deposit more than you can afford to lose.",
  },
  {
    title: "Not Investment Advice",
    body: "Peridot does not provide investment, financial, legal, or tax advice. Nothing on this platform constitutes a recommendation to buy, sell, or hold any asset. You are solely responsible for your own investment decisions.",
  },
  {
    title: "Smart Contract Risk",
    body: "Peridot operates through smart contracts on public blockchains. Smart contracts may contain bugs, vulnerabilities, or be subject to exploits. While audited, no smart contract can be guaranteed entirely secure.",
  },
  {
    title: "Liquidity Risk",
    body: "Under certain market conditions, withdrawing your assets may be delayed or temporarily unavailable if lending pool utilization is high. Your assets may not be immediately accessible at all times.",
  },
  {
    title: "Regulatory Risk",
    body: "The regulatory environment for decentralized finance is rapidly evolving. Changes in laws or regulations in your jurisdiction may affect your ability to use Peridot or the value of your assets. You are responsible for compliance with applicable local laws.",
  },
  {
    title: "No Deposit Insurance",
    body: "Assets held via Peridot are not covered by any government deposit protection scheme (e.g. FDIC, FSCS, or EU Deposit Guarantee Schemes). In the event of a loss, there is no compensation mechanism.",
  },
  {
    title: "Past Performance",
    body: "Any APY rates shown are derived from historical data and do not guarantee future returns. Rates fluctuate at any time based on market supply, demand, and protocol parameters.",
  },
]

function StepDisclaimer({
  hasScrolled,
  onScrolled,
}: {
  hasScrolled: boolean
  onScrolled: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Stable ref so the mount-check effect doesn't depend on the inline fn identity.
  const onScrolledRef = useRef(onScrolled)
  useEffect(() => { onScrolledRef.current = onScrolled })

  // Auto-unlock if all disclaimer text fits on screen without scrolling.
  // Without this, users on large screens (or when font scaling is small) are
  // permanently stuck at "Read to continue" because the scroll event never fires.
  // Empty deps: we only need to check layout once on mount; the ref keeps onScrolled fresh.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (el.scrollHeight <= el.clientHeight + 44) {
      onScrolledRef.current()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 44) {
      onScrolled()
    }
  }

  return (
    <div className="flex-1 flex flex-col px-5 pt-4 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-4 px-1 flex items-start gap-3"
      >
        <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-4.5 h-4.5 text-amber-500" />
        </div>
        <div>
          <h1 className="text-[1.6rem] font-black tracking-tight leading-tight">Risk Disclosure</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Read carefully before proceeding.</p>
        </div>
      </motion.div>

      <div className="relative flex-1 min-h-0">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto space-y-5 pb-10 pr-0.5"
          style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" } as React.CSSProperties}
        >
          {DISCLAIMER_SECTIONS.map(({ title, body }) => (
            <div key={title} className="space-y-1.5">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">
                {title}
              </h3>
              <p className="text-[13px] text-foreground/65 leading-relaxed">{body}</p>
            </div>
          ))}
          {/* Bottom sentinel */}
          <div className="h-1" aria-hidden />
        </div>

        {/* Gradient + scroll hint */}
        <AnimatePresence>
          {!hasScrolled && (
            <motion.div
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none flex flex-col items-center justify-end pb-2 gap-0.5"
            >
              <motion.div
                animate={{ y: [0, 4, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              >
                <ChevronDown className="w-4 h-4 text-muted-foreground/50" />
              </motion.div>
              <span className="text-[10px] text-muted-foreground/40 font-medium tracking-wide">
                Scroll to read all
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Step 4 — Accept ──────────────────────────────────────────────────────────

function StepAccept({
  checked1,
  checked2,
  onCheck1,
  onCheck2,
}: {
  checked1: boolean
  checked2: boolean
  onCheck1: () => void
  onCheck2: () => void
}) {
  const bothChecked = checked1 && checked2

  return (
    <div className="flex-1 flex flex-col px-5 pt-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8 px-1"
      >
        <motion.div
          animate={{
            scale: bothChecked ? [1, 1.2, 1] : 1,
          }}
          transition={{ duration: 0.35, ease: "backOut" }}
          className="w-12 h-12 rounded-full bg-foreground/[0.04] flex items-center justify-center mb-5"
        >
          <CheckCircle2
            className={cn(
              "w-6 h-6 transition-colors duration-300",
              bothChecked ? "text-emerald-500" : "text-muted-foreground/30"
            )}
          />
        </motion.div>
        <h1 className="text-[2rem] font-black tracking-tight leading-tight">Almost there</h1>
        <p className="text-sm text-muted-foreground mt-1.5">Confirm the following to start earning.</p>
      </motion.div>

      <div className="space-y-3">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.3 }}
        >
          <CheckboxRow
            checked={checked1}
            onChange={onCheck1}
            label="I have read and understood the risk disclosure. I acknowledge my capital is at risk and past performance does not guarantee future results."
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.3 }}
        >
          <CheckboxRow
            checked={checked2}
            onChange={onCheck2}
            label="I accept the Terms of Service and confirm I am at least 18 years old and legally permitted to use this service in my jurisdiction."
          />
        </motion.div>
      </div>
    </div>
  )
}

// ─── Reusable checkbox row ────────────────────────────────────────────────────

function CheckboxRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn(
        "w-full flex items-start gap-3.5 p-4 rounded-2xl border text-left transition-all duration-200",
        checked
          ? "bg-emerald-500/[0.07] border-emerald-500/25"
          : "bg-foreground/[0.02] border-foreground/[0.08] hover:border-foreground/20 hover:bg-foreground/[0.04]"
      )}
    >
      <div
        className={cn(
          "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all duration-200",
          checked ? "bg-emerald-500 border-emerald-500" : "border-foreground/25 bg-transparent"
        )}
      >
        <AnimatePresence>
          {checked && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.14, ease: "backOut" }}
            >
              <Check className="w-3 h-3 text-white" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <span className="text-xs leading-relaxed text-foreground/65">{label}</span>
    </button>
  )
}

// ─── OnboardingCard — desktop card-stack variant ──────────────────────────────
// Renders inside EasyPage's existing card container (same size as EasyModeWelcomeCard).
// Mobile uses OnboardingTutorial (full-screen overlay) instead.

export function OnboardingCard({ onComplete }: OnboardingTutorialProps) {
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [disclaimerScrolled, setDisclaimerScrolled] = useState(false)
  const [checked1, setChecked1] = useState(false)
  const [checked2, setChecked2] = useState(false)

  const canProceed =
    step === 0 ||
    step === 1 ||
    (step === 2 && disclaimerScrolled) ||
    (step === 3 && checked1 && checked2)

  const goNext = () => {
    if (step === TOTAL_STEPS - 1) {
      markOnboardingComplete()
      onComplete()
      return
    }
    setDirection(1)
    setStep(s => s + 1)
  }

  const goBack = () => {
    if (step === 0) return
    setDirection(-1)
    setStep(s => s - 1)
  }

  const buttonLabel = () => {
    if (step === 3) return checked1 && checked2 ? "Get started →" : "Accept to continue"
    if (step === 2 && !disclaimerScrolled) return "Read to continue"
    return "Continue →"
  }

  return (
    <div className="w-full max-w-full md:max-w-md mx-auto relative z-10 px-3 sm:px-4 h-full">
      <div className="relative h-full rounded-[2rem] overflow-hidden bg-background border border-foreground/[0.09] shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3 shrink-0">
          <button
            onClick={goBack}
            aria-label="Back"
            className={cn(
              "w-9 h-9 rounded-full bg-foreground/5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors",
              step === 0 && "opacity-0 pointer-events-none"
            )}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex-1 flex items-center gap-1.5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <motion.div
                key={i}
                animate={{
                  width: i === step ? 28 : 6,
                  opacity: i < step ? 0.4 : i === step ? 1 : 0.18,
                  backgroundColor: i <= step ? "#10b981" : "#6b7280",
                }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="h-1.5 rounded-full"
              />
            ))}
          </div>

          <span className="text-[11px] font-bold text-muted-foreground/40 tabular-nums w-9 text-right">
            {step + 1}/{TOTAL_STEPS}
          </span>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-hidden relative min-h-0">
          <AnimatePresence initial={false} custom={direction} mode="wait">
            <motion.div
              key={step}
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="absolute inset-0 flex flex-col"
            >
              {step === 0 && <StepWelcome />}
              {step === 1 && <StepHowItWorks />}
              {step === 2 && (
                <StepDisclaimer
                  hasScrolled={disclaimerScrolled}
                  onScrolled={() => setDisclaimerScrolled(true)}
                />
              )}
              {step === 3 && (
                <StepAccept
                  checked1={checked1}
                  checked2={checked2}
                  onCheck1={() => setChecked1(c => !c)}
                  onCheck2={() => setChecked2(c => !c)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* CTA */}
        <div className="px-5 pt-3 pb-5 shrink-0">
          <motion.div
            animate={{ opacity: canProceed ? 1 : 0.4, scale: canProceed ? 1 : 0.985 }}
            transition={{ duration: 0.2 }}
          >
            <Button
              onClick={goNext}
              disabled={!canProceed}
              className="w-full h-14 rounded-2xl font-bold text-base bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all disabled:pointer-events-none"
            >
              {buttonLabel()}
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
