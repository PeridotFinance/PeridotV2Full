"use client"

import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { usePrivy } from "@privy-io/react-auth"
import { ShieldCheck, Palmtree, Sprout, Target, type LucideIcon } from "lucide-react"
import { FEATURE_FLAGS } from "@/config/featureFlags"

const OUT_CUBIC = [0.22, 0, 0.36, 1] as const

const STORAGE_KEY = "peridot.onboarding.v2.completedAt"
const GOAL_STORAGE_KEY = "peridot.onboarding.v2.goal"

// Session-sticky dismiss flag. Survives component remounts (balances refetch,
// Privy state changes, Fast Refresh, StrictMode double-invoke) without bouncing
// the Welcome back into view. Reset only when the JS context is reloaded.
let sessionDismissed = false

// Dev convenience: wipe the persisted flags on every page load so we don't
// have to clear localStorage by hand between login tests. Prod users keep the
// normal "show once, then never again" behavior.
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    window.localStorage.removeItem(GOAL_STORAGE_KEY)
  } catch { /* ignore */ }
}

function deriveFirstName(user: ReturnType<typeof usePrivy>["user"]): string | null {
  if (!user) return null
  const google = (user as { google?: { name?: string } }).google?.name
  if (google) return google.split(/\s+/)[0] ?? null
  const email = user.email?.address
  if (email) {
    const handle = email.split("@")[0] ?? ""
    const cleaned = handle.split(/[._\-+]/)[0]?.replace(/\d+/g, "") ?? ""
    if (cleaned.length >= 2 && /^[a-zA-Z]+$/.test(cleaned)) {
      return cleaned[0]!.toUpperCase() + cleaned.slice(1).toLowerCase()
    }
  }
  return null
}

export function hasCompletedFirstRunIntro(): boolean {
  if (typeof window === "undefined") return true
  try { return Boolean(window.localStorage.getItem(STORAGE_KEY)) } catch { return true }
}

const hasCompletedOnboarding = hasCompletedFirstRunIntro

function markOnboardingDone() {
  try { window.localStorage.setItem(STORAGE_KEY, new Date().toISOString()) } catch { /* ignore */ }
}

export interface SavedGoal {
  key: GoalKey
  label: string
  amount: number
  savedAt: string
}

export function getSavedGoal(): SavedGoal | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(GOAL_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SavedGoal
  } catch { return null }
}

function saveGoal(goal: SavedGoal) {
  try {
    window.localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(goal))
    window.dispatchEvent(new CustomEvent("peridot:goal-saved", { detail: goal }))
  } catch { /* ignore */ }
}

const isMainnet = () => (process.env.NEXT_PUBLIC_NETWORK_PRESET || "testnet") !== "testnet"

export function useFirstRunIntro({
  hasSupply,
  isBalancesLoading,
}: { hasSupply: boolean; isBalancesLoading: boolean }) {
  const { authenticated, ready } = usePrivy()
  const [dismissed, setDismissed] = useState(sessionDismissed)
  const [alreadyCompleted, setAlreadyCompleted] = useState(true)

  useEffect(() => { setAlreadyCompleted(hasCompletedOnboarding()) }, [])

  // Show intro as soon as we know the user is authenticated and hasn't
  // completed it before — don't wait for balances. The previous
  // `!isBalancesLoading` gate let the savings-skeleton flash for ~2s before
  // the overlay covered it. While balances are still loading we optimistically
  // assume "no supply" (new user = the case the intro is FOR); once load
  // resolves with hasSupply=true the overlay fades back out.
  const active =
    FEATURE_FLAGS.FIRST_RUN_INTRO_V2 &&
    isMainnet() &&
    ready &&
    authenticated &&
    (!hasSupply || isBalancesLoading) &&
    !alreadyCompleted &&
    !dismissed &&
    !sessionDismissed

  const dismiss = () => {
    sessionDismissed = true
    markOnboardingDone()
    setDismissed(true)
  }

  return { active, dismiss }
}

// ── Goal presets ──────────────────────────────────────────────────────────
// Chips set sensible default amounts but the slider always wins. Order matters
// for the layout (2×2 grid), put the most-likely picks first.

type GoalKey = "emergency" | "holiday" | "grow" | "custom"

interface GoalPreset {
  key: GoalKey
  label: string
  icon: LucideIcon
  amount: number
}

const GOAL_PRESETS: GoalPreset[] = [
  { key: "emergency", label: "Emergency fund", icon: ShieldCheck, amount: 3000 },
  { key: "holiday",   label: "Holiday",        icon: Palmtree,    amount: 1500 },
  { key: "grow",      label: "Just grow it",   icon: Sprout,      amount: 1000 },
  { key: "custom",    label: "Something else", icon: Target,      amount: 5000 },
]

const MIN_AMOUNT = 500
const MAX_AMOUNT = 50_000
const STEP = 100

function clampToStep(n: number) {
  const c = Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, n))
  return Math.round(c / STEP) * STEP
}

function formatEuro(n: number) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0,
  }).format(n)
}

interface Props {
  hasSupply: boolean
  isBalancesLoading: boolean
  /** Best APY surfaced from the market data — used in the live projection.
   *  Falls back to a neutral 8% if zero (loading / no markets yet). */
  bestApy?: number
}

type Step = "welcome" | "goal"

