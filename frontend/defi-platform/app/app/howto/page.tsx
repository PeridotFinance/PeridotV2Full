"use client"

import { useMemo, useState, useEffect } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { useReducedMotion } from "@/lib/use-reduced-motion"
import { playHover, playClick, playAction, playSuccess, playOpen, playClose, playContemplate } from "@/lib/sound"

const LazyEarn = dynamic(() => import("./steps/EarnFlow"), { ssr: false })
const LazySupply = dynamic(() => import("./steps/SupplyFlow"), { ssr: false })
const LazyLend = dynamic(() => import("./steps/LendFlow"), { ssr: false })
const LazyPoints = dynamic(() => import("./steps/PointsFlow"), { ssr: false })


type FlowKey = "earn" | "supply" | "lend" | "points"

const flowOrder: FlowKey[] = ["earn", "supply", "lend", "points"]

const FlowTitle: Record<FlowKey, string> = {
  earn: "Earn",
  supply: "Supply",
  lend: "Lend",
  points: "Points",
}

const FlowIcon: Record<FlowKey, string> = {
  earn: "🎉",
  supply: "🌱",
  lend: "💫",
  points: "🏆",
}


export default function HowToPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { isLowPerfDevice } = useReducedMotion()

  const initialFlow = (searchParams.get("flow") as FlowKey) || null
  const initialStep = Math.max(1, Math.min(3, Number(searchParams.get("step") || 1)))

  const [activeFlow, setActiveFlow] = useState<FlowKey | null>(initialFlow)
  const [step, setStep] = useState<number>(initialStep)
  const [burstKey, setBurstKey] = useState(0)

  useEffect(() => {
    if (activeFlow) {
      const sp = new URLSearchParams(Array.from(searchParams.entries()))
      sp.set("flow", activeFlow)
      sp.set("step", String(step))
      router.replace(`/app/howto?${sp.toString()}`)
    }
  }, [activeFlow, step])

  useEffect(() => {
    if (activeFlow && step === 3) {
      playSuccess()
      setBurstKey((k) => k + 1)
    }
  }, [activeFlow, step])

  const closeOverlay = () => {
    setActiveFlow(null)
    const sp = new URLSearchParams(Array.from(searchParams.entries()))
    sp.delete("flow")
    sp.delete("step")
    router.replace(`/app/howto${sp.toString() ? `?${sp.toString()}` : ""}`)
    playClose()
  }

  const NeonBlobBackground = () => (
    <>
      <svg width="0" height="0">
        <defs>
          <filter id="goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
      {!isLowPerfDevice && (
        <div className="pointer-events-none absolute inset-0" style={{ filter: "url(#goo)" }}>
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: 140 + i * 20,
                height: 140 + i * 20,
                background:
                  i % 2 === 0
                    ? "radial-gradient( circle at 30% 30%, rgba(94,121,69,0.30), rgba(0,0,0,0) 60% )"
                    : "radial-gradient( circle at 70% 70%, rgba(238,241,236,0.28), rgba(0,0,0,0) 60% )",
                boxShadow: "0 0 60px rgba(94,121,69,0.25)",
              }}
              animate={{
                x: [0, (i % 2 ? -1 : 1) * (20 + i * 6), 0],
                y: [0, (i % 2 ? 1 : -1) * (25 + i * 5), 0],
              }}
              transition={{ duration: 12 + i * 2, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
            />
          ))}
        </div>
      )}
    </>
  )

  const ConfettiBurst = ({ burstKey }: { burstKey: number }) => {
    if (isLowPerfDevice) return null
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[...Array(18)].map((_, i) => (
          <motion.span
            key={`${burstKey}-${i}`}
            className="absolute block w-1.5 h-1.5 rounded-sm"
            style={{
              left: `${50 + (Math.random() * 30 - 15)}%`,
              top: `55%`,
              backgroundColor: ["#5e7945", "#95ab7f", "#cdd6ca", "#EEF1EC"][i % 4],
            }}
            initial={{ opacity: 1, y: 0, x: 0, rotate: 0 }}
            animate={{
              opacity: 0,
              y: -80 - Math.random() * 40,
              x: (i % 2 ? 1 : -1) * (20 + Math.random() * 40),
              rotate: 90 + Math.random() * 180,
            }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen">
      <section className="py-14 md:py-20 hero-gradient relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            className="absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full blur-3xl"
            style={{ background: "rgba(94,121,69,0.18)" }}
            animate={isLowPerfDevice ? undefined : { y: [0, -10, 0] }}
            transition={{ duration: 14, repeat: Infinity, repeatType: "reverse" }}
          />
          <motion.div
            className="absolute -bottom-24 -left-24 w-[420px] h-[420px] rounded-full blur-3xl"
            style={{ background: "rgba(238,241,236,0.35)" }}
            animate={isLowPerfDevice ? undefined : { y: [0, 10, 0] }}
            transition={{ duration: 16, repeat: Infinity, repeatType: "reverse" }}
          />
          <NeonBlobBackground />
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              How To use <span className="gradient-text">Peridot</span>
            </h1>
            <p className="text-base md:text-lg text-text/80">
              Tap a card. 3 tiny steps. You got this.
            </p>
          </div>
        </div>
      </section>

      <section className="py-10 relative">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
            {flowOrder.map((flow) => (
              <motion.button
                key={flow}
                onClick={() => {
                  setActiveFlow(flow)
                  setStep(1)
                  playContemplate()
                }}
                onMouseEnter={() => playHover()}
                whileHover={isLowPerfDevice ? undefined : { y: -4, scale: 1.02 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="relative bg-white/5 dark:bg-white/10 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-3xl p-6 text-left shadow-[0_0_0_0_rgba(0,0,0,0)] hover:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.45)]"
              >
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/10 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
                <div className="absolute -inset-px rounded-3xl pointer-events-none opacity-60" style={{ background: "linear-gradient( to right, rgba(94,121,69,0.45), rgba(238,241,236,0.6) )" }} />
                <div className="relative flex items-center gap-4">
                  <div className="text-3xl" aria-hidden>
                    {FlowIcon[flow]}
                  </div>
                  <div>
                    <h3 className="text-xl md:text-2xl font-bold">{FlowTitle[flow]}</h3>
                    <p className="text-text/70 text-sm">Tap to see 3 easy steps</p>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      <AnimatePresence>
        {activeFlow && (
          <motion.div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-background/70 backdrop-blur-md" onClick={closeOverlay} />
            <motion.div
              className="relative w-full max-w-xl bg-white/10 border border-white/15 rounded-3xl p-6 backdrop-blur-2xl shadow-[0_40px_120px_-20px_rgba(0,0,0,0.6)]"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
            >
              {!isLowPerfDevice && (
                <div className="pointer-events-none absolute -inset-px rounded-3xl opacity-70" style={{ background: "linear-gradient( 135deg, rgba(94,121,69,0.5), rgba(238,241,236,0.65) )" }} />
              )}
              <ConfettiBurst burstKey={burstKey} />
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="text-2xl" aria-hidden>{FlowIcon[activeFlow]}</div>
                  <h3 className="text-xl font-bold">{FlowTitle[activeFlow]}</h3>
                </div>
                <button onClick={closeOverlay} onMouseEnter={() => playHover()} aria-label="Close" className="text-text/70 hover:text-text">×</button>
              </div>

              <div className="flex items-center gap-2 mb-4">
                {[1,2,3].map((i) => (
                  <div key={i} className={`h-2 rounded-full transition-all ${i === step ? "bg-primary w-10" : "bg-white/20 w-6"}`} />
                ))}
              </div>

              <div className="min-h-[160px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${activeFlow}-${step}`}
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {activeFlow === "earn" && <LazyEarn step={step} />}
                    {activeFlow === "supply" && <LazySupply step={step} />}
                    {activeFlow === "lend" && <LazyLend step={step} />}
                    {activeFlow === "points" && <LazyPoints step={step} />}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <Button variant="ghost" onMouseEnter={() => playHover()} onClick={() => { playClick(); setStep((s) => Math.max(1, s - 1)) }} disabled={step === 1}>
                  Back
                </Button>
                {step < 3 ? (
                  <Button onMouseEnter={() => playHover()} onClick={() => { playAction(); setStep((s) => Math.min(3, s + 1)) }}>
                    Next
                  </Button>
                ) : (
                  <Button asChild className="bg-primary text-background hover:bg-primary/90" onMouseEnter={() => playHover()} onClick={() => playSuccess()}>
                    <Link href="/app">Try in App</Link>
                  </Button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}