export function FirstRunIntro({ hasSupply, isBalancesLoading, bestApy }: Props) {
  const { user } = usePrivy()
  const { active, dismiss: dismissInternal } = useFirstRunIntro({ hasSupply, isBalancesLoading })
  const firstName = useMemo(() => deriveFirstName(user), [user])

  const [step, setStep] = useState<Step>("welcome")
  // null = no chip highlighted on first render — user must pick. Confirming
  // without a pick falls back to "grow" so the Save button never deadlocks.
  const [goalKey, setGoalKey] = useState<GoalKey | null>(null)
  const [amount, setAmount] = useState<number>(1000)

  const apyForProjection = bestApy && bestApy > 0 ? bestApy : 8
  const yearlyEarnings = amount * (apyForProjection / 100)

  const pickPreset = (preset: GoalPreset) => {
    setGoalKey(preset.key)
    setAmount(preset.amount)
  }

  const confirmGoal = () => {
    const effectiveKey: GoalKey = goalKey ?? "grow"
    const preset = GOAL_PRESETS.find(p => p.key === effectiveKey) ?? GOAL_PRESETS[2]!
    saveGoal({
      key: effectiveKey,
      label: preset.label,
      amount,
      savedAt: new Date().toISOString(),
    })
    dismissInternal()
  }

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="first-run-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.36, ease: OUT_CUBIC }}
          className="absolute inset-0 z-30 flex flex-col items-center text-center px-6 py-6 bg-card/95 backdrop-blur-sm rounded-[inherit] overflow-y-auto scrollbar-ghost"
          data-testid="first-run-overlay"
        >
      <p className="text-[10px] font-black tracking-[0.35em] uppercase text-muted-foreground/40 mb-5 shrink-0">
        Peridot
      </p>

      <AnimatePresence mode="wait">
        {step === "welcome" ? (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: OUT_CUBIC }}
            className="w-full flex flex-col items-center space-y-6"
            data-testid="first-run-welcome"
          >
            <div className="space-y-1">
              <h2 className="text-[2rem] font-black tracking-tight leading-[1.1]">
                {firstName ? `Welcome, ${firstName}.` : "Glad you're here."}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed pt-2">
                Your money starts earning from day one.
                <br />
                You stay in control — always.
              </p>
            </div>

            <div className="w-full max-w-xs space-y-3 pt-2">
              <button
                type="button"
                onClick={() => setStep("goal")}
                data-testid="first-run-continue"
                className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-[15px] font-bold transition-colors"
              >
                Let&apos;s go
              </button>
              <button
                type="button"
                onClick={dismissInternal}
                className="block mx-auto text-[12px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                Skip
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="goal"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: OUT_CUBIC }}
            className="w-full flex flex-col items-center space-y-4 pb-2"
            data-testid="first-run-goal"
          >
            <div className="space-y-1">
              <h2 className="text-[1.5rem] font-black tracking-tight leading-[1.15]">
                What&apos;s this money for?
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                Pick a goal — or skip and grow what you have.
              </p>
            </div>

            <div className="w-full max-w-xs grid grid-cols-2 gap-2">
              {GOAL_PRESETS.map((p) => {
                const selected = p.key === goalKey
                const Icon = p.icon
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => pickPreset(p)}
                    data-testid={`first-run-goal-chip-${p.key}`}
                    className={
                      "flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-[12px] font-semibold transition-all " +
                      (selected
                        ? "bg-emerald-600/15 border border-emerald-500/60 text-foreground"
                        : "bg-foreground/[0.04] border border-transparent text-muted-foreground hover:bg-foreground/[0.08]")
                    }
                  >
                    <Icon
                      className={selected ? "h-4 w-4 text-emerald-500" : "h-4 w-4 text-muted-foreground/70"}
                      strokeWidth={1.75}
                    />
                    <span>{p.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="w-full max-w-xs space-y-2 pt-1">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground/60">
                  Goal
                </span>
                <span className="text-xl font-black tabular-nums tracking-tight">
                  {formatEuro(amount)}
                </span>
              </div>
              <input
                type="range"
                min={MIN_AMOUNT}
                max={MAX_AMOUNT}
                step={STEP}
                value={amount}
                onChange={(e) => setAmount(clampToStep(Number(e.target.value)))}
                className="w-full h-1.5 rounded-full appearance-none bg-foreground/10 accent-emerald-500 cursor-pointer"
                aria-label="Goal amount"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground/50 font-mono">
                <span>{formatEuro(MIN_AMOUNT)}</span>
                <span>{formatEuro(MAX_AMOUNT)}</span>
              </div>
            </div>

            <div className="w-full max-w-xs rounded-2xl bg-emerald-500/[0.07] border border-emerald-500/15 px-4 py-3 text-left">
              <p className="text-[10px] uppercase tracking-wider text-emerald-600/80 font-bold">
                In 12 months
              </p>
              <p className="text-base font-black tabular-nums tracking-tight mt-0.5">
                ~ {formatEuro(amount + yearlyEarnings)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                +{formatEuro(yearlyEarnings)} at {apyForProjection.toFixed(2)}% per year
              </p>
            </div>

            <div className="w-full max-w-xs space-y-2 pt-1">
              <button
                type="button"
                onClick={confirmGoal}
                data-testid="first-run-save-goal"
                className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-[15px] font-bold transition-colors"
              >
                Save goal
              </button>
              <button
                type="button"
                onClick={dismissInternal}
                className="block mx-auto text-[12px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                Maybe later
              </button>
            </div>
          </motion.div>
        )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
